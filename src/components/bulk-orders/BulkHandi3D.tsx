import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { DoughSeal, HandiBody, LidModel } from '../three/Handi';
import { CoalBed, GlowParticles, Steam } from '../three/Atmosphere';
import { HANDI } from '../three/geometries';

export const scaleForKg = (kg: number) => 0.55 + 0.55 * Math.pow((Math.min(50, Math.max(1, kg)) - 1) / 19, 0.6);

/**
 * The handi follows the chosen kilograms on a gentle spring (a touch of overshoot, settles in ≈0.5 s).
 * `pulse` changes when a dish is added or switched: the warm gold light swells briefly. The canvas itself is
 * never remounted when the dish changes.
 */
function GrowingHandi({ kg, pulse, reduced, lite }: { kg: number; pulse: number; reduced: boolean; lite: boolean }) {
  const g = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const spring = useRef({ x: scaleForKg(kg), v: 0 });
  const glow = useRef({ seen: pulse, kg, amount: 0 });
  useFrame((s, delta) => {
    if (!g.current) return;
    const dt = Math.min(delta, 1 / 30);
    const target = scaleForKg(kg);
    const sp = spring.current;
    if (reduced) {
      sp.x = target;
      sp.v = 0;
    } else {
      const k = 140, damping = 2 * Math.sqrt(k) * 0.72; // slightly under-damped: soft, no wobble
      sp.v += ((target - sp.x) * k - sp.v * damping) * dt;
      sp.x += sp.v * dt;
    }
    g.current.scale.setScalar(sp.x);
    g.current.rotation.y = reduced ? 0.4 : s.clock.elapsedTime * 0.25;
    g.current.position.y = -1.0 + (reduced ? 0 : Math.sin(s.clock.elapsedTime) * 0.04);
    const gl = glow.current;
    if (gl.seen !== pulse || gl.kg !== kg) {
      gl.amount = reduced ? 0.3 : 1;
      gl.seen = pulse;
      gl.kg = kg;
    }
    gl.amount *= Math.exp(-dt * 2.6);
    if (light.current) light.current.intensity = 2.2 + gl.amount * 5;
  });
  return (
    <group ref={g} position-y={-1}>
      <HandiBody segments={lite ? 48 : 72} />
      <DoughSeal />
      <group position-y={HANDI.lipY}>
        <LidModel segments={lite ? 48 : 72} />
      </group>
      <pointLight ref={light} position={[0, HANDI.lipY + 1.4, 1.2]} color="#ffc76b" intensity={2.2} distance={7} decay={1.6} />
      <Steam count={lite ? 28 : 50} mode="ring" radius={HANDI.sealRadius} y={HANDI.lipY} rise={1.6} size={2.4} intensity={() => 0.5} speed={reduced ? 0.25 : 1} />
      <CoalBed count={lite ? 10 : 14} flicker={!reduced} />
      <GlowParticles count={lite ? 16 : 30} mode="sparks" color="#ff8a2a" size={1.6} timeScale={reduced ? 0.2 : 1} />
    </group>
  );
}

export default function BulkHandi3D({ kg, pulse = 0, active, reduced, lite = false }: { kg: number; pulse?: number; active: boolean; reduced: boolean; lite?: boolean }) {
  return (
    <Canvas
      dpr={lite ? [1, 1.25] : [1, 1.5]}
      gl={{ antialias: !lite, alpha: true, powerPreference: 'high-performance' }}
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
      <GrowingHandi kg={kg} pulse={pulse} reduced={reduced} lite={lite} />
      {/* floating saffron motes — skipped on low-power devices and with reduced motion */}
      {!lite && !reduced && <GlowParticles count={14} mode="dust" color="#f5a524" size={1.1} timeScale={0.35} opacity={() => 0.55} />}
    </Canvas>
  );
}
