import * as THREE from 'three';
import {
  barkTexture,
  biryaniTexture,
  charcoalEmissive,
  doughTexture,
  engravingMaps,
  hammeredMaps,
} from './textures';

const cache = new Map<string, THREE.Material>();
function once<T extends THREE.Material>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function repeated(t: THREE.Texture, x: number, y: number) {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}

/** Hammered, aged brass. `repeat` controls dimple density for different surfaces. */
export function brassMaterial(key: 'body' | 'lid' | 'plate', repeat: [number, number]) {
  return once(`brass-${key}`, () => {
    if (key === 'plate') {
      // polished, un-hammered thali
      return new THREE.MeshPhysicalMaterial({
        color: '#e2b663',
        metalness: 1,
        roughness: 0.26,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
        side: THREE.DoubleSide,
      });
    }
    const m = hammeredMaps();
    return new THREE.MeshPhysicalMaterial({
      color: '#d4a04a',
      metalness: 1,
      roughness: 1,
      map: repeated(m.color, ...repeat),
      roughnessMap: repeated(m.roughness, ...repeat),
      normalMap: repeated(m.normal, ...repeat),
      normalScale: new THREE.Vector2(0.42, 0.42),
      clearcoat: 0.3,
      clearcoatRoughness: 0.4,
      side: THREE.DoubleSide,
    });
  });
}

export const engravedBandMaterial = () =>
  once('band', () => {
    const e = engravingMaps();
    const bump = e.bump.clone();
    bump.repeat.set(3, 1);
    bump.wrapS = THREE.RepeatWrapping;
    bump.needsUpdate = true;
    const color = e.color.clone();
    color.repeat.set(3, 1);
    color.wrapS = THREE.RepeatWrapping;
    color.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({
      color: '#c9953e',
      metalness: 1,
      roughness: 0.32,
      map: color,
      bumpMap: bump,
      bumpScale: 2.2,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
    });
  });

export const goldTrimMaterial = () =>
  once('gold-trim', () => new THREE.MeshStandardMaterial({ color: '#e7bd5d', metalness: 1, roughness: 0.22 }));

export const doughMaterial = () =>
  once('dough', () => {
    const t = doughTexture();
    const map = repeated(t, 6, 1);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map,
      bumpMap: repeated(t, 6, 1),
      bumpScale: 1.5,
      roughness: 0.9,
      color: '#ffffff',
    });
  });

export const biryaniMaterial = () =>
  once('biryani', () => new THREE.MeshStandardMaterial({ map: biryaniTexture(), roughness: 0.72, metalness: 0 }));

export const charcoalMaterial = () =>
  once('charcoal', () =>
    new THREE.MeshStandardMaterial({
      color: '#18120f',
      roughness: 0.95,
      emissive: new THREE.Color('#ff6a1a'),
      emissiveMap: repeated(charcoalEmissive(), 1, 1),
      emissiveIntensity: 2.2,
    }),
  );

export const ingredientMaterials = () => ({
    rice: once('rice', () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 })),
    saffron: once(
      'saffron',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#c81d25',
          roughness: 0.5,
          emissive: new THREE.Color('#7a0f00'),
          emissiveIntensity: 0.6,
        }),
    ),
    staranise: once('staranise', () => new THREE.MeshStandardMaterial({ color: '#5b2814', roughness: 0.82 })),
    cardamom: once('cardamom', () => new THREE.MeshStandardMaterial({ color: '#86a552', roughness: 0.7 })),
    cinnamon: once(
      'cinnamon',
      () =>
        new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.85, side: THREE.DoubleSide }),
    ),
    clove: once('clove', () => new THREE.MeshStandardMaterial({ color: '#4a2313', roughness: 0.8 })),
    mint: once(
      'mint',
      () => new THREE.MeshStandardMaterial({ color: '#2e8b3a', roughness: 0.5, side: THREE.DoubleSide }),
    ),
    coriander: once(
      'coriander',
      () => new THREE.MeshStandardMaterial({ color: '#46a03e', roughness: 0.55, side: THREE.DoubleSide }),
    ),
    onion: once('onion', () => new THREE.MeshStandardMaterial({ color: '#7d3410', roughness: 0.6 })),
    chicken: once(
      'chicken',
      () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.5 }),
    ),
    paneer: once('paneer', () => new THREE.MeshStandardMaterial({ color: '#f3e4c4', roughness: 0.78 })),
  });
