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

  // comma-wsp: (wsp+ comma? wsp*) | (comma wsp*)
  const skipCommaWsp = () => {
    skipWsp();
    if (i < n && s[i] === ",") {
      i += 1;
      skipWsp();
    }
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
      skipCommaWsp();
      continue;
    }

    let sets = 0;
    for (;;) {
      const setStart = i;
      skipCommaWsp();
      let complete = true;
      for (let k = 0; k < arity; k += 1) {
        if (k > 0) skipCommaWsp();
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

      const afterSet = i;
      skipCommaWsp();
      if (i >= n) break;
      if (isCommandLetter(s[i])) {
        i = afterSet;
        break;
      }
      i = afterSet;
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
 * Extract every `d="..."` / `d='...'` attribute value from an HTML/SVG/CSS
 * source. The match is attribute-scoped (a preceding boundary character) so
 * `data-*` and `jtbd=` never match, and it stays tag-agnostic on purpose:
 * styles.css carries path data inside a percent-encoded `data:image/svg+xml`
 * URI where the `<` of `<path` is written `%3C`.
 *
 * Script bodies and comments are dropped first, so a `const d = "..."` in
 * inline JS cannot be mistaken for path data.
 */
export function extractPathData(html) {
  const source = String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const out = [];
  const re = /(?:^|[\s"'/])d\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(source))) {
    out.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return out;
}

export const SVG_PATH_ARGUMENT_COUNT = ARGUMENT_COUNT;
