import type { MetadataRoute } from "next";
import { CATEGORIES, PRODUCTS } from "@/lib/data/catalog";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/stylist`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...CATEGORIES.map((category) => ({
      url: `${siteUrl}/shop?category=${category.key}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...PRODUCTS.map((product) => ({
      url: `${siteUrl}/product/${product.slug}`,
      lastModified: new Date(product.releaseDate),
      changeFrequency: "weekly" as const,
      priority: 0.75,
    })),
  ];
}
