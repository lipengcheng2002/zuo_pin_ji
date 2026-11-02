"""Two-tower retrieval model for ZHIYAN.

Implicit-feedback two-tower recommender trained with in-batch softmax. The
exported item vectors are 64-dimensional; in production they are projected
into the online 256-d retrieval space (or the service is pointed at this
index directly).

Usage:
    python train/two_tower.py \
        --interactions data/interactions.csv \
        --out artifacts/two_tower \
        --epochs 24 --dim 64

Outputs:
    user_embeddings.npy, item_embeddings.npy
    id_maps.json
    metrics.json
    model.pt
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import random
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

WEIGHTS = {
    "view": 1.0,
    "click": 2.0,
    "wishlist": 3.5,
    "add_to_cart": 5.0,
    "purchase": 8.0,
    "search": 1.2,
    "chat": 1.5,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--interactions", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--epochs", type=int, default=24)
    parser.add_argument("--dim", type=int, default=64)
    parser.add_argument("--batch", type=int, default=512)
    parser.add_argument("--lr", type=float, default=3e-3)
    parser.add_argument("--test-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=20261029)
    return parser.parse_args()


@dataclass
class Interaction:
    user: str
    item: str
    weight: float
    ts: str


def load(path: str) -> list[Interaction]:
    rows: list[Interaction] = []
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            event = row.get("event_type", "view")
            rows.append(
                Interaction(
                    user=row["user_id"],
                    item=row["item_id"],
                    weight=WEIGHTS.get(event, float(row.get("weight") or 1.0)),
                    ts=row.get("ts", ""),
                )
            )
    rows.sort(key=lambda r: r.ts)
    return rows


class Tower(nn.Module):
    def __init__(self, num_entities: int, dim: int, hidden: int = 128) -> None:
        super().__init__()
        self.embedding = nn.Embedding(num_entities, hidden)
        self.mlp = nn.Sequential(
            nn.Linear(hidden, hidden),
            nn.GELU(),
            nn.LayerNorm(hidden),
            nn.Linear(hidden, dim),
        )

    def forward(self, ids: torch.Tensor) -> torch.Tensor:
        return F.normalize(self.mlp(self.embedding(ids)), dim=-1)


class TwoTower(nn.Module):
    def __init__(self, num_users: int, num_items: int, dim: int) -> None:
        super().__init__()
        self.user = Tower(num_users, dim)
        self.item = Tower(num_items, dim)
        self.temperature = nn.Parameter(torch.tensor(0.07))

    def forward(self, users: torch.Tensor, items: torch.Tensor) -> torch.Tensor:
        u = self.user(users)
        i = self.item(items)
        return (u @ i.T) / self.temperature.clamp(min=0.02)


def evaluate(
    model: TwoTower,
    test_rows: list[tuple[int, int, float]],
    num_items: int,
    popularity: Counter,
    k: int = 10,
) -> dict:
    model.eval()
    rng = random.Random(7)
    auc_pairs: list[float] = []
    precision, recall, ndcg = [], [], []
    recommended = set()
    novelty: list[float] = []
    with torch.no_grad():
        item_tensor = torch.arange(num_items)
        item_vecs = model.item(item_tensor)
        for user_idx, item_idx, _ in test_rows:
            user_vec = model.user(torch.tensor([user_idx]))[0]
            scores = (item_vecs @ user_vec).numpy()
            positives = scores[item_idx]
            negatives = scores.copy()
            negatives[item_idx] = -np.inf
            for _ in range(4):
                neg = rng.randrange(num_items)
                if neg == item_idx:
                    continue
                auc_pairs.append(1.0 if positives > scores[neg] else 0.0)
            top = np.argsort(-scores)[:k]
            hits = int(item_idx in top)
            precision.append(hits / k)
            recall.append(float(hits))
            dcg = 0.0
            for rank, candidate in enumerate(top, start=1):
                if candidate == item_idx:
                    dcg += 1.0 / math.log2(rank + 1)
            ndcg.append(dcg)
            recommended.update(int(i) for i in top)
            novelty.append(-math.log2((popularity[int(i)] + 1) / (len(test_rows) + 1)) for i in top)
    return {
        "auc": round(float(np.mean(auc_pairs)) if auc_pairs else 0.0, 4),
        "precisionAt10": round(float(np.mean(precision)), 4),
        "recallAt10": round(float(np.mean(recall)), 4),
        "ndcgAt10": round(float(np.mean(ndcg)), 4),
        "coverage": round(len(recommended) / max(1, num_items), 4),
        "novelty": round(float(np.mean(novelty)) if novelty else 0.0, 4),
        "testUsers": len(test_rows),
    }


def main() -> None:
    args = parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    rows = load(args.interactions)
    if len(rows) < 50:
        raise SystemExit("not enough interactions to train")

    users = sorted({r.user for r in rows})
    items = sorted({r.item for r in rows})
    user_index = {u: i for i, u in enumerate(users)}
    item_index = {i: j for j, i in enumerate(items)}

    split = int(len(rows) * (1 - args.test_ratio))
    train_rows = rows[:split]
    test_rows_raw = rows[split:]

    # Aggregate repeated interactions and drop test users with no history.
    aggregated: dict[tuple[int, int], float] = defaultdict(float)
    for row in train_rows:
        key = (user_index[row.user], item_index[row.item])
        aggregated[key] = min(12.0, aggregated[key] + row.weight)

    dataset = [(u, i, min(3.0, 1.0 + math.log1p(w))) for (u, i), w in aggregated.items()]
    test_rows = [
        (user_index[r.user], item_index[r.item], r.weight)
        for r in test_rows_raw
        if user_index[r.user] in range(len(users))
    ]

    popularity = Counter()
    for r in rows:
        if r.weight >= 5:
            popularity[item_index[r.item]] += 1

    model = TwoTower(len(users), len(items), args.dim)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    dataset_tensor = torch.tensor([(u, i) for u, i, _ in dataset], dtype=torch.long)
    weights_tensor = torch.tensor([w for _, _, w in dataset], dtype=torch.float)

    best_metrics: dict = {}
    history: list[dict] = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        permutation = torch.randperm(len(dataset_tensor))
        total_loss = 0.0
        batches = 0
        for start in range(0, len(permutation), args.batch):
            idx = permutation[start : start + args.batch]
            if len(idx) < 2:
                continue
            users_b = dataset_tensor[idx, 0]
            items_b = dataset_tensor[idx, 1]
            weights_b = weights_tensor[idx]
            logits = model(users_b, items_b)
            labels = torch.arange(len(idx))
            loss_per_row = F.cross_entropy(logits, labels, reduction="none")
            loss = (loss_per_row * weights_b).mean()
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            optimizer.step()
            total_loss += float(loss)
            batches += 1
        scheduler.step()
        metrics = evaluate(model, test_rows, len(items), popularity)
        history.append({"epoch": epoch, "loss": round(total_loss / max(1, batches), 4), **metrics})
        print(json.dumps(history[-1]))
        best_metrics = metrics

    os.makedirs(args.out, exist_ok=True)
    with torch.no_grad():
        user_embeddings = model.user(torch.arange(len(users))).numpy()
        item_embeddings = model.item(torch.arange(len(items))).numpy()
    np.save(os.path.join(args.out, "user_embeddings.npy"), user_embeddings)
    np.save(os.path.join(args.out, "item_embeddings.npy"), item_embeddings)
    torch.save(model.state_dict(), os.path.join(args.out, "model.pt"))
    with open(os.path.join(args.out, "id_maps.json"), "w", encoding="utf-8") as handle:
        json.dump({"users": user_index, "items": item_index}, handle, ensure_ascii=False)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "two-tower-inbatch-softmax",
        "embeddingDim": args.dim,
        "epochs": args.epochs,
        "users": len(users),
        "items": len(items),
        "trainPairs": len(dataset),
        "testPairs": len(test_rows),
        "metrics": best_metrics,
        "history": history,
    }
    with open(os.path.join(args.out, "metrics.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report["metrics"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
