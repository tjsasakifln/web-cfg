# Tese — EDIÇÃO ZERO

**Wedge:** Pavimentação e edificações públicas no recorte extra-cli pré-nacional (SC, PI, MG, RS)

**Por que este wedge:** Único recorte publicado no snapshot versionado com dois arquétipos do ICP CONFENGE, quatro UFs e agregados de volume, ticket e contagem de compradores/fornecedores. Não é censo do Brasil.

**O que a tese não é:** um observatório nacional, um censo de 27 UFs, um
ranking de construtoras ou uma faixa nacional de preço praticado.

**Pergunta-mãe:** o que o snapshot extra-cli já publicado (`dataset_hash`
`0d8757f7cda3a6770aefaea9b8732574fa7bae5265b5f446abcfd0a6562d7b30`, `data_as_of=2026-07-31`) consegue afirmar,
com proveniência, sobre pavimentação e edificações públicas em SC, PI, MG e RS?

**Veredito desta edição:** `NEEDS_DATA`

Wedge sustentável apenas como recorte de 4 UF(s) e 4 mercado(s) publicados. O manifest declara cobertura incompleta frente ao conjunto de referência da base canônica de contratos. PUBLISH exige extra-cli #400 com cobertura de 27 UFs, denominator explícito e freshness no SLA. Bloqueio: RESEARCH_READ_MODEL_ABSENT.

**Próxima ação:** Bloqueio extra-cli #400 (RESEARCH_READ_MODEL_ABSENT). Obter o export versionado `extra-cli.public_read.research_aggregate.v1` com cobertura nacional (27 UFs), denominator explícito e freshness dentro do SLA (30 dias). Regenerar o pack e só então reavaliar PUBLISH. Não indexar, não promover sitemap, não disparar imprensa.
