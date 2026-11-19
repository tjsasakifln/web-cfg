# Aquisição e conversão das ferramentas CONFENGE

## Decisão e objetivo

Decisão do fundador em 19/11/2026: implementar mecanismos de aquisição e
conversão das ferramentas, abrir PR, validar, integrar e publicar na Netcup.
Estado `EXECUTE_NOW`, frente `INBOUND_ENGINE`, efeitos esperados em receita,
distribuição, confiança e aprendizado comercial.

O visitante precisa concluir uma tarefa de engenharia e obter um arquivo útil.
A hipótese é que uma entrada gratuita compreensível, os preços visíveis antes
do cadastro e a continuidade após login ou compra reduzam o abandono entre a
descoberta e a exportação. Publicação não comprova aumento de receita.

## Oferta e percurso

“Ferramentas grátis” descreve a experimentação e a consulta dos resultados.
A cortesia é uma primeira exportação por conta verificada, compartilhada entre
as ferramentas. Cada nova exportação seguinte consome um crédito. Os formatos
editáveis que já são livres permanecem identificados nas ferramentas.

O catálogo explica essas condições no HTML inicial, apresenta os pacotes a
partir da configuração pública do mesmo serviço da carteira e mantém os
destinos existentes. Não há nova lista de preços, desconto ou assinatura.
Pacotes incompatíveis com a configuração, compras desativadas e exportações
pausadas não produzem um botão de compra. Uma seleção pública apenas abre a
conta com o pacote indicado; o pedido exige uma ação posterior do visitante.

Os guias de IFC para Excel, PDF escaneado para DWG, DWG para paredes IFC,
medição em foto e escala/unidade do DWG mantêm seus exemplos e recebem acesso
contextual à ferramenta ao concluir a leitura. Os títulos permanecem ligados
às tarefas. Não são criadas páginas por variações de palavras-chave ou cidades.

Uma exportação interrompida por login, e-mail não confirmado ou falta de saldo
pode ser retomada explicitamente na carteira. O resultado preparado permanece
na aba. Login e pagamento confirmado não autorizam uma exportação automática.
O fluxo preserva a identidade da conta e a referência idempotente da emissão.

## Fontes e responsabilidade

- Catálogo e metadados: `data/site/tool-showcase.json` e seu gerador.
- Preços e formatos: política e registro em `runtime/tools-commerce/`.
- Disponibilidade: `GET /api/web/tool-credits?op=config`.
- Condições: seção de créditos de `/termos-de-uso/`.
- Recebimento e estornos: conciliação autenticada do provedor e registro
  operacional de comércio. Eventos do navegador não são receita.
- Domínio e publicação: `RUNTIME-AUTHORITY.md`, exclusivamente Netcup.

Aplicam-se ADR-STRAT-002, ADR-STRAT-004 e ADR-TOOLS-001. A mudança não altera
as responsabilidades do extra-cli, Warmbly ou Governance, nem cria CRM,
envio comercial ou outra identidade pública.

## Medição e critério de resultado

O evento interno `tool_commerce_step` distingue visualização dos preços,
abertura da carteira, necessidade de autenticação ou saldo, pedido criado,
pagamento confirmado pelo servidor, entrega ao navegador e falha de emissão.
Os campos são finitos. Não incluem conta, e-mail, pedido, nome de arquivo,
conteúdo do projeto, valores do cálculo ou texto digitado na busca.

O resumo autenticado existente `analytics_summary` inclui contagens por dia,
ferramenta e etapa em `aggregate.tool_commerce`. Essas observações servem para
localizar perdas, não para inferir um percurso individual ou uma taxa causal.
A lista de eventos e propriedades permitidos para o Google Analytics permanece
inalterada. O registro financeiro continua sendo a fonte das compras pagas,
exportações com crédito pago e estornos.

Evidência imediata: testes de contrato, catálogo e recuperação da exportação;
verificação do HTML, dos links, das condições comerciais e da versão publicada.
Após 28 dias completos, comparar entrada orgânica das mesmas URLs e as etapas
observadas com exportações e compras confirmadas. Uma amostra pequena não
autoriza concluir ausência de demanda. Priorizar a etapa em que houver perda
observada antes de expandir o catálogo ou produzir mais conteúdo.

## Validação e recuperação

As verificações incluem oferta visível sem JavaScript, preços vindos do
serviço, ausência de pedido ao selecionar pacote, estados de indisponibilidade,
visibilidade em telas pequenas, ausência de dados privados na medição e
retomada sem débito automático ou duplicado.

Os gates existentes de `site-ci` e pSEO continuam obrigatórios para o merge.
A promoção usa o artefato aprovado e o fluxo de release Netcup. Conferir
`/.well-known/build-info.json` e a jornada pública depois da promoção.

Recuperação: reverter o commit desta campanha ou usar a release anterior pelo
procedimento Netcup. Saldo, pedidos e exportações persistidos ficam preservados.
A reversão do site não desfaz pagamentos nem substitui sua conciliação.
