# ADR-TOOLS-001 — Créditos das ferramentas CONFENGE

- **Estado:** `EXECUTE_NOW` para implementação e ensaio; `VALIDATE` para margem,
  termos, conta de pagamento e piloto; checkout público ainda desativado.
- **Data:** 2026-11-08. **Frente:** Inbound Compounding. **Efeito:** receita,
  distribuição e confiança. **Evidência inicial:** ensaio com emulador e sandbox;
  no piloto, revisar conversão, margem e estornos após 30 dias ou 100 exportações.
- **Trabalho do visitante:** concluir uma análise e baixar sua memória de
  cálculo. O primeiro arquivo completo é cortesia da conta verificada. A
  hipótese é que resultados úteis e convites que convertem sustentam recompra.

O backend do site no Netcup autoriza e entrega arquivos oficiais das ferramentas.
Firebase Auth identifica visitantes das ferramentas; Firestore mantém somente o
registro operacional de saldo, pagamento, exportação e indicação. As regras
negam acesso direto pelo navegador. O provedor é a fonte dos fatos financeiros;
o Firestore é a fonte da autorização de exportação. O módulo não é uma segunda
identidade comercial, CRM, faturador fiscal ou contas a receber. Warmbly mantém
ação comercial, faturamento, atendimento e resultados; a conciliação usa pedidos
e movimentos com origem `CONFENGE_WEB`, sem enviar arquivo, dados de cálculo ou
identificadores de login para analytics. Nenhum despacho comercial é acionado.

O piloto aproveita a rota existente do Modela Pro; não cria página indexável,
nova família, oferta de engenharia ou mudança de posicionamento. A simulação,
rascunho e edição continuam locais. Uma exportação oficial requer autenticação
verificada, consentimento de envio dos dados de memória e um débito confirmado
no backend. O servidor formata e emite o artefato com identificador próprio;
o resultado de cálculo visível continua acessível ao seu autor. Não se promete
impedir cópia do que já está no navegador ou uso de software de terceiros.

Checkout e exportação podem ser suspensos pelo operador separadamente. A
configuração padrão é desligada. Não há cobrança nos demais formatos até que
cada gerador tenha entrega controlada, tratamento de dados adequado e teste de
paridade. Durante falha da API, a interface habilitada deve pausar a emissão.
Uma reversão preserva pedidos e ledger; a conciliação dos Pix emitidos permanece
ativa mesmo com compras suspensas. Ver o [runbook](../tools-commerce/README.md).

## Carteira comum e meios de pagamento

Em 09/11/2026 o fundador autorizou o checkout para a carteira única de todas
as ferramentas do site, com Pix preferencial e demais meios disponíveis na conta
Mercado Pago. Uma conta usa a mesma cortesia inicial e o mesmo saldo em todas as
ferramentas. Cada nova exportação de resultado custa um crédito. Simulações,
projetos editáveis e exemplos podem ser usados sem emissão.

O Modela Pro continua emitindo a memória no servidor. Para arquivos produzidos
localmente, o navegador calcula o SHA-256 do resultado pronto e pede autorização
de entrega com ferramenta, formato, tamanho e hash. A impressão usa um resumo
do conteúdo preparado para o comando da ferramenta. O backend valida ferramenta
e formato, registra o débito idempotente e devolve um comprovante de emissão
selado. A interface só entrega após receber esse comprovante. O arquivo de
trabalho, o resultado e os dados de entrada ficam no dispositivo nesses fluxos.
O comprovante identifica uma emissão da ferramenta, sem atestar a validade do
cálculo nem controlar cópias locais ou a impressão nativa do navegador.

O Pix direto usa Checkout Transparente. O checkout hospedado usa Orders para
oferecer os meios elegíveis ao comprador. Os dois fluxos conciliam no mesmo
ledger por consulta autenticada ao provedor. O retorno do comprador ao site
apenas indica onde consultar o pedido. Em disputas e devoluções parciais, a
operação verifica o pedido antes de liberar saldo. A compra pública depende de
integração e ensaio de todas as ferramentas do catálogo, com paridade de
formatos e confirmação de ambos os fluxos de pagamento no Netcup.
