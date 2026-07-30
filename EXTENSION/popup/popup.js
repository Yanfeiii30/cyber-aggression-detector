/**
 * popup/popup.js — CAD Shield
 * Cyber-Aggression Detector
 * Thesis: Pamantasan ng Cabuyao BSCS 2026
 */

const ALGO_DESCRIPTIONS = {
  hybrid: "Naive Bayes + VADER combined (recommended)",
  nb:     "Naive Bayes only — pattern-based detection",
  vader:  "VADER only — sentiment-based detection",
};

document.addEventListener("DOMContentLoaded", () => {

  // ── Refs ───────────────────────────────────────────────────────────────────
  const toggleEnabled   = document.getElementById("toggleEnabled");
  const statusBar       = document.getElementById("statusBar");
  const statusText      = document.getElementById("statusText");
  const platformBadge   = document.getElementById("platformBadge");
  const algoDesc        = document.getElementById("algoDesc");
  const algoButtons     = document.querySelectorAll(".algo-btn");
  const liveLog         = document.getElementById("liveLog");
  const logCount        = document.getElementById("logCount");
  const clearLogBtn     = document.getElementById("clearLog");
  const whitelistInput  = document.getElementById("whitelistInput");
  const addWhitelistBtn = document.getElementById("addWhitelistBtn");
  const whitelistList   = document.getElementById("whitelistList");
  const testInput       = document.getElementById("testInput");
  const testBtn         = document.getElementById("testBtn");
  const keywordInput    = document.getElementById("keywordInput");
  const addKeywordBtn   = document.getElementById("addKeywordBtn");
  const keywordList     = document.getElementById("keywordList");
  const statTotal       = document.getElementById("statTotal");
  const statAggressive  = document.getElementById("statAggressive");
  const statSafe        = document.getElementById("statSafe");
  const sop2Results     = document.getElementById("sop2Results");
  const sop2Verdict     = document.getElementById("sop2Verdict");
  const thresholdLabel  = document.getElementById("thresholdLabel");
  const togglePanelMode = document.getElementById("togglePanelMode");
  const helpBtn         = document.getElementById("helpBtn");
  const helpBox         = document.getElementById("helpBox");
  const demoTabs        = document.querySelectorAll(".demo-tab");
  const replayStepsBtn  = document.getElementById("replayStepsBtn");
  const stepsEmpty      = document.getElementById("stepsEmpty");
  const themeToggleBtn  = document.getElementById("themeToggleBtn");

  // ── Theme (Light / Dark / Auto) ─────────────────────────────────────────────
  // Single header icon button that cycles Light → Dark → Auto on click.
  // "Auto" follows the OS/browser color scheme via prefers-color-scheme, and
  // stays live — if the system theme flips while the popup happens to be
  // open, the listener below re-resolves it immediately.
  const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: dark)");
  const THEME_ORDER  = ["light", "dark", "auto"];
  const THEME_LABELS = { light: "Light", dark: "Dark", auto: "Auto" };
  const THEME_ICONS = {
    light: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    dark:  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.7A5.8 5.8 0 0 1 6.3 2.5a5.8 5.8 0 1 0 7.2 7.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    auto:  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="9" rx="1.3" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 14.5h5M8 12v2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  };
  let themePref = "auto";

  function resolveTheme(pref) {
    return pref === "auto" ? (THEME_MEDIA.matches ? "dark" : "light") : pref;
  }
  function applyTheme(pref) {
    document.documentElement.setAttribute("data-theme", resolveTheme(pref));
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = THEME_ICONS[pref];
      themeToggleBtn.title = `Theme: ${THEME_LABELS[pref]} (click to change)`;
    }
  }
  THEME_MEDIA.addEventListener("change", () => {
    if (themePref === "auto") applyTheme("auto");
  });
  applyTheme(themePref); // best-effort immediate paint, corrected once storage resolves below
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      themePref = THEME_ORDER[(THEME_ORDER.indexOf(themePref) + 1) % THEME_ORDER.length];
      applyTheme(themePref);
      chrome.storage.local.set({ theme: themePref });
    });
  }

  // ── Reload tab ─────────────────────────────────────────────────────────────
  function reloadTab(delay = 300) {
    setTimeout(() => chrome.runtime.sendMessage({ type: "RELOAD_TAB" }), delay);
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  function switchToTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
    if (name === "steps") playStepsForLastAnalysis();
  }

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchToTab(tab.dataset.tab));
  });

  // ── Steps tab — replays the last analysis from the Test tab. Jumped to
  // automatically as soon as an analysis finishes (see finishAnalysis).
  let lastAnalysis = null; // { text, nbTrace, vaderTrace, meta }

  function playStepsForLastAnalysis() {
    if (!lastAnalysis) {
      if (stepsEmpty)     stepsEmpty.classList.remove("hidden");
      if (replayStepsBtn) replayStepsBtn.classList.add("hidden");
      return;
    }
    if (stepsEmpty)     stepsEmpty.classList.add("hidden");
    if (replayStepsBtn) replayStepsBtn.classList.remove("hidden");
    renderSteps(lastAnalysis.text, lastAnalysis.nbTrace, lastAnalysis.vaderTrace, lastAnalysis.meta);
  }

  if (replayStepsBtn) replayStepsBtn.addEventListener("click", playStepsForLastAnalysis);

  // ── Load ALL settings ──────────────────────────────────────────────────────
  chrome.storage.local.get(
    ["enabled","mode","custom_keywords","whitelist",
     "log_entries","stat_total","stat_aggressive","panel_mode","theme"],
    (res) => {
      toggleEnabled.checked = res.enabled !== false;
      updateStatus(res.enabled !== false);
      setActiveAlgo(res.mode || "hybrid");
      renderKeywords(res.custom_keywords || []);
      renderWhitelist(res.whitelist || []);
      renderLog(res.log_entries || []);
      updateStats(res.stat_total || 0, res.stat_aggressive || 0);

      togglePanelMode.checked = res.panel_mode === true;
      applyPanelMode(res.panel_mode === true);

      themePref = res.theme || "auto";
      applyTheme(themePref);
    }
  );

  // ── Expert Mode — show/hide the Test & Evaluation demo tabs ────────────────
  // Off by default: regular users only see Detection + Settings. Turning it
  // on reveals the SOP 2 demo tabs for showing the algorithm to a panel.
  function applyPanelMode(enabled) {
    demoTabs.forEach(tab => tab.classList.toggle("hidden", !enabled));

    // If a now-hidden demo tab was active, fall back to Detection.
    const activeTab = document.querySelector(".tab.active");
    if (!enabled && activeTab && activeTab.classList.contains("demo-tab")) {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.querySelector('.tab[data-tab="detection"]').classList.add("active");
      document.getElementById("tab-detection").classList.add("active");
    }
  }

  togglePanelMode.addEventListener("change", () => {
    const panel_mode = togglePanelMode.checked;
    chrome.storage.local.set({ panel_mode });
    applyPanelMode(panel_mode);
  });

  // ── Poll storage every second to keep stats fresh ─────────────────────────
  // Fixes blocked count not updating while popup is open
  setInterval(() => {
    chrome.storage.local.get(["stat_total","stat_aggressive","log_entries"], (res) => {
      if (chrome.runtime.lastError) return;
      updateStats(res.stat_total || 0, res.stat_aggressive || 0);
      if (res.log_entries) renderLog(res.log_entries);
    });
  }, 1000);

  // ── Platform badge ─────────────────────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url || "";
    // Extract hostname from URL and display as platform badge
    // Works for ALL websites not just specific ones
    try {
      const hostname = new URL(url).hostname.replace("www.","");
      // Known platforms get friendly names
      const known = {
        "reddit.com": "Reddit",
        "youtube.com": "YouTube",
        "twitter.com": "Twitter/X",
        "x.com": "Twitter/X",
        "facebook.com": "Facebook",
        "instagram.com": "Instagram",
        "tiktok.com": "TikTok",
        "linkedin.com": "LinkedIn",
        "tumblr.com": "Tumblr",
        "pinterest.com": "Pinterest",
        "twitch.tv": "Twitch",
      };
      // Use friendly name if known, otherwise use hostname directly
      const platform = known[hostname] || hostname;
      platformBadge.textContent = platform;

      _isExcludedSite = isExcludedHostname(hostname);
      if (_isExcludedSite) {
        platformBadge.textContent = platform + " (excluded)";
        updateStats(0, 0); // correct any stale numbers immediately, don't wait for the next poll
      }
    } catch(e) {
      platformBadge.textContent = "Active";
    }
  });

  // ── Help button — regular-user facing, not shown in thesis demo tabs ──────
  if (helpBtn && helpBox) {
    helpBtn.addEventListener("click", () => helpBox.classList.toggle("hidden"));
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  toggleEnabled.addEventListener("change", () => {
    const enabled = toggleEnabled.checked;
    updateStatus(enabled);
    chrome.storage.local.set({ enabled }, () => reloadTab());
  });

  function updateStatus(on) {
    statusBar.className    = on ? "status-strip status-on" : "status-strip status-off";
    statusText.textContent = on ? "Protection Active" : "Protection Paused";
  }

  // ── Algorithm buttons ──────────────────────────────────────────────────────
  algoButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      chrome.storage.local.get("mode", (res) => {
        if (res.mode === mode) return;
        chrome.storage.local.set({ mode }, () => {
          setActiveAlgo(mode);
          reloadTab();
        });
      });
    });
  });

  function setActiveAlgo(mode) {
    algoButtons.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    if (algoDesc) algoDesc.textContent = ALGO_DESCRIPTIONS[mode] || "";
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  // stat_total/stat_aggressive live in chrome.storage.local as GLOBAL keys,
  // not scoped per-site — they only get reset to 0 when content.js loads on
  // a page. On an excluded site (Messenger, Gmail, etc.) content.js never
  // runs at all, so those numbers are just whatever was left over from the
  // last site that WAS scanned, not anything happening on this tab. Forced
  // to 0 here whenever the active tab is a known-excluded site, so the
  // popup can't make it look like scanning happened somewhere it didn't.
  let _isExcludedSite = false;

  function updateStats(total, aggressive) {
    if (_isExcludedSite) { total = 0; aggressive = 0; }
    const safe = Math.max(0, total - aggressive);
    if (statTotal)      statTotal.textContent      = total;
    if (statAggressive) statAggressive.textContent = aggressive;
    if (statSafe)       statSafe.textContent       = safe;
  }

  // Reads the real exclude_matches list straight from manifest.json instead
  // of keeping a second hardcoded copy in sync — matches "*://x.com/*" and
  // "*://*.x.com/*" style patterns against the active tab's hostname.
  function isExcludedHostname(hostname) {
    try {
      const manifest = chrome.runtime.getManifest();
      const patterns = manifest.content_scripts?.[0]?.exclude_matches || [];
      return patterns.some(p => {
        const host = p.replace(/^\*:\/\//, "").replace(/\/\*$/, ""); // "*.messenger.com" or "messenger.com"
        let reStr = host
          .split(".")
          .map(part => part === "*" ? "[a-z0-9-]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("\\.");
        // A leading "*." wildcard should also match the bare domain itself
        // (zero subdomains), not just "something.messenger.com".
        if (host.startsWith("*.")) {
          const bare = reStr.replace(/^\[a-z0-9-\]\+\\\./, "");
          reStr = "(?:[a-z0-9-]+\\.)?" + bare;
        }
        const re = new RegExp("^" + reStr + "$", "i");
        return re.test(hostname);
      });
    } catch(e) { return false; }
  }

  // ── Detection Log ──────────────────────────────────────────────────────────
  function renderLog(entries) {
    if (!liveLog) return;
    if (!entries || entries.length === 0) {
      liveLog.innerHTML = '<div class="log-empty">No detections yet — browse any page.</div>';
      if (logCount) logCount.textContent = "0 detections";
      return;
    }
    if (logCount) logCount.textContent = entries.length + " detections";
    const reversed = [...entries].reverse();
    liveLog.innerHTML = reversed.map(e => {
      // Use score >= 0.5 OR is_aggressive flag — whichever says blocked
      const isBlocked = e.is_aggressive || (e.score || 0) >= 0.5;
      const cls   = isBlocked ? "log-item log-agg" : "log-item log-safe";
      const label = isBlocked ? "BLOCKED" : "SAFE";
      const pct   = ((e.score || 0) * 100).toFixed(1);
      return `
        <div class="${cls}">
          <div class="log-top">
            <span class="log-badge">${label}</span>
            <span class="log-score">${pct}%</span>
            <span class="log-mode">${(e.mode || "hybrid").toUpperCase()}</span>
            <span class="log-time">${e.time || ""}</span>
          </div>
          <div class="log-text">${e.text || ""}</div>
        </div>`;
    }).join("");
  }

  if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
      if (!confirm("Clear the detection log? This removes all recorded detections and stats for this tab — it can't be undone.")) return;
      chrome.storage.local.set(
        { log_entries: [], stat_total: 0, stat_aggressive: 0 },
        () => {
          renderLog([]);
          updateStats(0, 0);
          chrome.runtime.sendMessage({ type: "CLEAR_BADGE" }).catch(() => {});
        }
      );
    });
  }

  // ── Whitelist ──────────────────────────────────────────────────────────────
  function renderWhitelist(words) {
    if (!whitelistList) return;
    if (words.length === 0) {
      whitelistList.innerHTML = '<li class="empty-list">No whitelisted words yet.</li>';
      return;
    }
    whitelistList.innerHTML = words.map(w => `
      <li>
        <span>${w}</span>
        <button class="remove-btn" data-word="${w}" data-type="whitelist">✕</button>
      </li>`).join("");
    whitelistList.querySelectorAll(".remove-btn").forEach(btn => {
      btn.addEventListener("click", () => removeWord(btn.dataset.word, "whitelist"));
    });
  }

  if (addWhitelistBtn) {
    addWhitelistBtn.addEventListener("click", () => addWhitelistWord());
  }
  if (whitelistInput) {
    whitelistInput.addEventListener("keydown", e => {
      if (e.key === "Enter") addWhitelistWord();
    });
  }

  function addWhitelistWord() {
    const word = whitelistInput.value.trim().toLowerCase();
    if (!word) return;

    // ── Check: word must NOT be in blocklist ──────────────────────────────
    chrome.storage.local.get(["whitelist", "custom_keywords"], (res) => {
      const whitelist = res.whitelist || [];
      const blocklist = res.custom_keywords || [];

      // Conflict check — cannot be in both lists
      if (blocklist.includes(word)) {
        showFeedback(addWhitelistBtn, "⚠ In blocklist!", "#f59e0b");
        whitelistInput.value = "";
        return;
      }

      if (whitelist.includes(word)) {
        showFeedback(addWhitelistBtn, "Exists!", "#6b7280");
        whitelistInput.value = "";
        return;
      }

      whitelist.push(word);
      chrome.storage.local.set({ whitelist }, () => {
        renderWhitelist(whitelist);
        whitelistInput.value = "";
        showFeedback(addWhitelistBtn, "✓ Added!", "#16a34a");
        reloadTab();
      });
    });
  }

  // ── Blocklist ──────────────────────────────────────────────────────────────
  function renderKeywords(words) {
    if (!keywordList) return;
    if (words.length === 0) {
      keywordList.innerHTML = '<li class="empty-list">No blocked keywords yet.</li>';
      return;
    }
    keywordList.innerHTML = words.map(w => `
      <li>
        <span>${w}</span>
        <button class="remove-btn" data-word="${w}" data-type="keywords">✕</button>
      </li>`).join("");
    keywordList.querySelectorAll(".remove-btn").forEach(btn => {
      btn.addEventListener("click", () => removeWord(btn.dataset.word, "keywords"));
    });
  }

  if (addKeywordBtn) {
    addKeywordBtn.addEventListener("click", () => addKeyword());
  }
  if (keywordInput) {
    keywordInput.addEventListener("keydown", e => {
      if (e.key === "Enter") addKeyword();
    });
  }

  function addKeyword() {
    const word = keywordInput.value.trim().toLowerCase();
    if (!word) return;

    // ── Check: word must NOT be in whitelist ──────────────────────────────
    chrome.storage.local.get(["custom_keywords", "whitelist"], (res) => {
      const blocklist = res.custom_keywords || [];
      const whitelist = res.whitelist || [];

      // Conflict check — cannot be in both lists
      if (whitelist.includes(word)) {
        showFeedback(addKeywordBtn, "⚠ In whitelist!", "#f59e0b");
        keywordInput.value = "";
        return;
      }

      if (blocklist.includes(word)) {
        showFeedback(addKeywordBtn, "Exists!", "#6b7280");
        keywordInput.value = "";
        return;
      }

      blocklist.push(word);
      chrome.storage.local.set({ custom_keywords: blocklist }, () => {
        renderKeywords(blocklist);
        keywordInput.value = "";
        showFeedback(addKeywordBtn, "✓ Added!", "#16a34a");
        reloadTab();
      });
    });
  }

  function removeWord(word, type) {
    const key = type === "whitelist" ? "whitelist" : "custom_keywords";
    chrome.storage.local.get(key, (res) => {
      const list = (res[key] || []).filter(w => w !== word);
      chrome.storage.local.set({ [key]: list }, () => {
        if (type === "whitelist") renderWhitelist(list);
        else renderKeywords(list);
        reloadTab();
      });
    });
  }

  // ── Helper: show button feedback ───────────────────────────────────────────
  function showFeedback(btn, msg, color) {
    const orig = btn.textContent;
    const origBg = btn.style.background;
    btn.textContent       = msg;
    btn.style.background  = color;
    setTimeout(() => {
      btn.textContent      = orig;
      btn.style.background = origBg;
    }, 1800);
  }

  // ── Test Tab — SOP 2 Live Demo ─────────────────────────────────────────────
  const TEST_BTN_IDLE_LABEL = "▶ Analyze Text (SOP 2 Demo)";
  function setTestBtnLoading(loading) {
    if (loading) {
      testBtn.innerHTML = '<span class="btn-spinner"></span> Analyzing…';
      testBtn.disabled  = true;
      if (sop2Results) sop2Results.style.opacity = "0.45";
    } else {
      testBtn.textContent = TEST_BTN_IDLE_LABEL;
      testBtn.disabled    = false;
      if (sop2Results) sop2Results.style.opacity = "1";
    }
  }

  // Minimum loading spinner duration, so it doesn't just flash and disappear.
  const MIN_LOADING_MS = 1400;

  function finishAnalysis(text, results) {
    setTestBtnLoading(false);

    if (!results || !results[0] || !results[0].result) {
      sop2Results.classList.remove("hidden");
      sop2Verdict.className   = "sop2-verdict safe";
      sop2Verdict.textContent = "⚠ Please refresh the page first, then try again.";
      return;
    }

    const { nb, vader, hybrid, nbTrace, vaderTrace, positiveWords } = results[0].result;
    // NB, VADER, and Hybrid all share the same 0.5 cutoff.
    const threshold       = 0.5;
    const hybridThreshold = 0.5;

    const nbAgg     = nb     >= threshold;
    const vaderAgg  = vader  >= threshold;
    const hybridAgg = hybrid >= hybridThreshold;

    sop2Results.classList.remove("hidden");

    // Verdict
    sop2Verdict.className   = hybridAgg ? "sop2-verdict agg" : "sop2-verdict safe";
    sop2Verdict.textContent = hybridAgg
      ? "⚠ AGGRESSIVE CONTENT DETECTED"
      : "✓ SAFE — Not Aggressive";

    // Scores — kept to 1 decimal place, not rounded to a whole number, so
    // the displayed figure is the actual computed score (e.g. 67.8%).
    const nbP  = parseFloat((nb * 100).toFixed(1));
    const vP   = parseFloat((vader * 100).toFixed(1));
    const hP   = parseFloat((hybrid * 100).toFixed(1));

    document.getElementById("nbScore").textContent     = nbP + "%";
    document.getElementById("vaderScore").textContent  = vP + "%";
    document.getElementById("hybridScore").textContent = hP + "%";

    const setResult = (id, isAgg) => {
      const el = document.getElementById(id);
      el.textContent = isAgg ? "AGGRESSIVE" : "SAFE";
      el.className   = isAgg ? "result-agg"  : "result-safe";
    };
    setResult("nbResult",     nbAgg);
    setResult("vaderResult",  vaderAgg);
    setResult("hybridResult", hybridAgg);

    // Hybrid row background reflects this request's actual verdict —
    // must not be hardcoded green, or an AGGRESSIVE result would show
    // in a "safe" color.
    const hybridRow = document.getElementById("hybridRow");
    if (hybridRow) hybridRow.className = "row-hybrid " + (hybridAgg ? "verdict-agg" : "verdict-safe");

    // Bars
    const setBar = (barId, pctId, pct, isAgg) => {
      document.getElementById(barId).style.width      = pct + "%";
      document.getElementById(barId).style.background = isAgg ? "#dc2626" : "#16a34a";
      document.getElementById(pctId).textContent      = pct + "%";
    };
    setBar("nbBar",     "nbPct",     nbP,  nbAgg);
    setBar("vaderBar",  "vaderPct",  vP,   vaderAgg);
    setBar("hybridBar", "hybridPct", hP,   hybridAgg);

    if (thresholdLabel) thresholdLabel.textContent = `── Threshold: ${hybridThreshold * 100}%`;

    // Note
    document.getElementById("sop2Note").textContent =
      `Hybrid formula: R_score = 0.6 × NB (${nbP}%) + 0.4 × VADER (${vP}%) = ${hP}%. ` +
      `Threshold = ${hybridThreshold * 100}% (same cutoff as NB/VADER). ` +
      `The Hybrid model combines both algorithms for better detection than single-algorithm approaches.`;

    // Store this analysis, then jump straight to the Steps tab so the
    // detailed breakdown plays immediately — no manual "see how this was
    // calculated" click needed.
    lastAnalysis = {
      text, nbTrace, vaderTrace,
      meta: { nbP, vP, hP, threshold: hybridThreshold * 100, hybridAgg, positiveWords: positiveWords || [] },
    };
    switchToTab("steps");
  }

  if (testBtn) {
    testBtn.addEventListener("click", () => {
      const text = testInput.value.trim();
      if (!text) return;

      setTestBtnLoading(true);
      const startedAt = Date.now();

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          setTestBtnLoading(false);
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (inputText) => {
            try {
              const nbTrace = typeof NaiveBayes !== "undefined"
                ? NaiveBayes.scoreWithTrace(inputText) : { ok: false };
              const vaderTrace = typeof VADER !== "undefined"
                ? VADER.analyzeWithTrace(inputText) : { ok: false };

              const nb    = nbTrace.ok ? nbTrace.prob : 0.5;
              const vader = vaderTrace.aggression_score ?? 0.5;

              // Reuse content.js's own weight constants, threshold, and
              // English-filter/self-distress logic (same isolated world, so
              // these globals are already loaded) so this demo can never show
              // a different verdict than the live page scan does.
              const nbWeight    = typeof HYBRID_NB_WEIGHT    !== "undefined" ? HYBRID_NB_WEIGHT    : 0.6;
              const vaderWeight = typeof HYBRID_VADER_WEIGHT !== "undefined" ? HYBRID_VADER_WEIGHT : 0.4;
              const hybridThreshold = typeof HYBRID_THRESHOLD !== "undefined" ? HYBRID_THRESHOLD : 0.5;
              // Same zero-evidence guard as content.js's analyseEl — if NB
              // never saw any of these tokens in training, its score is just
              // the bare class prior, not real evidence, so don't let it
              // dilute a confident VADER read.
              let hybrid = (nbTrace.ok && nbTrace.matched.length === 0)
                ? vader
                : (nbWeight * nb) + (vaderWeight * vader);

              // Non-English text is suppressed entirely, at any score — see
              // the matching comment in content.js for why the borderline-
              // only ceiling was removed.
              if (typeof looksEnglish === "function" &&
                  hybrid >= hybridThreshold && !looksEnglish(inputText)) {
                hybrid = 0;
              }

              const dampen = typeof SELF_DISTRESS_DAMPEN !== "undefined" ? SELF_DISTRESS_DAMPEN : 0.4;
              if (typeof isSelfDirectedDistress === "function" &&
                  hybrid >= hybridThreshold && isSelfDirectedDistress(inputText)) {
                hybrid *= dampen;
              }

              // Words NB's sparse, class-imbalanced counts happen to lean
              // "aggressive" on but that VADER's lexicon knows are genuinely
              // positive (e.g. "beautiful") — used downstream to stop the
              // Steps replay from painting a compliment red just because a
              // rare word's noisy log-likelihood split leans that way.
              const positiveWords = typeof VADER !== "undefined"
                ? Array.from(new Set((nbTrace.matched || [])
                    .map(t => t.token.replace(/^not_/, ""))
                    .filter(w => VADER.isPositiveLexiconWord(w))))
                : [];

              return { nb, vader, hybrid, nbTrace, vaderTrace, positiveWords, ok: true };
            } catch(e) {
              return { nb: 0, vader: 0, hybrid: 0, ok: false, err: e.message };
            }
          },
          args: [text],
        }, (results) => {
          const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
          if (remaining > 0) {
            setTimeout(() => finishAnalysis(text, results), remaining);
          } else {
            finishAnalysis(text, results);
          }
        });
      });
    });
  }

  // ── Step-by-step algorithm trace (Test tab) ────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // Animates a number counting up from 0 to target — makes a score look
  // like it's actually being computed instead of just appearing. Ends on
  // the exact target (1 decimal place), not a rounded whole number.
  function countUp(el, target, duration = 450) {
    if (!el) return;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const val = t >= 1 ? target : target * eased;
      el.textContent = val.toFixed(1) + "%";
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Full academic derivation — class prior from real training counts, and
  // every matched word's raw count traced through the actual Laplace
  // smoothing formula. Mirrors the same block in result_display.js so the
  // page panel and this popup never show different math. Only buildable
  // when naive_bayes.js's trace carries the extra fields (class_counts/
  // total_words in vocab.json) — returns "" if an older vocab.json is loaded.
  function buildFullDerivationHtml(nbTrace, nbTop) {
    if (nbTrace.classCounts0 == null || nbTrace.totalWords0 == null) return "";
    const c0 = nbTrace.classCounts0, c1 = nbTrace.classCounts1;
    const totalDocs = c0 + c1;
    const tw0 = nbTrace.totalWords0, tw1 = nbTrace.totalWords1, vsz = nbTrace.vocabSize;
    const priorLines =
      `Class prior (same for every comment — from the training set):\n` +
      `  ${c0.toLocaleString()} safe comments, ${c1.toLocaleString()} aggressive comments (${totalDocs.toLocaleString()} total)\n` +
      `  log_prior(safe)       = log(${c0.toLocaleString()} / ${totalDocs.toLocaleString()}) = ${(nbTrace.logPrior0 ?? 0).toFixed(2)}\n` +
      `  log_prior(aggressive) = log(${c1.toLocaleString()} / ${totalDocs.toLocaleString()}) = ${(nbTrace.logPrior1 ?? 0).toFixed(2)}`;

    const wordLines = (nbTop || []).slice(0, 6).map(m => {
      const lines = [
        `${m.token} — appeared ${(m.rawCount0 ?? 0).toLocaleString()}x among ${tw0.toLocaleString()} safe words, ` +
        `${(m.rawCount1 ?? 0).toLocaleString()}x among ${tw1.toLocaleString()} aggressive words:`,
        `  ll(safe)       = log((${m.rawCount0}+1)/(${tw0.toLocaleString()}+${vsz.toLocaleString()})) = ${m.rawLl0.toFixed(2)}`,
        `  ll(aggressive) = log((${m.rawCount1}+1)/(${tw1.toLocaleString()}+${vsz.toLocaleString()})) = ${m.rawLl1.toFixed(2)}`,
      ];
      if (m.wasDampened) {
        lines.push(`  &rarr; negated, so dampened toward their average: ll(safe)=${m.ll0.toFixed(2)}  ll(aggressive)=${m.ll1.toFixed(2)}`);
      }
      return lines.join("\n");
    }).join("\n\n");

    return `
      <details class="calc-details">
        <summary>Show the full derivation (real training counts, for your defense)</summary>
        <pre class="math-block">${priorLines}\n\n${wordLines || "(no words matched the trained vocabulary)"}</pre>
      </details>`;
  }

  // Renders the step-by-step trace as an animated sequence.
  // A sequence token guards against a second Analyze click landing mid-animation.
  renderSteps._seq = 0;
  async function renderSteps(text, nbTrace, vaderTrace, meta) {
    const container = document.getElementById("stepByStep");
    if (!container) return;

    if (!nbTrace?.ok) {
      container.innerHTML = `<div class="note-box">Step-by-step trace unavailable — refresh the page and try again.</div>`;
      return;
    }

    const seq = ++renderSteps._seq;
    const stillCurrent = () => seq === renderSteps._seq;
    container.innerHTML = "";

    // ── Block 1: Pipeline Overview ────────────────────────────────────
    const block1 = document.createElement("div");
    block1.className = "step-block";
    block1.innerHTML = `
      <div class="step-title">Pipeline Overview</div>
      <div class="step-body">
        <div class="pipeline" id="pipelineLive"></div>
        <p style="margin-top:10px;"><strong>Your text, color-coded by what the algorithms reacted to:</strong></p>
        <div class="highlighted-sentence" id="sentenceLive"></div>
        <div class="hl-legend">
          <span><span class="hl-swatch hl-agg"></span> pushes toward aggressive</span>
          <span><span class="hl-swatch hl-safe"></span> pushes toward safe</span>
          <span><span class="hl-swatch hl-neg"></span> negation flips meaning</span>
        </div>
      </div>`;
    container.appendChild(block1);
    if (!stillCurrent()) return;

    const pipelineEl = block1.querySelector("#pipelineLive");
    const sentenceEl = block1.querySelector("#sentenceLive");
    const verdictClass = meta.hybridAgg ? "pipe-agg" : "pipe-safe";
    const verdictLabel  = meta.hybridAgg ? "AGGRESSIVE" : "SAFE";

    const pipeStages = [
      '<div class="pipe-node reveal-pop"><div class="pipe-icon">📝</div><div class="pipe-label">Input Text</div></div>',
      '<div class="pipe-arrow reveal-pop">→</div>',
      '<div class="pipe-node reveal-pop"><div class="pipe-icon">✂️</div><div class="pipe-label">Tokenize</div></div>',
      '<div class="pipe-arrow reveal-pop">→</div>',
      '<div class="pipe-node pipe-split reveal-pop"><div class="pipe-mini">NB<br><strong id="pipeNbNum">0%</strong></div><div class="pipe-mini">VADER<br><strong id="pipeVaderNum">0%</strong></div></div>',
      '<div class="pipe-arrow reveal-pop">→</div>',
      `<div class="pipe-node ${verdictClass} reveal-pop"><div class="pipe-label" id="pipeVerdictNum">0%</div><div class="pipe-sub">${verdictLabel}</div></div>`,
    ];
    for (const html of pipeStages) {
      if (!stillCurrent()) return;
      pipelineEl.insertAdjacentHTML("beforeend", html);
      await wait(130);
    }
    countUp(document.getElementById("pipeNbNum"), meta.nbP);
    countUp(document.getElementById("pipeVaderNum"), meta.vP);
    await wait(250);
    if (!stillCurrent()) return;
    countUp(document.getElementById("pipeVerdictNum"), meta.hP);
    await wait(300);
    if (!stillCurrent()) return;

    // Reveal the sentence word by word, colored as each word is "read".
    const nbPush = new Map();
    // Negated NB tokens ("not_stupid") don't match the bare word ("stupid")
    // by token lookup — track them separately, keyed by the word AFTER the
    // "not_" prefix, so "stupid" in "you are not stupid" gets flagged as a
    // negation match, not silently skipped by the NB lookup below.
    const nbNegWords = new Map();
    (nbTrace.matched || []).forEach(t => {
      if (t.isSarcasmCue) return;
      if (t.token.startsWith("not_")) nbNegWords.set(t.token.slice(4), t.pushToAggressive);
      else nbPush.set(t.token, t.pushToAggressive);
    });
    const vaderPush = new Map();
    (vaderTrace.matchedWords || []).forEach(w => vaderPush.set(w.word, w.valence));

    // Every word actually flipped by a negation, from either algorithm —
    // NB's not_X tokens plus any VADER lexicon word it negated directly
    // (VADER doesn't always share NB's vocabulary, e.g. "beautiful" may
    // only ever show up here, not as a not_beautiful token).
    const negWords = new Set(nbNegWords.keys());
    (vaderTrace.matchedWords || []).forEach(w => { if (w.negated) negWords.add(w.word); });

    // Words NB's noisy, class-imbalanced counts weakly lean "aggressive" on
    // despite being genuinely positive per VADER's lexicon (e.g. "beautiful"
    // in "worthless but beautiful") — computed alongside the trace itself
    // (see the executeScript call above) since VADER's lexicon isn't loaded
    // in the popup's own script context. Left uncolored rather than forced
    // green, since a sparse NB count isn't confident evidence either way.
    const positiveWords = new Set(meta.positiveWords || []);

    // The negation word itself ("not", "never", "don't"...) — mirrors
    // naive_bayes.js's NEGATION_WORDS / vader.js's NEGATE — never earns a
    // color of its own from nbPush/vaderPush (it's a stopword, not a
    // lexicon entry), so it has to be found by scanning the text directly
    // for a trigger word sitting 1-3 words ahead of something in negWords.
    const NEGATION_TRIGGER_WORDS = new Set([
      "not", "no", "never", "neither", "nor", "without",
      "barely", "hardly", "scarcely",
      "don't", "dont", "can't", "cant", "won't", "wont",
      "wouldn't", "wouldnt", "shouldn't", "shouldnt",
      "isn't", "isnt", "aren't", "arent", "doesn't", "doesnt",
      "didn't", "didnt", "haven't", "havent", "hasn't", "hasnt",
      "hadn't", "hadnt",
    ]);
    const NEGATION_WINDOW = 3;

    const chunks = text.split(/(\s+)/);
    const wordIdxs = [];
    chunks.forEach((c, i) => { if (!/^\s*$/.test(c)) wordIdxs.push(i); });
    const negTriggerIdxs = new Set();
    wordIdxs.forEach((idx, k) => {
      const clean = chunks[idx].toLowerCase().replace(/[^a-z']/g, "");
      if (!NEGATION_TRIGGER_WORDS.has(clean)) return;
      for (let n = k + 1; n <= Math.min(wordIdxs.length - 1, k + NEGATION_WINDOW); n++) {
        const nextClean = chunks[wordIdxs[n]].toLowerCase().replace(/[^a-z']/g, "");
        if (negWords.has(nextClean)) { negTriggerIdxs.add(idx); break; }
      }
    });

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!stillCurrent()) return;
      if (/^\s*$/.test(chunk)) { sentenceEl.insertAdjacentText("beforeend", chunk); continue; }
      const clean = chunk.toLowerCase().replace(/[^a-z']/g, "");
      const nbHit  = nbPush.get(clean);
      const vHit   = vaderPush.get(clean);
      let cls = null;
      if (negTriggerIdxs.has(i) || negWords.has(clean)) cls = "hl-neg";
      else if ((nbHit !== undefined && nbHit > 0 && !positiveWords.has(clean)) || (vHit !== undefined && vHit < 0)) cls = "hl-agg";
      else if ((nbHit !== undefined && nbHit < 0) || (vHit !== undefined && vHit > 0)) cls = "hl-safe";
      const safeChunk = escapeHtml(chunk);
      sentenceEl.insertAdjacentHTML("beforeend",
        cls ? `<span class="${cls} reveal-pop">${safeChunk}</span>` : `<span class="reveal-pop">${safeChunk}</span>`);
      await wait(55);
    }
    await wait(300);
    if (!stillCurrent()) return;

    // ── Block 2: Naive Bayes ──────────────────────────────────────────
    const nbTop = nbTrace.matched.slice(0, 8);
    // A "not_X" token where X is a KNOWN NEGATIVE word (e.g. "not_ugly") is
    // a negated insult — semantically safe-leaning — but negated phrases are
    // rare in training data, so NB's learned push for the exact token can
    // noisily lean "aggressive" anyway (same root cause as the positive-word
    // case handled elsewhere, opposite sign). Flagged here so the table
    // doesn't display a confidently wrong-looking "AGGRESSIVE" for it.
    const noisyNegatedTokens = new Set(
      nbTop.filter(t => t.token.startsWith("not_") &&
        typeof VADER !== "undefined" && VADER.isNegativeLexiconWord(t.token.slice(4)))
        .map(t => t.token)
    );
    const block2 = document.createElement("div");
    block2.className = "step-block";
    block2.innerHTML = `
      <div class="step-title">Step 1 — Naive Bayes: tokenize &amp; score words</div>
      <div class="step-body">
        <p>Text is lowercased, stripped of punctuation, and split into words. Stopwords are removed${
          nbTrace.matched.some(t => t.isSarcasmCue) ? ", and any known sarcasm phrase is added as its own feature." : "."
        }</p>
        <p><strong>${nbTrace.matched.length}</strong> word(s) matched the trained vocabulary out of <strong>${nbTrace.tokens.length}</strong> extracted:</p>
        ${nbTop.length ? `
          <p class="hint" style="margin-bottom:4px;">Each row's number = <span class="hl-neg">ll(aggressive)</span> &minus; <span class="hl-pos">ll(safe)</span>, both computed with JavaScript's <code>Math.log()</code> from real training counts. <strong>Positive/red</strong> = that word's stats lean aggressive; <strong>negative/green</strong> = it leans safe.</p>
          <table class="trace-table">
            <thead><tr><th>Word</th><th>Pushes toward</th></tr></thead>
            <tbody id="nbRowsLive"></tbody>
          </table>
          ${noisyNegatedTokens.size ? `
          <p class="hint" style="margin-top:4px;"><strong>About the "NEGATED, NOISY" row${noisyNegatedTokens.size > 1 ? "s" : ""}:</strong> a negated insult like this is rare in training data (often just a handful of examples), so its learned push is mostly noise, not a real pattern — this is exactly what the 75% negation-dampening in the derivation below exists to reduce (though it doesn't fully zero it out). VADER's own negation handling doesn't have this sparse-count problem, which is why the Hybrid blend below still lands on the right side despite this.</p>
          ` : ""}` : `<p class="hint">No trained words matched (this exact word/phrase never showed up often enough in training) — Naive Bayes has no per-word evidence, so it falls back to the class prior below.</p>`
        }
        <p class="step-result ${meta.nbP >= 50 ? "is-agg" : "is-safe"}">→ Naive Bayes probability: <strong id="nbFinalNum">0%</strong></p>
        <pre class="math-block">1. Baseline score for each side: <span class="hl-pos">safe=${(nbTrace.logPrior0 ?? 0).toFixed(2)}</span>  <span class="hl-neg">aggressive=${(nbTrace.logPrior1 ?? 0).toFixed(2)}</span>
2. Add every matched word's score to both sides:
   <span class="hl-pos">safe total=${(nbTrace.score0 ?? 0).toFixed(2)}</span>  <span class="hl-neg">aggressive total=${(nbTrace.score1 ?? 0).toFixed(2)}</span>
3. Bigger total "wins" &rarr; <span class="${meta.nbP >= 50 ? "hl-neg" : "hl-pos"}">${meta.nbP}% chance this is aggressive</span></pre>
        <p class="hint" style="margin-top:2px;"><strong>Why both totals are negative:</strong> <code>safe</code> and <code>aggressive</code> above are log-probabilities (from <code>Math.log()</code>) — always negative, since log of anything under 1 is negative. The side <strong>closer to zero</strong> wins, not the "positive" one. Step 3's percentage comes from running <code>Math.exp()</code> on both totals and dividing one by their sum (softmax) — the exact code line is in the full derivation below.</p>
        ${buildFullDerivationHtml(nbTrace, nbTop)}
      </div>`;
    container.appendChild(block2);
    if (!stillCurrent()) return;

    if (nbTop.length) {
      const tbody = block2.querySelector("#nbRowsLive");
      for (const t of nbTop) {
        if (!stillCurrent()) return;
        const sign = t.pushToAggressive >= 0 ? "+" : "";
        const cls   = noisyNegatedTokens.has(t.token) ? "push-noisy" : (t.pushToAggressive >= 0 ? "push-agg" : "push-safe");
        const label = noisyNegatedTokens.has(t.token) ? "NEGATED, NOISY" : (t.pushToAggressive >= 0 ? "AGGRESSIVE" : "SAFE");
        tbody.insertAdjacentHTML("beforeend", `
          <tr class="reveal-pop">
            <td>${escapeHtml(t.token)}${t.isSarcasmCue ? ' <span class="tag-cue">sarcasm cue</span>' : ""}</td>
            <td class="${cls}">
              ${label} (${sign}${t.pushToAggressive.toFixed(2)})
            </td>
          </tr>`);
        await wait(90);
      }
    }
    if (!stillCurrent()) return;
    countUp(block2.querySelector("#nbFinalNum"), meta.nbP);
    await wait(500);
    if (!stillCurrent()) return;

    // ── Block 3: VADER ─────────────────────────────────────────────────
    const vTop = (vaderTrace.matchedWords || []).slice(0, 8);
    let clauseNote = "";
    if (vaderTrace.insultOverride) {
      clauseNote = `
        <p><strong>Backhanded-insult check:</strong> the sentence splits into clauses on "but/however/although/though".
        The clause "<em>${escapeHtml(vaderTrace.insultOverride.clause)}</em>" directly insults "you", so its own score
        (${vaderTrace.insultOverride.compound.toFixed(2)}) is used instead of blending in the rest of the sentence —
        a compliment elsewhere can't cancel out the insult.</p>`;
    } else if (vaderTrace.clauses) {
      clauseNote = `<p>Sentence has multiple clauses, but none is a direct "you are/you're &lt;insult&gt;" statement, so the whole sentence is scored together.</p>`;
    }

    let sarcasmNote = "";
    if (vaderTrace.matchedMarkers?.length) {
      sarcasmNote = `
        <p><strong>Sarcasm check:</strong> matched marker phrase${vaderTrace.matchedMarkers.length > 1 ? "s" : ""}
        "${vaderTrace.matchedMarkers.map(escapeHtml).join('", "')}". ${
          vaderTrace.sarcasmApplied
            ? "Score was corrected — sarcastic-sounding praise is treated as aggression, not sentiment."
            : "Score was already negative, so it's reinforced slightly."
        }</p>`;
    }

    const block3 = document.createElement("div");
    block3.className = "step-block";
    block3.innerHTML = `
      <div class="step-title">Step 2 — VADER: lexicon sentiment score</div>
      <div class="step-body">
        <p><strong>${vTop.length}</strong> word(s) matched the sentiment lexicon:</p>
        ${vTop.length ? `
          <p class="hint" style="margin-bottom:4px;">Each word's number is its <strong>valence</strong> — a hand-assigned score from VADER's lexicon (not computed from training data). <strong>Positive/green</strong> = positive sentiment (pushes toward safe); <strong>negative/red</strong> = negative sentiment (pushes toward aggressive). <em>This is the opposite sign convention from the Naive Bayes table above</em> — there, positive meant aggressive.</p>
          <table class="trace-table">
            <thead><tr><th>Word</th><th>Valence</th><th>Adjustments</th></tr></thead>
            <tbody id="vaderRowsLive"></tbody>
          </table>` : `<p class="hint">No lexicon words matched.</p>`
        }
        ${clauseNote}
        ${sarcasmNote}
        <p class="step-result ${meta.vP >= 50 ? "is-agg" : "is-safe"}">→ VADER aggression score: <strong id="vaderFinalNum">0%</strong></p>
        <pre class="math-block">1. Add up each matched word's emotion score: total=<span class="${(vaderTrace.valenceSum ?? 0) < 0 ? "hl-neg" : "hl-pos"}">${(vaderTrace.valenceSum ?? 0).toFixed(2)}</span>
2. Smooth onto a &minus;1 to +1 scale &rarr; <span class="${(vaderTrace.compound ?? 0) < 0 ? "hl-neg" : "hl-pos"}">${(vaderTrace.compound ?? 0).toFixed(2)}</span>
3. ${(vaderTrace.compound ?? 0) < 0 ? "Negative (unfriendly tone), so it counts as aggression" : "Not negative, so it doesn't add to aggression"} &rarr; <span class="${meta.vP >= 50 ? "hl-neg" : "hl-pos"}">${meta.vP}%</span></pre>
        <p class="hint" style="margin-top:2px;"><strong>The code behind step 2:</strong> <code>Math.sqrt()</code> normalizes the raw total into that &minus;1..+1 compound score. Only a negative compound counts as aggression — the code is literally <code>Math.max(0, -compound)</code> — so positive or neutral text always scores 0% here, never a negative percentage.</p>
      </div>`;
    container.appendChild(block3);
    if (!stillCurrent()) return;

    if (vTop.length) {
      const tbody = block3.querySelector("#vaderRowsLive");
      for (const w of vTop) {
        if (!stillCurrent()) return;
        tbody.insertAdjacentHTML("beforeend", `
          <tr class="reveal-pop">
            <td>${escapeHtml(w.word)}</td>
            <td class="${w.valence >= 0 ? "push-safe" : "push-agg"}">${w.valence >= 0 ? "+" : ""}${w.valence.toFixed(2)}</td>
            <td class="hint">${[
              w.negated ? "negated" : null,
              w.boosted ? "boosted" : null,
              w.capsBoosted ? "ALL CAPS" : null,
            ].filter(Boolean).join(", ") || "—"}</td>
          </tr>`);
        await wait(90);
      }
    }
    if (!stillCurrent()) return;
    countUp(block3.querySelector("#vaderFinalNum"), meta.vP);
    await wait(500);
    if (!stillCurrent()) return;

    // ── Block 4: Hybrid decision ───────────────────────────────────────
    const block4 = document.createElement("div");
    block4.className = "step-block";
    block4.innerHTML = `
      <div class="step-title">Step 3 — Hybrid: combine &amp; decide</div>
      <div class="step-body">
        ${nbTrace.matched.length === 0 ? `
        <p class="hint">Naive Bayes matched <strong>zero</strong> words this time — its ${meta.nbP}% isn't real evidence, just the untouched class prior. The code's <strong>zero-evidence guard</strong> catches this and skips the 60/40 blend entirely, using VADER's score directly instead.</p>
        <p>Final score = VADER = <strong id="hybridFinalNum">0%</strong></p>
        ` : `
        <p>Final score = <span class="hl-const">60%</span> of Naive Bayes (${meta.nbP}%) + <span class="hl-const">40%</span> of VADER (${meta.vP}%) = <strong id="hybridFinalNum">0%</strong></p>
        <p class="hint" style="margin-top:2px;"><strong>The code:</strong> literally <code>(0.6 * nb_prob) + (0.4 * vader_prob)</code> — plain arithmetic, run fresh on every comment.</p>
        `}
        <p class="step-result" id="hybridVerdictLine" style="opacity:0"></p>
      </div>`;
    container.appendChild(block4);
    if (!stillCurrent()) return;

    countUp(block4.querySelector("#hybridFinalNum"), meta.hP, 550);
    await wait(650);
    if (!stillCurrent()) return;

    const isAgg = meta.hP >= meta.threshold;
    const verdictLine = block4.querySelector("#hybridVerdictLine");
    verdictLine.classList.add(isAgg ? "is-agg" : "is-safe");
    verdictLine.innerHTML = `→ <span class="${isAgg ? "hl-neg" : "hl-pos"}">${meta.hP}%</span> ${isAgg ? "≥" : "<"} threshold (<span class="hl-const">${meta.threshold}%</span>) ⇒
      <strong>${isAgg ? "AGGRESSIVE" : "SAFE"}</strong>`;
    verdictLine.style.transition = "opacity .3s ease";
    requestAnimationFrame(() => { verdictLine.style.opacity = "1"; });
  }

  // ── Live storage updates ───────────────────────────────────────────────────
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.stat_total || changes.stat_aggressive) {
      chrome.storage.local.get(["stat_total","stat_aggressive"], (res) => {
        updateStats(res.stat_total || 0, res.stat_aggressive || 0);
      });
    }
    if (changes.log_entries) {
      renderLog(changes.log_entries.newValue || []);
    }
  });

});