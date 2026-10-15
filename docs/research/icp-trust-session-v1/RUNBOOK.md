# Runbook da sessao

Este runbook serve a pesquisa humana unica #336. Nao executar uma segunda
amostra de cinco pessoas.

## 1. Congelar e preparar

1. Rodar `npm run test:trust-session-protocol` e
   `npm run test:market-fit-protocol`.
2. Registrar o SHA exato e a URL canonica/deploy preview do mesmo SHA.
3. Copiar os templates para `runs/YYYY-MM-DD-NN/`.
4. Usar o roteiro de `docs/research/market-fit-v1/TASK-SCRIPT.md`.

## 2. Recrutar e consentir

Executar `RECRUITMENT.md` e `CONSENT-RETENTION.md`. Esta campanha nao recruta.
O moderador so inicia depois do “sim” explicito.

## 3. Executar

Uma conclusao exige o roteiro unico de 12 tarefas e os instrumentos absorvidos
de #183 e #184. O moderador nao corrige e nao revela criterio. Sem audio,
video ou transcricao. Registrar `REPEAT | CHANGE | STOP`.

## 4. Agregar sem PII

Somente apos vinte conclusoes elegiveis e consentidas:

1. preencher contagens inteiras no `aggregate.json`;
2. atestar que os consentimentos privados foram verificados;
3. calcular aprovacao/reprovacao pelo criterio de pelo menos 80% em contagens
   inteiras (16/20 na amostra minima), sem arredondamento;
4. manter #184 aberto para CTR/scroll, que nao e WTP;
5. rodar o gate;
6. preencher `interpretation.md` a partir do agregado ja validado.

Se houver de zero a dezenove conclusoes, `status` permanece
`AMOSTRA_INSUFICIENTE`.

## 5. Atualizar issues sem falsear fechamento

Nao fechar #336, #183 ou #184 por palavra-chave de PR. Nao abrir segunda
issue de pesquisa.

## 6. Retencao e rollback

Agendar os descartes privados no momento da coleta.
