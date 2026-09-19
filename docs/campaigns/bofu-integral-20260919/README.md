# CONFENGE-BOFU-INTEGRAL-20260919 — registro único da campanha

Decisão: EXECUTE_NOW (fundador, 2026-09-19). Front executivo: INBOUND_CORE. Alavancas: confiança (superfície sem recorte e sem redundância), receita (cobertura de descoberta → solução → contato de todas as necessidades elegíveis), automação (release deixa de reprovar por ruído de 1 RTT), dado (contrato proposto de contagem de propostas e classe de origem). Tempo até evidência: publicação e verificação pública nesta campanha; leitura comercial em Warmbly após janelas comparáveis. Parent: #61. Issues: #705, #706, #707. Continuação de `docs/campaigns/inbound-receita-20260919/README.md` (mesmo dia; o piloto B2G medição/glosa não limita o escopo desta campanha).

Mandato: implementar, testar, revisar, abrir PRs, fazer merge e publicar pela esteira canônica (`site-ci` → `netcup-release`), sem nova aprovação genérica. Fora: mídia paga, contratação de ferramentas, prospecção, contato com clientes/parceiros, publicação externa, mudança de preços/condições sem base autorizada.

## Base efetiva (2026-09-19T14:30Z)

| Item | Valor |
| --- | --- |
| `origin/main` | `3cf3c4b47` (merge do PR #711, documental) — release 35443280330 REPROVADA (`/entregas/` LCP 2101 ms) |
| Servido em produção | `a27472bec` (`/.well-known/build-info.json`), release 35439209267 |
| Predecessor saudável | `a27472bec` |
| PRs alheias abertas | #696, #637, #635, #633, #600 e dependabot — intocadas |
| Ramos desta campanha | `campaign/bofu-integral-20260919` (PR #712, incremento 1) → `campaign/bofu-integral-20260919-b` (incremento 2, sobre o primeiro) |

## Estados (dimensões)

| Estado | Valor | Evidência |
| --- | --- | --- |
| IMPLEMENTADO_E_TESTADO | SIM — incremento 1: réplica 34/35 (`evidence/replica-site-ci-70dc5f6b0.log`); incremento 2: réplica 34/35 (`evidence/replica-site-ci-inc2-64f36e15a.log`); em ambos o único FAIL é o scorecard local por ambiente da réplica, e o `site-validation` real passou (runs 35452064202 e 35459648982) | PR #712, PR #713 |
| INTEGRADO | SIM — `b20d2b4d5` (#712) e `83b63fc1f` (#713), merge commits | GitHub |
| PUBLICADO_E_VERIFICADO | Incremento 1: SIM (`b20d2b4d5`, 22/22). Incremento 2: SIM (`83b63fc1f`, 34/34 + jornadas em navegador) | `/.well-known/build-info.json` |
| RECEBIMENTO_COMPROVADO | PENDENTE_OPERACIONAL — ação humana mínima em §Operação (protocolo g03 A→B→C) | herdado de A06 |
| DESCOBERTA_HABILITADA vs EXPOSICAO_OBSERVADA | HABILITADA (13/13 famílias com explicação + contato); exposição NÃO OBSERVADA (GSC mais recente committado: 2026-09-08) | §Matriz |
| RESULTADO_COMERCIAL | AINDA_NAO_MEDIDO (Warmbly é o dono; teste sintético não é oportunidade) | #706 |

## Incremento 1 — visual e desempenho de publicação (PR #712 → `b20d2b4d5`)

- Defeito reproduzido no CSS servido em `a27472bec`: `.situation-row{padding:1rem 0 1.15rem}` (bloco ≤699px) tinha a mesma especificidade de `.area--b2g{padding:1.5rem clamp(1rem,2.5vw,1.75rem)}` e, declarada depois, zerava o padding lateral de `#situacao-obras-publicas`. Correção em `assets/home-10x.css` (bloco 9, nativo, fora dos marcadores da camada editorial): `.situation-row.area--b2g{padding:1.5rem clamp(1rem,2.5vw,1.75rem) 1.6rem}`. Padding computado 16/16 em 320–430 px, 17,5 em 699/700, 22,5–28 no desktop; linhas claras seguem sem padding lateral. Capturas antes/depois em `evidence/situacao-obras-publicas-390-*.png`.
- Teste que reprova a versão quebrada: `test_ui_geometry.mjs::b2g_situation_row_keeps_lateral_padding` (padding computado + caixas dos filhos em 8 larguras, após `scrollIntoView`; `overflow-x:clip` do `main` não mascara porque a medição é por caixa) — contraprova executada: `FAIL … lateral padding lost at 320px: L=0 R=0`. `audit_sitewide_layout.mjs` exige ≥16 px na linha em 7 larguras.
- Release 35443280330 reprovada por `/entregas/` LCP 2101 ms na 3ª medição (1950 nas outras); `3245c774f` igual. Causa: ~40 rotas com H1 em texto medem ~1950 ms, a 50 ms do teto; o driver é a fonte no grafo do Lantern. Correções estruturais (nenhum teto movido): fonte Archivo restrita ao `wdth` 78–100 (o CSS publicado só usa 78%, 96%, 100%; 60 → 42 KB; contornos idênticos, `hhea`/`OS/2`/`head` byte-idênticos) e tokens inlinados no CSS publicado (fim do `@import` serializado). Medição (`evidence/lighthouse-exp-*.log`): `/entregas/` 1955/1954/1803 → 1658/1804/1803; `/casos/` ~1658; `/servicos/` 1654; réplica completa: maior LCP 1809 ms.
- Cadeia de fechamento executada uma vez sobre `f2f4eb7e1`: approvals (rendered_content_hash), canário #389 (+3 irmãos), rota comercial única, frozen specs, primeira dobra 25/25, inventário de CSS, baseline de desempenho (58,69 → 41,25 KB gzip), saídas do build em clone limpo.

## Incremento 2 — matriz por necessidade (PR #713)

Método: cinco leitores somente-leitura + crítico de completude (`evidence/descoberta-*.json`), oito workstreams de implementação com arquivos disjuntos e um revisor adversarial por workstream (`evidence/revisao-adversarial-incremento-2.txt`); todos os P0/P1 corrigidos ou registrados abaixo como pendência. Autoridade para editar a superfície comercial pública (inclusive os seis pilares protegidos): decisões do fundador registradas em `AGENTS.md` (2026-09-09, 2026-09-13) e o mandato desta campanha; `unlock-plan.v1.json` (`html_mutation_authorized:false`) cobre apenas as substituições históricas experimentais e não a manutenção da superfície.

| Necessidade (família) | Solução explicada | Entrega e uso | Prova | URL de entrada | Ação terminal | Responsável nomeado | Indexabilidade | Mudança nesta campanha |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| projetar_revisar_compatibilizar | sim (3 rotas) | documentação da disciplina; relatório de revisão; registro de interferências | pranchas + `/casos/demonstrativo-*` | `/projetos-complementares-engenharia/`, `/revisao-tecnica-projetos-engenharia/`, `/compatibilizacao-projetos-engenharia/` | WhatsApp/e-mail/telefone no `<main>` | Engº Tiago Sasaki, CREA | index,follow, sitemap | redundâncias retiradas; ponte para documentação do construído |
| orcar_planejar_decidir | sim | planilha de quantitativos; orçamento com composições; revisão número a número | prancha P1 + CSV + 2 casos | `/quantitativos-orcamento-obras/` | canais no `<main>`, `#triagem-quantitativos` | sim | index | ponte para `/auditoria-orcamento-licitacao/` (licitante) e prontidão técnica; descrição condicional |
| inspecionar_diagnosticar | sim | relatório de inspeção e condição; hipóteses; encaminhamento | prancha PD | `/inspecao-diagnostico-edificacoes/` | canais, `#contato-inspecao` | sim | index | ABNT NBR 16747 quando aplicável ao objetivo; distinção com investigação da causa (perícia = assistência da parte) |
| receber_entregar_reformar | ANTES parcial → sim | vistoria de recebimento com lista do que corrigir; parecer/plano de reforma (NBR 16280 quando aplicável) | prancha da rota | `/inspecao-diagnostico-edificacoes/#recebimento-entrega`, `#reforma-condominio` | canais da rota | sim (ART de terceiro não assumida) | dentro da rota indexável | blocos e âncoras novos; hub, triagem e home apontam |
| documentar_as_built_regularizar | ANTES nenhuma → sim | matriz projeto × construído × documento; lacunas; recomendação | ferramenta de prontidão (`/ferramentas/prontidao-tecnica-obra-privada/`) | `/inspecao-diagnostico-edificacoes/#documentacao-as-built` | canais da rota | a confirmar antes do aceite (declarado) | dentro da rota indexável | bloco novo; alvará/habite-se são atos do órgão |
| avaliar_imovel | sim (seção do hub) | laudo ou parecer de avaliação | prancha P4 (estrutura, sem valor) | `/servicos/#servico-avaliacao` | WhatsApp/e-mail na seção | sim | fragmento de `/servicos/` (rota própria = decisão pendente do proprietário) | ABNT NBR 14653 na parte aplicável; parecer preliminar como unidade distinta |
| produzir_prova_tecnica | sim | evidências organizadas, quesitos, manifestação técnica | prancha PE | `/assistencia-tecnica-pericial-engenharia/` | canais, `#contato-assistencia` | sim | index | triagem pré-litígio como unidade própria anterior; perícia do juízo é do perito |
| assistencia_trabalhista_sst | ANTES laço → sim | quesitos; análise de PGR/LTCAT/AET/laudos; crítica de laudo | — (prancha da rota SST) | `/seguranca-trabalho-apoio-tecnico/#assistencia-trabalhista` | `#contato-sst` | sim | dentro da rota indexável | bloco novo; assistência e hub apontam |
| organizar_sst | sim | diagnóstico + documentos nomeados | prancha PF | `/seguranca-trabalho-apoio-tecnico/` | `#contato-sst` | sim | index | redundância retirada |
| planejar_contratacao_publica | ANTES um parágrafo → sim | módulos que a proposta pode nomear (Lei 14.133/2021, fase preparatória) | — (pendência: exemplo demonstrativo do lado do ente) | `/servicos-obras-publicas/#situacao-orgao` | WhatsApp + formulário `#captura-contrato` (um canal de retorno) | página: sim | dentro da rota indexável | bloco aprofundado; home/hub/triagem apontam; formulário aceita WhatsApp ou e-mail |
| decidir_disputar_licitacao | sim | diagnóstico pré-licitação, auditoria de orçamento, sala de decisão | pranchas + `/casos/modelo-*` | `/diagnostico-pre-licitacao/`, `/auditoria-orcamento-licitacao/`, `/bid-room-licitacoes-obras/` | formulários no `<main>` | sim | index | bid-room: limite órgão × licitante; 'sala de decisão' definida |
| executar_proteger_contrato_publico | sim | dossiês por evento (preços publicados conforme autorização vigente) | `/casos/medicao-glosa-demonstrativo/`, `/casos/aditivo-art125-demonstrativo/` | oito pilares | formulários `#captura-pilar` | sim | index | aditivos liga o próprio caso; casos com ação no `<main>`; 'não promete' repetido retirado |
| outra_demanda_tecnica | sim (NEEDS_CONTEXT) | a resposta nomeia serviço, entrega e o que falta | — | `/triagem-tecnica/`, home `#contato` | canais + formulário da home | sim | index | Open Graph; li#obra-imovel nomeia as três situações novas |

Navegação: toda família alcança explicação + contato em ≤2 escolhas desde a home (`#situacoes`, `.area__sub` do bloco de obras públicas ganhou 'Órgão planejando a contratação') e desde `/servicos/`; necessidades combinadas seguem por `#descrever-situacao` → formulário geral com jornada preservada e pelo hub ('Na mesma proposta').

## Texto e SEO

Ver PR #713. Regra aplicada: 'Exemplo demonstrativo' uma vez por prancha/bloco; limites materiais mantidos; sem menção a uso ou não uso de IA (`test:ai-mention` 231 arquivos); GSC: o snapshot mais recente committado é 2026-09-02..08 (6 cliques/176 impressões) — desconhecido não é zero; leitura durável no host (as_of 2026-09-15) não está no repositório. Nenhum `robots` alterado; dois holds KEEP_NOINDEX (prazo-vigencia, aditivo-qualitativo) permanecem até o readout de 28 dias do canário chuva.

## Operação

- Formulários testados por censo estático (`evidence/descoberta-operacao-captura.json`): passo 1 = situação + nome + um canal + consentimento; opcionais reais; alternativa sem JS agora declarada em 16 formulários manuais (`<noscript>`), WhatsApp/e-mail adjacentes em todos; pendência: páginas de gerador (analise-cnpj, casos/modelo-*, entregas, servicos-obras-publicas, diagnostico-pre-licitacao, diagnostico-b2g-expansao) recebem a nota pelo gerador em ciclo próprio.
- Persistência → recibo → handoff → alerta → acesso do operador → timeout/retry/idempotência: cadeia verificada por leitura de código e testes existentes (`test:lead-function` 109 testes, `test:inbound-handoff`, `test_lead_stages`); sem mudança de transporte.
- **A06 — ação humana mínima (RECEBIMENTO_COMPROVADO):** uma pessoa, em navegador comum, executa `docs/campaigns/design-institucional/fechamento/evidence/producao/g03-qa-protocolo.md` §1 A→B→C (home `#contato`, pilar `#captura-pilar`, `/entregas/#captura-entregas`; ≥30 s entre envios; sem palavras de teste), confere os três e-mails 'Lead CONFENGE …' com DKIM e lê os registros no host (`ops` via ssh). QA sintético não prova passagem humana; clique não é recebimento.
- Origem: `origin_class` derivado no persist (campaign / search_organic apenas no host de busca / referral / direct_or_unknown), gravado no registro e na exportação; desconhecido não recebe crédito; handoff inalterado (campo canônico segue decisão Warmbly).
- Capacidade/margem: nenhum dado no repositório (ledger `NOT_STARTED`, margem `NOT_OBSERVED`, preço `FOUNDER_AUTHORIZED_EXPERIMENT`); nenhuma promessa publicada depende deles.

## Medição (#706)

`data/revops/proposal-counting.v1.json` (PROPOSTO; dono do indicador: Warmbly) + `scripts/revops/proposal_counting.mjs` + fixtures (a)–(j) + contraprovas (revisão somada, desconhecido creditado, alternativa mais cara automática — todas reprovam). Reconciliação: `closed-loop.cjs` hoje rejeita segunda proposta por oportunidade; revisão/alternativa/anual/cliente existente exigem aceite da Warmbly. Fixtures verdes não são observação de receita.

## Distribuição (#707)

`evidence/canais-externos-verificados.json`: três canais públicos nomeados com regras verificadas em 2026-09-19 (fetch e citação literal), mensagem-rascunho do artigo a escrever, estado PREPARADA_NAO_PUBLICADA, autorização PENDENTE (Governança/fundador), artigo NAO_ESCRITO, autor pessoa física a decidir. Nada enviado; nenhuma conta criada; prospecção continua identificada como tal. Janela de 14 dias começa só após distribuição efetiva.

## Publicação e verificação

- **Incremento 1:** release 35454169706 promovida (todas as etapas success); produção serve `b20d2b4d5` (`build-info` = `runtime-info`). Verificação pública 22/22 (`evidence/verificacao-publica-b20d2b4d5.txt`): regra `.situation-row.area--b2g` no CSS servido; fonte `b19be0f7` (42 208 bytes, 200); folha publicada sem `@import`; 16 rotas 200; padding medido em navegador 16/16 (320–430), 17,5 (699/700), 28 (1440), sem overflow, Archivo carregada. Predecessor saudável para reversão: `a27472bec`.
- **Incremento 2:** PR #713 → merge `83b63fc1f`; release 35461473231 promovida (todas as etapas success); produção serve `83b63fc1f`. Verificação pública 34/34 (`evidence/verificacao-publica-83b63fc1f.txt`): SHA, CSS, fonte, folha sem `@import`, 16 rotas 200, seis âncoras novas presentes, nota sem JS visível com JS desligado, formulário do checklist ligado ao runtime, links home/hub → âncoras, título do reequilíbrio. Predecessor saudável para reversão: `b20d2b4d5`.

## Pendências (nenhuma fecha issue)

1. A06: passagem humana (protocolo g03) — proprietário.
2. Rota própria para avaliação de imóveis: decisão do proprietário (família nova no registro + sitemap).
3. Nota sem JS nas páginas de gerador.
4. NBR 13752 só entra no público após registro no catálogo da oferta de assistência.
5. Contrato de contagem: aceite da Warmbly antes de mover o indicador oficial; campo canônico de origem.
6. Readout GSC ≥ 2026-09-08 para os holds KEEP_NOINDEX.

## Comunicação

GitHub: comentários em #705, #706, #707 e nas PRs #712/#713 com antes/depois, PR/SHA, testes, cobertura e pendências. Slack: nenhuma integração disponível neste ambiente (registrado; a ausência não é omissão). Estados separados em todo registro: publicação (SIM) ≠ recebimento comprovado (PENDENTE_OPERACIONAL) ≠ resultado comercial (AINDA_NAO_MEDIDO). Nenhuma issue fechada.
