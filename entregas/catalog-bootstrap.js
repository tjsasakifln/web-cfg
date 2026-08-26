(() => {
  "use strict";

  const catalog = document.querySelector("#indice-integral");
  if (!catalog) return;
  const hashTarget = (value) => {
    const id = String(value || "").replace(/^#/, "");
    if (!id) return null;
    try {
      return document.getElementById(decodeURIComponent(id));
    } catch {
      return null;
    }
  };

  let requested = false;
  function loadCatalog() {
    if (requested) return;
    requested = true;

    const stylesheet = document.createElement("link");
    stylesheet.dataset.catalogCss = "";
    stylesheet.href = "/entregas/catalog.css";
    stylesheet.rel = "stylesheet";
    document.head.append(stylesheet);

    const data = document.createElement("script");
    data.src = "/entregas/catalog-data.js";
    data.fetchPriority = "low";
    data.addEventListener("load", () => {
      const behavior = document.createElement("script");
      behavior.src = "/entregas/catalog.js";
      behavior.fetchPriority = "low";
      document.body.append(behavior);
    }, { once: true });
    document.body.append(data);
  }

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    const target = hashTarget(anchor.getAttribute("href"));
    if (target && catalog.contains(target)) loadCatalog();
  }, { capture: true });

  if (location.hash) {
    const target = hashTarget(location.hash);
    if (target && catalog.contains(target)) loadCatalog();
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        loadCatalog();
      }
    }, { rootMargin: "1200px 0px" });
    observer.observe(catalog);
  } else {
    window.addEventListener("scroll", loadCatalog, { once: true, passive: true });
  }
})();
