import type { Review } from "@/lib/types";
import { PRODUCTS } from "@/lib/data/catalog";

const NAMES = [
  "Momo",
  "阿岚",
  "Yuki",
  "周周",
  "Vivian",
  "小满",
  "Nina",
  "木木",
  "Cici",
  "林溪",
  "Joyce",
  "迟夏",
  "Echo",
  "苏打",
  "Faye",
  "鹿鹿",
  "Tina",
  "南枝",
  "Lily",
  "青禾",
];

const CITIES = ["上海", "北京", "杭州", "深圳", "成都", "南京", "广州", "苏州"];

const REVIEW_BANK: Record<
  string,
  Array<{ title: string; body: string; rating: number; fit: "偏小" | "正常" | "偏大" }>
> = {
  outerwear: [
    {
      title: "版型比想象中更利落",
      body: "身高 165、体重 52，S 码刚好。肩线落得恰到好处，里面穿一件薄针织也不会紧。面料有分量但不压身。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "通勤和周末都能穿",
      body: "颜色很衬肤色，实物比图片更柔和。口袋位置偏高，插兜很舒服。唯一希望袖长再短 1cm。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "质感对得起价格",
      body: "收到时有一点折痕，挂一晚就恢复了。走线非常干净，里衬也做得很讲究。",
      rating: 4,
      fit: "偏小",
    },
  ],
  knitwear: [
    {
      title: "软到不想脱下来",
      body: "贴肤完全不扎，领口高度也合适。洗过一次没有起球，平铺晾干就恢复原状了。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "显瘦但有呼吸感",
      body: "本来担心修身款会勒，实际弹性很好。搭配高腰裤比例很好看，推荐。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "颜色很耐看",
      body: "不是那种饱和的亮色，带一点灰调，和衣柜里的外套都能配。",
      rating: 4,
      fit: "偏大",
    },
  ],
  shirting: [
    {
      title: "垂坠感很好",
      body: "面料有光泽但不浮夸，塞进裤腰也不会鼓。领子立得住，开会穿很得体。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "尺码建议准确",
      body: "按页面推荐选了 S，肩宽正好。袖口偏长一点，但卷起来也好看。",
      rating: 4,
      fit: "正常",
    },
    {
      title: "适合叠穿",
      body: "天气凉的时候外面加一件针织开衫，层次很好。洗后需要熨一下。",
      rating: 5,
      fit: "正常",
    },
  ],
  dresses: [
    {
      title: "腰线位置很妙",
      body: "不是那种夸张的收腰，但视觉上比例被拉长了。裙摆垂坠感很好，走路有流动感。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "场合性强",
      body: "参加朋友婚礼穿的，搭配一双细带鞋就很完整。日常加一件外套也不会太隆重。",
      rating: 5,
      fit: "偏小",
    },
    {
      title: "长度适合小个子",
      body: "158cm 穿到小腿中部，不会拖地。面料夏天贴肤也不闷。",
      rating: 4,
      fit: "正常",
    },
  ],
  trousers: [
    {
      title: "裤线真的好看",
      body: "高腰位置刚好盖住肚脐，配短上衣比例绝了。裤长对我 168 来说略长，改了 2cm。",
      rating: 5,
      fit: "偏大",
    },
    {
      title: "坐一天也不皱",
      body: "通勤党友好，起来裤线还在。口袋里布也很舒服，不磨皮肤。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "值得回购",
      body: "颜色比屏幕略深，但更百搭。腰围有一点点余量，可以系腰带。",
      rating: 4,
      fit: "正常",
    },
  ],
  skirts: [
    {
      title: "褶子很利落",
      body: "压褶很清晰，坐下站起来也没有散。腰头宽度刚好，不会勒出痕迹。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "搭配空间很大",
      body: "配卫衣是休闲感，配衬衫就能上班。颜色很高级，实物有微微的光泽。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "长度刚好",
      body: "到小腿中下段，配短靴好看。侧面开衩让走路方便很多。",
      rating: 4,
      fit: "偏小",
    },
  ],
  shoes: [
    {
      title: "第一天上脚就不磨",
      body: "脚背偏高，按建议买了大半码，非常合脚。皮子很软，走了一万步也没什么不适。",
      rating: 5,
      fit: "偏小",
    },
    {
      title: "楦型漂亮",
      body: "方头不会显脚大，跟高刚好。搭配阔腿裤露一点鞋头很好看。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "颜色非常正",
      body: "和图片一致，皮质有细腻的光泽。鞋盒包装也很用心。",
      rating: 4,
      fit: "正常",
    },
  ],
  bags: [
    {
      title: "容量和比例都刚好",
      body: "14 寸电脑放得下，肩带长度也合适，不会一直往下滑。五金件很有质感。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "越用越好看",
      body: "植鞣皮开始有一点点自然氧化，颜色变得更温润。自重轻，通勤无负担。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "细节很到位",
      body: "内袋分隔做得好，找东西不用翻。唯一的小建议是希望多一个长肩带。",
      rating: 4,
      fit: "正常",
    },
  ],
  accessories: [
    {
      title: "触感太舒服了",
      body: "围在脖子上完全不扎，长度足够绕两圈。颜色很衬大衣。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "送礼很体面",
      body: "包装精致，丝巾的图案比图片更耐看。已经回购了第二条送朋友。",
      rating: 5,
      fit: "正常",
    },
    {
      title: "轻得几乎没有重量",
      body: "耳环戴一整天也没有负担，光泽很自然，不是那种廉价的金色。",
      rating: 4,
      fit: "正常",
    },
  ],
};

const CATEGORY_KEY: Record<string, keyof typeof REVIEW_BANK> = {
  outerwear: "outerwear",
  knitwear: "knitwear",
  shirting: "shirting",
  dresses: "dresses",
  trousers: "trousers",
  skirts: "skirts",
  shoes: "shoes",
  bags: "bags",
  accessories: "accessories",
};

const pad = (n: number) => String(n).padStart(2, "0");

const buildReviews = (): Review[] => {
  const reviews: Review[] = [];
  PRODUCTS.forEach((product, productIndex) => {
    const bank = REVIEW_BANK[CATEGORY_KEY[product.category]];
    const count = 3;
    for (let i = 0; i < count; i += 1) {
      const template = bank[(productIndex + i) % bank.length];
      const size =
        product.sizes[Math.min(product.sizes.length - 1, (i + 1) % product.sizes.length)];
      const height = 158 + ((productIndex * 3 + i * 5) % 22);
      const weight = 47 + ((productIndex * 2 + i * 4) % 22);
      const month = 7 + ((productIndex + i) % 3);
      const day = 3 + ((productIndex * 5 + i * 7) % 25);
      reviews.push({
        id: `rv_${product.id}_${i + 1}`,
        productId: product.id,
        author: NAMES[(productIndex + i * 3) % NAMES.length],
        city: CITIES[(productIndex + i) % CITIES.length],
        rating: template.rating,
        date: `2026-${pad(month)}-${pad(day)}`,
        title: template.title,
        body: template.body,
        fitFeedback: template.fit,
        height,
        weight,
        purchasedSize: size.label === "均码" ? "均码" : size.label,
        helpful: 4 + ((productIndex * 7 + i * 11) % 38),
        verified: true,
      });
    }
  });
  return reviews;
};

export const REVIEWS: Review[] = buildReviews();

export const reviewStats = (productId: string) => {
  const list = REVIEWS.filter((r) => r.productId === productId);
  const average =
    list.reduce((sum, r) => sum + r.rating, 0) / Math.max(1, list.length);
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: list.filter((r) => r.rating === star).length,
  }));
  return { list, average, distribution, count: list.length };
};
