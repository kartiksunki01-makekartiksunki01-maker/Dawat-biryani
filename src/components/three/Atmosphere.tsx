import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { charcoalGeometry } from './geometries';
import { charcoalMaterial } from './materials';
import { dotTexture, floorGlowTexture, smokeTexture } from './textures';
import { mulberry32 } from './storyState';

/* ─────────────── Steam (GPU point sprites) ─────────────── */

const steamVert = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uRise;
  uniform float uSpread;
  attribute vec4 aSeed;
  varying float vAlpha;
  varying float vLife;
  varying float vRot;
  void main() {
    float life = fract(uTime * aSeed.z + aSeed.w);
    vec3 p = position;
    p.xz *= 1.0 + uSpread * life;
    p.y += life * uRise;
    p.x += sin(life * 5.0 + aSeed.w * 12.0 + uTime * 0.5) * 0.22 * life;
    p.z += cos(life * 4.0 + aSeed.w * 9.0 + uTime * 0.4) * 0.22 * life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.35 + life * 1.3) * uPixelRatio * (260.0 / -mv.z);
    vAlpha = smoothstep(0.0, 0.18, life) * (1.0 - smoothstep(0.5, 1.0, life)) * uIntensity;
    vLife = life;
    vRot = aSeed.w * 6.2831;
  }
`;
const steamFrag = /* glsl */ `
  uniform sampler2D uTex;
  varying float vAlpha;
  varying float vLife;
  varying float vRot;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    uv = mat2(c, -s, s, c) * uv + 0.5;
    float a = texture2D(uTex, uv).a * vAlpha;
    if (a < 0.004) discard;
    vec3 col = mix(vec3(1.0, 0.82, 0.58), vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.45, vLife));
    gl_FragColor = vec4(col, a);
  }
`;

interface SteamProps {
  count: number;
  /** 'ring' leaks from the dough seal, 'plume' rises from the open handi */
  mode: 'ring' | 'plume';
  radius: number;
  y: number;
  rise?: number;
  size?: number;
  speed?: number;
  /** returns 0..1 each frame */
  intensity: () => number;
}

export function Steam({ count, mode, radius, y, rise = 3, size = 4.5, speed = 1, intensity }: SteamProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const dpr = useThree((s) => s.viewport.dpr);
  const geo = useMemo(() => {
    const rnd = mulberry32(mode === 'ring' ? 91 : 92);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = mode === 'ring' ? radius * (0.96 + rnd() * 0.08) : radius * Math.sqrt(rnd());
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y + rnd() * 0.05;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i * 4] = rnd();
      seed[i * 4 + 1] = rnd();
      seed[i * 4 + 2] = (0.07 + rnd() * 0.08) * speed;
      seed[i * 4 + 3] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    return g;
  }, [count, mode, radius, y, speed]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uSize: { value: size },
      uPixelRatio: { value: dpr },
      uRise: { value: rise },
      uSpread: { value: mode === 'ring' ? 0.5 : 1.1 },
      uTex: { value: smokeTexture() },
    }),
    [],
  );

  useFrame((state) => {
    const m = matRef.current;
    if (!m) return;
    const k = intensity();
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uIntensity.value = k;
    m.uniforms.uPixelRatio.value = state.viewport.dpr;
    if (pointsRef.current) pointsRef.current.visible = k > 0.003;
  });

  return (
    <points ref={pointsRef} geometry={geo} frustumCulled={false} renderOrder={10}>
      <shaderMaterial
        ref={matRef}
        vertexShader={steamVert}
        fragmentShader={steamFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

/* ─────────────── Additive particles: golden dust & sparks ─────────────── */

const glowVert = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uMode; // 0 = drifting dust, 1 = rising sparks
  uniform float uRise;
  attribute vec4 aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float a;
    if (uMode < 0.5) {
      p.x += sin(uTime * 0.11 * (0.5 + aSeed.x) + aSeed.y * 30.0) * 0.6;
      p.y += sin(uTime * 0.09 * (0.5 + aSeed.y) + aSeed.z * 20.0) * 0.45;
      p.z += cos(uTime * 0.07 + aSeed.x * 10.0) * 0.4;
      a = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (1.0 + aSeed.z * 2.5) + aSeed.w * 40.0));
    } else {
      float life = fract(uTime * (0.18 + aSeed.z * 0.25) + aSeed.w);
      p.y += life * uRise;
      p.x += sin(life * 9.0 + aSeed.x * 20.0) * 0.25 * life;
      p.z += cos(life * 7.0 + aSeed.y * 20.0) * 0.25 * life;
      a = (1.0 - life) * smoothstep(0.0, 0.08, life);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + aSeed.x * 0.8) * uPixelRatio * (40.0 / -mv.z);
    vAlpha = a;
  }
`;
const glowFrag = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float a = texture2D(uTex, gl_PointCoord).a * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

interface GlowProps {
  count: number;
  mode: 'dust' | 'sparks';
  color: string;
  size: number;
  opacity?: () => number;
  timeScale?: number;
}

export function GlowParticles({ count, mode, color, size, opacity, timeScale = 1 }: GlowProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => {
    const rnd = mulberry32(mode === 'dust' ? 5 : 6);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      if (mode === 'dust') {
        pos[i * 3] = (rnd() - 0.5) * 16;
        pos[i * 3 + 1] = -1 + rnd() * 8;
        pos[i * 3 + 2] = -8 + rnd() * 12;
      } else {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * 1.5;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = -0.3;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    return g;
  }, [count, mode]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: size },
      uPixelRatio: { value: 1 },
      uMode: { value: mode === 'dust' ? 0 : 1 },
      uRise: { value: 2.8 },
      uTex: { value: dotTexture() },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
    }),
    [],
  );
  useFrame((state) => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime * timeScale;
    m.uniforms.uPixelRatio.value = state.viewport.dpr;
    m.uniforms.uOpacity.value = opacity ? opacity() : 1;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={glowVert}
        fragmentShader={glowFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ─────────────── Charcoal bed with flickering glow ─────────────── */

export function CoalBed({ count = 22, flicker = true }: { count?: number; flicker?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const geo = useMemo(() => charcoalGeometry(), []);
  const mat = charcoalMaterial();
  useLayoutEffect(() => {
    const rnd = mulberry32(33);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.4;
      const r = 0.25 + Math.sqrt(rnd()) * 1.35;
      d.position.set(Math.cos(a) * r, -0.42 + rnd() * 0.12, Math.sin(a) * r);
      d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      d.scale.setScalar(0.5 + rnd() * 0.5);
      d.updateMatrix();
      ref.current!.setMatrixAt(i, d.matrix);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [count]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = flicker
      ? 0.82 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 13.1 + 1.3) * 0.05 + Math.sin(t * 2.1) * 0.07
      : 0.9;
    mat.emissiveIntensity = 2.0 * f;
    if (light.current) light.current.intensity = 7 * f;
  });
  return (
    <group>
      <instancedMesh ref={ref} args={[geo, mat, count]} />
      <pointLight ref={light} position={[0, -0.15, 0]} color="#ff6a1f" distance={5} decay={2} intensity={7} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.5} renderOrder={-1}>
        <circleGeometry args={[5.5, 48]} />
        <meshBasicMaterial map={floorGlowTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/* ─────────────── Royal arches receding into darkness ─────────────── */

function archShape(w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h * 0.58);
  s.bezierCurveTo(-w / 2, h * 0.8, -w * 0.1, h * 0.82, 0, h);
  s.bezierCurveTo(w * 0.1, h * 0.82, w / 2, h * 0.8, w / 2, h * 0.58);
  s.lineTo(w / 2, 0);
  return s;
}

export function RoyalArches() {
  const geos = useMemo(() => {
    return [0, 1, 2].map((i) => {
      const w = 7 + i * 0.2;
      const h = 8.4 + i * 0.2;
      const outer = archShape(w + 0.5, h + 0.5);
      const hole = archShape(w, h);
      outer.holes.push(new THREE.Path(hole.getPoints(48)));
      return new THREE.ShapeGeometry(outer, 48);
    });
  }, []);
  return (
    <group position={[0, -0.6, 0]}>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} position={[0, 0, -7 - i * 3.2]}>
          <meshBasicMaterial color="#d4af37" transparent opacity={0.16 - i * 0.04} fog />
        </mesh>
      ))}
      <mesh position={[0, 3.8, -12]}>
        <planeGeometry args={[18, 12]} />
        <meshBasicMaterial map={floorGlowTexture()} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
