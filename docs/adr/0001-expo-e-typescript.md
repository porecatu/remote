# ADR-0001 — Expo (React Native) com TypeScript estrito, Hermes e development build

**Status:** Aceito
**Data:** 2026-11-15
**Relacionados:** [ADR-0002](0002-render-da-grade-com-skia.md), [ADR-0004](0004-criptografia-em-js-puro.md), [ADR-0007](0007-toolchain-pinada.md), [PRD-000](../prd/prd-000-visao-de-produto.md)

## Contexto

O app precisa existir em **Android e iOS** e é mantido pelo mesmo dono do Porecatu, um projeto em Rust sem nenhuma base de código mobile. Dois apps nativos (Kotlin e Swift) dobrariam o trabalho de interface e exigiriam duas implementações do cliente do protocolo, além da referência em TypeScript que o [porecatu/protocol](https://github.com/porecatu/protocol) já mantém.

As necessidades técnicas são poucas mas concretas: WebSocket, câmera para ler QR, armazenamento seguro de chave, biometria, *deep link* (`porecatu://`), um teclado com controle fino, e uma superfície de desenho rápida para a grade do terminal.

O dono do produto decidiu: **Expo (React Native), TypeScript**.

## Decisão

**O app é um projeto Expo, em TypeScript com `strict`, rodando no motor Hermes, desenvolvido com *development build* (não Expo Go) e compilado por EAS Build.**

1. **Expo SDK pinado em versão exata** ([ADR-0007](0007-toolchain-pinada.md)); subir o SDK é tarefa própria, nunca efeito colateral.
2. **Development build** desde o primeiro dia: o render da grade usa `@shopify/react-native-skia` ([ADR-0002](0002-render-da-grade-com-skia.md)), que tem código nativo e não é garantido no Expo Go com a versão que pinarmos. O fluxo é o mesmo para quem desenvolve, e não esconde surpresa no build de loja.
3. **Módulos Expo para o que é do sistema**: `expo-camera` (leitura de QR), `expo-secure-store` ([ADR-0003](0003-chaves-no-armazenamento-seguro.md)), `expo-local-authentication` (bloqueio por biometria), `expo-linking` (*deep link*), `expo-haptics` (campainha), `expo-screen-capture` (cobrir a tela no seletor de apps e `FLAG_SECURE` no Android).
4. **Nenhum módulo nativo escrito por nós** ([ADR-0004](0004-criptografia-em-js-puro.md)). Se um dia for preciso, entra por ADR, como *Expo Module* local.
5. **TypeScript estrito**: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Os tipos das mensagens vêm do `@porecatu/protocol`; o app não declara tipo de mensagem por conta própria.
6. **Navegação** por `expo-router` (rotas por arquivo), que também resolve o *deep link* `porecatu://pair`.
7. **Estado**: um *store* por desktop conectado, fora da árvore de componentes ([arquitetura](../arquitetura.md) §2). A escolha da biblioteca (Zustand ou equivalente mínimo) fica para o M1, sem ADR, desde que respeite essa forma.

   > **Nota de implementação (2026-11-16):** a biblioteca é o `zustand` 5.1.0 na forma *vanilla* (`zustand/vanilla`, sem hook de React), um store por desktop aberto em `src/session/sessionStore.ts`, criado e descartado pelo registro de `src/session/registry.ts`. Além dos módulos do item 3, o `package.json` declara `expo-crypto` (aleatoriedade, [ADR-0004](0004-criptografia-em-js-puro.md)), `expo-localization` (idioma do sistema), `expo-clipboard`, `expo-device` e `expo-constants`. Sem telas, o código ainda só usa `expo-secure-store`, `expo-local-authentication`, `expo-crypto`, `expo-localization` e `expo-router`; câmera, captura de tela, vibração, área de transferência e modelo do aparelho entram com as telas.

## Alternativas consideradas

- **Nativo (Kotlin + Swift).** Melhor acesso a cada plataforma e o teclado mais controlável. Rejeitado: dois apps e duas implementações do protocolo, para um mantenedor.
- **Flutter.** Bom desempenho de desenho e um código só. Rejeitado pela decisão do dono do produto; e o protocolo de referência em TypeScript não seria aproveitado.
- **React Native sem Expo (bare).** Mais controle sobre o projeto nativo. Rejeitado: o Expo cobre todas as necessidades listadas com módulos mantidos, o EAS resolve assinatura e build de loja, e o *prebuild* continua disponível se um dia for preciso sair.
- **Expo Go em vez de development build.** Mais simples para começar. Rejeitado: não garante o Skia na versão pinada, e testar num ambiente diferente do de produção é o tipo de surpresa que o projeto evita.

## Consequências

### Positivas

- Um código para os dois sistemas, na mesma linguagem do pacote de referência do protocolo.
- Build, assinatura e envio às lojas pelo EAS, sem máquina macOS própria para o build de iOS.

### Negativas

- Dependência do ritmo de lançamentos do Expo (SDK novo a cada poucos meses, com versões de React Native acopladas).
- O controle do teclado virtual é mais limitado que no nativo; o [PRD-003](../prd/prd-003-terminal.md) contorna com um campo de captura e a barra de teclas especiais.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| SDK do Expo deixar de suportar uma versão de Android/iOS que os usuários têm | Média | Médio | Versões mínimas declaradas no roadmap; subir o SDK só com teste nos aparelhos de referência |
| Teclado virtual se comportar diferente entre fabricantes | Alta | Médio | Testes do M3 nos teclados mais comuns (Gboard, SwiftKey, Samsung, teclado do iOS) |
| EAS (serviço da Expo) indisponível ou mudar de preço | Baixa | Médio | Build local com `eas build --local` documentado como alternativa |
