/**
 * Unit test: shipped script.js track() must not push PII-like params.
 * Runs the real script in a minimal browser sandbox (vm).
 */
import fs from "fs";
import vm from "vm";
import { URLSearchParams } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const code = fs.readFileSync(path.join(root, "script.js"), "utf8");

const dataLayer = [];
const document = {
  readyState: "complete",
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  documentElement: { scrollHeight: 2000 },
  addEventListener: () => {},
  body: { classList: { remove() {}, add() {} } },
};
const windowObj = {
  dataLayer,
  matchMedia: () => ({ matches: false }),
  location: {
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    search: "",
    hash: "",
  },
  document,
  addEventListener: () => {},
  innerHeight: 800,
  scrollY: 0,
  CONFENGE_DEBUG_ANALYTICS: false,
};
windowObj.window = windowObj;

const sandbox = { window: windowObj, document, console, URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const track = sandbox.window.confengeTrack;
if (typeof track !== "function") {
  console.error("FAIL: confengeTrack not exported");
  process.exit(1);
}

track("whatsapp_click", {
  page_path: "/x",
  cta_label: "ok",
  email: "should@not.pass",
  phone: "+5548999999999",
  long: "x".repeat(200),
});

const last = sandbox.window.dataLayer[sandbox.window.dataLayer.length - 1];
if (!last || last.event !== "whatsapp_click") {
  console.error("FAIL: event not pushed", last);
  process.exit(1);
}
if (last.email || last.phone || last.long) {
  console.error("FAIL: PII leaked", last);
  process.exit(1);
}
if (last.cta_label !== "ok" || last.page_path !== "/x") {
  console.error("FAIL: safe params missing", last);
  process.exit(1);
}

console.log("ANALYTICS_UNIT_OK", JSON.stringify(last));
