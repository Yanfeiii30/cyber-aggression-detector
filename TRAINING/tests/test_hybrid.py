"""
test_hybrid.py - Unit tests for the active Hybrid (NB + VADER) pipeline
(train.py + model/vocab.json — the model the Chrome extension actually uses)
Run with: python -m pytest tests/test_hybrid.py -v
"""
import os, sys, json

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "model", "vocab.json")
sys.path.insert(0, BASE_DIR)

from train import predict_hybrid, nb_probability, vader_score_real, truncate_tokens, MAX_TOKENS

with open(MODEL_PATH, encoding="utf-8") as f:
    model = json.load(f)

def hybrid_score(text):
    """R_score = 0.6 * NB + 0.4 * VADER — same formula predict_hybrid uses
    internally, exposed here so tests can check the raw score, not just the
    binary verdict."""
    return (0.6 * nb_probability(text, model)) + (0.4 * vader_score_real(text))

AGGRESSIVE = [
    "You are so stupid and worthless, I hate you!",
    "I HATE YOU SO MUCH YOU IDIOT!!!",
    "Go kill yourself, nobody likes you.",
    "You're a disgusting piece of trash.",
    "Shut up you dumb loser nobody cares about you",
]
NON_AGGRESSIVE = [
    "Have a wonderful day, hope you feel better!",
    "This is a really interesting article, thanks for sharing.",
    "I appreciate your help with this problem.",
    "The weather is nice today, perfect for a walk.",
    "GG bro you dominated that finals!",
]

def test_hybrid_score_within_range():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        assert 0.0 <= hybrid_score(text) <= 1.0

def test_hybrid_returns_binary_label():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        assert predict_hybrid(text, model) in (0, 1)

def test_hybrid_matches_threshold_comparison():
    text = "You are an absolute idiot, I hate you!"
    score = hybrid_score(text)
    assert predict_hybrid(text, model, threshold=0.5) == (1 if score >= 0.5 else 0)

def test_clearly_aggressive_detected():
    count = sum(predict_hybrid(t, model) for t in AGGRESSIVE)
    assert count >= 3

def test_clearly_safe_not_flagged():
    count = sum(1 for t in NON_AGGRESSIVE if predict_hybrid(t, model) == 0)
    assert count >= 3

def test_nb_component_is_valid_probability():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        assert 0.0 <= nb_probability(text, model) <= 1.0

def test_vader_component_is_valid_probability():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        assert 0.0 <= vader_score_real(text) <= 1.0

def test_empty_string():
    assert predict_hybrid("", model) in (0, 1)

def test_very_long_text():
    assert predict_hybrid("you are terrible " * 100, model) in (0, 1)

def test_threshold_strict_favors_safe():
    is_agg = predict_hybrid("This is slightly bad.", model, threshold=0.99)
    assert is_agg == 0

def test_threshold_lenient_favors_aggressive():
    is_agg = predict_hybrid("This is slightly bad.", model, threshold=0.01)
    assert is_agg == 1

def test_backhanded_insult_not_cancelled_by_compliment():
    # "but you are beautiful" must not cancel out "you are worthless" —
    # the clause-override fix in vader_helper.py specifically addresses this.
    assert predict_hybrid("you are worthless but you are beautiful", model) == 1

def test_swear_word_as_intensifier_is_not_an_insult():
    # "fucking" directly before a positive word ("beautiful") is an
    # intensifier, not an insult — the fix in vader_helper.py/train.py.
    assert predict_hybrid("you are fucking beautiful", model) == 0

def test_self_directed_distress_not_flagged_as_aggressive():
    # Pure first-person venting (no "you" address, no insult/profanity
    # vocabulary) must not be flagged just because it's emotionally intense —
    # the is_self_directed_distress() dampening in train.py/vader_helper.py.
    text = ("OMG I AM LITERALLY CRYING RIGHT NOW!!! I missed the whole stream "
            "because my internet was completely dead and awful!!! I am so "
            "incredibly sad and disappointed!!!")
    assert predict_hybrid(text, model) == 0

def test_self_directed_distress_gate_does_not_shield_real_insults():
    # The distress gate must not fire (or matter) when the text actually
    # insults someone — "you", third-party references, and insult/profanity
    # vocabulary all veto the gate before it can dampen anything.
    assert predict_hybrid("you are so stupid and worthless, I hate you!", model) == 1
    assert predict_hybrid("she is such an idiot, everyone thinks so", model) == 1
    assert predict_hybrid("admins suck, they ruined my page, fuck this place", model) == 1

def test_truncate_tokens_keeps_short_text_unchanged():
    text = "you are worthless"
    assert truncate_tokens(text) == text

def test_truncate_tokens_caps_at_128_words():
    # Manuscript Ch3 (Complexity Analysis, Figure 6) commits to a 128-token
    # boundary constraint on the Text Extraction Module.
    text = " ".join(f"word{i}" for i in range(300))
    truncated = truncate_tokens(text)
    assert len(truncated.split()) == MAX_TOKENS

def test_predict_hybrid_does_not_crash_on_very_long_text():
    text = "you are worthless and stupid " * 200
    assert predict_hybrid(text, model) in (0, 1)
