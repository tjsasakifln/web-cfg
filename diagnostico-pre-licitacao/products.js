(() => {
  "use strict";
  const form = document.querySelector("#captura-licitacao form");
  const select = form?.querySelector('select[name="deliverable_id"]');
  if (!form || !select) return;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest('a[data-deliverable-id][href="#captura-licitacao"]');
    if (!trigger) return;
    const id = trigger.getAttribute("data-deliverable-id") || "";
    if ([...select.options].some((option) => option.value === id)) select.value = id;
  });
})();
