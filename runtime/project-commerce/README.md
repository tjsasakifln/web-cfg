# Compra e entrega de projetos

Para o serviço de elaboração sob encomenda, contratado por disciplina e prazo,
consulte [SERVICE-ORDERS.md](SERVICE-ORDERS.md). Esse fluxo usa Checkout Pro,
recibo privado e armazenamento do host, com autorização própria de 12/11/2026.
As instruções abaixo continuam específicas das licenças de arquivos prontos.

Esta implementação prepara a compra de licenças de projetos. O lançamento de
12/11/2026 recebe consultas e mantém o catálogo vazio e as compras desativadas.
Nenhum preço, projeto, aprovação profissional ou conta de produção é presumido.

O módulo reutiliza Firebase Auth, o SDK privado e o cliente de Orders do Mercado
Pago. Não utiliza saldo, preços, pedidos nem flags da carteira de ferramentas.
O namespace Firestore é `projectCommerce/v1-<ambiente>`; o acesso direto pelo
navegador permanece negado pelas regras do projeto Firebase. A mesma conta
Firebase pode ser usada somente após verificar que ela pertence ao ambiente.
Warmbly continua responsável pelo atendimento, propostas, faturamento e serviços.
O e-mail verificado é preservado nos pedidos e solicitações privados para retorno
da equipe. Não aparece nos eventos agregados, respostas de configuração, arquivos
públicos ou relatórios de métricas. A CLI de atendimento contém dados pessoais e
deve ser usada somente por pessoas autorizadas, sem publicar sua saída.

## Contrato do catálogo

`data/projects-ready/catalog.v1.json` é incluído no pacote privado do runtime,
fora de `_site`. Sua forma inicial é:

```json
{"schema":"confenge.project-catalog/1","version":"2026-11-12-v1","products":[]}
```

Cada produto futuro deve conter os campos validados em `productReady`:

* `id`, `slug`, `title`, `version`, `status: approved`, `currency: BRL` e
  `amountCents` aprovado. A hipótese financeira de R$ 1.190 não é cadastrada.
* `delivery`: nome seguro do ZIP, tamanho em bytes e SHA-256 do arquivo integral.
  O limite inicial é 32 MiB por ZIP. Arquivos maiores exigem outra forma de
  entrega protegida e sua verificação antes da ativação.
* `terms`: versão, texto integral aceito, SHA-256 desse texto UTF-8 e URL própria
  em `/projetos-prontos/`. Inclui `supplier`, com razão social (`legalName`),
  `registrationType: CNPJ`, CNPJ canônico (`registration`), endereço físico
  (`address.street`, `number`, `complement` opcional, `neighborhood`, `city`,
  `state`, `postalCode` e `country: BR`), `email` e `phone` no formato `+55...`.
  O texto começa com o bloco gerado por `supplierText(supplier)` e uma linha em
  branco, vinculando os dados do fornecedor ao mesmo hash aceito. Esses dados
  precisam ser verificados antes da aprovação; não inventar endereço. O texto
  e o fornecedor são preservados no pedido e disponíveis ao comprador.
* `evidence.rights`: `approved`, referência interna não sigilosa, `approvedAt`
  em UTC, `productVersion`, `archiveSha256`, titular, origem e autorização de
  revenda (`owner`, `origin`, `resaleAuthorization`).
* `evidence.technical`: os mesmos campos de aprovação e vínculo exato com a
  versão/arquivo, além de `reviewer` e `professionalRegistration`.
* `evidence.commercial`: aprovação vinculada à versão/arquivo, `amountCents`
  idêntico ao preço e `termsSha256` idêntico ao texto autorizado.
* `public`: `description`, `programme`, `areaM2`, `floors`, `dimensions`,
  `terrainConditions`, `documents`, `formats`, `deliveryTime`, `included`,
  `excluded`, `license`, `implementations: 1`, `reuseRule`, `corrections`,
  `changes`, `responsibilities`, `support` e `previews`. Cada prévia tem `url`
  local sob `/assets/projects-ready/`, `alt`, `real: true` e
  `publicationAuthorized: true`.

O cadastro de campos não produz aprovação profissional. As referências precisam
corresponder a documentos reais conferidos por pessoa habilitada. Não colocar
documentos de clientes, dados pessoais ou URLs privadas de dossiês no repositório
público. A revisão precisa vincular exatamente o ZIP vendido e seu conteúdo.

O produto serializado tem teto de 256 KiB em UTF-8, incluindo todos os seus
campos. A contagem é por bytes, inclusive caracteres multibyte. A folga preserva
o limite de 1 MiB do documento Firestore após acrescentar QR, status e histórico
limitado de solicitações.

## Configuração privada

O padrão `PROJECT_COMMERCE_MODE=off` devolve catálogo vazio sem carregar Firebase
ou consultar o provedor. Deixe assim durante a captação. Para preparar um ensaio,
use variáveis privadas, fora do código e do pacote público:

| Variável | Conteúdo |
| --- | --- |
| `PROJECT_COMMERCE_MODE` | `sandbox` ou `live`; produção somente em `netcup-production` |
| `PROJECT_COMMERCE_FIREBASE_PROJECT` | ID terminado em `-hml` para teste, `-prod` para produção |
| `PROJECT_COMMERCE_FIREBASE_WEB_KEY` | Chave web do app correspondente |
| `PROJECT_COMMERCE_FIREBASE_WEB_APP` | App ID web correspondente |
| `PROJECT_COMMERCE_SANDBOX_ORIGIN` | Origem exata do ensaio; somente sandbox |
| `PROJECT_COMMERCE_SANDBOX_UIDS` | UIDs controlados autorizados; somente sandbox |
| `PROJECT_COMMERCE_MP_TEST_SELLER_ID` | Conta vendedora de teste; somente sandbox |
| `PROJECT_COMMERCE_MP_LIVE_SELLER_ID` | Conta vendedora institucional validada; somente live |
| `PROJECT_COMMERCE_MP_ACCESS_TOKEN` | Token do ambiente e vendedor correspondentes |
| `PROJECT_COMMERCE_MP_WEBHOOK_SECRET` | Segredo do callback assinado correspondente |
| `PROJECT_COMMERCE_MP_TEST_BUYER` | Opcional: e-mail de teste `@testuser.com`; somente sandbox |
| `PROJECT_COMMERCE_FILES_ROOT` | Diretório privado de arquivos; produção em `/var/lib/confenge-web/project-files` |
| `PROJECT_COMMERCE_APPROVED_CATALOG` | Versão do catálogo aprovada |
| `PROJECT_COMMERCE_APPROVED_TERMS_SHA256` | Hash do texto autorizado para o primeiro produto |
| `PROJECT_COMMERCE_PURCHASES` | `1` somente depois de todos os requisitos; padrão `0` |
| `PROJECT_COMMERCE_DELIVERY_PAUSED` | `1` suspende entregas e compras; preserva conciliação e suporte |

O SDK usa a identidade ADC já instalada de forma protegida, com acesso mínimo ao
projeto correto. Não misturar tokens, UIDs, vendedores, projetos ou dados entre
teste e produção. Configurar o webhook Orders em
`https://confenge.com.br/api/web/project-orders-webhook`, ou na origem HTTPS
separada do ensaio. A assinatura é verificada, mas o corpo da notificação nunca
confirma pagamento: o servidor consulta a ordem na API do vendedor.

Os ZIPs são instalados fora do release e fora do diretório público, com acesso
somente ao operador e ao runtime. Não usar links públicos, pastas de cliente nem
symlinks. O nome, tamanho e hash são verificados antes de criar a cobrança. O
download usa o mesmo descritor e os mesmos bytes conferidos, vinculado ao pedido.
Mantenha todas as versões já adquiridas ao publicar um modelo novo ou reverter
o site. A versão nova gera outro ZIP e outra revisão no catálogo.

## Fluxo e garantias

`/api/web/project-orders` expõe `config`, `orders`, `order`, `download` e
`support`. Exceto `config`, todas as operações exigem Firebase ID token válido,
não revogado, com e-mail verificado. As escritas também exigem a origem exata.

O pedido recebe `productId`, `productVersion`, `requestId` UUID, `termsVersion`,
`termsHash` e `acceptedTerms: true`. Preço, moeda, arquivo, licença e revisão vêm
do servidor. Campos extras são recusados. A chave idempotente depende do UID e
do UUID, em namespace separado das ferramentas. A transação Firestore persiste
o pedido antes de chamar o provedor. Repetições devolvem o pedido original, até
depois de mudar o catálogo ou suspender novas compras. Uma falha incerta não
gera outra cobrança: a conciliação pesquisa a referência original.

O pagamento inicial usa Pix. Os estados são `creating`, `pending`, `paid`,
`failed`, `cancelled`, `refunded` e `review`. Somente GET autenticado ao Mercado
Pago pode produzir `paid`. A referência, valor integral, BRL, método e vínculo
da ordem são conferidos. Notificações repetidas não duplicam aprovação ou acesso.
Situação divergente depois de pagamento confirmado suspende a entrega para
conferência. Não liberar manualmente disputa sem procedimento específico.

O download exige o dono do pedido, estado pago e nova consulta ao provedor.
Um reembolso pode bloquear o acesso mesmo se a notificação se perder. Uma
repetição autorizada baixa a mesma versão, sem nova cobrança. O evento registra
acesso autorizado, não comprova que o visitante salvou o arquivo.

`support` aceita `orderId`, `requestId`, `kind: support|cancellation` e `message`
até 2.000 caracteres. O motivo do cancelamento é opcional. Persiste protocolo idempotente e o exibe no pedido. Não
altera pagamento nem promete reembolso executado. A equipe consulta esses
registros na operação privada e trata o caso no sistema comercial/provedor.

## Operação privada

Executar no servidor com as variáveis privadas já carregadas. Os comandos não
enviam mensagens nem criam pagamentos:

```sh
node runtime/project-commerce/ops.cjs preflight
node runtime/project-commerce/ops.cjs order UUID_DO_PEDIDO
node runtime/project-commerce/ops.cjs requests
node runtime/project-commerce/ops.cjs reconcile ORD_IDENTIFICADOR
node runtime/project-commerce/ops.cjs reconcile ORD_IDENTIFICADOR --apply
node runtime/project-commerce/ops.cjs report 2026-11-12 2026-12-12
node runtime/project-commerce/ops.cjs resolve-request PROTOCOLO --reference REFERENCIA_DO_ATENDIMENTO
```

`preflight` confere aprovação, arquivos e vendedor sem movimentar dinheiro.
`reconcile` é leitura até receber `--apply`; o estado aplicado deriva da API.
`resolve-request` só fecha o atendimento identificado e não confirma pagamento
ou estorno. Reembolso financeiro é feito pelo responsável no Mercado Pago;
depois, conciliar e conferir o estado `refunded`. Preservar o histórico.

O relatório usa intervalo civil de São Paulo, final exclusivo, até 93 dias,
com consultas paginadas. Contagens e valores por licença são separados de
serviços. Confirmação do provedor e liquidação bancária são fatos diferentes.
Recebimento liquidado, valores a receber de liquidação, tarifas, aquisição e
horas permanecem `null` até conciliação ou lançamento manual. Modo desligado ou
falha não produz zeros fictícios. Datas dos eventos são datas de observação no
sistema; o relatório explica esse recorte.
Reembolsos parciais coerentes são preservados e somados apenas pelo aumento
confirmado: 50, depois 75 e depois 100 geram parcelas 50, 25 e 25, sem duplicação.
`refundsConfirmed` conta pedidos com devolução positiva observada no intervalo;
`fullRefundsConfirmed` conta reversões integrais. Uma divergência de valores não
resolvida deixa `refundedCents: null`; `knownRefundedCents` continua sendo apenas
o valor confirmado no intervalo. A entrega permanece suspensa durante revisão.

## Verificação e ativação

```sh
node --test tests/project-commerce/backend.test.cjs
node --test tests/tools-commerce/mercado-pago.test.cjs
```

Esses testes usam credenciais, arquivos, preços e respostas locais sintéticos.
Cobrem preço adulterado, falta de aprovação, duplicação concorrente, assinatura
inválida, valor divergente, confirmação por GET, usuário errado, reembolso,
arquivo corrompido/symlink e suporte. Não constituem ensaio de pagamento real ou
homologação externa do Firebase/Mercado Pago. A ativação futura requer ensaio do
fluxo completo em contas institucionais de teste, publicação das condições
autorizadas, revisão profissional, aprovação do preço e instalação dos arquivos.

Para interromper novas vendas, usar `PROJECT_COMMERCE_PURCHASES=0`, preservando
o modo, Firebase, credenciais e webhook para pedidos já existentes. `off` é o
estado pré-lançamento sem pedidos; não usá-lo para interromper a conciliação de
compradores existentes. A reversão do site preserva Firestore e arquivos privados.
