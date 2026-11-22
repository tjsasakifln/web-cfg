import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 << 20 };
const hashPattern = /^[a-f0-9]{32}:[a-f0-9]{64}$/;
const dummyHash = "0".repeat(32) + ":" + "0".repeat(64);

export const accounts = Object.freeze({ client: "EXTRA", admin: "admincfg" });
export const sessionLifetime = 12 * 3600;
export const cookieName = "__Secure-cfg_portal";
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");

export function equalDigest(value, expected) {
  return typeof value === "string" && value.length <= 256 && /^[a-f0-9]{64}$/.test(expected || "")
    && timingSafeEqual(Buffer.from(digest(value), "hex"), Buffer.from(expected, "hex"));
}

export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 32, options);
  return salt + ":" + hash.toString("hex");
}

export function isPasswordHash(hash) {
  return typeof hash === "string" && hashPattern.test(hash);
}

export async function verifyPassword(password, stored) {
  const [salt, expected] = (isPasswordHash(stored) ? stored : dummyHash).split(":");
  const actual = await derive(password, salt, 32, options);
  return timingSafeEqual(actual, Buffer.from(expected, "hex")) && isPasswordHash(stored);
}

export function sessionCookie(token, age = sessionLifetime) {
  return cookieName + "=" + token + "; Path=/api/portal; Max-Age=" + age + "; HttpOnly; Secure; SameSite=Strict";
}

export function getSessionToken(req) {
  const candidate = (req.headers.cookie || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(candidate || "") ? candidate : null;
}
