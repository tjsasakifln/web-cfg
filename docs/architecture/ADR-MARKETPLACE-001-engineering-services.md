# Marketplace de serviços de engenharia

Data: 12/11/2026. Estado: EXECUTE_NOW, implementação solicitada pelo fundador nesta sessão.

## Decisão

A CONFENGE terá uma experiência de contratação entre clientes e prestadores em `/profissionais/`, no mesmo domínio e com a identidade visual existente. O usuário autorizou investigação, adaptação, PR e publicação. Esta decisão amplia a fronteira de ADR-STRAT-002 apenas para as transações entre participantes desta plataforma.

A base selecionada é Mercur v2.4.1, MIT, commit `fd4e5a3e311fe1d39596f6b53c5e729a65ff2d4d`. Reaproveitamos autenticação, membros, prestadores, isolamento e contas de recebimento. Uma extensão separada registra a solicitação de engenharia, proposta, aceite, pagamento, entrega e avaliação. Não se apresenta essa extensão como funcionalidade pronta do projeto de origem. A comparação está em `docs/marketplace/repository-selection.md`.

## Responsabilidades

- `web-cfg`: interface, integração e aplicação do marketplace; o banco da aplicação é privado.
- Mercur/Medusa: contas e permissões. A extensão usa os IDs existentes, sem copiar a base comercial da empresa.
- Stripe Connect: identificação financeira dos recebedores e processamento dos pagamentos. Dinheiro aprovado, saldo atribuído e recebimento bancário são fatos diferentes.
- Warmbly: continua responsável pela prospecção, propostas próprias, faturamento e operação comercial da CONFENGE. O marketplace não cria campanhas ou outro CRM.
- `extra-cli`: mantém os dados adquiridos e sua proveniência.

## Contrato de implantação

O site atual entrega arquivos estáticos e handlers Node. Mercur requer aplicação própria, PostgreSQL, Redis, migrações e operação. O gateway comunica apenas com endereço privado fixado pelo operador, por operações permitidas; não publica a API administrativa. Um merge do site não comprova a implantação desse serviço.

O módulo financeiro começa desligado. Cadastro e contratação só são anunciados como operacionais após persistência real; cobrança só após configuração, aceite de termos e validação do ciclo real em ambiente de teste. Não se publicam profissionais, notas ou avaliações fictícias. A avaliação exige contratante identificado, serviço pago e conclusão confirmada. O perfil informado pelo prestador não ganha verificação automaticamente.

O pagamento por serviço com preço e escopo aceitos utiliza Checkout Stripe, com recebedor e comissão definidos no servidor. O cadastro financeiro aproveita o provedor Connect do Mercur. O ciclo de captura e repasse do comércio físico não será executado em paralelo sobre as cobranças de engenharia. Não há promessa de custódia ou liberação bancária condicionada à entrega.

## Evidência e reversão

Hipótese comercial: reduzir o esforço de encontrar profissional e contratar uma entrega delimitada, gerando comissão sobre contratação efetivamente paga. Medir pedidos qualificados, propostas aceitas, pagamentos confirmados, devoluções e contribuição após tarifas e atendimento. Cadastro ou faturamento previsto não é recebimento.

As verificações devem atacar isolamento entre usuários, alteração de preço pelo navegador, repetição de cobrança, confirmação falsa de pagamento, avaliação sem entrega e exposição de dados privados. A integração permanece indisponível quando o serviço não responde. Reversão: desativar novas contratações/pagamentos, manter conciliação dos existentes e preservar o banco; reverter a versão pública sem destruir dados.

## Emenda 2026-11-26 — indexação de /profissionais/ (decisão do fundador)

Data: 26/11/2026. Estado: EXECUTE_NOW, decisão expressa do fundador.

Fato verificado em produção nesta data: `op=config` retorna `enabled:true`, `paymentsEnabled:false`; `op=providers` retorna 0 perfis publicados. O gargalo é a oferta de profissionais, e o fundador decidiu indexar a rota para atrair profissionais ao cadastro.

A rota `/profissionais/` passa a `index,follow`, com estas condições. A descoberta ocorre por links internos (navegação, rodapé, convite em todo o site e artigos) e por pedido de indexação no Search Console. A inclusão em `sitemap.xml`/`sitemap.txt` exige recaptura dos hashes protegidos em `data/bofu-dominance/frozen-specs/hashes.json`, que fica para decisão e execução do fundador:

1. A página é dirigida primeiro ao profissional que procura clientes (cadastro, revisão, como responder pedidos) e, em segundo lugar, a quem quer contratar, cuja ação terminal é a triagem técnica da CONFENGE (`/triagem-tecnica/`) enquanto não houver perfis publicados.
2. O texto estático, visível sem JavaScript, não afirma número de profissionais, preço, percentual de comissão, avaliação, comparação de perfis nem pagamento online disponível. Enquanto `paymentsEnabled=false`, o pagamento é descrito só na forma condicional dos termos ("quando habilitado").
3. Não se publicam perfis, contagens ou avaliações fictícias.
4. A indexação não habilita pagamentos nem altera os critérios de revisão, cobrança, avaliação e verificação deste ADR.

Reversão: se o Search Console classificar a rota como soft 404 ou como não indexada por qualidade em até 28 dias, se o modo voltar a `off`, ou se a página passar a exibir afirmação não comprovada, restaurar `noindex,follow`, retirar a rota do sitemap e registrar o motivo em `data/organic/noindex-governance-registry.json` com o código `marketplace_operation_pending`.
