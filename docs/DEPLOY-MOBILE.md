# Deploy do App Mobile (Android)

Guia passo a passo para gerar e distribuir o APK do app de operador (`apps/mobile`).

- Stack: **Expo SDK 54** + **EAS** (Build e Update)
- Resultado esperado: **APK instalável** (perfil `preview`, distribuição interna)
- Documento validado em 05/08/2026
- **Fluxo novo (recomendado): build 1x + atualizações over-the-air (seção 6)**

---

## 1. Visão geral

O app mobile fica em `apps/mobile` e usa `eas.json` com três perfis:

| Perfil       | Uso                  | Saída        |
|--------------|----------------------|--------------|
| `development`| Desenvolvimento      | Dev client   |
| `preview`    | Testes internos      | **APK**      |
| `production` | Loja (Play Store)    | AAB          |

O fluxo que evita rebuildar a cada alteração:

1. **Gere o APK UMA vez** (na nuvem do EAS) e instale no celular. Esse APK embute o
   canal `preview` + credenciais de update — é a **única** espera longa.
2. **A partir daí, toda mudança de código JS/TS** (telas, lógica, API, login) é
   publicada com `eas update` (~1–2 min) — sem rebuild, sem reinstall.
3. **Só gera APK novo** quando houver mudança **nativa** (ver seção 6).

---

## 2. Teste rápido com Expo Go (sem APK)

No app, os dados vêm do Supabase; o `.env` de `apps/mobile` já aponta para **produção**,
então o Expo Go mostra o mesmo comportamento do APK, sem esperar build longo.

```powershell
cd apps\mobile
npx expo start            # mesma rede Wi-Fi
# ou, se o celular não estiver na mesma rede:
npx expo start --tunnel
```

Instale o app **Expo Go** no celular e escaneie o QR code do terminal.
Todos os módulos usados (câmera, localização, storage) funcionam no Expo Go.

---

## 3. Pré-requisitos (para gerar APK)

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

## 4. Build do APK (script `scripts/build-apk.ps1`)

Na raiz do projeto, defina o token e rode:

```powershell
$env:EXPO_TOKEN = "<seu-token-aqui>"
.\scripts\build-apk.ps1 -Cloud     # build na nuvem do EAS (recomendado)
.\scripts\build-apk.ps1            # fallback: build local via Docker
```

O que o script faz automaticamente:

- **Valida** `EXPO_TOKEN` (nunca grava o token em arquivo).
- **Resolve o eas-cli** sem precisar decorar hash do `_npx` (monorepo → cache npx → instala).
- **Roda o build** (`--profile preview --platform android`).
- **Pós-build**: lista o APK mais recente em `apps/mobile/dist/build` com data/hora,
  tamanho e instrução de instalação.

> O script sempre roda a partir de `apps/mobile` — nunca rode o `eas build` na raiz do
> monorepo (o eas gera `app.json`/`eas.json` no lugar errado).

---

## 5. Caminho A — EAS em nuvem (recomendado)

### 5.1. Valide o projeto

```powershell
cd apps\mobile
npx expo-doctor
```

Espere `18/18 checks passed. No issues detected!`.

> Se falhar com `resource drawable/splashscreen_logo not found`, garanta que
> `apps/mobile/app.json` tenha `icon` e `splash.image` apontando para um PNG em `assets/`.

### 5.2. Commit

```powershell
cd <raiz do projeto>
git add apps/mobile
git commit -m "fix(mobile): atualiza assets/ícone e dependências"
```

### 5.3. Dispare o build

```powershell
cd apps\mobile
$env:EXPO_TOKEN = "<seu-token>"
eas build --profile preview --platform android --non-interactive
```

- Usa keystore remoto do EAS (já cadastrado — o app atualiza sem desinstalar).
- O comando aguarda o streaming de logs. Se travar, o build **já foi criado** — acompanhe com:
  ```powershell
  eas build:list --platform android --limit 3 --json
  ```
- Status: `IN_QUEUE` → `IN_PROGRESS` → `FINISHED` | `ERRORED`.

### 5.4. Baixe e instale o APK

```powershell
eas build:view <BUILD_ID> --json   # pegue o "buildUrl"
curl.exe -sL "<buildUrl>" -o apps\mobile\dist\build\concluiai-operador-preview.apk
```

- Copie o APK para o aparelho (cabo, Drive, e-mail, etc.).
- No Android, permita "Instalar aplicativos de fontes desconhecidas" quando solicitado.
- Faça login com as credenciais do operador.

---

## 6. Atualizações over-the-air (EAS Update) — para TODAS as mudanças de código

### 6.1. Quando usar

Use `eas update` para **qualquer** mudança de código JS/TS:

- Telas e UI, lógica de negócio, chamadas de API, login, textos, layout, ranking, etc.

**NÃO** use (gera APK novo em vez de update):

- Nova dependência que exija módulo nativo (ex.: `expo-camera`, `expo-location`, libs `.aar`).
- Alteração em `app.json` (ícone, splash, `permissions`, plugins).
- Mudança na **versão** do app (`package.json`/`app.json` `version`).

> `runtimeVersion` usa policy `appVersion` no `app.json`: enquanto a versão não mudar,
> o `eas update` entrega o bundle ao APK instalado. Se a versão subir, é runtime novo
> → precisa novo APK.

### 6.2. Publicar em 1 comando (script `scripts/update-preview.ps1`)

```powershell
$env:EXPO_TOKEN = "<seu-token>"
.\scripts\update-preview.ps1 -Message "corrige cálculo de tarefas por setor"
```

O script:

- Valida `EXPO_TOKEN`, resolve o eas-cli e roda a partir de `apps/mobile`.
- Publica no canal `preview` com `eas update --channel preview --message ...`.

### 6.3. Comando manual (sem script)

```powershell
cd apps\mobile
$env:EXPO_TOKEN = "<seu-token>"
eas update --channel preview --message "descrição da mudança" --non-interactive
```

O app instalado baixa a atualização sozinho na próxima abertura.
Para testar: feche e reabra o app no celular.

---

## 7. Caminho B — Fallback: Docker local

Use quando a fila do EAS nuvem estiver demorada. Requer **Docker Desktop** funcionando.

### 7.1. Construa a imagem de build

```powershell
docker build -t concluiai-eas -f deploy\Dockerfile.eas-local .
```

> A imagem base `erayalakese/eas-like-local-builder:latest` tem **Node 18** e falha com
> `configs.toReversed is not a function`. O `Dockerfile.eas-local` faz upgrade p/ **Node 20**
> + SDK 36. O script `build-apk.ps1` constrói `concluiai-eas` automaticamente se não existir.

### 7.2. Rode o build local

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
- O primeiro build é pesado (baixa Gradle/deps); se estourar memória, aumente
  `org.gradle.jvmargs` em `apps/mobile/android/gradle.properties` (ex.: `-XX:MaxMetaspaceSize=1g`).

### 7.3. Limpeza

```powershell
docker rmi concluiai-eas:latest
# se reclamar de container em uso:
docker ps -a | Select-String "concluiai-eas"
docker rm -f <CONTAINER_ID>
docker rmi concluiai-eas:latest
```

---

## 8. Problemas comuns

| Sintoma | Causa | Solução |
|---------|-------|---------|
| `configs.toReversed is not a function` no build | Imagem base Node 18 | Usar imagem `concluiai-eas` (Node 20) — seção 7 |
| `java.lang.OutOfMemoryError: Metaspace` no build local | Gradle com pouca memória | Aumentar `org.gradle.jvmargs` em `apps/mobile/android/gradle.properties` |
| `EAS project not configured` | `eas build` rodado fora de `apps/mobile` | Rodar sempre a partir de `apps/mobile` |
| Build falha: `resource drawable/splashscreen_logo not found` | `splash` sem `image` no `app.json` | Adicionar `splash.image` + plugin `expo-splash-screen` |
| `expo doctor` acusa peer dep | Falta dependência nativa | `npx expo install <pacote>` |
| Build preso em `IN_QUEUE` por horas | Fila gratuita do EAS | Usar Caminho B (Docker local) |
| `eas whoami` falha / erro de auth | Token inválido ou não passado | Regenerar token em https://expo.dev/settings/access-tokens e passar `EXPO_TOKEN` |
| `eas build` trava sem saída | CLI aguardando streaming de logs | O build foi criado; acompanhar com `eas build:list` em outro terminal |
| Aviso `EBADENGINE` no npm | Node muito novo/antigo | Usar Node ≥ 20 |

---

## 9. Notas importantes

- **Keystore é gerenciado pelo EAS.** O mesmo keystore é reutilizado nos próximos builds
  → o app atualiza **sem precisar desinstalar**.
- **Para produção / Play Store**, use o perfil `production` (`eas build --profile
  production --platform android`), que gera AAB para envio à loja.
- Não commite `apps/mobile/android/` nem `apps/mobile/ios/` (já no `.gitignore`).
- O `EXPO_TOKEN` é segredo: não commite nem exponha.