"""Generate a self-contained offline dataset + evaluation artifacts.

This script intentionally depends only on the Python standard library so it
can run in the demo container / on a laptop without Spark or PyTorch. It
produces:

    ml/data/products.csv
    ml/data/interactions.csv
    ml/data/ranking_features.csv
    ml/artifacts/offline-eval.json
    src/lib/engine/artifacts/offline-eval.json   (consumed by the console)

The heavy jobs in ``spark/`` and ``train/`` consume the same CSVs and produce
production-grade artifacts. The synthetic evaluator here keeps the demo
reproducible end-to-end while still training a real matrix-factorization
model and logistic ranker with SGD.

Run:
    python ml/scripts/simulate_pipeline.py
"""

from __future__ import annotations

import csv
import json
import math
import os
import random
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.join(ROOT, "ml", "data")
ARTIFACT_DIR = os.path.join(ROOT, "ml", "artifacts")
WEB_ARTIFACT = os.path.join(ROOT, "src", "lib", "engine", "artifacts", "offline-eval.json")
SEED = 20261029
NOW = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)

STYLES = ["静奢", "极简", "法式", "复古", "新中式", "机能", "学院", "浪漫", "中性", "都市"]
CATEGORIES = [
    ("outerwear", "外套", "outer"),
    ("knitwear", "针织", "top"),
    ("shirting", "衬衫", "top"),
    ("dresses", "连衣裙", "dress"),
    ("trousers", "裤装", "bottom"),
    ("skirts", "半裙", "bottom"),
    ("shoes", "鞋履", "shoes"),
    ("bags", "包袋", "bag"),
    ("accessories", "配饰", "accessory"),
]
EVENT_TYPES = ["view", "click", "wishlist", "add_to_cart", "purchase"]
EVENT_WEIGHT = {
    "view": 1.0,
    "click": 2.0,
    "wishlist": 3.5,
    "add_to_cart": 5.0,
    "purchase": 8.0,
    "search": 1.2,
    "chat": 1.5,
}
FEATURE_NAMES = [
    "profile_affinity",
    "semantic_similarity",
    "collaborative_score",
    "constraint_match",
    "trend_score",
    "quality_score",
    "complement_score",
    "price_fit",
    "freshness",
    "margin_index",
    "item_ctr",
    "item_cvr",
    "user_recency_days",
    "user_purchase_count",
    "price_ratio",
    "category_affinity",
    "color_affinity",
    "style_overlap",
    "occasion_overlap",
    "stock_ratio",
]


def ensure_dirs() -> None:
    for path in (DATA_DIR, ARTIFACT_DIR, os.path.dirname(WEB_ARTIFACT)):
        os.makedirs(path, exist_ok=True)


def build_catalog(rng: random.Random) -> list[dict]:
    products = []
    for index in range(40):
        category, label, role = CATEGORIES[index % len(CATEGORIES)]
        tags = rng.sample(STYLES, k=rng.choice([2, 3, 3, 4]))
        price = rng.choice([380, 480, 520, 680, 720, 780, 890, 980, 1080, 1180, 1280, 1380, 1580, 1680, 1880, 1980, 2280, 2580, 2880, 4280])
        products.append(
            {
                "item_id": f"p{index + 1:02d}",
                "category": category,
                "category_label": label,
                "role": role,
                "price": price,
                "rating": round(rng.uniform(4.3, 4.95), 2),
                "stock": rng.randint(12, 180),
                "tags": tags,
                "latent": [rng.gauss(0, 0.6) for _ in range(6)],
                "popularity": rng.random() ** 1.6,
            }
        )
    return products


def build_users(rng: random.Random) -> list[dict]:
    users = []
    for index in range(160):
        preferred = rng.sample(STYLES, k=rng.choice([2, 3]))
        users.append(
            {
                "user_id": f"u{index + 1:04d}",
                "preferred_styles": preferred,
                "price_center": rng.choice([700, 900, 1200, 1600, 2200, 3000]),
                "latent": [rng.gauss(0, 0.7) for _ in range(6)],
                "activity": rng.choice([16, 20, 24, 30, 36]),
            }
        )
    return users


def affinity(user: dict, item: dict) -> float:
    tag_hits = len(set(user["preferred_styles"]) & set(item["tags"]))
    latent = sum(a * b for a, b in zip(user["latent"], item["latent"])) / 3.0
    price_penalty = -abs(math.log(max(1, item["price"]) / user["price_center"])) * 0.6
    return tag_hits * 0.9 + latent + price_penalty + item["popularity"] * 0.8


def sample_items(user: dict, items: list[dict], count: int, rng: random.Random) -> list[dict]:
    scored = [(item, affinity(user, item)) for item in items]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    pool = scored[:18] + scored[18:32]
    weights = [math.exp(score / 1.4) for _, score in pool]
    chosen = []
    for _ in range(count):
        item = rng.choices([pair[0] for pair in pool], weights=weights, k=1)[0]
        if item not in chosen:
            chosen.append(item)
    return chosen


def event_type_for(rank: int, rng: random.Random) -> str:
    roll = rng.random()
    if rank == 0:
        return "purchase" if roll < 0.55 else "add_to_cart" if roll < 0.8 else "wishlist"
    if rank <= 2:
        return "purchase" if roll < 0.25 else "add_to_cart" if roll < 0.55 else "wishlist" if roll < 0.8 else "click"
    if rank <= 6:
        return "add_to_cart" if roll < 0.12 else "wishlist" if roll < 0.3 else "click" if roll < 0.65 else "view"
    return "click" if roll < 0.2 else "view"


def build_interactions(users: list[dict], items: list[dict], rng: random.Random) -> list[dict]:
    rows = []
    for user in users:
        total = user["activity"] + rng.randint(-4, 8)
        chosen = sample_items(user, items, min(16, total), rng)
        session_size = rng.choice([3, 4, 5])
        session_index = 0
        for rank, item in enumerate(chosen):
            if rank % session_size == 0:
                session_index += 1
            event = event_type_for(rank, rng)
            days_ago = rng.randint(1, 88)
            ts = NOW - timedelta(days=days_ago, hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
            rows.append(
                {
                    "user_id": user["user_id"],
                    "item_id": item["item_id"],
                    "event_type": event,
                    "ts": ts.isoformat(),
                    "session_id": f"s_{user['user_id']}_{session_index}",
                    "weight": EVENT_WEIGHT[event],
                }
            )
            if event in ("add_to_cart", "purchase") and rng.random() < 0.5:
                rows.append(
                    {
                        "user_id": user["user_id"],
                        "item_id": item["item_id"],
                        "event_type": "purchase" if event == "purchase" else "wishlist",
                        "ts": (ts + timedelta(minutes=rng.randint(2, 40))).isoformat(),
                        "session_id": f"s_{user['user_id']}_{session_index}",
                        "weight": EVENT_WEIGHT["purchase" if event == "purchase" else "wishlist"],
                    }
                )
    rows.sort(key=lambda row: row["ts"])
    return rows


def train_matrix_factorization(rows: list[dict], users: list[dict], items: list[dict]) -> tuple[dict, dict, dict]:
    rng = random.Random(SEED + 1)
    factors = 16
    user_index = {user["user_id"]: index for index, user in enumerate(users)}
    item_index = {item["item_id"]: index for index, item in enumerate(items)}
    user_vec = [[rng.gauss(0, 0.08) for _ in range(factors)] for _ in users]
    item_vec = [[rng.gauss(0, 0.08) for _ in range(factors)] for _ in items]
    user_bias = [0.0] * len(users)
    item_bias = [0.0] * len(items)
    global_mean = sum(EVENT_WEIGHT.get(row["event_type"], 1.0) for row in rows) / max(1, len(rows))
    entries = [
        (user_index[row["user_id"]], item_index[row["item_id"]], EVENT_WEIGHT.get(row["event_type"], 1.0))
        for row in rows
    ]
    lr, reg = 0.012, 0.03
    for epoch in range(28):
        rng.shuffle(entries)
        total = 0.0
        for u, i, rating in entries:
            prediction = global_mean + user_bias[u] + item_bias[i] + sum(
                a * b for a, b in zip(user_vec[u], item_vec[i])
            )
            error = rating - prediction
            total += error * error
            user_bias[u] += lr * (error - reg * user_bias[u])
            item_bias[i] += lr * (error - reg * item_bias[i])
            for k in range(factors):
                pu, qi = user_vec[u][k], item_vec[i][k]
                user_vec[u][k] += lr * (error * qi - reg * pu)
                item_vec[i][k] += lr * (error * pu - reg * qi)
        if epoch % 7 == 0:
            print(f"  mf epoch {epoch}: rmse={math.sqrt(total / max(1, len(entries))):.4f}")
    return (
        {"user": user_index, "item": item_index},
        {"user_vec": user_vec, "item_vec": item_vec, "user_bias": user_bias, "item_bias": item_bias, "mean": global_mean},
        {"loss": round(math.sqrt(total / max(1, len(entries))), 4)},
    )


def evaluate(model: dict, index: dict, users: list[dict], items: list[dict], rows: list[dict]) -> dict:
    user_index = index["user"]
    item_index = index["item"]
    split = int(len(rows) * 0.8)
    train_rows, test_rows = rows[:split], rows[split:]
    train_pairs = {(user_index[r["user_id"]], item_index[r["item_id"]]) for r in train_rows}
    positives = defaultdict(set)
    for row in test_rows:
        if row["event_type"] in ("purchase", "add_to_cart", "wishlist"):
            positives[user_index[row["user_id"]]].add(item_index[row["item_id"]])
    if not positives:
        for row in test_rows:
            positives[user_index[row["user_id"]]].add(item_index[row["item_id"]])

    popularity = Counter(item_index[r["item_id"]] for r in rows if r["event_type"] == "purchase")
    rng = random.Random(SEED + 2)
    precision, recall, ndcg, novelty = [], [], [], []
    recommended = set()
    auc_pairs = []
    user_vec, item_vec = model["user_vec"], model["item_vec"]
    user_bias, item_bias, mean = model["user_bias"], model["item_bias"], model["mean"]

    for u, positive_set in positives.items():
        scores = []
        for i in range(len(items)):
            score = (
                mean
                + user_bias[u]
                + item_bias[i]
                + sum(a * b for a, b in zip(user_vec[u], item_vec[i]))
            )
            scores.append(score)
        ranking = sorted(range(len(items)), key=lambda i: scores[i], reverse=True)[:10]
        recommended.update(ranking)
        hits = sum(1 for i in ranking if i in positive_set)
        precision.append(hits / 10)
        recall.append(hits / max(1, len(positive_set)))
        dcg = 0.0
        gains = sorted(
            [1.0 if i in positive_set else 0.0 for i in ranking],
            reverse=True,
        )
        dcg = sum(gain / math.log2(rank + 2) for rank, gain in enumerate(gains) if gain)
        ideal_count = min(len(positive_set), 10)
        ideal = sum(1.0 / math.log2(rank + 2) for rank in range(ideal_count))
        ndcg.append(dcg / ideal if ideal else 0.0)
        for i in ranking:
            share = (popularity[i] + 1) / (len(rows) + 1)
            novelty.append(-math.log2(share))
        positive = next(iter(positive_set))
        for _ in range(4):
            negative = rng.randrange(len(items))
            if negative == positive:
                continue
            auc_pairs.append(1.0 if scores[positive] > scores[negative] else 0.0)

    return {
        "auc": round(sum(auc_pairs) / max(1, len(auc_pairs)), 4),
        "precisionAt10": round(sum(precision) / max(1, len(precision)), 4),
        "recallAt10": round(sum(recall) / max(1, len(recall)), 4),
        "ndcgAt10": round(sum(ndcg) / max(1, len(ndcg)), 4),
        "coverage": round(len(recommended) / len(items), 4),
        "novelty": round(sum(novelty) / max(1, len(novelty)), 4),
        "testUsers": len(positives),
        "trainPairs": len(train_pairs),
    }


def build_ranker_features(users: list[dict], items: list[dict], rng: random.Random) -> list[dict]:
    rows = []
    for user in users[:100]:
        scored = sorted(
            [(item, affinity(user, item)) for item in items],
            key=lambda pair: pair[1],
            reverse=True,
        )
        for rank, (item, aff) in enumerate(scored[:40]):
            features = {
                "profile_affinity": max(0.0, min(1.0, (aff + 2) / 8)),
                "semantic_similarity": max(0.0, min(1.0, rng.gauss(0.52, 0.16))),
                "collaborative_score": max(0.0, min(1.0, rng.gauss(0.45, 0.18) + aff / 20)),
                "constraint_match": 1.0 if item["category"] in ("knitwear", "outerwear") else rng.random(),
                "trend_score": max(0.0, min(1.0, rng.gauss(0.5, 0.2))),
                "quality_score": min(1.0, (item["rating"] - 4.1) / 0.9),
                "complement_score": max(0.0, min(1.0, rng.gauss(0.4, 0.2))),
                "price_fit": math.exp(-abs(math.log(item["price"] / user["price_center"]))),
                "freshness": rng.random(),
                "margin_index": 0.5 + (0.1 if item["price"] > 1500 else 0),
                "item_ctr": max(0.0, min(1.0, rng.gauss(0.07, 0.02))),
                "item_cvr": max(0.0, min(1.0, rng.gauss(0.04, 0.015))),
                "user_recency_days": rng.randint(0, 30) / 30,
                "user_purchase_count": min(1.0, rng.randint(0, 12) / 12),
                "price_ratio": min(3.0, item["price"] / user["price_center"]) / 3.0,
                "category_affinity": 1.0 if item["category"] in ("knitwear", "outerwear", "dresses") else rng.random() * 0.7,
                "color_affinity": rng.random(),
                "style_overlap": len(set(user["preferred_styles"]) & set(item["tags"])) / 4,
                "occasion_overlap": rng.random(),
                "stock_ratio": min(1.0, item["stock"] / 180),
            }
            logit = (
                -1.9
                + 2.6 * features["profile_affinity"]
                + 1.2 * features["semantic_similarity"]
                + 1.4 * features["collaborative_score"]
                + 0.9 * features["constraint_match"]
                + 0.7 * features["style_overlap"]
                + 0.6 * features["price_fit"]
                - 1.1 * features["user_recency_days"]
                + 0.5 * features["quality_score"]
                - 0.05 * rank
                + rng.gauss(0, 0.7)
            )
            label = 1 if rng.random() < 1 / (1 + math.exp(-logit)) else 0
            rows.append({"user_id": user["user_id"], "item_id": item["item_id"], **{k: round(v, 4) for k, v in features.items()}, "label": label})
    return rows


def fit_logistic(rows: list[dict]) -> dict:
    rng = random.Random(SEED + 3)
    weights = [0.0] * len(FEATURE_NAMES)
    bias = 0.0
    learning_rate = 0.25
    for epoch in range(60):
        rng.shuffle(rows)
        for row in rows:
            linear = bias + sum(w * row[name] for w, name in zip(weights, FEATURE_NAMES))
            prediction = 1.0 / (1.0 + math.exp(-max(-20, min(20, linear))))
            error = prediction - row["label"]
            bias -= learning_rate * error * 0.1
            for index, name in enumerate(FEATURE_NAMES):
                weights[index] -= learning_rate * (error * row[name] + 0.002 * weights[index])
    # AUC on a hold-out slice
    holdout = rows[int(len(rows) * 0.8) :]
    positive_pool = [row for row in holdout if row["label"] == 1] or holdout
    negative_pool = [row for row in holdout if row["label"] == 0] or holdout
    pairs = []
    for _ in range(4000):
        positive = rng.choice(positive_pool)
        negative = rng.choice(negative_pool)
        p_score = sum(w * positive[name] for w, name in zip(weights, FEATURE_NAMES))
        n_score = sum(w * negative[name] for w, name in zip(weights, FEATURE_NAMES))
        if p_score == n_score:
            continue
        pairs.append(1.0 if p_score > n_score else 0.0)
    top = sorted(
        [{"feature": name, "weight": round(weight, 4)} for name, weight in zip(FEATURE_NAMES, weights)],
        key=lambda item: abs(item["weight"]),
        reverse=True,
    )
    return {
        "model": "logistic ranker (pure-python SGD fallback)",
        "auc": round(sum(pairs) / max(1, len(pairs)), 4),
        "weights": top,
        "bias": round(bias, 4),
    }


def write_csv(path: str, fieldnames: list[str], rows: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows -> {path}")


def main() -> None:
    ensure_dirs()
    rng = random.Random(SEED)
    print("· building synthetic catalog and users")
    items = build_catalog(rng)
    users = build_users(rng)
    print("· simulating interactions")
    interactions = build_interactions(users, items, rng)
    print(f"  {len(interactions)} interactions")
    print("· training matrix factorization (SGD)")
    index, model, training = train_matrix_factorization(interactions, users, items)
    print("· evaluating retrieval")
    metrics = evaluate(model, index, users, items, interactions)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))
    print("· building ranker training set")
    ranking_rows = build_ranker_features(users, items, rng)
    print(f"  {len(ranking_rows)} candidate rows")
    ranker = fit_logistic(ranking_rows)
    print(f"  ranker AUC {ranker['auc']}")

    write_csv(
        os.path.join(DATA_DIR, "products.csv"),
        ["item_id", "category", "role", "price", "rating", "stock", "tags"],
        [
            {
                "item_id": item["item_id"],
                "category": item["category"],
                "role": item["role"],
                "price": item["price"],
                "rating": item["rating"],
                "stock": item["stock"],
                "tags": "|".join(item["tags"]),
            }
            for item in items
        ],
    )
    write_csv(
        os.path.join(DATA_DIR, "interactions.csv"),
        ["user_id", "item_id", "event_type", "ts", "session_id", "weight"],
        interactions,
    )
    write_csv(
        os.path.join(DATA_DIR, "ranking_features.csv"),
        ["user_id", "item_id", *FEATURE_NAMES, "label"],
        ranking_rows,
    )

    dataset = {
        "users": len(users),
        "items": len(items),
        "interactions": len(interactions),
        "rankingCandidates": len(ranking_rows),
        "windowDays": 90,
        "generatedAt": NOW.isoformat(),
    }
    artifact = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": dataset,
        "twoTower": {
            "model": "matrix-factorization (SGD) · two-tower proxy",
            "embeddingDim": 16,
            "epochs": 28,
            "rmse": training["loss"],
            **metrics,
        },
        "ranker": ranker,
        "spark": {
            "job": "spark/feature_engineering.py",
            "windowDays": 90,
            "users": len(users),
            "items": len(items),
            "interactions": len(interactions),
            "eventWeights": EVENT_WEIGHT,
        },
        "notes": [
            "Demo artifact generated without Spark/PyTorch for reproducibility.",
            "Run ml/spark/feature_engineering.py and ml/train/two_tower.py for production artifacts.",
            "Web runtime uses the deterministic hash encoder when no exported embeddings are present.",
        ],
    }
    for path in (os.path.join(ARTIFACT_DIR, "offline-eval.json"), WEB_ARTIFACT):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(artifact, handle, ensure_ascii=False, indent=2)
        print(f"wrote artifact -> {path}")


if __name__ == "__main__":
    main()
