(function () {
  "use strict";

  const status = document.getElementById("viewer-status");
  const renderArea = document.getElementById("potree-render-area");
  const fitButton = document.getElementById("fit-view");
  const colorButton = document.getElementById("toggle-color");
  const boxButton = document.getElementById("toggle-box");
  const measureButton = document.getElementById("measure-distance");
  const clearButton = document.getElementById("clear-measures");
  const startButton = document.getElementById("abrir-nuvem");
  const toolbar = document.getElementById("cloud-tools");

  if (!window.Potree || !window.jQuery || !window.TWEEN) {
    status.textContent = "Não foi possível iniciar o visualizador local.";
    status.dataset.mode = "error";
    return;
  }

  const viewer = new Potree.Viewer(renderArea);
  renderArea.addEventListener("contextmenu", event => event.preventDefault());
  viewer.setEDLEnabled(false);
  viewer.setFOV(60);
  viewer.setPointBudget(100000);
  viewer.setShowBoundingBox(false);
  viewer.setBackground("black");
  viewer.setDescription("");
  window.confengePotreeViewer = viewer;

  let pointCloud = null;
  let elevationMode = false;
  let boxVisible = false;

  function addReferenceMeasurement() {
    const measurement = new Potree.Measure();
    measurement.name = "Referência A–B (10,00 m)";
    measurement.showDistances = true;
    measurement.showCoordinates = false;
    measurement.showEdges = true;
    measurement.closed = false;
    const first = pointCloud.position.clone().set(1, 1, 0);
    const second = pointCloud.position.clone().set(11, 1, 0);
    measurement.addMarker(first);
    measurement.addMarker(second);
    viewer.scene.addMeasurement(measurement);
  }

  function updateStatus(message, mode) {
    status.textContent = message;
    if (mode) status.dataset.mode = mode;
    else delete status.dataset.mode;
  }

  Potree.loadPointCloud("fixture/cloud.js", "Amostra sintética CONFENGE", function (event) {
    if (!event || !event.pointcloud) {
      updateStatus("A nuvem de demonstração não pôde ser carregada.", "error");
      return;
    }
    pointCloud = event.pointcloud;
    pointCloud.material.size = 2;
    pointCloud.material.pointSizeType = Potree.PointSizeType.FIXED;
    pointCloud.material.activeAttributeName = "rgba";
    viewer.scene.addPointCloud(pointCloud);
    viewer.fitToScreen(1.05, 0);
    addReferenceMeasurement();
    toolbar.hidden = false;
    startButton.hidden = true;
    renderArea.dataset.ready = "true";
    renderArea.dispatchEvent(new Event("nuvem-pronta", { bubbles: true }));
    updateStatus("Demonstração carregada: 2.242 pontos, unidade metro. A referência A–B mede 10,00 m.");
    renderArea.focus({ preventScroll: true });
  });

  fitButton.addEventListener("click", function () {
    if (!pointCloud) return;
    viewer.fitToScreen(1.05, 300);
    updateStatus("Nuvem enquadrada na área de visualização.");
  });

  colorButton.addEventListener("click", function () {
    if (!pointCloud) return;
    elevationMode = !elevationMode;
    pointCloud.material.activeAttributeName = elevationMode ? "elevation" : "rgba";
    colorButton.setAttribute("aria-pressed", String(elevationMode));
    colorButton.textContent = elevationMode ? "Usar cores da nuvem" : "Colorir por elevação";
    updateStatus(elevationMode ? "Coloração por elevação ativada." : "Cores originais da amostra restauradas.");
  });

  boxButton.addEventListener("click", function () {
    boxVisible = !boxVisible;
    viewer.setShowBoundingBox(boxVisible);
    boxButton.setAttribute("aria-pressed", String(boxVisible));
    boxButton.textContent = boxVisible ? "Ocultar caixa" : "Mostrar caixa";
    updateStatus(boxVisible ? "Caixa envolvente de 12 × 8 × 4 m exibida." : "Caixa envolvente ocultada.");
  });

  measureButton.addEventListener("click", function () {
    if (!pointCloud) return;
    viewer.measuringTool.startInsertion({
      name: "Distância",
      showDistances: true,
      showCoordinates: true,
      showArea: false,
      closed: false,
      maxMarkers: 2
    });
    updateStatus("Medição ativa: selecione dois pontos na nuvem. Pressione Esc para cancelar.");
    renderArea.focus({ preventScroll: true });
  });

  clearButton.addEventListener("click", function () {
    viewer.dispatchEvent({ type: "cancel_insertions" });
    viewer.scene.removeAllMeasurements();
    updateStatus("Medições removidas. Use “Medir distância” para iniciar outra.");
  });

  renderArea.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      viewer.dispatchEvent({ type: "cancel_insertions" });
      updateStatus("Inserção de medição cancelada.");
    }
  });
})();
