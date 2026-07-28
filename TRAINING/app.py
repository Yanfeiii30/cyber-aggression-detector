"""
app.py
------
LEGACY — NOT the active pipeline. Kept for reference only.

This script loads model/nb_model.pkl, a separate sklearn CountVectorizer +
Naive Bayes pipeline from an earlier iteration of this project. It is
completely independent of train.py's model/vocab.json pipeline, which is
the one actually used by the Chrome extension (EXTENSION/lib/naive_bayes.js
loads vocab.json, not nb_model.pkl). Retraining via train.py does NOT
update nb_model.pkl or anything this script reports.

If you're looking for the real SOP 2 evaluation, run train.py instead —
it trains on the current dataset.csv, writes model/vocab.json, and
generates model/sop2_report.txt with today's precision/recall/F1.

Thesis: Pamantasan ng Cabuyao BSCS 2026

Usage:
  python app.py
"""

import os
import re
import nltk
import joblib
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix

nltk.download('stopwords', quiet=True)
from nltk.corpus import stopwords

# ── Setup ─────────────────────────────────────────────────────────────────────
analyzer   = SentimentIntensityAnalyzer()
stop_words = set(stopwords.words('english'))

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'nb_model.pkl')
model, vectorizer = joblib.load(MODEL_PATH)

# ── Text Preprocessing ────────────────────────────────────────────────────────
def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    tokens = [t for t in text.split() if t not in stop_words]
    return ' '.join(tokens)

# ── Prediction Function ───────────────────────────────────────────────────────
def predict(text, mode='hybrid'):
    """
    Predicts whether text is aggressive or not.
    Modes: 'nb', 'vader', 'hybrid'
    Returns: score, is_aggressive, label
    """
    clean        = clean_text(text)
    vec          = vectorizer.transform([clean])
    nb_prob      = float(model.predict_proba(vec)[0][1])

    vader_scores   = analyzer.polarity_scores(text)
    vader_compound = vader_scores['compound']
    vader_norm     = abs(vader_compound) if vader_compound < 0 else 0

    # ── Mode Selection ────────────────────────────────────────────────────────
    if mode == 'nb':
        # SOP 2 — Naive Bayes Only
        score         = nb_prob
        is_aggressive = score >= 0.5

    elif mode == 'vader':
        # SOP 2 — VADER Only
        score         = vader_norm
        is_aggressive = vader_compound <= -0.3

    else:
        # SOP 2 — Hybrid (Default): R_score = 0.6 * NB + 0.4 * VADER
        score         = (0.6 * nb_prob) + (0.4 * vader_norm)
        is_aggressive = score >= 0.5

    return {
        "text"          : text,
        "mode"          : mode,
        "nb_prob"       : round(nb_prob, 4),
        "vader_compound": round(vader_compound, 4),
        "hybrid_score"  : round(score, 4),
        "is_aggressive" : bool(is_aggressive),
        "label"         : "AGGRESSIVE" if is_aggressive else "NON-AGGRESSIVE"
    }

# ── SOP 2 Evaluation ──────────────────────────────────────────────────────────
def evaluate(texts, true_labels, mode='hybrid'):
    """
    Evaluates the model on a list of texts and true labels.
    Computes Precision, Recall, F1-Score for SOP 2.
    """
    pred_labels = [1 if predict(t, mode)["is_aggressive"] else 0 for t in texts]

    cm = confusion_matrix(true_labels, pred_labels)
    tn, fp, fn, tp = cm.ravel()

    precision = precision_score(true_labels, pred_labels, zero_division=0)
    recall    = recall_score(true_labels, pred_labels,    zero_division=0)
    f1        = f1_score(true_labels, pred_labels,        zero_division=0)

    print("\n" + "=" * 55)
    print(f"     SOP 2 EVALUATION RESULTS — Mode: {mode.upper()}")
    print("=" * 55)
    print(f"  Confusion Matrix")
    print(f"  True Positive  (TP) : {tp}")
    print(f"  True Negative  (TN) : {tn}")
    print(f"  False Positive (FP) : {fp}")
    print(f"  False Negative (FN) : {fn}")
    print(f"  ")
    print(f"  SOP 2.1 — Precision")
    print(f"  Precision           : {precision:.4f}  ({precision*100:.2f}%)")
    print(f"  Formula: TP / (TP + FP) = {tp} / ({tp} + {fp})")
    print(f"  ")
    print(f"  SOP 2.2 — Recall")
    print(f"  Recall              : {recall:.4f}  ({recall*100:.2f}%)")
    print(f"  Formula: TP / (TP + FN) = {tp} / ({tp} + {fn})")
    print(f"  ")
    print(f"  SOP 2.3 — F1-Score")
    print(f"  F1-Score            : {f1:.4f}  ({f1*100:.2f}%)")
    print(f"  Formula: 2 * (Precision * Recall) / (Precision + Recall)")
    print("=" * 55)

    return precision, recall, f1

# ── Quick Test ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    # Sample test texts for quick demonstration
    test_texts = [
        "You are so stupid and worthless!",
        "I hate you so much!!!",
        "Have a wonderful day!",
        "This is a great comment, thanks!",
        "You are an idiot and I hope you suffer.",
        "I love this video, very helpful!",
    ]
    test_labels = [1, 1, 0, 0, 1, 0]  # 1 = aggressive, 0 = non-aggressive

    print("\n=== SINGLE TEXT PREDICTION TEST ===")
    for text in test_texts:
        result = predict(text, mode='hybrid')
        label  = "AGGRESSIVE" if result["is_aggressive"] else "SAFE"
        print(f"[{label}] score={result['hybrid_score']} | {text[:50]}")

    print("\n=== SOP 2 EVALUATION — HYBRID ===")
    evaluate(test_texts, test_labels, mode='hybrid')

    print("\n=== SOP 2 EVALUATION — NAIVE BAYES ONLY ===")
    evaluate(test_texts, test_labels, mode='nb')

    print("\n=== SOP 2 EVALUATION — VADER ONLY ===")
    evaluate(test_texts, test_labels, mode='vader')