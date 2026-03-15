"""
train.py
--------
Trains Naive Bayes on dataset.csv and saves word-probability weights
to model/vocab.json for use by the Chrome extension (client-side).

Evaluation metrics per thesis SOP:
  RQ 2.1 - Detection Accuracy
  RQ 2.2 - Precision, Recall, F1-Score
  RQ 2.3 - False Positive Rate, False Negative Rate
"""

import json, math, re, os, pandas as pd
from collections import defaultdict
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, confusion_matrix
)

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_PATH  = os.path.join(BASE_DIR, "data", "dataset.csv")
MODEL_PATH = os.path.join(BASE_DIR, "model", "vocab.json")

STOP_WORDS = {
    "a","an","the","is","it","in","on","at","to","for","of","and",
    "or","but","this","that","with","was","be","are","as","by","i",
    "you","we","they","he","she","my","your","our","its","do","did",
    "have","has","had","not","no","so","if","can","will","just","up"
}

def tokenize(text):
    tokens = re.findall(r"[a-z]+", text.lower())
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 1]

def train_naive_bayes(texts, labels):
    class_counts = defaultdict(int)
    word_counts  = {0: defaultdict(int), 1: defaultdict(int)}
    vocab        = set()

    for text, label in zip(texts, labels):
        tokens = tokenize(text)
        class_counts[label] += 1
        for token in tokens:
            word_counts[label][token] += 1
            vocab.add(token)

    total_docs = len(texts)
    vocab_size = len(vocab)

    log_prior = {
        str(c): math.log(class_counts[c] / total_docs)
        for c in (0, 1)
    }

    log_likelihood = {}
    for c in (0, 1):
        total_words = sum(word_counts[c].values()) + vocab_size
        log_likelihood[str(c)] = {
            word: math.log((word_counts[c].get(word, 0) + 1) / total_words)
            for word in vocab
        }

    return {
        "log_prior":      log_prior,
        "log_likelihood": log_likelihood,
        "vocab_size":     vocab_size,
        "stop_words":     list(STOP_WORDS),
    }

def predict(text, model):
    tokens = tokenize(text)
    scores = {}
    for c in ("0", "1"):
        s = model["log_prior"][c]
        for t in tokens:
            if t in model["log_likelihood"][c]:
                s += model["log_likelihood"][c][t]
        scores[c] = s
    m  = max(scores.values())
    e1 = math.exp(scores["1"] - m)
    e0 = math.exp(scores["0"] - m)
    prob = e1 / (e0 + e1)
    return 1 if prob >= 0.5 else 0

def main():
    df = pd.read_csv(DATA_PATH)
    df = df[["text", "label"]].dropna()
    df["label"] = df["label"].astype(int)
    print(f"[train] Loaded {len(df)} samples")

    # Split — 80% train, 20% test
    train_df, test_df = train_test_split(
        df, test_size=0.2, random_state=42, stratify=df["label"]
    )

    # Train
    model = train_naive_bayes(
        train_df["text"].tolist(),
        train_df["label"].tolist()
    )

    # Evaluate on test set
    y_true = test_df["label"].tolist()
    y_pred = [predict(t, model) for t in test_df["text"].tolist()]

    # ── RQ 2.1 — Detection Accuracy ──────────────────────────────────────────
    accuracy  = accuracy_score(y_true, y_pred)

    # ── RQ 2.2 — Precision, Recall, F1-Score ─────────────────────────────────
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall    = recall_score(y_true, y_pred,    zero_division=0)
    f1        = f1_score(y_true, y_pred,        zero_division=0)

    # ── RQ 2.3 — False Positive Rate, False Negative Rate ────────────────────
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()
    fp_rate = fp / (fp + tn) if (fp + tn) > 0 else 0
    fn_rate = fn / (fn + tp) if (fn + tp) > 0 else 0

    print("\n" + "=" * 50)
    print("        NAIVE BAYES TRAINING RESULTS")
    print("=" * 50)
    print(f"  RQ 2.1 — Detection Accuracy")
    print(f"  Accuracy            : {accuracy:.4f}  ({accuracy*100:.2f}%)")
    print(f"  ")
    print(f"  RQ 2.2 — Precision, Recall, F1-Score")
    print(f"  Precision           : {precision:.4f}  ({precision*100:.2f}%)")
    print(f"  Recall              : {recall:.4f}  ({recall*100:.2f}%)")
    print(f"  F1-Score            : {f1:.4f}  ({f1*100:.2f}%)")
    print(f"  ")
    print(f"  RQ 2.3 — False Positive & False Negative Rates")
    print(f"  False Positive Rate : {fp_rate:.4f}  ({fp_rate*100:.2f}%)  [FP={fp}]")
    print(f"  False Negative Rate : {fn_rate:.4f}  ({fn_rate*100:.2f}%)  [FN={fn}]")
    print(f"  True Positive={tp}  True Negative={tn}")
    print("=" * 50)

    # Save model
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "w") as f:
        json.dump(model, f, indent=2)
    print(f"\n[train] ✅ Model saved → {MODEL_PATH}  (vocab={model['vocab_size']})")

if __name__ == "__main__":
    main()