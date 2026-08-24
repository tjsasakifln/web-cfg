export const READY_INBOUND_CONFIGURATION = Object.freeze({
  webhook_url: "SET",
  webhook_secret: "SET",
  contract: "READY",
  reason: null,
  destination_fingerprint: "WARMBLY_PRODUCTION_V1",
});

export function inboundTransportConfigured(configuration) {
  return Boolean(
    configuration &&
      configuration.webhook_url === READY_INBOUND_CONFIGURATION.webhook_url &&
      configuration.webhook_secret === READY_INBOUND_CONFIGURATION.webhook_secret &&
      configuration.contract === READY_INBOUND_CONFIGURATION.contract &&
      configuration.reason === READY_INBOUND_CONFIGURATION.reason
  );
}

export function inboundTransportReady(configuration) {
  return Boolean(
    inboundTransportConfigured(configuration) &&
      configuration.destination_fingerprint === READY_INBOUND_CONFIGURATION.destination_fingerprint
  );
}

export function inboundTransportProofReady(response) {
  return Boolean(
    response &&
      response.status === 200 &&
      response.body?.ok === true &&
      inboundTransportReady(response.body?.configuration)
  );
}

export function inboundConfigurationSummary(configuration) {
  return {
    webhook_url: configuration?.webhook_url || "MISSING",
    webhook_secret: configuration?.webhook_secret || "MISSING",
    contract: configuration?.contract || "MISSING",
    reason: configuration?.reason || null,
    destination_fingerprint: configuration?.destination_fingerprint || "MISSING",
  };
}
