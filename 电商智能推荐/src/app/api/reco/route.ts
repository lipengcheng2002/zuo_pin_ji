import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEventStream } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { buildProfileView } from "@/lib/engine/profile";
import { recommend } from "@/lib/engine/recommend";
import {
  NO_STORE,
  assertSameOrigin,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";

const schema = z.object({
  scene: z
    .enum(["home", "stylist", "pdp", "cart", "search", "checkout", "email"])
    .default("home"),
  limit: z.number().int().min(1).max(24).optional(),
  triggerProductId: z.string().max(40).optional(),
  query: z.string().max(300).optional(),
  interests: z.array(z.string().max(40)).max(8).optional(),
  constraints: z
    .object({
      categories: z.array(z.string()).max(4).optional(),
      excludeCategories: z.array(z.string()).max(4).optional(),
      colors: z.array(z.string()).max(6).optional(),
      sizes: z.array(z.string()).max(4).optional(),
      occasions: z.array(z.string()).max(4).optional(),
      styleTags: z.array(z.string()).max(4).optional(),
      priceMin: z.number().min(0).max(99999).optional(),
      priceMax: z.number().min(0).max(99999).optional(),
      excludeProductIds: z.array(z.string()).max(40).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const limit = rateLimit(`reco:${clientIp(request)}`, 90, 60000);
  if (!limit.allowed) return jsonError("请求过于频繁", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload ?? {});
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  try {
    const [events, userId] = await Promise.all([getEventStream(), currentUserId()]);
    const profile = buildProfileView(userId, events, parsed.data.interests);
    const result = recommend(
      {
        userId,
        scene: parsed.data.scene,
        limit: parsed.data.limit,
        triggerProductId: parsed.data.triggerProductId,
        query: parsed.data.query,
        interests: parsed.data.interests,
        constraints: parsed.data.constraints as never,
      },
      { events, userProfile: profile },
    );
    return Response.json(
      {
        items: result.items,
        trace: result.trace,
        fallback: result.fallback,
        profile: {
          archetype: profile.archetype,
          tags: profile.tags,
          coldStart: profile.isColdStart,
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[reco] failed", error);
    return jsonError("推荐服务暂时不可用", 503);
  }
}
