/**
 * content.js
 * Real-time Cyber-Aggression Detection — Chrome Extension
 * Thesis: Pamantasan ng Cabuyao BSCS 2026
 *
 * Works on ALL websites — not limited to specific platforms.
 * Detection: Fully client-side — no external server required.
 * Hybrid: R_score = 0.6 * NB + 0.4 * VADER, threshold >= 0.5
 */

const THRESHOLD = 0.50; // NB-only / VADER-only decision threshold
const HYBRID_THRESHOLD = 0.50; // same cutoff as NB-only/VADER-only
const MIN_LEN   = 10; // minimum 10 chars — catches short aggressive comments too
const ATTR      = "data-cad";

// Caps comments at 128 tokens before analysis to bound inference latency —
// mirrors train.py's truncate_tokens().
const MAX_TOKENS = 128;
function truncateTokens(text, maxTokens = MAX_TOKENS) {
  const words = text.split(/\s+/);
  if (words.length <= maxTokens) return text;
  return words.slice(0, maxTokens).join(" ");
}

// Hybrid formula weights — R_score = HYBRID_NB_WEIGHT*NB + HYBRID_VADER_WEIGHT*VADER.
// Also mirrored in popup.js's injected Test-tab function — update both if changed.
const HYBRID_NB_WEIGHT    = 0.6;
const HYBRID_VADER_WEIGHT = 0.4;

// ── English-language filter — mirrors vader_helper.py's looks_english() ──
// Suppresses ANY detection on non-English text, at any score — the thesis
// scope is explicitly English-only, so even a confident-looking detection
// on Tagalog/Taglish text (a real Taglish insult did score 95%+ in testing)
// is still out of scope and must not be flagged. There used to be a
// "borderline-only" ceiling here (only suppress scores below some cutoff,
// let high-confidence ones through regardless of language) — removed
// entirely per explicit instruction to keep this strictly English-only.
const COMMON_ENGLISH_WORDS = new Set([
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
]);

// A ratio-of-English-words check alone can be fooled by Taglish text that
// happens to contain a few short English prepositions ("in", "at", "with")
// — exactly the NESTEA ad case above, which cleared the English ratio on
// those three words alone despite being mostly Tagalog. This gives the
// filter explicit positive evidence of Tagalog too, not just an absence of
// English, so mixed-language content gets caught either way.
const COMMON_TAGALOG_WORDS = new Set([
  "ang","ng","mga","na","ay","ako","ikaw","siya","kami","tayo","kayo","sila",
  "mo","ko","niya","natin","namin","nila","akin","iyo","kanya",
  "hindi","oo","opo","po","ito","iyan","iyon","yun","yung","dito","diyan","doon",
  "din","rin","lang","pa","muna","kasi","kung","pero","para","dahil",
  "may","meron","mayroon","wala","gusto","ayaw","salamat","paalam","kumusta",
  "maganda","mahal","araw","gabi","umaga","hapon","ngayon","bukas","kahapon",
  "talaga","naman","sobrang","grabe","pagod","saya","masaya","sarap","masarap",
  "tara","paano","bakit","sino","ano","kailan","saan","alin","sana","siguro","baka","lahat","yata",
]);

function looksEnglish(text, minRatio = 0.15) {
  const words = (text.toLowerCase().match(/[a-z']+/g) || []);
  if (words.length < 3) return true; // too short to judge reliably
  const tagalogHits = words.filter(w => COMMON_TAGALOG_WORDS.has(w)).length;
  if ((tagalogHits / words.length) >= minRatio) return false;
  const hits = words.filter(w => COMMON_ENGLISH_WORDS.has(w)).length;
  return (hits / words.length) >= minRatio;
}

// ── Self-directed distress — mirrors vader_helper.py's is_self_directed_distress() ──
// Dampens (doesn't zero) the hybrid score for pure first-person venting,
// with no "you" address, third-party reference, or insult/profanity vocabulary.
const SECOND_PERSON_WORDS = new Set(["you","youre","your","yours","yourself","u","ur"]);
const THIRD_PARTY_MARKERS = new Set([
  "he","hes","she","shes","they","theyre","them",
  "admin","admins","people","wikipedia","wikipedians",
  "everyone","everybody","somebody",
]);
const EXTRA_PROFANITY = new Set([
  "cunt","bitch","dick","dickhead","cock","pussy","fag","faggot",
  "phalus","penis","whore","slut","nigga","nigger","pissed","ass","asshole",
]);
const SWEAR_WORDS_FOR_DISTRESS_GATE = new Set([
  "fucking","fuckin","fuck","shit","shitty","damn","goddamn",
  "hella","freaking","frickin","bloody","effing",
]);

// A genuine self-description ("I am/feel/think I'm ___", "I hate myself")
// — requires the first-person word to actually be the subject of a
// self-directed statement. Replaces an earlier "any PERSON_INSULT_WORD
// present → not self-directed" gate, which blocked exactly the comments
// this function exists to catch (e.g. "I feel so worthless" got rejected
// the instant "worthless" appeared, before ever checking who it was about).
const SELF_REFERENCE_PATTERN = /\bi\s*(?:'?m|am|feel|feels|felt|think|thought|hate)\b|\bmyself\b/;

// Common idiom ("the dumbest thing I've ever seen") — "I've" here isn't a
// confession about the speaker, it's a throwaway superlative aimed at
// whatever noun precedes it. Excluded so it can't get treated as a
// self-reference and wrongly dampen a real insult about something else.
const SELF_REFERENCE_IDIOM_EXCLUSION = /\bi(?:'?ve| have)\s+(?:ever\s+)?(?:seen|read|heard|watched|played|experienced|had)\b/;

function isSelfDirectedDistress(text) {
  const lower = text.toLowerCase().replace(/'/g, "");
  const words = (lower.match(/[a-z]+/g) || []);
  if (words.length === 0) return false;
  if (words.some(w => SECOND_PERSON_WORDS.has(w))) return false;
  if (words.some(w => THIRD_PARTY_MARKERS.has(w))) return false;
  if (words.some(w => SWEAR_WORDS_FOR_DISTRESS_GATE.has(w))) return false;
  if (words.some(w => EXTRA_PROFANITY.has(w))) return false;
  if (SELF_REFERENCE_IDIOM_EXCLUSION.test(lower)) return false;
  return SELF_REFERENCE_PATTERN.test(lower);
}

const SELF_DISTRESS_DAMPEN = 0.4;

// ── Safety guard — chrome API may be undefined in shadow DOM contexts ─────────
const _chrome = (typeof chrome !== "undefined" && chrome?.storage) ? chrome : null;
function safeStorage() { return _chrome?.storage?.local || null; }
function safeRuntime() { return _chrome?.runtime || null; }

// ── Tab isolation — each tab has its own log key ──────────────────────────────
// This prevents other tabs (Facebook, Messenger) from polluting YouTube log
const TAB_KEY = "tab_" + Math.random().toString(36).substr(2, 9);

// ── Elements to always skip (UI elements, not user content) ───────────────────
const SKIP_SELECTORS = [
  "nav", "header", "footer", "aside",
  "[role='navigation']", "[role='banner']", "[role='menubar']",
  "[role='toolbar']", "[role='complementary']",
  "script", "style", "noscript", "input", "textarea",
  "select", "button", "code", "pre",
  // Custom-widget buttons/menus built as <div role="..."> instead of real
  // <button>/<select> tags — extremely common on React-heavy sites like
  // Facebook/Instagram, which the tag-name checks above miss entirely.
  "[role='button']", "[role='menu']", "[role='menuitem']",
  "[role='option']", "[role='tooltip']",
  // Skip ads and sponsored content
  "[data-ad]", "[aria-label='Sponsored']",
  // Skip UI navigation only — NOT comment content
  "[class*='nav']", "[class*='menu']",
  "[class*='sidebar']", "[class*='toolbar']",
];

// ── Visually-hidden text (screen-reader-only labels) ───────────────────────
// A site can also hide accessibility text ("Open menu for X sponsored
// content") inside an element with no distinguishing tag/role/class at
// all — just CSS that visually hides it. Checking actual computed style
// catches the standard "sr-only" hiding technique regardless of what a
// site names its classes, which the selector-based checks above can't.
function isVisuallyHidden(el) {
  let node = el, depth = 0;
  while (node && node.nodeType === 1 && depth < 6) {
    let style;
    try { style = getComputedStyle(node); } catch(e) { return false; }
    if (style) {
      if (style.display === "none" || style.visibility === "hidden") return true;
      const w = node.offsetWidth, h = node.offsetHeight;
      if (w <= 1 && h <= 1 && style.overflow === "hidden") return true; // classic "clip" sr-only pattern
      if (style.position === "absolute" &&
          (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)")) return true;
    }
    node = node.parentElement;
    depth++;
  }
  return false;
}

// ── Post captions vs. comments — only comments should be scanned, not a
// post's own caption/body text. Two earlier approaches both guessed at
// Facebook's container/action markup and both broke across different
// views (feed, post-permalink modal, profile timeline all differ). This
// uses a signal confirmed directly from real screenshots instead of a
// guess: a post's own timestamp is shown in ABSOLUTE form ("July 2 at
// 8:06 AM", "May 27, 2025"), while a comment's timestamp is shown in
// RELATIVE shorthand ("3w", "2h", "5d"). Finding the nearest timestamp
// that precedes a piece of text (walking backward through the page)
// tells you which kind of text it is, regardless of what container
// happens to wrap it.
//
// Risk, stated plainly: still a heuristic. If neither timestamp pattern
// is found nearby, this defaults to treating the text as a comment
// (scan it) rather than a caption (skip it) — safer to over-scan than to
// silently miss a real aggressive comment, per the same reasoning as the
// UI_LABEL_PHRASES comment below documenting an earlier over-broad filter
// that got reverted for exactly that kind of miss.
const RELATIVE_TIME_RE = /^\d+\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|w|mo|y|yr)$/i;
const ABSOLUTE_TIME_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b|\bat\s+\d{1,2}:\d{2}\s*(am|pm)?\b/i;

function findPrecedingTimestampType(el) {
  let node = el, steps = 0;
  while (node && steps < 60) {
    if (node.previousElementSibling) {
      node = node.previousElementSibling;
    } else if (node.parentElement) {
      node = node.parentElement;
      steps++;
      continue;
    } else {
      break;
    }
    steps++;
    const t = node.textContent.trim();
    if (t.length > 0 && t.length < 40) {
      if (RELATIVE_TIME_RE.test(t)) return "comment";
      if (ABSOLUTE_TIME_RE.test(t)) return "caption";
    }
  }
  return null;
}

function isPostCaptionNotComment(el) {
  return findPrecedingTimestampType(el) === "caption";
}

// ── Short interactive-control labels ("View more comments", "See all
// friends", "Like", "Comment as X") — matched by their own exact, short
// text rather than by walking up the DOM for role="button"/"link". A
// closest()-based structural check was tried and reverted: real comments
// are frequently nested inside a clickable post/comment-row wrapper
// (role="button"/"link" for permalink navigation), so that approach was
// silently skipping genuine aggressive comments along with the UI labels.
// This exact-phrase list is narrower but can't cause that kind of miss.
const UI_LABEL_PHRASES = new Set([
  "like", "reply", "comment", "share", "follow", "unfollow",
  "see all friends", "view more comments", "view previous comments",
  "show replies", "hide replies", "load more comments", "load more",
]);

// Friend/follower counters ("16 mutual friends", "625 friends", "1.2K
// followers") — always follow this shape regardless of which card/site
// they're in, so a text pattern is more reliable here than trying to
// detect "is this inside the Friends card" structurally.
const UI_COUNTER_PATTERNS = [
  /^[\d.,]+[km]?\s+mutual(\s+friends?)?$/i,
  /^[\d.,]+[km]?\s+(friends?|followers?|following|likes?|reactions?|comments?|shares?|views?)$/i,
];

function isUiLabelText(text) {
  const t = text.trim().toLowerCase().replace(/[·•|].*$/, "").trim();
  if (UI_LABEL_PHRASES.has(t)) return true;
  if (/^comment as\b/.test(t)) return true;
  if (UI_COUNTER_PATTERNS.some(re => re.test(t))) return true;
  return false;
}

let _enabled      = true;
let _panelMode    = false; // Expert Mode — enables the inline "why" trace panel on every result
let _observer     = null;
let _queue        = [];
let _running      = false;
let _statTotal     = 0;
let _statAggressive = 0;
let _logEntries   = [];

// ── Check if text is a question ───────────────────────────────────────────────
function isQuestion(text) {
  const t = text.trim().toLowerCase();
  if (t.endsWith("?")) return true;
  const starters = [
    "am i","is it","are you","do you","what is","what are",
    "why is","why are","how do","how is","can i","can you",
    "should i","would you","does it","who is","where is",
    "when is","which is","will you","have you","did you",
  ];
  return starters.some(q => t.startsWith(q));
}

// ── Check if element should be skipped ───────────────────────────────────────
function shouldSkipElement(el) {
  for (const sel of SKIP_SELECTORS) {
    try {
      if (el.closest(sel)) return true;
    } catch(e) {}
  }
  return false;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
(async () => {
  // Load NaiveBayes model first — wait up to 3s for vocab.json to load
  // This prevents "Failed to fetch" errors on Reddit and other CSP-strict sites
  await NaiveBayes.load();
  await AlgorithmSelector.load();
  await CustomFilter.load();
  // Clear this tab's data on load — does not affect other tabs
  _statTotal = 0; _statAggressive = 0; _logEntries = [];
  chrome.storage.local.set({
    log_entries: [], stat_total: 0, stat_aggressive: 0,
    ["log_" + TAB_KEY]: [], ["tot_" + TAB_KEY]: 0, ["agg_" + TAB_KEY]: 0
  });
  const s  = await new Promise(r => chrome.storage.local.get("enabled", r));
  _enabled = s.enabled !== false;
  const pm = await new Promise(r => chrome.storage.local.get("panel_mode", r));
  _panelMode = pm.panel_mode === true;
  if (_enabled) startScanning();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled !== undefined) {
      _enabled = changes.enabled.newValue;
      _enabled ? startScanning() : stopScanning();
    }
    if (changes.panel_mode !== undefined) {
      _panelMode = changes.panel_mode.newValue === true;
      // Re-scan so already-blurred comments pick up (or drop) the info button
      if (_enabled) { fullReset(); startScanning(); }
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
        // Re-scan immediately when keywords change
        fullReset(); startScanning();
      });
    }
    if (changes.whitelist !== undefined) {
      // Re-scan immediately when whitelist changes
      if (_enabled) { fullReset(); startScanning(); }
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
  document.querySelectorAll(".cad-info-btn").forEach(b => b.remove());
  document.querySelectorAll(".cad-trace-panel").forEach(p => p.remove());
  document.querySelectorAll(".cad-overlay").forEach(o => o.remove());
  document.querySelectorAll(".cad-score-badge").forEach(b => b.remove());
  _queue = [];
  _running = false;
  _statTotal = 0; _statAggressive = 0; _logEntries = [];
  chrome.storage.local.set({
    log_entries: [], stat_total: 0, stat_aggressive: 0,
    ["log_" + TAB_KEY]: [], ["tot_" + TAB_KEY]: 0, ["agg_" + TAB_KEY]: 0
  });
  try { chrome.runtime.sendMessage({ type: "CLEAR_BADGE" }); } catch(e) {}
}

// ── START / STOP ──────────────────────────────────────────────────────────────
function startScanning() {
  // Never scan private messaging sites — Data Privacy Act RA 10173
  if (isPrivateSite()) return;

  // Scan at delays to wait for comments to load
  // Only scan at 2 delays — enough for most sites to load
  [2000, 5000].forEach(ms => setTimeout(scanAll, ms));
  if (_observer) return;

  // MutationObserver — debounced, only fires after DOM settles.
  const RESCAN_DEBOUNCE_MS = 400;
  let _scanPending = false;
  _observer = new MutationObserver(() => {
    if (_scanPending) return;
    _scanPending = true;
    clearTimeout(_observer._t);
    _observer._t = setTimeout(() => {
      scanAll();
      _scanPending = false;
    }, RESCAN_DEBOUNCE_MS);
  });
  _observer.observe(document.body, { childList: true, subtree: true });

  // Scroll listener — only scan when user scrolls and stops
  let _scrollTimer = null;
  window.addEventListener("scroll", () => {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(scanAll, RESCAN_DEBOUNCE_MS);
  }, { passive: true });
}

function stopScanning() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  fullReset();
}

// ── SKIP list — entire domains never scanned (Data Privacy Act RA 10173) ─────
// Also excluded in manifest.json's content_scripts.exclude_matches — update both.
const SKIP_SITES = [
  "messenger.com",       // Facebook Messenger — private
  "web.whatsapp.com",    // WhatsApp — private
  "web.telegram.org",    // Telegram web — private
  "telegram.org",        // Telegram — private
  "viber.com",           // Viber — private (popular in PH)
  "slack.com",           // Slack — private workplace messages
  "teams.microsoft.com", // Microsoft Teams — private
  "teams.live.com",      // Microsoft Teams — private
  "claude.ai",           // AI chat — not social media
  "chat.openai.com",     // AI chat
  "gemini.google.com",   // AI chat
  "mail.google.com",     // email — private
  "outlook.com",         // email — private
  "outlook.live.com",    // email — private
  "outlook.office.com",  // email — private
  "outlook.office365.com", // email — private
  "docs.google.com",     // documents — not social media
  "drive.google.com",    // documents — not social media
];

// ── Private message paths — skip DM/inbox paths on mixed public/private sites ─
const SKIP_PATHS = [
  { host: "facebook.com",   path: "/messages"  },
  { host: "instagram.com",  path: "/direct"    },
  { host: "twitter.com",    path: "/messages"  },
  { host: "x.com",          path: "/messages"  },
  { host: "tiktok.com",     path: "/messages"  },
  { host: "linkedin.com",   path: "/messaging" },
  { host: "discord.com",    path: "/channels/@me" }, // Discord DMs only
];

// ── Helper — returns true if current page is a private/excluded site ──────────
function isPrivateSite() {
  const host = window.location.hostname;
  const path = window.location.pathname;
  if (SKIP_SITES.some(s => host.includes(s))) return true;
  if (SKIP_PATHS.some(r => host.includes(r.host) && path.startsWith(r.path))) return true;
  return false;
}

// ── Facebook/Messenger chat-dock detector (Meta platforms only) ──────────────
// Detects the docked chat popup overlay (not caught by SKIP_PATHS, which only
// excludes the dedicated /messages page) by its fixed bottom-right position.
const META_CHAT_HOSTS = ["facebook.com", "instagram.com"];

function isInFacebookChatDock(el) {
  const host = window.location.hostname;
  if (!META_CHAT_HOSTS.some(h => host.includes(h))) return false;
  let node = el;
  let depth = 0;
  while (node && depth < 10) {
    try {
      const label = node.getAttribute && node.getAttribute("aria-label");
      if (label && /messenger|conversation/i.test(label)) return true;
      const style = window.getComputedStyle(node);
      if (style.position === "fixed") {
        const r = node.getBoundingClientRect();
        const nearBottomRight = r.right > window.innerWidth - 460 && r.bottom > window.innerHeight - 700;
        if (nearBottomRight && r.width > 200 && r.height > 200) return true;
      }
    } catch(e) {}
    node = node.parentElement;
    depth++;
  }
  return false;
}

// ── Facebook/Instagram profile "info card" detector (Personal details,
// Friends, Contact info, Photos, etc.) ────────────────────────────────────
// These sidebar cards contain short lines (relationship status, mutual
// friend counts, friend names) that pass the generic length/word-count
// filter just like a real comment would, but they aren't user-generated
// comment/post content — skip them so only the actual feed/comment thread
// gets scanned. Matched primarily on the card's own VISIBLE heading text
// (what's actually rendered on screen), since Meta's aria-label/labelledby
// wiring on these cards turned out not to be reliably present — matching
// hashed CSS classes would be even less stable across A/B tests.
const PROFILE_CARD_TITLES = new Set([
  "intro", "personal details", "friends", "photos", "life events", "about",
  "contact info", "contact and basic info", "basic info",
  "work and education", "places lived", "check-ins",
]);

function isInFacebookProfileCard(el) {
  const host = window.location.hostname;
  if (!META_CHAT_HOSTS.some(h => host.includes(h))) return false;
  const doc = el.ownerDocument || document;
  let node = el;
  let depth = 0;
  while (node && depth < 14) {
    try {
      // Primary signal: this container's own first couple of children is
      // a short heading-like block whose text matches a known card title
      // (e.g. <h2>Friends</h2> as the first child of the Friends card).
      // Scoped to shallow direct children only — a full-subtree search
      // would match ANY heading anywhere below, wrongly skipping everything
      // once walked far enough up the tree.
      const kids = node.children ? Array.from(node.children).slice(0, 3) : [];
      for (const kid of kids) {
        const t = (kid.textContent || "").trim().toLowerCase();
        if (t && t.length < 40 && PROFILE_CARD_TITLES.has(t)) return true;
      }
      // Fallback signal: aria-label/aria-labelledby, in case Meta does
      // wire it on some cards/surfaces even if not the ones tested.
      let label = node.getAttribute && node.getAttribute("aria-label");
      if (!label) {
        const labelledBy = node.getAttribute && node.getAttribute("aria-labelledby");
        if (labelledBy) {
          const labelEl = doc.getElementById(labelledBy.split(/\s+/)[0]);
          if (labelEl) label = labelEl.textContent;
        }
      }
      if (label && PROFILE_CARD_TITLES.has(label.trim().toLowerCase())) return true;
    } catch(e) {}
    node = node.parentElement;
    depth++;
  }
  return false;
}

// ── Shadow DOM — recursively find and scan every OPEN shadow root on the
// page, instead of hardcoding a specific custom element name (previously
// just "shreddit-comment" for Reddit). Sites built with web components
// (Reddit's comment tree among them) render real content inside a shadow
// root that a plain TreeWalker on document.body can't see into at all —
// but which specific element hosts that shadow root changes whenever a
// site updates its frontend, which is exactly what seems to have broken
// this on Reddit. Walking for *any* shadowRoot instead of one named
// element is more work per scan but doesn't depend on guessing a tag name
// that can silently go stale again.
//
// Real limitation, not a bug: a CLOSED-mode shadow root (el.shadowRoot
// intentionally returns null for those) is invisible to any content
// script by browser design — there's no workaround from here if a site
// uses that mode.
function scanShadowRoots(root) {
  let el;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while ((el = walker.nextNode())) {
      if (el.shadowRoot) {
        collectByTreeWalker(el.shadowRoot);
        scanShadowRoots(el.shadowRoot); // shadow roots can nest further shadow roots
      }
    }
  } catch(e) {}
}

// ── SCAN — works on social media and websites with user content ───────────────
function scanAll() {
  if (!_enabled) return;
  if (isPrivateSite()) return; // Data Privacy Act RA 10173

  // Scan main document body
  collectByTreeWalker(document.body);
  scanShadowRoots(document.body);

  processQueue();
}

// ── Detects a byline/name link ("Angel Mae Garcia") vs. real comment text ──
// Short, every-word-Title-Case, and entirely wrapped in one <a> — the
// pattern for a commenter's name linking to their profile, on virtually
// every platform. A genuine comment is essentially never both of those
// things at once, so this stays low-risk for false rejections.
function looksLikeNameLink(text) {
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || words.length > 5) return false;
  return words.every(w => /^[A-Z][a-zA-Z'.-]*$/.test(w));
}

// ── TreeWalker — collects text from ANY website including shadow DOM ──────────
function collectByTreeWalker(root) {
  // Use ownerDocument for shadow roots, fallback to document
  const doc    = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent.trim();

      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // Skip already processed or pending
      if (parent.hasAttribute(ATTR)) return NodeFilter.FILTER_REJECT;
      try { if (parent.closest("[data-cad]")) return NodeFilter.FILTER_REJECT; } catch(e) {}
      // Skip our own injected UI (reveal/info buttons, trace panels) — these
      // are inserted as SIBLINGS of the scanned comment, not descendants, so
      // the [data-cad] check above doesn't reach them. Without this, the
      // panel's own text ("negation flips meaning", trace labels, etc.) gets
      // re-discovered as if it were a new comment and re-scanned forever.
      try { if (parent.closest("[data-cad-ui]")) return NodeFilter.FILTER_REJECT; } catch(e) {}

      // Skip non-content tags
      const tag = parent.tagName?.toLowerCase();
      if (["script","style","noscript","input","textarea",
           "select","button","code","pre","label","option"].includes(tag))
        return NodeFilter.FILTER_REJECT;

      // Skip comment-author name links — "Angel Mae Garcia" as a byline is
      // a profile link, not comment content. A real comment is essentially
      // never wrapped entirely in a single <a> with every word Title-Case.
      // Checked against the nearest ANCESTOR anchor's full text, not just
      // this text node — sites often split a name across inner spans
      // (e.g. <a><span>Kin</span> <span>Edrian Prudente</span></a>), so
      // requiring the direct parent to literally be <a> missed those.
      try {
        const nameAnchor = parent.closest("a");
        if (nameAnchor && looksLikeNameLink(nameAnchor.textContent.trim())) return NodeFilter.FILTER_REJECT;
      } catch(e) {}

      // Skip short interactive-control labels ("Like", "View more comments")
      if (isUiLabelText(text)) return NodeFilter.FILTER_REJECT;

      // Skip UI/navigation elements
      if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;

      // Skip screen-reader-only accessibility text ("Open menu for X
      // sponsored content") that has no distinguishing tag/role/class.
      try { if (isVisuallyHidden(parent)) return NodeFilter.FILTER_REJECT; } catch(e) {}

      // Skip a post's own caption text — only comments should be scanned
      // (real comments replying to the post still get scanned — see
      // isPostCaptionNotComment).
      try { if (isPostCaptionNotComment(parent)) return NodeFilter.FILTER_REJECT; } catch(e) {}

      // Always accept if it matches a custom blocklist keyword — bypass length/word filters
      if (CustomFilter.matches(text)) return NodeFilter.FILTER_ACCEPT;

      // Must be long enough to be meaningful
      if (text.length < MIN_LEN) return NodeFilter.FILTER_REJECT;

      // Must have at least 3 words — filters out titles and labels
      if (text.split(/\s+/).length < 3) return NodeFilter.FILTER_REJECT;

      // Skip pure numbers/symbols
      if (/^[\d\s\.,KkMm%\+\-\*\/\(\)]+$/.test(text))
        return NodeFilter.FILTER_REJECT;

      // Skip URLs
      if (/^(https?:\/\/|www\.|r\/|u\/)/.test(text.trim()))
        return NodeFilter.FILTER_REJECT;

      // Skip very short words (likely UI labels)
      if (text.trim().split(/\s+/).every(w => w.length <= 2))
        return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.hasAttribute(ATTR)) continue;
    queueEl(parent);
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────────
function queueEl(el) {
  if (!el) return;
  // Skip if already processed or pending
  if (el.hasAttribute(ATTR)) return;
  // Skip if parent already processed
  if (el.closest && el.closest("[data-cad]")) return;
  // Never scan our own injected UI (reveal/info buttons, trace panels) —
  // see the matching check in collectByTreeWalker for why this is needed.
  if (el.closest && el.closest("[data-cad-ui]")) return;
  // Never scan the Messenger chat-dock popup — Data Privacy Act RA 10173
  if (isInFacebookChatDock(el)) return;
  // Never scan profile info cards (Intro, Friends, Contact info, etc.) —
  // relationship status, friend names, and mutual-friend counts aren't
  // comments, and shouldn't be scored or annotated like one.
  if (isInFacebookProfileCard(el)) return;
  // Never scan a comment-author byline link ("Angel Mae Garcia") — see
  // looksLikeNameLink() for why this pattern reliably means "name", not
  // comment content. Checked against the nearest ancestor anchor's full
  // text, same reasoning as the matching check in collectByTreeWalker.
  try {
    const nameAnchor = el.closest && el.closest("a");
    if (nameAnchor && looksLikeNameLink(nameAnchor.textContent.trim())) return;
  } catch(e) {}

  const text = (el.innerText || el.textContent || "").trim();
  // Never scan short interactive-control labels ("Like", "View more comments")
  if (isUiLabelText(text)) return;
  const isKeywordMatch = CustomFilter.matches(text);
  if (text.length < MIN_LEN && !isKeywordMatch) return;
  if (text.split(/\s+/).length < 2 && !isKeywordMatch) return;

  // Mark immediately as pending so it never gets queued twice
  el.setAttribute(ATTR, "pending");
  _queue.push({ el, text });
}

// ── Process Queue ─────────────────────────────────────────────────────────────
async function processQueue() {
  if (_running) return;
  _running = true;
  while (_queue.length > 0) {
    const batch = _queue.splice(0, 5);
    await Promise.all(batch.map(({ el, text }) => analyseEl(el, text)));
  }
  _running = false;
}

// ── ANALYSE ───────────────────────────────────────────────────────────────────
async function analyseEl(el, text) {
  if (!_enabled) return;

  // Always use chrome.storage directly — safeStorage was causing null returns
  // chrome is always available in content scripts injected by manifest
  try {

    // ── Step 1: Whitelist ───────────────────────────────────────────────────
    const wlRes     = await new Promise(r => chrome.storage.local.get("whitelist", r));
    const whitelist = wlRes.whitelist || [];
    if (whitelist.length > 0) {
      const lower = text.toLowerCase();
      if (whitelist.some(w => w && lower.includes(w.toLowerCase()))) {
        el.setAttribute(ATTR, "safe");
        return;
      }
    }

    // ── Step 2: Custom keyword blocklist — always wins, even over questions ────
    if (CustomFilter.matches(text)) {
      el.setAttribute(ATTR, "aggressive");
      ResultDisplay.blur(el, 1.0, "custom_keyword");
      saveResult(text, 1.0, true, "custom_keyword", 0);
      try { chrome.runtime.sendMessage({ type: "AGGRESSIVE_FOUND" }); } catch(e){}
      return;
    }

    // ── Step 3: Question check — only applies to algorithm scoring ──────────
    if (isQuestion(text)) {
      el.setAttribute(ATTR, "safe");
      return;
    }

    // ── Step 4: Algorithm scoring ────────────────────────────────────────────
    const t0          = Date.now();
    const mode        = AlgorithmSelector.get();
    const analyzedText = truncateTokens(text);
    const nbTrace   = NaiveBayes.scoreWithTrace(analyzedText);
    const nb        = nbTrace.ok ? nbTrace.prob : NaiveBayes.score(analyzedText);
    const vader     = VADER.analyze(analyzedText).aggression_score;
    const threshold = (mode === "nb" || mode === "vader") ? THRESHOLD : HYBRID_THRESHOLD;

    let score = 0;
    if      (mode === "nb")    score = nb;
    else if (mode === "vader") score = vader;
    else if (nbTrace.ok && nbTrace.matched.length === 0) {
      // NB never saw ANY of these tokens in training (e.g. a negated word
      // like "not_beautiful" that has no vocab entry) — nb is then just the
      // bare class prior, not real evidence, so it shouldn't dilute a
      // confident VADER read. Fall back to VADER alone for this comment.
      score = vader;
    } else {
      // Hybrid: matches the manuscript formula and train.py's evaluation exactly.
      score = (HYBRID_NB_WEIGHT * nb) + (HYBRID_VADER_WEIGHT * vader);
    }

    // Non-English text is suppressed entirely, at any score, not just a
    // "borderline" band — the thesis scope is explicitly English-only, so
    // even a confident-looking detection on Tagalog/Taglish text (which
    // did happen — a real Taglish insult scored 95%+) is out of scope and
    // must not be flagged, not just noisy borderline ones.
    if (mode !== "nb" && mode !== "vader" &&
        score >= threshold && !looksEnglish(analyzedText)) {
      score = 0;
    }

    if (mode !== "nb" && mode !== "vader" &&
        score >= threshold && isSelfDirectedDistress(analyzedText)) {
      score *= SELF_DISTRESS_DAMPEN;
    }

    const isAgg = score >= threshold;
    const ms    = Date.now() - t0;

    // Expert Mode — computes the NB/VADER trace for the inline "why" panel,
    // for BOTH verdicts (aggressive and safe), not just blurred comments.
    // Skipped entirely when panel mode is off.
    const trace = _panelMode ? {
      nbTrace:    NaiveBayes.scoreWithTrace(analyzedText),
      vaderTrace: VADER.analyzeWithTrace(analyzedText),
    } : null;

    if (isAgg) {
      el.setAttribute(ATTR, "aggressive");
      ResultDisplay.blur(el, score, mode, trace);
      try { chrome.runtime.sendMessage({ type: "AGGRESSIVE_FOUND" }); } catch(e){}
    } else {
      el.setAttribute(ATTR, "safe");
      if (trace) ResultDisplay.annotate(el, score, mode, trace);
    }

    saveResult(text, score, isAgg, mode, ms);

  } catch(err) {
    // Silent fail — never crash the page
    el.setAttribute(ATTR, "safe");
  }
}

// ── Save Result to storage ────────────────────────────────────────────────────
// Uses TAB_KEY so each tab has its own isolated log
// This prevents Facebook/Messenger tabs from polluting YouTube log
function saveResult(text, score, isAgg, mode, ms) {
  try {
    // Increment in-memory counters synchronously — no async read needed,
    // which was causing a race condition when multiple items were saved at once
    _statTotal++;
    if (isAgg) _statAggressive++;
    _logEntries.push({
      text:          text.substring(0, 100),
      score:         parseFloat(score.toFixed(3)),
      is_aggressive: isAgg,
      mode:          mode,
      time:          new Date().toLocaleTimeString(),
      ms:            ms,
    });
    if (_logEntries.length > 200) _logEntries.shift();

    const update = {
      log_entries:    _logEntries,
      stat_total:     _statTotal,
      stat_aggressive: _statAggressive,
      ["log_" + TAB_KEY]: _logEntries,
      ["tot_" + TAB_KEY]: _statTotal,
      ["agg_" + TAB_KEY]: _statAggressive,
    };
    chrome.storage.local.set(update);
  } catch(e) {}
}

// ── Tab switch — push this tab's data to shared storage so popup refreshes ────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TAB_ACTIVATED") {
    chrome.storage.local.set({
      log_entries:    _logEntries,
      stat_total:     _statTotal,
      stat_aggressive: _statAggressive,
    });
    if (_statAggressive > 0) {
      try { chrome.runtime.sendMessage({ type: "AGGRESSIVE_FOUND" }); } catch(e) {}
    }
  }
});