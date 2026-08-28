# Kit de coleta da primeira prova autorizada

Pacote operacional, não página pública. Estes modelos preparam a primeira
autorização real de um titular. Nenhum deles é case de cliente, review,
logo ou resultado publicado.

Enquanto `data/commercial/real-proof-registry.v1.json` permanecer
`BLOCKED_EXTERNAL` e `data/site/permissioned-proof-registry.json`
`NO_APPROVED_CLIENT_PROOF`, o site publica zero prova de cliente.

## Conteúdo

1. [questionario.md](questionario.md) — o que perguntar antes de redigir.
2. [autorizacao.md](autorizacao.md) — recibo de autorização de publicação.
3. [redaction-checklist.md](redaction-checklist.md) — o que omitir.
4. [case-template.md](case-template.md) — rascunho anonimizável.

## Regras

- Consentimento de contato comercial não vale como autorização de prova.
- Recibos, PII e material bruto ficam em estoque privado (`private://`).
- O registro público só aceita hashes, referências opacas e campos do
  schema versionado: fonte, autorização, escopo permitido, anonimização,
  baseline, intervenção, resultado observável, limitações, revisor e
  expiração.
- Sem autorização ativa, sem fonte ou com autorização vencida, o gate
  reprova. Não preencher com sintético.
