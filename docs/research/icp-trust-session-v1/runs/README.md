# Execuções

Nenhuma sessão foi executada neste pacote inicial.

Uma execução futura usa `YYYY-MM-DD-NN/aggregate.json` e
`YYYY-MM-DD-NN/interpretation.md`. O primeiro contém apenas contagens agregadas;
o segundo contém a leitura separada. Contato, triagem, consentimento, nota
individual, citação livre e gravação nunca entram nesta árvore.

O gate rejeita uma execução com menos de cinco conclusões que tente publicar
métricas ou resultado. Até existir execução válida, `STATE.json` permanece
`BLOCKED_HUMAN_PARTICIPANTS` e `AMOSTRA_INSUFICIENTE`.
