# Revisão documental SmartLic HOLD, 22/11/2026

**Escopo:** 54 URLs originalmente classificadas como `HOLD_TARGET_NOT_READY` na decisão do web-cfg #62, com reavaliação documental nesta data. **Próxima revisão:** 2026-12-20 ou imediatamente após evidência de destino 1:1 potencial.

**Autoridade consultada:** [web-cfg #62](https://github.com/tjsasakifln/web-cfg/issues/62), [SmartLic #2115](https://github.com/tjsasakifln/SmartLic/issues/2115), [revisão anterior de 24/10/2026](HOLD-REVIEW-2026-10-24.md), inventário de 1.255 URLs, conjunto executável e matriz de classificação. No GitHub, a `main` observada é `38b62f5e499d0ab73f7ceeeecddcb0811fee09e8`. As PRs #859 e #860 já integradas adicionaram editor IFC e 45 planilhas, sem aprovar equivalências de URL SmartLic; #865 e #866 ainda não foram integradas e não constituem destinos indexáveis autorizados.

**O que foi efetivamente conferido:** os 54 registros individualmente, com URL original, motivo, superfície futura, ausência de alvo, HTTP 410 e falta de autorização de 301. Não foi feita medição independente de GSC, backlinks, DNS/TLS, consulta de todos os possíveis destinos na internet ou cutover; esses estados continuam UNKNOWN / NOT_PERFORMED. Esta revisão **não é** aprovação humana, nem certificação de disponibilidade externa. Sem evidência de destino real 1:1, a decisão técnica segura continua 410, sem `Location`, vedado qualquer 301 genérico ou reativação SmartLic.

**Balanço validado:** 54 HOLD, 11 REDIRECT_301 já aprovados no inventário, 1.190 RETIRE_410, nenhum HOLD promovido, nenhum alvo de redirecionamento alterado. O prazo novo resulta desta inspeção documental, não de simples substituição automática de datas.

**Pin anterior preservado para auditoria:** `acd21cdf7bd71f5bde06a7887e50f4054cd19aeaacce908cb84d679a796246e8`. **Novo pin após regeneração determinística:** `a167b78c0d4dd62cc2bb612a6075253dda5c5b4f47a511810fac58e492a63d40` (deve ser substituído pela rotina de geração a partir dos bytes reais).

## Censo nominal das 54 URLs avaliadas

| URL legada | Superfície ainda não autorizada como destino | Fundamentação existente |
|---|---|---|
| https://smartlic.tech/blog/checklist-habilitacao-licitacao-2026 | CONFENGE habilitação checklist (not live) | Habilitação checklist is a future tender-operations surface. |
| https://smartlic.tech/blog/clausulas-escondidas-editais-licitacao | CONFENGE hidden-clause edital guide (not live) | Edital-clause review is a future tender-operations surface. |
| https://smartlic.tech/blog/como-consultar-contratos-publicos-pncp | CONFENGE PNCP/public-contracts explorer (not live) | PNCP contract-lookup how-to belongs to a future public-read vertical. |
| https://smartlic.tech/blog/como-participar-primeira-licitacao-2026 | CONFENGE first-tender participation guide (not live) | First-tender how-to is a future inbound vertical; bid-room is not 1:1. |
| https://smartlic.tech/blog/impugnacao-edital-quando-como-contestar | CONFENGE impugnação guide (not live) | Impugnação how-to is a future lei-14133 child. |
| https://smartlic.tech/blog/lei-14133-guia-fornecedores | CONFENGE lei-14133 supplier guide (not live) | Supplier-facing lei-14133 guide is a future child, not the parent hub. |
| https://smartlic.tech/blog/licitacoes-engenharia-2026 | CONFENGE engineering-tenders surface (not live) | Engineering tender discovery is a future vertical; bid-room is not 1:1. |
| https://smartlic.tech/blog/pncp-api-integracao-empresas | CONFENGE PNCP integration note (not live) | PNCP API integration is a future developer/data surface. |
| https://smartlic.tech/blog/pncp-consulta-contratos-passo-a-passo | CONFENGE PNCP contracts how-to (not live) | Step-by-step PNCP contract lookup is a future public-read surface. |
| https://smartlic.tech/blog/pncp-dispensa-licitacao-quando-aplicar | CONFENGE dispensa guide (not live) | Dispensa-when-to-apply is a future lei-14133 child, not the parent hub. |
| https://smartlic.tech/blog/pncp-erros-comuns-empresas-iniciantes | CONFENGE PNCP common-errors guide (not live) | PNCP beginner errors belong to a future PNCP guide, not a #60 pillar. |
| https://smartlic.tech/blog/pncp-guia-completo-empresas | CONFENGE PNCP guide (not live) | PNCP how-to for firms is a future surface; no ready 1:1 CONFENGE page. |
| https://smartlic.tech/blog/pncp-modalidade-pregao-eletronico | CONFENGE pregão eletrônico guide (not live) | Pregão modality explainer is a future tender-operations surface. |
| https://smartlic.tech/blog/pncp-registro-precos-como-participar | CONFENGE registro-de-preços guide (not live) | SRP participation is a future tender-operations surface. |
| https://smartlic.tech/blog/pncp-timeline-publicacao-edital | CONFENGE edital-publication timeline (not live) | Edital calendar/timeline is a future tender-operations surface. |
| https://smartlic.tech/blog/pncp-vs-comprasgov-diferencas | CONFENGE PNCP vs Compras.gov explainer (not live) | Portal comparison is a future tender-operations surface. |
| https://smartlic.tech/blog/prazo-vigencia-contratos-publicos-guia | CONFENGE contract-term/vigência guide (not live) | Vigência how-to is a future contracts-operations surface. |
| https://smartlic.tech/blog/subcontratacao-licitacoes-regras-lei-14133 | CONFENGE lei-14133 subcontracting child (not live) | Subcontracting rules need a dedicated child; parent /lei-14133-obras/ dump is forbidden. |
| https://smartlic.tech/cnpj | CONFENGE CNPJ/company lookup hub (not live) | Company-lookup hub is a future extra-cli public-read surface; farm instances stay retired. |
| https://smartlic.tech/como-avaliar-licitacao | CONFENGE tender-evaluation guide (not live) | Tender-evaluation job belongs to a future inbound vertical; no ready 1:1 CONFENGE page. |
| https://smartlic.tech/como-evitar-prejuizo-licitacao | CONFENGE bid-loss prevention guide (not live) | Bid-loss prevention is a future tender-operations surface; not #60 margin-defense. |
| https://smartlic.tech/como-filtrar-editais | CONFENGE edital-filtering guide (not live) | Edital filtering is a future tender-discovery surface; bid-room is not 1:1. |
| https://smartlic.tech/como-priorizar-oportunidades | CONFENGE opportunity-prioritization guide (not live) | Opportunity prioritization is a future tender-operations surface. |
| https://smartlic.tech/contratos | CONFENGE public-contracts explorer (not live) | Contracts explorer would be a new public-read vertical, not a #60 pillar. |
| https://smartlic.tech/fornecedores | CONFENGE suppliers hub (not live) | Supplier explorer hub is a future public-read surface; /fornecedores/{id} farm stays retired. |
| https://smartlic.tech/glossario | CONFENGE glossary hub (not live) | No CONFENGE glossary hub exists; individual ready terms already REDIRECT_301. |
| https://smartlic.tech/glossario/atestado-de-capacidade-tecnica | CONFENGE ACT explainer (not live) | ACT term waits for the habilitação/qualification surface. |
| https://smartlic.tech/glossario/bdi | CONFENGE BDI explainer (not live) | BDI term is not equivalent to the SC case study. |
| https://smartlic.tech/glossario/contrato-administrativo | CONFENGE contrato administrativo explainer (not live) | General administrative-contract term has no ready 1:1 pillar. |
| https://smartlic.tech/glossario/edital | CONFENGE edital explainer (not live) | Edital term belongs to a future tender-operations surface. |
| https://smartlic.tech/glossario/estudo-tecnico-preliminar | CONFENGE ETP explainer (not live) | ETP term is a future lei-14133 child. |
| https://smartlic.tech/glossario/fiscalizacao | CONFENGE fiscalização explainer (not live) | Contract inspection term is a future contracts-operations surface. |
| https://smartlic.tech/glossario/garantia-contratual | CONFENGE garantia contratual explainer (not live) | Contract-guarantee term is a future contracts-operations surface. |
| https://smartlic.tech/glossario/habilitacao | CONFENGE habilitação explainer (not live) | Habilitação term waits for the tender-operations surface. |
| https://smartlic.tech/glossario/impugnacao | CONFENGE impugnação explainer (not live) | Impugnação term waits for the lei-14133 child. |
| https://smartlic.tech/glossario/pncp | CONFENGE PNCP glossary/explainer (not live) | PNCP term page waits for the PNCP public-read surface. |
| https://smartlic.tech/guia | CONFENGE guides hub (not live) | CONFENGE /guias-contratos-obras/ is a different corpus, not a 1:1 SmartLic /guia hub. |
| https://smartlic.tech/licitacoes | CONFENGE tenders hub (not live) | Tender-discovery hub has no ready CONFENGE equivalent; parent dumps forbidden. |
| https://smartlic.tech/licitacoes-publicas-2026 | CONFENGE 2026 tenders landing (not live) | Calendar/year landing is a future tender-discovery surface. |
| https://smartlic.tech/municipios | CONFENGE municipalities hub (not live) | Municipality explorer hub is a future public-read surface; farm instances stay retired. |
| https://smartlic.tech/orgaos | CONFENGE agencies hub (not live) | Agency explorer hub is a future public-read surface; /orgaos/{slug} farm stays retired. |
| https://smartlic.tech/perguntas | CONFENGE Q&A hub (not live) | No CONFENGE perguntas hub exists; ready Q&A slugs already REDIRECT_301. |
| https://smartlic.tech/perguntas/assinatura-eletronica-contratos-publicos | CONFENGE electronic-signature contracts guide (not live) | e-signature on public contracts is a future contracts-operations surface. |
| https://smartlic.tech/perguntas/atestado-capacidade-tecnica | CONFENGE atestado de capacidade técnica guide (not live) | ACT how-to is a future tender-operations surface. |
| https://smartlic.tech/perguntas/bdi-composicao-licitacao | CONFENGE BDI explainer (not live) | analises-contratos-publicos/bdi-composicao-vs-referencia-sc/ is a case study, not a 1:1 guide. |
| https://smartlic.tech/perguntas/cadastro-pncp-fornecedor | CONFENGE PNCP supplier-registration guide (not live) | PNCP cadastro is a future tender-operations surface. |
| https://smartlic.tech/perguntas/documentos-habilitacao-licitacao | CONFENGE habilitação documents guide (not live) | Habilitação document list is a future tender-operations surface. |
| https://smartlic.tech/perguntas/licitacao-obras-engenharia-qualificacao | CONFENGE obras qualification guide (not live) | Engineering qualification is a future lei-14133/obras child. |
| https://smartlic.tech/perguntas/pncp-o-que-e-como-usar | CONFENGE PNCP explainer (not live) | PNCP what/how is a future public-read surface. |
| https://smartlic.tech/perguntas/prazo-impugnacao-edital | CONFENGE impugnação timing page (not live) | Impugnação deadline is a future lei-14133 child. |
| https://smartlic.tech/perguntas/prazo-publicacao-edital | CONFENGE edital-publication timing page (not live) | Edital calendar question has no ready 1:1 CONFENGE page. |
| https://smartlic.tech/perguntas/qualificacao-tecnica-lei-14133 | CONFENGE lei-14133 qualification child (not live) | Technical qualification is a future lei-14133 child, not the parent hub. |
| https://smartlic.tech/perguntas/subcontratacao-permitida-licitacao | CONFENGE lei-14133 subcontracting child (not live) | Same job as the subcontracting blog; parent hub dump forbidden. |
| https://smartlic.tech/perguntas/vigencia-contrato-administrativo | CONFENGE contract vigência guide (not live) | Administrative-contract term question is a future contracts-operations surface. |


**Controle temporal complementar:** a suíte confere o mesmo prazo entre inventário e conjunto executável e preserva um teste negativo independente que reprova uma revisão vencida.


**Validação automática em 22/11/2026:** [execução de regeneração e testes](https://github.com/tjsasakifln/web-cfg/actions/runs/45041095902) concluída com êxito, 40 testes da migração e do patrimônio legado aprovados. A geração foi determinística, com 54 HOLD, 11 REDIRECT e 1.190 RETIRE preservados. SHA-256 de inventário e manifesto: `a167b78c0d4dd62cc2bb612a6075253dda5c5b4f47a511810fac58e492a63d40`. A revisão documental e a suíte não certificam o DNS ou a publicação da ponte SmartLic.

## Condições que permanecem obrigatórias

A auditoria de datas não substitui teste de resposta 200 de destino aprovado, equivalência semântica 1:1, página indexável, nem controle humano sobre DNS/cutover. Os testes continuam a exigir que os HOLD sejam nulos, respondam 410 e vençam no dia posterior ao prazo. Revisão subsequente ou aprovação de redirecionamento depende de nova documentação nominal verificável.
