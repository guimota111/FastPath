// FastPath - Example masks (one per default area) seeded on first run.

import type { Mask, VariableBlock } from "./types";
import { templateToBlocks } from "./maskExecutor";
import { buildGastroMasks } from "./seedMasksGastro";

interface SeedDef {
  id: string;
  name: string;
  area: string;
  category: string;
  fields: Array<Pick<VariableBlock, "variable_name" | "field_type"> & { options?: string[] }>;
  template: string;
}

const SEEDS: SeedDef[] = [
  {
    id: "seed-gineco",
    name: "Citologia — Papanicolau",
    area: "Gineco",
    category: "Citologia",
    fields: [
      { variable_name: "Adequabilidade", field_type: "select", options: ["Satisfatória", "Insatisfatória"] },
      {
        variable_name: "Resultado",
        field_type: "select",
        options: [
          "Negativo para lesão intraepitelial",
          "ASC-US",
          "Lesão intraepitelial de baixo grau",
          "Lesão intraepitelial de alto grau",
        ],
      },
    ],
    template: "Amostra citológica {{Adequabilidade}} para avaliação. Resultado: {{Resultado}}.",
  },
  {
    id: "seed-hemato",
    name: "Biópsia de medula óssea",
    area: "Hemato",
    category: "Biópsia",
    fields: [
      { variable_name: "Celularidade", field_type: "select", options: ["Normocelular", "Hipocelular", "Hipercelular"] },
      {
        variable_name: "Diagnóstico",
        field_type: "select",
        options: ["Medula óssea sem alterações significativas", "Displasia mieloide", "Infiltração neoplásica"],
      },
    ],
    template: "Biópsia de medula óssea, celularidade {{Celularidade}}. {{Diagnóstico}}.",
  },
  {
    id: "seed-gastro",
    name: "Biópsia endoscópica",
    area: "Gastro",
    category: "Biópsia",
    fields: [
      { variable_name: "Sítio_anatômico", field_type: "text" },
      { variable_name: "Tamanho_do_fragmento", field_type: "text" },
      {
        variable_name: "Diagnóstico",
        field_type: "select",
        options: ["Gastrite crônica", "Esofagite", "Pólipo adenomatoso", "Adenocarcinoma"],
      },
    ],
    template:
      "Fragmento de mucosa de {{Sítio_anatômico}}, medindo {{Tamanho_do_fragmento}}. Achado histológico: {{Diagnóstico}}.",
  },
  {
    id: "seed-dermato",
    name: "Biópsia de pele",
    area: "Dermato",
    category: "Biópsia",
    fields: [
      { variable_name: "Sítio_anatômico", field_type: "text" },
      { variable_name: "Tamanho_do_fragmento", field_type: "text" },
      { variable_name: "Coloração", field_type: "text" },
      {
        variable_name: "Diagnóstico",
        field_type: "select",
        options: [
          "Processo inflamatório crônico",
          "Neoplasia benigna",
          "Neoplasia maligna",
          "Sem alterações significativas",
        ],
      },
    ],
    template:
      "Fragmento de {{Sítio_anatômico}}, medindo {{Tamanho_do_fragmento}}, de coloração {{Coloração}}. Achado histológico compatível com {{Diagnóstico}}.",
  },
  {
    id: "seed-masto",
    name: "Peça cirúrgica — Mastectomia",
    area: "Masto",
    category: "Peça cirúrgica",
    fields: [
      { variable_name: "Lateralidade", field_type: "select", options: ["Direita", "Esquerda", "Bilateral"] },
      { variable_name: "Peso_da_peça", field_type: "text" },
      { variable_name: "Margens_cirúrgicas", field_type: "select", options: ["Livres", "Comprometidas"] },
      { variable_name: "Tipo_histológico", field_type: "text" },
    ],
    template:
      "Peça de mastectomia {{Lateralidade}}, pesando {{Peso_da_peça}}. Margens cirúrgicas {{Margens_cirúrgicas}}. Tipo histológico: {{Tipo_histológico}}.",
  },
  {
    id: "seed-partes-moles",
    name: "Ressecção de tumor de partes moles",
    area: "Partes moles",
    category: "Peça cirúrgica",
    fields: [
      { variable_name: "Sítio_anatômico", field_type: "text" },
      { variable_name: "Tamanho_da_peça", field_type: "text" },
      { variable_name: "Margens_cirúrgicas", field_type: "select", options: ["Livres", "Comprometidas"] },
      { variable_name: "Diagnóstico", field_type: "text" },
    ],
    template:
      "Peça de ressecção de tumor de partes moles em {{Sítio_anatômico}}, medindo {{Tamanho_da_peça}}. Margens {{Margens_cirúrgicas}}. Diagnóstico: {{Diagnóstico}}.",
  },
  {
    id: "seed-uro",
    name: "Biópsia de próstata",
    area: "Uro",
    category: "Biópsia",
    fields: [
      { variable_name: "Fragmentos", field_type: "text" },
      { variable_name: "Escore_de_Gleason", field_type: "text" },
      {
        variable_name: "Diagnóstico",
        field_type: "select",
        options: ["Adenocarcinoma de próstata", "Hiperplasia prostática benigna", "Prostatite crônica"],
      },
    ],
    template:
      "{{Fragmentos}} de biópsia prostática. Escore de Gleason: {{Escore_de_Gleason}}. Diagnóstico: {{Diagnóstico}}.",
  },
  {
    id: "seed-neuro",
    name: "Congelação intraoperatória",
    area: "Neuro",
    category: "Congelação",
    fields: [
      { variable_name: "Sítio_anatômico", field_type: "text" },
      {
        variable_name: "Achado",
        field_type: "select",
        options: ["Compatível com neoplasia maligna", "Compatível com processo benigno", "Amostra insuficiente"],
      },
      { variable_name: "Tempo_de_exame", field_type: "text" },
    ],
    template:
      "Exame de congelação de {{Sítio_anatômico}}, realizado em {{Tempo_de_exame}}. Resultado: {{Achado}}.",
  },
];

export function buildSeedMasks(now = new Date().toISOString()): Mask[] {
  return [...buildExampleMasks(now), ...buildGastroMasks(now)];
}

/** One generic example per default area, to show the structure. */
function buildExampleMasks(now: string): Mask[] {
  return SEEDS.map((seed) => {
    const fields: VariableBlock[] = seed.fields.map((f, i) => ({
      id: `${seed.id}-f${i}`,
      type: "variable",
      variable_name: f.variable_name,
      field_type: f.field_type,
      options: f.options,
      required: false,
    }));
    return {
      id: seed.id,
      creator_id: "seed",
      name: seed.name,
      area: seed.area,
      category: seed.category,
      blocks: templateToBlocks(seed.template, fields),
      is_published: false,
      is_official: true,
      created_at: now,
      variables: fields.map((f) => f.variable_name),
    };
  });
}
