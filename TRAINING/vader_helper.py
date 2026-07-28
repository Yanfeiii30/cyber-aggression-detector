"""
vader_helper.py
---------------
Wraps vaderSentiment's SentimentIntensityAnalyzer with the interface
expected by tests and train.py.
"""

import re
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_analyzer = SentimentIntensityAnalyzer()

# Splits sentences on contrastive conjunctions so a trailing compliment
# can't cancel out a leading insult (e.g. "you are worthless but beautiful").
_CONTRAST_SPLIT       = re.compile(r"\b(?:but|however|although|though)\b", re.IGNORECASE)
_DIRECT_INSULT_SUBJECT = re.compile(r"\byou\s*(?:'re|re|are)\b", re.IGNORECASE)
INSULT_WORDS = {
    "worthless", "stupid", "idiot", "idiotic", "ugly", "pathetic", "useless",
    "dumb", "trash", "garbage", "disgusting", "loser", "moron", "incompetent",
    "pointless", "hopeless", "hideous", "repulsive", "horrible", "terrible",
    "awful", "failure", "nothing", "waste", "embarrassment", "disgrace",
}


def has_direct_insult(clause: str) -> bool:
    """True if the clause explicitly says "you are/you're <insult word>"."""
    if not _DIRECT_INSULT_SUBJECT.search(clause):
        return False
    words = re.findall(r"[a-z]+", clause.lower())
    return any(w in INSULT_WORDS for w in words)


# ── English-language filter ──────────────────────────────────────────────
# Checks for a minimum density of common English function words, since
# both algorithms are built for English text only.
COMMON_ENGLISH_WORDS = {
    "the","be","to","of","and","a","in","that","have","i","it","for","not","on","with",
    "he","as","you","do","at","this","but","his","by","from","they","we","say","her",
    "she","or","an","will","my","one","all","would","there","their","what","so","up",
    "out","if","about","who","get","which","go","me","when","make","can","like","time",
    "no","just","him","know","take","people","into","year","your","good","some","could",
    "them","see","other","than","then","now","look","only","come","its","over","think",
    "also","back","after","use","two","how","our","work","first","well","way","even",
    "new","want","because","any","these","give","day","most","us","is","are","was","were",
    "been","being","did","does","doing","had","has","having","am","yes","really","much",
    "very","too","here","how's","thank","thanks","please","sorry",
}


def looks_english(text: str, min_ratio: float = 0.15) -> bool:
    """Rough language filter — true if text has enough common English words
    to be worth scoring. Text shorter than 3 words is always allowed through."""
    words = re.findall(r"[a-z']+", text.lower())
    if len(words) < 3:
        return True
    hits = sum(1 for w in words if w in COMMON_ENGLISH_WORDS)
    return (hits / len(words)) >= min_ratio


# ── Swear word used as an intensifier ────────────────────────────────────
# Excludes a swear word from Naive Bayes' features when it's immediately
# followed by a word VADER's lexicon scores positive (e.g. "fucking beautiful").
SWEAR_WORDS = {
    "fucking", "fuckin", "fuck", "shit", "shitty", "damn", "goddamn",
    "hella", "freaking", "frickin", "bloody", "effing",
}


def intensifier_swear_word(text: str):
    """Return the swear word if it's immediately followed by a word VADER's
    lexicon independently scores positive (e.g. "fucking" in "fucking
    beautiful") — used as an intensifier, not directed as an insult.
    Returns None if no such pattern is found."""
    raw = re.findall(r"[a-z]+", text.lower())
    for i in range(len(raw) - 1):
        if raw[i] in SWEAR_WORDS:
            nxt = raw[i + 1]
            if nxt in _analyzer.lexicon and _analyzer.lexicon[nxt] > 0:
                return raw[i]
    return None

# ── Sarcasm cues ────────────────────────────────────────────────────────────
# Catches known sarcastic phrase patterns so VADER's compound score can be
# corrected before use.
SARCASM_MARKERS = {
    "yeah right", "sure sure", "oh sure", "oh great", "oh wonderful",
    "oh awesome", "oh nice", "oh fantastic", "totally sure",
    "wow really", "real smart", "so smart", "nice job",
    "wow so", "just great", "just perfect", "just wonderful",
    "cool story", "whatever you say", "big surprise", "shocking really",
    "who would have thought", "who would've thought", "love that for you",
    "real genius", "such a genius", "what a genius",
}

def detect_sarcasm_cues(text: str) -> float:
    """Returns a sarcasm-cue strength in [0, 1] from known sarcastic
    phrase markers."""
    lower = text.lower()
    cue = 0.0

    for marker in SARCASM_MARKERS:
        if marker in lower:
            cue += 0.5

    return min(cue, 1.0)


def get_vader_score(text: str) -> dict:
    """Return VADER scores rounded to 4 decimal places."""
    scores = _analyzer.polarity_scores(text)
    return {
        "compound": round(scores["compound"], 4),
        "positive": round(scores["pos"],      4),
        "negative": round(scores["neg"],      4),
        "neutral":  round(scores["neu"],      4),
    }


def worst_clause_compound(text: str) -> float:
    """VADER compound of the whole text, unless one clause directly insults
    "you" — then that clause's own compound is used instead."""
    whole = get_vader_score(text)["compound"]
    clauses = [c.strip() for c in _CONTRAST_SPLIT.split(text) if c.strip()]
    if len(clauses) <= 1:
        return whole

    for clause in clauses:
        if has_direct_insult(clause):
            return get_vader_score(clause)["compound"]
    return whole


def get_sarcasm_adjusted_compound(text: str) -> float:
    """VADER compound score corrected for backhanded insults and sarcasm cues."""
    compound = worst_clause_compound(text)
    cue = detect_sarcasm_cues(text)
    if cue > 0 and compound > 0:
        compound = -compound - (0.4 * cue)
    elif cue > 0 and compound <= 0:
        compound = compound - (0.2 * cue)
    return max(-1.0, min(1.0, compound))


# ── Self-directed distress ───────────────────────────────────────────────
# Dampens (not zeroes) the hybrid score for pure first-person venting, with
# no second-person address, third-party reference, or insult/profanity
# vocabulary.
FIRST_PERSON_WORDS = {"i", "im", "ive", "id", "my", "me", "mine", "myself"}
SECOND_PERSON_WORDS = {"you", "youre", "your", "yours", "yourself", "u", "ur"}
THIRD_PARTY_MARKERS = {
    "he", "hes", "she", "shes", "they", "theyre", "them",
    "admin", "admins", "people", "wikipedia", "wikipedians",
    "everyone", "everybody", "somebody",
}
# Situational words (e.g. "awful") are excluded so complaints aren't treated as insults.
_SITUATION_WORDS = {"awful", "terrible", "horrible", "hopeless", "pointless", "nothing", "waste", "failure"}
_PERSON_INSULT_WORDS = INSULT_WORDS - _SITUATION_WORDS
# Broader profanity/slur list, separate from the narrower SWEAR_WORDS set above.
_EXTRA_PROFANITY = {
    "cunt", "bitch", "dick", "dickhead", "cock", "pussy", "fag", "faggot",
    "phalus", "penis", "whore", "slut", "nigga", "nigger", "pissed", "ass", "asshole",
}

def is_self_directed_distress(text: str) -> bool:
    """True if text reads as first-person venting, with no address to "you",
    no reference to a third party, and no insult or profanity vocabulary.
    Requires at least two first-person words."""
    words = re.findall(r"[a-z']+", text.lower().replace("'", ""))
    if not words:
        return False
    if any(w in SECOND_PERSON_WORDS for w in words):
        return False
    if any(w in THIRD_PARTY_MARKERS for w in words):
        return False
    if any(w in _PERSON_INSULT_WORDS for w in words):
        return False
    if any(w in SWEAR_WORDS for w in words):
        return False
    if any(w in _EXTRA_PROFANITY for w in words):
        return False
    return sum(1 for w in words if w in FIRST_PERSON_WORDS) >= 2


def is_aggressive_vader(text: str, threshold: float = -0.05) -> tuple:
    """
    Return (is_aggressive, scores).
    Aggressive when compound < threshold (i.e. sufficiently negative).
    threshold=-1.0  → never aggressive (very lenient)
    threshold= 0.5  → aggressive if compound < 0.5 (very strict)
    """
    scores = get_vader_score(text)
    return scores["compound"] < threshold, scores
