# Decisão das 24 páginas de checkout em `/piloto/`

- Issue: [#251](https://github.com/tjsasakifln/web-cfg/issues/251)
- Decisão: **DEFER**
- Owner: **tiago-jun-sasaki**
- Data: **2026-08-24**
- Revisão obrigatória: **2026-09-20**

Contrato versionado: `data/offers/piloto-checkout-decision.v1.json`

## Decisão e razão

As 24 páginas ficam preservadas, não indexadas e sem checkout de produção. Não há justificativa para `SUNSET` agora: o catálogo e o adaptador são ativos reversíveis ligados à validação da issue #88. Também não há evidência para `EXECUTE`: #88 segue em `VALIDATE`, os quatro mapeamentos do provedor estão vazios, todas as flags de dinheiro estão desligadas e ainda faltam autorização de canário e aprovações externas versionadas.

O estado, portanto, é `DEFER`. A revisão em 2026-09-20 não ativa nada automaticamente. Nessa data o owner deve publicar uma nova decisão `EXECUTE`, `DEFER` ou `SUNSET` apoiada em evidência.

## Gate mensurável de reabertura

Os quatro critérios abaixo são cumulativos:

1. #88 muda para `EXECUTE` em decisão versionada, nomeando uma oferta canário e teto de gasto.
2. O canal manual founder-led registra pelo menos uma oportunidade comercial qualificada disposta a comprar essa oferta nos termos aprovados. O contrato registra somente evidência agregada, nunca PII.
3. Aprovações legal, fiscal/NFS-e, capacidade de entrega e segurança têm quatro referências versionadas.
4. A oferta canário tem mapeamento de provedor preenchido e evidências verdes de sandbox, caminhos negativos e rollback.

Mesmo com os quatro critérios marcados como `PASS`, este contrato `1.0` não autoriza produção. `productionAuthorized()` permanece invariavelmente falso. Uma decisão posterior de `EXECUTE` exige outro schema e outro PR, com `production_evidence: true` obrigatório, oferta canário, teto cumulativo durável e autorização individual para cada cobrança, estorno e cancelamento, conforme #88. O gate precisa reservar o limite de forma atômica antes de qualquer mutação externa e tratar retry idempotente; não basta somar flags ou anexar um manifesto. Variáveis de ambiente, isoladamente, não contornam `DEFER`: `scripts/offers/flags.cjs` força catálogo público, checkout, webhook e dinheiro real para `false`, e força `ASAAS_MODE=disabled` em produção. O sandbox isolado permanece disponível.

O schema `1.0` é fechado ao estado atual: owner nomeado, calendário de 28 dias
inclusivos, lista e ordem exatas das 24 URLs, quatro critérios `WAITING` sem
evidência, analytics sem PII e referências da decisão. Campos extras, `PASS`
decorativo, data impossível, revisão depois de 2026-09-20 ou edição para
`EXECUTE` falham. Uma nova decisão precisa de schema/revisão próprios; não se
obtém autoridade editando este JSON.

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
- **Rollback:** manter flags de catálogo, checkout, webhook e dinheiro real em `false`; manter produção Asaas desabilitada e restaurar o último deploy conhecido. Este PR não cria um modo receive-only. Se uma execução futura produzir objetos reais, o PR de ativação também deve entregar rollback que persista antes do `2xx` um evento normalizado, redigido e recuperável somente para objetos conhecidos, sem aplicar estado, mutar o provedor ou incluir PII.
- **ADR afetado:** nenhuma mudança de fronteira. A decisão reforça ADR-STRAT-002 e RUNTIME-AUTHORITY: CONFENGE segue como única superfície pública, sem runtime externo novo, sem segundo modelo de identidade e sem PII em analytics.
- **Repetição x100:** a automação só melhora o sistema depois de provar demanda, aprovações e uma operação canário; antes disso, repetir 100 checkouts cria risco e trabalho operacional, não alavancagem.

## Limitações conhecidas

O gate prova o estado `DEFER`, o inventário das 24 páginas e o bloqueio por ambiente. Ele deliberadamente não tenta provar nem ativar uma futura execução. Validade material das aprovações humanas, limite durável, autorização por cobrança, configuração Asaas/Netlify, prontidão fiscal, capacidade operacional e rollback recuperável pertencem ao futuro PR de `EXECUTE`. As referências de issue/comentário são prova de decisão revisável, não assinatura criptográfica do founder; a aprovação do PR continua sendo o controle humano.
