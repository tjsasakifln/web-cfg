(() => {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const groups = document.querySelectorAll(".desktop-nav details[data-nav-group], .pp-nav details[data-nav-group]");

  for (const group of groups) {
    const summary = group.querySelector(":scope > summary");
    const panel = group.querySelector(":scope > .nav-panel");
    let openedByHover = false;
    let closeTimer;

    group.addEventListener("toggle", () => {
      if (!group.open) openedByHover = false;
    });
    group.addEventListener("pointerenter", event => {
      clearTimeout(closeTimer);
      if (event.pointerType !== "mouse" || group.open) return;
      openedByHover = true;
      group.open = true;
    });
    group.addEventListener("pointerleave", event => {
      if (event.pointerType !== "mouse" || !openedByHover) return;
      closeTimer = setTimeout(() => {
        if (openedByHover && !panel?.contains(document.activeElement)) group.open = false;
      }, 150);
    });
    summary?.addEventListener("click", event => {
      if (event.detail === 0 || !openedByHover) return;
      event.preventDefault();
      openedByHover = false;
    });
  }
})();
