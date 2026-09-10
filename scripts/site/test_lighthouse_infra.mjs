import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { INFRASTRUCTURE_ATTEMPTS, installAsyncFailureTrap, isInfrastructureError } from "./lighthouse_infra.mjs";

// The crash observed in run 34532136335, verbatim.
const observed = Object.assign(new Error("Protocol error (Target.getTargetInfo): Protocol error (Target.getTargetInfo): Session with given id not found."), {
  protocolMethod: "Target.getTargetInfo",
  protocolError: "Protocol error (Target.getTargetInfo): Session with given id not found.",
});
assert.equal(isInfrastructureError(observed), true);
assert.equal(isInfrastructureError(new Error("Chrome CDP not ready on port 9222")), true);
assert.equal(isInfrastructureError(new Error("Target closed")), true);
assert.equal(isInfrastructureError({ protocolError: "Protocol error (Runtime.evaluate): Target crashed" }), true);
// Measured outcomes are never infrastructure: they must not be re-sampled.
assert.equal(isInfrastructureError(new Error("/: critical LCP 2264ms > 2000ms")), false);
assert.equal(isInfrastructureError(new Error("home: CLS 0.0676 must be <= 0.05")), false);
assert.equal(isInfrastructureError(new Error("payload refetch https://x/y.css -> 403")), false);
assert.equal(isInfrastructureError(null), false);
assert.ok(INFRASTRUCTURE_ATTEMPTS >= 2 && INFRASTRUCTURE_ATTEMPTS <= 3, "bounded, never open-ended");

// The async trap captures an out-of-band rejection instead of crashing.
const fake = new EventEmitter();
const trap = installAsyncFailureTrap(fake);
assert.equal(trap.drain(), null);
fake.emit("unhandledRejection", observed);
fake.emit("unhandledRejection", new Error("second one is kept out: first wins"));
const drained = trap.drain();
assert.equal(drained, observed);
assert.equal(trap.drain(), null, "drain is one-shot");
trap.dispose();
fake.emit("unhandledRejection", new Error("after dispose nothing is captured"));
assert.equal(trap.drain(), null);
console.log("LIGHTHOUSE_INFRA_OK");
