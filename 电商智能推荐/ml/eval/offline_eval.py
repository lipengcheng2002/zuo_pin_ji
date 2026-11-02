"""Offline evaluation for two-tower retrieval exports.

Usage:
    python eval/offline_eval.py \
        --user-embeddings artifacts/two_tower/user_embeddings.npy \
        --item-embeddings artifacts/two_tower/item_embeddings.npy \
        --id-maps artifacts/two_tower/id_maps.json \
        --test data/interactions.csv \
        --out artifacts/offline_eval.json

The test file must contain at least ``user_id,item_id,event_type,ts``.
Only the last 20% of interactions (by timestamp) are evaluated, mirroring the
online temporal split.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-embeddings", required=True)
    parser.add_argument("--item-embeddings", required=True)
    parser.add_argument("--id-maps", required=True)
    parser.add_argument("--test", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--k", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    user_vectors = np.load(args.user_embeddings)
    item_vectors = np.load(args.item_embeddings)
    with open(args.id_maps, encoding="utf-8") as handle:
        maps = json.load(handle)
    user_index = maps["users"]
    item_index = maps["items"]
    item_ids = {index: item for item, index in item_index.items()}

    rows: list[dict] = []
    with open(args.test, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows.extend(reader)
    rows.sort(key=lambda row: row.get("ts", ""))
    test_rows = rows[int(len(rows) * 0.8) :]

    popularity = Counter(row["item_id"] for row in rows if row.get("event_type") == "purchase")
    by_user = defaultdict(list)
    for row in test_rows:
        if row["user_id"] in user_index and row["item_id"] in item_index:
            by_user[row["user_id"]].append(item_index[row["item_id"]])

    precision, recall, ndcg, novelty = [], [], [], []
    recommended: set[int] = set()
    for user_id, positives in by_user.items():
        scores = item_vectors @ user_vectors[user_index[user_id]]
        scores[np.array(positives)] = -np.inf
        ranking = np.argsort(-scores)[: args.k]
        recommended.update(int(item) for item in ranking)
        hits = sum(1 for positive in positives if positive in ranking)
        precision.append(hits / args.k)
        recall.append(hits / max(1, len(positives)))
        dcg = 0.0
        for rank, candidate in enumerate(ranking, start=1):
            if candidate in positives:
                dcg += 1.0 / math.log2(rank + 1)
        ideal = sum(1.0 / math.log2(i + 2) for i in range(min(len(positives), args.k)))
        ndcg.append(dcg / ideal if ideal else 0.0)
        for candidate in ranking:
            item = item_ids[int(candidate)]
            novelty.append(-math.log2((popularity[item] + 1) / (len(rows) + 1)))

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "k": args.k,
        "evaluatedUsers": len(by_user),
        "itemsInIndex": int(item_vectors.shape[0]),
        "embeddingDim": int(item_vectors.shape[1]),
        "precisionAtK": round(float(np.mean(precision)) if precision else 0.0, 4),
        "recallAtK": round(float(np.mean(recall)) if recall else 0.0, 4),
        "ndcgAtK": round(float(np.mean(ndcg)) if ndcg else 0.0, 4),
        "coverage": round(len(recommended) / max(1, int(item_vectors.shape[0])), 4),
        "novelty": round(float(np.mean(novelty)) if novelty else 0.0, 4),
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
