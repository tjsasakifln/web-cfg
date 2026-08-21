"use strict";

const FLAG = require("../../data/public-integrity-consumer/flag.json");
const { FLAG_NAME } = require("./constants.cjs");

function loadFlag() {
  return FLAG;
}

function flagEnabled(env = process.env) {
  if (env && env.PUBLIC_INTEGRITY_CONSUMER === "1") return true;
  return Boolean(FLAG && FLAG.enabled);
}

function flagDefault() {
  return FLAG && FLAG.enabled === true;
}

function prepareMode(env = process.env) {
  if (env && env.NODE_ENV === "test") return true;
  if (env && env.PUBLIC_INTEGRITY_PREPARE === "1") return true;
  return flagEnabled(env);
}

module.exports = {
  FLAG_NAME,
  loadFlag,
  flagEnabled,
  flagDefault,
  prepareMode,
};
