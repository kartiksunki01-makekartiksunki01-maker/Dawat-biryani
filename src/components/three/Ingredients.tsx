import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  HANDI,
  cardamomGeometry,
  chickenGeometry,
  cinnamonGeometry,
  cloveGeometry,
  corianderGeometry,
  mintLeafGeometry,
  onionGeometry,
  paneerGeometry,
  riceGeometry,
  saffronGeometry,
  starAniseGeometry,
} from './geometries';
import { ingredientMaterials } from './materials';
import { clamp01, mulberry32, phases, smooth, story } from './storyState';
import type { QualityTier } from '../../utils/device';

type MatKey = keyof ReturnType<typeof ingredientMaterials>;

interface IngredientType {
  key: MatKey;
  label: string;
  short: string;
  geo: () => THREE.BufferGeometry;
  count: Record<QualityTier, number>;
  scale: [number, number];
  hero: number;
}

/** Listed in the order they appear across the screen (left → right). */
const TYPES: IngredientType[] = [
  { key: 'onion', label: 'Caramelised Onions (Birista)', short: 'Birista', geo: onionGeometry, count: { high: 20, medium: 14, low: 8 }, scale: [0.8, 1.15], hero: 1.5 },
  { key: 'cardamom', label: 'Green Cardamom', short: 'Cardamom', geo: cardamomGeometry, count: { high: 12, medium: 8, low: 5 }, scale: [0.75, 0.95], hero: 1.45 },
  { key: 'rice', label: 'Long-grain Basmati Rice', short: 'Basmati', geo: riceGeometry, count: { high: 150, medium: 90, low: 50 }, scale: [1.0, 1.4], hero: 2.3 },
  { key: 'staranise', label: 'Star Anise', short: 'Star anise', geo: starAniseGeometry, count: { high: 7, medium: 5, low: 3 }, scale: [0.55, 0.8], hero: 1.15 },
  { key: 'mint', label: 'Fresh Mint Leaves', short: 'Mint', geo: () => mintLeafGeometry(0.3), count: { high: 10, medium: 7, low: 4 }, scale: [0.7, 1.0], hero: 1.3 },
  { key: 'chicken', label: 'Marinated Chicken', short: 'Chicken', geo: () => chickenGeometry(5), count: { high: 4, medium: 3, low: 3 }, scale: [0.5, 0.68], hero: 0.85 },
  { key: 'saffron', label: 'Saffron (Kesar)', short: 'Saffron', geo: saffronGeometry, count: { high: 40, medium: 26, low: 14 }, scale: [1, 1.35], hero: 2.0 },
  { key: 'clove', label: 'Cloves (Laung)', short: 'Cloves', geo: cloveGeometry, count: { high: 14, medium: 10, low: 6 }, scale: [0.9, 1.2], hero: 1.7 },
  { key: 'paneer', label: 'Paneer Cubes', short: 'Paneer', geo: paneerGeometry, count: { high: 7, medium: 5, low: 3 }, scale: [0.5, 0.7], hero: 1.0 },
  { key: 'cinnamon', label: 'Cinnamon (Dalchini)', short: 'Cinnamon', geo: cinnamonGeometry, count: { high: 5, medium: 4, low: 2 }, scale: [0.5, 0.75], hero: 1.0 },
  { key: 'coriander', label: 'Fresh Coriander', short: 'Coriander', geo: corianderGeometry, count: { high: 9, medium: 6, low: 4 }, scale: [0.7, 1.0], hero: 1.3 },
];

const HERO_Y = [3.1, 3.95, 2.8, 3.6, 4.15, 3.3, 4.0, 2.9, 3.7, 4.2, 3.2];
const HERO_R = [2.3, 2.0, 2.5, 2.1, 2.4, 1.85, 2.4, 2.2, 2.0, 2.5, 2.25];
const CAM_AZIMUTH = 0.48;

/** Where ingredients land on the plate (stage coordinates) */
export const PLATE_CENTER = new THREE.Vector3(0, 0.6, 3.3);

interface Instance {
  start: THREE.Vector3;
  orbitR: number;
  orbitY: number;
  orbitA: number;
  orbitSpeed: number;
  delay: number;
  scale: number;
  rotAxis: THREE.Vector3;
  rotSpeed: number;
  rot0: number;
  plate: THREE.Vector3;
  hero: boolean;
  heroPos?: THREE.Vector3;
}

function buildInstances(type: IngredientType, typeIndex: number, count: number, compact: boolean): Instance[] {
  const rnd = mulberry32(100 + typeIndex * 17);
  const spreadK = compact ? 0.55 : 1;
  const radK = compact ? 0.72 : 1;
  return Array.from({ length: count }, (_, i) => {
    const a = rnd() * Math.PI * 2;
    const sr = Math.sqrt(rnd()) * 0.7;
    const pa = rnd() * Math.PI * 2;
    const pr = Math.sqrt(rnd()) * 0.55;
    const inst: Instance = {
      start: new THREE.Vector3(Math.cos(a) * sr, HANDI.mouthY + 0.05, Math.sin(a) * sr),
      orbitR: (1.5 + rnd() * 1.6) * radK,
      orbitY: 2.5 + rnd() * 2.2,
      orbitA: rnd() * Math.PI * 2,
      orbitSpeed: (0.05 + rnd() * 0.13) * (rnd() > 0.3 ? 1 : -1),
      delay: rnd(),
      scale: type.scale[0] + rnd() * (type.scale[1] - type.scale[0]),
      rotAxis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
      rotSpeed: 0.3 + rnd() * 0.9,
      rot0: rnd() * Math.PI * 2,
      plate: new THREE.Vector3(Math.cos(pa) * pr, 0.28, Math.sin(pa) * pr).add(PLATE_CENTER),
      hero: i === 0,
    };
    if (i === 0) {
      const off = (-1.02 + (typeIndex / (TYPES.length - 1)) * 2.04) * spreadK;
      const az = CAM_AZIMUTH + off;
      const r = HERO_R[typeIndex] * radK;
      inst.heroPos = new THREE.Vector3(Math.sin(az) * r, HERO_Y[typeIndex] - (compact ? 0.2 : 0), Math.cos(az) * r);
      inst.scale = type.hero;
      inst.delay = 0.15 + typeIndex * 0.04;
    }
    return inst;
  });
}

const tmpPos = new THREE.Vector3();
const tmpOrbit = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpMat = new THREE.Matrix4();
const projected = new THREE.Vector3();

function IngredientCluster({
  type,
  index,
  tier,
  compact,
  reduced,
}: {
  type: IngredientType;
  index: number;
  tier: QualityTier;
  compact: boolean;
  reduced: boolean;
}) {
  const count = type.count[tier];
  const geo = useMemo(() => type.geo(), [type]);
  const mat = ingredientMaterials()[type.key];
  const instances = useMemo(() => buildInstances(type, index, count, compact), [type, index, count, compact]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const anchorRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || type.key !== 'rice') return;
    const palette = ['#fff8e6', '#fff1cf', '#f8d264', '#f4a234'].map((c) => new THREE.Color(c));
    instances.forEach((_, i) => mesh.setColorAt(i, palette[i % palette.length]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances, type.key]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const p = story.p;
    const ph = phases(p);
    const visible = ph.rise > 0.001 && ph.ret < 0.999;
    mesh.visible = visible;
    if (!visible) {
      if (labelRef.current) labelRef.current.style.opacity = '0';
      return;
    }
    const t = reduced ? 0 : state.clock.elapsedTime;
    for (let i = 0; i < instances.length; i++) {
      const ins = instances[i];
      const e = clamp01((ph.rise - ins.delay * 0.45) / 0.55);
      const eo = e * e * (3 - 2 * e);
      const r = clamp01((ph.ret - ins.delay * 0.4) / 0.6);
      const ro = r * r * (3 - 2 * r);

      if (ins.hero && ins.heroPos) {
        tmpOrbit.copy(ins.heroPos);
        tmpOrbit.y += Math.sin(t * 0.9 + index) * 0.06;
      } else {
        const ang = ins.orbitA + t * ins.orbitSpeed + p * 2.4 * Math.sign(ins.orbitSpeed);
        tmpOrbit.set(Math.sin(ang) * ins.orbitR, ins.orbitY + Math.sin(t * 0.7 + ins.rot0) * 0.08, Math.cos(ang) * ins.orbitR);
      }
      // rise from the handi along an arc, then fall onto the plate
      tmpPos.lerpVectors(ins.start, tmpOrbit, eo);
      tmpPos.y += Math.sin(eo * Math.PI) * 0.6;
      if (ro > 0) {
        tmpPos.lerp(ins.plate, ro);
        tmpPos.y += Math.sin(ro * Math.PI) * 0.7;
      }
      tmpQuat.setFromAxisAngle(ins.rotAxis, ins.rot0 + t * ins.rotSpeed * (ins.hero ? 0.4 : 1) + p * 6);
      const s = ins.scale * (0.25 + 0.75 * eo) * (1 - smooth(0.55, 1, ro));
      tmpScale.setScalar(Math.max(0.0001, s));
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMat);

      if (ins.hero && anchorRef.current) anchorRef.current.position.copy(tmpPos);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // label: fade + decide which side of the screen it sits on
    const label = labelRef.current;
    if (label && anchorRef.current) {
      const heroE = clamp01((ph.rise - instances[0].delay * 0.45) / 0.55);
      const o = ph.labels * heroE;
      label.style.opacity = o.toFixed(3);
      anchorRef.current.getWorldPosition(projected).project(state.camera);
      label.dataset.side = projected.x < 0 ? 'left' : 'right';
    }
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[geo, mat, count]} frustumCulled={false} />
      <group ref={anchorRef}>
        <Html zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={labelRef} className="ing-label" data-side="right" style={{ opacity: 0 }}>
            <span className="ing-dot" />
            <span className="ing-line" />
            <span className="ing-pill">
              <span className="hidden sm:inline">{type.label}</span>
              <span className="sm:hidden">{type.short}</span>
            </span>
          </div>
        </Html>
      </group>
    </>
  );
}

export function Ingredients({ tier, compact, reduced }: { tier: QualityTier; compact: boolean; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g || reduced) return;
    // gentle reaction to the cursor
    g.rotation.y += (story.pointerX * 0.18 - g.rotation.y) * 0.05;
    g.rotation.x += (-story.pointerY * 0.06 - g.rotation.x) * 0.05;
  });
  return (
    <group ref={group}>
      {TYPES.map((t, i) => (
        <IngredientCluster key={t.key} type={t} index={i} tier={tier} compact={compact} reduced={reduced} />
      ))}
    </group>
  );
}
