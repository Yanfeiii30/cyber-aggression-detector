/**
 * lib/vader.js
 * Lightweight VADER-inspired sentiment scorer for the browser.
 * No server needed — runs entirely client-side.
 *
 * Returns aggression_score [0, 1] using |Vcomp| as per manuscript formula:
 *   Rscore = w1 * Pnb + w2 * |Vcomp|
 *   1.0 = very aggressive / negative
 *   0.0 = neutral / safe
 *
 * Fixes applied (aligned with manuscript Chapter 3):
 *   1. Slang splitter — handles joined words like "fuckyou", "shutup", "kys"
 *   2. Expanded lexicon — covers common internet slang and aggressive terms
 *   3. Formula corrected — uses Math.abs(compound) per manuscript |Vcomp|
 */

const VADER = (() => {

  // ── Sentiment lexicon (word → valence score) ───────────────────────────────
  const LEXICON = {
    // Strong negatives / aggressive — core
    "hate":         -3.2, "kill":        -3.5, "die":         -1.2,
    "stupid":       -2.9, "idiot":       -3.1, "moron":       -3.0,
    "ugly":         -2.5, "worthless":   -3.3, "loser":       -2.7,
    "disgusting":   -2.8, "trash":       -2.6, "dumb":        -2.4,
    "pathetic":     -2.8, "horrible":    -2.9, "awful":       -2.7,
    "terrible":     -2.6, "worst":       -3.0, "jerk":        -2.4,
    "freak":        -2.3, "scum":        -3.1, "garbage":     -2.5,
    "filth":        -2.6, "bastard":     -3.0, "creep":       -2.3,
    "crap":        -1.5,
    "suck":         -1.8, "sucks":       -1.8, "toxic":       -2.5,
    "bully":        -2.8, "harass":      -3.0, "abuse":       -3.0,
    "threat":       -2.9, "hurt":        -1.5, "destroy":     -1.5,
    "attack":       -1.5, "punish":      -2.4, "suffer":      -1.5,
    "pain":         -1.0, "evil":        -2.8, "vile":        -3.0,
    "rude":         -1.8, "cruel":       -2.5,
    "unkind":       -1.7, "annoying":    -1.5,
    "liar":        -2.5, "fake":        -1.5,
    "coward":       -2.3, "despise":     -3.1, "loathe":      -3.0,
    "filthy":       -2.7, "repulsive":   -2.9, "disgrace":    -2.8,
    "shameful":     -2.6, "useless":     -2.8, "failure":     -2.5,
    "retard":       -3.2, "retarded":    -3.2,
    "dropout":      -2.0, "nobody":      -1.5, "waste":       -2.4,
    "pitiful":      -2.6, "inferior":    -2.4, "subhuman":    -3.4,
    "degenerate":   -3.0, "brainless":   -2.8, "mindless":    -2.3,

    // Internet slang aggressive terms
    "kys":          -3.8, "stfu":        -2.8, "gtfo":        -2.7,
    "wtf":          -2.0, "fuk":         -3.0, "fck":         -3.0,
    "fvck":         -3.0, "fuq":         -3.0, "sht":         -2.2,
    "btch":         -3.0, "bich":        -2.9, "hoe":         -2.5,
    "thot":         -2.6, "dumbass":     -2.9, "jackass":     -2.8,
    "asshole":      -3.1, "scumbag":     -3.0, "dipshit":     -2.9,
    "dimwit":       -2.6, "nitwit":      -2.4, "halfwit":     -2.4,
    "imbecile":     -3.0, "braindead":   -3.1, "numskull":    -2.5,
    "crybaby":      -2.0, "weirdo":      -2.1, "cretin":      -2.9,
    "vermin":       -3.0, "rat":         -2.2, "pig":         -2.4,
    "snake":        -2.3, "parasite":    -2.8, "leech":       -2.5,
    "slut":         -3.2, "whore":       -3.3, "bitch":       -3.1,
    "cunt":         -3.5, "dick":        -2.8, "ass":         -2.0,
    "piss":         -1.8, "shit":        -2.5, "fuck":        -3.0,
    "fucker":       -3.2, "fucking":     -2.8, "motherfucker":-3.5,
    "mofo":         -3.2, "prick":       -2.9, "twat":        -3.0,
    "wanker":       -2.8, "jerkoff":     -2.9, "douchebag":   -2.9,
    "douche":       -2.7, "shutup":      -2.5, "loserface":   -2.8,
    "idiotface":    -2.9, "stupidass":   -2.9, "uglyass":     -2.7,
    "noob":         -1.8, "scrub":       -1.9,

    // Threats and harm
    "murder":       -3.5, "rape":        -3.8, "stab":        -3.4,
    "shoot":        -1.5, "punch":       -1.5, "slap":        -1.5,
    "beat":         -1.0, "bash":        -1.0, "smash":       -1.0,
    "obliterate":   -3.0, "annihilate":  -3.1, "exterminate": -3.2,

    // Dismissive / belittling
    "pointless":    -2.0, "irrelevant":  -1.8, "ignorant":    -2.5,
    "incompetent":  -2.6, "incapable":   -2.4, "hopeless":    -2.5,
    "helpless":     -2.0, "clueless":    -2.3, "delusional":  -2.5,
    "psycho":       -2.6, "crazy":       -0.5, "insane":      -0.5,
    "nutcase":      -2.4, "lunatic":     -2.6,
    "maniac":       -2.5,
    "weak":         -2.5, "unworthy":    -2.5, "mediocre":    -1.8,
    "overrated":    -2.0, "replaceable": -1.8,

    // Positives
    "good":         1.9,  "great":       3.1,  "love":        3.0,
    "happy":        2.7,  "excellent":   3.2,  "wonderful":   3.4,
    "amazing":      3.3,  "fantastic":   3.6,  "best":        3.1,
    "kind":         2.2,  "nice":        1.8,  "awesome":     3.2,
    "thanks":       2.0,  "help":        1.5,  "beautiful":   2.8,
    "brilliant":    3.0,  "enjoy":       2.4,  "fun":         2.2,
    "glad":         2.1,  "pleased":     2.3,  "grateful":    2.8,
    "welcome":      1.9,  "perfect":     3.2,  "superb":      3.3,
    "outstanding":  3.4,  "splendid":    3.2,  "positive":    2.5,
    "peaceful":     2.4,  "calm":        2.0,  "safe":        2.2,
    // Positive words whose NEGATION ("don't deserve", "can't belong") signals aggression
    "deserve":      2.5,  "belong":      2.0,  "worthy":      2.5,
    "capable":      2.0,  "qualified":   2.0,
  };

  // ── Common joined-word slang — split before tokenizing ───────────────────
  // Handles "fuckyou" → "fuck you", "shutup" → "shut up", etc.
  const SLANG_SPLITS = {
    "fuckyou":      "fuck you",
    "fkyou":        "fuck you",
    "fukyou":       "fuck you",
    "shutup":       "shut up",
    "stfup":        "stfu",
    "killurself":   "kill yourself",
    "killyourself": "kill yourself",
    "kys":          "kill yourself",
    "godie":        "go die",
    "hateyou":      "hate you",
    "ihateyou":     "i hate you",
    "dumbass":      "dumb ass",
    "jackass":      "jack ass",
    "asshole":      "ass hole",
    "dipshit":      "dip shit",
    "motherfucker": "mother fucker",
    "mofo":         "mother fucker",
    "scumbag":      "scum bag",
    "braindead":    "brain dead",
    "douchebag":    "douche bag",
    "jerkoff":      "jerk off",
    "idiotface":    "idiot face",
    "stupidass":    "stupid ass",
    "uglyass":      "ugly ass",
    "loserface":    "loser face",
    "noob":         "stupid noob",
  };

  // ── Booster words (amplify sentiment) ─────────────────────────────────────
  const BOOSTERS = {
    "very":       0.293, "really":     0.293, "extremely":  0.439,
    "absolutely": 0.439, "incredibly": 0.439, "so":         0.293,
    "totally":    0.293, "completely": 0.439, "utterly":    0.439,
    "super":      0.293, "highly":     0.293, "deeply":     0.293,
    "seriously":  0.293, "genuinely":  0.293, "truly":      0.293,
  };

  // ── Negation words ─────────────────────────────────────────────────────────
  const NEGATE = new Set([
    "not","no","never","neither","barely","hardly","scarcely","without",
    "don't","dont","can't","cant","won't","wont","wouldn't","wouldnt",
    "shouldn't","shouldnt","isn't","isnt","aren't","arent",
    "doesn't","doesnt","didn't","didnt","haven't","havent",
  ]);

  const NEGATION_SCALAR = -0.74;
  const C_INCR          = 0.733;  // ALL CAPS boost

  // ── Sarcasm cues — mirrors vader_helper.py ───────────────────────────────
  // Catches known sarcastic phrase patterns so VADER's score can be corrected.
  const SARCASM_MARKERS = [
    "yeah right", "sure sure", "oh sure", "oh great", "oh wonderful",
    "oh awesome", "oh nice", "oh fantastic", "totally sure",
    "wow really", "real smart", "so smart", "nice job",
    "wow so", "just great", "just perfect", "just wonderful",
    "cool story", "whatever you say", "big surprise", "shocking really",
    "who would have thought", "who would've thought", "love that for you",
    "real genius", "such a genius", "what a genius",
  ];

  // These markers double as completely sincere standalone praise ("Nice
  // job!" said after someone actually did a nice job) far more often than
  // the others in the list ("yeah right", "real genius" are barely ever
  // sincere on their own). Only trust them as a sarcasm signal when the
  // comment has more to it than just the bare phrase — mockery embedded in
  // a longer comment ("nice job breaking it") still counts.
  const STANDALONE_SINCERE_MARKERS = new Set([
    "nice job", "so smart", "oh great", "oh wonderful", "oh awesome",
    "oh nice", "oh fantastic", "oh sure", "totally sure", "wow really",
  ]);

  // Strips a leading subject+copula ("you're", "that's", "she's"...) so
  // "You are so smart!" reduces to "so smart" just like the bare phrase
  // does — real compliments are almost always phrased with a subject, not
  // said as a bare two-word message.
  const LEADING_SUBJECT = /^(?:you're|you are|that'?s|he'?s|she'?s|i'?m)\s+/;

  function detectSarcasmCues(text) {
    const lower = text.toLowerCase();
    const bare  = lower.replace(/[!?.,\s]+$/g, "").trim().replace(LEADING_SUBJECT, "");
    let cue = 0;
    const matched = [];

    for (const marker of SARCASM_MARKERS) {
      if (!lower.includes(marker)) continue;
      if (STANDALONE_SINCERE_MARKERS.has(marker) && bare === marker) continue;
      cue += 0.5;
      matched.push(marker);
    }

    return { cue: Math.min(cue, 1.0), matched };
  }

  function isAllCaps(token) {
    return token.length > 1 &&
           token === token.toUpperCase() &&
           /[A-Z]/.test(token);
  }

  // ── Preprocess: expand joined slang before tokenizing ─────────────────────
  function preprocess(text) {
    let processed = text;
    for (const [joined, expanded] of Object.entries(SLANG_SPLITS)) {
      // case-insensitive replacement
      processed = processed.replace(new RegExp(`\\b${joined}\\b`, "gi"), expanded);
    }
    return processed;
  }

  // ── Tokenize ───────────────────────────────────────────────────────────────
  function tokenize(text) {
    return text.trim().split(/\s+/)
      .map(t => t.replace(/[^a-zA-Z'!?]/g, ""))
      .filter(Boolean);
  }

  // ── Backhanded insults ──────────────────────────────────────────────────
  // Detects an explicit "you are/you're <insult word>" pattern so a
  // trailing compliment can't cancel out a leading insult.
  const CONTRAST_SPLIT = /\b(?:but|however|although|though)\b/i;
  const DIRECT_INSULT_SUBJECT = /\byou\s*(?:'re|re|are)\b/i;
  const INSULT_WORDS = new Set([
    "worthless", "stupid", "idiot", "idiotic", "ugly", "pathetic", "useless",
    "dumb", "trash", "garbage", "disgusting", "loser", "moron", "incompetent",
    "pointless", "hopeless", "hideous", "repulsive", "horrible", "terrible",
    "awful", "failure", "nothing", "waste", "embarrassment", "disgrace",
  ]);

  function hasDirectInsult(clause) {
    if (!DIRECT_INSULT_SUBJECT.test(clause)) return false;
    const words = (clause.toLowerCase().match(/[a-z]+/g) || []);
    return words.some(w => INSULT_WORDS.has(w));
  }

  // Strips leading/trailing "!"/"?" before dictionary lookups, since
  // tokenize() deliberately keeps them attached for the caps/exclaim checks.
  function stripEdgePunct(token) {
    return token.replace(/^[!?]+|[!?]+$/g, "");
  }

  // ── Compute compound score for a single piece of text (no sarcasm/
  // backhanded-insult correction — analyze() applies those on top).
  // Pass trace=true to also get back which words matched and why. ──────────
  function computeCompound(text, trace) {
    const processed = preprocess(text);
    const tokens     = tokenize(processed);

    const origTokens = tokenize(text);
    const hasCaps     = origTokens.some(isAllCaps);

    let sentiments  = [];
    let matchedWords = [];

    tokens.forEach((token, i) => {
      const lower = stripEdgePunct(token.toLowerCase());
      if (!(lower in LEXICON)) return;

      const baseValence = LEXICON[lower];
      let valence  = baseValence;
      let boosted  = false;
      let negated  = false;
      let capsBoosted = false;

      // ALL CAPS boost
      if (isAllCaps(token) && hasCaps) {
        valence += valence > 0 ? C_INCR : -C_INCR;
        capsBoosted = true;
      }

      // Booster words before this token (up to 3 words back)
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const b = stripEdgePunct(tokens[j].toLowerCase());
        if (b in BOOSTERS) {
          const scalar = BOOSTERS[b] * (i - j === 1 ? 1 : 0.95);
          valence += valence > 0 ? scalar : -scalar;
          boosted = true;
        }
      }

      // Negation (1-3 words before)
      for (let n = Math.max(0, i - 3); n < i; n++) {
        if (NEGATE.has(stripEdgePunct(tokens[n].toLowerCase()))) {
          valence *= NEGATION_SCALAR;
          negated = true;
          break;
        }
      }

      sentiments.push(valence);
      if (trace) {
        matchedWords.push({ word: lower, baseValence, valence, boosted, negated, capsBoosted });
      }
    });

    // Punctuation boost — exclamation marks amplify sentiment
    const exclamations = (text.match(/!/g) || []).length;
    if (sentiments.length > 0 && exclamations > 0) {
      const sign = sentiments.reduce((s, v) => s + v, 0) >= 0 ? 1 : -1;
      sentiments.push(sign * Math.min(exclamations, 4) * 0.292);
    }

    // Aggregate into compound score [-1, +1]
    const sum      = sentiments.reduce((s, v) => s + v, 0);
    // ALPHA=15 is VADER's standard normalization constant, empirically tuned
    // for ~15-word social-media posts carrying several sentiment words. On a
    // short comment (few tokens total) it over-suppresses a lone but strong
    // signal — e.g. a single negated insult like "not beautiful" — so scale
    // it down toward ALPHA_FLOOR for shorter texts instead of always using 15.
    const ALPHA       = 15;
    const ALPHA_FLOOR = 10;
    const alpha    = Math.max(ALPHA_FLOOR, Math.min(ALPHA, tokens.length));
    const norm     = Math.sqrt(sum * sum + alpha);
    const compound = sentiments.length > 0 ? sum / norm : 0;

    return trace ? { compound, matchedWords, exclamations, sum, alpha } : compound;
  }

  // VADER compound of the whole text, unless one clause directly insults
  // "you" — in that case that clause's own compound is used instead.
  function worstClauseCompound(text) {
    const whole = computeCompound(text);
    const clauses = text.split(CONTRAST_SPLIT).map(c => c.trim()).filter(Boolean);
    if (clauses.length <= 1) return whole;

    for (const clause of clauses) {
      if (hasDirectInsult(clause)) return computeCompound(clause);
    }
    return whole;
  }

  // ── Main analyze function ──────────────────────────────────────────────────
  function analyze(text) {
    let compound = worstClauseCompound(text);

    // Sarcasm correction — positive-reading text with sarcasm cues is
    // flipped negative (sarcastic praise is aggression, not sentiment);
    // already-negative text with cues is reinforced slightly.
    const { cue } = detectSarcasmCues(text);
    if (cue > 0 && compound > 0) {
      compound = -compound - (0.4 * cue);
    } else if (cue > 0 && compound <= 0) {
      compound = compound - (0.2 * cue);
    }
    compound = Math.max(-1.0, Math.min(1.0, compound));

    // Only negative sentiment = aggression (max(0, -compound), not abs value).
    const aggressionScore = parseFloat(Math.max(0, -compound).toFixed(4));

    return {
      compound:         parseFloat(compound.toFixed(4)),
      aggression_score: aggressionScore,
    };
  }

  // ── Analyze with a full step-by-step trace ────────────────────────────────
  // Same computation as analyze(), but also reports which lexicon words
  // matched, whether the backhanded-insult clause override fired, and
  // whether a sarcasm marker flipped the score — used by the popup's
  // "how the algorithm works" demo view.
  function analyzeWithTrace(text) {
    const wholeTrace = computeCompound(text, true);
    const clauses = text.split(CONTRAST_SPLIT).map(c => c.trim()).filter(Boolean);

    let baseCompound  = wholeTrace.compound;
    let baseTrace     = wholeTrace;
    let insultOverride = null;

    if (clauses.length > 1) {
      for (const clause of clauses) {
        if (hasDirectInsult(clause)) {
          const clauseTrace = computeCompound(clause, true);
          insultOverride = { clause, compound: parseFloat(clauseTrace.compound.toFixed(4)) };
          baseCompound = clauseTrace.compound;
          baseTrace    = clauseTrace;
          break;
        }
      }
    }

    const { cue, matched: matchedMarkers } = detectSarcasmCues(text);

    let compound = baseCompound;
    let sarcasmApplied = false;
    if (cue > 0 && compound > 0) {
      compound = -compound - (0.4 * cue);
      sarcasmApplied = true;
    } else if (cue > 0 && compound <= 0) {
      compound = compound - (0.2 * cue);
      sarcasmApplied = true;
    }
    compound = Math.max(-1.0, Math.min(1.0, compound));

    const aggressionScore = parseFloat(Math.max(0, -compound).toFixed(4));

    return {
      matchedWords: baseTrace.matchedWords,
      exclamations: baseTrace.exclamations,
      valenceSum: baseTrace.sum,
      alpha: baseTrace.alpha,
      wholeCompound: parseFloat(wholeTrace.compound.toFixed(4)),
      clauses: clauses.length > 1 ? clauses : null,
      insultOverride,
      sarcasmCue: cue,
      matchedMarkers,
      sarcasmApplied,
      compound: parseFloat(compound.toFixed(4)),
      aggression_score: aggressionScore,
    };
  }

  // Exposed for naive_bayes.js's swear-as-intensifier check — true if this
  // lexicon has the word with a positive valence (e.g. "beautiful", "great").
  function isPositiveLexiconWord(word) {
    const lower = word.toLowerCase();
    return lower in LEXICON && LEXICON[lower] > 0;
  }

  // Mirror of isPositiveLexiconWord — true for a negative-valence word (e.g.
  // "ugly", "stupid"). Used to catch the opposite noisy-NB case: a "not_X"
  // token where X is a known-negative word (e.g. "not_ugly") is a negated
  // insult and should read as safe-leaning, but NB's per-word push for it
  // is built from very few training examples (negated phrases are rare) and
  // can noisily lean "aggressive" anyway — same root cause as the positive-
  // word case above, just on the other sign.
  function isNegativeLexiconWord(word) {
    const lower = word.toLowerCase();
    return lower in LEXICON && LEXICON[lower] < 0;
  }

  // Exposes the same standalone-sincere-aware marker matching used inside
  // analyze()/analyzeWithTrace(), so naive_bayes.js's cue_X feature builder
  // can't drift out of sync with VADER's own sarcasm-cue logic again.
  function matchedSarcasmMarkers(text) {
    return detectSarcasmCues(text).matched;
  }

  return {
    analyze, analyzeWithTrace, isPositiveLexiconWord, isNegativeLexiconWord,
    SARCASM_MARKERS, matchedSarcasmMarkers,
  };
})();