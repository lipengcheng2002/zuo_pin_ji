import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_COST = 16384;

/**
 * Store format: scrypt$<saltHex>$<hashHex>
 * scrypt (N=16384, r=8, p=1) is intentionally CPU-heavy enough to slow
 * offline guessing while staying within a serverless-friendly latency budget.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: 8,
    p: 1,
  });
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const derived = scryptSync(password, Buffer.from(saltHex, "hex"), KEY_LENGTH, {
      N: SCRYPT_COST,
      r: 8,
      p: 1,
    });
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export const createSessionToken = (): string => randomBytes(32).toString("hex");

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
