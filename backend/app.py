from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import os
import re
import nltk
import numpy as np
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

nltk.download('stopwords', quiet=True)
from nltk.corpus import stopwords

app        = Flask(__name__)
CORS(app)
analyzer   = SentimentIntensityAnalyzer()
stop_words = set(stopwords.words('english'))

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'nb_model.pkl')
model, vectorizer = joblib.load(MODEL_PATH)

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    tokens = [t for t in text.split() if t not in stop_words]
    return ' '.join(tokens)

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    text = data.get('text', '')
    mode = data.get('mode', 'hybrid')

    clean  = clean_text(text)
    vec    = vectorizer.transform([clean])
    nb_prob = float(model.predict_proba(vec)[0][1])

    vader_scores  = analyzer.polarity_scores(text)
    vader_compound = vader_scores['compound']
    vader_norm    = abs(vader_compound) if vader_compound < 0 else 0

    # ─── MODE SELECTION ───────────────────────────────
    if mode == 'nb':
        score      = nb_prob
        is_aggressive = score >= 0.5
    elif mode == 'vader':
        score      = vader_norm
        is_aggressive = vader_compound <= -0.3
    else:
        score      = (0.6 * nb_prob) + (0.4 * vader_norm)
        is_aggressive = score >= 0.5

    return jsonify({
        "text"        : text,
        "mode"        : mode,
        "nb_prob"     : round(nb_prob, 4),
        "vader_compound": round(vader_compound, 4),
        "hybrid_score": round(score, 4),
        "is_aggressive": bool(is_aggressive),
        "label"       : "AGGRESSIVE" if is_aggressive else "NON-AGGRESSIVE"
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "running"})

if __name__ == '__main__':
    print("🚀 Backend server running at http://localhost:5000")
    app.run(debug=True, port=5000)