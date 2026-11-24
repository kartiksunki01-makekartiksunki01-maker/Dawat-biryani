import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mulberry32 } from './storyState';

/* ───────────────────────── Handi ───────────────────────── */

export const HANDI = {
  /** y of the biryani surface / mouth */
  mouthY: 2.0,
  lipY: 2.12,
  sealRadius: 1.1,
};

/** Dense outer profile of the handi body (radius, height). */
export function handiProfile(samples = 160): THREE.Vector2[] {
  const curve = new THREE.SplineCurve([
    new THREE.Vector2(0.001, 0.0),
    new THREE.Vector2(0.5, 0.0),
    new THREE.Vector2(0.88, 0.06),
    new THREE.Vector2(1.2, 0.24),
    new THREE.Vector2(1.43, 0.52),
    new THREE.Vector2(1.56, 0.86),
    new THREE.Vector2(1.56, 1.16),
    new THREE.Vector2(1.45, 1.44),
    new THREE.Vector2(1.25, 1.66),
    new THREE.Vector2(1.07, 1.8),
    new THREE.Vector2(0.99, 1.9),
    new THREE.Vector2(1.0, 1.98),
    new THREE.Vector2(1.07, 2.04),
    new THREE.Vector2(1.12, 2.08),
  ]);
  const pts = curve.getPoints(samples);
  // rolled lip + inner wall (gives the rim thickness)
  pts.push(
    new THREE.Vector2(1.135, 2.115),
    new THREE.Vector2(1.11, 2.14),
    new THREE.Vector2(1.06, 2.13),
    new THREE.Vector2(1.0, 2.07),
    new THREE.Vector2(0.95, 1.95),
    new THREE.Vector2(0.92, 1.75),
  );
  return pts;
}

export function radiusAt(profile: THREE.Vector2[], y: number) {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if ((a.y <= y && b.y >= y) || (a.y >= y && b.y <= y)) {
      const t = (y - a.y) / (b.y - a.y || 1);
      return a.x + (b.x - a.x) * t;
    }
  }
  return 1;
}

export function handiGeometries(segments = 96) {
  const profile = handiProfile();
  const body = new THREE.LatheGeometry(profile, segments);
  // engraved shoulder band, a hair outside the body surface
  const bandPts = profile
    .filter((p, i) => i < profile.length - 6 && p.y >= 1.4 && p.y <= 1.7)
    .map((p) => new THREE.Vector2(p.x + 0.006, p.y));
  const band = new THREE.LatheGeometry(bandPts, segments);
  const ringTop = new THREE.TorusGeometry(radiusAt(profile, 1.7) + 0.004, 0.018, 8, segments);
  const ringBottom = new THREE.TorusGeometry(radiusAt(profile, 1.4) + 0.004, 0.022, 8, segments);
  const belt = new THREE.TorusGeometry(radiusAt(profile, 0.9) + 0.002, 0.014, 8, segments);
  const handle = new THREE.TorusGeometry(0.2, 0.034, 12, 40);
  const boss = new THREE.SphereGeometry(0.07, 16, 12);
  return {
    profile,
    body,
    band,
    ringTop,
    ringBottom,
    belt,
    handle,
    boss,
    handleY: 1.46,
    handleX: radiusAt(profile, 1.46) + 0.05,
    ringTopY: 1.7,
    ringBottomY: 1.4,
    beltY: 0.9,
  };
}

export function lidGeometries(segments = 96) {
  const dome = new THREE.LatheGeometry(
    [
      new THREE.Vector2(1.1, -0.04),
      new THREE.Vector2(1.17, -0.01),
      new THREE.Vector2(1.16, 0.03),
      new THREE.Vector2(1.08, 0.09),
      new THREE.Vector2(0.9, 0.21),
      new THREE.Vector2(0.62, 0.37),
      new THREE.Vector2(0.32, 0.47),
      new THREE.Vector2(0.001, 0.5),
    ],
    segments,
  );
  const knob = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.14, 0.49),
      new THREE.Vector2(0.09, 0.56),
      new THREE.Vector2(0.055, 0.62),
      new THREE.Vector2(0.11, 0.69),
      new THREE.Vector2(0.14, 0.76),
      new THREE.Vector2(0.1, 0.84),
      new THREE.Vector2(0.04, 0.875),
      new THREE.Vector2(0.001, 0.88),
    ],
    32,
  );
  const rim = new THREE.TorusGeometry(1.14, 0.03, 10, segments);
  const ring = new THREE.TorusGeometry(0.62, 0.012, 6, segments);
  return { dome, knob, rim, ring };
}

/** Dough seal split into arc segments so it can crack apart. */
export function sealSegmentGeometry(count: number) {
  return new THREE.TorusGeometry(HANDI.sealRadius, 0.075, 10, 14, ((Math.PI * 2) / count) * 0.992);
}

/** Heaped biryani mound with planar UVs */
export function moundGeometry(radius = 0.97, height = 0.17) {
  const g = new THREE.SphereGeometry(1, 64, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(radius, height, radius);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const noise = new SimplexNoise();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    pos.setY(i, y + noise.noise(x * 4, z * 4) * 0.018 * (y / height));
    uv.setXY(i, x / (radius * 2) + 0.5, z / (radius * 2) + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

/* ───────────────────────── Ingredients ───────────────────────── */

export function riceGeometry() {
  return new THREE.CapsuleGeometry(0.013, 0.072, 2, 6);
}

export function saffronGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.11, 0),
    new THREE.Vector3(0.018, -0.03, 0.01),
    new THREE.Vector3(-0.006, 0.05, -0.006),
    new THREE.Vector3(0.012, 0.12, 0),
  ]);
  return new THREE.TubeGeometry(curve, 10, 0.0065, 4, false);
}

export function starAniseGeometry() {
  const shape = new THREE.Shape();
  const arms = 8;
  for (let i = 0; i < arms; i++) {
    const a0 = (i / arms) * Math.PI * 2;
    const aMid = a0 + Math.PI / arms;
    const outer = 0.16;
    const inner = 0.04;
    const p0 = [Math.cos(a0 - Math.PI / arms) * inner, Math.sin(a0 - Math.PI / arms) * inner];
    if (i === 0) shape.moveTo(p0[0], p0[1]);
    const tip = [Math.cos(a0) * outer, Math.sin(a0) * outer];
    const c1 = [Math.cos(a0 - 0.22) * outer * 0.85, Math.sin(a0 - 0.22) * outer * 0.85];
    const c2 = [Math.cos(a0 + 0.22) * outer * 0.85, Math.sin(a0 + 0.22) * outer * 0.85];
    const p1 = [Math.cos(aMid) * inner, Math.sin(aMid) * inner];
    shape.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1]);
    shape.quadraticCurveTo(c2[0], c2[1], p1[0], p1[1]);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.center();
  // seeds bulge in the middle of each arm
  return g;
}

export function cardamomGeometry() {
  const pts: THREE.Vector2[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(0.001 + 0.045 * Math.pow(Math.sin(Math.PI * t), 0.75), -0.09 + 0.18 * t));
  }
  const g = new THREE.LatheGeometry(pts, 18);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.1 * Math.cos(3 * a);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function cinnamonGeometry() {
  const outer = new THREE.CylinderGeometry(0.055, 0.055, 0.5, 20, 1, true, 0, 5.3);
  const inner = new THREE.CylinderGeometry(0.038, 0.038, 0.5, 20, 1, true, 1.2, 4.8);
  return mergeGeometries([outer, inner])!;
}

export function cloveGeometry() {
  const stem = new THREE.CylinderGeometry(0.014, 0.007, 0.13, 6);
  stem.translate(0, -0.035, 0);
  const head = new THREE.SphereGeometry(0.024, 10, 8);
  head.translate(0, 0.055, 0);
  const parts: THREE.BufferGeometry[] = [stem, head];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.ConeGeometry(0.012, 0.035, 4);
    const a = (i / 4) * Math.PI * 2;
    s.rotateZ(Math.PI);
    s.rotateX(0.5);
    s.rotateY(a);
    s.translate(Math.cos(a) * 0.022, 0.04, Math.sin(a) * 0.022);
    parts.push(s);
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

export function mintLeafGeometry(length = 0.3) {
  const shape = new THREE.Shape();
  const steps = 28;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = 0.1 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9) * (1 + 0.1 * Math.sin(t * 46));
    const y = t * length - length / 2;
    left.push([-w, y]);
    right.push([w, y]);
  }
  shape.moveTo(left[0][0], left[0][1]);
  left.forEach(([x, y]) => shape.lineTo(x, y));
  right.reverse().forEach(([x, y]) => shape.lineTo(x, y));
  const g = new THREE.ShapeGeometry(shape, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, -3.2 * x * x + 0.35 * y * y);
  }
  g.computeVertexNormals();
  return g;
}

export function corianderGeometry() {
  const shape = new THREE.Shape();
  const n = 90;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.1 * (0.72 + 0.28 * Math.cos(3 * a)) * (1 + 0.07 * Math.sin(21 * a));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(shape, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, -1.4 * (x * x + y * y));
  }
  g.computeVertexNormals();
  return g;
}

export function onionGeometry() {
  return new THREE.TorusGeometry(0.075, 0.012, 5, 16, Math.PI * 1.35);
}

export function paneerGeometry() {
  return new RoundedBoxGeometry(0.16, 0.16, 0.16, 2, 0.028);
}

/** Lumpy, charred marinated chicken piece with vertex colours. */
export function chickenGeometry(seed = 3) {
  const ico = new THREE.IcosahedronGeometry(0.2, 5);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico); // indexed → smooth normals
  const noise = new SimplexNoise({ random: mulberry32(seed) });
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color('#a8461d');
  const char = new THREE.Color('#4a1608');
  const glaze = new THREE.Color('#d0702c');
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n1 = noise.noise3d(v.x * 1.6, v.y * 1.6, v.z * 1.6);
    const n2 = noise.noise3d(v.x * 4.2 + 9, v.y * 4.2, v.z * 4.2);
    const r = 0.2 * (1 + n1 * 0.2 + n2 * 0.06);
    v.multiplyScalar(r);
    v.x *= 1.35;
    v.y *= 0.78;
    pos.setXYZ(i, v.x, v.y, v.z);
    const charAmt = Math.max(0, n2 * 1.6 - 0.25);
    c.copy(base).lerp(glaze, Math.max(0, n1) * 0.6).lerp(char, Math.min(1, charAmt));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Irregular charcoal chunk */
export function charcoalGeometry() {
  const g = new THREE.DodecahedronGeometry(0.16, 1);
  const noise = new SimplexNoise({ random: mulberry32(8) });
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + noise.noise3d(v.x * 6, v.y * 6, v.z * 6) * 0.22;
    pos.setXYZ(i, v.x * k * 1.25, v.y * k * 0.75, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ───────────────────────── Plate composition ───────────────────────── */

export function thaliGeometry() {
  return new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(1.0, 0),
      new THREE.Vector2(1.12, 0.03),
      new THREE.Vector2(1.22, 0.1),
      new THREE.Vector2(1.27, 0.16),
      new THREE.Vector2(1.29, 0.18),
      new THREE.Vector2(1.25, 0.175),
      new THREE.Vector2(1.2, 0.12),
      new THREE.Vector2(1.1, 0.06),
      new THREE.Vector2(0.98, 0.035),
      new THREE.Vector2(0.001, 0.035),
    ],
    96,
  );
}

export function katoriGeometry() {
  return new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.17, 0),
      new THREE.Vector2(0.25, 0.05),
      new THREE.Vector2(0.3, 0.15),
      new THREE.Vector2(0.32, 0.2),
      new THREE.Vector2(0.3, 0.2),
      new THREE.Vector2(0.27, 0.15),
    ],
    48,
  );
}
