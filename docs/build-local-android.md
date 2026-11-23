# Build local do Android (Windows)

Como gerar o AAB (Google Play) ou o APK de *release* na máquina de desenvolvimento, sem o EAS Build, assinado com o keystore que o EAS gerou. Verificado em Windows 11, com o build do `versionCode` 3 em 2026-11-23.

O diretório `android/` está no `.gitignore`: é gerado pelo `expo prebuild` e nunca é commitado. Tudo o que importa para o build mora, então, em `app.config.ts`, em `plugins/` e fora do repositório (segredos).

## Pré-requisitos

- Node e pnpm nas versões pinadas ([ADR-0007](adr/0007-toolchain-pinada.md)); se o `pnpm` não estiver no `PATH`: `npm i -g pnpm@12.17.0`.
- Android SDK com o **cmake 4.1.2** instalado (SDK Manager → SDK Tools → CMake).
- JDK: o JBR do Android Studio serve (`C:\Program Files\Android\Android Studio\jbr`).

## Assinatura com o keystore do EAS

O *template* do `prebuild` assina o `release` com a chave de debug. O plugin [`plugins/withLocalReleaseSigning.ts`](../plugins/withLocalReleaseSigning.ts) troca isso por um keystore de verdade, lido de propriedades do Gradle, para que **nenhum segredo entre no repositório nem no `android/`**.

1. Guarde o keystore (baixado com `eas credentials`) **fora do repositório**, por exemplo em `C:\Users\<usuario>\keys\porecatu-remote\keystore.jks`.
2. Em `~/.gradle/gradle.properties` (nível do usuário, nunca no projeto):

   ```properties
   PORECATU_KEYSTORE_FILE=C:/Users/<usuario>/keys/porecatu-remote/keystore.jks
   PORECATU_KEYSTORE_PASSWORD=...
   PORECATU_KEY_ALIAS=...
   PORECATU_KEY_PASSWORD=...
   ```

3. Confira o keystore (sem imprimir a senha). O `-J-Duser.language=en` evita um erro de formatação do `keytool` em locale `pt`:

   ```bash
   keytool -J-Duser.language=en -J-Duser.country=US -list -v -keystore <arquivo> -alias <alias>
   ```

   O SHA-256 do certificado tem de bater com o da chave de upload em **Integridade do app** no Play Console. O do keystore atual é `2C:C3:A3:8B:FD:D7:F1:60:B3:06:06:9E:B7:38:36:08:B1:39:E0:2D:E6:2C:F8:5C:07:F1:A9:5C:DB:61:EE:4A`.

O plugin é **opt-in** (`PORECATU_LOCAL_SIGNING=1` durante o `prebuild`): o EAS Build injeta a própria configuração de assinatura, e uma segunda `release` colidiria. O EAS nunca define a variável.

## Passo a passo

```bash
# 1. Suba o versionCode em app.config.ts (android.versionCode).
#    O Play recusa um código já usado; use sempre um maior que o último enviado.

# 2. Gere o android/. SEM a variável, o release sai assinado com a chave de debug.
PORECATU_LOCAL_SIGNING=1 pnpm exec expo prebuild --platform android --no-install

# 3. Recoloque o cmake (o prebuild apaga o android/local.properties):
echo "cmake.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk/cmake/4.1.2" > android/local.properties

# 4. Gere o AAB (Play) ...
cd android
CMAKE_POLICY_VERSION_MINIMUM=3.5 NODE_ENV=production ./gradlew.bat bundleRelease --no-daemon
#    ... ou o APK para instalar num aparelho:
#    pnpm exec expo run:android --variant release --device <serial> --no-bundler
```

Saída: `android/app/build/outputs/bundle/release/app-release.aab`. O primeiro build completo leva cerca de 35 minutos.

Antes de enviar, confirme que o AAB saiu com a chave certa (o SHA-256 tem de ser o do keystore, não o de debug):

```bash
keytool -J-Duser.language=en -J-Duser.country=US -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab
```

## Armadilhas

- **`prebuild` apaga o `android/local.properties`.** Sem o `cmake.dir`, o Gradle usa o cmake 3.22.1 (ninja), que falha em caminhos longos no `react-native-worklets`. A alternativa ao `cmake.dir` é mapear a pasta com `subst`; a escolha do projeto é o `cmake.dir`.
- **O cmake 4 exige `CMAKE_POLICY_VERSION_MINIMUM=3.5`** no ambiente, senão o *configure* de alguma dependência nativa falha.
- **Sem `PORECATU_LOCAL_SIGNING=1` no `prebuild`, o `build.gradle` não ganha o bloco de assinatura** (marcadores `porecatu-local-release-signing`) e o release é assinado com a chave de debug, sem erro nem aviso. Confira com `grep -c porecatu-local-release-signing android/app/build.gradle` (esperado: `4`).
- Faltando alguma das quatro propriedades `PORECATU_*` ou o arquivo do keystore, o `bundleRelease`/`assembleRelease` falha cedo, com mensagem legível; `debug` e `clean` continuam funcionando.
- **Nunca** commite o keystore, as senhas nem o `android/`.
- `adb`: para instalar o APK, o aparelho precisa ter autorizado a depuração USB.
