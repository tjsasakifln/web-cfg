exports.handler = async (event) => ({
  statusCode: 207,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "X-Handler": "echo",
    "Cache-Control": "no-store",
  },
  multiValueHeaders: {
    "Set-Cookie": ["runtime-a=1; HttpOnly", "runtime-b=2; SameSite=Lax"],
  },
  body: JSON.stringify({
    method: event.httpMethod,
    body: event.body,
    path: event.path,
    raw_query: event.rawQuery,
    query: event.queryStringParameters,
    multi_query: event.multiValueQueryStringParameters,
    headers: {
      content_type: event.headers["content-type"] || null,
      forwarded_for: event.headers["x-forwarded-for"] || null,
      client_ip: event.headers["client-ip"] || null,
      marker: event.headers["x-test-marker"] || null,
    },
    source_ip: event.requestContext && event.requestContext.identity
      ? event.requestContext.identity.sourceIp
      : null,
  }),
});
