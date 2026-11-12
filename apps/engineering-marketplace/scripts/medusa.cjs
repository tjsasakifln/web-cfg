'use strict';
// In Medusa 2.22.3 the environment opt-out prevents new queue entries, but
// the exit dispatcher still reads the saved telemetry.enabled preference.
// Apply the framework's own opt-out before importing its CLI, so neither
// queued events nor a fresh command can start an outbound dispatcher.
process.env.MEDUSA_DISABLE_TELEMETRY='true';
process.env.MERCUR_DISABLE_TELEMETRY='true';
process.env.DO_NOT_TRACK='1';
const Telemeter=require('@medusajs/telemetry/dist/telemeter').default;
new Telemeter().setTelemetryEnabled(false);
const telemetry=require('@medusajs/telemetry');
if(new telemetry.Telemeter().isTrackingEnabled() || telemetry.flush!==undefined) {
  throw new Error('Telemetry must be disabled before executing the marketplace CLI');
}
require('@medusajs/cli/cli.js');
