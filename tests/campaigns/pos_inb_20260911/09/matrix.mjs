export const CAMPAIGN_SET = "POS-INB-20260911";
export const CAMPAIGN_ID = "09";
export const POS_IDS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];
export const REQUIREMENTS = ["Q01", "Q02", "Q03", "Q04", "Q05", "Q06", "Q07", "Q08"];

export const CSVS = [
  { id: "quantitativos", file: "quantitativos.csv" },
  { id: "orcamento", file: "orcamento.csv" },
  { id: "coordenacao", file: "coordenacao.csv" },
  { id: "revisao", file: "revisao.csv" },
];

export const DEMO_DIR = "casos/demonstrativo-projeto-privado";
export const DEMO_PAGE = `${DEMO_DIR}/index.html`;
export const CSV_DIR = `${DEMO_DIR}/data`;

export const ORCAMENTO_PAGE = "quantitativos-orcamento-obras/index.html";
export const PRONTIDAO_PAGE = "ferramentas/prontidao-tecnica-obra-privada/index.html";
export const PRONTIDAO_ENGINE = "assets/js/private-project-technical-readiness.cjs";
export const REVISAO_PAGE = "revisao-tecnica-projetos-engenharia/index.html";
export const COMPAT_PAGE = "compatibilizacao-projetos-engenharia/index.html";
export const COMPLEMENTARES_PAGE = "projetos-complementares-engenharia/index.html";
export const PARCERIAS_PAGE = "parcerias-engenharia/index.html";
export const KITS_JSON = "data/distribution/partner-reference-kits.v1.json";
export const SERVICOS_PAGE = "servicos/index.html";
export const OBRAS_PUBLICAS_PAGE = "servicos-obras-publicas/index.html";
export const PERICIA_PAGE = "assistencia-tecnica-pericial-engenharia/index.html";
export const INSPECAO_PAGE = "inspecao-diagnostico-edificacoes/index.html";

export const REQUIRED_DESTINATIONS = {
  orcamento: {
    offer_id: "quantity_takeoff_budgeting",
    path: "/quantitativos-orcamento-obras/",
  },
  compatibilizacao: {
    offer_id: "bim_coordination_clash_register",
    path: "/compatibilizacao-projetos-engenharia/",
  },
  revisao: {
    offer_id: "complementary_engineering_project_review",
    purchase_id: "revisao-tecnica-projetos",
    route_id: "revisao",
    path: "/revisao-tecnica-projetos-engenharia/",
    not: ["/servicos/#servico-projeto", "/projetos-complementares-engenharia/"],
  },
};

export const KIT_EXPECTED = {
  "orcamento-quantitativos": {
    path: "/quantitativos-orcamento-obras/",
    sample: "/casos/modelo-base-quantitativa-canonica/",
  },
  "revisao-compatibilizacao": {
    dedicated: ["/revisao-tecnica-projetos-engenharia/", "/compatibilizacao-projetos-engenharia/"],
    forbidden: ["/servicos/#servico-projeto"],
  },
  complementares: {
    dedicated: ["/projetos-complementares-engenharia/"],
    forbidden: ["/servicos/#servico-projeto"],
  },
};

export const GENERIC_HUB = "/servicos/#servico-projeto";

export const PUBLIC_LEAK_PAGES = [REVISAO_PAGE, PRONTIDAO_PAGE, PARCERIAS_PAGE, ORCAMENTO_PAGE, DEMO_PAGE];

export const INFRA_DEMONSTRATIVO_HINTS = [
  "/casos/demonstrativo-infraestrutura",
  "/casos/demonstrativo-infraestrutura-publica",
  "quando o demonstrativo de infraestrutura",
  "demonstrativo de infraestrutura ainda não publicado",
  "aguardando o demonstrativo 08",
];

export const SLIM_COPY_PATHS = [
  "package.json",
  "AGENTS.md",
  "index.html",
  DEMO_DIR,
  "quantitativos-orcamento-obras",
  "ferramentas/prontidao-tecnica-obra-privada",
  "assets/js/private-project-technical-readiness.cjs",
  "assets/js/private-project-technical-readiness.js",
  "revisao-tecnica-projetos-engenharia",
  "compatibilizacao-projetos-engenharia",
  "projetos-complementares-engenharia",
  "parcerias-engenharia",
  KITS_JSON,
  SERVICOS_PAGE,
  OBRAS_PUBLICAS_PAGE,
  PERICIA_PAGE,
  INSPECAO_PAGE,
  "robots.txt",
  "sitemap.xml",
  "seo/PUBLIC-ARTIFACT-MANIFEST.json",
  "scripts/pseo/public_artifact.py",
  "netlify/functions",
  "scripts/conversion",
  "data/commercial",
  "triagem-tecnica/index.html",
  "casos/index.html",
  "conteudos/index.html",
];
