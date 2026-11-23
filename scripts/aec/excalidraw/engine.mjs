import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  convertToExcalidrawElements,
  Excalidraw,
  exportToSvg,
  restoreElements,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

const PALETTE = {
  navy: '#102c47',
  green: '#286332',
  pale: '#eaf4ec',
};

const templates = {
  vistoria: ['Inspeção do pavimento', 'Registrar o indício', 'Definir a verificação'],
  frente: ['Liberar a frente', 'Executar a etapa', 'Conferir e registrar'],
  interface: ['Identificar a interface', 'Combinar o ajuste', 'Validar a revisão'],
};

const allowedTypes = new Set([
  'rectangle', 'diamond', 'ellipse', 'line', 'arrow', 'freedraw', 'text', 'frame',
]);
const MAX_ELEMENTS = 600;
const MAX_POINTS = 80000;
const UIOptions = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false,
    saveAsImage: false,
    toggleTheme: false,
  },
  tools: { image: false },
  welcomeScreen: false,
};

function sketchTemplate(name) {
  const steps = templates[name];
  if (!steps) return [];
  const elements = [];
  for (const [index, label] of steps.entries()) {
    const x = 30 + index * 242;
    elements.push({
      type: 'rectangle', x, y: 90, width: 190, height: 72,
      strokeColor: PALETTE.green, backgroundColor: PALETTE.pale, fillStyle: 'solid', roughness: 0,
      label: { text: label, fontSize: 16, strokeColor: PALETTE.navy },
    });
    if (index < steps.length - 1) {
      elements.push({
        type: 'arrow', x: x + 194, y: 126, width: 43, height: 0,
        points: [[0, 0], [43, 0]], strokeColor: PALETTE.navy, roughness: 0,
      });
    }
  }
  return convertToExcalidrawElements(elements);
}

function importedElements(document) {
  if (document?.type !== 'excalidraw' || !Array.isArray(document.elements)
      || document.elements.length > MAX_ELEMENTS || Object.keys(document.files ?? {}).length) {
    throw new Error('Abra um croqui compatível, com até 600 elementos vetoriais.');
  }
  let pointCount = 0;
  const vectorElements = document.elements.map(element => {
    if (!allowedTypes.has(element?.type)
        || !Number.isFinite(element.x) || !Number.isFinite(element.y)
        || !Number.isFinite(element.width) || !Number.isFinite(element.height)
        || Math.max(Math.abs(element.x), Math.abs(element.y), Math.abs(element.width), Math.abs(element.height)) > 100000
        || (element.text != null && (typeof element.text !== 'string' || element.text.length > 10000))) {
      throw new Error('O arquivo contém um elemento que este editor não abre.');
    }
    if (element.points != null) {
      if (!Array.isArray(element.points) || (pointCount += element.points.length) > MAX_POINTS
          || element.points.some(point => !Array.isArray(point) || point.length !== 2
            || point.some(coordinate => !Number.isFinite(coordinate) || Math.abs(coordinate) > 100000))) {
        throw new Error('O traçado excede o limite destes croquis.');
      }
    }
    return { ...element, link: null };
  });
  return restoreElements(vectorElements, null, { repairBindings: true, refreshDimensions: true });
}

export function startEditor(container, onChange) {
  const root = createRoot(container);
  return new Promise(resolve => {
    root.render(React.createElement(Excalidraw, {
      langCode: 'pt-BR',
      theme: 'light',
      name: 'Croqui de obra',
      UIOptions,
      validateEmbeddable: false,
      onChange,
      excalidrawAPI(api) {
        const readScene = () => api.getSceneElements().filter(element => !element.isDeleted);
        const showScene = elements => {
          api.updateScene({ elements });
          if (elements.length) api.scrollToContent(elements, { fitToContent: true, animate: false });
        };
        resolve({
          loadTemplate(name) {
            showScene(sketchTemplate(name));
          },
          openFile(document) {
            showScene(importedElements(document));
          },
          nativeFile() {
            return serializeAsJSON(readScene(), api.getAppState(), {}, 'local');
          },
          async svgFile() {
            const svg = await exportToSvg({
              elements: readScene(), files: {}, skipInliningFonts: true,
              appState: { ...api.getAppState(), exportBackground: true },
            });
            return new XMLSerializer().serializeToString(svg);
          },
        });
      },
    }));
  });
}
