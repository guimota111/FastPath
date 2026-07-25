// FastPath - Gastro masks ported from the GuilisAHK scripts (branch DASA).
//
// Translation notes (AHK -> FastPath):
// - AHK sends rich text (Send "^b" / "^i" toggles bold/italic). FastPath
//   delivers plain text, so formatting is dropped; line structure is kept
//   ("- " for the diagnosis header, ". " for body lines).
// - AHK checkboxes become FastPath `checkbox` fields: ticking inserts
//   `checked_text`, unticking inserts nothing. Where the checkbox stands for a
//   whole line or paragraph, `line_mode` supplies the break instead of the text
//   carrying an invisible "\n".
// - AHK dropdowns that were only read when a checkbox was ticked are merged
//   into a single select with an empty first option (e.g. "Agregado_linfoide").
// - The first option of a select is the value the panel preselects, matching
//   the AHK `ChooseN` default.

import type { LineMode, Mask, VariableBlock } from "./types";
import { templateToBlocks } from "./maskExecutor";

type SeedField = Pick<VariableBlock, "variable_name" | "field_type"> & {
  options?: string[];
  checked_text?: string;
  default_checked?: boolean;
  line_mode?: LineMode;
  measure_dims?: number;
  unit?: string;
  prefix?: string;
  suffix?: string;
  last_separator?: string;
};

/**
 * An AHK checkbox: inserts `text` when ticked, nothing otherwise. `mode` says
 * whether the text continues the current line, starts a new one, or opens a new
 * paragraph — the line break itself is never part of `text`.
 */
const check = (
  variable_name: string,
  text: string,
  { checked = false, mode = "inline" as LineMode } = {},
): SeedField => ({
  variable_name,
  field_type: "checkbox",
  checked_text: text,
  default_checked: checked,
  line_mode: mode,
});

interface GastroSeed {
  id: string;
  name: string;
  /** Sub-site inside Gastro, shown as the mask's category. */
  category: string;
  fields: SeedField[];
  template: string;
}

/**
 * Stomach mucosa location phrases, mirroring `MucosaCombinacoes()` in
 * GuilisAHK/scripts/utils.ahk. "corpo e antro" comes first because it was the
 * AHK default (`Choose6`) and FastPath preselects the first option.
 */
const MUCOSA = [
  "corpo e antro",
  "corpo",
  "fundo",
  "antro",
  "incisura",
  "transição corpo-antro",
  "fundo e antro",
  "corpo e incisura",
  "antro e incisura",
  "corpo e transição corpo-antro",
  "antro e transição corpo-antro",
  "incisura e transição corpo-antro",
  "corpo, antro e incisura",
  "corpo, antro e transição corpo-antro",
  "corpo, incisura e transição corpo-antro",
  "antro, incisura e transição corpo-antro",
  "corpo, antro, incisura e transição corpo-antro",
];

/** AHK had this as a checkbox, ticked by default, next to the H. pylori result. */
const giemsaField = () => check("Giemsa", " (Giemsa)", { checked: true });

const ATROFIA = ["ausente", "leve", "moderada", "acentuada"];
const HP_GRADUADA = [
  "negativa",
  "positiva (1+/3+)",
  "positiva (2+/3+)",
  "positiva (3+/3+)",
];

/** Metaplasia intestinal: presence + the three qualifiers that follow it. */
const MI_PRESENCA = [
  "ausente",
  "presente",
  "presente em corpo",
  "presente em antro",
  "presente em corpo e antro",
];
const MI_TIPO = ["", ", tipo completa", ", tipo incompleta", ", tipo completa e incompleta"];
const MI_GRAU = ["", ", leve", ", moderada", ", intensa"];
const MI_DISPLASIA = ["", ", sem displasia", ", com displasia"];

/** The four MI fields as used by the gastritis masks. */
const miFields = (displasia: string[] = MI_DISPLASIA): SeedField[] => [
  { variable_name: "Metaplasia_intestinal", field_type: "select", options: MI_PRESENCA },
  { variable_name: "MI_tipo", field_type: "select", options: MI_TIPO },
  { variable_name: "MI_grau", field_type: "select", options: MI_GRAU },
  { variable_name: "MI_displasia", field_type: "select", options: displasia },
];

const MI_TEMPLATE =
  "{{Metaplasia_intestinal}}{{MI_tipo}}{{MI_grau}}{{MI_displasia}}";

const HP_LINHA = "A pesquisa de Helicobacter pylori{{Giemsa}} resultou {{H_pylori}}.";

const hpFields = (hpOptions: string[] = HP_GRADUADA): SeedField[] => [
  giemsaField(),
  { variable_name: "H_pylori", field_type: "select", options: hpOptions },
];

const SEM_MALIGNIDADE = ". Ausência de evidências de malignidade nesta amostra.";

const SEEDS: GastroSeed[] = [
  // ----------------------------------------------------------------- Esôfago
  {
    id: "gastro-esofago-normal",
    name: "Esôfago normal",
    category: "Esôfago",
    fields: [],
    template:
      "- Mucosa esofágica sem particularidades histológicas.\n" +
      ". Ausência de eosinófilos e parasitas.\n" +
      SEM_MALIGNIDADE,
  },
  {
    id: "gastro-esofagite-cronica",
    name: "Esofagite crônica",
    category: "Esôfago",
    // Grade drives three separate slots in the AHK version (header, body
    // sentence, infiltrate adjective); keeping them in one option guarantees
    // the three always agree.
    fields: [
      {
        variable_name: "Grau",
        field_type: "select",
        options: [
          "discreta.\n. Mucosa esofágica exibindo hiperplasia basal e alongamento das papilas, acompanhadas de reação epitelial, sem atipias.\n. Infiltrado inflamatório mononuclear leve.",
          "moderada.\n. Mucosa esofágica exibindo hiperplasia basal e alongamento das papilas, acompanhadas de reação epitelial, com focos de aumento do volume nuclear e edema intercelular, sem atipias.\n. Infiltrado inflamatório mononuclear moderado.",
        ],
      },
    ],
    template:
      "- Esofagite crônica {{Grau}}\n" +
      ". Ausência de eosinófilos e parasitas.\n" +
      SEM_MALIGNIDADE,
  },
  {
    id: "gastro-esofagite-eosinofilica",
    name: "Esofagite eosinofílica",
    category: "Esôfago",
    fields: [
      { variable_name: "Contagem_de_eosinófilos_por_campo", field_type: "text" },
      check(
        "Incluir_nota",
        "Nota: Os achados morfológicos são compatíveis com esofagite eosinofílica. Recomenda-se correlação com demais dados clínicos e endoscópicos.",
        { checked: true, mode: "paragraph" },
      ),
    ],
    template:
      "- Esofagite crônica rica em eosinófilos.\n" +
      ". Epitélio escamoso apresentando infiltrado eosinofílico elevado, exibindo degranulação, sem formação de coleções.\n" +
      ". A pesquisa de parasitas resultou negativa.\n" +
      ". Contagem de eosinófilos em campo de maior aumento, em cada amostra: {{Contagem_de_eosinófilos_por_campo}}.\n" +
      ". Ausência de sinais de malignidade nesta amostra.{{Incluir_nota}}",
  },
  {
    id: "gastro-esofago-acantose",
    name: "Acantose glicogênica",
    category: "Esôfago",
    fields: [],
    template:
      "- Mucosa esofágica exibindo epitélio escamoso acantótico, com maturação celular ordenada, sem atipias.\n" +
      ". Em células das camadas intermediária e superficial, observa-se citoplasma claro e espumoso - ver nota.\n" +
      ". Ausência de sinais de malignidade nesta amostra.\n\n" +
      "Nota: os achados histológicos sugerem Acantose glicogênica. Recomenda-se correlação com demais dados clínicos e endoscópicos.",
  },
  {
    id: "gastro-esofago-ectopia",
    name: "Ectopia gástrica (heterotopia)",
    category: "Esôfago",
    fields: [],
    template:
      "- Heterotopia de mucosa gástrica em esôfago.\n" +
      ". Mucosa gástrica heterotópica em esôfago composto por glândulas fúndicas, recobertas por epitélio foveolar, sem atipia.\n" +
      ". Na lâmina própria, leve edema e infiltrado mononuclear leve.\n" +
      SEM_MALIGNIDADE,
  },
  {
    id: "gastro-esofago-papiloma",
    name: "Papiloma escamoso",
    category: "Esôfago",
    fields: [],
    template:
      "- Papiloma escamoso.\n" +
      ". Lesão formada por epitélio escamoso hiperplástico, recobrindo papilas delgadas e ramificadas.\n" +
      ". Revestimento epitelial aparece reativo, mas com maturação celular preservada e organização regular, sem atipia nuclear.\n" +
      SEM_MALIGNIDADE,
  },
  {
    id: "gastro-esofago-polipo-inflamatorio",
    name: "Pólipo inflamatório/sentinela",
    category: "Esôfago",
    fields: [],
    template:
      "- Pólipo inflamatório/sentinela.\n" +
      ". Mucosa gástrica apresentando conformação polipoide, hiperplasia foveolar e glândulas revestidas por epitélio colunar com intensas alterações reativas.\n" +
      ". Na lâmina própria, há acentuação do infiltrado inflamatório misto, edema e proliferação de vasos. Há focos de erosão com formação de tecido de granulação.\n" +
      ". A pesquisa de parasitas resultou negativa.\n" +
      ". A pesquisa de Helicobacter pylori resultou negativa.\n\n" +
      "Nota: Mucosa com intensas alterações reativas. Recomenda-se nova amostragem após tratamento.",
  },
  {
    id: "gastro-esofago-teg-sem-metaplasia",
    name: "TEG sem metaplasia",
    category: "Esôfago",
    fields: [],
    template:
      "- Esofagite crônica discreta.\n" +
      ". Mucosa do tipo gástrico com hiperplasia foveolar e processo inflamatório crônico discreto (ver nota).\n" +
      ". Ausência de evidências de malignidade nesta amostra.\n\n" +
      "Nota: Ausência de metaplasia intestinal na presente amostra. Os achados podem corresponder a reepitelização colunar do esôfago distal. Recomenda-se correlação com demais dados clínicos e endoscópicos.",
  },

  // ---------------------------------------------------------------- Estômago
  {
    id: "gastro-mucosa-gastrica-normal",
    name: "Mucosa gástrica normal",
    category: "Estômago",
    fields: [
      { variable_name: "Localização", field_type: "select", options: MUCOSA },
      ...hpFields(["negativa", "positiva (+/3+)", "positiva (2+/3+)", "positiva (3+/3+)"]),
    ],
    template:
      "- Mucosa sem particularidades histológicas.\n" +
      ". Mucosa de {{Localização}} com revestimento habitual, mantendo organização regular e maturação preservada.\n" +
      ". Atrofia: ausente.\n" +
      ". Metaplasia intestinal: ausente.\n" +
      `. ${HP_LINHA}\n` +
      SEM_MALIGNIDADE,
  },
  {
    id: "gastro-gastrite-inativa",
    name: "Gastrite crônica inativa",
    category: "Estômago",
    fields: [
      {
        variable_name: "Intensidade",
        field_type: "select",
        options: ["leve", "moderada", "intensa"],
      },
      { variable_name: "Localização", field_type: "select", options: MUCOSA },
      // AHK derived this from Intensidade (leve/moderado/acentuado); FastPath
      // has no computed fields, so it is a second explicit choice.
      {
        variable_name: "Infiltrado",
        field_type: "select",
        options: ["leve", "moderado", "acentuado"],
      },
      {
        variable_name: "Agregado_linfoide",
        field_type: "select",
        options: ["", ", com agregado linfoide", ", com agregados linfoides"],
      },
      { variable_name: "Atrofia", field_type: "select", options: ATROFIA },
      ...miFields(),
      ...hpFields(["negativa", "positiva (+/3+)", "positiva (2+/3+)", "positiva (3+/3+)"]),
    ],
    template:
      "- Gastrite crônica {{Intensidade}} e inativa.\n" +
      ". Mucosa de {{Localização}} com revestimento habitual, mantendo organização regular e maturação preservada.\n" +
      ". Lâmina própria exibindo {{Infiltrado}} infiltrado mononuclear{{Agregado_linfoide}}, sem atividade neutrofílica.\n" +
      ". Atrofia: {{Atrofia}}.\n" +
      `. Metaplasia intestinal: ${MI_TEMPLATE}.\n` +
      `. ${HP_LINHA}\n` +
      SEM_MALIGNIDADE,
  },
  {
    id: "gastro-gastrite-ativa",
    name: "Gastrite crônica ativa",
    category: "Estômago",
    fields: [
      {
        variable_name: "Intensidade",
        field_type: "select",
        options: ["leve", "moderada", "intensa"],
      },
      { variable_name: "Localização", field_type: "select", options: MUCOSA },
      {
        variable_name: "Infiltrado",
        field_type: "select",
        options: ["leve", "moderado", "acentuado"],
      },
      {
        variable_name: "Distribuição",
        field_type: "select",
        options: [
          "difuso pela mucosa",
          "distribuído preferencialmente na porção superior da mucosa",
        ],
      },
      {
        variable_name: "Reação_epitelial",
        field_type: "select",
        options: ["discreta", "leve", "moderada", "intensa"],
      },
      {
        variable_name: "Agregado_linfoide",
        field_type: "select",
        options: [
          "",
          " e agregado linfoide",
          " e agregados linfoides",
          " e folículo linfoide",
          " e folículos linfoides",
        ],
      },
      { variable_name: "Atrofia", field_type: "select", options: ATROFIA },
      ...miFields(),
      ...hpFields(),
    ],
    template:
      "- Gastrite crônica {{Intensidade}}, em atividade.\n" +
      ". Mucosa de {{Localização}} exibindo infiltrado inflamatório misto {{Infiltrado}}, {{Distribuição}}, associado a {{Reação_epitelial}} reação epitelial{{Agregado_linfoide}}.\n" +
      ". Atrofia: {{Atrofia}}.\n" +
      `. Metaplasia intestinal: ${MI_TEMPLATE}.\n` +
      `. ${HP_LINHA}\n` +
      SEM_MALIGNIDADE,
  },
  {
    id: "gastro-gastrite-erosiva",
    name: "Gastrite erosiva",
    category: "Estômago",
    fields: [
      {
        variable_name: "Intensidade",
        field_type: "select",
        options: ["leve", "moderada", "intensa"],
      },
      {
        variable_name: "Alterações_epiteliais",
        field_type: "select",
        options: ["reativas", "regenerativas", "reativas/regenerativas"],
      },
      {
        variable_name: "Atrofia",
        field_type: "select",
        options: ["ausente", "leve", "moderada", "intensa"],
      },
      ...miFields([
        "",
        ", sem displasia",
        ", com displasia de baixo grau",
        ", com displasia de alto grau",
      ]),
      ...hpFields(),
      check(
        "Nota_sobre_alterações_epiteliais_intensas",
        "Nota: Mucosa com intensas alterações epiteliais de aspectos reativo e regenerativo. Recomenda-se, a critério clínico, nova amostragem após tratamento.",
        { mode: "paragraph" },
      ),
    ],
    template:
      "- Gastrite erosiva {{Intensidade}} em atividade.\n" +
      ". Revestimento epitelial apresenta focos de erosão e alterações {{Alterações_epiteliais}}.\n" +
      ". Mucosa apresentando infiltrado inflamatório misto acompanhado de infiltrado neutrofílico intraepitelial.\n" +
      ". Atrofia: {{Atrofia}}.\n" +
      `. Metaplasia intestinal: ${MI_TEMPLATE}.\n` +
      `. ${HP_LINHA}\n` +
      ". Ausência de evidências de malignidade nesta amostra.{{Nota_sobre_alterações_epiteliais_intensas}}",
  },
  {
    id: "gastro-gastropatia-reativa",
    name: "Gastropatia reativa",
    category: "Estômago",
    fields: [
      { variable_name: "Localização", field_type: "select", options: MUCOSA },
      { variable_name: "Atrofia", field_type: "select", options: ATROFIA },
      { variable_name: "Metaplasia_intestinal", field_type: "select", options: ATROFIA },
      {
        variable_name: "H_pylori_Giemsa",
        field_type: "select",
        options: [
          "A pesquisa de Helicobacter pylori (Giemsa) resultou negativa.",
          "A pesquisa de Helicobacter pylori (Giemsa) resultou positiva.",
          "A pesquisa de Helicobacter pylori (Giemsa) não foi realizada.",
        ],
      },
      check(
        "Nota_sugestivo_de_lesão_química",
        "Nota: os achados morfológicos são sugestivos de lesão química. Recomenda-se correlação com demais dados clínicos.",
        { checked: true, mode: "line" },
      ),
    ],
    template:
      "- Gastropatia reativa.\n" +
      ". Mucosa de {{Localização}} exibindo alterações reativas evidenciadas pela hiperplasia foveolar com transformação viliforme, depleção de mucina e basofilia citoplásmica.\n" +
      ". Atrofia: {{Atrofia}}.\n" +
      ". Metaplasia intestinal: {{Metaplasia_intestinal}}.\n" +
      ". {{H_pylori_Giemsa}}\n" +
      ". Ausência de evidências de malignidade nesta amostra.{{Nota_sugestivo_de_lesão_química}}",
  },
  {
    id: "gastro-alteracoes-reativas-discretas",
    name: "Alterações reativas discretas",
    category: "Estômago",
    fields: [
      { variable_name: "Localização", field_type: "select", options: MUCOSA },
      { variable_name: "Atrofia", field_type: "select", options: ATROFIA },
      { variable_name: "Metaplasia_intestinal", field_type: "select", options: ATROFIA },
      {
        variable_name: "H_pylori_Giemsa",
        field_type: "select",
        options: [
          "A pesquisa de Helicobacter pylori (Giemsa) resultou negativa.",
          "A pesquisa de Helicobacter pylori (Giemsa) resultou positiva.",
          "A pesquisa de Helicobacter pylori (Giemsa) não foi realizada.",
        ],
      },
    ],
    template:
      "- Mucosa com alterações reativas discretas.\n" +
      ". Mucosa de {{Localização}} exibindo alterações reativas discretas com revestimento epitelial levemente reativo, mantendo organização regular e maturação preservada.\n" +
      ". Atrofia: {{Atrofia}}.\n" +
      ". Metaplasia intestinal: {{Metaplasia_intestinal}}.\n" +
      ". {{H_pylori_Giemsa}}\n" +
      SEM_MALIGNIDADE,
  },
  {
    id: "gastro-borda-ulcera-hp-positivo",
    name: "Borda de úlcera Hp+",
    category: "Estômago",
    fields: [
      {
        variable_name: "Mucosa",
        field_type: "select",
        options: ["antral", "fúndica", "de corpo", "de transição corpo-antro"],
      },
      {
        variable_name: "Intensidade",
        field_type: "select",
        options: ["leve", "moderada", "intensa"],
      },
      { variable_name: "Atrofia", field_type: "select", options: ATROFIA },
      ...miFields(),
      giemsaField(),
      {
        variable_name: "H_pylori",
        field_type: "select",
        // AHK preselected "positiva (1+/3+)" (Choose2) for this mask.
        options: [
          "positiva (1+/3+)",
          "positiva (2+/3+)",
          "positiva (3+/3+)",
          "negativa",
        ],
      },
    ],
    template:
      "- Gastrite crônica {{Intensidade}}, em atividade, em mucosa de padrão {{Mucosa}}, compatível com borda de úlcera.\n" +
      ". Atrofia: {{Atrofia}}.\n" +
      `. Metaplasia intestinal: ${MI_TEMPLATE}.\n` +
      ". Pesquisa de Helicobacter pylori{{Giemsa}} resultou {{H_pylori}}.\n" +
      ". Ausência de evidências de malignidade nesta amostra.\n\n" +
      "Nota: Mucosa com intensas alterações epiteliais de aspectos reativo e regenerativo. Recomenda-se, a critério clínico, nova amostragem após tratamento.",
  },
  {
    id: "gastro-borda-ulcera-hp-negativo",
    name: "Borda de úlcera Hp-",
    category: "Estômago",
    fields: [
      { variable_name: "Atrofia", field_type: "select", options: ATROFIA },
      { variable_name: "Metaplasia_intestinal", field_type: "select", options: MI_PRESENCA },
      {
        variable_name: "MI_tipo",
        field_type: "select",
        // AHK preselected "incompleta" (Choose2) here.
        options: ["", ", tipo incompleta", ", tipo completa", ", tipo completa e incompleta"],
      },
      { variable_name: "MI_grau", field_type: "select", options: MI_GRAU },
      { variable_name: "MI_displasia", field_type: "select", options: MI_DISPLASIA },
    ],
    template:
      "- Mucosa gástrica de padrão antral exibindo alterações reativas/regenerativas, compatível com tecido de borda de úlcera.\n" +
      ". Atrofia: {{Atrofia}}.\n" +
      `. Metaplasia intestinal: ${MI_TEMPLATE}.\n` +
      ". A pesquisa de Helicobacter pylori (Giemsa) resultou negativa.\n" +
      ". Não foram observados sinais de malignidade nesta amostra.",
  },
  {
    id: "gastro-neoplasia-celulas-fusiformes",
    name: "Neoplasia de células fusiformes",
    category: "Estômago",
    fields: [
      { variable_name: "Índice_mitótico", field_type: "text" },
      { variable_name: "Necrose", field_type: "text" },
      { variable_name: "Localização", field_type: "text" },
      { variable_name: "Outros_achados", field_type: "text" },
      ...hpFields(),
    ],
    template:
      "- Neoplasia de células fusiformes - ver nota.\n" +
      ". Índice mitótico: {{Índice_mitótico}}.\n" +
      ". Necrose: {{Necrose}}.\n" +
      ". Localização: {{Localização}}.\n" +
      ". Outros achados: {{Outros_achados}}.\n" +
      `. ${HP_LINHA}\n\n` +
      "Nota: recomenda-se exame imuno-histoquímico para complementação diagnóstica.",
  },

  // ----------------------------------------------------------------- Duodeno
  {
    id: "gastro-duodeno-normal",
    name: "Duodeno normal",
    category: "Duodeno",
    fields: [],
    template:
      "- Mucosa duodenal de aspecto histológico habitual.\n" +
      ". Mucosa duodenal com vilosidades preservadas sem sinais de hiperplasia das criptas.\n" +
      ". Ausência de linfocitose intraepitelial significativa.\n" +
      ". Proporção vilo / cripta preservada.\n" +
      ". Lâmina própria com discreto infiltrado inflamatório linfoplasmocitário.\n" +
      ". Ausência de granulomas, eosinofilia ou parasitas.\n" +
      ". Não foram observados sinais de malignidade nesta amostra.",
  },
  {
    id: "gastro-duodenite-leve",
    name: "Duodenite leve",
    category: "Duodeno",
    fields: [],
    template:
      "- Duodenite leve com focos de metaplasia foveolar.\n" +
      ". Mucosa apresentando leve edema, congestão vascular e infiltrado inflamatório misto leve.\n" +
      ". Linfócitos intraepiteliais em contagem não significante.\n" +
      ". Revestimento epitelial aparece ligeiramente reativo, mantendo organização regular, sem atrofia de vilos.\n" +
      ". Ausência de granulomas, eosinofilia ou parasitas.\n" +
      ". Não foram observados sinais de malignidade nesta amostra.",
  },
  {
    id: "gastro-duodeno-heterotopia",
    name: "Heterotopia gástrica em delgado",
    category: "Duodeno",
    fields: [],
    template:
      "- Heterotopia de mucosa gástrica em delgado.\n" +
      ". Tecido gástrico composto por glândulas fúndicas, recobertas por epitélio foveolar, sem atipia.\n" +
      ". Na lâmina própria, leve edema e infiltrado mononuclear moderado com agregado linfoide.\n" +
      ". Ausência de evidências de malignidade na presente amostra.",
  },
  {
    id: "gastro-duodeno-brunner",
    name: "Hiperplasia de glândulas de Brunner",
    category: "Duodeno",
    fields: [],
    template:
      "- Hiperplasia de glândulas de Brunner.\n" +
      ". Mucosa exibe aumento do volume e densidade das glândulas de Brunner, exibindo focos de dilatação cística, mas mantendo organização lobular regular, sem atipia nuclear.\n" +
      ". Mucosa recobrindo glândulas reativa.\n" +
      ". Ausência de atrofia vilositária e linfocitose intraepitelial (MARSH-OBERHUBER 0).\n" +
      ". Ausência de parasitas.\n" +
      ". Ausência de evidências de malignidade.",
  },

  // ------------------------------------------------------------------- Cólon
  {
    id: "gastro-colon-normal",
    name: "Cólon normal",
    category: "Cólon",
    fields: [],
    template:
      "- Mucosa colônica de aspecto histológico habitual.\n" +
      ". Mucosa com arquitetura de criptas preservada e número habitual de células caliciformes.\n" +
      ". Ausência de criptite.\n" +
      ". Não foram detectados granulomas, parasitas, espessamento colágeno subepitelial e/ou linfocitose intraepitelial.\n" +
      ". Não foram observados sinais de malignidade nesta amostra.",
  },
  {
    id: "gastro-colite-ativa-focal",
    name: "Colite ativa focal",
    category: "Cólon",
    fields: [],
    template:
      "- Colite ativa focal.\n" +
      ". Os cortes histológicos demonstram mucosa colônica com arquitetura de criptas preservada.\n" +
      ". Epitélio de revestimento com alterações regenerativas.\n" +
      ". Lâmina própria exibindo infiltrado linfomononuclear com neutrófilos agredindo focalmente as criptas.\n" +
      ". Não foram detectados granulomas, parasitos, sinais de cronicidade ou malignidade nesta amostra.\n\n" +
      "Nota: estes achados podem ser vistos em colites infecciosas, reação a medicamentos ou em doença inflamatória intestinal. Necessária correlação com dados clínicos e endoscópicos.",
  },
  {
    id: "gastro-colite-erosiva",
    name: "Colite erosiva",
    category: "Cólon",
    fields: [
      check("Agressão_focal_às_criptas", "focalmente ", { checked: true }),
      check(
        "Incluir_nota",
        "Nota: estes achados podem ser vistos em colites infecciosas, reação a medicamentos, em doença inflamatória intestinal, entre outros diagnósticos diferenciais. Necessária correlação com dados clínicos e endoscópicos.",
        { checked: true, mode: "paragraph" },
      ),
    ],
    template:
      "- Colite erosiva com alterações regenerativas.\n" +
      ". Mucosa colônica com focos de erosão reparada.\n" +
      ". O epitélio de revestimento exibe alterações regenerativas e reativas.\n" +
      ". Na lâmina própria observam-se infiltrado inflamatório linfoplasmocitário e neutrófilos agredindo {{Agressão_focal_às_criptas}}as criptas.\n" +
      ". Não foram detectados granulomas, parasitos, sinais de cronicidade ou malignidade nesta amostra.{{Incluir_nota}}",
  },
  {
    id: "gastro-colite-reativa",
    name: "Colite reativa",
    category: "Cólon",
    fields: [
      check("Ver_nota_no_título", " (ver nota)", { checked: true }),
      check(
        "Incluir_nota",
        "Nota: alterações reativas inespecíficas podem ser vistas após resolução de processo inflamatório autolimitado. Necessária correlação com dados clínicos e colonoscópicos.",
        { checked: true, mode: "paragraph" },
      ),
    ],
    template:
      "- Mucosa colônica reativa{{Ver_nota_no_título}}.\n" +
      ". Mucosa com arquitetura de criptas preservada, regeneração epitelial e folículo linfoide.\n" +
      ". Ausência de criptite.\n" +
      ". Não foram detectados granulomas, parasitas, espessamento colágeno subepitelial e/ou linfocitose intraepitelial.\n" +
      ". Não foram observados sinais de malignidade nesta amostra.{{Incluir_nota}}",
  },
  {
    id: "gastro-colon-polipo-hiperplasico",
    name: "Pólipo hiperplásico/inflamatório",
    category: "Cólon",
    fields: [],
    template:
      "- Pólipo hiperplásico/inflamatório.\n" +
      ". Mucosa retal apresentando criptas revestidas por epitélio cilíndrico do tipo intestinal sem atipias, algumas com dilatação cística.\n" +
      ". Na lâmina própria, há acentuação do infiltrado inflamatório misto, edema e proliferação de vasos. Há focos de erosão com formação de tecido de granulação.\n" +
      ". Ausência de evidências de malignidade.",
  },

  // -------------------------------------------------------- Vesícula biliar
  {
    id: "gastro-vesicula-colecistite",
    name: "Colecistite crônica",
    category: "Vesícula biliar",
    // Every optional line uses "conditional" mode, which lets the template
    // below stack them one per line: unticked lines vanish without leaving a
    // blank one behind.
    fields: [
      check("Calculosa", " calculosa", { checked: true }),
      check("Colesterolose", ". Colesterolose.", { mode: "conditional" }),
      // AHK had two checkboxes that shared one sentence; multicheck joins the
      // ticked ones so "intestinal e pseudopilórica" reads correctly.
      {
        variable_name: "Metaplasia",
        field_type: "multicheck",
        options: ["intestinal", "pseudopilórica"],
        prefix: ". Presença de focos de metaplasia ",
        suffix: ".",
        line_mode: "conditional",
      },
      check(
        "Seios_de_Rokitanski_Aschoff_dilatados",
        ". Seios de Rokitanski-Aschoff dilatados.",
        { mode: "conditional" },
      ),
      check("Adenomiomatose", ". Presença de adenomiomatose.", { mode: "conditional" }),
      check(
        "Linfonodo_peri_cístico",
        "- Linfonodo peri-cístico com hiperplasia linfoide reacional.",
        { mode: "conditional" },
      ),
      check(
        "Tecido_hepático_aderido",
        "- Rima de tecido hepático aderido com artefatos pré-analíticos de fulguração, discreto infiltrado inflamatório linfocitário periportal e esteatose discreta.",
        { mode: "conditional" },
      ),
    ],
    template:
      "Vesícula biliar:\n" +
      "- Colecistite crônica{{Calculosa}}.\n" +
      "{{Colesterolose}}\n" +
      "{{Metaplasia}}\n" +
      "{{Seios_de_Rokitanski_Aschoff_dilatados}}\n" +
      ". Ausência de sinais de malignidade.\n" +
      "{{Adenomiomatose}}\n" +
      "{{Linfonodo_peri_cístico}}\n" +
      "{{Tecido_hepático_aderido}}",
  },
  {
    id: "gastro-vesicula-agudizada",
    name: "Colecistite crônica agudizada",
    category: "Vesícula biliar",
    fields: [
      check(
        "Seios_de_Rokitanski_Aschoff_dilatados",
        ". Seios de Rokitanski-Aschoff dilatados.",
        { mode: "conditional" },
      ),
    ],
    template:
      "Vesícula Biliar:\n" +
      "- Colecistite crônica agudizada.\n" +
      ". Mucosa revestida por epitélio colunar simples com alterações reativas, focos de exulceração, área de necrose e infiltrado neutrofílico.\n" +
      ". Lâmina própria e parede muscular com fibrose, focos de hemorragia e infiltrado inflamatório linfo-histioplasmocitário.\n" +
      "{{Seios_de_Rokitanski_Aschoff_dilatados}}\n" +
      ". Ausência de neoplasia.\n" +
      "- Colelitíase.",
  },

  // ---------------------------------------------------------------- Apêndice
  {
    id: "gastro-apendicite-aguda",
    name: "Apendicite aguda",
    category: "Apêndice",
    fields: [
      {
        variable_name: "Tipo",
        field_type: "select",
        options: ["úlcero-flegmonosa", "incipiente", "necrossupurativa", "ulcerada"],
      },
      check(
        "Hiperplasia_linfoide_folicular_reacional",
        "- Hiperplasia linfoide folicular reacional.",
        { mode: "conditional" },
      ),
      check(
        "Obliteração_fibrosa_da_ponta",
        "- Obliteração fibrosa da ponta do apêndice.",
        { mode: "conditional" },
      ),
      check(
        "Periapendicite_aguda_fibrinoleucocitária",
        "- Periapendicite aguda fibrinoleucocitária.",
        { mode: "conditional" },
      ),
    ],
    template:
      "Apêndice cecal:\n" +
      "- Apendicite aguda {{Tipo}}.\n" +
      "{{Hiperplasia_linfoide_folicular_reacional}}\n" +
      "{{Obliteração_fibrosa_da_ponta}}\n" +
      "{{Periapendicite_aguda_fibrinoleucocitária}}\n" +
      "- Não se observam elementos de malignidade nesta amostra.",
  },

  // --------------------------------------------------------------------- IHQ
  {
    id: "gastro-ihq-estomago-pmmr-her2neg",
    name: "IHQ estômago — pMMR + HER2 negativo (biópsia)",
    category: "IHQ",
    fields: [],
    template:
      "- Adenocarcinoma com expressão mantida das enzimas que compõem o sistema de correção de erros de mal pareamento do DNA.\n" +
      "- HER2 negativo.\n\n" +
      "Nota 1: Este resultado indica proficiência do sistema de reparo de mal pareamento do DNA (pMMR), o que indica que o tumor tem baixíssima probabilidade de ter instabilidade de microssatélites. A probabilidade deste paciente ser portador de síndrome de Lynch é pequena, entretanto não é possível excluir a possibilidade de o paciente apresentar neoplasia decorrente da alteração em outros genes não envolvidos no sistema de reparo dos erros do pareamento do DNA. Pacientes com história pessoal e/ou familiar de câncer podem se beneficiar de aconselhamento genético para melhor interpretação do resultado.\n\n" +
      "Nota 2: Expressão imuno-histoquímica da proteína HER2 (C-erb-B2) pelo Colégio Americano de Patologistas (CAP) é considerada:\n" +
      ". Positiva (escore 3 +): marcação de forte intensidade, circunferencial completa, basolateral ou lateral de membrana em qualquer percentual de células neoplásicas.\n" +
      ". Duvidosa (escore 2 +): marcação de fraca a moderada intensidade, circunferencial completa, basolateral ou lateral de membrana em qualquer percentual de células neoplásicas.\n" +
      ". Negativa (escore 1+): marcação de intensidade tênue / vagamente perceptível, em qualquer percentual de células neoplásicas.\n" +
      ". Negativa (escore 0): ausência de marcação ou ausência de marcação na membrana em qualquer célula neoplásica.\n\n" +
      "Referências Bibliográficas: 1) Boland, RC. and Goel A. (2010). Microsatellite instability in colorectal cancer. Gastroenterology. 138(6): 2073-2087. 2) WHO Classification of Tumours Editorial Board. Digestive system tumours. Lyon (France): International Agency for Research on Cancer; 2019. (WHO classification of tumours series, 5th ed.; vol. 1).",
  },
  {
    id: "gastro-ihq-estomago-pmmr-her2neg-peca",
    name: "IHQ estômago — pMMR + HER2 negativo (peça radical)",
    category: "IHQ",
    fields: [],
    template:
      "- Adenocarcinoma com expressão mantida das enzimas que compõem o sistema de correção de erros de mal pareamento do DNA.\n\n" +
      "- HER2 negativo.\n\n" +
      "Interpretação: Este resultado indica proficiência do sistema de reparo de mal pareamento do DNA (pMMR), o que indica que o tumor tem baixíssima probabilidade de ter instabilidade de microssatélites. A probabilidade deste paciente ser portador de síndrome de Lynch é pequena, entretanto não é possível excluir a possibilidade de o paciente apresentar neoplasia decorrente da alteração em outros genes não envolvidos no sistema de reparo dos erros do pareamento do DNA.\n\n" +
      "Nota: Pacientes com história pessoal e/ou familiar de câncer podem se beneficiar de aconselhamento genético para melhor interpretação do resultado.\n\n" +
      "Referências Bibliográficas: 1) Boland, RC. and Goel A. (2010). Microsatellite instability in colorectal cancer. Gastroenterology. 138(6): 2073-2087. 2) WHO Classification of Tumours Editorial Board. Digestive system tumours. Lyon (France): International Agency for Research on Cancer; 2019. (WHO classification of tumours series, 5th ed.; vol. 1).",
  },
];

export const GASTRO_AREA = "Gastro";

/** Build the Gastro masks as FastPath `Mask` objects. */
export function buildGastroMasks(now = new Date().toISOString()): Mask[] {
  return SEEDS.map((seed) => {
    const fields: VariableBlock[] = seed.fields.map((f, i) => ({
      id: `${seed.id}-f${i}`,
      type: "variable",
      variable_name: f.variable_name,
      field_type: f.field_type,
      options: f.options,
      checked_text: f.checked_text,
      default_checked: f.default_checked,
      line_mode: f.line_mode,
      measure_dims: f.measure_dims,
      unit: f.unit,
      prefix: f.prefix,
      suffix: f.suffix,
      last_separator: f.last_separator,
      required: false,
    }));
    // Deterministic block ids keep seeded masks byte-identical across builds.
    let n = 0;
    const makeId = () => `${seed.id}-b${n++}`;
    return {
      id: seed.id,
      creator_id: "seed",
      name: seed.name,
      area: GASTRO_AREA,
      category: seed.category,
      blocks: templateToBlocks(seed.template, fields, makeId),
      is_published: false,
      is_official: true,
      created_at: now,
      variables: fields.map((f) => f.variable_name),
    };
  });
}
