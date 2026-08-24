# Decisão das 24 páginas de checkout em `/piloto/`

- Issue: [#251](https://github.com/tjsasakifln/web-cfg/issues/251)
- Decisão: **DEFER**
- Owner: **CONFENGE founder**
- Data: **2026-08-24**
- Revisão obrigatória: **2026-09-21**

Contrato versionado: `data/offers/piloto-checkout-decision.v1.json`

## Decisão e razão

As 24 páginas ficam preservadas, não indexadas e sem checkout de produção. Não há justificativa para `SUNSET` agora: o catálogo e o adaptador são ativos reversíveis ligados à validação da issue #88. Também não há evidência para `EXECUTE`: #88 segue em `VALIDATE`, os quatro mapeamentos do provedor estão vazios, todas as flags de dinheiro estão desligadas e ainda faltam autorização de canário e aprovações externas versionadas.

O estado, portanto, é `DEFER`. A revisão em 2026-09-21 não ativa nada automaticamente. Nessa data o owner deve publicar uma nova decisão `EXECUTE`, `DEFER` ou `SUNSET` apoiada em evidência.

## Gate mensurável de reabertura

Os quatro critérios abaixo são cumulativos:

1. #88 muda para `EXECUTE` em decisão versionada, nomeando uma oferta canário e teto de gasto.
2. O canal manual founder-led registra pelo menos uma oportunidade comercial qualificada disposta a comprar essa oferta nos termos aprovados. O contrato registra somente evidência agregada, nunca PII.
3. Aprovações legal, fiscal/NFS-e, capacidade de entrega e segurança têm quatro referências versionadas.
4. A oferta canário tem mapeamento de provedor preenchido e evidências verdes de sandbox, caminhos negativos e rollback.

Só uma revisão separada pode marcar cada critério como `PASS`, anexar um manifesto JSON local, versionado e preso por SHA-256, mudar o estado para `EXECUTE` e definir `activation_authorized: true`. O manifesto e o contrato devem repetir a oferta canário, um teto positivo de gasto e as quatro aprovações `legal`, `fiscal_nfse`, `delivery_capacity` e `security`, cada uma com `approver_id` distinto. Referência ausente, fora do repositório, não versionada, sintética, com hash divergente ou com aprovadores repetidos falha fechada. Variáveis de ambiente, isoladamente, não contornam a decisão: `scripts/offers/flags.cjs` força catálogo público, checkout, webhook e dinheiro real para `false`, e força `ASAAS_MODE=disabled` em produção enquanto a autorização não for válida. O sandbox isolado permanece disponível.

## Inventário, indexação e eventual sunset

O contrato enumera as 24 URLs e o gate exige correspondência exata com os 24 arquivos HTML. Cada página deve manter `noindex`; `robots.txt` deve manter `Disallow: /piloto/`; as páginas de oferta também mantêm `X-Robots-Tag: noindex,nofollow`. Nenhum URL de `/piloto/` pode entrar nos sitemaps.

Se a próxima revisão decidir `SUNSET`, ela precisa substituir `DEFER` por `MIGRATE`, `REDIRECT` ou `RETIRE` para cada uma das 24 URLs. Redirect exige destino específico coerente com o trabalho do visitante; redirecionamento geral para `/` é proibido.

## Evidência de pull request

- **Visitor job:** entender recortes de mercado e ofertas em pré-visualização, sem encontrar uma promessa de contratação que ainda não pode ser cumprida.
- **Hipótese de aquisição/conversão:** preservar o ativo até que uma oportunidade qualificada com intenção de compra e o canário aprovado demonstrem que checkout reduz atrito sem antecipar automação.
- **Data owner/contract:** CONFENGE é owner da decisão e superfície; catálogo usa `confenge.offer-catalog/1.0`; verdade de aquisição continua SELECT-only de `extra-cli`; ação comercial continua em Warmbly com `source=CONFENGE_WEB`.
- **North Star:** oportunidade comercial qualificada, não número de páginas, cliques, leads brutos ou checkouts criados.
- **Analytics:** nenhuma instrumentação nova durante `DEFER`; eventos futuros usam `CONFENGE_WEB`, agregados e com allowlist de PII vazia. Checkout, pagamento e receita continuam camadas distintas.
- **Quality gates:** `npm run test:checkout-negatives`, `npm run test:conversion`, `npm run test:asaas-production` e `node scripts/offers/piloto-decision.cjs`.
- **Rollback:** manter flags de catálogo, checkout, aplicação de webhook e dinheiro real em `false`; manter produção Asaas desabilitada; restaurar o último deploy conhecido. Se uma execução futura já tiver objetos reais, uma decisão de rollback separada, com evidência local/versionada e hash, pode autorizar somente o recebimento autenticado e persistência de eventos ligados a objetos ou referências já indexados no store. Eventos desconhecidos falham sem persistência; nada é aplicado, criado, cancelado, estornado ou enviado à NFS-e automaticamente.
- **ADR afetado:** nenhuma mudança de fronteira. A decisão reforça ADR-STRAT-002 e RUNTIME-AUTHORITY: CONFENGE segue como única superfície pública, sem runtime externo novo, sem segundo modelo de identidade e sem PII em analytics.
- **Repetição x100:** a automação só melhora o sistema depois de provar demanda, aprovações e uma operação canário; antes disso, repetir 100 checkouts cria risco e trabalho operacional, não alavancagem.

## Limitações conhecidas

O gate prova estado do repositório, existência e integridade das evidências versionadas e bloqueia ativação pelo loader de flags. Ele não substitui a validade material da aprovação humana, a configuração no painel Asaas/Netlify, a prontidão fiscal ou a capacidade operacional; esses itens devem existir no manifesto real antes de uma futura decisão `EXECUTE`.
