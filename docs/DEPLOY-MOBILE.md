# Deploy do App Mobile (Android)

Guia passo a passo para gerar e distribuir o APK do app de operador (`apps/mobile`).

- Stack: **Expo SDK 54** + **EAS Build** (Expo Application Services)
- Resultado esperado: **APK instalável** (perfil `preview`, distribuição interna)
- Documento baseado no processo validado em 05/08/2026.

---

## 1. Visão geral

O app mobile fica em `apps/mobile` e usa `eas.json` com três perfis:

| Perfil       | Uso                  | Saída          |
|--------------|----------------------|----------------|
| `development`| Desenvolvimento      | Dev client     |
| `preview`    | Testes internos      | **APK**        |
| `production` | Loja (Play Store)    | AAB            |

Há dois caminhos para gerar o APK:

- **A. EAS em nuvem** — recomendado. Não precisa de Java/SDK local. A fila gratuita pode demorar.
- **B. Docker local** — fallback para quando a fila estiver demorada (build na sua máquina).

---

## 2. Pré-requisitos

- **Node.js ≥ 20** (o projeto exige `>=20`).
- **Conta Expo** com acesso ao projeto (owner: `emaildoissa`).
- **Token de acesso** (para builds não-interativos):
  1. Acesse https://expo.dev/settings/access-tokens
  2. Crie um token e guarde (ex.: variável de ambiente `EXPO_TOKEN`).
- **Working tree do git limpo** — o EAS usa o commit `HEAD`. Faça commit das mudanças antes de buildar.
- Config já existente (não precisa mexer se não mudou):
  - `apps/mobile/app.json` — `extra.eas.projectId`, `owner`, `updates.url`, `runtimeVersion`
  - `apps/mobile/eas.json` — perfis `preview`/`production` com as env de produção

---

## 3. Caminho A — EAS em nuvem (recomendado)

### 3.1. Garanta os assets de ícone/splash

O build falha com `resource drawable/splashscreen_logo not found` quando `app.json` tem `splash` sem `image`.

1. Crie a pasta e um ícone:
   ```powershell
   New-Item -ItemType Directory -Path "apps\mobile\assets" -Force
   # coloque um PNG 1024x1024 em apps/mobile/assets/icon.png
   ```
2. Confira `apps/mobile/app.json` (exemplo válido):

   ```json
   "icon": "./assets/icon.png",
   "splash": {
     "image": "./assets/icon.png",
     "resizeMode": "contain",
     "backgroundColor": "#0f172a"
   },
   "android": {
     "package": "com.concluiai.operador",
     "adaptiveIcon": {
       "backgroundColor": "#0f172a",
       "foregroundImage": "./assets/icon.png"
     },
     "permissions": ["CAMERA", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]
   },
   "plugins": [
     [
       "expo-splash-screen",
       { "backgroundColor": "#0f172a", "image": "./assets/icon.png", "imageWidth": 200 }
     ],
     ["expo-camera", { "cameraPermission": "Permita o uso da câmera para fotografar a evidência das tarefas." }],
     ["expo-location", { "locationWhenInUsePermission": "Permita o uso da localização para anexar o GPS à foto." }]
   ]
   ```

### 3.2. Instale dependências nativas exigidas

`@expo/vector-icons` exige `expo-font` (o `expo doctor` acusa peer dependency faltante).

```powershell
cd apps\mobile
npx expo install expo-font
```

### 3.3. Valide o projeto

```powershell
npx expo-doctor
```

Espere `18/18 checks passed. No issues detected!`.

### 3.4. Commit

```powershell
cd <raiz do projeto>
git add apps/mobile
git commit -m "fix(mobile): atualiza assets/ícone e dependências"
```

### 3.5. Dispare o build

```powershell
cd apps\mobile
$env:EXPO_TOKEN = "<seu-token>"
eas build --profile preview --platform android --non-interactive
```

> No Windows, o `eas` pode não estar no PATH. Use:
> ```powershell
> node "$env:LOCALAPPDATA\npm-cache\_npx\<hash>\node_modules\eas-cli\bin\run" build --profile preview --platform android --non-interactive
> ```
> O `<hash>` pode ser descoberto com `Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx"`.

O comando pode ficar aguardando o streaming dos logs. Se travar, o build **já foi criado** — abra outro terminal e acompanhe com o passo 3.6.

### 3.6. Acompanhe o status

```powershell
# lista os builds mais recentes
eas build:list --platform android --limit 3 --json

# detalhes de um build específico
eas build:view <BUILD_ID> --json
```

Status possíveis: `IN_QUEUE` → `IN_PROGRESS` → `FINISHED` | `ERRORED`.

> A fila gratuita pode levar de minutos a horas. Se demorar demais, use o Caminho B.

### 3.7. Baixe o APK

Quando o status for `FINISHED`, pegue o `buildUrl` no JSON:

```powershell
$out = "..\dist\build\concluiai-operador-preview.apk"
New-Item -ItemType Directory -Path "..\dist\build" -Force
curl.exe -sL "<buildUrl>" -o $out
```

Valide que é um ZIP/APK (assinatura `50 4B 03 04`):

```powershell
[System.IO.File]::ReadAllBytes("..\dist\build\concluiai-operador-preview.apk")[0..3]
```

### 3.8. Instale no celular

- Copie o APK para o aparelho (cabo, Drive, e-mail, etc.).
- No Android, permita "Instalar aplicativos de fontes desconhecidas" quando solicitado.
- Faça login com as credenciais do operador.

---

## 4. Caminho B — Fallback: Docker local

Use quando a fila do EAS nuvem estiver demorada. Requer **Docker Desktop** funcionando.

### 4.1. Construa a imagem de build

```powershell
docker build -t concluiai-eas -f deploy\Dockerfile.eas-local .
```

A imagem contém: JDK 17, Node 20, Android SDK (platform 36 / build-tools 36), NDK r26b, eas-cli, licenças aceitas.

### 4.2. Rode o build local

```powershell
docker run --rm --name eas-build `
  -v "C:\caminho\para\concluiai:/workspace" `
  -w /workspace/apps/mobile `
  -e EXPO_TOKEN="<seu-token>" `
  -e EAS_LOCAL_BUILD_ARTIFACTS_DIR=/workspace/apps/mobile/dist/build `
  -e EAS_LOCAL_BUILD_WORKINGDIR=/tmp/eas-work `
  concluiai-eas eas build --local --platform android --profile preview --non-interactive
```

- O APK sai em `apps/mobile/dist/build/`.
- O primeiro build é pesado (baixa Gradle/deps). Os seguintes usam cache.

### 4.3. Limpeza

```powershell
docker rmi concluiai-eas:latest
# se reclamar de container em uso:
docker ps -a | Select-String "concluiai-eas"
docker rm -f <CONTAINER_ID>
docker rmi concluiai-eas:latest
```

---

## 5. Problemas comuns

| Sintoma | Causa | Solução |
|---------|-------|---------|
| Build falha: `resource drawable/splashscreen_logo not found` | `splash` sem `image` no `app.json` | Adicionar `splash.image` + plugin `expo-splash-screen` (seção 3.1) |
| `expo doctor` acusa peer dep | Falta dependência nativa | `npx expo install <pacote>` |
| Build preso em `IN_QUEUE` por horas | Fila gratuita do EAS | Usar Caminho B (Docker local) |
| `eas whoami` falha / erro de auth | Token inválido ou não passado | Regenerar token em https://expo.dev/settings/access-tokens e passar `EXPO_TOKEN` |
| `eas build` trava sem saída | CLI aguardando streaming de logs | O build foi criado; acompanhar com `eas build:list` em outro terminal |
| Aviso `EBADENGINE` no npm | Node muito novo/antigo | Usar Node ≥ 20 |

---

## 6. Notas importantes

- **Keystore é gerenciado pelo EAS.** O mesmo keystore é reutilizado nos próximos builds → o app atualiza **sem precisar desinstalar**.
- Para **produção / Play Store**, use o perfil `production` (`eas build --profile production --platform android`), que gera AAB para envio à loja.
- Não commite `apps/mobile/android/` nem `apps/mobile/ios/` (já no `.gitignore`).
- O `EXPO_TOKEN` é segredo: não commite nem exponha.
