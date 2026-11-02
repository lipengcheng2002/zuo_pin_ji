import { DEMO_USER_ID, ORDERS } from "@/lib/data/community";
import type { Customer } from "@/lib/store/types";
import type { Order, UserProfile } from "@/lib/types";

export const TEST_MEMBER_ID = "u_test_member";
export const DEMO_CUSTOMER_ID = "cus_demo_lin";
export const TEST_CUSTOMER_ID = "cus_test_member";

const now = new Date().toISOString();

export const seedCustomers = (): Customer[] => [
  {
    id: DEMO_CUSTOMER_ID,
    userId: DEMO_USER_ID,
    phone: "13900000000",
    wechatOpenId: "demo_wechat_member",
    nickname: "林知夏",
    avatarTone: "#c9a87b",
    source: "wechat",
    createdAt: "2025-09-18T08:00:00.000Z",
    lastLoginAt: now,
  },
  {
    id: TEST_CUSTOMER_ID,
    userId: TEST_MEMBER_ID,
    phone: "13800000000",
    wechatOpenId: null,
    nickname: "周予安",
    avatarTone: "#7d8a72",
    source: "phone",
    createdAt: "2026-01-12T08:00:00.000Z",
    lastLoginAt: now,
  },
];

export const seedCustomerProfiles = (): Record<string, UserProfile> => ({
  [TEST_MEMBER_ID]: {
    id: TEST_MEMBER_ID,
    name: "周予安",
    avatarInitials: "周",
    city: "上海",
    age: 29,
    gender: "女",
    height: 168,
    weight: 55,
    bodyType: "沙漏型",
    sizes: { top: "M", bottom: "M", shoes: "38" },
    archetype: "都市通勤",
    styleKeywords: ["极简", "通勤", "低饱和"],
    favoriteColors: ["墨黑", "雾白", "驼色"],
    avoidColors: ["荧光"],
    occasions: ["通勤", "周末"],
    budget: { min: 800, max: 2600 },
    preferredFit: "合身",
    memberTier: "银卡",
    points: 260,
    joinedAt: "2026-01-12",
    tags: ["通勤客", "偏好低饱和"],
    lifetimeValue: 4280,
    ordersCount: 2,
    lastActiveAt: now,
  },
});

const testOrders = (): Order[] => {
  const sources = ORDERS.slice(0, 2);
  return sources.map((order, index) => ({
    ...order,
    id: `ord_test_${index + 1}`,
    orderNo: `ZYT202600000${index + 1}`,
    userId: TEST_MEMBER_ID,
    address: { ...order.address, name: "周予安", phone: "13800000000" },
    status: "已完成",
    statusHistory: [
      { status: "待发货" as const, at: order.createdAt, by: "system" },
      { status: "已发货" as const, at: order.createdAt, by: "ops" },
      { status: "已完成" as const, at: order.createdAt, by: "ops" },
    ],
    trackingNo: index === 0 ? "SF9000000001" : "SF9000000002",
  }));
};

export const seedTestOrders = testOrders;

export const makeMemberProfile = (input: {
  userId: string;
  nickname: string;
  phone?: string | null;
}): UserProfile => ({
  id: input.userId,
  name: input.nickname,
  avatarInitials: input.nickname.slice(0, 1),
  city: "上海",
  age: 28,
  gender: "女",
  height: 165,
  weight: 52,
  bodyType: "未填写",
  sizes: { top: "M", bottom: "M", shoes: "37" },
  archetype: "都市通勤",
  styleKeywords: ["极简", "通勤"],
  favoriteColors: ["墨黑", "燕麦"],
  avoidColors: [],
  occasions: ["通勤", "周末"],
  budget: { min: 600, max: 2200 },
  preferredFit: "合身",
  memberTier: "新客",
  points: 0,
  joinedAt: new Date().toISOString().slice(0, 10),
  tags: ["新客", "待完善画像"],
  lifetimeValue: 0,
  ordersCount: 0,
  lastActiveAt: new Date().toISOString(),
});
