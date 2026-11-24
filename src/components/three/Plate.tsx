import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { katoriGeometry, mintLeafGeometry, thaliGeometry } from './geometries';
import { brassMaterial, ingredientMaterials } from './materials';
import { BiryaniTop } from './Handi';
import { PLATE_CENTER } from './Ingredients';
import { phases, story } from './storyState';

/** Chapter 4 — the plated biryani composition the ingredients settle into. */
export function PlatedBiryani({ grains }: { grains: number }) {
  const ref = useRef<THREE.Group>(null);
  const thali = useMemo(() => thaliGeometry(), []);
  const katori = useMemo(() => katoriGeometry(), []);
  const leaf = useMemo(() => mintLeafGeometry(0.2), []);
  const mats = ingredientMaterials();
  const brass = brassMaterial('plate', [3, 1]);
  const raita = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f5efe2', roughness: 0.4 }), []);
  const onion = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#c97aa8', roughness: 0.3, transmission: 0.2, thickness: 0.05 }),
    [],
  );
  const lemon = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2d43b', roughness: 0.45 }), []);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const k = phases(story.p).plate;
    g.visible = k > 0.001;
    const e = 1 - Math.pow(1 - k, 3);
    g.scale.setScalar(Math.max(0.0001, e));
    g.position.set(PLATE_CENTER.x, PLATE_CENTER.y - 0.6 * (1 - e), PLATE_CENTER.z);
    g.rotation.y = (1 - e) * 1.4 + state.clock.elapsedTime * 0.03;
  });

  return (
    <group ref={ref} visible={false}>
      <mesh geometry={thali} material={brass} />
      <group position={[-0.12, 0.035, 0.05]}>
        <BiryaniTop grains={grains} y={0} radius={0.68} />
      </group>
      <group position={[0.82, 0.035, -0.4]}>
        <mesh geometry={katori} material={brass} />
        <mesh position-y={0.16} rotation-x={-Math.PI / 2} material={raita}>
          <circleGeometry args={[0.28, 32]} />
        </mesh>
        <mesh geometry={leaf} material={mats.mint} position={[0.02, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0.7]} />
      </group>
      {[
        [0.78, 0.07, 0.42, 0],
        [0.9, 0.08, 0.3, 0.6],
        [0.68, 0.09, 0.3, 1.2],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[-Math.PI / 2 + 0.1, 0, r]} material={onion}>
          <torusGeometry args={[0.1, 0.016, 8, 28]} />
        </mesh>
      ))}
      <mesh position={[0.45, 0.1, 0.78]} rotation={[0, 0.6, 0]} scale={[1, 0.75, 1]} material={lemon}>
        <sphereGeometry args={[0.13, 20, 14, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
}
