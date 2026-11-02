import { describe, expect, it } from "vitest";
import { hashOtp, maskPhone, safeNextPath } from "@/lib/customer-auth";

describe("customer auth helpers", () => {
  it("only allows local post-login redirects", () => {
    expect(safeNextPath("/account?tab=orders")).toBe("/account?tab=orders");
    expect(safeNextPath("//evil.example")).toBe("/account");
    expect(safeNextPath("https://evil.example")).toBe("/account");
    expect(safeNextPath("/\\evil.example")).toBe("/account");
    expect(safeNextPath("/login?next=/account")).toBe("/account");
    expect(safeNextPath("/login/fallback")).toBe("/account");
    expect(safeNextPath(undefined, "/cart")).toBe("/cart");
  });

  it("masks phone numbers for display and audit", () => {
    expect(maskPhone("13800001234")).toBe("138****1234");
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("123")).toBeNull();
  });

  it("hashes OTP codes with phone binding and never returns the code", () => {
    const hash = hashOtp("13800001234", "246810");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("246810");
    expect(hash).toBe(hashOtp("13800001234", "246810"));
    expect(hash).not.toBe(hashOtp("13800001235", "246810"));
    expect(hash).not.toBe(hashOtp("13800001234", "246811"));
  });
});
