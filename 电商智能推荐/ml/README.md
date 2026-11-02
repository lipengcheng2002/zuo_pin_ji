# 离线 ML 管线 · ZHIYAN

本目录实现需求中的 **Spark 特征工程 + PyTorch 训练 + Embedding 召回 + 离线评估**。
Web 服务不导入这些依赖；产物以 JSON / NPY 的形式供在线服务与模型卡读取。

## 1. 数据契约

### `data/interactions.csv`

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | string | 用户 ID |
| `item_id` | string | 商品 ID |
| `event_type` | enum | view / click / wishlist / add_to_cart / purchase |
| `ts` | ISO timestamp | 事件时间 |
| `session_id` | string | 会话 ID（共现与去重） |
| `weight` | float | 可选；缺省按事件权重 |

事件权重：view 1、click 2、wishlist 3.5、add_to_cart 5、purchase 8。

### `data/products.csv`

`item_id, category, role, price, rating, stock, tags`（`tags` 用 `|` 分隔）。

### `data/ranking_features.csv`

由仓库脚本生成，字段与 `ml/train/rank_lgbm.py` 的 `FEATURES` 一致，并包含 `user_id,item_id,label`。
生产环境应由数仓导出同样的列。

## 2. 快速复现（无依赖）

```bash
python ml/scripts/simulate_pipeline.py
```

仅使用 Python 标准库，会：

1. 生成 160 用户 / 40 商品 / 约 2,100 条行为 / 4,000 条排序候选
2. 用 SGD 训练矩阵分解（双塔的轻量代理）并评估 AUC / P@10 / Recall / NDCG / Coverage / Novelty
3. 用纯 Python logistic regression 训练排序 baseline，输出 AUC 与权重
4. 写入：
   - `ml/data/*.csv`
   - `ml/artifacts/offline-eval.json`
   - `src/lib/engine/artifacts/offline-eval.json`（控制台「离线模型卡」直接读取）

在 CI 中该脚本也会运行，保证离线产物可复现。

## 3. 生产管线

### 环境

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r ml/requirements.txt
```

包括 PySpark 3.5、PyTorch 2.4、LightGBM 4.5、scikit-learn、pandas、numpy、pyarrow。

### 3.1 特征工程（Spark）

```bash
spark-submit --master 'local[*]' ml/spark/feature_engineering.py \
  --interactions ml/data/interactions.csv \
  --products ml/data/products.csv \
  --out ml/artifacts/spark \
  --days 90
```

产出：

```text
ml/artifacts/spark/
  features/user_features/      # Parquet
  features/item_features/      # Parquet
  features/item_cooccurrence/  # Parquet
  summary.json
```

用户特征：30 天事件数、购买/加购/收藏、金额、最近活跃、会话数、Top 风格/品类、recency decay。
商品特征：曝光、点击、加购、购买、CTR/CVR、近 7 日趋势、质量分、库存。
共现：同 session 商品对，截断 Top-20 邻居。

### 3.2 双塔召回（PyTorch）

```bash
python ml/train/two_tower.py \
  --interactions ml/data/interactions.csv \
  --out ml/artifacts/two_tower \
  --epochs 24 --dim 64 --batch 512
```

产出：`user_embeddings.npy`、`item_embeddings.npy`、`id_maps.json`、`metrics.json`、`model.pt`。

- In-batch softmax，AdamW，cosine LR，梯度裁剪
- 时间切分（后 20% 测试）
- 评估 AUC、P@10、R@10、NDCG@10、Coverage、Novelty

### 3.3 排序（LightGBM）

```bash
python ml/train/rank_lgbm.py \
  --features ml/data/ranking_features.csv \
  --out ml/artifacts/ranker
```

产出 `model.txt`、`metrics.json`、`feature_importance.json`。按用户分组切分，避免泄漏。

### 3.4 离线评估

```bash
python ml/eval/offline_eval.py \
  --user-embeddings ml/artifacts/two_tower/user_embeddings.npy \
  --item-embeddings ml/artifacts/two_tower/item_embeddings.npy \
  --id-maps ml/artifacts/two_tower/id_maps.json \
  --test ml/data/interactions.csv \
  --out ml/artifacts/offline_eval.json
```

输出 Precision/Recall/NDCG@K、Coverage、Novelty。

## 4. 在线集成

当前 Web 服务使用 `src/lib/engine/text.ts` 的 `hash-tfidf-v2`：

- 256 维、确定性、零依赖
- 商品/用户/知识库共用
- 作为无 Key、无外部索引的回退方案

接入双塔向量的步骤：

1. 导出 `item_embeddings.npy` 与 `user_embeddings.npy`
2. 统一到在线维度（或使用独立向量字段）
3. 构建 ANN（FAISS/Milvus/pgvector）
4. 在 `recall()` 的 `vector` 源替换为 ANN 查询
5. 用 A/B 验证 CTR/CVR/时延，并保留回退开关

## 5. 产物与 Web 的契约

`src/lib/engine/artifacts/offline-eval.json`：

```json
{
  "generatedAt": "…",
  "dataset": { "users": 160, "items": 40, "interactions": 2105 },
  "twoTower": {
    "embeddingDim": 16,
    "epochs": 28,
    "rmse": 0.59,
    "auc": 0.88,
    "precisionAt10": 0.11,
    "recallAt10": 0.87,
    "ndcgAt10": 0.88,
    "coverage": 1.0,
    "novelty": 8.37
  },
  "ranker": { "auc": 0.76, "weights": [{ "feature": "profile_affinity", "weight": 1.2 }] }
}
```

离线模型卡与评测文档读取这些字段；修改结构时需要同步更新 `docs/model-card.md` 与 `docs/agent-evaluation.md`。

## 6. 注意事项

- `simulate_pipeline.py` 的指标来自合成数据，不能作为生产效果承诺
- Spark 作业的 `windowDays` 与在线 28 天衰减不同；生产需统一口径
- 训练数据必须做时间切分；随机切分会高估效果
- 连接真实数据库时，不要把 PII 写入特征文件；使用散列 ID
- 大规模训练请使用 GPU 镜像或托管训练平台，产物进入特征库/对象存储
