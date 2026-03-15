"""
test_naive_bayes.py - Unit tests for Naive Bayes classifier
Run with: python -m pytest tests/test_naive_bayes.py -v
"""
import os, sys, re, joblib, numpy as np, pytest

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'nb_model.pkl')
sys.path.insert(0, BASE_DIR)

import nltk
nltk.download('stopwords', quiet=True)
from nltk.corpus import stopwords
stop_words = set(stopwords.words('english'))

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    return ' '.join([t for t in text.split() if t not in stop_words])

model, vectorizer = joblib.load(MODEL_PATH)

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

def test_model_file_exists():
    assert os.path.exists(MODEL_PATH)

def test_model_loads_successfully():
    assert model is not None and vectorizer is not None

def test_model_has_two_classes():
    assert len(model.classes_) == 2
    assert 0 in model.classes_ and 1 in model.classes_

def test_vectorizer_has_vocabulary():
    assert len(vectorizer.vocabulary_) > 0

def test_predict_returns_binary_label():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        pred = model.predict(vectorizer.transform([clean_text(text)]))[0]
        assert pred in [0, 1]

def test_predict_proba_sums_to_one():
    for text in AGGRESSIVE[:3]:
        proba = model.predict_proba(vectorizer.transform([clean_text(text)]))[0]
        assert abs(sum(proba) - 1.0) < 1e-6

def test_aggressive_samples_have_higher_prob():
    probs = [model.predict_proba(vectorizer.transform([clean_text(t)]))[0][1] for t in AGGRESSIVE]
    assert np.mean(probs) > 0.4

def test_non_aggressive_samples_have_lower_prob():
    probs = [model.predict_proba(vectorizer.transform([clean_text(t)]))[0][1] for t in NON_AGGRESSIVE]
    assert np.mean(probs) < 0.6

def test_empty_string():
    pred = model.predict(vectorizer.transform([clean_text("")]))[0]
    assert pred in [0, 1]

def test_very_long_text():
    pred = model.predict(vectorizer.transform([clean_text("you are stupid " * 200)]))[0]
    assert pred in [0, 1]

def test_url_stripped():
    cleaned = clean_text("Check this out http://www.example.com you idiot")
    assert "http" not in cleaned
    assert model.predict(vectorizer.transform([cleaned]))[0] in [0, 1]

def test_uppercase_lowercased():
    cleaned = clean_text("I HATE YOU SO MUCH")
    assert cleaned == cleaned.lower()

def test_batch_prediction():
    texts = [clean_text(t) for t in AGGRESSIVE + NON_AGGRESSIVE]
    preds = model.predict(vectorizer.transform(texts))
    assert len(preds) == len(texts) and all(p in [0, 1] for p in preds)

def test_batch_proba_shape():
    texts = [clean_text(t) for t in AGGRESSIVE]
    proba = model.predict_proba(vectorizer.transform(texts))
    assert proba.shape == (len(texts), 2)