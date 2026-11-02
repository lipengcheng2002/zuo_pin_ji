/**
 * Deterministic, dependency-free text representation used by the retrieval
 * layer. In production this interface is backed by the two-tower encoder
 * exported from `ml/train/two_tower.py`; the hashing encoder below keeps the
 * demo fully functional offline and produces stable vectors for seeded data.
 */

export const EMBEDDING_DIM = 256;
export const MODEL_ID = "hash-tfidf-v2";

export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const CJK = /[\u4e00-\u9fff]/;

export function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[，。、；：！？“”‘’（）【】《》·—…]/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ");
  const tokens: string[] = [];
  for (const chunk of normalized.split(/\s+/)) {
    if (!chunk) continue;
    if (!CJK.test(chunk)) {
      tokens.push(chunk);
      continue;
    }
    // Mixed chunk: latin runs plus CJK characters & bigrams.
    const latin = chunk.match(/[a-z0-9]+/g) ?? [];
    tokens.push(...latin);
    const cjk = chunk.replace(/[a-z0-9]/g, "");
    const chars = Array.from(cjk);
    chars.forEach((char) => tokens.push(char));
    for (let i = 0; i < chars.length - 1; i += 1) {
      tokens.push(chars[i] + chars[i + 1]);
    }
  }
  return tokens;
}

export function embed(text: string, dim = EMBEDDING_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) return vec;
  tokens.forEach((token, index) => {
    const h = fnv1a(token);
    const slot = h % dim;
    const sign = (h >>> 16) & 1 ? 1 : -1;
    const boost = 1 + Math.min(1.4, Math.abs(token.length - 1) * 0.18);
    const position = 1 / (1 + index * 0.002);
    vec[slot] += sign * boost * position;
  });
  return l2normalize(vec);
}

export function l2normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i += 1) dot += a[i] * b[i];
  return dot;
}

export function addScaled(target: number[], vec: number[], scale: number): void {
  for (let i = 0; i < Math.min(target.length, vec.length); i += 1) {
    target[i] += vec[i] * scale;
  }
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  setA.forEach((v) => {
    if (setB.has(v)) intersection += 1;
  });
  return intersection / (setA.size + setB.size - intersection);
}

export function overlapCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.reduce((sum, v) => (setB.has(v) ? sum + 1 : sum), 0);
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeScores(
  values: Array<{ id: string; score: number }>,
): Map<string, number> {
  if (!values.length) return new Map();
  const scores = values.map((v) => v.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  return new Map(values.map((v) => [v.id, (v.score - min) / span]));
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 441.67;
}

export function colorHarmony(a: string, b: string): number {
  const distance = colorDistance(a, b);
  if (distance < 0.12) return 0.72;
  if (distance < 0.3) return 0.94;
  if (distance < 0.55) return 0.82;
  return 0.58;
}
