import { parseFragment } from "parse5";

// Test-only text extraction, never an HTML sanitizer or a rendering sink.
// Parse using HTML rules so script end tags, comments and entities are handled
// consistently with the browser instead of deleting markup with regexes.
export function htmlText(html) {
  const parts = [];
  const visit = (node) => {
    if (["script", "style", "template", "head"].includes(node.tagName)) return;
    if (node.nodeName === "#text") parts.push(node.value);
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parseFragment(String(html)));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
