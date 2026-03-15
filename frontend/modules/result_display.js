/**
 * modules/result_display.js
 * Blur/reveal — strictly ONE button per element, ever.
 */

const ResultDisplay = (() => {

  function blur(el, score) {
    // If already blurred, do nothing
    if (el.classList.contains("cad-blurred")) return;

    el.classList.add("cad-blurred");

    // Remove any stale reveal button that may already be next to this element
    const existing = el.nextElementSibling;
    if (existing && existing.classList.contains("cad-reveal-btn")) {
      existing.remove();
    }

    // Click the blurred text itself to reveal
    el.addEventListener("click", () => reveal(el), { once: true });

    // Add exactly ONE reveal button
    const btn       = document.createElement("button");
    btn.className   = "cad-reveal-btn";
    btn.textContent = "Reveal";
    btn.title       = `Aggression score: ${(score * 100).toFixed(0)}%`;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      reveal(el);
      btn.remove();
    });

    el.insertAdjacentElement("afterend", btn);
  }

  function reveal(el) {
    el.classList.remove("cad-blurred");
    el.classList.add("cad-revealed");
    // Remove outline after 3s
    setTimeout(() => el.classList.remove("cad-revealed"), 3000);
  }

  return { blur, reveal };
})();