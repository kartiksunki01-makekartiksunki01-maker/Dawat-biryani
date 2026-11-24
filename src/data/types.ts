// Shared, framework-free types for the restaurant configuration.
// Kept free of DOM/React imports so vite.config.ts can read the same data for SEO.

export type Diet = 'veg' | 'non-veg' | 'unconfirmed';

export type CategoryId = 'chicken' | 'mutton' | 'seafood' | 'vegetarian' | 'gravies';

export interface Variant {
  id: string;
  /** Label shown to customers. Portion names are provisional until the owner confirms them. */
  label: string;
  /** Price in INR. */
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  /** null = not yet categorised (shown under "All" only). */
  category: CategoryId | null;
  diet: Diet;
  /** Empty for "enquire for price" items. */
  variants: Variant[];
  status: 'available' | 'enquire';
  /** Path relative to /public. */
  image?: string;
  /** 'promotional' = cropped from the brand's promotional artwork, not a photo of an actual serving. */
  imageKind?: 'promotional' | 'photo';
  description: string;
  /** Only fill once confirmed by the restaurant. */
  spiceLevel?: 1 | 2 | 3;
  /** Only fill once confirmed by the restaurant. */
  ingredients?: string[];
  /** Only fill once confirmed by the restaurant. */
  allergens?: string[];
}

export interface GalleryItem {
  src: string;
  alt: string;
  caption: string;
  kind: 'promotional' | 'photo';
}

export interface VideoItem {
  /** YouTube video / Short ID, e.g. "dQw4w9WgXcQ". */
  youtubeId: string;
  title: string;
}

export interface Review {
  author: string;
  text: string;
  /** Only include a rating that you can verify on the source. */
  rating?: number;
  source: 'Google' | 'Instagram' | 'YouTube' | 'In person';
  date?: string;
  url?: string;
}

export interface TimelineEntry {
  date: string; // ISO yyyy-mm-dd
  title: string;
  note: string;
}
