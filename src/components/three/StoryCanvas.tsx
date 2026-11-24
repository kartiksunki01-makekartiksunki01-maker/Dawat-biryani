import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { BiryaniTop, DoughSeal, HandiBody, LidModel } from './Handi';
import { CoalBed, GlowParticles, RoyalArches, Steam } from './Atmosphere';
import { Ingredients } from './Ingredients';
import { PlatedBiryani } from './Plate';
import { HANDI } from './geometries';
import { easeInOut, lerp, phases, smooth, story } from './storyState';
import { dprFor, type QualityTier } from '../../utils/device';
import { sound } from '../../utils/sound';

/* ─────────────── Camera choreography (keyframes over scroll progress) ─────────────── */

interface Key {
  p: number;
  theta: number;
  r: number;
  h: number;
  t: [number, number, number];
}
const KEYS: Key[] = [
  { p: 0.0, theta: 0.0, r: 7.0, h: 2.35, t: [0, 1.1, 0] },
  { p: 0.1, theta: 0.05, r: 6.9, h: 2.45, t: [0, 1.15, 0] },
  { p: 0.22, theta: 0.16, r: 6.4, h: 3.0, t: [0, 1.5, 0] },
  { p: 0.4, theta: 0.78, r: 4.4, h: 4.3, t: [0, 1.95, 0] },
  { p: 0.48, theta: 0.62, r: 5.6, h: 4.0, t: [0, 2.4, 0] },
  { p: 0.62, theta: 0.38, r: 7.0, h: 3.7, t: [0, 3.0, 0] },
  { p: 0.7, theta: 0.3, r: 7.0, h: 3.8, t: [0, 2.7, 0.4] },
  { p: 0.86, theta: 0.08, r: 3.3, h: 5.3, t: [0, 0.6, 3.3] },
  { p: 1.0, theta: 0.0, r: 3.0, h: 4.9, t: [0, 0.6, 3.3] },
];

const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const smoothPos = new THREE.Vector3(0, 2.35, 7.6);
const smoothTarget = new THREE.Vector3(0, 1.15, 0);

function sampleCamera(p: number, aspect: number) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = easeInOut(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))));
  const theta = lerp(a.theta, b.theta, k);
  // portrait screens need the camera further back to fit the handi
  const portrait = aspect < 1 ? Math.min(1, (1 - aspect) / 0.5) : 0;
  const r = lerp(a.r, b.r, k) * (1 + portrait * 0.6);
  const h = lerp(a.h, b.h, k) + portrait * 0.6;
  camTarget.set(lerp(a.t[0], b.t[0], k), lerp(a.t[1], b.t[1], k), lerp(a.t[2], b.t[2], k));
  camPos.set(camTarget.x + Math.sin(theta) * r, h, camTarget.z + Math.cos(theta) * r);
}

function CameraRig({ reduced }: { reduced: boolean }) {
  const { camera, size } = useThree();
  useFrame((_, delta) => {
    const aspect = size.width / size.height;
    sampleCamera(story.p, aspect);
    // wide screens: frame the plate to the right of the Chapter IV caption
    if (aspect > 1.1) {
      const shift = -1.05 * smooth(0.74, 0.88, story.p);
      camPos.x += shift;
      camTarget.x += shift;
    }
    if (!reduced) {
      camPos.x += story.pointerX * 0.28;
      camPos.y += story.pointerY * 0.16;
    }
    const k = reduced ? 1 : 1 - Math.exp(-delta * 6);
    smoothPos.lerp(camPos, k);
    smoothTarget.lerp(camTarget, k);
    camera.position.copy(smoothPos);
    camera.lookAt(smoothTarget);
  });
  return null;
}

/* ─────────────── The stage: floating handi, lid, seal, steam, ingredients ─────────────── */

function Stage({ tier, reduced }: { tier: QualityTier; reduced: boolean }) {
  const { size } = useThree();
  const aspect = size.width / size.height;
  const compact = aspect < 0.9;
  const stage = useRef<THREE.Group>(null);
  const float = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const inner = useRef<THREE.PointLight>(null);
  const lidSoundArmed = useRef(true);
  const segments = tier === 'low' ? 56 : tier === 'medium' ? 80 : 112;

  useFrame((state) => {
    const t = reduced ? 0 : state.clock.elapsedTime;
    const p = story.p;
    const ph = phases(p);

    // Desktop: handi sits to the right of the hero headline, then glides to centre.
    const heroX = aspect > 1.15 ? 1.6 * Math.min(1.25, aspect / 1.6) : 0;
    const heroY = compact ? -2.6 : 0;
    if (stage.current) {
      stage.current.position.x = heroX * ph.hero;
      stage.current.position.y = heroY * ph.hero;
    }
    if (float.current) {
      float.current.position.y = Math.sin(t * 0.8) * 0.06 * (1 - ph.plate);
      float.current.rotation.z = Math.sin(t * 0.5) * 0.012;
    }
    if (body.current) body.current.rotation.y = t * 0.07 + p * 1.4;

    if (lid.current) {
      const L = ph.lidOpen;
      const e = 1 - Math.pow(1 - L, 3);
      lid.current.position.set(
        1.35 * e + ph.rise * 1.1 + ph.plate * 0.6,
        HANDI.lipY + 1.75 * e + ph.rise * 1.5,
        -0.35 * e - ph.rise * 1.4,
      );
      lid.current.rotation.set(0.25 * e, e * 1.6 + t * 0.12 * e, -0.78 * e);
    }
    if (inner.current) inner.current.intensity = ph.lidOpen * 9 * (1 - ph.plate * 0.6);

    // sound cues (only audible if the visitor enabled sound)
    if (ph.lidOpen > 0.06 && lidSoundArmed.current) {
      sound.play('lid');
      lidSoundArmed.current = false;
    } else if (ph.lidOpen < 0.02) lidSoundArmed.current = true;
    sound.setSizzle(p < 0.95 ? 0.25 + ph.lidOpen * 0.75 : 0);
  });

  const steamCount = tier === 'high' ? 150 : tier === 'medium' ? 95 : 50;
  const grains = tier === 'high' ? 700 : tier === 'medium' ? 420 : 220;

  return (
    <group ref={stage}>
      <CoalBed count={tier === 'low' ? 14 : 24} flicker={!reduced} />
      {tier !== 'low' && (
        <GlowParticles count={tier === 'high' ? 70 : 40} mode="sparks" color="#ff8a2a" size={1.6} timeScale={reduced ? 0.2 : 1} />
      )}
      <group ref={float}>
        <group ref={body}>
          <HandiBody segments={segments} />
          <BiryaniTop grains={grains} />
        </group>
        <DoughSeal animated />
        <group ref={lid}>
          <LidModel segments={segments} />
        </group>
        <pointLight ref={inner} position={[0, 2.5, 0]} color="#ffb24d" distance={4.5} decay={2} intensity={0} />
        <Steam
          count={Math.round(steamCount * 0.4)}
          mode="ring"
          radius={HANDI.sealRadius}
          y={HANDI.lipY}
          rise={1.8}
          size={2.2}
          speed={reduced ? 0.25 : 1}
          intensity={() => {
            const ph = phases(story.p);
            return 0.45 * (1 - ph.lidOpen);
          }}
        />
        <Steam
          count={steamCount}
          mode="plume"
          radius={0.75}
          y={HANDI.mouthY}
          rise={3.4}
          size={3.4}
          speed={reduced ? 0.25 : 1}
          intensity={() => {
            const ph = phases(story.p);
            return 0.8 * ph.lidOpen * (1 - 0.65 * ph.ingredients) * (1 - 0.8 * ph.plate);
          }}
        />
      </group>
      <Ingredients tier={tier} compact={compact} reduced={reduced} />
      <PlatedBiryani grains={Math.round(grains * 0.5)} />
    </group>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.22} color="#ffe2c0" />
      <directionalLight position={[-4, 6, 5]} intensity={2.1} color="#ffd9a8" />
      <directionalLight position={[5, 3.5, -5]} intensity={1.8} color="#ff9b45" />
      <directionalLight position={[0, 2, 8]} intensity={0.35} color="#fff1d2" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.6} color="#ffd8a0" position={[-5, 4, 4]} scale={[6, 3, 1]} target={[0, 1, 0]} />
        <Lightformer form="ring" intensity={3} color="#ffb35c" position={[5, 3, -3]} scale={4} target={[0, 1, 0]} />
        <Lightformer form="rect" intensity={1.1} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ff6a1a" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#ffe9c8" position={[0, 2, 7]} scale={[10, 4, 1]} target={[0, 1, 0]} />
      </Environment>
    </>
  );
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    frames.current++;
    if (frames.current > 2) {
      done.current = true;
      onReady();
    }
  });
  return null;
}

export interface StoryCanvasProps {
  tier: QualityTier;
  auto: boolean;
  active: boolean;
  reduced: boolean;
  onReady: () => void;
  onDecline: () => void;
  onIncline: () => void;
}

export default function StoryCanvas({ tier, auto, active, reduced, onReady, onDecline, onIncline }: StoryCanvasProps) {
  const dustCount = tier === 'high' ? 420 : tier === 'medium' ? 260 : 120;
  const gl = useMemo(
    () => ({ antialias: tier !== 'low', powerPreference: 'high-performance' as const, alpha: false, stencil: false }),
    [tier],
  );

  // pointer → normalised story pointer (desktop only)
  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      story.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      story.pointerY = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reduced]);

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={dprFor(tier)}
      gl={gl}
      camera={{ fov: 35, near: 0.1, far: 60, position: [0, 2.35, 7.6] }}
      frameloop={active ? 'always' : 'never'}
      aria-hidden
    >
      <color attach="background" args={['#0B0908']} />
      <fog attach="fog" args={['#0B0908', 10, 24]} />
      {auto && <PerformanceMonitor onDecline={onDecline} onIncline={onIncline} flipflops={3} />}
      <CameraRig reduced={reduced} />
      <Lights />
      <Suspense fallback={null}>
        <RoyalArches />
        <GlowParticles
          count={dustCount}
          mode="dust"
          color="#f3c766"
          size={1.1}
          timeScale={reduced ? 0.15 : 1}
          opacity={() => 0.85 - 0.4 * smooth(0.72, 0.9, story.p)}
        />
        <Stage tier={tier} reduced={reduced} />
        <ReadySignal onReady={onReady} />
      </Suspense>
      {tier === 'high' && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
