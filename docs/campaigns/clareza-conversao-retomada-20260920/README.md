# CONFENGE clareza e conversão, retomada de 2026-09-20

## Estado recuperado

- Base de trabalho: `origin/main` em `d376234cf93ed92bb39141eda2ccb287d3cdbf52`.
- Produção antes desta retomada: `build-info.commit` e `runtime-info.release_sha` iguais a essa base.
- HTML exato da home, sem bypass de cache: quatro leituras consecutivas em `HIT`, ainda com `/script.js?v=fortune04`.
- PRs 712 a 716 e issues 705 a 707 são histórico. Não foram usados como prova do estado atual.
- Distribuição externa: preparada e não publicada. A janela de 14 dias não começou.
- G03: envio real continua reservado à passagem humana controlada do proprietário.

## Escopo desta continuação

1. Vincular cada HTML publicado ao conteúdo exato de `/script.js`.
2. Recusar no servidor a reutilização de uma chave de idempotência com conteúdo material diferente.
3. Exportar o contexto preparatório do ente público.
4. Reduzir a latência máxima esperada do drain de 24 horas para aproximadamente 60 minutos, sujeita ao atraso do agendador do GitHub.
5. Separar avaliação de imóvel de perícias e disputas no rodapé.
6. Atualizar a leitura GSC pelo produtor autenticado, sem transformar ausência de dado em zero.
7. Integrar por PR, publicar pelo release Netcup protegido e verificar SHA, cache e jornadas reais.

## Medição GSC de 2026-09-20

- O produtor autenticado concluiu a consulta ao Search Analytics às `2026-09-20T22:44:56Z`.
- Período observado: `2026-08-21` a `2026-09-17`, com 28 datas observadas, nenhuma lacuna e 43 linhas retornadas.
- A fonte foi classificada como `CURRENT` e `READY`, com `as_of=2026-09-17`. A API pode retornar apenas as linhas superiores, portanto 43 não representa o universo da propriedade.
- O snapshot repetiu o manifesto `8592bbf8aa8b9024b0e02eb2e757528752d31d3050db7102b47062640143cf91`. A persistência foi interrompida antes de qualquer escrita porque o publicador exigia uma nova observação histórica para um evento `SNAPSHOT_REPEATED`.
- A correção preserva a validação por manifesto, data, última tentativa e instante, mas aceita que uma repetição reutilize a observação histórica já existente. O teste de regressão também recusa uma última tentativa com instante divergente.

## Autoridade comercial Warmbly

- PR de integração: `tjsasakifln/warmbly#273`.
- `web_origin_class` cruza como evidência de aquisição e não como origem comercial canônica.
- O read model Warmbly substitui revisões, exige uma única alternativa canônica por grupo, classifica ausência como `mixed_or_unknown` e mantém emissão, aceite e receita recebida separados.
- O contrato oficial de indicador continua fechado enquanto não houver produtor real aprovado. A mudança estabelece a semântica; não inventa observações nem promove fixtures.

## Gates e rollback

- Gates focais: testes do build pSEO, IA pública, função de lead, privacidade e agendamento.
- Gates integrais: build do site, suíte requerida pelo repositório e checks protegidos do PR.
- Rollback público: promover o bundle Netcup verificado imediatamente anterior pelo fluxo versionado de release.
- O fingerprint é aplicado somente no artefato `_site`; fontes HTML permanecem legíveis e reversíveis.

## Bloqueios externos preservados

- G03 exige interação humana real no navegador e não será substituído por automação.
- Resultado comercial depende da autoridade Warmbly e de observações reais. `UNKNOWN` não será promovido a inbound, proposta aceita ou receita.
- Distribuição do ativo existente depende de autorização posterior. Nenhum canal externo será acionado nesta retomada.
