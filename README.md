# CAD Shield — Cyber-Aggression Detector

Real-time cyber-aggression detection and mitigation, implemented as a
Chromium-based browser extension. Hybrid detection combines a trained Naive
Bayes classifier with VADER sentiment analysis — fully client-side, no
server required.

*Pamantasan ng Cabuyao — BSCS Thesis 2026*

## Two parts, two languages

This repo has two independent pieces that work together:

| | `TRAINING/` | `EXTENSION/` |
|---|---|---|
| **What it is** | Offline model training & evaluation | The live Chrome extension |
| **Language** | Python | JavaScript |
| **Runs where** | Your machine, offline | Inside the user's browser |
| **Purpose** | Train the model, produce SOP 2 metrics | Detect and blur aggressive content in real time |

They're connected by one file: **`TRAINING/model/vocab.json`** — the trained
Naive Bayes model (word probabilities). After retraining, copy it into
`EXTENSION/lib/vocab.json` so the extension picks up the new model.

Because a Chrome extension can only run JavaScript, the same algorithm logic
(tokenizing, scoring, sarcasm/negation handling, etc.) exists **twice** —
once in Python (`TRAINING/train.py`, `TRAINING/vader_helper.py`) for
training/evaluation, and once in JavaScript (`EXTENSION/lib/naive_bayes.js`,
`EXTENSION/lib/vader.js`) for the live extension. Any fix to the detection
logic needs to be made in both places to keep them in sync.

## Retraining the model

```bash
cd TRAINING
python train.py                      # trains on data/dataset.csv, writes model/vocab.json + model/sop2_report.txt
python generate_confusion_matrix.py  # regenerates confusion_matrix.png
cp model/vocab.json ../EXTENSION/lib/vocab.json
python -m pytest tests/ -v
```

## Loading the extension

`chrome://extensions` → enable Developer Mode → **Load unpacked** → select
the `EXTENSION/` folder. After editing any extension file, reload it from
that same page, then refresh any tab you're testing on (content scripts
don't hot-reload).

## Key files

**Training (`TRAINING/`)**
- `train.py` — trains Naive Bayes, runs the SOP 2 evaluation (precision/recall/F1), writes `model/vocab.json`
- `vader_helper.py` — wraps the real `vaderSentiment` library; also home to the sarcasm-cue, negation, backhanded-insult, and English-language-filter logic used during evaluation
- `generate_confusion_matrix.py` — renders `confusion_matrix.png` from the trained model
- `tests/` — pytest suite covering `train.py`/`vader_helper.py`'s actual prediction functions
- `app.py` — a separate, legacy sklearn-based pipeline (loads `model/nb_model.pkl`, not `vocab.json`). Not part of the active detection pipeline — kept for reference only. Don't assume changes to `train.py` are reflected here.

**Extension (`EXTENSION/`)**
- `content.js` — scans the live page, runs the hybrid formula, blurs flagged content
- `lib/naive_bayes.js` / `lib/vader.js` — the JS reimplementation of the same algorithms trained in Python
- `popup/` — the extension's popup UI (Detection / Test / Steps / Evaluation / Settings tabs)
- `background.js`, `modules/` — service worker and small helper modules (algorithm selector, whitelist/blocklist, blur rendering)

## Algorithm modifications beyond the base algorithms

Both Naive Bayes and VADER are extended with rule-based augmentation to
handle cases the unmodified algorithms can't:

- **Sarcasm cue detection** — known sarcastic phrases correct VADER's score and add NB features
- **Backhanded-insult clause override** — "you are worthless but you are beautiful" isn't allowed to cancel out via the compliment
- **Contextual valence shifting** — negation tagging (`not_stupid` ≠ `stupid`) and swear-word-as-intensifier detection (`fucking beautiful` isn't an insult)
- **English-language filter** — borderline detections on non-English text are suppressed, since both algorithms are trained/built for English only

Every one of these was validated against the real training dataset
(`data/dataset.csv`) before being kept — see the comments in `vader_helper.py`
and `train.py` for the specific numbers and rejected alternatives.
