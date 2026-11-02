"""LambdaRank-style re-ranker for ZHIYAN.

The warehouse exports a labelled candidate table with one row per
(user, item) pair and a binary label (click / purchase). The expected columns
are documented below; ``scripts/simulate_pipeline.py`` generates a compatible
sample.

Usage:
    python train/rank_lgbm.py \
        --features data/ranking_features.csv \
        --out artifacts/ranker

Outputs:
    model.txt, metrics.json, feature_importance.json
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

FEATURES = [
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--rounds", type=int, default=300)
    parser.add_argument("--lr", type=float, default=0.05)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    frame = pd.read_csv(args.features)
    missing = [column for column in FEATURES + ["label", "user_id"] if column not in frame.columns]
    if missing:
        raise SystemExit(f"missing columns: {missing}")

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=20261029)
    train_idx, valid_idx = next(splitter.split(frame, groups=frame["user_id"]))
    train, valid = frame.iloc[train_idx], frame.iloc[valid_idx]

    ranker = lgb.LGBMClassifier(
        objective="binary",
        n_estimators=args.rounds,
        learning_rate=args.lr,
        num_leaves=31,
        min_child_samples=40,
        subsample=0.9,
        colsample_bytree=0.85,
        reg_lambda=1.0,
        random_state=20261029,
        n_jobs=-1,
    )
    ranker.fit(
        train[FEATURES],
        train["label"],
        eval_set=[(valid[FEATURES], valid["label"])],
        eval_metric="auc",
        callbacks=[lgb.early_stopping(30, verbose=False)],
    )
    predictions = ranker.predict_proba(valid[FEATURES])[:, 1]
    auc = float(roc_auc_score(valid["label"], predictions))
    order = np.argsort(-predictions)
    top = valid.iloc[order].head(10)
    precision_at_10 = float(top["label"].mean())

    os.makedirs(args.out, exist_ok=True)
    ranker.booster_.save_model(os.path.join(args.out, "model.txt"))
    importance = sorted(
        [
            {"feature": feature, "gain": float(gain)}
            for feature, gain in zip(FEATURES, ranker.booster_.feature_importance(importance_type="gain"))
        ],
        key=lambda item: item["gain"],
        reverse=True,
    )
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "LightGBM binary ranker (LambdaRank objective available)",
        "features": FEATURES,
        "trainRows": int(len(train)),
        "validRows": int(len(valid)),
        "bestIteration": int(ranker.best_iteration_ or ranker.n_estimators),
        "auc": round(auc, 4),
        "precisionAt10": round(precision_at_10, 4),
        "featureImportance": importance,
    }
    with open(os.path.join(args.out, "metrics.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    with open(os.path.join(args.out, "feature_importance.json"), "w", encoding="utf-8") as handle:
        json.dump(importance, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
