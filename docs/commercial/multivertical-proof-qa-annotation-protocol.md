# Protocolo de anotação humana — proof QA multi-vertical

`CAMPAIGN_ID=12` · contrato `CFG-PROOF-ROLE-2026-09-04-v2` · classificador `CFG-MULTIVERTICAL-PROOF-QA-2.0.0`

## Estado atual

`AWAITING_HUMAN_ANNOTATION`

Não existe neste repositório um corpus previamente anotado por pessoa identificada e consentida. As fixtures em `data/commercial/proof-qa-fixtures.v2.json` exercitam o contrato. **Não são anotação humana.** Agente ou LLM não pode rotular a própria classificação como revisão humana.

Enquanto este estado permanecer:

- o classificador é `SHADOW_REPORT`;
- `ci_blocking` permanece `false`;
- a decisão de ratchet é `ITERATE`;
- enforcement, threshold universal e CI bloqueante estão proibidos.

## Quem pode anotar

Pessoa identificada (nome, papel editorial/comercial/compliance) com consentimento registrado fora do repositório público se o material for sensível. Ato de bot, agente, CI ou “auto-label” é `FORBIDDEN`.

## Amostra

Estratificar por:

1. núcleo (`pericia_assistencia`, `avaliacao`, `edificacoes_bim_orcamento`, `sst`, `b2g`);
2. perfil (`commercial`, `public_data`, `trust_legal`);
3. etiqueta (`value_outcome`, `mechanism`, `artifact`, `proof`, `action`, `limitation`, `hype`, `orphan_claim`, `proof_mismatch`, `caveat_removed`, `defensive_repetition`).

Cada célula precisa de pelo menos um positivo, um negativo e um UNKNOWN quando o papel existir.

## Procedimento

1. Rodar `node scripts/commercial/multivertical_proof_qa.mjs --fixtures-only` no SHA commitado.
2. Anotar o papel primário e os papéis secundários de cada bloco sem ver o score como meta.
3. Registrar falso positivo e falso negativo na matriz de erros do contrato.
4. Confirmar que benefício com “sem” não foi punido e que hype não somou valor.
5. Confirmar que remover caveat obrigatório falhou no gate de verdade independente.
6. Só então uma decisão humana posterior pode escolher `ADOPT_RATCHET`, `ITERATE` ou `REJECT`.

## O que a anotação não autoriza

- inventar case, logo, review ou outcome de cliente;
- publicar credencial (#581) ou desbloquear `NO_APPROVED_CLIENT_PROOF` (#328);
- tratar contagem de palavras como gate de persuasão;
- esconder limite material para “melhorar” o relatório.
