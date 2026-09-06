# Fragmento de integração — readback público Warmbly MV-03

Owner: `tjsasakifln/warmbly`  
Origem: `CONFENGE_MV_CAMPAIGN=09`  
Decisão: `EXECUTE_NOW` para o owner Warmbly; `WITHHELD` no produtor web até a prova pública.

## Defeito comprovado

O runtime Warmbly em produção está no merge SHA
`fafa8bda803c5245368dc4261fe8eb223c5c4dba` e o backend expõe a rota
autenticada:

`GET /api/v1/webhooks/confenge/inbound/handraisers/:logicalId`

O Nginx versionado e o vhost instalado allowlistam apenas o health e o POST
inbound. Por isso, o mesmo readback HMAC retorna `200` no loopback
`127.0.0.1:8080` e `404` em `https://api.confenge.com.br`.

## Delta esperado do owner

- adicionar uma location restrita para o prefixo exato
  `/api/v1/webhooks/confenge/inbound/handraisers/`;
- permitir somente `GET` e negar query string;
- reaproveitar o snippet de proxy que não registra body, assinatura ou query;
- manter rate limit, TLS, host allowlist e o default `404` para todo o restante;
- ampliar `test_vps_pack.py`, `validate.sh`, documentação e monitor sem expor
  segredo ou PII;
- instalar a configuração pelo script canônico, rodar `nginx -t`, recarregar e
  provar readback público aceito e rejeitado no mesmo SHA.

Não aplicar patch manual de Nginx fora de uma revisão Warmbly. Até esse delta
ser mergeado e instalado, o web-cfg mantém a configuração adaptativa em `503`,
o botão de submit desativado e os canais diretos funcionais.

## Evidência MV-09

Os canários sintéticos de `2026-09-06` provaram:

- POST público aceito: `201`, `ACCEPTED`, `CONFLICT_CHECK_REQUIRED`;
- POST público rejeitado: `201`, `REJECTED_WITH_REASON`, `consent_missing`;
- ambos com `outbound_eligible=false`, `auto_send=false`,
  `smtp_authorized=false`, `followup_authorized=false` e
  `dispatch_attempted=false`;
- readback HMAC loopback: `200` para ambos;
- readback HMAC público: `404` para ambos.

A evidência sanitizada está em
`evidence/warmbly-adaptive-consumer-live-proof.json`. Nenhum contato real ou
oportunidade comercial foi criado.
