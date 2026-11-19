# Projetos residenciais por disciplina: revisão da publicação

## Decisão e limites

O pedido do fundador em 12/11/2026 autoriza preços competitivos, contratação por
disciplina, prazos de 15 a 90 dias e publicação com Mercado Pago. Essa decisão
substitui a restrição anterior de captação sem cobrança somente para os serviços
descritos em `data/projects-ready/service-offer.v1.json`. O catálogo de licenças
de modelos e a venda de créditos das ferramentas não são ativados por esta mudança.

A compra é de elaboração sob encomenda. A imagem fornecida pelo fundador ilustra
a atividade; não é apresentada como obra executada, equipe identificada ou prova
de um projeto entregue. Sites, revistas e desenhos pessoais são referências para
uma solução própria, respeitados direitos sobre projetos de terceiros.

## Preço e compromisso

| Disciplina | Preço por m² em 90 dias | Mínimo em 90 dias |
| --- | ---: | ---: |
| Arquitetônico | R$ 14,90 | R$ 1.490,00 |
| Estrutural | R$ 12,90 | R$ 1.290,00 |
| Elétrico | R$ 6,90 | R$ 690,00 |
| Hidrossanitário | R$ 6,90 | R$ 690,00 |

O fator aplicado à base é `0,85 + 13,5 / dias`. A área tem até duas casas decimais;
base e valor final de cada disciplina são arredondados ao centavo, meio para cima.
Os valores são somados somente depois desse arredondamento. Para 100 m² e as
quatro disciplinas, os totais são R$ 4.160,00 em 90 dias, R$ 4.472,00 em 60,
R$ 4.784,00 em 45, R$ 5.408,00 em 30 e R$ 7.280,00 em 15 dias.

Referências de comparação consultadas em 12/11/2026:

- <https://montesuacasa.com.br/preco/>
- <https://www.mysaengenharia.com/projetos>

São referências públicas de preço, sem equivalência presumida de entregas ou
margem. A margem realizada depende de custo técnico, taxas, alterações e esforço
de atendimento. `marginValidated` permanece `false`.

O escopo direto atende casa nova convencional, de 50 a 250 m², até dois
pavimentos, em terreno plano ou suave, sem contenções especiais, subsolo ou
piscina. Outros casos recebem proposta própria. Incluem-se PDF, DWG, entregas
específicas, compatibilização contratada, ART/RRT de elaboração e duas rodadas de
ajustes; correção de erro não consome essas rodadas.

A lista de insumos é enviada em até dois dias úteis após pagamento. Cada envio
recebe conferência em até três dias úteis. Com documentos completos e pagamento
confirmado, a contagem começa efetivamente até o terceiro dia útil. O prazo
único cobre todas as disciplinas do pedido, inclusive arquitetura quando
contratada junto. Atrasos internos não suspendem a contagem. Prefeitura e
condomínio têm tramitação própria, sem garantia de aprovação.

## Revisão independente

A revisão comercial conferiu os nove itens das condições, a identidade do
fornecedor no cadastro institucional, os preços, o prazo efetivo e o escopo
combinado. A revisão cruzada entre responsáveis pelo frontend e backend corrigiu:

- recuperação da mesma tentativa quando uma resposta se perde;
- descarte somente de tentativas novas definitivamente recusadas antes da cobrança;
- vínculo do resumo aceito ao preço exato por `quoteHash`;
- isolamento de respostas assíncronas entre pedidos;
- destino de pagamento limitado ao host HTTPS correto do Mercado Pago;
- confirmação por webhook anterior à resposta de criação;
- manutenção da revisão financeira após devolução de valor ainda indeterminado.

O pedido é persistido e relido antes da chamada ao provedor. O servidor recalcula
preço, valida vendedor e confirma o fato financeiro por consulta autenticada ao
provedor. O retorno do navegador não confirma pagamento. Cancelamento solicitado
e estorno realizado permanecem estados distintos.

## Verificação e publicação

Na preparação local passaram 105 testes de serviços, licenças anteriores,
captação e frontend; a geração completa do site; a integridade do HTML; o
registro público, conversão e SEO; o controle de leitura local de recibos; e a
varredura de segredos. A revisão adicional comparou 13.680 configurações de
preço entre frontend e backend.

O teste `tests/project-commerce/service-browser.mjs` usa o HTML publicado, o
handler e o armazenamento reais com provedor simulado, bloqueando rede externa.
Ele cobre revisão, aceite, compra, respostas perdidas, repetição, recibo,
recuperação, notificação assinada, cancelamento, indisponibilidade, tela móvel e
acessibilidade. Sua execução ocorre no CI canônico, pois o Chromium local é
impedido de abrir sockets pelo ambiente de execução. Esse impedimento não foi
tratado como teste aprovado.

Os gates obrigatórios `site-ci` e `pSEO quality gates` precisam passar na versão
exata antes da integração. A produção usa o artefato aprovado pelo fluxo Netcup,
com conferência posterior do SHA servido e da API pública.

Credenciais de produção, ID do vendedor e callback da aplicação Mercado Pago
são requisitos operacionais. `purchasesEnabled=false` mantém a simulação e o
atendimento disponíveis sem criar uma cobrança. Testes com provedor simulado não
comprovam checkout externo, recebimento ou configuração da conta institucional.
O procedimento completo está em
[SERVICE-ORDERS.md](../../runtime/project-commerce/SERVICE-ORDERS.md).

## Continuidade da revisão em 12/11/2026

A retomada confirmou na API pública que a venda de créditos das ferramentas
estava ativa. A configuração de serviço admite compartilhar essa aplicação,
mas o callback anterior de ferramentas não encaminhava ordens residenciais.
Foi corrigido o encaminhamento interno, preservando a URL e o ledger das
ferramentas. Assinatura, vendedor e consulta autenticada precedem o uso do fato;
modo, vendedor, token e segredo precisam coincidir. Uma ordem de créditos tem
precedência e falhas na gravação residencial continuam permitindo reenvio.

A recuperação local de recibos também passou a exigir identificador e campos
próprios, com cópia independente da credencial. O estado financeiro armazenado
no navegador nunca substitui a consulta do pedido no servidor. Essa alteração
remove as atribuições ao objeto recuperado sinalizadas pelo CodeQL. A execução
[43295477661](https://github.com/tjsasakifln/web-cfg/actions/runs/43295477661)
aprovou o commit `7809b2fe4a61d0830d603dc9db68bc1aabc1a539`, sem novos alertas
nem anotações. Os três diagnósticos de parsing anteriores permanecem em arquivos
idênticos aos da base e não foram introduzidos por esta mudança.

Dois revisores examinaram o encaminhamento e sua contraprova. A verificação
do integrador executou 153 testes no Node 22, incluindo serviços, captação,
recuperação e o adaptador de pagamentos: todos passaram, sem testes ignorados.
Os 11 cenários do callback incluem o handler exportado, pedidos de ferramentas
e serviços, repetição, estorno, credenciais diferentes, assinatura inválida,
referência desconhecida e falhas de persistência/provedor. Os transportes
externos são simulados, sem criar pagamento real.

O Chrome contratado foi instalado, mas o ambiente local recusou a abertura de
socket antes do início do teste. A execução no CI
[43295477581](https://github.com/tjsasakifln/web-cfg/actions/runs/43295477581)
aprovou os 25 cenários de navegador no commit limpo acima. As quatro verificações
de acessibilidade não registraram violações; os controles de prazo mantiveram
44 px de altura nas larguras de 360 e 390 px. A primeira dobra foi medida em
26 rotas, com 60 arquivos de entrada. Os dois JSONs foram importados com os
bytes originais, conferidos por tamanho, SHA-256 e hash de blob Git; o contrato
permaneceu idêntico e a medição registra a nova revisão.

A inspeção autenticada do painel Mercado Pago confirmou a aplicação
CONFENGE Ferramentas em produção, o evento `Order (Mercado Pago)` marcado e a
URL `https://confenge.com.br/api/web/tool-credits-webhook`. Nenhuma credencial
foi exposta, substituída ou regenerada. Não foi necessário mudar o callback;
o encaminhamento compartilhado preserva essa configuração. A publicação e a
abertura do checkout real continuam sujeitas à verificação posterior ao merge,
sem pagamento de dinheiro real.
