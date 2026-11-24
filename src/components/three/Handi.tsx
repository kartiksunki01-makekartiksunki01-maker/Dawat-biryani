import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  HANDI,
  chickenGeometry,
  handiGeometries,
  lidGeometries,
  mintLeafGeometry,
  moundGeometry,
  onionGeometry,
  riceGeometry,
  sealSegmentGeometry,
} from './geometries';
import {
  biryaniMaterial,
  brassMaterial,
  doughMaterial,
  engravedBandMaterial,
  goldTrimMaterial,
  ingredientMaterials,
} from './materials';
import { mulberry32, phases, story } from './storyState';

/** Procedural hammered-brass dum handi body (lathe geometry). */
export function HandiBody({ segments = 96 }: { segments?: number }) {
  const g = useMemo(() => handiGeometries(segments), [segments]);
  const brass = brassMaterial('body', [5, 2]);
  const band = engravedBandMaterial();
  const trim = goldTrimMaterial();
  return (
    <group>
      <mesh geometry={g.body} material={brass} />
      <mesh geometry={g.band} material={band} />
      <mesh geometry={g.ringTop} material={trim} rotation-x={Math.PI / 2} position-y={g.ringTopY} />
      <mesh geometry={g.ringBottom} material={trim} rotation-x={Math.PI / 2} position-y={g.ringBottomY} />
      <mesh geometry={g.belt} material={trim} rotation-x={Math.PI / 2} position-y={g.beltY} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * g.handleX, g.handleY, 0]}>
          <mesh geometry={g.boss} material={brass} scale={[0.55, 1, 1]} />
          <mesh geometry={g.handle} material={trim} position={[s * 0.17, -0.16, 0]} />
        </group>
      ))}
    </group>
  );
}

/** Domed lid with knob — positioned by the parent. */
export function LidModel({ segments = 96 }: { segments?: number }) {
  const g = useMemo(() => lidGeometries(segments), [segments]);
  const brass = brassMaterial('lid', [4, 1.2]);
  const trim = goldTrimMaterial();
  return (
    <group>
      <mesh geometry={g.dome} material={brass} />
      <mesh geometry={g.rim} material={trim} rotation-x={Math.PI / 2} />
      <mesh geometry={g.ring} material={trim} rotation-x={Math.PI / 2} position-y={0.37} />
      <mesh geometry={g.knob} material={trim} />
    </group>
  );
}

const SEAL_SEGMENTS = 16;

/** Dough seal ring; when `animated`, it cracks apart with the story's seal-break phase. */
export function DoughSeal({ animated = false }: { animated?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => sealSegmentGeometry(SEAL_SEGMENTS), []);
  const mat = doughMaterial();
  const rand = useMemo(() => {
    const r = mulberry32(77);
    return Array.from({ length: SEAL_SEGMENTS }, () => ({ out: 0.4 + r() * 0.6, drop: 0.6 + r() * 1.2, spin: (r() - 0.5) * 3 }));
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const last = useRef(-1);

  const write = (b: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < SEAL_SEGMENTS; i++) {
      const a = (i / SEAL_SEGMENTS) * Math.PI * 2;
      const mid = a + Math.PI / SEAL_SEGMENTS;
      const r = rand[i];
      dummy.position.set(Math.cos(mid) * r.out * b, HANDI.lipY - r.drop * b * b, -Math.sin(mid) * r.out * b);
      dummy.rotation.set(-Math.PI / 2 + r.spin * b, 0, a);
      dummy.scale.setScalar(1 - b * 0.85);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = b < 0.99;
  };

  useLayoutEffect(() => {
    last.current = -1;
    write(animated ? phases(story.p).sealBreak : 0);
  }, [animated]);
  useFrame(() => {
    if (!animated) return;
    const b = phases(story.p).sealBreak;
    if (Math.abs(b - last.current) < 1e-4) return;
    last.current = b;
    write(b);
  });

  return <instancedMesh ref={ref} args={[geo, mat, SEAL_SEGMENTS]} frustumCulled={false} />;
}

/** The biryani you see when the lid comes off: heaped rice, grains, chicken, mint, birista. */
export function BiryaniTop({ grains = 600, y = HANDI.mouthY - 0.1, radius = 0.97 }: { grains?: number; y?: number; radius?: number }) {
  const mound = useMemo(() => moundGeometry(radius, 0.17), [radius]);
  const riceGeo = useMemo(() => riceGeometry(), []);
  const onionGeo = useMemo(() => onionGeometry(), []);
  const chicken = useMemo(() => [chickenGeometry(3), chickenGeometry(9), chickenGeometry(14)], []);
  const leaf = useMemo(() => mintLeafGeometry(0.26), []);
  const mats = ingredientMaterials();
  const riceRef = useRef<THREE.InstancedMesh>(null);
  const onionRef = useRef<THREE.InstancedMesh>(null);

  const heightAt = (r: number) => 0.17 * Math.sqrt(Math.max(0, 1 - (r / radius) ** 2));

  useLayoutEffect(() => {
    const rnd = mulberry32(2024);
    const d = new THREE.Object3D();
    const palette = ['#fff8e6', '#fff1cf', '#f8d264', '#f4a234', '#df6c1d'].map((c) => new THREE.Color(c));
    const weights = [0.4, 0.15, 0.2, 0.15, 0.1];
    const mesh = riceRef.current!;
    for (let i = 0; i < grains; i++) {
      const r = Math.sqrt(rnd()) * radius * 0.94;
      const a = rnd() * Math.PI * 2;
      d.position.set(Math.cos(a) * r, heightAt(r) + 0.008, Math.sin(a) * r);
      d.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.6, rnd() * Math.PI, rnd() * Math.PI);
      d.scale.setScalar(0.85 + rnd() * 0.3);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      let w = rnd();
      let ci = 0;
      while (ci < weights.length - 1 && (w -= weights[ci]) > 0) ci++;
      mesh.setColorAt(i, palette[ci]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const on = onionRef.current!;
    for (let i = 0; i < 26; i++) {
      const r = Math.sqrt(rnd()) * radius * 0.85;
      const a = rnd() * Math.PI * 2;
      d.position.set(Math.cos(a) * r, heightAt(r) + 0.012, Math.sin(a) * r);
      d.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.5, 0, rnd() * Math.PI * 2);
      d.scale.setScalar(0.8 + rnd() * 0.5);
      d.updateMatrix();
      on.setMatrixAt(i, d.matrix);
    }
    on.instanceMatrix.needsUpdate = true;
  }, [grains, radius]);

  return (
    <group position-y={y}>
      <mesh geometry={mound} material={biryaniMaterial()} />
      <instancedMesh ref={riceRef} args={[riceGeo, mats.rice, grains]} />
      <instancedMesh ref={onionRef} args={[onionGeo, mats.onion, 26]} />
      <mesh geometry={chicken[0]} material={mats.chicken} position={[-0.28, 0.17, 0.12]} rotation={[0.2, 0.6, 0.1]} />
      <mesh geometry={chicken[1]} material={mats.chicken} position={[0.26, 0.16, -0.18]} rotation={[-0.1, 2.2, 0.15]} scale={0.92} />
      <mesh geometry={chicken[2]} material={mats.chicken} position={[0.18, 0.15, 0.36]} rotation={[0.1, -0.8, -0.1]} scale={0.8} />
      {[
        [-0.05, 0.27, 0.02, 0.3, 0.4],
        [0.06, 0.26, -0.04, -0.4, 2.1],
        [0.0, 0.27, 0.08, 0.5, 4.0],
        [0.42, 0.18, 0.12, 0.2, 1.0],
        [-0.38, 0.19, -0.3, 0.3, 3.0],
      ].map(([x, yy, z, tilt, rot], i) => (
        <mesh key={i} geometry={leaf} material={mats.mint} position={[x, yy, z]} rotation={[-Math.PI / 2 + tilt, 0, rot]} />
      ))}
    </group>
  );
}
