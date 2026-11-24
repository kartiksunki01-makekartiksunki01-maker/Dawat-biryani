import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { useHost } from '../../stores/hostStore';
import { AnnaModel } from './AnnaModel';

export default function AnnaCanvas({ active, reduced, onReady }: { active: boolean; reduced: boolean; onReady?: () => void }) {
  const gesture = useHost((s) => s.gesture);
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      camera={{ fov: 26, position: [0, 1.45, 5.4], near: 0.1, far: 30 }}
      frameloop={active ? 'always' : 'never'}
      onCreated={({ camera }) => {
        camera.lookAt(0, 1.08, 0);
        onReady?.();
      }}
      aria-hidden
    >
      <ambientLight intensity={0.55} color="#ffe6c8" />
      <directionalLight position={[2.5, 4, 4]} intensity={2.2} color="#fff1d8" />
      <directionalLight position={[-3, 2.5, -2]} intensity={1.6} color="#ffb35c" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2} color="#fff1d2" position={[0, 3, 4]} scale={[5, 3, 1]} target={[0, 1, 0]} />
        <Lightformer form="rect" intensity={1.5} color="#ffb35c" position={[-4, 2, -2]} scale={[3, 3, 1]} target={[0, 1, 0]} />
      </Environment>
      <AnnaModel gesture={gesture} reduced={reduced} />
    </Canvas>
  );
}
