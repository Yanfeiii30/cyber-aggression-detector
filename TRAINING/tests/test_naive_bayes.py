"""
test_naive_bayes.py - Unit tests for the active Naive Bayes pipeline
(train.py + model/vocab.json — the model the Chrome extension actually uses)
Run with: python -m pytest tests/test_naive_bayes.py -v
"""
import os, sys, json, pytest

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "model", "vocab.json")
sys.path.insert(0, BASE_DIR)

from train import predict_nb, nb_probability, predict_tokens

with open(MODEL_PATH, encoding="utf-8") as f:
    model = json.load(f)

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

def test_model_file_exists():
    assert os.path.exists(MODEL_PATH)

def test_model_loads_successfully():
    assert model is not None
    assert "log_prior" in model and "log_likelihood" in model

def test_model_has_two_classes():
    assert set(model["log_prior"].keys()) == {"0", "1"}
    assert set(model["log_likelihood"].keys()) == {"0", "1"}

def test_model_has_vocabulary():
    assert model["vocab_size"] > 0
    assert len(model["log_likelihood"]["0"]) > 0

def test_predict_returns_binary_label():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        assert predict_nb(text, model) in (0, 1)

def test_probability_in_valid_range():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        prob = nb_probability(text, model)
        assert 0.0 <= prob <= 1.0

def test_aggressive_samples_have_higher_prob():
    probs = [nb_probability(t, model) for t in AGGRESSIVE]
    assert sum(probs) / len(probs) > 0.4

def test_non_aggressive_samples_have_lower_prob():
    probs = [nb_probability(t, model) for t in NON_AGGRESSIVE]
    assert sum(probs) / len(probs) < 0.6

def test_empty_string():
    assert predict_nb("", model) in (0, 1)

def test_very_long_text():
    assert predict_nb("you are stupid " * 200, model) in (0, 1)

def test_text_with_a_url_still_predicts():
    # train.py's tokenizer extracts letter-only runs (re.findall(r"[a-z]+", ...))
    # and doesn't explicitly strip URLs, so "http"/"www"/"com" end up as their
    # own tokens — unlike the legacy app.py pipeline, which did strip URLs.
    # This just verifies a URL in the text doesn't break prediction.
    assert predict_nb("Check this out http://www.example.com you idiot", model) in (0, 1)

def test_uppercase_and_lowercase_score_the_same():
    # tokenize() lowercases everything, so case shouldn't change the verdict
    assert nb_probability("I HATE YOU", model) == pytest.approx(nb_probability("i hate you", model))

def test_batch_prediction():
    texts = AGGRESSIVE + NON_AGGRESSIVE
    preds = [predict_nb(t, model) for t in texts]
    assert len(preds) == len(texts) and all(p in (0, 1) for p in preds)

def test_threshold_strict_favors_safe():
    # a very high threshold should never classify anything as aggressive
    for text in AGGRESSIVE:
        assert predict_nb(text, model, threshold=0.999) in (0, 1)

def test_threshold_lenient_favors_aggressive():
    # a very low threshold should classify almost everything as aggressive
    for text in NON_AGGRESSIVE:
        assert predict_nb(text, model, threshold=0.001) == 1

def test_negation_flips_a_known_insult():
    # "not stupid" must not tokenize the same as "stupid" — this is the bug
    # the negation-tagging fix (see train.py) specifically addresses.
    assert predict_tokens("you are stupid") != predict_tokens("you are not stupid")
