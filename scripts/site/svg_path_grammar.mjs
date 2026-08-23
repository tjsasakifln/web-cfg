/**
 * SVG path data (`d`) grammar parser.
 *
 * Implements the SVG 1.1 / SVG 2 `svg-path` BNF so a malformed `d` attribute is
 * rejected the same way a browser rejects it ("Expected number", "Expected
 * arc flag", "Expected moveto"). Tokenizing alone is not enough: the corrupted
 * WhatsApp glyph of issue #187 tokenizes into valid numbers but ships the wrong
 * number of arguments per command, so arity has to be enforced too.
 *
 * parseSvgPath(d) -> { ok: true, empty, commands } | { ok: false, error, index }
 */

const ARGUMENT_COUNT = Object.freeze({
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
});

const ARC_FLAG_POSITIONS = Object.freeze([3, 4]);

function isCommandLetter(ch) {
  return ch !== undefined && Object.prototype.hasOwnProperty.call(ARGUMENT_COUNT, ch.toUpperCase());
}

function isWsp(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

export function parseSvgPath(d) {
  const s = String(d ?? "");
  const n = s.length;
  let i = 0;

  const fail = (error) => ({ ok: false, error, index: i });

  const skipWsp = () => {
    while (i < n && isWsp(s[i])) i += 1;
  };

  // comma-wsp: (wsp+ comma? wsp*) | (comma wsp*). Return whether a comma
  // was consumed: unlike whitespace, it can never dangle before a command or
  // at the end of path data.
  const skipCommaWsp = () => {
    const start = i;
    skipWsp();
    let comma = false;
    if (i < n && s[i] === ",") {
      comma = true;
      i += 1;
      skipWsp();
    }
    return { comma, consumed: i > start };
  };

  const readNumber = () => {
    const start = i;
    if (i < n && (s[i] === "+" || s[i] === "-")) i += 1;
    let intDigits = 0;
    while (i < n && isDigit(s[i])) {
      i += 1;
      intDigits += 1;
    }
    let fracDigits = 0;
    if (i < n && s[i] === ".") {
      i += 1;
      while (i < n && isDigit(s[i])) {
        i += 1;
        fracDigits += 1;
      }
    }
    if (intDigits === 0 && fracDigits === 0) {
      i = start;
      return null;
    }
    if (i < n && (s[i] === "e" || s[i] === "E")) {
      const beforeExponent = i;
      i += 1;
      if (i < n && (s[i] === "+" || s[i] === "-")) i += 1;
      let expDigits = 0;
      while (i < n && isDigit(s[i])) {
        i += 1;
        expDigits += 1;
      }
      if (expDigits === 0) i = beforeExponent;
    }
    return s.slice(start, i);
  };

  // Arc flags are a single "0" or "1" character, never a general number.
  const readFlag = () => {
    if (i < n && (s[i] === "0" || s[i] === "1")) {
      const flag = s[i];
      i += 1;
      return flag;
    }
    return null;
  };

  skipWsp();
  if (i >= n) return { ok: true, empty: true, commands: 0 };
  const noneStart = i;
  if (s.slice(i, i + 4) === "none") {
    i += 4;
    skipWsp();
    if (i >= n) return { ok: true, empty: true, commands: 0 };
    i = noneStart;
  }

  if (s[i] !== "M" && s[i] !== "m") {
    return fail("path data must start with a moveto command (M/m)");
  }

  let commands = 0;

  while (i < n) {
    const command = s[i];
    if (!isCommandLetter(command)) {
      return fail(`expected a path command, found ${JSON.stringify(s[i])}`);
    }
    i += 1;
    commands += 1;

    const upper = command.toUpperCase();
    const arity = ARGUMENT_COUNT[upper];

    if (arity === 0) {
      skipWsp();
      if (i < n && s[i] === ",") {
        return fail(`command "${command}" cannot be followed by a comma`);
      }
      continue;
    }

    let sets = 0;
    for (;;) {
      const setStart = i;
      // A command may be followed by whitespace, but never by a comma. A
      // comma is only a separator between argument sets/arguments.
      if (sets === 0) {
        skipWsp();
        if (i < n && s[i] === ",") {
          return fail(`command "${command}" cannot start its arguments with a comma`);
        }
      } else {
        const separator = skipCommaWsp();
        if (separator.comma && (i >= n || isCommandLetter(s[i]))) {
          return fail(`command "${command}" has a trailing comma`);
        }
        if (i >= n || isCommandLetter(s[i])) break;
      }

      let complete = true;
      for (let k = 0; k < arity; k += 1) {
        if (k > 0) {
          const separator = skipCommaWsp();
          if (separator.comma && (i >= n || isCommandLetter(s[i]))) {
            return fail(`command "${command}" has a trailing comma`);
          }
        }
        const value =
          upper === "A" && ARC_FLAG_POSITIONS.includes(k) ? readFlag() : readNumber();
        if (value === null) {
          complete = false;
          if (sets === 0) {
            if (upper === "A" && ARC_FLAG_POSITIONS.includes(k)) {
              return fail(`command "${command}" expected an arc flag (0 or 1) at argument ${k + 1}`);
            }
            return fail(
              `command "${command}" expected ${arity} argument(s), got ${k} before ${JSON.stringify(s.slice(i, i + 8))}`,
            );
          }
          break;
        }
      }
      if (!complete) {
        i = setStart;
        break;
      }
      sets += 1;

    }

    skipWsp();
    if (i >= n) break;
    if (!isCommandLetter(s[i])) {
      return fail(
        `command "${command}" has a trailing partial argument set near ${JSON.stringify(s.slice(i, i + 12))}`,
      );
    }
  }

  return { ok: true, empty: false, commands };
}

/**
 * Extract every quoted or unquoted `d` attribute from `<path>` elements in an
 * HTML/SVG/CSS source. Literal and percent-encoded tags are both inspected
 * because styles.css carries path data in a `data:image/svg+xml` URI.
 *
 * Script bodies and comments are dropped first, so a `const d = "..."` in
 * inline JS cannot be mistaken for path data.
 */
export function extractPathData(markup, { documentMode = "html" } = {}) {
  // End tags may carry stray whitespace/attributes (`</script\n foo="bar">`) and
  // comments may close with `--!>`; browsers accept both, so the strippers do too.
  const blankMatch = (match) => " ".repeat(match.length);
  const stripInactiveMarkup = (value) =>
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, blankMatch)
      .replace(/<(textarea|title)\b[^>]*>[\s\S]*?<\/\1\b[^>]*>/gi, blankMatch)
      .replace(/<!--[\s\S]*?--!?>/g, blankMatch);

  // Decode a data-URI payload once while retaining which output characters came
  // from percent escapes. Literal HTML must not treat `d="M0%200"` as valid,
  // but `%3Cpath%20d%3D%22M0%200%22%3E` in CSS must be audited after URL decode.
  const percentDecodeWithOrigins = (value) => {
    let text = "";
    const decoded = [];
    for (let offset = 0; offset < value.length; offset += 1) {
      const hex = value.slice(offset + 1, offset + 3);
      if (value[offset] === "%" && /^[0-9a-f]{2}$/i.test(hex)) {
        text += String.fromCharCode(Number.parseInt(hex, 16));
        decoded.push(true);
        offset += 2;
      } else {
        text += value[offset];
        decoded.push(false);
      }
    }
    return { text, decoded };
  };

  // HTML character references are decoded by the browser before the SVG path
  // grammar sees the attribute. Decode the path-relevant named entities and all
  // numeric references exactly once; unknown/malformed references remain in the
  // value and therefore fail closed in parseSvgPath().
  const namedEntities = Object.freeze({
    amp: "&",
    apos: "'",
    comma: ",",
    gt: ">",
    lt: "<",
    NewLine: "\n",
    nbsp: "\u00a0",
    period: ".",
    plus: "+",
    quot: '"',
    Tab: "\t",
  });
  const xmlNamedEntities = new Set(["amp", "apos", "gt", "lt", "quot"]);
  const decodeHtmlEntities = (value, { htmlNamed = true, requireSemicolon = false } = {}) =>
    value.replace(
      /&#(?:[xX][0-9a-fA-F]+|[0-9]+);?|&(?:amp|apos|comma|gt|lt|NewLine|nbsp|period|plus|quot|Tab);/g,
      (reference) => {
        if (requireSemicolon && !reference.endsWith(";")) return reference;
        if (!reference.startsWith("&#")) {
          const name = reference.slice(1, -1);
          if (!htmlNamed && !xmlNamedEntities.has(name)) return reference;
          return namedEntities[name] ?? reference;
        }
        const raw = reference.replace(/^&#/, "").replace(/;$/, "");
        const radix = raw[0] === "x" || raw[0] === "X" ? 16 : 10;
        const digits = radix === 16 ? raw.slice(1) : raw;
        const codePoint = Number.parseInt(digits, radix);
        if (
          !Number.isFinite(codePoint) ||
          codePoint === 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return "\ufffd";
        }
        return String.fromCodePoint(codePoint);
      },
    );

  const isTagSpace = (ch) =>
    ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";

  // A regex ending at the first `>` truncates valid tags such as
  // `<path data-note=">" d="...">`. This scanner ends a start tag only when
  // `>` occurs outside a quoted value.
  const pathStartTags = (value, acceptOpen = () => true, { xml = false } = {}) => {
    const tags = [];
    for (let start = 0; start < value.length; start += 1) {
      if (value[start] !== "<" || !acceptOpen(start)) continue;
      const tagName = value.slice(start + 1, start + 5);
      if (xml ? tagName !== "path" : tagName.toLowerCase() !== "path") continue;
      const boundary = value[start + 5];
      if (boundary !== undefined && !isTagSpace(boundary) && boundary !== "/" && boundary !== ">") {
        continue;
      }
      let quote = null;
      for (let end = start + 5; end < value.length; end += 1) {
        const ch = value[end];
        if (quote !== null) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === ">") {
          tags.push(value.slice(start, end + 1));
          start = end;
          break;
        }
      }
    }
    return tags;
  };

  const dAttribute = (tag, entityOptions = {}) => {
    let offset = 5; // `<path`
    while (offset < tag.length - 1) {
      while (isTagSpace(tag[offset])) offset += 1;
      if (tag[offset] === "/" || tag[offset] === ">" || tag[offset] === undefined) break;

      const nameStart = offset;
      while (
        offset < tag.length &&
        !isTagSpace(tag[offset]) &&
        tag[offset] !== "=" &&
        tag[offset] !== "/" &&
        tag[offset] !== ">"
      ) {
        offset += 1;
      }
      const rawName = tag.slice(nameStart, offset);
      const name = entityOptions.xml ? rawName : rawName.toLowerCase();
      while (isTagSpace(tag[offset])) offset += 1;
      if (tag[offset] !== "=") continue;
      offset += 1;
      while (isTagSpace(tag[offset])) offset += 1;

      let rawValue;
      if (tag[offset] === '"' || tag[offset] === "'") {
        const quote = tag[offset];
        const valueStart = ++offset;
        while (offset < tag.length && tag[offset] !== quote) offset += 1;
        rawValue = tag.slice(valueStart, offset);
        if (tag[offset] === quote) offset += 1;
      } else {
        const valueStart = offset;
        while (offset < tag.length && !isTagSpace(tag[offset]) && tag[offset] !== ">") {
          offset += 1;
        }
        rawValue = tag.slice(valueStart, offset);
      }
      if (name === "d") return decodeHtmlEntities(rawValue, entityOptions);
    }
    return null;
  };

  const source = stripInactiveMarkup(String(markup ?? ""));
  const out = [];
  const literalXml = documentMode === "xml";
  const xmlEntityOptions = { htmlNamed: false, requireSemicolon: true, xml: true };
  for (const tag of pathStartTags(source, () => true, { xml: literalXml })) {
    const value = dAttribute(tag, literalXml ? xmlEntityOptions : undefined);
    if (value !== null) out.push(value);
  }

  const percent = percentDecodeWithOrigins(source);
  const decodedSource = stripInactiveMarkup(percent.text);
  for (const tag of pathStartTags(
    decodedSource,
    (start) => percent.decoded[start] === true,
    { xml: true },
  )) {
    // Percent-encoded SVG data URIs are XML, where only the five predefined
    // named entities exist. Numeric references remain valid in both modes.
    const value = dAttribute(tag, xmlEntityOptions);
    if (value !== null) out.push(value);
  }

  // Base64 SVG data URIs are another shipped representation. Decode only a
  // syntactically bounded payload and inspect its XML once; arbitrary base64
  // elsewhere in the document is not treated as markup.
  for (const match of decodedSource.matchAll(
    /data:image\/svg\+xml(?:;[^,;\s"'()]+)*;base64,([a-z0-9+/=\t\n\f\r ]+)(?=["')>]|$)/gi,
  )) {
    const compactPayload = match[1].replace(/[\t\n\f\r ]/g, "");
    let decoded;
    try {
      const binary = atob(compactPayload);
      decoded = Buffer.from(binary, "binary").toString("utf8");
    } catch {
      continue;
    }
    for (const tag of pathStartTags(stripInactiveMarkup(decoded), () => true, { xml: true })) {
      const value = dAttribute(tag, xmlEntityOptions);
      if (value !== null) out.push(value);
    }
  }
  return out;
}

export const SVG_PATH_ARGUMENT_COUNT = ARGUMENT_COUNT;
