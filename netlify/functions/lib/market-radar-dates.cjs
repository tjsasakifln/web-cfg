"use strict";

const brazilDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});

function todayInBrazil(now = new Date()) {
  const parts = Object.fromEntries(brazilDate.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthsAgo(today, months) {
  const now = new Date(`${today}T00:00:00Z`);
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return first.toISOString().slice(0, 10);
}

module.exports = { todayInBrazil, monthsAgo };
