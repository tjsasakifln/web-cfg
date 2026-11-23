# Instrucoes para campanhas 08, 10 e 99

Campanha 13 e dona do contrato semantico de mensuracao e do protocolo humano
unico. Nao implementa captura, home, form, emitter ou dashboard.

## 08 — captura adaptativa

- Consumir `data/measurement/multivertical-event-metric-contract.v1.json`.
- Admitir somente dimensoes fechadas. Recusar a deny-list da privacy matrix.
- Nao emitir QCO, proposta, ganho/perda ou receita no client, collect ou
  confengeTrack. Esses eventos sao `observed_only` do Warmbly.
- `qualification_state=QCO` no client e proibido.
- Source permanece `CONFENGE_WEB`. `outbound_eligible=false`, `auto_send=false`.
- Fragmento: `docs/integration/campaign-20260904/13/08-event-registry-dimensions.md`.

## 10 — casca corporativa dos cinco nucleos

- Fornecer estimulos de nucleo (home, hubs, primeira acao) para as tarefas
  choose_nucleus, find_first_action e identify_b2g_without_feeling_removed.
- Nao inventar URL neste pacote. Destinos B2G existentes permanecem para o
  teste de arvore absorvido.
- B2G nao pode parecer removido.
- Fragmento: `docs/integration/campaign-20260904/13/10-corporate-shell-stimuli.md`.

## 99 — integracao

- Ratificar ou migrar os IDs draft `*-draft.20260904`. Versao/hash ausente ou
  divergente deve falhar fechada. Nao usar estes IDs como fallback de producao.
- Nao mergeiar esta PR automaticamente. Integracao pertence aos goals 97-99.
- Fragmento: `docs/integration/campaign-20260904/13/99-integration.md`.

## 01 / 97 — ADR e taxonomia

- ADR-STRAT-002 e MARKET-CAPTURE-OS ainda descrevem B2G exclusivo em
  `origin/main`. Nao editar esses arquivos aqui.
- Fragmento: `docs/integration/campaign-20260904/13/01-adr-fragment.md`.
