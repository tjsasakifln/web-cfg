# Procedimento de prova Netcup — para a campanha 10

A campanha 01 implementa e prepara o teste. Não publica e não envia lead no domínio real. A 10 é o único executor de mutações de prova em produção, de forma serializada.

Mecanismo existente (não reinventar):

- `node scripts/site/synthetic_lead_probe.mjs https://confenge.com.br`
- `node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br`
- Gate desta campanha: `node scripts/campaigns/pos-inb-20260911/01/netcup_proof_gate.mjs`

## Ordem obrigatória

1. Consultar configuração sanitizada, somente leitura.
   `GET https://confenge.com.br/.netlify/functions/ops?action=inbound_handoff`
   Autenticação: header Bearer do token de ops. Nunca imprimir o valor.
   A resposta expõe `SET|UNSET`, fingerprint `WARMBLY_PRODUCTION_V1|UNEXPECTED|MISSING` e `safety_gate`. Nunca a URL, o segredo ou payload pessoal.
2. Pré-condições, todas obrigatórias antes de qualquer POST:
   - identidade de teste isolada (`LEAD_PROBE_SECRET` no servidor, 32+ caracteres);
   - `safety_gate.ok === true`;
   - `safety_gate.contract === READY`;
   - `safety_gate.auto_send_off === true`;
   - `safety_gate.dispatch_attempted === false`;
   - totais comerciais (`funnel` / `weekly_report` com `commercial_only=true`) lidos antes, para prova de exclusão depois.
3. Se qualquer pré-condição falhar: `BLOCKED_BEFORE_POST`. Não envie. Não fabrique INBOUND NOW.
4. Só a 10, serializado, pode executar o POST sintético autenticado (`X-Confenge-Probe`). O browser não se autodeclara `synthetic` para escapar de controles.
5. Replay da mesma `Idempotency-Key` deve devolver o mesmo `lead_id` sem segunda oportunidade comercial.
6. Conferir exclusão dos totais comerciais (mesmos agregados, `commercial_only=true`).
7. `OPERATOR_AVAILABILITY` é evidência independente de leitura humana. HTTP 201 não prova atendimento. Se o sistema não expõe essa confirmação, declare `NOT_VERIFIED`.

## O que esta campanha não faz

- Não define `POS_INB_01_ALLOW_PROD_POST`.
- Não envia `OPS_TOKEN` para log, repositório ou artefato público.
- Não coleta e-mail/telefone de lead para o git.
- Não afirma `FULL_CONVERSION_VERIFIED` nem `LIVE_TRANSPORT=PASS` a partir de evidência local.

## Diferença entre o teste local e a operação real

| Camada | Local (01) | Netcup (10) |
|---|---|---|
| Persistência | `LEAD_STORE_DIR` isolado, mode 0700, fora do release | store host-owned do runtime Netcup |
| Origem HTTP | `https://confenge.com.br` no header do handler, ou loopback allowlist | origem real do visitante |
| Outbound | env de webhook/e-mail/inbound desligado | EnvironmentFile de produção |
| Prova sintética | gate recusa POST | 10 consulta read-only e só então, se as pré-condições passarem, executa o probe autenticado |
| Atendimento humano | não observável | só com evidência operacional independente |

Comando de consulta local do gate (zero POST):

```text
node scripts/campaigns/pos-inb-20260911/01/netcup_proof_gate.mjs
```
