import * as THREE from 'three';
import { mulberry32 } from './storyState';

/**
 * Procedurally generated textures (no downloaded image files):
 * hammered-brass normal/roughness, engraved bands, biryani surface, steam, dust, dough, charcoal.
 * Generated once and cached — Three.js can share texture objects across renderers.
 */
const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/** Tileable value noise */
function makeNoise(size: number, cells: number, seed: number) {
  const rand = mulberry32(seed);
  const lattice = Array.from({ length: cells * cells }, () => rand());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const at = (i: number, j: number) => lattice[((j + cells) % cells) * cells + ((i + cells) % cells)];
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export interface HammeredMaps {
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
  color: THREE.DataTexture;
}

export const hammeredMaps = (): HammeredMaps =>
  once('hammered', () => {
    const size = 512;
    const rand = mulberry32(1337);
    const h = new Float32Array(size * size);
    const count = 900;
    for (let i = 0; i < count; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const r = size * (0.018 + rand() * 0.022);
      const depth = 0.45 + rand() * 0.35;
      const r2 = r * r;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x - cx;
          const dy = y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          const v = -depth * (1 - d2 / r2);
          const idx = ((y + size) % size) * size + ((x + size) % size);
          if (v < h[idx]) h[idx] = v;
        }
      }
    }
    const patina = makeNoise(size, 8, 99);
    const fine = makeNoise(size, 64, 7);
    const n = new Uint8Array(size * size * 4);
    const rgh = new Uint8Array(size * size * 4);
    const col = new Uint8Array(size * size * 4);
    const k = 7;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const hl = h[y * size + ((x - 1 + size) % size)];
        const hr = h[y * size + ((x + 1) % size)];
        const hu = h[((y - 1 + size) % size) * size + x];
        const hd = h[((y + 1) % size) * size + x];
        let nx = (hl - hr) * k;
        let ny = (hu - hd) * k;
        let nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;
        n[i * 4] = (nx * 0.5 + 0.5) * 255;
        n[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
        n[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
        n[i * 4 + 3] = 255;
        const rough = 0.2 + 0.18 * -h[i] + 0.22 * patina[i] + 0.06 * fine[i];
        const rv = Math.min(255, Math.max(0, rough * 255));
        rgh[i * 4] = rv;
        rgh[i * 4 + 1] = rv;
        rgh[i * 4 + 2] = rv;
        rgh[i * 4 + 3] = 255;
        const shade = 0.72 + 0.28 * (1 + h[i] * 0.35) - patina[i] * 0.12;
        const cv = Math.min(255, Math.max(0, shade * 255));
        col[i * 4] = cv;
        col[i * 4 + 1] = cv * 0.97;
        col[i * 4 + 2] = cv * 0.9;
        col[i * 4 + 3] = 255;
      }
    }
    const mk = (data: Uint8Array, srgb = false) => {
      const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 4;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { normal: mk(n), roughness: mk(rgh), color: mk(col, true) };
  });

/** Ornamental engraved band (arches, paisley, beads) used as bump + colour multiplier. */
export const engravingMaps = () =>
  once('engraving', () => {
    const [c, g] = canvas(1024, 128);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 1024, 128);
    g.strokeStyle = '#000';
    g.fillStyle = '#000';
    g.lineCap = 'round';
    g.lineWidth = 3;
    // borders
    [10, 118].forEach((y) => {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1024, y);
      g.stroke();
    });
    for (let x = 6; x < 1024; x += 14) {
      g.beginPath();
      g.arc(x, 20, 2.6, 0, Math.PI * 2);
      g.arc(x, 108, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    const tiles = 8;
    const tw = 1024 / tiles;
    for (let i = 0; i < tiles; i++) {
      const cx = i * tw + tw / 2;
      g.lineWidth = 3;
      // onion-dome arch
      g.beginPath();
      g.moveTo(cx - 44, 100);
      g.lineTo(cx - 44, 64);
      g.bezierCurveTo(cx - 44, 44, cx - 16, 44, cx, 28);
      g.bezierCurveTo(cx + 16, 44, cx + 44, 44, cx + 44, 64);
      g.lineTo(cx + 44, 100);
      g.stroke();
      // inner paisley
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(cx, 50);
      g.bezierCurveTo(cx + 22, 62, cx + 18, 92, cx, 92);
      g.bezierCurveTo(cx - 18, 92, cx - 20, 72, cx - 6, 66);
      g.bezierCurveTo(cx + 2, 62, cx + 4, 56, cx, 50);
      g.stroke();
      g.beginPath();
      g.arc(cx, 78, 5, 0, Math.PI * 2);
      g.stroke();
      // connecting vines
      g.beginPath();
      g.moveTo(cx + 44, 82);
      g.quadraticCurveTo(cx + tw / 2, 60, cx + tw - 44, 82);
      g.stroke();
      g.beginPath();
      g.arc(cx + tw / 2, 92, 4, 0, Math.PI * 2);
      g.fill();
    }
    const bump = new THREE.CanvasTexture(c);
    bump.wrapS = THREE.RepeatWrapping;
    bump.anisotropy = 4;
    // colour multiplier: lines become darker, background stays white
    const [c2, g2] = canvas(1024, 128);
    g2.fillStyle = '#fff';
    g2.fillRect(0, 0, 1024, 128);
    g2.globalAlpha = 0.55;
    g2.drawImage(c, 0, 0);
    const color = new THREE.CanvasTexture(c2);
    color.colorSpace = THREE.SRGBColorSpace;
    color.wrapS = THREE.RepeatWrapping;
    color.anisotropy = 4;
    return { bump, color };
  });

/** Top-down biryani: white, yellow and saffron grains, birista, mint flecks. */
export const biryaniTexture = () =>
  once('biryani', () => {
    const S = 1024;
    const [c, g] = canvas(S, S);
    const rand = mulberry32(42);
    g.fillStyle = '#d9a648';
    g.fillRect(0, 0, S, S);
    const palette = [
      ['#fff7e2', 0.38],
      ['#f6e9c4', 0.16],
      ['#f7cf5a', 0.2],
      ['#f39a26', 0.16],
      ['#d8631a', 0.1],
    ] as const;
    const pick = () => {
      let r = rand();
      for (const [col, w] of palette) {
        if ((r -= w) <= 0) return col;
      }
      return palette[0][0];
    };
    for (let i = 0; i < 16000; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const a = rand() * Math.PI;
      const len = 14 + rand() * 10;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = pick();
      g.shadowColor = 'rgba(80,30,0,0.35)';
      g.shadowBlur = 2;
      g.beginPath();
      g.ellipse(0, 0, len / 2, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.shadowBlur = 0;
    // birista (fried onion) strands
    for (let i = 0; i < 260; i++) {
      const x = rand() * S;
      const y = rand() * S;
      g.strokeStyle = rand() > 0.5 ? '#6e2e0c' : '#8d4512';
      g.lineWidth = 2 + rand() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + 10 * rand(), y - 14, x + 18, y + 8 * rand(), x + 26 * rand(), y + 16);
      g.stroke();
    }
    // mint / coriander flecks
    for (let i = 0; i < 120; i++) {
      g.fillStyle = rand() > 0.5 ? '#2f8a3a' : '#4ea54a';
      g.beginPath();
      g.ellipse(rand() * S, rand() * S, 6 + rand() * 6, 3 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });

/** Wispy smoke sprite: fbm noise with a soft radial falloff */
export const smokeTexture = () =>
  once('smoke', () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    const n1 = makeNoise(S, 4, 5);
    const n2 = makeNoise(S, 8, 6);
    const n3 = makeNoise(S, 16, 7);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const dx = (x - S / 2) / (S / 2);
        const dy = (y - S / 2) / (S / 2);
        const d = Math.sqrt(dx * dx + dy * dy);
        const fall = Math.max(0, 1 - d);
        const n = n1[i] * 0.55 + n2[i] * 0.3 + n3[i] * 0.15;
        const a = Math.max(0, fall * fall * (n * 1.6 - 0.35));
        img.data[i * 4] = 255;
        img.data[i * 4 + 1] = 255;
        img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = Math.min(255, a * 210);
      }
    }
    g.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  });

export const dotTexture = () =>
  once('dot', () => {
    const S = 64;
    const [c, g] = canvas(S, S);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.65)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  });

export const doughTexture = () =>
  once('dough', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const rand = mulberry32(11);
    g.fillStyle = '#d6ad74';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2200; i++) {
      const v = rand();
      g.fillStyle = v > 0.6 ? 'rgba(120,70,30,0.22)' : 'rgba(255,240,210,0.25)';
      g.beginPath();
      g.arc(rand() * S, rand() * S, rand() * 3 + 0.5, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(110,60,20,0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      const x = rand() * S;
      const y = rand() * S;
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 12);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });

/** Black charcoal with glowing orange veins (emissive map) */
export const charcoalEmissive = () =>
  once('charcoal', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const rand = mulberry32(21);
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(255,${80 + rand() * 90},20,${0.5 + rand() * 0.5})`;
      g.lineWidth = 1 + rand() * 3.5;
      g.beginPath();
      let x = rand() * S;
      let y = rand() * S;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (rand() - 0.5) * 50;
        y += (rand() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });

export const barkTexture = () =>
  once('bark', () => {
    const [c, g] = canvas(64, 256);
    const rand = mulberry32(3);
    g.fillStyle = '#8a4a26';
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rand() > 0.5 ? 'rgba(60,25,10,0.35)' : 'rgba(190,110,60,0.25)';
      g.fillRect(rand() * 64, 0, 1 + rand() * 2, 256);
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(50,20,8,0.4)';
      g.fillRect(0, rand() * 256, 64, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

/** Warm radial glow for the stage floor */
export const floorGlowTexture = () =>
  once('floor', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(120,52,14,0.75)');
    grd.addColorStop(0.35, 'rgba(60,24,8,0.45)');
    grd.addColorStop(1, 'rgba(11,9,8,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
