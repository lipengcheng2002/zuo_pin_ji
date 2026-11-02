export type CategoryKey =
  | "outerwear"
  | "knitwear"
  | "shirting"
  | "dresses"
  | "trousers"
  | "skirts"
  | "shoes"
  | "bags"
  | "accessories";

export type Category = {
  key: CategoryKey;
  label: string;
  labelEn: string;
  description: string;
  subcategories: string[];
};

export type ColorOption = {
  name: string;
  code: string;
  hex: string;
  secondary?: string;
};

export type SizeOption = {
  label: string;
  stock: number;
};

export type Material = {
  name: string;
  pct: number;
};

export type GarmentArt =
  | "coat"
  | "trench"
  | "jacket"
  | "blazer"
  | "knit"
  | "cardigan"
  | "shirt"
  | "dress"
  | "trouser"
  | "skirt"
  | "shoe"
  | "bag"
  | "scarf"
  | "accessory";

export type Product = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  nameEn: string;
  category: CategoryKey;
  subcategory: string;
  price: number;
  compareAt: number | null;
  currency: "CNY";
  colors: ColorOption[];
  sizes: SizeOption[];
  materials: Material[];
  role: "outer" | "top" | "bottom" | "dress" | "shoes" | "bag" | "accessory";
  fit: string;
  length: string;
  fabricWeight: string;
  season: string[];
  styleTags: string[];
  occasions: string[];
  description: string;
  story: string;
  features: {
    silhouette: string;
    neckline: string;
    warmth: number;
    breathability: number;
    stretch: number;
    formality: number;
    versatility: number;
  };
  care: string;
  origin: string;
  modelInfo: string;
  rating: number;
  reviewCount: number;
  sold30d: number;
  badges: string[];
  editorial: {
    art: GarmentArt;
    palette: [string, string];
    accent: string;
    caption: string;
  };
  releaseDate: string;
  featured: boolean;
};

export type Review = {
  id: string;
  productId: string;
  author: string;
  city: string;
  rating: number;
  date: string;
  title: string;
  body: string;
  fitFeedback: "偏小" | "正常" | "偏大";
  height: number;
  weight: number;
  purchasedSize: string;
  helpful: number;
  verified: boolean;
};

export type StyleArchetype =
  | "静奢极简"
  | "都市通勤"
  | "法式松弛"
  | "复古学院"
  | "新中式"
  | "机能户外"
  | "浪漫柔美";

export type UserProfile = {
  id: string;
  name: string;
  avatarInitials: string;
  city: string;
  age: number;
  gender: "女" | "男" | "不限";
  height: number;
  weight: number;
  bodyType: string;
  sizes: { top: string; bottom: string; shoes: string };
  archetype: StyleArchetype;
  styleKeywords: string[];
  favoriteColors: string[];
  avoidColors: string[];
  occasions: string[];
  budget: { min: number; max: number };
  preferredFit: string;
  memberTier: "黑金" | "白金" | "银卡" | "新客";
  points: number;
  joinedAt: string;
  tags: string[];
  lifetimeValue: number;
  ordersCount: number;
  lastActiveAt: string;
  isDemo?: boolean;
};

export type BehaviorType =
  | "view"
  | "click"
  | "wishlist"
  | "add_to_cart"
  | "purchase"
  | "search"
  | "chat";

export type BehaviorEvent = {
  id: string;
  userId: string;
  type: BehaviorType;
  productId?: string;
  query?: string;
  scene: string;
  ts: string;
  weight: number;
  sessionId: string;
};

export type Address = {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
};

export type CartLine = {
  productId: string;
  size: string;
  color: string;
  qty: number;
  addedAt: string;
};

export type Cart = {
  sessionId: string;
  userId: string | null;
  lines: CartLine[];
  couponCode: string | null;
  updatedAt: string;
};

export type OrderStatus = "待发货" | "已发货" | "已完成" | "已取消" | "已退货";

export type OrderItem = {
  productId: string;
  name: string;
  size: string;
  color: string;
  qty: number;
  unitPrice: number;
  art: GarmentArt;
};

export type Order = {
  id: string;
  orderNo: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  address: Address;
  paymentMethod: string;
  channel: "官网" | "AI 造型师" | "小程序";
  trackingNo?: string;
  paymentStatus?: "unpaid" | "paid" | "refund_pending" | "refunded";
  paymentProvider?: "demo" | "wechat" | "alipay";
  paymentRef?: string;
  refundAmount?: number;
  refundedAt?: string;
  pointsEarned: number;
  idempotencyKey?: string;
  statusHistory?: Array<{ status: OrderStatus; at: string; by: string }>;
};

export type Coupon = {
  code: string;
  label: string;
  type: "percent" | "fixed" | "shipping";
  value: number;
  minSpend: number;
  description: string;
};
