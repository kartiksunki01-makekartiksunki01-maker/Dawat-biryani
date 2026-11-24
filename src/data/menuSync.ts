// Keeps the in-memory `menu` (the single array every component reads) in sync with Supabase.
// Order of safety: static menu from restaurant.ts → last good copy from this browser → fresh copy from Supabase.
// If the backend is missing or offline, the website silently keeps working on whatever it already has.
import { create } from 'zustand';
import { publicClient } from '../lib/supabase';
import { menu } from './restaurant';
import type { CategoryId, MenuItem } from './types';

const CACHE_KEY = 'dawat-menu-cache-v1';

/** Components subscribe to this so they re-render when the menu is replaced. */
export const useMenuVersion = create<{ version: number }>(() => ({ version: 0 }));

interface Row {
  id: string;
  name: string;
  category_id: string | null;
  diet: MenuItem['diet'];
  status: MenuItem['status'];
  image_path: string | null;
  image_kind: 'promotional' | 'photo' | null;
  description: string;
  dish_variants: { label: string; price: number | string; sort_order: number }[];
}

/** Stable variant ids by position so carts saved earlier keep working even if a label is renamed. */
const variantIdFor = (index: number, total: number) => (total === 1 ? 'std' : index === 0 ? 'small' : index === 1 ? 'large' : `v${index}`);

export function rowsToMenu(rows: Row[]): MenuItem[] {
  return rows.map((r) => {
    const sorted = [...(r.dish_variants ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    return {
      id: r.id,
      name: r.name,
      category: (r.category_id as CategoryId | null) ?? null,
      diet: r.diet,
      status: r.status,
      variants: sorted.map((v, i) => ({ id: variantIdFor(i, sorted.length), label: v.label, price: Number(v.price) })),
      image: r.image_path ?? undefined,
      imageKind: r.image_kind ?? undefined,
      description: r.description,
    };
  });
}

function apply(items: MenuItem[]) {
  if (!items.length) return;
  menu.splice(0, menu.length, ...items);
  useMenuVersion.setState((s) => ({ version: s.version + 1 }));
}

// 1) instant: last good copy from this browser (so returning visitors never see old prices flash)
try {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached) as MenuItem[];
    if (Array.isArray(parsed) && parsed.length) menu.splice(0, menu.length, ...parsed);
  }
} catch {
  /* private mode / corrupted cache — ignore */
}

// 2) fresh from Supabase
export async function syncMenu(): Promise<void> {
  if (!publicClient) return;
  try {
    const { data, error } = await publicClient
      .from('dishes')
      .select('id,name,category_id,diet,status,image_path,image_kind,description,dish_variants(label,price,sort_order)')
      .order('sort_order', { ascending: true });
    if (error || !data?.length) return;
    const items = rowsToMenu(data as unknown as Row[]);
    apply(items);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  } catch {
    /* offline — keep what we have */
  }
}
