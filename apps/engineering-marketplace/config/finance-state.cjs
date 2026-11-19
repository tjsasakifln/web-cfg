'use strict';

const state = (code, label, detail) => Object.freeze({
  code,
  label,
  detail,
  // Neither a Mercur settlement nor a Stripe transfer proves a bank deposit.
  bankReceiptConfirmed: false,
});

/** Accept only server-read settlement data. Do not expose raw provider states. */
function describeSettlement(settlement, mode = 'provider') {
  if (!['provider', 'plugin'].includes(mode)) {
    throw new Error('Unknown settlement mode');
  }
  if (settlement?.status === 'aborted') {
    return state('no_settlement', 'Sem repasse neste período', 'Não houve valor líquido a repassar neste período.');
  }
  if (settlement?.status === 'failed' || settlement?.payout_status === 'failed') {
    return state('needs_attention', 'Repasse em análise', 'Confira a pendência na Stripe antes de considerar o valor recebido.');
  }
  if (settlement?.status === 'paid_out') {
    if (mode === 'provider') {
      return state('provider_statement', 'Apuração registrada na Stripe',
        'A transferência bancária segue a agenda da Stripe. Este registro não confirma crédito no banco.');
    }
    if (settlement.payout_status === 'paid' && /^po_/.test(settlement.provider_payout_id || '')) {
      return state('provider_reports_paid', 'Repasse informado pela Stripe',
        'A Stripe informou o pagamento do repasse. Confira o crédito no extrato bancário.');
    }
    return state('reconciliation_pending', 'Conciliação pendente',
      'O estado da apuração precisa ser conciliado com o repasse da Stripe.');
  }
  return state('pending', 'Apuração em andamento', 'Acompanhe a apuração e a disponibilidade na Stripe.');
}

/** A Mercur payout is a Stripe Transfer, not a bank Payout. */
function describeSellerTransfer(payout) {
  switch (payout?.status) {
    case 'paid':
      return state('stripe_account_credit', 'Transferência para a conta Stripe',
        'O valor foi destinado à conta Stripe do prestador. A disponibilidade e o crédito bancário são etapas seguintes.');
    case 'failed':
      return state('transfer_failed', 'Transferência não concluída', 'A transferência precisa de acompanhamento.');
    case 'on_hold':
      return state('transfer_pending', 'Transferência pendente', 'Aguarda atendimento das condições de pagamento e da conta recebedora.');
    case 'aborted':
      return state('transfer_canceled', 'Transferência cancelada', 'Esta transferência não foi realizada.');
    default:
      return state('transfer_processing', 'Transferência em processamento', 'Acompanhe a confirmação da Stripe.');
  }
}

/** Pure state decision after the caller verified the stored quote and Stripe
 * objects. A later payment event must not reopen a canceled, refunded or
 * disputed contract. Resolving such cases requires an operator decision.
 */
function reconcileEngineeringPayment(record, facts) {
  if (!record?.payment || !facts || typeof facts !== 'object') {
    throw new Error('Payment reconciliation needs a saved payment and verified facts');
  }
  const before = { status: record.status, paymentStatus: record.payment.status };
  const refunded = facts.refundedAmountCents ?? 0;
  const pending = facts.refundPendingAmountCents ?? 0;
  const failed = facts.refundFailedAmountCents ?? 0;
  if (![refunded, pending, failed].every((amount) => Number.isSafeInteger(amount) && amount >= 0)) {
    throw new Error('Invalid refund reconciliation facts');
  }
  if (facts.disputed) return { status: 'disputed', paymentStatus: 'disputed' };
  if (facts.fullyRefunded) return { status: 'refunded', paymentStatus: 'refunded' };
  if (pending > 0) return { status: 'disputed', paymentStatus: 'refund_pending' };
  if (failed > 0) return { status: 'disputed', paymentStatus: 'refund_failed' };
  if (refunded > 0) return { status: 'disputed', paymentStatus: 'partially_refunded' };
  if (['cancelled', 'refunded', 'disputed'].includes(record.status)) return before;
  if (facts.paid) {
    if (!['accepted', 'paid', 'delivered', 'completed'].includes(record.status)) {
      return { status: 'disputed', paymentStatus: 'payment_mismatch' };
    }
    return { status: record.status === 'accepted' ? 'paid' : record.status, paymentStatus: 'paid' };
  }
  if (facts.sessionStatus === 'expired' && !facts.paymentCaptured &&
      record.status === 'accepted' && ['creating', 'pending', 'expired'].includes(record.payment.status)) {
    return { status: record.status, paymentStatus: 'expired' };
  }
  return before;
}

module.exports = { describeSettlement, describeSellerTransfer, reconcileEngineeringPayment };
