# FastPath - Automação de Laudos Patológicos
## CLAUDE.md - Prompt Executivo & Guia de Implementação

---

## 1. VISÃO GERAL DO PROJETO

**FastPath** é um desktop app (Tauri) bilingue (PT-BR/EN) que permite médicos patologistas automatizar a digitação de laudos através de máscaras customizáveis com monetização por assinatura e marketplace.

### Características Principais
- **App Desktop** (Windows + Mac) com Tauri
- **Execução flexível**: clipboard, ou key-by-key stealth com fallback
- **Marketplace** de máscaras com ratings/reviews
- **Dois planos de assinatura**:
  - **Básico** (R$ 50/mês): máx 30 máscaras próprias, acesso read-only ao marketplace
  - **Creator** (R$ 50/mês): máscaras ilimitadas, publicação no marketplace
- **Trial gratuito de 15 dias** (automaticamente, sem cartão)
- **Histórico local** (não salva no Firebase, opcional futuramente)
- **Primeiro usuário**: Você (Guilherme) para testes

---

## 2. STACK TÉCNICO

### Frontend (Web Layer)
- **Framework**: React 18+ com TypeScript
- **Build/Dev**: Tauri CLI (handles Vite config)
- **UI**: Tailwind CSS + Shadcn/UI (ou similar leve)
- **State Management**: Zustand (simples, local-first)
- **HTTP Client**: TanStack Query (@tanstack/react-query) para Firebase sync

### Backend (Rust/Tauri)
- **Tauri 2.x** (latest)
- **Keyboard/Clipboard**: tauri::api (built-in)
- **Global Hotkeys**: tauri-plugin-global-shortcut
- **File I/O**: std::fs (para histórico local)
- **Serde** para serialization

### Cloud
- **Authentication**: Firebase Auth (Email/Senha + Google)
- **Database**: Firestore (documents)
- **Storage**: Firebase Storage (opcional, para imagens de máscaras)
- **Payments**: Stripe (integração no backend, pode ser Node/Express depois)

### Local Storage
- **Histórico de laudos**: IndexedDB (browser) ou Tauri folder `$APPDATA/fastpath/history/`
- **Configs locais**: Tauri `tauri::fs` + JSON

---

## 3. ARQUITETURA

### 3.1 Estrutura do Projeto Tauri

```
fastpath/
├── src-tauri/           # Rust backend
│   ├── src/
│   │   ├── main.rs      # Entry + setup
│   │   ├── commands.rs  # Commands (keyboard, clipboard, etc)
│   │   ├── hotkeys.rs   # Global hotkey handlers
│   │   └── history.rs   # Local history I/O
│   └── Cargo.toml
├── src/                 # React frontend
│   ├── App.tsx
│   ├── pages/
│   │   ├── AuthPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── BuilderPage.tsx
│   │   ├── MarketplacePage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── ExecutorPage.tsx
│   ├── components/
│   │   ├── MaskBuilder.tsx         # Drag-drop builder
│   │   ├── MaskPreview.tsx         # Live preview
│   │   ├── MaskExecutor.tsx        # Modal de execução
│   │   ├── GlobalHotkeys.tsx       # Listener
│   │   └── MarketplaceCard.tsx
│   ├── hooks/
│   │   ├── useFirebase.ts
│   │   ├── useMaskStore.ts         # Zustand
│   │   ├── useHistory.ts
│   │   └── useGlobalHotkeys.ts
│   ├── lib/
│   │   ├── firebase.ts
│   │   ├── types.ts                # TypeScript types
│   │   ├── constants.ts
│   │   └── maskExecutor.ts         # Core logic
│   └── styles/globals.css
└── package.json
```

### 3.2 Fluxo de Autenticação

```
1. App abre → verifica localStorage por token Firebase
2. Sem token → AuthPage (Email/Senha ou Google Sign-In)
3. Sign-up:
   - Firebase cria user + doc em /users/{uid}
   - Seta trial_plan = true, trial_expires = now + 15 days
   - Usuário logado, acesso ao Básico automaticamente
4. Após 15 dias:
   - Stripe checkout aparece em Settings
   - Pagamento → Firebase update plan = "creator" ou "basic"
5. Depois: login normal (token persiste)
```

### 3.3 Ciclo de Vida de uma Máscara

```
CRIAÇÃO (Plan = Creator ou Básico com <30):
  1. BuilderPage carrega
  2. User arrasta blocos (Variável + Seção Condicional)
  3. MaskPreview renderiza live ao lado
  4. Salva localmente (Zustand) + Firebase (/masks/{maskId})
  5. Só pra Creator: pode publicar

EXECUÇÃO:
  1. User clica em máscara (Dashboard ou Marketplace)
  2. MaskExecutor modal abre
  3. Mostra form com campos pra preencher (baseado em variáveis)
  4. User preenche + clica "Executar"
  5. Oferece: "Copiar" ou "Inserir"
     - Copiar → clipboard
     - Inserir → Rust command executa key-by-key ou clipboard (conforme settings)
  6. Histórico salvo localmente
```

---

## 4. MODELO DE DADOS

### 4.1 Firestore Schema

```firestore
users/{userId}
  ├── email: string
  ├── name: string
  ├── avatar_url?: string
  ├── plan: "trial" | "basic" | "creator"
  ├── trial_expires: timestamp | null
  ├── language: "pt-BR" | "en"
  ├── created_at: timestamp
  └── stripe_customer_id?: string

masks/{maskId}
  ├── creator_id: string
  ├── name: string
  ├── description: string
  ├── category: "gastro" | "gineco" | "hemato" | ... (user-defined)
  ├── blocks: Block[]  # { type, config, conditional? }
  ├── is_published: boolean
  ├── is_official: boolean (apenas máscaras de Guilherme)
  ├── created_at: timestamp
  ├── updated_at: timestamp
  ├── rating: { avg: number, count: int }
  ├── download_count: int
  └── variables: string[]  # nomes das variáveis usadas

reviews/{reviewId}
  ├── mask_id: string
  ├── user_id: string
  ├── rating: 1-5
  ├── comment: string
  ├── created_at: timestamp
  └── helpful_count: int

userLibrary/{userId}/{maskId}
  ├── added_at: timestamp
  ├── favorite: boolean
  └── category_tag: string (reorganização local do user)
```

### 4.2 Block Types

```typescript
// Bloco de Variável
interface VariableBlock {
  id: string;
  type: "variable";
  variable_name: string;  // espaços vão virar "_"
  field_type: "text" | "textarea" | "select" | "checkbox";
  default?: string;
  options?: string[];  // pra select
  required: boolean;
}

// Bloco de Seção Condicional
interface ConditionalBlock {
  id: string;
  type: "conditional";
  condition: {
    variable_name: string;
    operator: "equals" | "contains";  // por enquanto só isso
    value: string;
  };
  blocks: (VariableBlock | ConditionalBlock)[];  // nested
}

// Preview renderiza isso como texto interpolado
```

### 4.3 Histórico Local (JSON)

```json
{
  "laudo_history": [
    {
      "id": "uuid",
      "mask_id": "...",
      "generated_content": "conteúdo completo do laudo",
      "variables_used": { "variável1": "valor1", ... },
      "timestamp": "2026-06-30T10:30:00Z",
      "execution_method": "clipboard" | "key-by-key"
    }
  ]
}
```

---

## 5. FUNCIONALIDADES CORE

### 5.1 MVP (Phase 1)

#### ✅ Autenticação
- Firebase Email/Senha + Google Sign-In
- Trial automático de 15 dias
- Persistent token em localStorage

#### ✅ Builder de Máscaras
- Drag-drop de blocos (Variável + Condicional)
- Live preview panel ao lado
- Validação: espaços em nomes viram "_"
- Não pode publicar vazio

#### ✅ Execução
- Modal com form dinâmico (baseado em variáveis)
- Opção: Copiar ou Inserir
- Key-by-key vs clipboard (settings)
- Histórico local

#### ✅ Marketplace
- Search + categorias (gastro, gineco, hemato, ...)
- Recentes
- Rating 1-5 + comentários (sem precisar ter usado)
- "Adicionar à biblioteca"

#### ✅ Planos & Limites
- Básico: máx 30 máscaras
- Creator: ilimitado + publicação
- Stripe integration (básico, pós-checkout)

#### ✅ Settings
- Velocidade key-by-key (ms/char)
- Tipo de saída padrão (clipboard/key-by-key)
- Idioma (PT-BR/EN)
- Hotkeys customizáveis

#### ✅ Global Hotkeys
- Hotkey 1: Abre menu de máscaras
- Hotkey 2: Executa última máscara usada
- Ambos customizáveis em Settings

### 5.2 Phase 2 (Nice-to-have)
- Sincronização de histórico (cloud optional)
- Integração com Motion DASA (auto-fill especializado)
- Tabelas/Listas dinâmicas em máscaras
- Data picker em variáveis
- Exports (PDF, Word)
- Colaboração (máscaras compartilhadas ao vivo)

---

## 6. FLUXOS DE USUÁRIO (Happy Paths)

### 6.1 Primeiro Uso (Você)

```
1. App abre → AuthPage
2. Clica "Criar Conta" → Email/Senha
3. Firebase cria user + trial ativado
4. Redireciona para DashboardPage (vazio)
5. Vê botão "Criar Máscara"
6. Clica → BuilderPage
7. Arrasta 2-3 blocos (Variável + Condicional)
8. Live preview mostra resultado
9. Clica "Salvar Máscara"
10. Aparece em Dashboard
11. Clica nela → MaskExecutor modal
12. Preenche campos → "Copiar" ou "Inserir"
13. Conteúdo é inserido (no app anterior, campo focado, etc)
14. Histórico salvo localmente
```

### 6.2 Publicar no Marketplace (Plan = Creator)

```
1. BuilderPage → máscara criada
2. Botão "Publicar" ativado
3. Modal: nome, descrição, categoria, é_oficial?
4. Confirma → Firebase marca is_published = true
5. Aparece no Marketplace pra outros usuários
6. Usuários adicionam à biblioteca, deixam reviews
```

### 6.3 Usar Máscara do Marketplace

```
1. MarketplacePage → busca "biópsia"
2. Filtra por categoria "gastro"
3. Clica em máscara → card aberto
4. Vê rating, reviews, descrição
5. Clica "Adicionar à Biblioteca"
6. Máscara vai pra /userLibrary/{userId}
7. Aparece em Dashboard em sua categoria
8. Executa igual às próprias
```

### 6.4 Hotkey Global

```
1. User está em app externo (Word, Motion DASA, email)
2. Pressiona Ctrl+Shift+F1 (customizável)
3. Menu flutuante com últimas 5 máscaras usadas
4. Clica em uma → abre MaskExecutor
5. Preenche → Insere no campo anterior (foco mantido)
6. Menu fecha automaticamente
```

---

## 7. DETALHES DE IMPLEMENTAÇÃO

### 7.1 Execução Key-by-Key (Tauri Rust Side)

```rust
// src-tauri/src/commands.rs

use tauri::State;

#[tauri::command]
async fn insert_text_keybykey(text: String, delay_ms: u64) -> Result<(), String> {
    let delay = std::time::Duration::from_millis(delay_ms);
    
    for char in text.chars() {
        // Usar enigo crate para simular keypress
        simulate_key_press(char)?;
        std::thread::sleep(delay);
    }
    
    Ok(())
}

#[tauri::command]
async fn read_clipboard() -> Result<String, String> {
    // clipboard crate
    Ok(clipboard_content)
}

#[tauri::command]
async fn write_clipboard(text: String) -> Result<(), String> {
    // clipboard crate
    Ok(())
}

#[tauri::command]
async fn register_global_hotkey(hotkey: String) -> Result<(), String> {
    // tauri-plugin-global-shortcut
    Ok(())
}
```

### 7.2 MaskBuilder Component (React)

```typescript
// src/components/MaskBuilder.tsx

export interface MaskBlock {
  id: string;
  type: "variable" | "conditional";
  // config...
}

export const MaskBuilder: React.FC<{onSave}> = () => {
  const [blocks, setBlocks] = useState<MaskBlock[]>([]);
  
  // Drag-drop logic (react-dnd ou similar)
  const handleAddBlock = (type: "variable" | "conditional") => {
    // Cria novo bloco com ID único
  };
  
  const handleDeleteBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };
  
  const handleSaveMask = async (name: string, category: string) => {
    const mask: Mask = {
      id: uuid(),
      creator_id: user.uid,
      name,
      category,
      blocks,
      is_published: false,
      created_at: new Date(),
    };
    
    await saveMaskToFirestore(mask);
  };
  
  return (
    <div className="flex gap-4">
      {/* Left: Builder */}
      <div className="w-1/2">
        <BlockPalette onAddBlock={handleAddBlock} />
        <DroppableCanvas blocks={blocks} onDelete={handleDeleteBlock} />
      </div>
      
      {/* Right: Live Preview */}
      <div className="w-1/2">
        <MaskPreview blocks={blocks} />
      </div>
    </div>
  );
};
```

### 7.3 MaskExecutor Component (Modal)

```typescript
// src/components/MaskExecutor.tsx

export const MaskExecutor: React.FC<{mask: Mask, onClose}> = () => {
  const [variables, setVariables] = useState({});
  const [method, setMethod] = useState<"clipboard" | "insert">("clipboard");
  
  const handleExecute = async () => {
    // Interpola bloco com variáveis
    const content = interpolateMask(mask.blocks, variables);
    
    if (method === "clipboard") {
      await invoke("write_clipboard", { text: content });
    } else {
      // "insert" → key-by-key ou clipboard conforme settings
      const delayMs = userSettings.keyByKeyDelay;
      const useKeyByKey = userSettings.insertMethod === "key-by-key";
      
      if (useKeyByKey) {
        await invoke("insert_text_keybykey", { text: content, delay_ms: delayMs });
      } else {
        await invoke("write_clipboard", { text: content });
        // Simula Ctrl+V
        await invoke("simulate_paste");
      }
    }
    
    // Salva histórico
    await saveToHistory({ mask_id: mask.id, content, variables, timestamp: now() });
    onClose();
  };
  
  return (
    <Dialog>
      <h2>{mask.name}</h2>
      
      {/* Form dinâmico baseado em variáveis */}
      {mask.variables.map(varName => (
        <input
          key={varName}
          placeholder={varName}
          onChange={(e) => setVariables({...variables, [varName]: e.target.value})}
        />
      ))}
      
      <div>
        <button onClick={() => setMethod("clipboard")}>Copiar</button>
        <button onClick={() => setMethod("insert")}>Inserir</button>
      </div>
      
      <button onClick={handleExecute}>Executar</button>
    </Dialog>
  );
};
```

### 7.4 Validação & Cleanup

```typescript
// src/lib/maskExecutor.ts

export function normalizeMaskVariableName(name: string): string {
  return name.replace(/\s+/g, "_");
}

export function validateMask(mask: Mask): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!mask.name?.trim()) errors.push("Nome obrigatório");
  if (mask.blocks.length === 0) errors.push("Máscara vazia");
  if (mask.is_published && !mask.description?.trim()) {
    errors.push("Descrição obrigatória para publicar");
  }
  
  return { valid: errors.length === 0, errors };
}

export function interpolateMask(blocks: MaskBlock[], variables: Record<string, string>): string {
  let result = "";
  
  for (const block of blocks) {
    if (block.type === "variable") {
      result += variables[block.variable_name] || "";
    } else if (block.type === "conditional") {
      const condMet = evaluateCondition(block.condition, variables);
      if (condMet) {
        result += interpolateMask(block.blocks, variables);
      }
    }
  }
  
  return result;
}

function evaluateCondition(cond: Condition, variables: Record<string, string>): boolean {
  const value = variables[cond.variable_name] || "";
  
  if (cond.operator === "equals") {
    return value === cond.value;
  } else if (cond.operator === "contains") {
    return value.includes(cond.value);
  }
  
  return false;
}
```

---

## 8. PADRÕES DE CÓDIGO & CONVENÇÕES

### 8.1 Firebase
- Usar TanStack Query pra cache + sync automático
- Lazy-load dados do Marketplace (infinite scroll)
- Sempre validar input antes de escrever (client + server rules)

### 8.2 Tauri Commands
- Sempre usar `Result<T, String>` como return
- Prefixo de snake_case: `insert_text_keybykey`, `read_clipboard`
- Erros descritivos

### 8.3 React/TypeScript
- Componentes funcionais com hooks
- Custom hooks pra lógica isolada (`useFirebase`, `useMaskStore`)
- Zustand pra estado local (não precisa Context)
- Tailwind pra styles (evitar CSS-in-JS)

### 8.4 i18n (Bilingue)
```typescript
// src/lib/i18n.ts
const translations = {
  "pt-BR": { "button.save": "Salvar", ... },
  "en": { "button.save": "Save", ... }
};

export function t(key: string, lang: "pt-BR" | "en") {
  return translations[lang][key] || key;
}
```

### 8.5 Error Handling
- Catch Firebase errors → mostrar toast (sonner/react-hot-toast)
- Tauri command errors → log + user-friendly message
- Never swallow errors silenciosamente

---

## 9. CHECKLIST DE INÍCIO

### Phase 0: Setup
- [ ] Criar repo Git
- [ ] `cargo init` + `npm create tauri-app`
- [ ] Configurar Firebase project (Auth + Firestore rules)
- [ ] Criar .env pra Firebase config
- [ ] Instalar deps principais (TanStack Query, Zustand, Tailwind)

### Phase 1: Scaffolding
- [ ] AuthPage (sign-up/sign-in)
- [ ] DashboardPage (lista de máscaras)
- [ ] SettingsPage (básico)
- [ ] Firebase Auth integration

### Phase 2: Builder
- [ ] MaskBuilder component (drag-drop)
- [ ] MaskPreview (live rendering)
- [ ] Block types (Variable + Conditional)
- [ ] Save to Firestore

### Phase 3: Executor
- [ ] MaskExecutor modal
- [ ] Interpolation logic
- [ ] Clipboard commands (Rust)
- [ ] Key-by-key (Rust)

### Phase 4: Marketplace
- [ ] MarketplacePage
- [ ] Search + filters
- [ ] Reviews/ratings
- [ ] Add to library

### Phase 5: Polish
- [ ] Global hotkeys (Tauri)
- [ ] i18n (PT-BR/EN)
- [ ] Local history
- [ ] Settings refinement
- [ ] Error handling everywhere
- [ ] Testing

### Phase 6: Monetização
- [ ] Stripe integration
- [ ] Plan limits enforcement (30 masks básico)
- [ ] Trial expiration logic

---

## 10. CONSIDERAÇÕES IMPORTANTES

### 10.1 Segurança
- Firebase Firestore rules: read/write only próprios dados
- Stripe nunca roda client-side (depois backend)
- Hotkeys globais pedem permission ao usuário
- Disclaimer: "Este app monitora keyboard/clipboard pra execução" (pode incluir no onboarding)

### 10.2 Performance
- Marketplace: lazy-load com infinite scroll (não carregar tudo)
- MaskBuilder: blocks renderizados virtualmente se > 100
- Histórico local: limpar aged entries (opção em Settings)

### 10.3 Offline
- Máscaras salvas localmente via Zustand persistem
- Marketplace precisa internet
- Execução funciona 100% offline

### 10.4 Acessibilidade
- Keyboard navigation (Tab, Enter, Delete em builder)
- Alt text em imagens
- ARIA labels em componentes customizados
- Sem dependência de cores (contrast ≥ 4.5:1)

---

## 11. PRÓXIMOS PASSOS

1. **Clone/setup** do projeto Tauri
2. **Implement** Phase 0-1 primeiro (Auth + scaffold)
3. **Build** iterativo (Phase 2 → 3 → 4)
4. **Teste** você mesmo (primeira semana com cada feature)
5. **Refine** baseado em uso real
6. **Deploy** quando Phase 5 completo

---

## 12. REFERÊNCIAS RÁPIDAS

- **Tauri docs**: https://tauri.app
- **Firebase Firestore**: https://firebase.google.com/docs/firestore
- **React Query**: https://tanstack.com/query/latest
- **Zustand**: https://github.com/pmndrs/zustand
- **Tailwind**: https://tailwindcss.com

---

**Versão**: 1.0  
**Data**: 30 de Junho de 2026  
**Status**: Pronto para Claude Code  
**Criado por**: Conversation com Guilherme

