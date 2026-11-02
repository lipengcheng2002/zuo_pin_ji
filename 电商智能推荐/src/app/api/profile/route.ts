import type { NextRequest } from "next/server";
import { z } from "zod";
import { makeMemberProfile } from "@/lib/data/member-seeds";
import { getEventStream, getProfileBase, getProfileOverride, saveProfileOverride } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { buildProfileView, profileSummary } from "@/lib/engine/profile";
import { assertSameOrigin, clientIp, jsonError, rateLimit, zodMessage, NO_STORE } from "@/lib/security";

const schema = z.object({
  styleKeywords: z.array(z.string().max(12)).max(6).optional(),
  favoriteColors: z.array(z.string().max(12)).max(8).optional(),
  occasions: z.array(z.string().max(12)).max(8).optional(),
  budget: z
    .object({
      min: z.number().int().min(0).max(99999),
      max: z.number().int().min(100).max(99999),
    })
    .refine((value) => value.max >= value.min, { message: "预算上限需大于下限" })
    .optional(),
  sizes: z
    .object({
      top: z.string().max(8).optional(),
      bottom: z.string().max(8).optional(),
      shoes: z.string().max(8).optional(),
    })
    .optional(),
  height: z.number().int().min(140).max(210).optional(),
  weight: z.number().int().min(35).max(150).optional(),
  preferredFit: z.enum(["修身", "标准", "宽松", "直身"]).optional(),
  archetype: z
    .enum(["静奢极简", "都市通勤", "法式松弛", "复古学院", "新中式", "机能户外", "浪漫柔美"])
    .optional(),
});

export async function GET() {
  const userId = await currentUserId();
  const [events, override, profileBase] = await Promise.all([
    getEventStream(),
    getProfileOverride(userId),
    getProfileBase(userId),
  ]);
  const base = profileBase ?? makeMemberProfile({ userId, nickname: "访客" });
  const user = { ...base, ...override, sizes: { ...base.sizes, ...(override.sizes ?? {}) } };
  const profile = buildProfileView(userId, events);
  return Response.json(
    {
      user,
      override,
      profile: {
        archetype: profile.archetype,
        tags: profile.tags,
        rfm: profile.rfm,
        behavior: profile.behavior,
        affinities: profile.affinities,
        priceBand: profile.priceBand,
        sizes: profile.sizes,
        body: profile.body,
        summary: profileSummary(profile),
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const limit = rateLimit(`profile:${clientIp(request)}`, 30, 60000);
  if (!limit.allowed) return jsonError("操作过于频繁", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const userId = await currentUserId();
  const base = (await getProfileBase(userId)) ?? makeMemberProfile({ userId, nickname: "访客" });
  const { sizes: rawSizes, ...rest } = parsed.data;
  const patch: Partial<typeof base> = { ...rest };
  if (rawSizes) patch.sizes = { ...base.sizes, ...rawSizes };
  await saveProfileOverride(userId, patch);
  const events = await getEventStream();
  const profile = buildProfileView(userId, events);
  const override = await getProfileOverride(userId);
  return Response.json(
    {
      ok: true,
      user: { ...base, ...override, sizes: { ...base.sizes, ...(override.sizes ?? {}) } },
      tags: profile.tags,
    },
    { headers: NO_STORE },
  );
}
