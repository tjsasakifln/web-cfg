# CONFENGE-POS-REDESIGN-FECHAMENTO-20260918 — registro canônico

Estado: **PUBLICADO_E_VERIFICADO_COM_DEPENDENCIAS_IDENTIFICADAS** (2026-09-18). Matriz completa em `matriz.json`; evidência bruta em `evidence/` (diagnóstico, implementação, correções pós-revisão, baseline, candidata, produção).

Aceite técnico-operacional: **atendido** na release `4cfa6adca` (PR #701, run netcup-release 35382722937). Validação comercial/humana: **não concedida** — nada foi observado com pessoas, oportunidades ou dados reais.

## Cadeia da release
PR #701 (head `d310ff8ae`) → merge em `main` `4cfa6adca` (merge commit, 18:52:38Z) → pacote atestado `88ac5f34…` / `public_artifact_hash 004d3534…` → promovido 19:39:03Z (predecessor `252fc98d1`) → servido: `/.well-known/build-info.json` = `/.well-known/runtime-info.json` = `4cfa6adca`; 29/29 rotas prioritárias byte-idênticas ao pacote pelo caminho normal do visitante; 73/73 assets; robots/sitemaps/redirects/404 conferidos (`evidence/producao/public-verification-4cfa6adca.json`). Rollback: `docs/ops/ROLLBACK.md` para `252fc98d1`; DNS: apagar o registro Cloudflare `6d371d6a28364c17cdbde2f676e58872`.

## O que melhorou para o visitante (medido, produção 252fc98d1 × 4cfa6adca, mesma ferramenta v2)
- Home (390×844): abertura compreensível sem a prancha (parágrafo do exemplo demonstrativo reescrito), ação principal inteira na dobra (614–658 px), altura 16 572 → 16 099 px, três faixas de contato → duas.
- /servicos/: 16 071 → 14 881 px, primeiro contato real 731 → 479 px; contato no topo do bloco de avaliação; condições da linha 06 em `details` acessível.
- /quantitativos-orcamento-obras/: 20 426 → 17 940 px (−2 478 caracteres); o exemplo da prancha P1 explicado uma vez; após a âncora `#triagem-quantitativos` o WhatsApp fica a 381 px do topo (antes 1 037, fora da tela).
- /compatibilizacao-projetos-engenharia/: 15 580 → 13 615 px; limite de autoria dito uma vez; nota demonstrativa uma vez com link profundo.
- /entregas/: 24 142 → 23 595 px; abertura e captura sem repetição; kicker "Oferta publicada" removido dos oito cartões.
- /triagem-tecnica/: ressalva de documentos uma vez; item próprio de quantitativos.
- Artigos (107 não congelados): "Continuar pelo formulário" vai ao formulário do pilar/serviço com contexto (landing_url, tema, referrer), não à home; WhatsApp em frase natural.
- Desempenho na borda (5×, pareado): home perf 99 (98), LCP 1 861 ms (1 937), TBT 0 (104); /servicos/ e /quantitativos/ dentro da faixa da baseline — sem regressão material.

## O que foi corrigido na operação
- **Recebimento (G03)**: o domínio `confenge.com.br` estava `failed` no Resend (DKIM ausente); nenhum e-mail de lead real jamais tinha saído. DKIM criado e domínio `verified` (13:14Z). No runtime: provider_id do Resend persistido, prazos cobrindo corpo e siteverify, replay idempotente seguro, reset do Turnstile após timeout; rotina mínima e consulta por lead_id em `docs/ops/LEAD-HANDLING.md`.
- **Mensuração (G04)**: `cta_click` com `destination_type`; navegação separada de intenção no closed-loop e no analytics-agg; âncoras/header emitem; classe D (handoff) derivada do store; gate `test:event-semantics` no CI e no scorecard; verificado na borda (18/19, 0 PII).
- **GSC (G05)**: scorecard lê a fonte durável na release — `GSC_DURABLE_READ status=CURRENT as_of=2026-09-15`; `gsc-freshness MEASURED_PASS age_days 3`; scorecard `10/10`, 14/14 dimensões.
- **Desempenho (G06)**: causa identificada (LCP é texto; `@import` serializado ≈ ruído); nenhuma otimização alegada; orçamento de bytes preservado com minificação das cópias públicas de `assets/js`.

## O que está comprovado / o que não está
Comprovado: publicação e identidade; rotas e assets; semântica de eventos; GSC atualizado pela fonte; desempenho sem regressão; prontidão operacional (Resend verified, runtime ativo, Warmbly ok). **Não comprovado**: chegada de e-mail de lead real na caixa e item na fila a partir de um envio normal — o navegador automatizado foi recusado pelo Turnstile (erro 600010, `evidence/producao/g03-qa-tentativa-automacao.json`); nenhuma validação antiabuso foi falsificada. Também não comprovado: leitor de tela real, Safari/iPhone físico, compreensão por compradores, prova real de cliente.

## Ações humanas mínimas
Ver `matriz.json → acoes_humanas_minimas` (5 itens; a primeira fecha G03 pelo `evidence/producao/g03-qa-protocolo.md`).

## Evidência observada aponta para a release `4cfa6adca`
Este registro é publicado por PR de documentação; a release que ele gera muda apenas a identidade (`commit`), não as rotas públicas (mesma prática da #700). Não há novo ciclo de evidência.
