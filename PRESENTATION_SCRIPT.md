# CAD Shield — SE2 Progress Presentation Script
**Real-Time Cyber-Aggression Detection and Mitigation Using Naive Bayes and VADER in a Chromium-Based Browser Extension**
Section 1: Current Progress (Sprints 1–2) · Section 2: Remaining Sprints (Sprints 3–8)
Adviser: Asst. Prof. John Patrick Ogalesco

> **How to use this script:** Everything in *italics inside brackets* is a stage
> direction — what to click, share, or do. Everything else is spoken text —
> read it naturally, don't recite it word-for-word like a robot. Numbers in
> this script marked **[VERIFIED]** come straight from the actual codebase/
> `vocab.json`/`sop2_report.txt` and are safe to present as-is. Numbers marked
> **[FILL IN]** are things I don't have real data for (your actual latency
> tests, your actual 30-user/10-expert evaluation results) — replace those
> placeholders with your real findings before presenting. Never present a
> fabricated number to your adviser; if you don't have it yet, say "still in
> progress, results expected by Sprint 8" instead.

---

## Before you go live (5 minutes prior)

- [ ] Whoever is screen-sharing has the extension already loaded (`chrome://extensions` → Developer Mode → Load unpacked → `EXTENSION/`), **Expert Mode turned on** in Settings (so Test/Steps/Algorithms/Evaluation tabs are visible), and Dark/Light mode set to whichever looks better on the call.
- [ ] Have a YouTube or Facebook comment section open in another tab, so the live blur demo has something real to scan.
- [ ] Decide who's screen-sharing for which section ahead of time — the smoothest handoff is one person stays on share for the whole demo portion (Sections 2's Cyryl → Yasmien handoff) rather than re-sharing every time.
- [ ] Everyone's camera/mic tested. Whoever presents next stays on mute but ready, not multitasking off-screen.

---

## Opening — whoever kicks off the call (10 seconds)

*[Say as soon as the adviser joins / recording starts]*

"Good [morning/afternoon] po, Sir Ogalesco. We're Group [X] presenting CAD
Shield — our real-time cyber-aggression detection Chrome extension. We'll
run through two sections today: what we've completed in Sprints 1 and 2,
then what's coming in Sprints 3 through 8. I'll hand it over to Ryzza to
start us off."

---

# SECTION 1 — CURRENT PROGRESS (Sprints 1–2)

## Speaker 1 — Ryzza Miel E. Damian (Project Manager / Research Lead)

*[DO: Share the title/agenda slide.]*

**Say:**

"Thank you. I'll cover the introduction, our problem statement, project
objectives, and where we currently stand.

**Introduction and overview.** CAD Shield is a browser extension that
detects cyber-aggression — insults, threats, harassment — in real time as
someone browses, and blurs it automatically before they have to read it.
It runs entirely client-side, on the user's own device — no server, no
data leaves the browser. Today's presentation has two parts: Section 1
covers what's already built and validated — the dataset, the trained
model, and the evaluation results. Section 2 covers the six remaining
sprints — the live extension itself, the mitigation features, and the
final user evaluation.

**Problem statement.** Cyberbullying and online harassment are a
significant and growing problem, especially for younger users on social
platforms, and most existing moderation happens after the fact — a
comment gets reported, reviewed, and removed hours or days later, if at
all. Our proposed solution is a real-time, client-side detector: instead
of relying on centralized moderation, CAD Shield scans content as it
loads and blurs anything flagged, before the user is ever exposed to it.

**Objectives and scope.** Our core objective is to design and evaluate a
hybrid detection model — combining a trained Naive Bayes classifier with
VADER sentiment analysis — that outperforms either algorithm used alone,
then package that model into a working Chrome extension with mitigation
features like blur-and-reveal, whitelisting, and blocklisting. The scope
is English-language text content on Chromium-based browsers; audio, video,
and non-English comments are explicitly out of scope for this thesis.

**Current status.** Sprints 1 and 2 are complete — dataset collection,
labeling, preprocessing, and the initial 80/20 train-test split are done,
which Angel will walk through next. I'll hand it over to her."

---

## Speaker 2 — Angel Mae P. Garcia (Scrum Master / Data & Documentation)

*[DO: If sharing your own screen, open the extension popup → **Evaluation**
tab → scroll to **Dataset Composition**. This table is already built into
the app and shows these exact numbers live — no need for a separate slide.]*

**Say:**

"Thanks, Ryzza. I'll cover Sprint 1 and Sprint 2 — dataset work, and the
class balance / ethics side of it.

**Sprint 1 — dataset collection and labeling.** We combined four labeled
datasets — a cyberbullying tweets set, the Davidson hate-speech dataset, a
YouToxic English set, and an intensifier-augmentation set — into one
combined corpus of **64,900 labeled comments** *[VERIFIED — matches
`TRAINING/data/` and `sop2_report.txt`]*. Each comment is labeled either
aggressive or non-aggressive. *[FILL IN: your actual labeling
process/inter-rater agreement if you did manual labeling on top of the
public datasets — say that here.]*

**Sprint 2 — preprocessing, the JSON hash map, and the 80/20 split.**
After cleaning — lowercasing, punctuation stripping, stopword removal —
we built the trained model as a JSON structure: essentially a hash map of
every word in our **99,561-word vocabulary** *[VERIFIED]* to its
log-likelihood under each class, using Laplace, or add-one, smoothing so
a word the model has never seen doesn't break the calculation. That's
what ships as `vocab.json` inside the extension itself.

For evaluation, we used a stratified 80/20 split via scikit-learn's
`train_test_split`, `random_state=42` — **51,920 comments for training,
12,980 held out for testing**, never touched during training
*[VERIFIED]*.

**Class balance.** Of the full 64,900, **16,225 are aggressive — 25%** —
and **48,675 are non-aggressive — 75%** *[VERIFIED]*. That roughly 1-to-3
ratio reflects real-world data — most comments online aren't aggressive —
and we deliberately used a *stratified* split specifically so that same
25/75 ratio is preserved in both the training set and the held-out test
set, instead of a plain random split that could accidentally skew one way.

**Research ethics compliance.** *[FILL IN: describe your actual
compliance measures here — e.g., all source datasets are publicly
available research datasets, no personally identifying information was
collected or is stored, no new human-subject data was gathered in Sprints
1–2 since this is public dataset re-use, and whatever your handling
protocol was. If your program requires an ethics review board sign-off,
mention that status here.]*

That's Sprints 1 and 2. I'll pass it to Cyryl for Section 2."

---

# SECTION 2 — REMAINING SPRINTS (Sprints 3–8)

## Speaker 3 — Cyryl P. Palisoc (Lead Programmer)

*[DO: Switch to sharing the extension itself. Open the popup, go to the
**Algorithms** tab. This is your visual aid — it already has the real
formulas, real numbers, and two fully worked examples built in, so you
can talk directly over it instead of a static slide.]*

**Say:**

"Thanks, Angel. I'm covering Sprints 3 through 5 — training the Naive
Bayes classifier and porting it to JavaScript, the VADER module and our
hybrid formula, and the extension's architecture.

**Sprint 3 — Naive Bayes training and the JavaScript port.**

*[DO: point to the "How Naive Bayes Works" card.]*

Naive Bayes is a supervised, probabilistic classifier — it learns by
counting how often each word appears in aggressive versus non-aggressive
comments across our 51,920 training comments, then uses Bayes' Theorem to
turn those counts into a probability for new text. It's called 'naive'
because it assumes each word contributes independently, ignoring grammar
and word order.

We trained it in Python — that's `train.py` — using real Laplace-smoothed
log-likelihoods, and it evaluates at **85.13% Precision, 77.60% Recall,
81.19% F1-score** on the held-out test set *[VERIFIED]*. Because a Chrome
extension can only run JavaScript, we then ported the exact same scoring
logic — same formulas, same smoothing, same negation handling — into
`naive_bayes.js`, so the live extension makes identical predictions to
what we evaluated in Python.

**Sprint 4 — the VADER module and the hybrid formula.**

*[DO: scroll to "How VADER Works," then to "Why 60% Naive Bayes / 40%
VADER?"]*

VADER is a rule-based sentiment tool, not machine learning — no training
step. It scores text against a hand-built lexicon of **192 words**, 157
negative and 35 positive *[VERIFIED]*, with rules for negation,
intensifier words, ALL CAPS, and punctuation. On its own it scores
**57.40% Precision, 58.43% Recall, 57.91% F1** *[VERIFIED]* — noticeably
weaker than Naive Bayes alone, which makes sense: it has no memory of our
specific training data, just general sentiment rules.

We combine both into one hybrid formula:

```
R_score = 0.6 × Naive_Bayes_probability + 0.4 × VADER_score
```

The 60/40 split gives the majority vote to the stronger, trained model,
while still letting VADER correct cases NB's word-counting misses — for
example, sentences using negation or sarcasm that a bag-of-words model
alone doesn't catch. Blended, Hybrid scores **88.82% Precision, 75.16%
Recall, 81.42% F1** *[VERIFIED]* — the best Precision and F1 of the three.

*[DO: scroll to "Worked Examples — Aggressive vs. Safe" and read one of
the two examples live — it's a real, verified before/after: "You are not
beautiful" scores 54.8% and gets blurred, "You are so beautiful" scores
21.7% and doesn't, same sentence, one word removed.]*

**Sprint 5 — extension architecture and the DOM scanner.**

The extension follows Chrome's Manifest V3 structure: `content.js` is
injected into every page and walks the visible DOM text, running each
comment through the hybrid formula and blurring anything at or above the
50% threshold, while explicitly skipping navigation bars, buttons, and
other non-content UI elements so we're only ever scanning real user
comments. `background.js` is the service worker handling extension-level
events. Everything runs locally in the browser — nothing is sent to a
server.

That's Sprints 3 through 5. Over to Yasmien for the mitigation UI and the
evaluation plan."

---

## Speaker 4 — Yasmien Aira V. Regidor (Junior Programmer / Researcher)

*[DO: Stay on the shared extension. Go to Settings tab to show
whitelist/blocklist, then to a live comment section to demo blur/reveal.]*

**Say:**

"Thanks, Cyryl. I'll cover Sprints 6 through 8 — the mitigation UI,
performance profiling, and our evaluation plan — then close with a
comparison against our original plan.

**Sprint 6 — mitigation UI, blocklist and whitelist.**

*[DO: point to the Whitelist and Blocklist cards in Settings.]*

Beyond just detecting aggression, the extension gives users control.
Flagged comments are blurred in place, with a small eye icon to reveal
them on demand instead of hiding them permanently — so nothing's fully
inaccessible, just gated behind an intentional click. The **Whitelist**
lets a user mark specific words that should never be blurred, even if the
model flags them — useful for inside jokes or usernames the model
misreads. The **Blocklist** does the opposite — words that should always
be blurred regardless of score. *[DO, optional: demo live — type a
sentence into a real comment box and show it get blurred, then click the
eye icon to reveal it.]*

**Sprint 7 — vocabulary pruning, latency, and memory profiling.**

*[FILL IN — I don't have real profiling numbers for this from our
development work, so replace this paragraph with your actual results
before presenting. Suggested structure: state the current vocabulary size
(99,561 words, ~7.7MB as JSON), describe what pruning approach you're
taking or took (e.g. removing words below a minimum training-count
threshold) and its effect on file size / lookup speed, then report actual
measured scan latency per comment and memory footprint — Chrome DevTools'
Performance and Memory tabs are the standard way to capture both.]*

"[Placeholder wording — replace with your real numbers:] Our current
vocabulary is 99,561 words. We're targeting a reduction to roughly
[X words / X% smaller] by pruning terms below a minimum frequency
threshold, which we expect to bring per-comment scan latency down to
under [X]ms and reduce the extension's memory footprint by [X]%. Full
profiling results will be available by Sprint 8."

**Sprint 8 — evaluation: ISO 25010, 30 users, 10 experts.**

*[FILL IN — same as above, no real results exist yet from our side.]*

"[Placeholder wording:] Our final evaluation will assess the extension
against the ISO 25010 quality model — specifically functional suitability,
performance efficiency, usability, and reliability — through two tracks:
a usability study with 30 general users, and an expert evaluation with 10
reviewers assessing detection accuracy and interface design. This is
scheduled for Sprint 8; results aren't available yet, but the evaluation
instruments are [in progress / already drafted — say which]."

**Comparison against our original plan, challenges, and timeline.**

*[FILL IN: your actual sprint burndown / whether you're on schedule. If
you are behind on Sprint 7/8 specifically because those depend on Sprint
5/6 being finished first, that's a completely normal and honest thing to
say to an adviser — better than implying results exist that don't.]*

"[Placeholder wording:] We're currently on track through Sprint 6.
Sprints 7 and 8 depend on the extension being feature-complete first,
which we expect to reach by [date]. The main challenge so far has been
[e.g. keeping the Python training logic and the JavaScript runtime logic
in exact sync — any fix to the detection rules has to be made in both
places]. We're targeting [date] for final evaluation completion.

That covers Sprints 3 through 8. Thank you, Sir Ogalesco — we're happy to
take any questions."

---

## Closing (whoever opened, or Ryzza again)

*[DO: everyone unmute/camera-on for Q&A.]*

"That's our full progress update — Section 1 covered the completed
dataset and evaluation work, Section 2 covered the live extension and
what's left through Sprint 8. We're open to any questions or feedback,
Sir."

---

## Quick fact-check sheet (for Q&A — all VERIFIED against the actual codebase)

| Metric | Naive Bayes | VADER | Hybrid |
|---|---|---|---|
| Precision | 85.13% | 57.40% | **88.82%** |
| Recall | 77.60% | 58.43% | 75.16% |
| F1-Score | 81.19% | 57.91% | **81.42%** |

- Dataset: 64,900 total → 51,920 train (80%) / 12,980 test (20%), stratified, `random_state=42`
- Class balance: 16,225 aggressive (25.0%) / 48,675 non-aggressive (75.0%) — same ratio in both splits
- Vocabulary: 99,561 words · VADER lexicon: 192 words (157 negative / 35 positive)
- Hybrid confusion matrix: TP 2,439 · TN 9,428 · FP 307 · FN 806
- Formula: `R_score = 0.6 × NB + 0.4 × VADER`, decision threshold 50%, same cutoff for all three modes
- **If asked "why exactly 60/40 and not another split":** it's proportional to each algorithm's
  standalone F1 (81.19/(81.19+57.91) ≈ 58.4%, close to the chosen 60%), and pushing VADER's
  weight higher was tested and measurably hurt accuracy. There's no formal derivation of the
  exact 60/40 figure inside the codebase itself beyond that — if your thesis manuscript (Chapter 3)
  has a more rigorous derivation, that's your authoritative answer; check it before the defense.
