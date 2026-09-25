import * as THREE from 'three';

/**
 * Procedurally generated particle texture atlas (4x4 cells, 128px each).
 * Everything is drawn in white/greyscale so particles can be tinted to any color.
 */
export const TEX = {
  glow: 0,
  spark: 1,
  ring: 2,
  smoke: 3,
  flame: 4,
  drop: 5,
  leaf: 6,
  shard: 7,
  bubble: 8,
  streak: 9,
  star: 10,
  feather: 11,
  rock: 12,
  zzz: 13,
  wisp: 14,
  dot: 15,
} as const;
export type TexName = keyof typeof TEX;

const CELL = 128;
let atlas: THREE.CanvasTexture | null = null;

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function particleAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = c.height = CELL * 4;
  const g = c.getContext('2d')!;
  const cell = (i: number, draw: (g: CanvasRenderingContext2D) => void) => {
    g.save();
    g.translate((i % 4) * CELL, Math.floor(i / 4) * CELL);
    g.beginPath();
    g.rect(0, 0, CELL, CELL);
    g.clip();
    draw(g);
    g.restore();
  };
  const radial = (g: CanvasRenderingContext2D, stops: [number, string][], r = 64) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, r);
    stops.forEach(([o, col]) => grd.addColorStop(o, col));
    g.fillStyle = grd;
    g.fillRect(0, 0, CELL, CELL);
  };

  cell(TEX.glow, (g) => radial(g, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.7)'], [0.6, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]));
  cell(TEX.spark, (g) => {
    radial(g, [[0, 'rgba(255,255,255,1)'], [0.15, 'rgba(255,255,255,0.8)'], [0.4, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]);
    g.fillStyle = 'white';
    for (const rot of [0, Math.PI / 2]) {
      g.save();
      g.translate(64, 64);
      g.rotate(rot);
      g.beginPath();
      g.moveTo(-62, 0);
      g.quadraticCurveTo(0, -5, 62, 0);
      g.quadraticCurveTo(0, 5, -62, 0);
      g.fill();
      g.restore();
    }
  });
  cell(TEX.ring, (g) => {
    g.strokeStyle = 'white';
    g.lineWidth = 7;
    g.shadowColor = 'white';
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
  });
  cell(TEX.smoke, (g) => {
    const r = rng(3);
    for (let i = 0; i < 26; i++) {
      const x = 64 + (r() - 0.5) * 60;
      const y = 64 + (r() - 0.5) * 60;
      const rad = 14 + r() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, CELL, CELL);
    }
  });
  cell(TEX.flame, (g) => {
    const grd = g.createRadialGradient(64, 80, 2, 64, 70, 58);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(64, 4);
    g.bezierCurveTo(100, 50, 112, 90, 64, 124);
    g.bezierCurveTo(16, 90, 28, 50, 64, 4);
    g.fill();
  });
  cell(TEX.drop, (g) => {
    const grd = g.createRadialGradient(56, 78, 2, 64, 72, 44);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0.2)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(64, 10);
    g.bezierCurveTo(90, 50, 104, 76, 64, 116);
    g.bezierCurveTo(24, 76, 38, 50, 64, 10);
    g.fill();
  });
  cell(TEX.leaf, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(64, 8);
    g.quadraticCurveTo(118, 64, 64, 120);
    g.quadraticCurveTo(10, 64, 64, 8);
    g.fill();
    g.strokeStyle = 'rgba(160,160,160,1)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64, 14);
    g.lineTo(64, 116);
    g.stroke();
  });
  cell(TEX.shard, (g) => {
    const grd = g.createLinearGradient(30, 0, 98, 128);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(200,200,200,0.6)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(64, 2);
    g.lineTo(92, 70);
    g.lineTo(64, 126);
    g.lineTo(38, 64);
    g.closePath();
    g.fill();
    g.strokeStyle = 'white';
    g.lineWidth = 3;
    g.stroke();
  });
  cell(TEX.bubble, (g) => {
    radial(g, [[0, 'rgba(255,255,255,0.05)'], [0.75, 'rgba(255,255,255,0.15)'], [0.92, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']], 58);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(46, 42, 12, 7, -0.6, 0, Math.PI * 2);
    g.fill();
  });
  cell(TEX.streak, (g) => {
    const grd = g.createLinearGradient(0, 64, 128, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(64, 64, 62, 7, 0, 0, Math.PI * 2);
    g.fill();
  });
  cell(TEX.star, (g) => {
    radial(g, [[0, 'rgba(255,255,255,0.8)'], [0.5, 'rgba(255,255,255,0.1)'], [1, 'rgba(255,255,255,0)']]);
    g.fillStyle = 'white';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 56 : 22;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  cell(TEX.feather, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(64, 6);
    g.bezierCurveTo(100, 40, 92, 96, 64, 122);
    g.bezierCurveTo(40, 96, 30, 40, 64, 6);
    g.fill();
    g.strokeStyle = 'rgba(170,170,170,1)';
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const y = 22 + i * 10;
      g.beginPath();
      g.moveTo(64, y + 8);
      g.lineTo(44, y);
      g.moveTo(64, y + 8);
      g.lineTo(84, y);
      g.stroke();
    }
  });
  cell(TEX.rock, (g) => {
    const r = rng(11);
    g.fillStyle = 'rgba(235,235,235,1)';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rad = 38 + r() * 20;
      g.lineTo(64 + Math.cos(a) * rad, 64 + Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(150,150,150,1)';
    g.beginPath();
    g.moveTo(64, 64);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.15 + (i / 4) * Math.PI * 0.8;
      g.lineTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50);
    }
    g.fill();
  });
  cell(TEX.zzz, (g) => {
    g.fillStyle = 'white';
    g.font = 'bold 96px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Z', 64, 68);
  });
  cell(TEX.wisp, (g) => {
    const r = rng(21);
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const x = 64 + Math.sin(t * 9) * 22 * (1 - t);
      const y = 118 - t * 108;
      const rad = 22 * (1 - t) + 4;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(255,255,255,${0.35 + r() * 0.1})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, CELL, CELL);
    }
  });
  cell(TEX.dot, (g) => radial(g, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,1)'], [0.62, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']], 40));

  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  return atlas;
}
