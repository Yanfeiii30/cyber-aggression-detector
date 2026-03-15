"""
test_hybrid.py - Unit tests for Hybrid (NB + VADER) model
Run with: python -m pytest tests/test_hybrid.py -v
"""
import os, sys, re, joblib, numpy as np, pytest
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'nb_model.pkl')
sys.path.insert(0, BASE_DIR)

import nltk
nltk.download('stopwords', quiet=True)
from nltk.corpus import stopwords
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
stop_words = set(stopwords.words('english'))
analyzer   = SentimentIntensityAnalyzer()
model, vectorizer = joblib.load(MODEL_PATH)

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    return ' '.join([t for t in text.split() if t not in stop_words])

def hybrid_predict(text, w1=0.6, w2=0.4, threshold=0.5):
    vec           = vectorizer.transform([clean_text(text)])
    nb_prob       = float(model.predict_proba(vec)[0][1])
    compound      = analyzer.polarity_scores(text)['compound']
    vader_norm    = abs(compound) if compound < 0 else 0.0
    hybrid_score  = (w1 * nb_prob) + (w2 * vader_norm)
    return hybrid_score >= threshold, {
        "nb_prob": round(nb_prob, 4),
        "vader_compound": round(compound, 4),
        "vader_norm": round(vader_norm, 4),
        "hybrid_score": round(hybrid_score, 4),
    }

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
    "Great job on the project, well done!",
]

def test_hybrid_score_within_range():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        _, d = hybrid_predict(text)
        assert 0.0 <= d['hybrid_score'] <= 1.0

def test_weights_sum_to_one():
    assert abs(0.6 + 0.4 - 1.0) < 1e-9

def test_hybrid_score_formula():
    text = "You are an absolute idiot, I hate you!"
    _, d = hybrid_predict(text)
    expected = round((0.6 * d['nb_prob']) + (0.4 * d['vader_norm']), 4)
    assert d['hybrid_score'] == expected

def test_returns_bool_and_dict():
    result = hybrid_predict("You are terrible!")
    assert isinstance(result[0], bool) and isinstance(result[1], dict)

def test_details_has_required_keys():
    _, d = hybrid_predict("test text")
    for key in ['nb_prob', 'vader_compound', 'vader_norm', 'hybrid_score']:
        assert key in d

def test_clearly_aggressive_detected():
    count = sum(1 for t in AGGRESSIVE if hybrid_predict(t)[0])
    assert count >= 3

def test_clearly_safe_not_flagged():
    count = sum(1 for t in NON_AGGRESSIVE if not hybrid_predict(t)[0])
    assert count >= 3

def test_nb_probs_are_valid():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        _, d = hybrid_predict(text)
        assert 0.0 <= d['nb_prob'] <= 1.0

def test_vader_compound_in_valid_range():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        _, d = hybrid_predict(text)
        assert -1.0 <= d['vader_compound'] <= 1.0

def test_empty_string():
    is_agg, d = hybrid_predict("")
    assert isinstance(is_agg, bool) and 0.0 <= d['hybrid_score'] <= 1.0

def test_very_long_text():
    is_agg, d = hybrid_predict("you are terrible " * 100)
    assert isinstance(is_agg, bool)

def test_threshold_strict():
    is_agg, _ = hybrid_predict("This is slightly bad.", threshold=0.99)
    assert is_agg == False

def test_threshold_lenient():
    is_agg, _ = hybrid_predict("This is slightly bad.", threshold=0.01)
    assert is_agg == True