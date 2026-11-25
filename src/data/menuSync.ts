// Loads dishes, prices, offers and settings from Supabase (one RPC: get_storefront) and keeps the
// in-memory `menu` array — which every component reads — in sync.
//
// Order of truth:  live backend  →  last copy saved in this browser  →  built-in menu (restaurant.ts).
// A genuinely empty menu from the backend is shown as empty (it does NOT fall back to old items).
import { create } from 'zustand';
import { publicClient, backendConfigured } from '../lib/supabase';
import { menu } from './restaurant';
import type { CategoryId, MenuItem } from './types';

const CACHE_KEY = 'dawat-storefront-v2';

export interface PublicOffer {
  id: string;
  title: string;
  description: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  code: string | null;
  applies_to: 'all' | 'dishes' | 'categories';
  dish_ids: string[];
  category_ids: string[];
  min_order: number;
  max_discount: number | null;
  ends_at: string | null;
  banner_url: string | null;
}

export interface RestaurantSettings {
  name: string;
  address: string;
  phone_e164: string;
  phone_display: string;
  whatsapp_number: string | null;
  whatsapp_confirmed: boolean;
  opens_at: string;
  closes_at: string;
  open_days: number[];
  closed_dates: string[];
  online_ordering_enabled: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  delivery_charge: number;
  free_delivery_above: number | null;
  delivery_area_note: string;
  min_order_value: number;
  default_prep_minutes: number;
  min_lead_minutes: number;
  max_days_ahead: number;
  order_notice: string;
}

export interface WebsiteSettings {
  announcement_enabled: boolean;
  announcement_text: string;
  intro_enabled: boolean;
  intro_duration_ms: number;
  intro_for_returning: boolean;
  music_enabled: boolean;
  music_url: string | null;
  music_title: string;
  music_volume: number;
  sfx_enabled: boolean;
  character_enabled: boolean;
  character_messages: Record<string, string>;
  featured_dish_ids: string[];
}

interface StorefrontPayload {
  server_time: string;
  categories: { id: string; label: string }[];
  dishes: {
    id: string;
    name: string;
    category_id: string | null;
    diet: MenuItem['diet'];
    status: MenuItem['status'];
    image_path: string | null;
    image_kind: 'promotional' | 'photo' | null;
    description: string;
    is_sold_out: boolean;
    is_chef_special: boolean;
    spice_level: 1 | 2 | 3 | null;
    variants: { id: string; label: string; price: number | string; is_available: boolean }[];
  }[];
  offers: PublicOffer[];
  restaurant: RestaurantSettings | null;
  website: WebsiteSettings | null;
}

export type MenuSource = 'static' | 'cache' | 'live';

interface StorefrontState {
  /** Increments whenever `menu` is replaced — components subscribe to re-render. */
  version: number;
  source: MenuSource;
  offers: PublicOffer[];
  restaurant: RestaurantSettings | null;
  website: WebsiteSettings | null;
  /** Clock offset (server − browser) in ms, so "open now" uses the server's time. */
  clockSkewMs: number;
  loadError: boolean;
}

export const useStorefront = create<StorefrontState>(() => ({
  version: 0,
  source: 'static',
  offers: [],
  restaurant: null,
  website: null,
  clockSkewMs: 0,
  loadError: false,
}));

/** Kept for existing components. */
export const useMenuVersion = useStorefront;

/** Online ordering needs real database ids for every portion. */
export const canOrderOnline = () => backendConfigured && useStorefront.getState().source !== 'static';

export function toMenu(p: StorefrontPayload): MenuItem[] {
  return p.dishes.map((d) => ({
    id: d.id,
    name: d.name,
    category: (d.category_id as CategoryId | null) ?? null,
    diet: d.diet,
    status: d.status,
    variants: d.variants.map((v) => ({ id: v.id, label: v.label, price: Number(v.price), available: v.is_available })),
    image: d.image_path ?? undefined,
    imageKind: d.image_kind ?? undefined,
    description: d.description,
    spiceLevel: d.spice_level ?? undefined,
    soldOut: d.is_sold_out,
    chefSpecial: d.is_chef_special,
  }));
}

const listeners: (() => void)[] = [];
/** Called after every menu replacement (used by the cart to migrate old saved items). */
export const onMenuReplaced = (fn: () => void) => listeners.push(fn);

function apply(p: StorefrontPayload, source: MenuSource) {
  menu.splice(0, menu.length, ...toMenu(p));
  useStorefront.setState((s) => ({
    version: s.version + 1,
    source,
    offers: (p.offers ?? []).map((o) => ({
      ...o,
      discount_value: Number(o.discount_value),
      min_order: Number(o.min_order),
      max_discount: o.max_discount == null ? null : Number(o.max_discount),
    })),
    restaurant: p.restaurant
      ? { ...p.restaurant, delivery_charge: Number(p.restaurant.delivery_charge), min_order_value: Number(p.restaurant.min_order_value),
          free_delivery_above: p.restaurant.free_delivery_above == null ? null : Number(p.restaurant.free_delivery_above) }
      : null,
    website: p.website ? { ...p.website, music_volume: Number(p.website.music_volume) } : null,
    clockSkewMs: source === 'live' && p.server_time ? new Date(p.server_time).getTime() - Date.now() : s.clockSkewMs,
    loadError: false,
  }));
  listeners.forEach((fn) => fn());
}

// 1) instant: the last good copy saved in this browser
if (backendConfigured) {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) apply(JSON.parse(cached) as StorefrontPayload, 'cache');
  } catch {
    /* private mode / corrupted cache — ignore */
  }
}

let inflight: Promise<boolean> | null = null;
/** 2) fresh from Supabase. Resolves true when live data was applied. */
export function syncMenu(): Promise<boolean> {
  if (!publicClient) return Promise.resolve(false);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await publicClient.rpc('get_storefront');
      if (error || !data || !Array.isArray((data as StorefrontPayload).dishes)) {
        useStorefront.setState({ loadError: true });
        return false;
      }
      apply(data as StorefrontPayload, 'live');
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {
        /* storage full — ignore */
      }
      return true;
    } catch {
      useStorefront.setState({ loadError: true });
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Offers that apply automatically or by code to a given dish (for menu badges). */
export function offersForDish(item: MenuItem, offers: PublicOffer[]): PublicOffer[] {
  return offers.filter(
    (o) =>
      o.applies_to === 'all' ||
      (o.applies_to === 'dishes' && o.dish_ids.includes(item.id)) ||
      (o.applies_to === 'categories' && !!item.category && o.category_ids.includes(item.category)),
  );
}

export const offerLabel = (o: PublicOffer) =>
  o.discount_type === 'percent' ? `${Number(o.discount_value)}% off` : `₹${Number(o.discount_value)} off`;
