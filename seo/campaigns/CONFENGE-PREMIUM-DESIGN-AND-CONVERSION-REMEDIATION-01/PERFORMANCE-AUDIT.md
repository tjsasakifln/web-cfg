# PERFORMANCE-AUDIT

`npm run audit:performance` (OK)

| Asset | Size (uncompressed) | Soft budget (gzip target ×3) |
| --- | --- | --- |
| styles.css | ~68 KB | 240 KB |
| script.js | ~26 KB | 120 KB |

No framework runtime, carousel, video background, WebGL, or Lottie.

Lighthouse mobile scores not fabricated. Launcher available (Chrome + Playwright) for visual capture; Lighthouse CLI not run as official score.
