/**
 * popup/popup.js — CAD Shield
 */

const ALGO_DESCRIPTIONS = {
  hybrid: "Naive Bayes + VADER combined (recommended)",
  nb:     "Naive Bayes only — pattern-based detection",
  vader:  "VADER only — sentiment-based detection",
};
const API_URL = "http://localhost:5000/predict";
const MAX_LOG = 500;

document.addEventListener("DOMContentLoaded", () => {

  // ── Refs ───────────────────────────────────────────────────────────────────
  const toggleEnabled  = document.getElementById("toggleEnabled");
  const statusBar      = document.getElementById("statusBar");
  const statusDot      = document.getElementById("statusDot");
  const statusText     = document.getElementById("statusText");
  const platformBadge  = document.getElementById("platformBadge");
  const algoDesc       = document.getElementById("algoDesc");
  const algoButtons    = document.querySelectorAll(".algo-btn");
  const nbValue        = document.getElementById("nbValue");
  const vaderValue     = document.getElementById("vaderValue");
  const hybridValue    = document.getElementById("hybridValue");
  const nbBadge        = document.getElementById("nbBadge");
  const vaderBadge     = document.getElementById("vaderBadge");
  const hybridBadge    = document.getElementById("hybridBadge");
  const scoreNB        = document.getElementById("scoreNB");
  const scoreVADER     = document.getElementById("scoreVADER");
  const scoreHybrid    = document.getElementById("scoreHybrid");
  const algoResultNote = document.getElementById("algoResultNote");
  const liveLog        = document.getElementById("liveLog");
  const logCount       = document.getElementById("logCount");
  const clearLogBtn    = document.getElementById("clearLog");
  const viewReportBtn  = document.getElementById("viewReport");
  const thresholdSlider = document.getElementById("thresholdSlider");
  const thresholdVal    = document.getElementById("thresholdVal");
  const whitelistInput  = document.getElementById("whitelistInput");
  const addWhitelistBtn = document.getElementById("addWhitelistBtn");
  const whitelistList   = document.getElementById("whitelistList");
  const perfAvg         = document.getElementById("perfAvg");
  const perfMin         = document.getElementById("perfMin");
  const perfMax         = document.getElementById("perfMax");
  const testInput      = document.getElementById("testInput");
  const testBtn        = document.getElementById("testBtn");
  const testResult     = document.getElementById("testResult");
  const testBreakdown  = document.getElementById("testBreakdown");
  const keywordInput   = document.getElementById("keywordInput");
  const addKeywordBtn  = document.getElementById("addKeywordBtn");
  const keywordList    = document.getElementById("keywordList");
  const statTotal      = document.getElementById("statTotal");
  const statAggressive = document.getElementById("statAggressive");
  const statSafe       = document.getElementById("statSafe");

  // ── Reload via background ──────────────────────────────────────────────────
  function reloadTab(delay = 200) {
    setTimeout(() => chrome.runtime.sendMessage({ type: "RELOAD_TAB" }), delay);
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    });
  });

  // ── Load settings ──────────────────────────────────────────────────────────
  chrome.storage.local.get(
    ["enabled","mode","custom_keywords","whitelist","threshold","log_entries","stat_total","stat_aggressive","last_scores","perf_ms"],
    (res) => {
      toggleEnabled.checked = res.enabled !== false;
      updateStatus(res.enabled !== false);
      setActiveAlgo(res.mode || "hybrid");
      renderKeywords(res.custom_keywords || []);
      renderWhitelist(res.whitelist || []);
      renderLog(res.log_entries || []);
      updateStats(res.stat_total || 0, res.stat_aggressive || 0);
      if (res.last_scores) updateScorePanel(res.last_scores, res.mode || "hybrid");
      const th = res.threshold || 0.5;
      thresholdSlider.value = Math.round(th * 100);
      thresholdVal.textContent = Math.round(th * 100) + "%";
      if (res.perf_ms) updatePerf(res.perf_ms);
    }
  );

  // ── Platform badge ─────────────────────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url || "";
    let platform = "";
    if (url.includes("reddit.com"))   platform = "Reddit";
    if (url.includes("youtube.com"))  platform = "YouTube";
    if (url.includes("twitter.com") || url.includes("x.com")) platform = "Twitter/X";
    if (url.includes("facebook.com")) platform = "Facebook";
    if (platform) platformBadge.textContent = platform;
  });

  // ── Toggle ─────────────────────────────────────────────────────────────────
  toggleEnabled.addEventListener("change", () => {
    const enabled = toggleEnabled.checked;
    updateStatus(enabled);
    chrome.storage.local.set({ enabled }, () => reloadTab(200));
  });

  function updateStatus(on) {
    statusBar.className    = on ? "status-bar status-on" : "status-bar status-off";
    statusText.textContent = on ? "Protection Active" : "Protection Paused";
  }

  // ── Algorithm ──────────────────────────────────────────────────────────────
  algoButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      chrome.storage.local.get("mode", (res) => {
        if (res.mode === mode) return;
        chrome.storage.local.set({ mode }, () => {
          setActiveAlgo(mode);
          reloadTab(200);
        });
      });
    });
  });

  function setActiveAlgo(mode) {
    algoButtons.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    algoDesc.textContent = ALGO_DESCRIPTIONS[mode] || "";
    scoreNB.classList.toggle("active-algo",     mode === "nb");
    scoreVADER.classList.toggle("active-algo",  mode === "vader");
    scoreHybrid.classList.toggle("active-algo", mode === "hybrid");
  }

  // ── Score panel ────────────────────────────────────────────────────────────
  function updateScorePanel(scores, mode) {
    if (!scores) return;
    nbValue.textContent     = (scores.nb    * 100).toFixed(1) + "%";
    vaderValue.textContent  = (scores.vader * 100).toFixed(1) + "%";
    hybridValue.textContent = (scores.hybrid* 100).toFixed(1) + "%";
    setChip(nbBadge,     scores.nb     >= 0.5, scoreNB);
    setChip(vaderBadge,  scores.vader  >= 0.5, scoreVADER);
    setChip(hybridBadge, scores.hybrid >= 0.5, scoreHybrid);
    algoResultNote.textContent = "Active: " + mode.toUpperCase() + " · Threshold: 50%";
  }

  function setChip(chip, isAgg, box) {
    chip.textContent = isAgg ? "AGGRESSIVE" : "SAFE";
    chip.className   = "score-chip " + (isAgg ? "agg" : "safe");
    box.classList.toggle("is-aggressive", isAgg);
  }

  // ── Live log listener ──────────────────────────────────────────────────────
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.log_entries)  renderLog(changes.log_entries.newValue || []);
    if (changes.last_scores || changes.mode) {
      chrome.storage.local.get(["last_scores","mode"], (r) => {
        if (r.last_scores) updateScorePanel(r.last_scores, r.mode || "hybrid");
      });
    }
    if (changes.stat_total || changes.stat_aggressive) {
      chrome.storage.local.get(["stat_total","stat_aggressive"], (r) =>
        updateStats(r.stat_total || 0, r.stat_aggressive || 0)
      );
    }
    if (changes.perf_ms) updatePerf(changes.perf_ms.newValue || []);
  });

  function renderLog(entries) {
    logCount.textContent = entries.length + " detection" + (entries.length !== 1 ? "s" : "");
    if (!entries.length) {
      liveLog.innerHTML = '<div class="log-empty">No detections yet — browse any page.</div>';
      return;
    }
    liveLog.innerHTML = [...entries].reverse().slice(0, MAX_LOG).map(e => {
      const why = buildWhySummary(e);
      return '<div class="log-item ' + (e.is_aggressive ? "aggressive" : "safe") + '">' +
        '<div class="log-item-main">' +
          '<span class="log-badge">' + (e.is_aggressive ? "BLOCKED" : "SAFE") + '</span>' +
          '<span class="log-mode">' + (e.mode||"").toUpperCase() + '</span>' +
          (e.ms ? '<span class="log-ms">' + e.ms + 'ms</span>' : '') +
          '<span class="log-text">' + esc(e.text.substring(0,50)) + (e.text.length>50?"…":"") + '</span>' +
          (why ? '<span class="log-why">' + why + '</span>' : '') +
        '</div>' +
        '<span class="log-score">' + (e.score*100).toFixed(0) + '%</span>' +
      '</div>';
    }).join("");
  }

  function buildWhySummary(e) {
    if (!e.is_aggressive) return "";
    const parts = [];
    if (e.score >= 0.8)       parts.push("High aggression score");
    else if (e.score >= 0.6)  parts.push("Moderate aggression score");
    if (e.mode === "hybrid")  parts.push("NB + VADER both flagged");
    if (e.mode === "nb")      parts.push("Word pattern match");
    if (e.mode === "vader")   parts.push("Negative sentiment detected");
    return parts.slice(0,2).join(" · ");
  }

  clearLogBtn.addEventListener("click", () => {
    chrome.storage.local.set({ log_entries:[], stat_total:0, stat_aggressive:0 });
    liveLog.innerHTML = '<div class="log-empty">Log cleared.</div>';
    logCount.textContent = "0 detections";
    updateStats(0, 0);
  });

  function updateStats(total, agg) {
    statTotal.textContent      = total;
    statAggressive.textContent = agg;
    statSafe.textContent       = Math.max(0, total - agg);
  }

  // ── Test tab ───────────────────────────────────────────────────────────────
  testBtn.addEventListener("click", runTest);
  testInput.addEventListener("keydown", e => { if (e.key === "Enter") runTest(); });

  async function runTest() {
    const text = testInput.value.trim();
    if (!text) return;
    testBtn.textContent     = "Analyzing…";
    testBtn.disabled        = true;
    testResult.className    = "test-result hidden";
    testBreakdown.className = "test-breakdown hidden";

    try {
      const [rH, rN, rV] = await Promise.all([
        fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({text, mode:"hybrid"}) }).then(r=>r.json()),
        fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({text, mode:"nb"})     }).then(r=>r.json()),
        fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({text, mode:"vader"})  }).then(r=>r.json()),
      ]);

      const nbPct     = (rN.hybrid_score * 100).toFixed(1);
      const vaderPct  = (rV.hybrid_score * 100).toFixed(1);
      const hybridPct = (rH.hybrid_score * 100).toFixed(1);

      chrome.storage.local.set({ last_scores: { nb: rN.hybrid_score, vader: rV.hybrid_score, hybrid: rH.hybrid_score } });
      chrome.storage.local.get("mode", (r) => updateScorePanel({ nb: rN.hybrid_score, vader: rV.hybrid_score, hybrid: rH.hybrid_score }, r.mode || "hybrid"));

      testResult.className = rH.is_aggressive ? "test-result aggressive" : "test-result safe";
      testResult.innerHTML = rH.is_aggressive
        ? "AGGRESSIVE — R-Score: " + hybridPct + "%"
        : "NON-AGGRESSIVE — R-Score: " + hybridPct + "%";

      testBreakdown.className = "test-breakdown";
      document.getElementById("nbBar").style.width     = nbPct + "%";
      document.getElementById("vaderBar").style.width  = vaderPct + "%";
      document.getElementById("hybridBar").style.width = hybridPct + "%";
      document.getElementById("nbPct").textContent     = nbPct + "%";
      document.getElementById("vaderPct").textContent  = vaderPct + "%";
      document.getElementById("hybridPct").textContent = hybridPct + "%";

    } catch {
      testResult.className = "test-result safe";
      testResult.innerHTML = "⚠ Backend offline — make sure app.py is running";
    }

    testBtn.textContent = "Analyze Text";
    testBtn.disabled    = false;
  }

  // ── Settings — keywords ────────────────────────────────────────────────────
  addKeywordBtn.addEventListener("click", addKeyword);
  keywordInput.addEventListener("keydown", e => { if (e.key === "Enter") addKeyword(); });

  function addKeyword() {
    const kw = keywordInput.value.trim().toLowerCase();
    if (!kw) return;
    keywordInput.value = "";
    chrome.storage.local.get("custom_keywords", (res) => {
      const list = res.custom_keywords || [];
      if (list.includes(kw)) return;
      list.push(kw);
      chrome.storage.local.set({ custom_keywords: list }, () => {
        renderKeywords(list);
        reloadTab(200);
      });
    });
  }

  function removeKeyword(kw) {
    chrome.storage.local.get("custom_keywords", (res) => {
      const list = (res.custom_keywords || []).filter(k => k !== kw);
      chrome.storage.local.set({ custom_keywords: list }, () => {
        renderKeywords(list);
        reloadTab(200);
      });
    });
  }

  function renderKeywords(list) {
    keywordList.innerHTML = "";
    if (!list.length) {
      keywordList.innerHTML = '<li><span class="empty-msg">No custom keywords yet</span></li>';
      return;
    }
    list.forEach(kw => {
      const li  = document.createElement("li");
      li.textContent = kw;
      const btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.textContent = "✕";
      btn.addEventListener("click", () => removeKeyword(kw));
      li.appendChild(btn);
      keywordList.appendChild(li);
    });
  }

  function esc(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Performance Monitor ────────────────────────────────────────────────────
  function updatePerf(arr) {
    if (!arr || !arr.length) return;
    const avg = Math.round(arr.reduce((a,b) => a+b, 0) / arr.length);
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    if (perfAvg) perfAvg.textContent = avg + "ms";
    if (perfMin) perfMin.textContent = min + "ms";
    if (perfMax) perfMax.textContent = max + "ms";
  }

  // Poll perf data every 2 seconds for live update
  setInterval(() => {
    chrome.storage.local.get("perf_ms", (r) => {
      if (r.perf_ms && r.perf_ms.length) updatePerf(r.perf_ms);
    });
  }, 2000);

  // ── Threshold Slider ───────────────────────────────────────────────────────
  thresholdSlider.addEventListener("input", () => {
    const val = parseInt(thresholdSlider.value);
    thresholdVal.textContent = val + "%";
    chrome.storage.local.set({ threshold: val / 100 }, () => reloadTab(300));
  });

  // ── Whitelist ──────────────────────────────────────────────────────────────
  addWhitelistBtn.addEventListener("click", addWhitelist);
  whitelistInput.addEventListener("keydown", e => { if (e.key === "Enter") addWhitelist(); });

  function addWhitelist() {
    const kw = whitelistInput.value.trim().toLowerCase();
    if (!kw) return;
    whitelistInput.value = "";
    chrome.storage.local.get("whitelist", (res) => {
      const list = res.whitelist || [];
      if (list.includes(kw)) return;
      list.push(kw);
      chrome.storage.local.set({ whitelist: list }, () => {
        renderWhitelist(list);
        reloadTab(200);
      });
    });
  }

  function removeWhitelist(kw) {
    chrome.storage.local.get("whitelist", (res) => {
      const list = (res.whitelist || []).filter(k => k !== kw);
      chrome.storage.local.set({ whitelist: list }, () => {
        renderWhitelist(list);
        reloadTab(200);
      });
    });
  }

  function renderWhitelist(list) {
    if (!whitelistList) return;
    whitelistList.innerHTML = "";
    if (!list.length) {
      whitelistList.innerHTML = '<li><span class="empty-msg">No whitelisted words yet</span></li>';
      return;
    }
    list.forEach(kw => {
      const li  = document.createElement("li");
      li.textContent = kw;
      const btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.textContent = "✕";
      btn.addEventListener("click", () => removeWhitelist(kw));
      li.appendChild(btn);
      whitelistList.appendChild(li);
    });
  }

  // ── View Report ────────────────────────────────────────────────────────────

  viewReportBtn.addEventListener("click", () => {
    chrome.storage.local.get(
      ["log_entries", "stat_total", "stat_aggressive"],
      (res) => {
        const entries  = res.log_entries     || [];
        const total    = res.stat_total      || 0;
        const agg      = res.stat_aggressive || 0;
        const safe     = Math.max(0, total - agg);
        const now      = new Date().toLocaleString();
        const platform = platformBadge.textContent || "Social Media";
        const aggRate  = total > 0 ? ((agg / total) * 100).toFixed(1) : "0";
        const aggCount  = entries.filter(e => e.is_aggressive).length;
        const safeCount = entries.filter(e => !e.is_aggressive).length;

        // Mode count
        const modeCount = {};
        entries.forEach(e => {
          const m = (e.mode || "hybrid").toUpperCase();
          modeCount[m] = (modeCount[m] || 0) + 1;
        });

        // Score buckets
        const buckets = [0,0,0,0,0];
        entries.forEach(e => {
          const s = (e.score||0)*100;
          if(s<=20) buckets[0]++; else if(s<=40) buckets[1]++;
          else if(s<=60) buckets[2]++; else if(s<=80) buckets[3]++; else buckets[4]++;
        });

        // Top words
        const wordCount = {};
        const stopwords = new Set(["the","a","an","is","are","was","were","i","you","he","she","it","we","they","and","or","but","in","on","at","to","of","for","with","this","that","my","your","his","her","our","their","have","has","be","do","did","will","would","could","should","not","no","so","if","as","by","from","up","just","more","very","so","too"]);
        entries.filter(e=>e.is_aggressive).forEach(e=>{
          (e.text||"").toLowerCase().split(/\s+/).forEach(w=>{
            w=w.replace(/[^a-z]/g,"");
            if(w.length>3&&!stopwords.has(w)) wordCount[w]=(wordCount[w]||0)+1;
          });
        });
        const topWords = Object.entries(wordCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
        const topWordsHtml = topWords.length===0
          ? '<p style="color:#9ca3af;font-style:italic;font-size:12px;padding:8px 0;">No aggressive content detected yet.</p>'
          : topWords.map(([w,c])=>'<div class="word-row"><span class="word-lbl">'+w+'</span><div class="word-bar-bg"><div class="word-bar" style="width:'+Math.round((c/(topWords[0][1]||1))*100)+'%"></div></div><span class="word-count">'+c+'x</span></div>').join("");

        // Table rows
        const tableRows = entries.length===0
          ? '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px;">No detections yet.</td></tr>'
          : [...entries].reverse().map((e,i)=>{
              const pct=((e.score||0)*100).toFixed(1);
              const txt=(e.text||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
              const w=Math.min(parseFloat(pct),100);
              return '<tr class="'+(e.is_aggressive?"row-agg":"row-safe")+'" data-status="'+(e.is_aggressive?"aggressive":"safe")+'">' +
                '<td>'+(entries.length-i)+'</td><td>'+(e.time||"")+'</td>' +
                '<td><span class="badge '+(e.is_aggressive?"badge-agg":"badge-safe")+'">'+(e.is_aggressive?"AGGRESSIVE":"SAFE")+'</span></td>' +
                '<td><span class="mode-tag">'+(e.mode||"hybrid").toUpperCase()+'</span></td>' +
                '<td><div class="score-wrap"><div class="score-bar-bg"><div class="score-bar-fill '+(e.is_aggressive?"fill-agg":"fill-safe")+'" style="width:'+w+'%"></div></div><span class="score-num">'+pct+'%</span></div></td>' +
                '<td>'+(e.ms||0)+'ms</td><td class="content-cell" title="'+txt+'">'+txt+'</td></tr>';
            }).join("");

        // Serialize data for inline script
        const donutData = JSON.stringify([agg, safe]);
        const modeLabels = JSON.stringify(Object.keys(modeCount));
        const modeValues = JSON.stringify(Object.values(modeCount));
        const bucketsJson = JSON.stringify(buckets);
        const aggRateNum = parseFloat(aggRate);

        const html =
'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>CAD Shield Report</title><style>' +
'*{box-sizing:border-box;margin:0;padding:0;}' +
'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f0f2f5;color:#1a1d23;padding:28px;max-width:1200px;margin:0 auto;}' +
'.header{background:linear-gradient(135deg,#1a6b3c,#145c32);color:#fff;border-radius:16px;padding:24px 32px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 20px rgba(26,107,60,.3);}' +
'.header-left{display:flex;align-items:center;gap:16px;}' +
'.logo{width:48px;height:48px;background:rgba(255,255,255,.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;}' +
'.header h1{font-size:22px;font-weight:800;}.header p{font-size:11px;opacity:.75;margin-top:4px;}' +
'.print-btn{background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.4);color:#fff;padding:10px 20px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;}' +
'.print-btn:hover{background:rgba(255,255,255,.25);}' +
'.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}' +
'.stat{background:#fff;border-radius:14px;padding:20px 16px;text-align:center;border:1.5px solid #eaecef;border-top:4px solid #eaecef;box-shadow:0 1px 4px rgba(0,0,0,.04);}' +
'.stat.s-total{border-top-color:#6b7280;}.stat.s-agg{border-top-color:#dc2626;}.stat.s-safe{border-top-color:#1a6b3c;}.stat.s-rate{border-top-color:#f59e0b;}' +
'.stat .num{font-size:36px;font-weight:800;line-height:1;margin-bottom:6px;}' +
'.stat.s-agg .num{color:#dc2626;}.stat.s-safe .num{color:#1a6b3c;}.stat.s-rate .num{color:#f59e0b;}' +
'.stat .lbl{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;font-weight:700;}' +
'.stat .sub{font-size:11px;color:#d1d5db;margin-top:3px;}' +
'.gauge-section{background:#fff;border-radius:14px;border:1.5px solid #eaecef;padding:20px 28px;margin-bottom:20px;display:flex;align-items:center;gap:28px;box-shadow:0 1px 4px rgba(0,0,0,.04);}' +
'.gauge-wrap{flex-shrink:0;text-align:center;}' +
'.gauge-num{font-size:26px;font-weight:800;margin-top:6px;}' +
'.gauge-info h3{font-size:16px;font-weight:700;margin-bottom:8px;}' +
'.gauge-info p{font-size:12px;color:#6b7280;line-height:1.7;}' +
'.gauge-verdict{display:inline-block;margin-top:10px;padding:5px 16px;border-radius:20px;font-size:12px;font-weight:800;letter-spacing:.5px;}' +
'.v-low{background:#dcfce7;color:#166534;}.v-med{background:#fef9c3;color:#854d0e;}.v-high{background:#fde8e8;color:#b91c1c;}.v-crit{background:#dc2626;color:#fff;}' +
'.charts-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:20px;}' +
'.chart-card{background:#fff;border-radius:14px;border:1.5px solid #eaecef;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.04);}' +
'.chart-title{font-size:10px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;}' +
'.chart-wrap{position:relative;height:170px;display:flex;align-items:center;justify-content:center;}' +
'.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;}' +
'.words-card{background:#fff;border-radius:14px;border:1.5px solid #eaecef;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.04);}' +
'.word-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}' +
'.word-row:last-child{margin-bottom:0;}' +
'.word-lbl{font-size:12px;font-weight:700;color:#374151;width:90px;flex-shrink:0;}' +
'.word-bar-bg{flex:1;height:10px;background:#f0f0f0;border-radius:20px;overflow:hidden;}' +
'.word-bar{height:100%;background:linear-gradient(90deg,#dc2626,#f97316);border-radius:20px;}' +
'.word-count{font-size:11px;font-weight:700;color:#dc2626;width:28px;text-align:right;flex-shrink:0;}' +
'.card{background:#fff;border-radius:14px;border:1.5px solid #eaecef;overflow:hidden;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.04);}' +
'.card-header{padding:14px 20px;background:#f8fafc;border-bottom:1px solid #eaecef;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;}' +
'.card-title{font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:1px;}' +
'.filters{display:flex;gap:8px;flex-wrap:wrap;}' +
'.filter-btn{padding:6px 16px;border-radius:20px;border:1.5px solid #e8eaed;background:#f9fafb;font-size:11px;font-weight:700;cursor:pointer;color:#6b7280;transition:all .15s;}' +
'.filter-btn.act-all{background:#1a1d23;border-color:#1a1d23;color:#fff;}' +
'.filter-btn.act-agg{background:#dc2626;border-color:#dc2626;color:#fff;}' +
'.filter-btn.act-safe{background:#1a6b3c;border-color:#1a6b3c;color:#fff;}' +
'table{width:100%;border-collapse:collapse;font-size:13px;}' +
'th{padding:11px 16px;background:#1a6b3c;color:#fff;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;text-align:left;}' +
'td{padding:10px 16px;border-bottom:1px solid #f5f5f5;vertical-align:middle;}' +
'tr:last-child td{border-bottom:none;}tr:hover td{background:rgba(0,0,0,.015);}' +
'.row-agg{background:#fff8f8;}.row-safe{background:#f8fff9;}' +
'.badge{font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;white-space:nowrap;letter-spacing:.5px;}' +
'.badge-agg{background:#fde8e8;color:#b91c1c;}.badge-safe{background:#dcfce7;color:#166534;}' +
'.mode-tag{font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;background:#f0f0f0;color:#6b7280;}' +
'.score-wrap{display:flex;align-items:center;gap:8px;}' +
'.score-bar-bg{flex:1;height:8px;background:#f0f0f0;border-radius:20px;overflow:hidden;min-width:70px;}' +
'.score-bar-fill{height:100%;border-radius:20px;}' +
'.fill-agg{background:linear-gradient(90deg,#dc2626,#ef4444);}.fill-safe{background:linear-gradient(90deg,#1a6b3c,#22c55e);}' +
'.score-num{font-size:11px;font-weight:800;min-width:38px;text-align:right;}' +
'.content-cell{max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151;font-size:12px;}' +
'.footer{text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;padding:16px;}' +
'@media print{body{background:#fff;padding:16px;max-width:none;}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact;}th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.filters,.print-btn{display:none;}}' +
'</style></head><body>' +

// Header
'<div class="header"><div class="header-left"><div class="logo">&#x1F6E1;</div><div><h1>CAD Shield &mdash; Detection Report</h1><p>Generated: '+now+' &bull; Platform: '+platform+' &bull; CAD Shield v1.0.0</p></div></div><button class="print-btn" onclick="window.print()">&#x1F5A8; Print / Save PDF</button></div>' +

// Stats
'<div class="stats">'+
'<div class="stat s-total"><div class="num">'+total+'</div><div class="lbl">Total Scanned</div><div class="sub">All text analyzed</div></div>'+
'<div class="stat s-agg"><div class="num">'+agg+'</div><div class="lbl">Blocked</div><div class="sub">Aggressive content</div></div>'+
'<div class="stat s-safe"><div class="num">'+safe+'</div><div class="lbl">Safe</div><div class="sub">Non-aggressive</div></div>'+
'<div class="stat s-rate"><div class="num">'+aggRate+'%</div><div class="lbl">Aggression Rate</div><div class="sub">of all scanned</div></div>'+
'</div>'+

// Gauge
'<div class="gauge-section">'+
'<div class="gauge-wrap"><canvas id="gaugeCanvas" width="160" height="100"></canvas><div class="gauge-num" id="gaugeNum">'+aggRate+'%</div></div>'+
'<div class="gauge-info"><h3>Toxicity Level</h3><p>Based on '+total+' scanned items on '+platform+'.<br>The aggression rate measures how much of the browsed content was flagged as cyber-aggressive.</p>'+
'<span class="gauge-verdict" id="gaugeVerdict"></span></div></div>'+

// Charts
'<div class="charts-grid">'+
'<div class="chart-card"><div class="chart-title">&#x25CF; Detection Overview</div><div class="chart-wrap"><canvas id="donutCanvas" width="300" height="170"></canvas></div></div>'+
'<div class="chart-card"><div class="chart-title">&#x25A0; Detections by Mode</div><div class="chart-wrap"><canvas id="barCanvas" width="300" height="170"></canvas></div></div>'+
'<div class="chart-card"><div class="chart-title">&#x25A0; Score Distribution</div><div class="chart-wrap"><canvas id="distCanvas" width="300" height="170"></canvas></div></div>'+
'</div>'+

// Two col
'<div class="two-col">'+
'<div class="words-card"><div class="chart-title">&#x1F525; Top Aggressive Words</div>'+topWordsHtml+'</div>'+
'<div class="words-card"><div class="chart-title">&#x1F4CB; Session Summary</div>'+
'<table style="font-size:13px;"><tbody>'+
'<tr><td style="padding:9px 0;color:#6b7280;border-bottom:1px solid #f5f5f5;width:140px;">Platform</td><td style="padding:9px 0;font-weight:700;border-bottom:1px solid #f5f5f5;">'+platform+'</td></tr>'+
'<tr><td style="padding:9px 0;color:#6b7280;border-bottom:1px solid #f5f5f5;">Active Mode</td><td style="padding:9px 0;font-weight:700;border-bottom:1px solid #f5f5f5;">'+(Object.keys(modeCount)[0]||"HYBRID")+'</td></tr>'+
'<tr><td style="padding:9px 0;color:#6b7280;border-bottom:1px solid #f5f5f5;">Threshold</td><td style="padding:9px 0;font-weight:700;border-bottom:1px solid #f5f5f5;">R-Score &ge; 0.5 (50%)</td></tr>'+
'<tr><td style="padding:9px 0;color:#6b7280;border-bottom:1px solid #f5f5f5;">Aggression Rate</td><td style="padding:9px 0;font-weight:800;color:#dc2626;border-bottom:1px solid #f5f5f5;">'+aggRate+'%</td></tr>'+
'<tr><td style="padding:9px 0;color:#6b7280;border-bottom:1px solid #f5f5f5;">Total Entries</td><td style="padding:9px 0;font-weight:700;border-bottom:1px solid #f5f5f5;">'+entries.length+'</td></tr>'+
'<tr><td style="padding:9px 0;color:#6b7280;">Report Time</td><td style="padding:9px 0;font-weight:700;">'+now+'</td></tr>'+
'</tbody></table></div></div>'+

// Table
'<div class="card"><div class="card-header"><span class="card-title">&#x1F4CB; Detection Log &mdash; '+entries.length+' entries</span>'+
'<div class="filters">'+
'<button class="filter-btn act-all" onclick="filterTable(\'all\',this)">All ('+entries.length+')</button>'+
'<button class="filter-btn" onclick="filterTable(\'aggressive\',this)">&#x1F534; Aggressive ('+aggCount+')</button>'+
'<button class="filter-btn" onclick="filterTable(\'safe\',this)">&#x1F7E2; Safe ('+safeCount+')</button>'+
'</div></div>'+
'<table><thead><tr><th>#</th><th>Time</th><th>Status</th><th>Mode</th><th>Score</th><th>Speed</th><th>Content</th></tr></thead>'+
'<tbody id="tableBody">'+tableRows+'</tbody></table></div>'+
'<div class="footer">Pamantasan ng Cabuyao &middot; College of Computing Studies &middot; BSCS Thesis 2026 &middot; CAD Shield v1.0.0</div>'+

'<script>' +
'function filterTable(s,b){document.querySelectorAll(".filter-btn").forEach(x=>{x.className="filter-btn";});b.className="filter-btn act-"+s;document.querySelectorAll("#tableBody tr").forEach(r=>{r.style.display=(s==="all"||r.dataset.status===s)?"":"none";});}' +

// Pure canvas charts - no CDN needed
'(function(){' +

// Gauge
'var gc=document.getElementById("gaugeCanvas");var gx=gc.getContext("2d");' +
'var rate='+aggRateNum+';var cx=80,cy=90,r=65;' +
'gx.beginPath();gx.arc(cx,cy,r,Math.PI,2*Math.PI);gx.strokeStyle="#f0f0f0";gx.lineWidth=14;gx.stroke();' +
'var color=rate<=20?"#1a6b3c":rate<=40?"#f59e0b":rate<=60?"#f97316":"#dc2626";' +
'var end=Math.PI+(rate/100)*Math.PI;' +
'gx.beginPath();gx.arc(cx,cy,r,Math.PI,end);gx.strokeStyle=color;gx.lineWidth=14;gx.lineCap="round";gx.stroke();' +
'document.getElementById("gaugeNum").style.color=color;' +
'var v=document.getElementById("gaugeVerdict");' +
'if(rate<=20){v.className="gauge-verdict v-low";v.textContent="Low Toxicity";}' +
'else if(rate<=40){v.className="gauge-verdict v-med";v.textContent="Moderate Toxicity";}' +
'else if(rate<=60){v.className="gauge-verdict v-high";v.textContent="High Toxicity";}' +
'else{v.className="gauge-verdict v-crit";v.textContent="Critical Toxicity";}' +

// Donut chart
'var dc=document.getElementById("donutCanvas");var dx=dc.getContext("2d");' +
'var dData='+donutData+';var dColors=["#dc2626","#1a6b3c"];var dTotal=dData[0]+dData[1];' +
'var dcx=dc.width/2,dcy=dc.height/2,dr=65,dIr=42;' +
'if(dTotal===0){dx.beginPath();dx.arc(dcx,dcy,dr,0,2*Math.PI);dx.strokeStyle="#f0f0f0";dx.lineWidth=23;dx.stroke();}' +
'else{var dStart=-Math.PI/2;' +
'dData.forEach(function(v,i){var slice=(v/dTotal)*2*Math.PI;dx.beginPath();dx.moveTo(dcx,dcy);dx.arc(dcx,dcy,dr,dStart,dStart+slice);dx.closePath();dx.fillStyle=dColors[i];dx.fill();dStart+=slice;});' +
'dx.beginPath();dx.arc(dcx,dcy,dIr,0,2*Math.PI);dx.fillStyle="#fff";dx.fill();}' +
'dx.font="bold 13px Arial";dx.fillStyle="#1a1d23";dx.textAlign="center";' +
'dx.fillText("'+agg+' Blocked",dcx,dcy-4);dx.fillText("'+safe+' Safe",dcx,dcy+14);' +
'dx.font="11px Arial";dx.fillStyle="#dc2626";dx.fillText("■ Aggressive",dcx-30,dc.height-8);' +
'dx.fillStyle="#1a6b3c";dx.fillText("■ Safe",dcx+30,dc.height-8);' +

// Bar chart by mode
'var bc=document.getElementById("barCanvas");var bx=bc.getContext("2d");' +
'var bLabels='+modeLabels+';var bValues='+modeValues+';var bColors=["#1a6b3c","#dc2626","#f59e0b","#6b7280"];' +
'var bMax=Math.max.apply(null,bValues.concat([1]));' +
'var bPad=30,bBottom=bc.height-30,bW=bc.width-bPad*2;' +
'var bBarW=Math.min(50,bW/Math.max(bLabels.length,1)-10);' +
'var bStep=bW/Math.max(bLabels.length,1);' +
'bx.strokeStyle="#f0f0f0";bx.lineWidth=1;' +
'for(var g=0;g<=4;g++){var gy=bPad+(bBottom-bPad)*g/4;bx.beginPath();bx.moveTo(bPad,gy);bx.lineTo(bc.width-bPad,gy);bx.stroke();bx.font="10px Arial";bx.fillStyle="#9ca3af";bx.textAlign="right";bx.fillText(Math.round(bMax*(1-g/4)),bPad-4,gy+3);}' +
'bLabels.forEach(function(l,i){var bh=bValues[i]>0?(bValues[i]/bMax)*(bBottom-bPad):0;var bx2=bPad+i*bStep+bStep/2-bBarW/2;var by2=bBottom-bh;bx.beginPath();bx.roundRect(bx2,by2,bBarW,bh,4);bx.fillStyle=bColors[i%bColors.length];bx.fill();bx.font="bold 10px Arial";bx.fillStyle="#1a1d23";bx.textAlign="center";bx.fillText(bValues[i],bx2+bBarW/2,by2-5);bx.font="bold 10px Arial";bx.fillStyle="#6b7280";bx.fillText(l,bx2+bBarW/2,bBottom+14);});' +

// Score distribution
'var sc=document.getElementById("distCanvas");var sx=sc.getContext("2d");' +
'var sBuckets='+bucketsJson+';var sLabels=["0-20%","21-40%","41-60%","61-80%","81-100%"];' +
'var sColors=["#22c55e","#86efac","#f59e0b","#f97316","#dc2626"];' +
'var sMax=Math.max.apply(null,sBuckets.concat([1]));' +
'var sPad=30,sBottom=sc.height-30,sW=sc.width-sPad*2;' +
'var sBarW=Math.min(40,sW/5-8);var sStep=sW/5;' +
'sx.strokeStyle="#f0f0f0";sx.lineWidth=1;' +
'for(var g=0;g<=4;g++){var gy=sPad+(sBottom-sPad)*g/4;sx.beginPath();sx.moveTo(sPad,gy);sx.lineTo(sc.width-sPad,gy);sx.stroke();sx.font="10px Arial";sx.fillStyle="#9ca3af";sx.textAlign="right";sx.fillText(Math.round(sMax*(1-g/4)),sPad-4,gy+3);}' +
'sBuckets.forEach(function(v,i){var bh=v>0?(v/sMax)*(sBottom-sPad):0;var bx2=sPad+i*sStep+sStep/2-sBarW/2;var by2=sBottom-bh;sx.beginPath();sx.roundRect(bx2,by2,sBarW,bh,4);sx.fillStyle=sColors[i];sx.fill();sx.font="bold 10px Arial";sx.fillStyle="#1a1d23";sx.textAlign="center";sx.fillText(v,bx2+sBarW/2,by2-5);sx.font="9px Arial";sx.fillStyle="#6b7280";sx.fillText(sLabels[i],bx2+sBarW/2,sBottom+14);});' +

'})();' +
'<' + '/script>' +
'</body></html>';

        const encoded = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        chrome.tabs.create({ url: encoded });
      }
    );
  });

});