// web/src/utils/proceduralTextures.js
//
// Small procedurally-generated canvas textures — no external image assets
// needed. Draws onto an offscreen <canvas> and returns a ready-to-use
// THREE.CanvasTexture. Browser-only (uses `document`), which is fine since
// HouseExplorer is mounted with client:only="react".

import * as THREE from 'three';

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const clamp = (v) => Math.min(255, Math.max(0, v));

  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0x00ff) + amt);
  const b = clamp((num & 0x0000ff) + amt);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// The setup and teardown every texture function here shares: a blank
// square canvas to draw on, and wrapping the result into a tiling
// THREE.CanvasTexture once drawing is done.
function createCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function finalizeTexture(canvas, repeatX, repeatY) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

// A staggered shingle/shake pattern in the given base color, with alternating
// rows shaded slightly darker for tonal variation, like a real roof.
export function createShingleTexture(baseColor, { rows = 6, cols = 8, size = 256, repeatX = 4, repeatY = 2 } = {}) {
  const { canvas, ctx } = createCanvas(size);

  const cellW = size / cols;
  const cellH = size / rows;
  const darker = shadeColor(baseColor, -10);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;

  for (let row = 0; row < rows; row++) {
    ctx.fillStyle = row % 2 === 0 ? baseColor : darker;
    ctx.fillRect(0, row * cellH, size, cellH);

    const offset = (row % 2) * (cellW / 2); // stagger alternate rows like real shingles
    for (let col = -1; col <= cols; col++) {
      ctx.strokeRect(col * cellW + offset, row * cellH, cellW, cellH);
    }
  }

  return finalizeTexture(canvas, repeatX, repeatY);
}

// A mottled grass texture: a base green fill with many short randomly
// angled "blade" strokes in slightly darker/lighter shades scattered across
// it, so it reads as textured ground rather than a flat color once tiled.
export function createGrassTexture(baseColor, { size = 256, blades = 2200, repeat = 20 } = {}) {
  const { canvas, ctx } = createCanvas(size);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const darker = shadeColor(baseColor, -18);
  const lighter = shadeColor(baseColor, 14);

  for (let i = 0; i < blades; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 2 + Math.random() * 4;
    // mostly-vertical blades with a little sideways lean, not perfectly uniform
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;

    ctx.strokeStyle = Math.random() > 0.5 ? darker : lighter;
    ctx.lineWidth = 0.6 + Math.random() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  return finalizeTexture(canvas, repeat, repeat);
}