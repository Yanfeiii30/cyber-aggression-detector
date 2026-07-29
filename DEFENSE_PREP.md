# CAD Shield — Defense Prep Notes

Everything about the system in one place: what it does, the real numbers,
the things a panel is likely to probe, and the stuff that's easy to forget
or get caught off guard on. Read this the night before, not the morning of.

---

## 1. The one-paragraph version

CAD Shield is a Chrome extension that detects cyber-aggression (insults,
threats, harassment) in real time as someone browses, and blurs it
automatically. Detection is a **hybrid of two algorithms**: a trained
**Naive Bayes** classifier (learns word patterns from labeled data) and
**VADER** (a rule-based sentiment lexicon, no training). Everything runs
**client-side, in the browser — no server, nothing leaves the device.**

---

## 2. The numbers you must have memorized

| | |
|---|---|
| Total dataset | **64,900** comments |
| Split | 51,920 train (80%) / 12,980 test (20%), **stratified**, `random_state=42` |
| Class balance | 16,225 aggressive (**25.0%**) / 48,675 non-aggressive (**75.0%**) — same ratio in both splits |
| Vocabulary | 99,561 words (trained NB) |
| VADER lexicon | 192 words (157 negative / 35 positive) |
| Threshold | 50% for all three modes (NB-only, VADER-only, Hybrid) |
| Formula | `R_score = 0.6 × NB + 0.4 × VADER` |

**Performance (held-out test set, 12,980 comments):**

| | Precision | Recall | F1 |
|---|---|---|---|
| Naive Bayes alone | 85.13% | 77.60% | 81.19% |
| VADER alone | 57.40% | 58.43% | 57.91% |
| **Hybrid** | **88.82%** | 75.16% | **81.42%** |

**Hybrid confusion matrix:** TP 2,439 · TN 9,428 · FP 307 · FN 806

---

## 3. How each algorithm actually works (the mechanism, not just the name)

### Naive Bayes
- Supervised, probabilistic, based on Bayes' Theorem. "Naive" = assumes
  every word contributes independently (ignores grammar/order).
- **Class prior** (baseline before reading any word, computed once from
  training counts): `log(38,940/51,920) = -0.2877` (safe),
  `log(12,980/51,920) = -1.3863` (aggressive).
- **Per-word score**, Laplace/add-1 smoothed:
  `ll(class) = log((word count in class + 1) / (total words in class + vocab size))`
  — the "+1" stops an unseen word from producing `log(0)`.
- **Negation handling**: a word within 3 tokens after "not/never/don't..."
  gets tagged `not_X` instead of scored as the bare word. Because negated
  phrases are rare in training data, their learned split is noisy — it
  gets pulled 75% toward the average of the two class scores
  (`NEGATION_DAMPEN = 0.75`) so one rare negated token can't
  single-handedly flip a verdict.
- Final score → softmax: `P(aggressive) = e^(score_aggressive) / (e^(score_safe) + e^(score_aggressive))`.

### VADER
- Rule-based, **not machine learning**, no training step. Fixed lexicon of
  hand-assigned word scores ("valence").
- Modifiers applied in order: ALL CAPS (±0.733), booster words like
  "very"/"extremely" (±0.29 to ±0.44), negation within 1-3 words
  (× **-0.74**), exclamation marks (small additive boost).
- Normalized to a compound score: `compound = sum / sqrt(sum² + α)`,
  α clamped to [10, 15].
- Only negative sentiment counts as aggression:
  `aggression_score = max(0, -compound)` — positive/neutral text always
  scores 0%.
- Extra logic beyond stock VADER: **sarcasm-cue detection** (flips
  sarcastic-sounding praise negative), **backhanded-insult clause
  override** (splits on "but/however", uses only the clause that directly
  insults "you" if one exists — a trailing compliment can't cancel a
  leading insult), **swear-word-as-intensifier** detection ("fucking
  beautiful" isn't treated as containing an insult).

### Hybrid combination
- `R_score = 0.6 × NB + 0.4 × VADER`.
- **Zero-evidence guard**: if NB matched *zero* words in its vocabulary
  (its output is then just the untouched class prior, not real evidence),
  the hybrid uses VADER's score directly instead of diluting a confident
  VADER read with a meaningless NB number.
- **Self-distress dampening**: comments that read as pure first-person
  venting (e.g. "I feel so worthless") get their score cut by 60%
  (`SELF_DISTRESS_DAMPEN = 0.4`) so genuine emotional distress isn't
  treated as an attack on someone else.
- **English-language filter**: borderline (not high-confidence) detections
  on non-English text are suppressed, since both algorithms are
  English-only by design.

---

## 4. "Why 60/40?" — say this exactly, don't improvise

There is **no formally derived equation** for 60/40 anywhere in the code.
Be upfront about that if asked directly — the honest answer:

1. It's **proportional to each algorithm's standalone F1 score**:
   `81.19 / (81.19 + 57.91) ≈ 58.4%` — close to the chosen 60%, rounded to
   a clean number rather than an oddly-precise 58.4/41.6 split.
2. **It was empirically tested** — increasing VADER's weight past 40% was
   tried and made results measurably worse, consistent with VADER's much
   lower standalone F1 (57.91% vs NB's 81.19%). Giving the weaker,
   untrained signal more influence just let more of its mistakes into the
   final score.
3. The blend **measurably beats NB alone** on the held-out test set:
   Precision 85.13% → 88.82%, F1 81.19% → 81.42%, at a small Recall cost
   (77.60% → 75.16%).

If the actual thesis manuscript (Chapter 3) has a more rigorous
derivation, **that's the authoritative answer** — this in-app explanation
is a defensible empirical justification, not a mathematical proof.

---

## 5. Things that are easy to forget / could catch you off guard

- **The 4 dataset CSVs in `TRAINING/data/` were NOT the source of your
  training data.** We checked: zero text overlap between
  `dataset.csv` and `cyberbullying_tweets.csv`/`davidson_hate_speech.csv`/
  `youtoxic_english_1000.csv`/`augment_intensifier.csv`. They've since
  been deleted from the repo. If asked "where did your 64,900 comments
  come from," the honest answer based on what's actually in the repo is:
  **unclear from the codebase alone** — `format_dataset.py`'s docstring
  references a Kaggle "Jigsaw" `train.csv` as the real source, but that
  file isn't in the repo either. **Know your actual data provenance before
  the defense** — don't say "4 combined datasets" unless you can trace it.
- **Recall dropped slightly in the Hybrid vs. NB alone** (77.60% → 75.16%).
  This is expected and explainable, not a flaw to hide: VADER's signal
  filters out some of NB's false positives, but also mutes a few of NB's
  correct low-confidence catches. It's a real precision/recall trade-off,
  and the system was designed to prioritize *fewer false accusations*
  (higher Precision) over catching every single case.
- **NB and VADER can genuinely disagree** on backhanded phrasing. Example
  actually tested: *"Your works don't looks good! But I still appreciated
  it!"* — VADER alone says 53.3% aggressive, NB alone says 2.1%, Hybrid
  blends to 22.6% safe. This isn't a bug — it's the two algorithms
  legitimately reading the same sentence differently, and the blend
  favoring NB's stronger track record.
- **A rare word's NB score can be noisy**, even when it's a real, correctly
  spelled positive word. Example: "beautiful" alone has a slightly higher
  learned likelihood under the *aggressive* class than the *safe* class in
  the trained vocabulary — not because it's an aggressive word, but because
  the aggressive-class training data is ~3.75x smaller, so a handful of
  occurrences get inflated statistical weight. This was fixed **only in
  the visual word-highlighting** (so it doesn't look like a false accusation
  on-screen) — the underlying scores are unchanged, since that's a genuine,
  if noisy, statistic from real training data.
- **Two real bugs were found and fixed** in `isSelfDirectedDistress()`
  during development — worth mentioning if asked about your testing/QA
  process, since it shows iteration, not just a first-draft system:
  1. It used to block genuine venting like "I feel so worthless" from
     being dampened, because an insult-word gate fired before checking
     who the insult was actually about.
  2. It used to *wrongly* dampen real insults like "this is the dumbest
     video I've ever seen" — down from a real 50.9% (should blur) to
     ~20% (didn't blur) — because "I've" in a common idiom was mistaken
     for a self-directed confession.
  Both fixed by requiring an actual self-referential pattern ("I am/feel/
  think I'm ___", "myself") instead of "any first-person word anywhere,"
  plus an idiom exclusion. Fixed in both `content.js` (JS/live extension)
  and `vader_helper.py` (Python/training), per the project's own rule of
  keeping both implementations in sync.
- **Sprints 7 and 8 have no real results yet** (vocabulary pruning/latency/
  memory profiling, and the 30-user/10-expert ISO 25010 evaluation). Don't
  present placeholder numbers as real — say "in progress, results expected
  by [date]" if asked before that data exists.
- **Scope is English-only**, Chromium-based browsers only. Not audio,
  video, or images. Say this proactively if it's not already covered in
  your objectives slide — panels often ask about scope boundaries.
- **Nothing is sent to a server** — worth stating clearly if asked about
  privacy/data handling, since it's a genuine strength of the design
  (no data collection, no latency from network calls, works offline).

---

## 6. Likely questions and how to answer them

**"Why Naive Bayes and VADER specifically, not something else (e.g. a neural network)?"**
NB is fast, interpretable, and trainable on labeled data with modest
compute — appropriate for a real-time, client-side extension with no
server. VADER needs no training at all and is specifically built for
short, informal social-media-style text (handles punctuation, capitalization,
negation out of the box). Combining a trained statistical model with a
rule-based lexicon lets each one catch what the other structurally can't.

**"What happens if the model is wrong?"**
Content isn't deleted — it's blurred with a reveal option (eye icon), so a
false positive costs one click, not lost information. Whitelist/blocklist
let users override the model's judgment for specific words.

**"How do you handle sarcasm?"**
A curated list of sarcasm-cue phrases ("oh wow," "real genius," "yeah
right"...) is checked against the text; if found and the sentiment reads
positive, VADER's score is flipped negative, since sarcastic-sounding
praise in this context is aggression, not sentiment.

**"How do you handle negation?"**
Both algorithms have dedicated negation logic — VADER multiplies a
negated word's valence by -0.74; NB tags the word as a separate `not_X`
feature (dampened 75% toward the class average, since negated phrases are
rare in training data and noisy on their own).

**"Is this ready for production / real-world deployment?"**
Be honest about current status: dataset, training, and detection pipeline
are complete and evaluated (Sprints 1-5); mitigation UI is complete
(Sprint 6); performance profiling and the formal user study (Sprints 7-8)
are the remaining work before that claim could be made confidently.

---

## 7. Quick file map (if asked "show me where X is")

| Ask about... | Show |
|---|---|
| Training / dataset loading | `TRAINING/train.py` |
| Sarcasm / negation / backhanded-insult logic (Python) | `TRAINING/vader_helper.py` |
| Live page scanning + hybrid formula + all heuristic guards | `EXTENSION/content.js` |
| Naive Bayes (JS) | `EXTENSION/lib/naive_bayes.js` |
| VADER (JS) | `EXTENSION/lib/vader.js` |
| The trained model itself | `EXTENSION/lib/vocab.json` |
| Popup UI incl. live formula walkthroughs | `EXTENSION/popup/popup.js` / `.html` |
| Full evaluation numbers | `TRAINING/model/sop2_report.txt`, or the extension's own **Evaluation** tab |
| Step-by-step algorithm explanation with real numbers | Extension's **Algorithms** tab |

**Live demo tip:** the extension's own **Algorithms** tab already has a
fully-worked, real-number example built in ("You are not beautiful" vs.
"You are so beautiful") — you can present directly from the running
extension instead of static slides for the technical deep-dive.
