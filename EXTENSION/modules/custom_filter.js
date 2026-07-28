/**
 * modules/custom_filter.js
 * Manages user-defined custom keywords (blocklist).
 * Any text containing these words is immediately flagged as aggressive.
 */

const CustomFilter = (() => {
  let _keywords = [];

  async function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get("custom_keywords", (result) => {
        _keywords = result.custom_keywords || [];
        resolve(_keywords);
      });
    });
  }

  /**
   * Returns true if text contains any custom keyword
   * Checks whole words only to avoid partial matches
   */
  function matches(text) {
    if (!text || _keywords.length === 0) return false;
    const lower = text.toLowerCase();
    return _keywords.some(kw => {
      if (!kw) return false;
      // Check if keyword exists as whole word or substring
      return lower.includes(kw.toLowerCase());
    });
  }

  async function add(keyword) {
    keyword = keyword.trim().toLowerCase();
    if (keyword && !_keywords.includes(keyword)) {
      _keywords.push(keyword);
      await _save();
      console.log("[CustomFilter] Added keyword:", keyword);
      console.log("[CustomFilter] All keywords:", _keywords);
    }
  }

  async function remove(keyword) {
    _keywords = _keywords.filter(k => k !== keyword.toLowerCase());
    await _save();
    console.log("[CustomFilter] Removed keyword:", keyword);
  }

  function getAll() {
    return [..._keywords];
  }

  function _save() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ custom_keywords: _keywords }, () => {
        console.log("[CustomFilter] Saved keywords:", _keywords);
        resolve();
      });
    });
  }

  // Sync when changed from popup
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.custom_keywords) {
      _keywords = changes.custom_keywords.newValue || [];
      console.log("[CustomFilter] Keywords updated:", _keywords);
    }
  });

  return { load, matches, add, remove, getAll };
})();