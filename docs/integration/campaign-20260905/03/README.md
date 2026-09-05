# MV-03 — conversão, triagem e handoff

`CONFENGE_MV_CAMPAIGN=03`

## Decisão e hipótese

- Estado: `EXECUTE_NOW`.
- Frente executiva: Receita, Conversão e Confiança.
- Alavancas: receita, distribuição, automação e confiança.
- Tempo até evidência: imediato para barreiras sintéticas, contratos e receipts; conversão real somente depois da integração e publicação pela MV-09.
- North Star: oportunidades comerciais qualificadas, não quantidade de formulários enviados.
- Hipótese: um visitante frio inicia a triagem em menos de um minuto quando o primeiro passo pergunta apenas a situação e o segundo pede nome e um canal válido. A transparência do próximo estado reduz abandono e expectativa indevida.
- Repetição: cem submissões idênticas convergem por idempotência para um receipt; cem situações diferentes enriquecem a fila comercial por categoria. Não criam cem tarefas editoriais nem um segundo data plane.

## Isolamento e estado descoberto

- Repositório: `tjsasakifln/web-cfg`.
- Branch: `feat/mv-03-multivertical-conversion-intake-20260905`.
- Worktree: `.worktrees/web-cfg/mv-03-multivertical-conversion-intake-20260905`.
- `DISCOVERY_BASE_SHA`: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`.
- Durante a execução, `origin/main` avançou com a PR #604. A campanha foi rebaseada para `FINAL_BASE_SHA=470a5ffafeaf45a59649109742ce5885f9789328`, preservando o inventário runtime e a família pública já integrados.
- Produção observada em 2026-09-05: `https://confenge.com.br/` respondeu `200`, arquitetura `confenge-nginx-node/v2`; `/triagem-tecnica/` ainda respondeu `404`. Nenhum POST, merge, canário humano ou deploy foi executado.
- Issues donas: #580 e #532. #596 foi auditada como doadora; #604 deixou de ser somente doadora e entrou em `main` durante esta execução.

## Resultado do red team

O intake público passou a ter dois passos:

1. situação em vocabulário fechado, incluindo “Outra demanda técnica”;
2. nome, um único canal escolhido, organização opcional, localização somente nas situações em que uma possível vistoria a torna material e os dois consentimentos necessários.

Foram removidos da captura inicial classificação de papel decisório, urgência, estágio, disponibilidade documental, detalhes por núcleo e qualquer texto livre. Não existem inputs para CPF, número de processo, corpus, dados médicos, empregados, plantas, uploads ou partes em conflito.

“Outra demanda técnica” é admitida como `other_technical_need` e `NEEDS_CONTEXT`. Casos conhecidos sem triagem de conflito entram como `CONFLICT_CHECK_REQUIRED`; `HIT` e o alias legado `DECLINE` são recusados pela policy de Governance.

Antes do envio, a página informa o que será registrado, o receipt, a revisão posterior, a ausência de contratação/pagamento e o tratamento posterior de documentos sensíveis. Prazo, preço, campo e responsabilidade técnica só são definidos após enquadramento. Não há SLA inventado.

## Contratos e ownership

- web-cfg: captura, persistência, receipt, atribuição allowlisted e origem `CONFENGE_WEB`.
- Governance: `NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904`; implementação da PR #172 em `990c6ae237c3f7188728e97283bc69c130f6028d`, policy hash `sha256:405ac86064a90641b843352d21cd21703744115de9592558e100671d92276df7`.
- Warmbly: oportunidade, ação, outcome e readback. A PR #266, HEAD `38ec557b57bb61085282ce7d27bf2fee02e53484`, consome a mesma policy, aceita telefone/WhatsApp sem e-mail artificial e mantém a fila inbound-only.
- `extra-cli`: fatos, identidade e proveniência; nenhum crawler, DataLake ou modelo de identidade paralelo foi criado.
- Invariantes: `outbound_eligible=false`, `auto_send=false`, sem autorização SMTP, sem PII em analytics ou URL.

O runtime web continua fail-closed: fixtures podem injetar a policy em `NODE_ENV=test`; contextos publicados exigem autoridade final versionada e confirmação do mesmo SHA/hash no Warmbly. Enquanto isso, o formulário fica indisponível de modo transparente e WhatsApp, e-mail e telefone permanecem funcionais.

## Evidência de implementação

- Aceite dos seis núcleos, `NEEDS_CONTEXT`, localização condicional, rejeição de campos sensíveis, receipt sem PII, retry idempotente, conflito quando uma chave é reutilizada com outro material, compatibilidade B2G e ausência de notificação/SMTP são exercitados em `tests/intake/test_mv03_adaptive_intake.mjs`.
- O handoff assinado exige outcome explícito, logical id correspondente, receipt e invariantes inbound-only no POST e no readback HMAC do mesmo `logical_id`. Só então `ACCEPTED` é entregue ou `REJECTED_WITH_REASON` é bloqueado; resposta não correlacionada, readback divergente e outcome desconhecido são retryable.
- O lead preserva rota/família de triagem, asset canônico, asset/família de origem e campanha/UTMs allowlisted, inclusive após navegação interna. Analytics recebe apenas essas categorias, a necessidade, o canal e a indicação de localização material; nome, e-mail, telefone e organização não são enviados aos eventos.
- O carregamento da página não emite início/etapa de formulário. O browser vincula a chave de retry ao SHA-256 do payload e persiste somente digest/chave na sessão: o mesmo material conserva a chave após reload, e qualquer mudança recebe outra. O servidor também recusa com `409` colisões, registros adaptativos antigos sem digest e chaves pertencentes a outro tipo de registro.

## Rollback

1. Remover ou esvaziar `ADAPTIVE_INTAKE_NUCLEI` para bloquear todas as opções sem perder canais alternativos.
2. Reverter o snapshot de autoridade para `WITHHELD`; o endpoint de configuração volta a `503` e o submit permanece desabilitado.
3. Reverter a PR web preservando receipts já gravados e a compatibilidade B2G.
4. Não apagar receipts e não promover registros inbound para outbound durante rollback.

## ADR e gate

ADR afetada: ADR-STRAT-002, sem mudança de boundary. A implementação mantém CONFENGE como única superfície pública, Governance como policy owner e Warmbly como action/outcome owner.

O fragmento de integração obrigatório está em `integration-fragments.md`. A auditoria de promessas vigentes está em `sla-audit-fragment.md`.

## Qualidade local

Verdes:

- `npm run test:lead-function` (`LEAD_FUNCTION_OK`, 72 testes, mais intake e private-readiness);
- `npm run test:adaptive-intake` (15 testes MV-03);
- `npm run test:inbound-handoff` (26 testes);
- `npm run test:form-funnel`;
- `npm run test:analytics` e `npm run test:attribution`;
- `python3 scripts/site/inbound_gates.py`;
- `python3 scripts/site/test_public_plain_language.py`;
- `node --test runtime/test/inventory.test.mjs runtime/test/parity.test.mjs`;
- `npm run build:site`, incluindo paridade visível e auditoria do artefato público.

O gate `npm run test:cta-form-next-state` acusa apenas o censo 130 versus contrato 128 por causa dos dois canais alternativos obrigatórios; a correção owner está descrita no fragmento, sem editar arquivos fora do WRITE_SET. O smoke de navegador foi atualizado para o novo fluxo, mas não pôde ser executado localmente porque não havia Chrome e o download ambiental não concluiu; CI deve executá-lo com a dependência provisionada.
