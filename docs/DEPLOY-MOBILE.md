# Deploy do App Mobile (Android)

Guia passo a passo para gerar e distribuir o APK do app de operador (`apps/mobile`).

- Stack: **Expo SDK 54** + **EAS Build** (Expo Application Services)
- Resultado esperado: **APK instalÃ¡vel** (perfil `preview`, distribuiÃ§Ã£o interna)
- Documento baseado no processo validado em 05/08/2026.

---

## 1. VisÃ£o geral

O app mobile fica em `apps/mobile` e usa `eas.json` com trÃªs perfis:

| Perfil       | Uso                  | SaÃ­da          |
|--------------|----------------------|----------------|
| `development`| Desenvolvimento      | Dev client     |
| `preview`    | Testes internos      | **APK**        |
| `production` | Loja (Play Store)    | AAB            |

HÃ¡ dois caminhos para gerar o APK:

- **A. EAS em nuvem** â€” recomendado. NÃ£o precisa de Java/SDK local. A fila gratuita pode demorar.
- **B. Docker local** â€” fallback para quando a fila estiver demorada (build na sua mÃ¡quina).

### Fluxo recomendado (Economia de tempo)

1. **Teste rÃ¡pido com Expo Go** (sem APK) â€” veja seÃ§Ã£o 2.
2. Se os testes no Expo Go passaram, **gere o APK novo** com o script da seÃ§Ã£o 3.
3. Instale o APK no celular e valide em produÃ§Ã£o.

> Nunca rode um build longo apenas para "ver se mudou algo". Valide no Expo Go primeiro
> â€” o `.env` de `apps/mobile` jÃ¡ aponta para produÃ§Ã£o, entÃ£o o Expo Go conversa com os
> mesmos dados reais e mostra o mesmo comportamento do APK.

---

## 2. Teste rÃ¡pido com Expo Go (sem APK)

No app, os dados vÃªm do Supabase; o `.env` de `apps/mobile` jÃ¡ aponta para **produÃ§Ã£o**,
entÃ£o o Expo Go mostra o mesmo comportamento do APK, sem esperar build longo.

```powershell
cd apps\mobile
npx expo start            # mesma rede Wi-Fi
# ou, se o celular nÃ£o estiver na mesma rede:
npx expo start --tunnel
```

Instale o app **Expo Go** no celular e escaneie o QR code do terminal.
Todos os mÃ³dulos usados (cÃ¢mera, localizaÃ§Ã£o, storage) funcionam no Expo Go.

> Use o Expo Go para validar mudanÃ§as de cÃ³digo/UI rÃ¡pidas. SÃ³ gere APK novo quando
> os testes no Expo Go passarem e vocÃª precisar do aplicativo avulso.

---

## 3. PrÃ©-requisitos (para gerar APK)

- **Node.js â‰¥ 20** (o projeto exige `>=20`).
- **Conta Expo** com acesso ao projeto (owner: `emaildoissa`).
- **Token de acesso** (para builds nÃ£o-interativos):
  1. Acesse https://expo.dev/settings/access-tokens
  2. Crie um token e guarde (ex.: variÃ¡vel de ambiente `EXPO_TOKEN`).
- **Working tree do git limpo** â€” o EAS usa o commit `HEAD`. FaÃ§a commit das mudanÃ§as antes de buildar.
- Build local: **Docker Desktop rodando** + imagem `erayalakese/eas-like-local-builder:latest`.
- Config jÃ¡ existente (nÃ£o precisa mexer se nÃ£o mudou):
  - `apps/mobile/app.json` â€” `extra.eas.projectId`, `owner`, `updates.url`, `runtimeVersion`
  - `apps/mobile/eas.json` â€” perfis `preview`/`production` com as env de produÃ§Ã£o

---

## 4. Build em 1 comando (script `scripts/build-apk.ps1`)

Na raiz do projeto, defina o token e rode:

```powershell
$env:EXPO_TOKEN = "<seu-token-aqui>"
.\scripts\build-apk.ps1            # build local via Docker (recomendado)
.\scripts\build-apk.ps1 -Cloud     # build na nuvem do EAS
```

O que o script faz automaticamente:

- **Valida** `EXPO_TOKEN` (nunca grava o token em arquivo).
- **Resolve o eas-cli** sem precisar decorar hash do `_npx` (procura no monorepo â†’ cache npx â†’ instala).
- **Roda o build** (`--local` via Docker por padrÃ£o, ou `--profile preview --platform android` na nuvem).
- **PÃ³s-build**: lista o APK mais recente em `apps/mobile/dist/build` com data/hora, tamanho e instruÃ§Ã£o de instalaÃ§Ã£o.

---

## 5. Caminho A â€” EAS em nuvem (recomendado)

### 5.1. Garanta os assets de Ã­cone/splash

O build falha com `resource drawable/splashscreen_logo not found` quando `app.json` tem `splash` sem `image`.

1. Crie a pasta e um Ã­cone:
   ```powershell
   New-Item -ItemType Directory -Path "apps\mobile\assets" -Force
   # coloque um PNG 1024x1024 em apps/mobile/assets/icon.png
   ```
2. Confira `apps/mobile/app.json` (exemplo vÃ¡lido):

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
     ["expo-camera", { "cameraPermission": "Permita o uso da cÃ¢mera para fotografar a evidÃªncia das tarefas." }],
     ["expo-location", { "locationWhenInUsePermission": "Permita o uso da localizaÃ§Ã£o para anexar o GPS Ã  foto." }]
   ]
   ```

### 5.2. Instale dependÃªncias nativas exigidas

`@expo/vector-icons` exige `expo-font` (o `expo doctor` acusa peer dependency faltante).

```powershell
cd apps\mobile
npx expo install expo-font
```

### 5.3. Valide o projeto

```powershell
npx expo-doctor
```

Espere `18/18 checks passed. No issues detected!`.

### 5.4. Commit

```powershell
cd <raiz do projeto>
git add apps/mobile
git commit -m "fix(mobile): atualiza assets/Ã­cone e dependÃªncias"
```

### 5.5. Dispare o build

```powershell
cd apps\mobile
$env:EXPO_TOKEN = "<seu-token>"
eas build --profile preview --platform android --non-interactive
```

> No Windows, o `eas` pode nÃ£o estar no PATH. Use:
> ```powershell
> node "$env:LOCALAPPDATA\npm-cache\_npx\<hash>\node_modules\eas-cli\bin\run" build --profile preview --platform android --non-interactive
> ```
> O `<hash>` pode ser descoberto com `Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx"`.

O comando pode ficar aguardando o streaming dos logs. Se travar, o build **jÃ¡ foi criado** â€” abra outro terminal e acompanhe com o passo 3.6.

### 5.6. Acompanhe o status

```powershell
# lista os builds mais recentes
eas build:list --platform android --limit 3 --json

# detalhes de um build especÃ­fico
eas build:view <BUILD_ID> --json
```

Status possÃ­veis: `IN_QUEUE` â†’ `IN_PROGRESS` â†’ `FINISHED` | `ERRORED`.

> A fila gratuita pode levar de minutos a horas. Se demorar demais, use o Caminho B.

### 5.7. Baixe o APK

Quando o status for `FINISHED`, pegue o `buildUrl` no JSON:

```powershell
$out = "..\dist\build\concluiai-operador-preview.apk"
New-Item -ItemType Directory -Path "..\dist\build" -Force
curl.exe -sL "<buildUrl>" -o $out
```

Valide que Ã© um ZIP/APK (assinatura `50 4B 03 04`):

```powershell
[System.IO.File]::ReadAllBytes("..\dist\build\concluiai-operador-preview.apk")[0..3]
```

### 5.8. Instale no celular

- Copie o APK para o aparelho (cabo, Drive, e-mail, etc.).
- No Android, permita "Instalar aplicativos de fontes desconhecidas" quando solicitado.
- FaÃ§a login com as credenciais do operador.

---

## 6. Caminho B â€” Fallback: Docker local

Use quando a fila do EAS nuvem estiver demorada. Requer **Docker Desktop** funcionando.

### 6.1. Construa a imagem de build

```powershell
docker build -t concluiai-eas -f deploy\Dockerfile.eas-local .
```

A imagem contÃ©m: JDK 17, Node 20, Android SDK (platform 36 / build-tools 36), NDK r26b, eas-cli, licenÃ§as aceitas.

### 6.2. Rode o build local

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
- O primeiro build Ã© pesado (baixa Gradle/deps). Os seguintes usam cache.

### 6.3. Limpeza

```powershell
docker rmi concluiai-eas:latest
# se reclamar de container em uso:
docker ps -a | Select-String "concluiai-eas"
docker rm -f <CONTAINER_ID>
docker rmi concluiai-eas:latest
```

---

## 7. Problemas comuns

| Sintoma | Causa | SoluÃ§Ã£o |
|---------|-------|---------|
| Build falha: `resource drawable/splashscreen_logo not found` | `splash` sem `image` no `app.json` | Adicionar `splash.image` + plugin `expo-splash-screen` (seÃ§Ã£o 3.1) |
| `expo doctor` acusa peer dep | Falta dependÃªncia nativa | `npx expo install <pacote>` |
| Build preso em `IN_QUEUE` por horas | Fila gratuita do EAS | Usar Caminho B (Docker local) |
| `eas whoami` falha / erro de auth | Token invÃ¡lido ou nÃ£o passado | Regenerar token em https://expo.dev/settings/access-tokens e passar `EXPO_TOKEN` |
| `eas build` trava sem saÃ­da | CLI aguardando streaming de logs | O build foi criado; acompanhar com `eas build:list` em outro terminal |
| Aviso `EBADENGINE` no npm | Node muito novo/antigo | Usar Node â‰¥ 20 |

---

## 8. Notas importantes

- **Keystore Ã© gerenciado pelo EAS.** O mesmo keystore Ã© reutilizado nos prÃ³ximos builds â†’ o app atualiza **sem precisar desinstalar**.
- Para **produÃ§Ã£o / Play Store**, use o perfil `production` (`eas build --profile production --platform android`), que gera AAB para envio Ã  loja.
- NÃ£o commite `apps/mobile/android/` nem `apps/mobile/ios/` (jÃ¡ no `.gitignore`).
- O `EXPO_TOKEN` Ã© segredo: nÃ£o commite nem exponha.
