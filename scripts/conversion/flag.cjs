const FLAG = require("../../data/conversion/canary-flag.json");

function loadFlag() {
  return FLAG;
}

function canaryEnabled(env = process.env) {
  if (env.CONVERSION_CANARY === "1") return true;
  if (env.NODE_ENV === "test") return true;
  return Boolean(FLAG && FLAG.enabled);
}

module.exports = {
  loadFlag,
  canaryEnabled,
};
