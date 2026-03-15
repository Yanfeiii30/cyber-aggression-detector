from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

analyzer = SentimentIntensityAnalyzer()

def get_vader_score(text):
    """
    Returns VADER sentiment scores for a given text.
    compound ranges from -1.0 (most negative) to +1.0 (most positive)
    """
    scores = analyzer.polarity_scores(text)
    return {
        "compound": round(scores['compound'], 4),
        "positive": round(scores['pos'], 4),
        "negative": round(scores['neg'], 4),
        "neutral" : round(scores['neu'], 4)
    }

def is_aggressive_vader(text, threshold=-0.3):
    """
    Returns True if text is aggressive based on VADER compound score.
    Threshold -0.3 means: if compound <= -0.3 → aggressive
    """
    score = get_vader_score(text)
    return score['compound'] <= threshold, score

if __name__ == "__main__":
    # Quick test
    tests = [
        "You are so stupid and ugly!",
        "Have a wonderful day!",
        "I HATE YOU SO MUCH!!!",
        "This is a nice comment",
    ]
    print("\n=== VADER TEST ===")
    for t in tests:
        aggressive, scores = is_aggressive_vader(t)
        label = "🔴 AGGRESSIVE" if aggressive else "🟢 SAFE"
        print(f"{label} | compound: {scores['compound']} | {t[:40]}")