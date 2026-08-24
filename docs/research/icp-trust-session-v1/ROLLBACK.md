# Rollback

## Trigger

Reverter o pacote se o instrumento tiver pergunta indutiva, estímulo não
vinculado a SHA, exposição diferente de cinco segundos, coaching, critério
alterado depois da resposta, PII no repositório ou resultado calculado com menos
de cinco conclusões.

## Procedimento

1. Marcar qualquer leitura afetada como `INVALIDATED_PROTOCOL_BREACH`; manter as
   issues abertas.
2. Remover do git o artefato com PII e tratar o histórico segundo o procedimento
   de incidente, sem republicar o conteúdo na correção.
3. Corrigir e versionar o protocolo como nova versão antes de novo recrutamento.
4. Não reaproveitar resposta coletada sob instrumento materialmente diferente.
5. Reverter a mudança de código com `git revert <sha>` se o pacote em si precisar
   sair; não há URL pública, canonical, robots, runtime ou CTA para desfazer.

Rollback nunca restaura contato, consentimento ou nota apagada por retirada ou
retenção. Dados privados seguem DSAR independentemente do estado do código.
