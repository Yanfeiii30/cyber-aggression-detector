/**
 * lib/vader.js
 * Lightweight VADER-inspired sentiment scorer for the browser.
 * No server needed — runs entirely client-side.
 *
 * Returns aggression_score [0, 1]:
 *   1.0 = very aggressive / negative
 *   0.0 = very positive / safe
 */

const VADER = (() => {

  // Sentiment lexicon (word → valence score)
  const LEXICON = {
    // Strong negatives / aggressive
    "hate": -3.2, "kill": -3.5, "die": -2.8, "stupid": -2.9,
    "idiot": -3.1, "moron": -3.0, "ugly": -2.5, "worthless": -3.3,
    "loser": -2.7, "disgusting": -2.8, "trash": -2.6, "dumb": -2.4,
    "pathetic": -2.8, "horrible": -2.9, "awful": -2.7, "terrible": -2.6,
    "worst": -3.0, "jerk": -2.4, "freak": -2.3, "scum": -3.1,
    "garbage": -2.5, "filth": -2.6, "bastard": -3.0, "creep": -2.3,
    "shut": -1.5, "die": -3.0, "hell": -2.0, "damn": -1.8,
    "crap": -2.1, "suck": -2.3, "sucks": -2.3, "toxic": -2.5,
    "bully": -2.8, "harass": -3.0, "abuse": -3.0, "threat": -2.9,
    "hurt": -2.5, "destroy": -3.0, "attack": -2.8, "punish": -2.4,
    "suffer": -2.9, "pain": -2.2, "evil": -2.8, "vile": -3.0,
    "rude": -1.8, "mean": -1.6, "cruel": -2.5, "unkind": -1.7,
    "annoying": -1.5, "bad": -0.7, "wrong": -0.8,
    // Positives
    "good": 1.9, "great": 3.1, "love": 3.0, "happy": 2.7,
    "excellent": 3.2, "wonderful": 3.4, "amazing": 3.3,
    "fantastic": 3.6, "best": 3.1, "kind": 2.2, "nice": 1.8,
    "awesome": 3.2, "thanks": 2.0, "help": 1.5, "beautiful": 2.8,
    "brilliant": 3.0, "enjoy": 2.4, "fun": 2.2, "glad": 2.1,
    "pleased": 2.3, "grateful": 2.8, "welcome": 1.9,
  };

  // Booster words (amplify sentiment)
  const BOOSTERS = {
    "very": 0.293, "really": 0.293, "extremely": 0.439,
    "absolutely": 0.439, "incredibly": 0.439, "so": 0.293,
    "totally": 0.293, "completely": 0.439, "utterly": 0.439,
    "super": 0.293, "highly": 0.293,
  };

  // Negation words
  const NEGATE = new Set([
    "not","no","never","neither","barely","hardly","scarcely","without"
  ]);

  const NEGATION_SCALAR = -0.74;
  const C_INCR          = 0.733;  // ALL CAPS boost

  function isAllCaps(token) {
    return token.length > 1 &&
           token === token.toUpperCase() &&
           /[A-Z]/.test(token);
  }

  function tokenize(text) {
    return text.trim().split(/\s+/).map(t => t.replace(/[^a-zA-Z'!?]/g, ""));
  }

  function analyze(text) {
    const tokens   = tokenize(text);
    const hasCaps  = tokens.some(isAllCaps);
    let sentiments = [];

    tokens.forEach((token, i) => {
      const lower = token.toLowerCase();
      if (!(lower in LEXICON)) return;

      let valence = LEXICON[lower];

      // ALL CAPS boost
      if (isAllCaps(token) && hasCaps) {
        valence += valence > 0 ? C_INCR : -C_INCR;
      }

      // Check booster words before this token (up to 3 words back)
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const b = tokens[j].toLowerCase();
        if (b in BOOSTERS) {
          const scalar = BOOSTERS[b] * (i - j === 1 ? 1 : 0.95);
          valence += valence > 0 ? scalar : -scalar;
        }
      }

      // Check negation (1-3 words before)
      for (let n = Math.max(0, i - 3); n < i; n++) {
        if (NEGATE.has(tokens[n].toLowerCase())) {
          valence *= NEGATION_SCALAR;
          break;
        }
      }

      sentiments.push(valence);
    });

    // Punctuation boosts
    const exclamations = (text.match(/!/g) || []).length;
    if (sentiments.length > 0) {
      const sign = sentiments.reduce((s, v) => s + v, 0) >= 0 ? 1 : -1;
      if (exclamations > 0) {
        sentiments.push(sign * Math.min(exclamations, 4) * 0.292);
      }
    }

    // Aggregate into compound score
    const sum      = sentiments.reduce((s, v) => s + v, 0);
    const norm     = Math.sqrt(sum * sum + 15);
    const compound = sentiments.length > 0 ? sum / norm : 0;

    // Map compound [-1,+1] → aggression [0,1]
    // compound = -1 → aggression = 1.0 (very aggressive)
    // compound = +1 → aggression = 0.0 (very safe)
    const aggressionScore = parseFloat(((1 - compound) / 2).toFixed(4));

    return {
      compound:         parseFloat(compound.toFixed(4)),
      aggression_score: aggressionScore,
    };
  }

  return { analyze };
})();