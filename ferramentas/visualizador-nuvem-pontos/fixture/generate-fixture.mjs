import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(fixtureDir, "data", "r");
const scale = 0.001;
const points = [];

function addPoint(x, y, z, color) {
  points.push({ x, y, z, color });
}

// Plataforma horizontal de 12 m x 8 m, em malha regular de 0,25 m.
for (let xi = 0; xi <= 48; xi += 1) {
  for (let yi = 0; yi <= 32; yi += 1) {
    addPoint(xi / 4, yi / 4, 0, [53, 166, 139, 255]);
  }
}

// Plano inclinado demonstrativo, entre x=2 m e x=10 m.
for (let xi = 8; xi <= 40; xi += 1) {
  for (let yi = 8; yi <= 24; yi += 1) {
    const x = xi / 4;
    addPoint(x, yi / 4, 1 + (x - 2) / 4, [244, 181, 64, 255]);
  }
}

// Quatro réguas verticais de 4 m conferem a dimensão Z da caixa envolvente.
for (const [x, y] of [[0, 0], [12, 0], [12, 8], [0, 8]]) {
  for (let zi = 1; zi <= 16; zi += 1) {
    addPoint(x, y, zi / 4, [91, 143, 249, 255]);
  }
}

await mkdir(rootDir, { recursive: true });

const cloud = {
  version: "1.7",
  octreeDir: "data",
  projection: "",
  points: points.length,
  boundingBox: { lx: 0, ly: 0, lz: 0, ux: 12, uy: 8, uz: 4 },
  tightBoundingBox: { lx: 0, ly: 0, lz: 0, ux: 12, uy: 8, uz: 4 },
  pointAttributes: ["POSITION_CARTESIAN", "COLOR_PACKED"],
  spacing: 0.25,
  scale,
  hierarchyStepSize: 5
};
await writeFile(join(fixtureDir, "cloud.js"), `${JSON.stringify(cloud, null, 2)}\n`, "utf8");

const binary = Buffer.alloc(points.length * 16);
for (let index = 0; index < points.length; index += 1) {
  const point = points[index];
  const offset = index * 16;
  binary.writeUInt32LE(Math.round(point.x / scale), offset);
  binary.writeUInt32LE(Math.round(point.y / scale), offset + 4);
  binary.writeUInt32LE(Math.round(point.z / scale), offset + 8);
  for (let channel = 0; channel < 4; channel += 1) {
    binary.writeUInt8(point.color[channel], offset + 12 + channel);
  }
}
await writeFile(join(rootDir, "r.bin"), binary);

const hierarchy = Buffer.alloc(5);
hierarchy.writeUInt8(0, 0);
hierarchy.writeUInt32LE(points.length, 1);
await writeFile(join(rootDir, "r.hrc"), hierarchy);

process.stdout.write(`Fixture gerada: ${points.length} pontos, ${binary.length} bytes.\n`);
