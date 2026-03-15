/**
 * content.js
 * Real-time Cyber-Aggression Detection — Chrome Extension
 * Thesis: Pamantasan ng Cabuyao BSCS 2026
 *
 * Supported platforms:
 * - Reddit (posts + comments)
 * - YouTube (comments)
 * - Twitter/X (tweets)
 * - Facebook (public posts + comments, NOT messenger)
 *
 * Hybrid: R_score = 0.6 * NB + 0.4 * VADER, threshold >= 0.5
 */

const API_URL   = "http://localhost:5000/predict";
const THRESHOLD = 0.5;
const MIN_LEN   = 20;
const ATTR      = "data-cad";

// ── Professional/neutral context words — skip these (avoid false positives) ──
const SAFE_CONTEXT_WORDS = [
  "ticket","tickets","review","improve","improvement","skills",
  "escalate","escalation","meeting","schedule","agenda","report",
  "project","update","deadline","feedback","presentation","discuss",
  "collaborate","team","manager","workflow","process","task",
  "performance","assessment","training","learning","course",
  "tutorial","documentation","feature","bug","issue","deploy",
  "release","sprint","backlog","standup","retrospective",
  "invoice","payment","subscription","account","support",
  "customer","client","service","policy","procedure","guideline",
];

// ── Platform-specific selectors ───────────────────────────────────────────────
const PLATFORM_SELECTORS = {
  // Reddit — new + old layout
  reddit: [
    "shreddit-comment p",
    "div[id^='t1_'] p",
    "div[id^='t3_'] p",
    "[slot='text-body'] p",
    ".RichTextJSON-root p",
    ".usertext-body .md p",
    "h1, h2, h3",
  ],
  // YouTube comments
  youtube: [
    "yt-formatted-string#content-text",
    "#content-text span",
    "ytd-comment-renderer #content-text",
  ],
  // Twitter/X
  twitter: [
    "[data-testid='tweetText']",
    "[data-testid='tweetText'] span",
  ],
  // Facebook public posts/comments (NOT messenger)
  facebook: [
    "[data-ad-preview='message']",
    "div[dir='auto'] > span",
    "[data-testid='post_message'] p",
    "div[role='article'] div[dir='auto']",
    "div[data-pagelet] span[dir='auto']",
    "div[class*='userContent'] p",
    "div[class*='xdj266r']",   // FB post text class
    "div[class*='x1lliihq']",  // FB comment text class
  ],
};

let _enabled  = true;
let _observer = null;
let _queue    = [];
let _running  = false;

// ── Detect current platform ───────────────────────────────────────────────────
function getPlatform() {
  const host = window.location.hostname;
  if (host.includes("reddit.com"))   return "reddit";
  if (host.includes("youtube.com"))  return "youtube";
  if (host.includes("twitter.com") || host.includes("x.com")) return "twitter";
  if (host.includes("facebook.com")) return "facebook";
  return "general";
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
(async () => {
  await AlgorithmSelector.load();
  await CustomFilter.load();

  chrome.storage.local.set({ log_entries: [], stat_total: 0, stat_aggressive: 0 });

  const s  = await new Promise(r => chrome.storage.local.get("enabled", r));
  _enabled = s.enabled !== false;

  if (_enabled) startScanning();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled !== undefined) {
      _enabled = changes.enabled.newValue;
      _enabled ? startScanning() : stopScanning();
    }
    if (changes.mode !== undefined) {
      AlgorithmSelector.load().then(() => {
        if (!_enabled) return;
        fullReset(); startScanning();
      });
    }
    if (changes.custom_keywords !== undefined) {
      CustomFilter.load().then(() => {
        if (!_enabled) return;
        fullReset(); startScanning();
      });
    }
  });
})();

// ── RESET ─────────────────────────────────────────────────────────────────────
function fullReset() {
  document.querySelectorAll(`[${ATTR}]`).forEach(el => {
    el.removeAttribute(ATTR);
    el.classList.remove("cad-blurred", "cad-revealed");
  });
  document.querySelectorAll(".cad-reveal-btn").forEach(b => b.remove());
  _queue   = [];
  _running = false;
  chrome.storage.local.set({ log_entries: [], stat_total: 0, stat_aggressive: 0 });
  chrome.runtime.sendMessage({ type: "CLEAR_BADGE" }).catch(() => {});
}

// ── START / STOP ──────────────────────────────────────────────────────────────
function startScanning() {
  [800, 2000, 4000].forEach(ms => setTimeout(scanAll, ms));

  if (_observer) return;
  _observer = new MutationObserver(() => {
    clearTimeout(_observer._t);
    _observer._t = setTimeout(scanAll, 600);
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

function stopScanning() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  fullReset();
}

// ── SCAN — platform-aware + TreeWalker fallback ───────────────────────────────
function scanAll() {
  if (!_enabled) return;

  const platform = getPlatform();
  const selectors = PLATFORM_SELECTORS[platform];

  if (selectors) {
    // Use platform-specific selectors
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => queueEl(el));
      } catch(e) {}
    });
  }

  // Always also use TreeWalker as fallback to catch anything missed
  collectByTreeWalker(document.body);
  processQueue();
}

// ── TreeWalker fallback ───────────────────────────────────────────────────────
function collectByTreeWalker(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const text = node.textContent.trim();
        if (text.length < MIN_LEN) return NodeFilter.FILTER_REJECT;
        if (text.split(/\s+/).length < 4) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.hasAttribute(ATTR)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`[${ATTR}]`)) return NodeFilter.FILTER_REJECT;

        const tag = parent.tagName?.toLowerCase();
        if (["script","style","noscript","input","textarea",
             "select","button","code","pre"].includes(tag))
          return NodeFilter.FILTER_REJECT;

        if (parent.closest("nav, header, footer, aside, " +
          "[role='navigation'], [role='banner'], " +
          "[class*='TopNav'], [class*='sidebar'], " +
          "[class*='vote'], [class*='Vote'], " +
          "[class*='flair'], [class*='award'], " +
          "[class*='icon'], [class*='avatar']"))
          return NodeFilter.FILTER_REJECT;

        if (/^[\d\s\.,KkMm%]+$/.test(text)) return NodeFilter.FILTER_REJECT;
        if (/^(r\/|u\/|http|www)/.test(text)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.hasAttribute(ATTR)) continue;
    const text = node.textContent.trim();
    if (text.length < MIN_LEN) continue;
    queueEl(parent);
  }
}

// ── Queue an element for analysis ────────────────────────────────────────────
function queueEl(el) {
  if (!el || el.hasAttribute(ATTR)) return;
  const text = (el.innerText || el.textContent || "").trim();
  if (text.length < MIN_LEN) return;
  if (text.split(/\s+/).length < 4) return;
  el.setAttribute(ATTR, "pending");
  _queue.push({ el, text });
}

// ── PROCESS QUEUE in batches ──────────────────────────────────────────────────
async function processQueue() {
  if (_running) return;
  _running = true;
  while (_queue.length > 0) {
    const batch = _queue.splice(0, 5);
    await Promise.all(batch.map(({ el, text }) => analyseEl(el, text)));
  }
  _running = false;
}

// ── Safe context check — avoid false positives ────────────────────────────────
function isSafeContext(text) {
  const lower = text.toLowerCase();
  const matches = SAFE_CONTEXT_WORDS.filter(w => lower.includes(w));
  return matches.length >= 2;
}

// ── ANALYSE ───────────────────────────────────────────────────────────────────
async function analyseEl(el, text) {
  if (!_enabled) return;

  // Whitelist check — skip if text contains whitelisted word
  const wlRes     = await new Promise(r => chrome.storage.local.get("whitelist", r));
  const whitelist = wlRes.whitelist || [];
  if (whitelist.some(w => text.toLowerCase().includes(w.toLowerCase()))) {
    el.setAttribute(ATTR, "safe");
    return;
  }

  // Custom keyword — instant blur + count + log
  if (CustomFilter.matches(text)) {
    el.setAttribute(ATTR, "aggressive");
    ResultDisplay.blur(el, 1.0);
    chrome.runtime.sendMessage({ type: "AGGRESSIVE_FOUND" }).catch(() => {});
    chrome.storage.local.get(["log_entries","stat_total","stat_aggressive"], (res) => {
      const entries = res.log_entries || [];
      entries.push({ text: text.substring(0,100), score: 1.0, is_aggressive: true, mode: AlgorithmSelector.get(), time: new Date().toLocaleTimeString(), ms: 0 });
      if (entries.length > 500) entries.shift();
      chrome.storage.local.set({ log_entries: entries, stat_total: (res.stat_total||0)+1, stat_aggressive: (res.stat_aggressive||0)+1 });
    });
    return;
  }

  // Skip professional context
  if (isSafeContext(text)) {
    el.setAttribute(ATTR, "safe");
    return;
  }

  let score = 0;
  let isAgg = false;
  let ms    = 0;

  // Get user-defined threshold (default 0.5)
  const thRes     = await new Promise(r => chrome.storage.local.get("threshold", r));
  const threshold = thRes.threshold || 0.5;

  // Time the detection for performance monitor
  const t0 = Date.now();
  try {
    const mode   = AlgorithmSelector.get();
    const result = await callAPI(text, mode);
    if (mode === "nb")         score = result.nb_prob ?? 0;
    else if (mode === "vader") score = result.vader_compound <= -0.3 ? Math.abs(result.vader_compound) : 0;
    else                       score = result.hybrid_score ?? 0;
    isAgg = score >= threshold;
  } catch {
    const nb    = NaiveBayes.score(text);
    const vader = VADER.analyze(text).aggression_score;
    score = 0.6 * nb + 0.4 * vader;
    isAgg = score >= threshold;
  }
  ms = Date.now() - t0;

  // Save performance data for popup monitor
  chrome.storage.local.get("perf_ms", (r) => {
    const arr = r.perf_ms || [];
    arr.push(ms);
    if (arr.length > 100) arr.shift();
    chrome.storage.local.set({ perf_ms: arr });
  });

  el.classList.remove("cad-preblur");

  if (isAgg) {
    markAggressive(el, score, text, ms);
  } else {
    el.setAttribute(ATTR, "safe");
  }

  logResult(text, score, isAgg, ms);
}

// ── MARK AGGRESSIVE ───────────────────────────────────────────────────────────
function markAggressive(el, score, text, isKeyword) {
  el.setAttribute(ATTR, "aggressive");
  ResultDisplay.blur(el, score);
  chrome.runtime.sendMessage({ type: "AGGRESSIVE_FOUND" }).catch(() => {});
  saveLastScores(text, isKeyword);
}

// ── API ───────────────────────────────────────────────────────────────────────
async function callAPI(text, mode) {
  const res = await fetch(API_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ text, mode }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── SAVE ALL 3 SCORES + WHY for popup panel ─────────────────────────────────
async function saveLastScores(text, isKeyword) {
  try {
    const [rH, rN, rV] = await Promise.all([
      callAPI(text, "hybrid"),
      callAPI(text, "nb"),
      callAPI(text, "vader"),
    ]);
    const scores = {
      nb:     rN.hybrid_score ?? 0,
      vader:  rV.hybrid_score ?? 0,
      hybrid: rH.hybrid_score ?? 0,
    };
    chrome.storage.local.set({
      last_scores: scores,
      last_why: {
        text:         text.substring(0, 120),
        nb_score:     scores.nb,
        vader_score:  scores.vader,
        hybrid_score: scores.hybrid,
        is_keyword:   !!isKeyword,
        mode:         AlgorithmSelector.get(),
      }
    });
  } catch { /* silent */ }
}

// ── LOG RESULT ────────────────────────────────────────────────────────────────
function logResult(text, score, isAgg, ms = 0) {
  chrome.storage.local.get(
    ["log_entries", "stat_total", "stat_aggressive"],
    (res) => {
      const entries = res.log_entries      || [];
      const total   = (res.stat_total      || 0) + 1;
      const agg     = (res.stat_aggressive || 0) + (isAgg ? 1 : 0);

      entries.push({
        text:          text.substring(0, 100),
        score:         parseFloat(score.toFixed(3)),
        is_aggressive: isAgg,
        mode:          AlgorithmSelector.get(),
        time:          new Date().toLocaleTimeString(),
        ms:            ms,
      });
      if (entries.length > 500) entries.shift();

      chrome.storage.local.set({
        log_entries:     entries,
        stat_total:      total,
        stat_aggressive: agg,
      });
    }
  );
}