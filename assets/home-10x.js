/* Home 10x — exclusive to /. Evidence tabs stay in nav.js (script.js). */
(function () {
  const root = document.body;
  if (!root || root.getAttribute("data-content-cluster") !== "home") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.setAttribute("data-home-reduced-motion", "true");
  }
  root.setAttribute("data-home-10x", "ready");
})();
