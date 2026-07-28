/**
 * background.js — handles tab reload requests from popup
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["enabled", "mode"], (res) => {
    if (res.enabled === undefined) chrome.storage.local.set({ enabled: true });
    if (!res.mode)                 chrome.storage.local.set({ mode: "hybrid" });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Reload the active tab (called by popup)
  if (msg.type === "RELOAD_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id, {}, () => {
          sendResponse({ ok: true });
        });
      }
    });
    return true; // keep channel open for async
  }

  // Badge update from content.js
  if (msg.type === "AGGRESSIVE_FOUND") {
    // Wait 400ms for content.js logResult to finish writing stat_aggressive
    setTimeout(() => {
      chrome.storage.local.get("stat_aggressive", (res) => {
        const count = (res.stat_aggressive || 0);
        if (sender.tab) {
          chrome.action.setBadgeText({ text: count > 0 ? String(count) : "", tabId: sender.tab.id });
          chrome.action.setBadgeBackgroundColor({ color: "#e74c3c" });
        }
      });
    }, 400);
    sendResponse({ ok: true });
    return true;
  }

  // Clear badge
  if (msg.type === "CLEAR_BADGE") {
    if (sender.tab) chrome.action.setBadgeText({ text: "", tabId: sender.tab.id });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});

// When the user switches tabs — clear shared log and ask the new tab to push its data
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.storage.local.set({ log_entries: [], stat_total: 0, stat_aggressive: 0 });
  chrome.action.setBadgeText({ text: "", tabId });
  chrome.tabs.sendMessage(tabId, { type: "TAB_ACTIVATED" }, () => {
    if (chrome.runtime.lastError) {} // tab may not have a content script — that's fine
  });
});