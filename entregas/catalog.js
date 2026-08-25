(() => {
  "use strict";
  const select = document.querySelector('#captura-entregas select[name="deliverable_id"]');
  if (!select) return;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest('a[data-deliverable-id][href="#captura-entregas"]');
    if (!trigger) return;
    const deliverableId = trigger.getAttribute("data-deliverable-id") || "";
    if ([...select.options].some((option) => option.value === deliverableId && !option.disabled)) {
      select.value = deliverableId;
    }
  });
})();
