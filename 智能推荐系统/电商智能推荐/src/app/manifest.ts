import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "织言 ZHIYAN — AI 时装衣橱",
    short_name: "织言",
    description: "企业级服装电商与 AI 造型师",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f1ea",
    theme_color: "#17160f",
    lang: "zh-CN",
    categories: ["shopping", "lifestyle"],
    shortcuts: [
      { name: "AI 造型师", url: "/stylist" },
      { name: "个人中心", url: "/account" },
      { name: "购物袋", url: "/cart" },
    ],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
