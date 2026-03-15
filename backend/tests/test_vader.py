"""
test_vader.py - Unit tests for VADER sentiment analysis
Run with: python -m pytest tests/test_vader.py -v
"""
import os, sys, pytest
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
from vader_helper import get_vader_score, is_aggressive_vader

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

def test_returns_dict_with_required_keys():
    result = get_vader_score("Hello there!")
    for key in ['compound', 'positive', 'negative', 'neutral']:
        assert key in result

def test_compound_range():
    for text in AGGRESSIVE + NON_AGGRESSIVE:
        score = get_vader_score(text)
        assert -1.0 <= score['compound'] <= 1.0

def test_scores_are_rounded():
    score = get_vader_score("You are terrible!")
    for key in ['compound', 'positive', 'negative', 'neutral']:
        assert score[key] == round(score[key], 4)

def test_aggressive_texts_have_negative_compound():
    count = sum(1 for t in AGGRESSIVE if get_vader_score(t)['compound'] < 0)
    assert count >= 3

def test_positive_texts_have_positive_compound():
    count = sum(1 for t in NON_AGGRESSIVE if get_vader_score(t)['compound'] > 0)
    assert count >= 3

def test_is_aggressive_returns_tuple():
    result = is_aggressive_vader("You are stupid!")
    assert isinstance(result, tuple) and len(result) == 2
    assert isinstance(result[0], bool) and isinstance(result[1], dict)

def test_clearly_aggressive_text():
    is_agg, score = is_aggressive_vader("I HATE YOU SO MUCH YOU STUPID IDIOT!!!")
    assert is_agg == True

def test_clearly_positive_text():
    is_agg, score = is_aggressive_vader("You are wonderful and amazing, I love you!")
    assert is_agg == False

def test_custom_threshold_lenient():
    is_agg, _ = is_aggressive_vader("This is bad.", threshold=-1.0)
    assert is_agg == False

def test_custom_threshold_strict():
    is_agg, _ = is_aggressive_vader("This is bad.", threshold=0.5)
    assert is_agg == True

def test_empty_string():
    score = get_vader_score("")
    assert isinstance(score, dict) and 'compound' in score

def test_caps_increases_negativity():
    lower = get_vader_score("i hate you")['compound']
    upper = get_vader_score("I HATE YOU")['compound']
    assert upper <= lower

def test_exclamation_amplifies_score():
    plain = get_vader_score("I hate you")['compound']
    excl  = get_vader_score("I hate you!!!")['compound']
    assert excl <= plain

def test_very_long_text():
    score = get_vader_score("you are a terrible person " * 100)
    assert -1.0 <= score['compound'] <= 1.0

def test_special_characters():
    score = get_vader_score("!!! @@@ ###")
    assert isinstance(score, dict)