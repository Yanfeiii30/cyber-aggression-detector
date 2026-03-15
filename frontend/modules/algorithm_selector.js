/**
 * modules/algorithm_selector.js
 * Reads and stores the user's chosen detection algorithm.
 * Options: "hybrid" | "nb" | "vader"
 * Default: "hybrid"
 */

const AlgorithmSelector = (() => {
  let _mode = "hybrid";

  async function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get("mode", (result) => {
        _mode = result.mode || "hybrid";
        resolve(_mode);
      });
    });
  }

  function get() {
    return _mode;
  }

  async function set(value) {
    _mode = value;
    return new Promise((resolve) => {
      chrome.storage.local.set({ mode: value }, resolve);
    });
  }

  // Listen for changes from popup
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.mode) {
      _mode = changes.mode.newValue;
    }
  });

  return { load, get, set };
})();