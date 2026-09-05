# Fragmentos para a integração MV-09

Estas alterações são necessárias para publicação, mas ficam fora do WRITE_SET da MV-03. Aplicar somente depois de integrar as dependências Governance e Warmbly e repetir todos os gates.

## 1. Snapshot e pin runtime

Arquivo owner: `netlify/functions/data/adaptive-intake-authority.json`.

Manter `WITHHELD` até que as PRs de Governance e Warmbly estejam merged e o runtime Warmbly esteja publicado. Depois, substituir pelo snapshot `FINAL` usando:

- o SHA real de `Governance/origin/main` após o merge, não o HEAD transitório da PR;
- policy id `NET_NEW_INBOUND_HANDRAISER`;
- version `1.0.0-draft.20260904`;
- canonical name `NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904`;
- policy hash `sha256:405ac86064a90641b843352d21cd21703744115de9592558e100671d92276df7`, somente se o conteúdo merged mantiver esse hash;
- intake version `CONFENGE_WEB_INTAKE/2.1.0-mv03.20260905`;
- source asset `technical_triage_v1`;
- offer candidate `technical_triage_review`;
- `outbound_eligible=false` e `auto_send=false`.

Configuração não secreta esperada:

```text
ADAPTIVE_INTAKE_NUCLEI=expert_evidence_assistance,property_valuation,building_engineering_documentation,occupational_safety,public_works_b2g,other_technical_need
WARMBLY_GOVERNANCE_FINAL_SHA=<sha real do main de Governance após merge>
WARMBLY_GOVERNANCE_FINAL_POLICY_HASH=sha256:405ac86064a90641b843352d21cd21703744115de9592558e100671d92276df7
ADAPTIVE_INTAKE_PIN_JSON=<JSON exatamente igual ao objeto pin do snapshot FINAL>
```

Não criar secret. Preservar as configurações existentes de `CONFENGE_INBOUND_WEBHOOK_URL` e `CONFENGE_INBOUND_WEBHOOK_SECRET`, administradas pelo owner do runtime.

## 2. Inventário de CTA

Arquivos owner:

- `data/commercial/cta-form-next-state.v1.json`;
- `docs/commercial/cta-form-next-state-inventory.json`.

A página agora mantém dois caminhos reais paralelos ao formulário: WhatsApp e e-mail. O censo derivado cresce de 128 para 130 CTAs declaradas. Atualizar `coverage.expected_declared_ctas` para `130` e regenerar o inventário com o script canônico. O telefone continua presente, mas não entra no censo atual de WhatsApp/e-mail.

Não remover esses canais para satisfazer o contador: eles são o fallback obrigatório quando a autoridade externa ou o POST estiverem indisponíveis.

## 3. Ordem de ativação

1. Integrar e verificar Governance PR #172; registrar SHA/hash finais.
2. Integrar e publicar a PR Warmbly MV-03; provar readback, idempotência, rejeição segura, WhatsApp-only e ausência de SMTP.
3. Integrar a PR web MV-03 e os dois fragmentos acima.
4. Rodar `npm run inbound:gates`, testes de runtime, intake, handoff, analytics e CTA.
5. Publicar somente pela MV-09.
6. Fazer canário sintético; nunca usar dados de terceiro.

Se qualquer pin, receipt ou invariant divergir, manter `WITHHELD` e os canais alternativos ativos.
