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
- ✅ Tipos de domínio compartilhados (`src/lib/types.ts`).
- ✅ i18n PT-BR/EN (`src/lib/i18n.ts`).
- ✅ Store Zustand persistido (máscaras, settings, histórico local).
- ✅ Shell React navegável: Dashboard, Builder (com live preview), Executor
  (form dinâmico + copiar/inserir), Settings e placeholder do Marketplace.
- ✅ Comandos Tauri (Rust): `write_clipboard`, `read_clipboard`,
  `insert_text_keybykey`, `simulate_paste` + capabilities.

## Ainda não implementado (próximas fases)

- Firebase Auth + sync de máscaras no Firestore
- Marketplace real (busca, reviews, ratings)
- Stripe / enforcement de planos no servidor
- Hotkeys globais (UI de registro)
- Drag-drop no builder (atualmente reordenação por botões)

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
