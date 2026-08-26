const HTML_ENTITIES = Object.freeze({
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
});

function decodeEntities(value) {
  const pattern = /&(?:amp|quot|#39|lt|gt);/g;
  let decoded = "";
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    decoded += value.slice(cursor, match.index);
    decoded += HTML_ENTITIES[match[0]];
    cursor = match.index + match[0].length;
  }
  return decoded + value.slice(cursor);
}
function parseAttrs(raw) {
  const attrs = {};
  let index = 0;
  while (index < raw.length) {
    while (/\s/.test(raw[index] || "")) index += 1;
    if (index >= raw.length || raw[index] === "/") break;
    const nameStart = index;
    while (index < raw.length && !/[\s=/>]/.test(raw[index])) index += 1;
    const name = raw.slice(nameStart, index).toLowerCase();
    while (/\s/.test(raw[index] || "")) index += 1;
    let value = "";
    if (raw[index] === "=") {
      index += 1;
      while (/\s/.test(raw[index] || "")) index += 1;
      const quote = raw[index] === '"' || raw[index] === "'" ? raw[index++] : null;
      const valueStart = index;
      if (quote) {
        while (index < raw.length && raw[index] !== quote) index += 1;
        value = raw.slice(valueStart, index);
        if (raw[index] === quote) index += 1;
      } else {
        while (index < raw.length && !/[\s>]/.test(raw[index])) index += 1;
        value = raw.slice(valueStart, index);
      }
    }
    if (name) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

export function scanStartTags(html) {
  const tags = [];
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) break;
    if (html.startsWith("<!--", open)) {
      const close = html.indexOf("-->", open + 4);
      index = close === -1 ? html.length : close + 3;
      continue;
    }
    if (!/[A-Za-z]/.test(html[open + 1] || "")) {
      index = open + 1;
      continue;
    }
    let cursor = open + 1;
    while (/[A-Za-z0-9:-]/.test(html[cursor] || "")) cursor += 1;
    const name = html.slice(open + 1, cursor).toLowerCase();
    let quote = null;
    let end = cursor;
    for (; end < html.length; end += 1) {
      const char = html[end];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end >= html.length) break;
    tags.push({ name, attrs: parseAttrs(html.slice(cursor, end)), start: open, end: end + 1 });
    if (name === "script" || name === "style") {
      const close = html.toLowerCase().indexOf(`</${name}`, end + 1);
      index = close === -1 ? end + 1 : close + name.length + 3;
    } else index = end + 1;
  }
  return tags;
}

export function extractSeoSignals(bufferOrText) {
  const html = Buffer.isBuffer(bufferOrText) ? bufferOrText.toString("utf8") : String(bufferOrText);
  const tags = scanStartTags(html);
  const canonical = tags
    .filter((tag) => tag.name === "link" && (tag.attrs.rel || "").toLowerCase().split(/\s+/).includes("canonical"))
    .map((tag) => tag.attrs.href || "");
  const metaRobots = tags
    .filter((tag) => tag.name === "meta" && (tag.attrs.name || "").toLowerCase() === "robots")
    .map((tag) => (tag.attrs.content || "").toLowerCase().split(",").map((part) => part.trim()).filter(Boolean).sort().join(","));
  const gscVerification = tags
    .filter((tag) => tag.name === "meta" && (tag.attrs.name || "").toLowerCase() === "google-site-verification")
    .map((tag) => tag.attrs.content || "")
    .sort();
  const scriptSources = tags
    .filter((tag) => tag.name === "script" && tag.attrs.src)
    .map((tag) => tag.attrs.src)
    .sort();
  const turnstileSiteKeys = tags
    .map((tag) => tag.attrs["data-turnstile-sitekey"] || tag.attrs["data-sitekey"] || "")
    .filter(Boolean)
    .sort();
  const analyticsIds = [...new Set(html.match(/\b(?:G|UA|AW)-[A-Z0-9-]{4,}\b/g) || [])].sort();
  return { canonical, metaRobots, gscVerification, scriptSources, turnstileSiteKeys, analyticsIds };
}

export function sitemapUrlSet(bufferOrText, contentType = "") {
  const text = Buffer.isBuffer(bufferOrText) ? bufferOrText.toString("utf8") : String(bufferOrText);
  if (contentType.includes("text/plain") || !text.includes("<")) {
    return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^https?:\/\//.test(line)))].sort();
  }
  return [
    ...new Set(
      [...text.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) => decodeEntities(match[1].trim())),
    ),
  ].sort();
}
