import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { DoughSeal, HandiBody, LidModel } from '../three/Handi';
import { CoalBed, GlowParticles, Steam } from '../three/Atmosphere';
import { HANDI } from '../three/geometries';

export const scaleForKg = (kg: number) => 0.55 + 0.55 * Math.pow((kg - 1) / 19, 0.6);

function GrowingHandi({ kg, reduced }: { kg: number; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s, delta) => {
    if (!g.current) return;
    const target = scaleForKg(kg);
    const cur = g.current.scale.x;
    const next = reduced ? target : cur + (target - cur) * (1 - Math.exp(-delta * 6));
    g.current.scale.setScalar(next);
    g.current.rotation.y = reduced ? 0.4 : s.clock.elapsedTime * 0.25;
    g.current.position.y = -1.0 + (reduced ? 0 : Math.sin(s.clock.elapsedTime) * 0.04);
  });
  return (
    <group ref={g} position-y={-1}>
      <HandiBody segments={72} />
      <DoughSeal />
      <group position-y={HANDI.lipY}>
        <LidModel segments={72} />
      </group>
      <Steam count={50} mode="ring" radius={HANDI.sealRadius} y={HANDI.lipY} rise={1.6} size={2.4} intensity={() => 0.5} speed={reduced ? 0.25 : 1} />
      <CoalBed count={14} flicker={!reduced} />
      <GlowParticles count={30} mode="sparks" color="#ff8a2a" size={1.6} timeScale={reduced ? 0.2 : 1} />
    </group>
  );
}

export default function BulkHandi3D({ kg, active, reduced }: { kg: number; active: boolean; reduced: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 32, position: [0, 2.6, 8.2], near: 0.1, far: 40 }}
      frameloop={active ? 'always' : 'never'}
      onCreated={({ camera }) => camera.lookAt(0, 0.1, 0)}
      aria-hidden
    >
      <ambientLight intensity={0.25} color="#ffe2c0" />
      <directionalLight position={[-4, 6, 5]} intensity={2.2} color="#ffd9a8" />
      <directionalLight position={[5, 3.5, -5]} intensity={1.6} color="#ff9b45" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2.6} color="#ffd8a0" position={[-5, 4, 4]} scale={[6, 3, 1]} target={[0, 1, 0]} />
        <Lightformer form="ring" intensity={3} color="#ffb35c" position={[5, 3, -3]} scale={4} target={[0, 1, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#ffe9c8" position={[0, 2, 7]} scale={[10, 4, 1]} target={[0, 1, 0]} />
      </Environment>
      <GrowingHandi kg={kg} reduced={reduced} />
    </Canvas>
  );
}
