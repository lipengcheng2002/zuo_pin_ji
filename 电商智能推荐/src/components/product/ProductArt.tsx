import type { SVGProps } from "react";
import type { GarmentArt } from "@/lib/types";
import { cn } from "@/lib/utils/format";

const mixHex = (hex: string, target: string, amount: number): string => {
  const parse = (value: string) => {
    const clean = value.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const a = parse(hex);
  const b = parse(target);
  return `#${a
    .map((channel, index) =>
      Math.round(channel + (b[index] - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

const silhouettes: Partial<Record<GarmentArt, string>> = {
  coat: "M148 96 L118 120 L96 300 L110 432 L152 424 L146 300 L140 438 L260 438 L254 300 L248 424 L290 432 L304 300 L282 120 L252 96 Q200 126 148 96 Z",
  trench:
    "M148 90 L116 116 L94 320 L108 448 L152 440 L146 320 L138 456 L262 456 L254 320 L248 440 L292 448 L306 320 L284 116 L252 90 Q200 126 148 90 Z",
  jacket:
    "M146 110 L116 132 L102 260 L112 332 L154 326 L148 250 L144 338 L256 338 L252 250 L246 326 L288 332 L298 260 L284 132 L254 110 Q200 136 146 110 Z",
  blazer:
    "M146 100 L114 124 L102 290 L110 362 L154 356 L150 290 L144 368 L256 368 L250 290 L246 356 L290 362 L298 290 L286 124 L254 100 Q200 128 146 100 Z",
  knit: "M158 108 L126 128 L108 240 L114 302 L148 298 L144 376 L256 376 L252 298 L286 302 L292 240 L274 128 L242 108 Q200 132 158 108 Z",
  cardigan:
    "M156 106 L126 128 L110 250 L116 372 L188 372 L190 152 L200 130 L210 152 L212 372 L284 372 L290 250 L274 128 L244 106 Q200 128 156 106 Z",
  shirt:
    "M152 104 L120 126 L106 240 L114 320 L148 314 L146 372 L254 372 L252 314 L286 320 L294 240 L280 126 L248 104 Q200 130 152 104 Z",
  dress:
    "M158 96 L132 118 L128 210 L118 236 L96 440 Q200 468 304 440 L282 236 L272 210 L268 118 L242 96 Q200 124 158 96 Z",
  trouser:
    "M128 108 L272 108 L286 214 Q282 330 258 444 L216 444 Q206 320 200 272 Q194 320 184 444 L142 444 Q118 330 114 214 Z",
  skirt: "M136 150 L264 150 L292 430 Q200 452 108 430 Z",
};

const details: Record<GarmentArt, React.ReactNode> = {
  coat: (
    <>
      <path d="M150 92L188 136L174 244L200 300M250 92L212 136L226 244L200 300" />
      <path d="M120 118L130 300L112 430M280 118L270 300L288 430" strokeOpacity="0.45" />
      <path d="M104 292Q200 312 296 292L294 320Q200 340 106 320Z" fill="currentColor" fillOpacity="0.08" />
      <path d="M200 340L200 438" strokeOpacity="0.4" />
      <path d="M140 356L178 362M260 356L222 362" strokeOpacity="0.5" />
      <circle cx="200" cy="252" r="2.2" fill="currentColor" fillOpacity="0.7" stroke="none" />
      <circle cx="200" cy="276" r="2.2" fill="currentColor" fillOpacity="0.7" stroke="none" />
    </>
  ),
  trench: (
    <>
      <path d="M148 90L200 132L252 90L238 120L200 142L162 120Z" />
      <path d="M200 132L268 140M200 132L132 140" strokeOpacity="0.45" />
      <path d="M116 116L128 320L108 448M284 116L272 320L292 448" strokeOpacity="0.45" />
      <path d="M84 306Q200 328 316 306L314 336Q200 358 86 336Z" fill="currentColor" fillOpacity="0.08" />
      <path d="M200 142L200 306M200 336L200 458" strokeOpacity="0.35" />
      <path d="M150 196L232 200M150 224L232 228M150 252L232 256" strokeDasharray="2 7" strokeOpacity="0.55" />
      <circle cx="256" cy="198" r="2" fill="currentColor" stroke="none" />
      <circle cx="256" cy="226" r="2" fill="currentColor" stroke="none" />
      <circle cx="256" cy="254" r="2" fill="currentColor" stroke="none" />
      <path d="M128 372L176 386M272 372L224 386" strokeOpacity="0.5" />
    </>
  ),
  jacket: (
    <>
      <path d="M170 108Q200 92 230 108L226 128Q200 116 174 128Z" />
      <path d="M200 132L200 330" strokeDasharray="2 5" />
      <path d="M112 322L288 322M120 330L120 338M140 329L140 338M160 328L160 338M180 327L180 338M200 327L200 338M220 327L220 338M240 328L240 338M260 329L260 338M280 330L280 338" strokeOpacity="0.45" />
      <path d="M140 250L174 262M260 250L226 262" strokeOpacity="0.45" />
      <path d="M200 130L214 152" strokeOpacity="0.4" />
    </>
  ),
  blazer: (
    <>
      <path d="M146 100L200 172L200 258L172 152L146 100Z" fill="currentColor" fillOpacity="0.09" />
      <path d="M254 100L200 172L200 258L228 152L254 100Z" fill="currentColor" fillOpacity="0.09" />
      <path d="M146 100L162 118L176 154M254 100L238 118L224 154" strokeOpacity="0.5" />
      <path d="M200 258L200 366" strokeOpacity="0.35" />
      <circle cx="200" cy="296" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="200" cy="320" r="2.6" fill="currentColor" stroke="none" />
      <path d="M130 322L180 322M270 322L220 322" strokeOpacity="0.6" />
      <path d="M234 206L272 210" strokeOpacity="0.45" />
    </>
  ),
  knit: (
    <>
      <path d="M170 96Q200 72 230 96L236 124Q200 100 164 124Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M200 118L200 128" strokeOpacity="0.4" />
      <path d="M110 240L118 300M290 240L282 300" strokeOpacity="0.4" />
      <path d="M148 356L148 374M164 356L164 374M180 356L180 374M196 356L196 374M212 356L212 374M228 356L228 374M244 356L244 374" strokeOpacity="0.35" />
      <path d="M124 128L138 300M276 128L262 300" strokeOpacity="0.3" />
      <path d="M144 296L144 314M160 296L160 314M176 296L176 314" strokeOpacity="0.25" />
    </>
  ),
  cardigan: (
    <>
      <path d="M156 106L124 128L112 250L118 372L188 372L190 152Z" fill="currentColor" fillOpacity="0.08" />
      <path d="M244 106L276 128L288 250L282 372L212 372L210 152Z" fill="currentColor" fillOpacity="0.08" />
      <path d="M190 152L200 300L210 152" strokeOpacity="0.4" />
      <circle cx="190" cy="220" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="190" cy="250" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="190" cy="280" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="190" cy="310" r="2.2" fill="currentColor" stroke="none" />
      <path d="M118 356L188 356M212 356L282 356" strokeOpacity="0.4" />
    </>
  ),
  shirt: (
    <>
      <path d="M168 104L200 128L186 146L160 120Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M232 104L200 128L214 146L240 120Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M200 128L200 370" strokeOpacity="0.6" />
      <circle cx="200" cy="164" r="2" fill="currentColor" stroke="none" />
      <circle cx="200" cy="198" r="2" fill="currentColor" stroke="none" />
      <circle cx="200" cy="232" r="2" fill="currentColor" stroke="none" />
      <circle cx="200" cy="266" r="2" fill="currentColor" stroke="none" />
      <circle cx="200" cy="300" r="2" fill="currentColor" stroke="none" />
      <path d="M226 210L256 214L254 240L224 236Z" strokeOpacity="0.4" />
      <path d="M116 300L116 318M116 318L150 320" strokeOpacity="0.4" />
    </>
  ),
  dress: (
    <>
      <path d="M158 96Q200 134 242 96" strokeOpacity="0.7" />
      <path d="M126 236Q200 256 274 236" strokeOpacity="0.45" />
      <path d="M138 256L124 432M176 248L166 440M224 248L234 440M262 256L276 432" strokeOpacity="0.28" />
      <path d="M132 118L140 236M268 118L260 236" strokeOpacity="0.25" />
      <path d="M200 256L200 452" strokeOpacity="0.16" />
    </>
  ),
  trouser: (
    <>
      <path d="M128 104L272 104L274 128L126 128Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M200 128L200 190M200 190Q188 210 184 250" strokeOpacity="0.45" />
      <path d="M156 150L146 440M244 150L254 440" strokeOpacity="0.3" />
      <path d="M128 150L172 158M272 150L228 158" strokeOpacity="0.4" />
      <path d="M132 108L132 122M148 108L148 122M164 108L164 122M180 108L180 122M196 108L196 122M212 108L212 122M228 108L228 122M244 108L244 122M260 108L260 122" strokeOpacity="0.25" />
      <path d="M142 440L146 446M258 440L254 446" strokeOpacity="0.5" />
    </>
  ),
  skirt: (
    <>
      <path d="M132 140L268 140L272 166L128 166Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M143 166L126 428M165 166L158 438M187 166L181 442M209 166L219 442M231 166L242 438M253 166L274 428" strokeOpacity="0.32" />
      <path d="M136 150L136 164M152 150L152 164M168 150L168 164M184 150L184 164M200 150L200 164M216 150L216 164M232 150L232 164M248 150L248 164M264 150L264 164" strokeOpacity="0.2" />
    </>
  ),
  shoe: (
    <>
      <path d="M80 350Q70 366 92 372L318 372Q338 370 332 350L326 338L300 332Q270 322 246 306Q220 290 190 290L150 292Q120 296 104 314Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M104 314Q150 300 190 302Q230 304 250 320L318 350" strokeOpacity="0.4" />
      <path d="M160 300L170 330M210 306L218 336" strokeOpacity="0.35" />
      <path d="M96 340L88 372M324 344L330 372" strokeOpacity="0.6" />
      <path d="M150 320Q190 326 226 322" strokeDasharray="2 5" strokeOpacity="0.5" />
      <path d="M240 306L238 340" strokeOpacity="0.35" />
      <ellipse cx="205" cy="386" rx="132" ry="8" strokeOpacity="0.16" fill="currentColor" fillOpacity="0.05" />
    </>
  ),
  bag: (
    <>
      <path d="M110 208Q108 196 120 196L280 196Q292 196 290 208L300 394Q300 410 284 412L116 412Q100 410 100 394Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M150 200Q150 136 200 136Q250 136 250 200" strokeWidth="2" />
      <path d="M162 200Q162 150 200 150Q238 150 238 200" strokeOpacity="0.35" />
      <path d="M100 244L300 244" strokeOpacity="0.3" />
      <circle cx="200" cy="244" r="5" fill="currentColor" fillOpacity="0.2" strokeOpacity="0.6" />
      <path d="M126 412L134 432M274 412L266 432" strokeOpacity="0.3" />
      <path d="M200 244L200 412" strokeOpacity="0.12" />
    </>
  ),
  scarf: (
    <>
      <path d="M150 84Q118 158 158 238Q198 318 158 396Q138 438 98 448L108 470Q168 457 194 400Q235 308 194 234Q160 164 186 92Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M168 100Q140 170 178 244Q214 314 180 386" strokeOpacity="0.35" />
      <path d="M104 452L100 466M116 450L112 464M128 448L124 462" strokeOpacity="0.5" />
      <path d="M214 280Q252 350 226 410" strokeOpacity="0.2" />
    </>
  ),
  accessory: (
    <>
      <circle cx="168" cy="236" r="58" strokeWidth="3" fill="currentColor" fillOpacity="0.05" />
      <circle cx="238" cy="286" r="42" strokeWidth="3" fill="currentColor" fillOpacity="0.03" />
      <path d="M168 146L168 174M238 212L238 240" strokeWidth="2" />
      <circle cx="168" cy="140" r="4" fill="currentColor" stroke="none" />
      <circle cx="238" cy="206" r="4" fill="currentColor" stroke="none" />
      <path d="M140 210Q168 196 196 214" strokeOpacity="0.5" />
    </>
  ),
};

export type ProductArtProps = SVGProps<SVGSVGElement> & {
  art: GarmentArt;
  color?: string;
  accent?: string;
  variant?: number;
};

export function ProductArt({
  art,
  color = "#4B4B47",
  accent = "#8A7558",
  variant = 0,
  className,
  ...props
}: ProductArtProps) {
  const stroke = mixHex(color, "#141310", 0.55);
  const transforms = [
    "translate(0 0)",
    "translate(4 -4) scale(1.02)",
    "translate(-3 2) scale(0.98)",
    "translate(2 3) scale(1.01)",
  ];
  return (
    <svg
      viewBox="0 0 400 500"
      fill="none"
      role="img"
      aria-label="服装线稿"
      className={cn("h-full w-full", className)}
      {...props}
    >
      <g transform={transforms[variant % transforms.length]}>
        <g
          fill={color}
          fillOpacity={0.16}
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ color }}
        >
          {silhouettes[art] ? <path d={silhouettes[art]} /> : null}
          {details[art]}
        </g>
        <g
          stroke={accent}
          strokeOpacity={0.55}
          strokeWidth={1}
          strokeLinecap="round"
          fill="none"
        >
          <ellipse
            cx="200"
            cy="462"
            rx="118"
            ry="10"
            fill={stroke}
            fillOpacity="0.06"
            stroke="none"
          />
          {art === "dress" || art === "coat" || art === "trench" ? (
            <path d="M200 60L200 78M200 78L193 68M200 78L207 68" strokeOpacity={0.4} />
          ) : null}
          <path d="M96 468L304 468" strokeOpacity={0.18} strokeDasharray="1 6" />
        </g>
        <g stroke={stroke} strokeOpacity={0.35} strokeWidth={1} fill="none">
          <circle cx="200" cy="112" r="88" strokeOpacity={0.1} />
        </g>
      </g>
    </svg>
  );
}

export function artLabel(art: GarmentArt): string {
  return {
    coat: "大衣",
    trench: "风衣",
    jacket: "夹克",
    blazer: "西服",
    knit: "针织",
    cardigan: "开衫",
    shirt: "衬衫",
    dress: "连衣裙",
    trouser: "裤装",
    skirt: "半裙",
    shoe: "鞋履",
    bag: "包袋",
    scarf: "围巾",
    accessory: "配饰",
  }[art];
}
