exports.handler = async (event = {}) => {
  const requestedDelay = event.queryStringParameters?.delay
    || process.env.RUNTIME_TEST_DELAY_MS
    || 300;
  const delay = Math.max(10, Math.min(2000, Number(requestedDelay)));
  process.stdout.write(JSON.stringify({ event: "fixture_slow_started" }) + "\n");
  await new Promise((resolve) => setTimeout(resolve, delay));
  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true, completed: true }),
  };
};
