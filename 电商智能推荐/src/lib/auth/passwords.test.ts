import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  safeEqual,
  verifyPassword,
} from "@/lib/auth/passwords";

describe("operator passwords", () => {
  it("hashes with a unique salt and verifies", () => {
    const first = hashPassword("zhiyan-console");
    const second = hashPassword("zhiyan-console");
    expect(first).not.toBe(second);
    expect(first.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("zhiyan-console", first)).toBe(true);
    expect(verifyPassword("zhiyan-console", second)).toBe(true);
    expect(verifyPassword("wrong-password", first)).toBe(false);
  });

  it("rejects malformed hashes", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt$abc$def")).toBe(false);
    expect(verifyPassword("x", "scrypt$zz$zz")).toBe(false);
  });

  it("hashes session tokens deterministically", () => {
    const token = createSessionToken();
    expect(token).toHaveLength(64);
    expect(hashSessionToken(token)).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(safeEqual(hashSessionToken(token), hashSessionToken(token))).toBe(true);
    expect(safeEqual("a", "b")).toBe(false);
  });
});
