# FastPath

Desktop app (Tauri) bilíngue (PT-BR/EN) para patologistas automatizarem a
digitação de laudos através de máscaras customizáveis.

> Esta é a fundação inicial do projeto. Veja `FASTPATH_CLAUDE.md` para a
> especificação executiva completa e o roadmap por fases.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **State**: Zustand (local-first, persistido)
- **Backend**: Tauri 2.x (Rust) — clipboard e inserção key-by-key via `enigo`
- **Cloud (fase futura)**: Firebase Auth + Firestore, Stripe

## O que já está implementado

- ✅ Motor de máscaras (`src/lib/maskExecutor.ts`): interpolação, blocos
  condicionais aninhados, validação, extração de variáveis, normalização de
  nomes e limites de plano — **com testes unitários** (`npm test`).
- ✅ **Firebase Auth**: e-mail/senha + Google Sign-In, trial automático de 15
  dias, perfil criado no Firestore (`/users/{uid}`) no primeiro login. App é
  bloqueado atrás do login; header mostra plano e dias de trial restantes.
- ✅ Regras de segurança do Firestore (`firestore.rules`): cada usuário só
  acessa os próprios dados; `plan` não pode ser alterado pelo cliente.
- ✅ Tipos de domínio compartilhados (`src/lib/types.ts`).
- ✅ i18n PT-BR/EN (`src/lib/i18n.ts`).
- ✅ Store Zustand persistido (máscaras, settings, histórico local).
- ✅ Shell React navegável: Auth, Dashboard, Builder (com live preview),
  Executor (form dinâmico + copiar/inserir), Settings e placeholder do
  Marketplace.
- ✅ Comandos Tauri (Rust): `write_clipboard`, `read_clipboard`,
  `insert_text_keybykey`, `simulate_paste` + capabilities.

## Ainda não implementado (próximas fases)

- Sync de máscaras no Firestore (atualmente local-first via Zustand)
- Marketplace real (busca, reviews, ratings)
- Stripe / enforcement de planos no servidor
- Hotkeys globais (UI de registro)
- Drag-drop no builder (atualmente reordenação por botões)

## Firebase

O projeto usa o Firebase project `fastpath-a7cd7`. As chaves web do Firebase são
públicas por design (a segurança vem das regras do Firestore + Auth) e são
lidas de `VITE_FIREBASE_*` em `.env`, com fallback embutido. Para ativar:

1. No console do Firebase, habilite **Authentication** → Email/Senha e Google.
2. Crie o banco **Firestore**.
3. Faça deploy das regras: `firebase deploy --only firestore:rules`.

## Desenvolvimento

```bash
npm install        # instala dependências do frontend
npm test           # roda os testes do motor de máscaras (vitest)
npm run typecheck  # checagem de tipos
npm run dev        # Vite dev server (web)
npm run tauri dev  # app desktop completo (requer toolchain Rust + libs do SO)
```

### Configuração

Copie `.env.example` para `.env` e preencha com as chaves do Firebase quando
a integração de cloud for ativada.

## Gerar o instalador (app desktop)

FastPath é um app **Tauri** — gera um executável nativo que o usuário instala no
computador (não é um web app). O `npm run dev` serve só pra testar a UI no
navegador; o produto real é gerado com:

```bash
npm run tauri build
```

O instalador sai em `src-tauri/target/release/bundle/`:

| Sistema | Saída |
|---------|-------|
| **Windows** | `bundle/msi/*.msi` e `bundle/nsis/*-setup.exe` |
| **macOS**   | `bundle/dmg/*.dmg` e `bundle/macos/*.app` |
| **Linux**   | `bundle/appimage/*.AppImage` e `bundle/deb/*.deb` |

> ⚠️ O Tauri só gera o instalador do **sistema em que você está rodando** (não
> faz cross-compile facilmente). Para o `.msi` do Windows, builde no Windows;
> para o `.dmg`, builde no Mac.

### Pré-requisitos por sistema

Todos precisam do **Rust** (instale via <https://rustup.rs>). Além disso:

- **Windows**: Microsoft C++ Build Tools (Visual Studio Build Tools) +
  WebView2 (já vem no Windows 10/11).
- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`,
  `libxdo-dev`, `build-essential`.

### Ícones

Os ícones do app estão em `src-tauri/icons/` (provisórios, letra "F" em azul).
Para trocar, substitua `src-tauri/app-icon.png` (1024×1024) e rode
`npm run tauri icon src-tauri/app-icon.png`.

> Nota sobre assinatura: instaladores sem assinatura digital mostram um aviso
> do SmartScreen (Windows) ou Gatekeeper (Mac). Para testes pessoais é normal;
> para distribuir publicamente, será preciso um certificado de code signing.
