# Threat model — ingestão documental (CFG10X-19)

Estado: EXECUTE_NOW · decisão: **B** (solicitar canal seguro; o site não recebe arquivo).

## Runtime atual (provado no repositório)

| Controle exigido para opção A | Estado no runtime |
| --- | --- |
| Autenticação do upload (magic link / token curto vinculado ao lead) | Ausente |
| Allowlist MIME/extensão + validação server-side de arquivo | Ausente (intake é JSON/urlencoded, 24 KiB) |
| Limite de tamanho de arquivo | Só `MAX_BODY_BYTES = 24 KiB` de JSON; não há storage de blob |
| Nome aleatório / storage fora do webroot | Ausente — `lead-store` persiste registro JSON, não objeto |
| Criptografia em repouso específica do arquivo | Ausente |
| Malware scanning / quarentena | Ausente |
| Checksum, download autorizado, expiry e purge de arquivo | Ausente |
| Auditoria de acesso a arquivo | Ausente |

Conclusão: **nenhum** controle da opção A está inteiro no runtime. Improvisar upload violaria o contrato fail-closed. A opção B é a única honesta sem credencial externa nova.

## Superfície congelada (não editar HTML)

Pilares BOFU + `script.js` hash-frozen até `EARLIEST_SAFE_ACTION_AT` = 2026-09-16 (`scripts/bofu_dominance/frozen_specs/constants.py`):

- `aditivos-obras-publicas/index.html`
- `medicoes-glosas-obras-publicas/index.html`
- `reequilibrio-obras-publicas/index.html`
- `auditoria-orcamento-licitacao/index.html`
- `diagnostico-b2g-360/index.html`
- `diagnostico-pre-licitacao/index.html`
- `script.js` (e CSS/robots/sitemaps listados no mesmo freeze)

Inventário: esses pilares **não** carregavam a CTA mentirosa “Enviar documentos/edital…”. O JS montado serializa `FormData` em JSON de strings e não cria `input type=file`. Conflito freeze-vs-honestidade nos pilares BOFU: **não materializado**.

Hash-bound extra:
- Issue #389 canário de medição: três irmãos de `/conteudos/atraso-na-medicao-obra-publica/` ainda dizem “Envie o edital/planilha” ou “Enviar documentos para análise”.
- Páginas HUMAN_APPROVED (guias, lei 14.133, súmula 260): `cta_email_body` entra no `material_hash`; reescrever invalidaria a aprovação humana.

Nenhum desses paths tem `input type=file`. O gate `test_document_intake_honesty.py` lista os paths exatos e falha se a exceção ficar obsoleta. Reabertura exige nova medição (#389) ou nova aprovação editorial.

## Opção B entregue

1. CTA visitante: `Solicitar canal seguro para envio`.
2. Formulário texto-only + checkbox/hidden `document_intent=secure_channel_request` e `canal_seguro`.
3. Handler real (`netlify/functions/lead.cjs` + `lead-core.cjs`) rejeita multipart, oversize, MIME spoof, bytes EICAR/binários e chaves de arquivo **antes** de persistir.
4. Recibo HTML com protocolo persistido e SLA “canal escolhido posteriormente”.
5. WhatsApp/mailto/query/analytics nunca carregam arquivo nem afirmam que um upload ocorreu.
6. Privacidade/termos descrevem o registro da *solicitação* (protocolo, finalidade, retenção 730 dias, quem acessa, como excluir) — não um cofre de arquivos.

## O que o registro persiste

Campos string do lead (nome, canal de retorno, estágio, mensagem, atribuição) + `document_intent` token + `canal_seguro` boolean. Zero bytes de documento. Exportação/exclusão do titular opera sobre esse registro JSON.

## Rollback

Reverter o PR. Nenhuma migração de blob: nada foi armazenado como arquivo.
