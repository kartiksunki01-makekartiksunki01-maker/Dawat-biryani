/**
 * ─────────────────────────────────────────────────────────────
 *  DAWAT BIRYANI HOUSE — central restaurant configuration
 * ─────────────────────────────────────────────────────────────
 *  Edit this one file to update business details, prices, menu,
 *  social links, gallery and reviews. Every component reads from here.
 *
 *  Anything marked "CONFIRM" is waiting for the owner's confirmation.
 *  Do not add ratings, reviews, awards or claims that cannot be verified.
 */
import type {
  CategoryId,
  GalleryItem,
  MenuItem,
  Review,
  TimelineEntry,
  VideoItem,
} from './types.ts';

export const restaurant = {
  name: 'Dawat Biryani House',
  tagline: 'The Royal Taste of Hyderabad',
  creativeTagline: 'Unlock Unlimited Taste',
  founder: 'Mr. Ganesh Kalyadap',

  address: {
    line1: 'Opposite Padmashree School',
    line2: 'B.N.N. College Road, Dhamankar Naka',
    city: 'Bhiwandi',
    state: 'Maharashtra',
    postalCode: '421305',
    country: 'India',
    countryCode: 'IN',
  },

  /** Used for the "Get directions" link and the map embed. */
  mapsQuery:
    'Dawat Biryani House, Opposite Padmashree School, B.N.N. College Road, Dhamankar Naka, Bhiwandi, Maharashtra 421305',

  hours: {
    open: '10:00', // 24h, Asia/Kolkata
    close: '22:00',
    display: '10:00 AM – 10:00 PM',
    timezone: 'Asia/Kolkata',
    /** 0 = Sunday … 6 = Saturday. CONFIRM: assumed open every day — remove any weekly off-day. */
    days: [0, 1, 2, 3, 4, 5, 6],
    daysConfirmed: false,
  },

  phone: {
    e164: '+919823324553',
    display: '+91 98233 24553',
  },

  /** CONFIRM: set to true once the owner confirms this number takes WhatsApp orders. */
  whatsapp: {
    number: '919823324553',
    confirmed: false,
  },

  social: {
    instagram: 'https://www.instagram.com/dawat_biryani.house/',
    instagramHandle: '@dawat_biryani.house',
    youtube: 'https://youtube.com/@DawatBiryani',
    youtubeHandle: '@DawatBiryani',
    google: 'https://share.google/KOk8JvC1YqLWS2DWb',
  },

  /**
   * Figures read from screenshots supplied on 24 Nov 2026.
   * Always display them as a dated snapshot — they are not live numbers.
   */
  socialSnapshot: {
    date: '2026-11-24',
    instagramFollowers: '1.8K+',
    youtubeSubscribers: '145',
    youtubeVideos: '47',
    shortsViews: ['~47K', '~18K'],
  },

  values: [
    { title: 'Taste', text: 'Authentic-style Hyderabadi flavours.' },
    { title: 'Cleanliness', text: 'Care in how food is prepared and handled.' },
    { title: 'Customer satisfaction', text: 'Every guest leaves happy — that is the goal.' },
    { title: 'Quality & consistency', text: 'The same taste, visit after visit.' },
    { title: 'Affordable pricing', text: 'Royal flavour at an everyday price.' },
    { title: 'South Indian hospitality', text: 'A warm welcome, every time.' },
    { title: 'Royal Hyderabadi identity', text: 'Inspired by the kitchens of Hyderabad.' },
  ],

  /** From the restaurant's own social posts (screenshots supplied). Not independently verified. */
  timeline: [
    {
      date: '2026-05-09',
      title: 'Doors open in Bhiwandi',
      note: 'Shop-opening announcement shared on the restaurant’s social media.',
    },
    {
      date: '2026-06-08',
      title: 'One month of Dawat',
      note: 'One-month milestone post shared on the restaurant’s social media.',
    },
  ] satisfies TimelineEntry[],

  bulk: {
    minKg: 1,
    maxKg: 20,
    /** From the supplied poster — advertised for Paneer Biryani. */
    advertisedFor: 'Paneer Biryani',
    anytimeUpToKg: 5,
    advanceNoticeHours: 2,
    /** CONFIRM: per-kg rates. Leave null to request a custom quotation instead of showing prices. */
    pricePerKg: null as Record<string, number> | null,
    eventTypes: ['Family function', 'Birthday', 'Wedding / engagement', 'Office party', 'Religious gathering', 'Other'],
  },

  hotBox: {
    /** CONFIRM: hours the hot box keeps food warm. Shown only when verified is true. */
    warmHours: null as number | null,
    verified: false,
  },
} as const;

/* ─────────────────────────── Menu ─────────────────────────── */

/** CONFIRM: the supplied menu photo listed two prices for some dishes without naming the portions. */
export const portionLabels = {
  small: 'Regular',
  large: 'Large',
  confirmed: false,
};

export const categories: { id: 'all' | CategoryId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'chicken', label: 'Chicken' },
  { id: 'mutton', label: 'Mutton' },
  { id: 'seafood', label: 'Seafood' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'gravies', label: 'Gravies' },
];

const two = (small: number, large: number) => [
  { id: 'small', label: portionLabels.small, price: small },
  { id: 'large', label: portionLabels.large, price: large },
];
const one = (price: number) => [{ id: 'std', label: 'Standard', price }];

/** Prices from the restaurant's menu photograph. The crossed-out ₹150 Chicken Tikka price is NOT used. */
export const menu: MenuItem[] = [
  {
    id: 'chicken-dum-biryani',
    name: 'Chicken Dum Biryani',
    category: 'chicken',
    diet: 'non-veg',
    variants: two(110, 150),
    status: 'available',
    image: 'assets/images/dishes/chicken-dum.webp',
    imageKind: 'promotional',
    description: 'Hyderabadi-style chicken dum biryani with aromatic basmati rice.',
  },
  {
    id: 'chicken-fry-piece-biryani',
    name: 'Chicken Fry Piece Biryani',
    category: 'chicken',
    diet: 'non-veg',
    variants: two(130, 170),
    status: 'available',
    image: 'assets/images/dishes/chicken-fry-piece.webp',
    imageKind: 'promotional',
    description: 'Biryani served with fried chicken pieces.',
  },
  {
    id: 'chicken-tikka-biryani',
    name: 'Chicken Tikka Biryani',
    category: 'chicken',
    diet: 'non-veg',
    variants: one(180),
    status: 'available',
    image: 'assets/images/dishes/chicken-tikka.webp',
    imageKind: 'promotional',
    description: 'Biryani paired with chicken tikka.',
  },
  {
    id: 'mutton-biryani',
    name: 'Mutton Biryani',
    category: 'mutton',
    diet: 'non-veg',
    variants: one(220),
    status: 'available',
    image: 'assets/images/dishes/mutton.webp',
    imageKind: 'promotional',
    description: 'Hyderabadi-style biryani with mutton.',
  },
  {
    id: 'prawns-biryani',
    name: 'Prawns Biryani',
    category: 'seafood',
    diet: 'non-veg',
    variants: one(220),
    status: 'available',
    image: 'assets/images/dishes/prawns.webp',
    imageKind: 'promotional',
    description: 'Biryani with prawns.',
  },
  {
    id: 'chicken-gravy',
    name: 'Chicken Gravy',
    category: 'gravies',
    diet: 'non-veg',
    variants: two(120, 160),
    status: 'available',
    image: 'assets/images/dishes/chicken-gravy.webp',
    imageKind: 'promotional',
    description: 'Chicken in a rich gravy — a companion for your biryani.',
  },
  {
    id: 'vajdi-gravy',
    name: 'Vajdi Gravy',
    category: 'gravies',
    diet: 'non-veg',
    variants: one(140),
    status: 'available',
    image: 'assets/images/dishes/vajdi-gravy.webp',
    imageKind: 'promotional',
    description: 'A non-vegetarian house gravy. Ask the restaurant about its ingredients.',
  },
  {
    id: 'vegetable-paneer-biryani',
    name: 'Vegetable Paneer Biryani',
    category: 'vegetarian',
    diet: 'veg',
    variants: two(110, 150),
    status: 'available',
    image: 'assets/images/dishes/veg-paneer.webp',
    imageKind: 'promotional',
    description: 'Vegetarian biryani with vegetables and paneer.',
  },
  // ── Mentioned by the business; names, prices and availability still to be confirmed ──
  {
    id: 'veg-dum-biryani',
    name: 'Veg Dum Biryani',
    category: 'vegetarian',
    diet: 'veg',
    variants: [],
    status: 'enquire',
    description: 'Price and availability on enquiry.',
  },
  {
    id: 'paneer-tikka-biryani',
    name: 'Paneer Tikka Biryani',
    category: 'vegetarian',
    diet: 'veg',
    variants: [],
    status: 'enquire',
    description: 'Price and availability on enquiry.',
  },
  {
    id: 'malai-tikka-biryani',
    name: 'Malai Tikka Biryani',
    category: null,
    diet: 'unconfirmed',
    variants: [],
    status: 'enquire',
    description: 'Price, details and availability on enquiry.',
  },
  {
    id: 'banar-biryani',
    name: 'Banar Biryani',
    category: null,
    diet: 'unconfirmed',
    variants: [],
    status: 'enquire',
    description: 'Price, details and availability on enquiry.',
  },
];

/* ─────────────────────── Media & reviews ─────────────────────── */

/** Promotional artwork supplied by the brand. Replace or add real photographs with kind: 'photo'. */
export const gallery: GalleryItem[] = [
  {
    src: 'assets/images/art/hero-handi.webp',
    alt: 'Brass handi of biryani over glowing charcoal',
    caption: 'The dum handi',
    kind: 'promotional',
  },
  {
    src: 'assets/images/art/ingredients.webp',
    alt: 'Biryani ingredients rising above a brass handi',
    caption: 'Ingredients in motion',
    kind: 'promotional',
  },
  {
    src: 'assets/images/art/handi-feast.webp',
    alt: 'Open copper handi of chicken biryani with steam',
    caption: 'Ready to serve',
    kind: 'promotional',
  },
  {
    src: 'assets/images/art/menu-handi.webp',
    alt: 'Copper handi of biryani on a maroon cloth',
    caption: 'Royal presentation',
    kind: 'promotional',
  },
  {
    src: 'assets/images/dishes/chicken-dum.webp',
    alt: 'Chicken dum biryani',
    caption: 'Chicken Dum Biryani',
    kind: 'promotional',
  },
  {
    src: 'assets/images/dishes/veg-paneer.webp',
    alt: 'Vegetable paneer biryani',
    caption: 'Vegetable Paneer Biryani',
    kind: 'promotional',
  },
];

/** Add YouTube video / Short IDs here to show them in the gallery's video player. */
export const videos: VideoItem[] = [];

/** Real, verifiable photos for the "Crafted with Care" section. None supplied yet. */
export const careMedia: GalleryItem[] = [];

/**
 * Only add genuine reviews you have permission to show, one entry per distinct customer.
 * Never invent reviews or an average rating.
 */
export const reviews: Review[] = [];

/* ─────────────────────────── Helpers ─────────────────────────── */

export const priceRange = (() => {
  const prices = menu.flatMap((m) => m.variants.map((v) => v.price));
  return { min: Math.min(...prices), max: Math.max(...prices) };
})();

export const fullAddress = `${restaurant.address.line1}, ${restaurant.address.line2}, ${restaurant.address.city}, ${restaurant.address.state} ${restaurant.address.postalCode}`;
