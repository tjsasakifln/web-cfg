## Design read

**Audience:** direção, engenharia, licitações e contratos de construtoras de obras públicas.  
**Context:** decisões de alto valor envolvendo edital, contrato, documentação, risco financeiro, cálculo, cronograma e margem.  
**Desired perception:** consultoria técnica premium + engenharia + inteligência + rigor editorial; sóbria, precisa, autoral, confiável e brasileira.  
**Direção a validar:** **Technical Editorial / Engineering Intelligence**, em marcha expressiva para tese/leitura e produtiva para ferramenta/dado/conversão.

O site já possui conteúdo, honestidade editorial, conversão e alguns canários com materialidade técnica. A auditoria contemporânea usa `origin/main@b4cafc4fe0a005c3769a7b6acde882ff1f9d65d8` e produção/screenshots em `7500d7bdeb325f9f72e38b72e7fd6bb6db29f680`; o único delta é o quality gate do PR #483, sem arquivo visual público. Ela encontrou distância entre a direção declarada e o render sitewide: system sans quase universal, `.content-hero` compartilhado, cardification, acabamento por radius/shadow/gradient, motion ritual e pouca imagery documental.

**Decision state:** `P1 / VALIDATE → EXECUTE_CANARY`  
**Executive front:** INBOUND ENGINE  
**Time to evidence:** protótipos comparáveis antes de implementação; um canário por família antes de escala.  
**Leverage:** trust, conversion, customer, distribution e automation.  
**North Star:** oportunidades comerciais qualificadas, nunca page count, cards removidos ou volume de redesign.

## Principles

1. Job e evidência antes de estilo.
2. Estrutura, keylines, coluna, tabela e whitespace antes de card/elevation.
3. Tipografia por papel: tese, leitura, interface, número, legenda, fonte e nota.
4. Elementos do domínio devem comunicar informação real, sem caricatura CAD.
5. Uma informação dominante por seção; igualdade somente para comparação real.
6. Consistência de marca sem clonagem de arquétipos.
7. Mobile reeditado, não desktop empilhado.
8. Motion somente para feedback, estado, navegação ou continuidade espacial.
9. Exceções de gradient/radius/shadow/serif/icon/motion exigem papel declarado.
10. Prototype-first, canário, visual diff, rollback e validação humana quando percepção for alegada.

## Waves

### WAVE 1 — FOUNDATION

- #494 — Congelar a CONFENGE Visual Constitution por protótipo comparado
- #495 — Tornar tipografia e typesetting decisão de marca e leitura técnica
- #496 — Reduzir cardification, raios, sombras e gradients no sistema de superfície

### WAVE 2 — HIGH VISIBILITY

- #497 — Aplicar o canário Technical Editorial à home, header e footer
- #498 — Transformar o catálogo 8/54 em índice editorial de decisão
- #499 — Diferenciar páginas comerciais por artefatos e decisão técnica

### WAVE 3 — DEPTH

- #500 — Criar arquétipos editoriais para artigo, autoridade e prova
- #501 — Dar linguagem de relatório e dados às superfícies de inteligência
- #502 — Fazer ferramentas e formulários parecerem instrumentos técnicos
- #503 — Criar sistema documental de imagery e artefatos com proveniência

### WAVE 4 — RATCHET

- #504 — Impedir drift visual de volta ao template genérico

Issues contemporâneas reutilizadas, sem duplicar outcome: #183 (nav task-first), #184 (home/3 segundos), #327 (first fold comercial), #328 (primeira prova real) e #335 (escolha/comparação 54/54).

## Global Definition of Done

- [ ] o site não depende de gradients/glows/shadows/cardification para sugerir sofisticação;
- [ ] a tipografia é uma decisão deliberada, licenciada, performática e adequada a PT-BR, números e tabelas;
- [ ] a linguagem editorial é reconhecível em pelo menos três arquétipos sem clonar sua estrutura;
- [ ] elementos visuais derivam de engenharia, documentação, dados e cálculo com purpose/provenance;
- [ ] home e money pages mantêm leitura em três segundos, CTA, prova e conversão;
- [ ] conteúdo tem leitura editorial de alto nível e inteligência pública trata fonte/método/freshness como primeira classe;
- [ ] ferramentas parecem instrumentos técnicos e formulários preservam conclusão/estado;
- [ ] mobile é art-directed e preserva comparação, CTA, tabela e evidência;
- [ ] o counterfactual sem logo/texto ainda conserva sinais funcionais da CONFENGE;
- [ ] nenhum gate afirma “bom gosto” ou percepção humana; exceções justificadas permanecem possíveis;
- [ ] SEO, semantics, WCAG 2.2 AA, 44 px, JS-off suportado, performance/Core Web Vitals, capture/Turnstile, analytics sem PII, privacy, URLs/canonicals, runtime e truth/proof contracts permanecem ou melhoram;
- [ ] cada expansão usa before/after nos mesmos viewports e rollback por SHA.

Não é autorização para big-bang, framework rewrite, SmartLic, segunda superfície, stock genérico ou prova inventada.
