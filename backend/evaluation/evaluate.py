"""
evaluate.py
-----------
Evaluates NB, VADER-only, and Hybrid on a held-out test split.

Metrics per thesis SOP:
  RQ 2.1 - Detection Accuracy
  RQ 2.2 - Precision, Recall, F1-Score
  RQ 2.3 - False Positive Rate, False Negative Rate
"""

import json, math, re, os, sys
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, confusion_matrix
)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from vader_helper import get_vader_score

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH  = os.path.join(BASE_DIR, "model", "vocab.json")
DATA_PATH   = os.path.join(BASE_DIR, "data",  "dataset.csv")
RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

with open(MODEL_PATH) as f:
    MODEL = json.load(f)

LOG_PRIOR  = MODEL["log_prior"]
LOG_LIKE   = MODEL["log_likelihood"]
STOP_WORDS = set(MODEL["stop_words"])
W1, W2, THRESHOLD = 0.6, 0.4, 0.5


def tokenize(text):
    return [t for t in re.findall(r"[a-z]+", text.lower())
            if t not in STOP_WORDS and len(t) > 1]

def nb_prob(text):
    tokens = tokenize(text)
    scores = {}
    for c in ("0", "1"):
        s = LOG_PRIOR[c]
        for t in tokens:
            if t in LOG_LIKE[c]:
                s += LOG_LIKE[c][t]
        scores[c] = s
    m  = max(scores.values())
    e1 = math.exp(scores["1"] - m)
    e0 = math.exp(scores["0"] - m)
    return e1 / (e0 + e1)

def nb_predict(text):
    return 1 if nb_prob(text) >= THRESHOLD else 0

def vader_predict(text):
    score = get_vader_score(text)
    # support both key names
    agg = score.get("aggression_score", score.get("aggression", 0))
    return 1 if agg >= THRESHOLD else 0

def hybrid_predict(text):
    score = get_vader_score(text)
    agg   = score.get("aggression_score", score.get("aggression", 0))
    return 1 if (W1 * nb_prob(text) + W2 * agg) >= THRESHOLD else 0


def compute_metrics(y_true, y_pred, name):
    # RQ 2.1 — Accuracy
    accuracy  = accuracy_score(y_true, y_pred)

    # RQ 2.2 — Precision, Recall, F1
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall    = recall_score(y_true, y_pred,    zero_division=0)
    f1        = f1_score(y_true, y_pred,        zero_division=0)

    # RQ 2.3 — FP Rate, FN Rate
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()
    fp_rate = fp / (fp + tn) if (fp + tn) > 0 else 0
    fn_rate = fn / (fn + tp) if (fn + tp) > 0 else 0

    return {
        "model":     name,
        "accuracy":  round(accuracy,  4),
        "precision": round(precision, 4),
        "recall":    round(recall,    4),
        "f1_score":  round(f1,        4),
        "fp_rate":   round(fp_rate,   4),
        "fn_rate":   round(fn_rate,   4),
        "tp": int(tp), "tn": int(tn),
        "fp": int(fp), "fn": int(fn),
    }


def main():
    df = pd.read_csv(DATA_PATH).dropna(subset=["text", "label"])
    df["label"] = df["label"].astype(int)

    _, test = train_test_split(
        df, test_size=0.3, random_state=42, stratify=df["label"]
    )
    texts  = test["text"].tolist()
    labels = test["label"].tolist()

    print(f"[evaluate] Test samples: {len(texts)}")
    print("Running evaluation...\n")

    results = [
        compute_metrics(labels, [nb_predict(t)     for t in texts], "Naive Bayes"),
        compute_metrics(labels, [vader_predict(t)  for t in texts], "VADER Only"),
        compute_metrics(labels, [hybrid_predict(t) for t in texts], "Hybrid NB VADER"),
    ]

    os.makedirs(RESULTS_DIR, exist_ok=True)
    for r in results:
        fname = r["model"].lower().replace(" ", "_") + "_results.json"
        with open(os.path.join(RESULTS_DIR, fname), "w") as f:
            json.dump(r, f, indent=2)

    # ── Print results ──────────────────────────────────────────────────────────
    print("=" * 72)
    print(f"  RQ 2.1 — Detection Accuracy")
    print(f"  {'Model':<20} {'Accuracy':>10}")
    print("-" * 35)
    for r in results:
        print(f"  {r['model']:<20} {r['accuracy']:>10.4f}")

    print(f"\n  RQ 2.2 — Precision, Recall, F1-Score")
    print(f"  {'Model':<20} {'Precision':>10} {'Recall':>8} {'F1':>8}")
    print("-" * 50)
    for r in results:
        print(f"  {r['model']:<20} {r['precision']:>10.4f} {r['recall']:>8.4f} {r['f1_score']:>8.4f}")

    print(f"\n  RQ 2.3 — False Positive Rate & False Negative Rate")
    print(f"  {'Model':<20} {'FP Rate':>10} {'FN Rate':>10} {'FP':>6} {'FN':>6}")
    print("-" * 58)
    for r in results:
        print(f"  {r['model']:<20} {r['fp_rate']:>10.4f} {r['fn_rate']:>10.4f} {r['fp']:>6} {r['fn']:>6}")
    print("=" * 72)
    print("\n✅ Results saved to evaluation/results/")


if __name__ == "__main__":
    main()