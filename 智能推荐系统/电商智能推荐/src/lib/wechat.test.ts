import { describe, expect, it } from "vitest";
import {
  buildWechatAuthorizeUrl,
  openOAuthState,
  sealOAuthState,
} from "@/lib/wechat";

const SECRET = "test-wechat-secret-0123456789";

describe("WeChat OAuth helpers", () => {
  it("builds a website authorization URL with an encoded callback", () => {
    const url = buildWechatAuthorizeUrl({
      appId: "wx1234567890",
      redirectUri: "https://shop.example.com/api/auth/wechat/callback",
      state: "state-value",
      scope: "snsapi_userinfo",
    });
    expect(url.startsWith("https://open.weixin.qq.com/connect/oauth2/authorize?")).toBe(true);
    expect(url).toContain("appid=wx1234567890");
    expect(url).toContain(
      "redirect_uri=https%3A%2F%2Fshop.example.com%2Fapi%2Fauth%2Fwechat%2Fcallback",
    );
    expect(url).toContain("scope=snsapi_userinfo");
    expect(url).toContain("state=state-value");
    expect(url.endsWith("#wechat_redirect")).toBe(true);
  });

  it("round-trips signed state with an allowlisted next path", () => {
    const sealed = sealOAuthState("abc123", "/account?tab=wishlist", SECRET);
    expect(openOAuthState(sealed, SECRET)).toEqual({
      state: "abc123",
      next: "/account?tab=wishlist",
    });
    const unsafe = sealOAuthState("abc123", "https://evil.example", SECRET);
    expect(openOAuthState(unsafe, SECRET)?.next).toBe("/account");
  });

  it("rejects tampered payloads and wrong secrets", () => {
    const sealed = sealOAuthState("abc123", "/account", SECRET);
    const tampered = sealed.replace(/^./, (char) => (char === "a" ? "b" : "a"));
    expect(openOAuthState(tampered, SECRET)).toBeNull();
    expect(openOAuthState(sealed, `${SECRET}-wrong`)).toBeNull();
    expect(openOAuthState(undefined, SECRET)).toBeNull();
    expect(openOAuthState("not-a-token", SECRET)).toBeNull();
  });
});
