// FastPath - Minimal i18n (PT-BR / EN).

import type { Language } from "./types";

type Dict = Record<string, string>;

const translations: Record<Language, Dict> = {
  "pt-BR": {
    "app.name": "FastPath",
    "button.save": "Salvar",
    "button.cancel": "Cancelar",
    "button.copy": "Copiar",
    "button.insert": "Inserir",
    "button.execute": "Executar",
    "button.publish": "Publicar",
    "button.create_mask": "Criar Máscara",
    "auth.signin": "Entrar",
    "auth.signup": "Criar Conta",
    "auth.email": "E-mail",
    "auth.password": "Senha",
    "dashboard.title": "Minhas Máscaras",
    "dashboard.empty": "Nenhuma máscara ainda. Crie a primeira!",
    "builder.title": "Construtor de Máscaras",
    "builder.add_variable": "Adicionar Variável",
    "builder.add_conditional": "Adicionar Condicional",
    "builder.add_text": "Adicionar Texto",
    "builder.preview": "Pré-visualização",
    "marketplace.title": "Marketplace",
    "marketplace.search": "Buscar máscaras...",
    "marketplace.add_to_library": "Adicionar à Biblioteca",
    "settings.title": "Configurações",
    "settings.language": "Idioma",
    "settings.key_delay": "Velocidade (ms/caractere)",
    "settings.insert_method": "Método de inserção",
    "error.mask_limit": "Limite de máscaras atingido para seu plano",
    "error.required_fields": "Preencha os campos obrigatórios",
  },
  en: {
    "app.name": "FastPath",
    "button.save": "Save",
    "button.cancel": "Cancel",
    "button.copy": "Copy",
    "button.insert": "Insert",
    "button.execute": "Run",
    "button.publish": "Publish",
    "button.create_mask": "Create Mask",
    "auth.signin": "Sign In",
    "auth.signup": "Sign Up",
    "auth.email": "Email",
    "auth.password": "Password",
    "dashboard.title": "My Masks",
    "dashboard.empty": "No masks yet. Create your first one!",
    "builder.title": "Mask Builder",
    "builder.add_variable": "Add Variable",
    "builder.add_conditional": "Add Conditional",
    "builder.add_text": "Add Text",
    "builder.preview": "Preview",
    "marketplace.title": "Marketplace",
    "marketplace.search": "Search masks...",
    "marketplace.add_to_library": "Add to Library",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.key_delay": "Speed (ms/char)",
    "settings.insert_method": "Insert method",
    "error.mask_limit": "Mask limit reached for your plan",
    "error.required_fields": "Fill in the required fields",
  },
};

export function t(key: string, lang: Language): string {
  return translations[lang]?.[key] ?? translations["en"][key] ?? key;
}

export function availableLanguages(): Language[] {
  return ["pt-BR", "en"];
}
