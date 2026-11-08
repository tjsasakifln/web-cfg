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
