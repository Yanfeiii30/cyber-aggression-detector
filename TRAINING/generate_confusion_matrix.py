"""
generate_confusion_matrix.py
----------------------------
Generates a visual confusion matrix for all 3 models:
  - Naive Bayes Only
  - VADER Only
  - Hybrid (NB + VADER)

Run:  python generate_confusion_matrix.py
Output: confusion_matrix.png (saved in TRAINING folder)
"""

import json, os
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix
from train import predict_nb, predict_vader, predict_hybrid

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_PATH  = os.path.join(BASE_DIR, "data", "dataset.csv")
MODEL_PATH = os.path.join(BASE_DIR, "model", "vocab.json")
OUT_PATH   = os.path.join(BASE_DIR, "confusion_matrix.png")

def plot_cm(ax, cm, title, color):
    tn, fp, fn, tp = cm.ravel()
    total = tn + fp + fn + tp

    data = np.array([[tn, fp], [fn, tp]])
    labels = np.array([
        [f"TN\n{tn}\n({tn/total*100:.1f}%)", f"FP\n{fp}\n({fp/total*100:.1f}%)"],
        [f"FN\n{fn}\n({fn/total*100:.1f}%)", f"TP\n{tp}\n({tp/total*100:.1f}%)"]
    ])

    # Draw colored grid
    max_val = data.max()
    for i in range(2):
        for j in range(2):
            val = data[i, j]
            intensity = val / max_val if max_val > 0 else 0
            # Diagonal = correct predictions (green tones)
            # Off-diagonal = errors (red tones)
            if i == j:
                bg = (*[c * (0.4 + 0.6 * intensity) for c in color], 1.0)
            else:
                bg = (1.0, 0.85 - 0.3 * intensity, 0.85 - 0.3 * intensity, 1.0)

            rect = mpatches.FancyBboxPatch(
                (j + 0.02, 1 - i + 0.02), 0.96, 0.96,
                boxstyle="round,pad=0.02",
                facecolor=bg, edgecolor="white", linewidth=2,
                transform=ax.transData, clip_on=False
            )
            ax.add_patch(rect)
            text_color = "white" if i == j else "#7f1d1d"
            ax.text(j + 0.5, 1 - i + 0.5, labels[i, j],
                    ha="center", va="center",
                    fontsize=10.5, fontweight="bold",
                    color=text_color, linespacing=1.5)

    ax.set_xlim(0, 2)
    ax.set_ylim(0, 2)
    ax.set_xticks([0.5, 1.5])
    ax.set_yticks([0.5, 1.5])
    ax.set_xticklabels(["Predicted\nSafe", "Predicted\nAggressive"],
                        fontsize=9, fontweight="bold")
    ax.set_yticklabels(["Actual\nAggressive", "Actual\nSafe"],
                        fontsize=9, fontweight="bold")
    ax.tick_params(length=0)
    ax.set_title(title, fontsize=12, fontweight="bold", pad=14, color="#1e293b")

    prec = tp / (tp + fp) if (tp + fp) > 0 else 0
    rec  = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1   = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0
    ax.set_xlabel(
        f"Precision: {prec*100:.1f}%   Recall: {rec*100:.1f}%   F1: {f1*100:.1f}%",
        fontsize=9, labelpad=10, color="#475569"
    )
    for spine in ax.spines.values():
        spine.set_visible(False)

def main():
    print("[INFO] Loading dataset...")
    df = pd.read_csv(DATA_PATH)[["text", "label"]].dropna()
    df["label"] = df["label"].astype(int)
    print(f"[INFO] {len(df)} samples loaded")

    _, test_df = train_test_split(
        df, test_size=0.2, random_state=42, stratify=df["label"]
    )
    texts  = test_df["text"].tolist()
    y_true = test_df["label"].tolist()
    print(f"[INFO] Test set: {len(test_df)} samples")

    print("[INFO] Loading model...")
    with open(MODEL_PATH, encoding="utf-8") as f:
        model = json.load(f)

    print("[INFO] Running Naive Bayes predictions...")
    y_nb = [predict_nb(t, model) for t in texts]

    print("[INFO] Running VADER predictions...")
    y_vader = [predict_vader(t) for t in texts]

    print("[INFO] Running Hybrid predictions...")
    y_hybrid = [predict_hybrid(t, model) for t in texts]

    cm_nb    = confusion_matrix(y_true, y_nb)
    cm_vader = confusion_matrix(y_true, y_vader)
    cm_hybrid= confusion_matrix(y_true, y_hybrid)

    # ── Plot ──────────────────────────────────────────────────────────────────
    fig, axes = plt.subplots(1, 3, figsize=(15, 5.5))
    fig.patch.set_facecolor("#f8fafc")

    fig.suptitle(
        "SOP 2 — Confusion Matrix Comparison\n"
        "Cyber-Aggression Detector · Pamantasan ng Cabuyao BSCS Thesis 2026",
        fontsize=13, fontweight="bold", color="#0f172a", y=1.02
    )

    GREEN = (0.086, 0.502, 0.239)   # Naive Bayes — blue-green
    AMBER = (0.961, 0.620, 0.043)   # VADER — amber
    DGREEN= (0.086, 0.502, 0.239)   # Hybrid — deep green

    plot_cm(axes[0], cm_nb,    "Naive Bayes Only",    (0.22, 0.48, 0.82))
    plot_cm(axes[1], cm_vader, "VADER Only",           (0.85, 0.55, 0.10))
    plot_cm(axes[2], cm_hybrid,"Hybrid (NB + VADER) ★",(0.086, 0.50, 0.24))

    for ax in axes:
        ax.set_facecolor("#f8fafc")

    plt.tight_layout(pad=2.5)
    plt.savefig(OUT_PATH, dpi=180, bbox_inches="tight",
                facecolor="#f8fafc", edgecolor="none")
    plt.close()
    print(f"\n[DONE] Saved -> {OUT_PATH}")

if __name__ == "__main__":
    main()
