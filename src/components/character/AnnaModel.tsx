import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Gesture } from '../../stores/hostStore';
import { BiryaniTop } from '../three/Handi';
import { thaliGeometry } from '../three/geometries';
import { brassMaterial } from '../three/materials';

/**
 * "Dawat Anna" — a fictional, stylised South Indian host built procedurally
 * from the supplied reference image (white shirt, gold-bordered mundu, beard,
 * tilak, gold chains, sandals). Joints are real hierarchical pivots, so every
 * gesture below is genuine procedural animation — no prerecorded clips.
 */

type V3 = [number, number, number];
interface Pose {
  armR: { s: V3; e: V3 }; // character's right arm (screen left, -x)
  armL: { s: V3; e: V3 }; // character's left arm (screen right, +x)
  head: V3;
  spine: V3;
  plate: number;
}

const IDLE: Pose = {
  armR: { s: [-0.45, 0, -0.08], e: [-1.3, 0, 0.95] },
  armL: { s: [-0.45, 0, 0.08], e: [-1.3, 0, -0.95] },
  head: [0, 0, 0],
  spine: [0, 0, 0],
  plate: 0,
};

const POSES: Record<Exclude<Gesture, 'idle'>, { pose: Pose; duration: number }> = {
  namaste: {
    pose: {
      armR: { s: [-0.9, 0, 0], e: [-1.2, 0, 0.95] },
      armL: { s: [-0.9, 0, 0], e: [-1.2, 0, -0.95] },
      head: [0.22, 0, 0],
      spine: [0.12, 0, 0],
      plate: 0,
    },
    duration: 2.4,
  },
  thanks: {
    pose: {
      armR: { s: [-0.9, 0, 0], e: [-1.2, 0, 0.95] },
      armL: { s: [-0.9, 0, 0], e: [-1.2, 0, -0.95] },
      head: [0.3, 0, 0],
      spine: [0.32, 0, 0],
      plate: 0,
    },
    duration: 2.6,
  },
  wave: {
    pose: {
      armR: { s: [-0.15, 0, -2.45], e: [0, 0, -0.55] },
      armL: IDLE.armL,
      head: [0, 0.12, -0.08],
      spine: [0, 0.08, 0],
      plate: 0,
    },
    duration: 2.4,
  },
  point: {
    pose: {
      armR: { s: [-0.45, -0.2, -1.35], e: [-0.1, 0, -0.05] },
      armL: IDLE.armL,
      head: [0.05, -0.42, 0],
      spine: [0, -0.22, 0],
      plate: 0,
    },
    duration: 2.8,
  },
  present: {
    pose: {
      armR: { s: [-0.4, 0, -0.08], e: [-1.4, 0, 0.3] },
      armL: { s: [-0.4, 0, 0.08], e: [-1.4, 0, -0.3] },
      head: [0.18, 0, 0],
      spine: [0.05, 0, 0],
      plate: 1,
    },
    duration: 3.0,
  },
  celebrate: {
    pose: {
      armR: { s: [0, 0, -2.6], e: [0, 0, -0.3] },
      armL: { s: [0, 0, 2.6], e: [0, 0, 0.3] },
      head: [-0.15, 0, 0.12],
      spine: [0, 0, 0],
      plate: 0,
    },
    duration: 1.9,
  },
};

function useMaterials() {
  return useMemo(
    () => ({
      skin: new THREE.MeshPhysicalMaterial({ color: '#c98b5f', roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffb48a') }),
      hair: new THREE.MeshStandardMaterial({ color: '#151010', roughness: 0.55 }),
      cloth: new THREE.MeshPhysicalMaterial({
        color: '#f6f2ea',
        roughness: 0.85,
        sheen: 0.6,
        sheenColor: new THREE.Color('#ffffff'),
        sheenRoughness: 0.6,
      }),
      gold: new THREE.MeshStandardMaterial({ color: '#e7b85a', metalness: 1, roughness: 0.25 }),
      goldBorder: new THREE.MeshStandardMaterial({ color: '#e2ae3c', metalness: 0.6, roughness: 0.35 }),
      sandal: new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.7 }),
      eyeWhite: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15 }),
      iris: new THREE.MeshStandardMaterial({ color: '#4a2812', roughness: 0.2 }),
      pupil: new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.1 }),
      tilak: new THREE.MeshStandardMaterial({ color: '#c4141c', roughness: 0.5 }),
      lip: new THREE.MeshStandardMaterial({ color: '#7a2f2a', roughness: 0.5 }),
      teeth: new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.3 }),
      button: new THREE.MeshStandardMaterial({ color: '#e8e2d6', roughness: 0.4 }),
      strap: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5 }),
    }),
    [],
  );
}

/** Lathe profile helper */
const lathe = (pts: [number, number][], seg = 40) =>
  new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    seg,
  );

const SHIRT_PROFILE: [number, number][] = [
  [0.001, -0.02],
  [0.3, -0.02],
  [0.315, 0.12],
  [0.32, 0.3],
  [0.325, 0.48],
  [0.31, 0.6],
  [0.26, 0.68],
  [0.17, 0.74],
  [0.11, 0.76],
  [0.001, 0.765],
];
const shirtRadiusAt = (y: number) => {
  for (let i = 1; i < SHIRT_PROFILE.length; i++) {
    const [r0, y0] = SHIRT_PROFILE[i - 1];
    const [r1, y1] = SHIRT_PROFILE[i];
    if (y >= y0 && y <= y1) return r0 + ((y - y0) / (y1 - y0 || 1)) * (r1 - r0);
  }
  return 0.3;
};

function GoldChains({ mat }: { mat: THREE.Material }) {
  const geo = useMemo(() => {
    const beads: THREE.BufferGeometry[] = [];
    const bead = new THREE.SphereGeometry(0.0115, 6, 5);
    for (let k = 0; k < 3; k++) {
      const n = 30 + k * 4;
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * 2 - 1;
        const x = u * (0.13 + k * 0.018);
        const y = 0.71 - (0.13 + k * 0.065) * (1 - u * u);
        const r = shirtRadiusAt(y);
        const z = Math.sqrt(Math.max(0.0001, r * r - x * x)) + 0.012;
        const b = bead.clone();
        b.translate(x, y, z);
        beads.push(b);
      }
    }
    return mergeGeometries(beads)!;
  }, []);
  return <mesh geometry={geo} material={mat} />;
}

function Arm({
  side,
  shoulderRef,
  elbowRef,
  m,
}: {
  side: 1 | -1;
  shoulderRef: RefObject<THREE.Group | null>;
  elbowRef: RefObject<THREE.Group | null>;
  m: ReturnType<typeof useMaterials>;
}) {
  return (
    <group ref={shoulderRef} position={[side * 0.315, 0.6, 0]}>
      <mesh position-y={-0.13} material={m.cloth}>
        <capsuleGeometry args={[0.085, 0.18, 6, 16]} />
      </mesh>
      <mesh position-y={-0.255} rotation-x={Math.PI / 2} material={m.cloth}>
        <torusGeometry args={[0.083, 0.014, 8, 20]} />
      </mesh>
      <group ref={elbowRef} position-y={-0.27}>
        <mesh position-y={-0.115} material={m.skin}>
          <capsuleGeometry args={[0.058, 0.17, 6, 14]} />
        </mesh>
        {/* wrist accessory: gold kada on the right, watch on the left */}
        {side === -1 ? (
          <mesh position-y={-0.21} rotation-x={Math.PI / 2} material={m.gold}>
            <torusGeometry args={[0.058, 0.011, 8, 22]} />
          </mesh>
        ) : (
          <group position-y={-0.21}>
            <mesh rotation-x={Math.PI / 2} material={m.strap}>
              <torusGeometry args={[0.058, 0.014, 8, 22]} />
            </mesh>
            <mesh position-z={0.064} rotation-x={Math.PI / 2} material={m.strap}>
              <cylinderGeometry args={[0.026, 0.026, 0.012, 16]} />
            </mesh>
          </group>
        )}
        <group position-y={-0.29}>
          <mesh scale={[0.075, 0.09, 0.055]} material={m.skin}>
            <sphereGeometry args={[1, 18, 14]} />
          </mesh>
          <mesh position={[-side * 0.06, 0.02, 0.03]} rotation-z={side * 0.6} material={m.skin}>
            <capsuleGeometry args={[0.022, 0.05, 4, 8]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function AnnaModel({ gesture, reduced }: { gesture: { id: number; name: Gesture }; reduced: boolean }) {
  const m = useMaterials();
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const shR = useRef<THREE.Group>(null);
  const elR = useRef<THREE.Group>(null);
  const shL = useRef<THREE.Group>(null);
  const elL = useRef<THREE.Group>(null);
  const lids = useRef<THREE.Group>(null);
  const plate = useRef<THREE.Group>(null);
  const state = useRef({ gestureId: -1, name: 'idle' as Gesture, started: 0, nextBlink: 2, blinkT: -1 });

  const geos = useMemo(() => {
    const mundu = lathe([
      [0.001, 0.08],
      [0.37, 0.08],
      [0.36, 0.3],
      [0.335, 0.6],
      [0.31, 0.88],
      [0.3, 0.96],
      [0.001, 0.96],
    ]);
    const shirt = lathe(SHIRT_PROFILE, 44);
    const border = lathe([
      [0.372, 0.085],
      [0.372, 0.15],
    ]);
    const hairCap = new THREE.SphereGeometry(0.285, 32, 16, 0, Math.PI * 2, 0, 1.25);
    // full beard along the jaw (front half only), leaving the cheeks visible
    const beard = new THREE.SphereGeometry(0.272, 32, 16, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.6, Math.PI * 0.34);
    return { mundu, shirt, border, hairCap, beard };
  }, []);

  const thali = useMemo(() => thaliGeometry(), []);

  useFrame((s, delta) => {
    const st = state.current;
    const t = s.clock.elapsedTime;
    if (gesture.id !== st.gestureId) {
      st.gestureId = gesture.id;
      st.name = gesture.name;
      st.started = t;
    }
    const def = st.name !== 'idle' ? POSES[st.name] : null;
    const elapsed = t - st.started;
    const active = def && elapsed < def.duration;
    const target = active ? def.pose : IDLE;
    const k = reduced ? 1 : 1 - Math.exp(-delta * 7);

    const apply = (g: THREE.Group | null, v: V3, add: V3 = [0, 0, 0]) => {
      if (!g) return;
      g.rotation.x += (v[0] + add[0] - g.rotation.x) * k;
      g.rotation.y += (v[1] + add[1] - g.rotation.y) * k;
      g.rotation.z += (v[2] + add[2] - g.rotation.z) * k;
    };

    const wave = active && st.name === 'wave' && !reduced ? Math.sin(elapsed * 11) * 0.45 : 0;
    const pointBob = active && st.name === 'point' && !reduced ? Math.sin(elapsed * 6) * 0.05 : 0;
    apply(shR.current, target.armR.s, [0, 0, pointBob]);
    apply(elR.current, target.armR.e, [0, 0, wave]);
    apply(shL.current, target.armL.s);
    apply(elL.current, target.armL.e);
    const idleLook = reduced ? 0 : Math.sin(t * 0.6) * 0.12;
    apply(head.current, target.head, [Math.sin(t * 1.1) * 0.02, active ? 0 : idleLook, 0]);
    apply(torso.current, target.spine);

    // breathing + hop
    if (torso.current && !reduced) torso.current.scale.set(1 + Math.sin(t * 2.2) * 0.008, 1 + Math.sin(t * 2.2) * 0.012, 1);
    if (body.current) {
      const hop = active && st.name === 'celebrate' && !reduced ? Math.abs(Math.sin(elapsed * 7)) * 0.08 : 0;
      body.current.position.y += (hop - body.current.position.y) * 0.4;
    }
    if (root.current && !reduced) root.current.rotation.y = Math.sin(t * 0.35) * 0.12;

    // blinking
    if (!reduced) {
      if (st.blinkT < 0 && t > st.nextBlink) st.blinkT = 0;
      if (st.blinkT >= 0) {
        st.blinkT += delta;
        if (st.blinkT > 0.16) {
          st.blinkT = -1;
          st.nextBlink = t + 2.2 + Math.random() * 3;
        }
      }
    }
    const closed = st.blinkT >= 0 ? Math.sin((st.blinkT / 0.16) * Math.PI) : 0;
    lids.current?.children.forEach((lid) => {
      lid.scale.y = 0.12 + closed * 0.88;
      lid.position.y = 0.05 + (1 - closed) * 0.046;
    });

    if (plate.current) {
      const target = active ? def.pose.plate : 0;
      const sc = plate.current.scale.x + (target - plate.current.scale.x) * k;
      plate.current.scale.setScalar(Math.max(0.0001, sc));
      plate.current.visible = sc > 0.01;
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {/* mundu with gold border */}
        <mesh geometry={geos.mundu} material={m.cloth} />
        <mesh geometry={geos.border} material={m.goldBorder} />
        <mesh position={[0.11, 0.52, 0.325]} rotation-x={-0.08} material={m.goldBorder}>
          <boxGeometry args={[0.035, 0.86, 0.008]} />
        </mesh>
        {/* feet & sandals */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.12, 0, 0.08]}>
            <mesh position={[0, 0.015, 0.03]} material={m.sandal}>
              <boxGeometry args={[0.12, 0.03, 0.26]} />
            </mesh>
            <mesh position={[0, 0.06, 0.04]} scale={[0.055, 0.04, 0.11]} material={m.skin}>
              <sphereGeometry args={[1, 14, 10]} />
            </mesh>
            <mesh position={[0, 0.07, 0.09]} rotation-x={Math.PI / 2} material={m.sandal}>
              <torusGeometry args={[0.05, 0.012, 6, 16, Math.PI]} />
            </mesh>
          </group>
        ))}

        {/* torso pivots at the waist */}
        <group ref={torso} position-y={0.94}>
          <mesh geometry={geos.shirt} material={m.cloth} />
          {/* collar */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.065, 0.735, 0.1]} rotation={[0.9, 0, s * 0.55]} material={m.cloth}>
              <boxGeometry args={[0.11, 0.07, 0.012]} />
            </mesh>
          ))}
          {/* buttons & pocket */}
          {[0.55, 0.43, 0.31, 0.19].map((y) => (
            <mesh key={y} position={[0, y, shirtRadiusAt(y) + 0.004]} material={m.button}>
              <sphereGeometry args={[0.011, 8, 6]} />
            </mesh>
          ))}
          <mesh position={[-0.15, 0.42, shirtRadiusAt(0.42) - 0.03]} rotation-y={-0.45} material={m.cloth}>
            <boxGeometry args={[0.12, 0.13, 0.01]} />
          </mesh>
          <GoldChains mat={m.gold} />
          {/* neck */}
          <mesh position-y={0.8} material={m.skin}>
            <cylinderGeometry args={[0.085, 0.095, 0.12, 18]} />
          </mesh>

          <Arm side={-1} shoulderRef={shR} elbowRef={elR} m={m} />
          <Arm side={1} shoulderRef={shL} elbowRef={elL} m={m} />

          {/* serving plate (shown in the "present" gesture) */}
          <group ref={plate} position={[0, 0.36, 0.48]} scale={0.0001} visible={false}>
            <group scale={0.24}>
              <mesh geometry={thali} material={brassMaterial('plate', [1, 1])} />
              <BiryaniTop grains={120} y={0.035} radius={0.75} />
            </group>
          </group>

          {/* head pivots at the neck */}
          <group ref={head} position-y={0.84}>
            <group position-y={0.26}>
              <mesh scale={[1, 1.08, 0.98]} material={m.skin}>
                <sphereGeometry args={[0.27, 40, 30]} />
              </mesh>
              {/* hair */}
              <mesh geometry={geos.hairCap} material={m.hair} position={[0, 0.02, -0.012]} rotation-x={-0.32} scale={[1.02, 1.1, 1.02]} />
              <mesh position={[0.02, 0.24, 0.12]} rotation={[0.5, 0, -0.3]} scale={[0.17, 0.08, 0.1]} material={m.hair}>
                <sphereGeometry args={[1, 18, 12]} />
              </mesh>
              {/* ears + earrings */}
              {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.27, -0.01, -0.01]}>
                  <mesh scale={[0.035, 0.06, 0.04]} material={m.skin}>
                    <sphereGeometry args={[1, 12, 10]} />
                  </mesh>
                  <mesh position={[0, -0.065, 0.01]} material={m.gold}>
                    <sphereGeometry args={[0.014, 10, 8]} />
                  </mesh>
                </group>
              ))}
              {/* beard + moustache + smile */}
              <mesh geometry={geos.beard} material={m.hair} position={[0, 0.0, 0.01]} scale={[1.04, 1.12, 1.06]} />
              {/* sideburns joining hair and beard */}
              {[-1, 1].map((s) => (
                <mesh key={`sb${s}`} position={[s * 0.255, -0.02, 0.04]} rotation-z={s * 0.12} scale={[0.04, 0.12, 0.08]} material={m.hair}>
                  <sphereGeometry args={[1, 12, 10]} />
                </mesh>
              ))}
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.045, -0.06, 0.255]} rotation-z={s * 1.35} material={m.hair}>
                  <capsuleGeometry args={[0.018, 0.06, 4, 8]} />
                </mesh>
              ))}
              <mesh position={[0, -0.112, 0.247]} scale={[0.062, 0.03, 0.02]} material={m.lip}>
                <sphereGeometry args={[1, 14, 8]} />
              </mesh>
              <mesh position={[0, -0.104, 0.256]} scale={[0.05, 0.016, 0.012]} material={m.teeth}>
                <sphereGeometry args={[1, 14, 8]} />
              </mesh>
              {/* nose */}
              <mesh position={[0, -0.01, 0.272]} scale={[1, 0.9, 0.9]} material={m.skin}>
                <sphereGeometry args={[0.038, 16, 12]} />
              </mesh>
              {/* eyes */}
              {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.092, 0.05, 0.215]}>
                  <mesh material={m.eyeWhite}>
                    <sphereGeometry args={[0.055, 20, 16]} />
                  </mesh>
                  <mesh position-z={0.035} material={m.iris}>
                    <sphereGeometry args={[0.032, 16, 12]} />
                  </mesh>
                  <mesh position-z={0.055} material={m.pupil}>
                    <sphereGeometry args={[0.016, 12, 10]} />
                  </mesh>
                  <mesh position={[0.012, 0.014, 0.066]} material={m.eyeWhite}>
                    <sphereGeometry args={[0.007, 8, 6]} />
                  </mesh>
                  {/* eyebrow */}
                  <mesh position={[0, 0.085, 0.03]} rotation={[0, 0, s * -0.12]} material={m.hair}>
                    <capsuleGeometry args={[0.014, 0.07, 4, 8]} />
                  </mesh>
                </group>
              ))}
              <group ref={lids}>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[s * 0.092, 0.096, 0.218]} scale={[1, 0.12, 1]} material={m.skin}>
                    <sphereGeometry args={[0.059, 20, 12]} />
                  </mesh>
                ))}
              </group>
              {/* tilak */}
              <mesh position={[0, 0.155, 0.255]} rotation-x={-0.35} material={m.tilak}>
                <capsuleGeometry args={[0.012, 0.045, 4, 8]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
