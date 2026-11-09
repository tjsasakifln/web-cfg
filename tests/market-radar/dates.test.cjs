const assert = require("node:assert/strict");
const test = require("node:test");
const { todayInBrazil, monthsAgo } = require("../../netlify/functions/lib/market-radar-dates.cjs");

test("vigência usa a data de Brasília inclusive após a meia-noite UTC", () => {
  assert.equal(todayInBrazil(new Date("2026-11-10T02:59:59Z")), "2026-11-09");
  assert.equal(todayInBrazil(new Date("2026-11-10T03:00:00Z")), "2026-11-10");
  assert.equal(monthsAgo("2026-05-31", 3), "2026-02-28");
  assert.equal(monthsAgo("2024-05-31", 3), "2024-02-29");
});
