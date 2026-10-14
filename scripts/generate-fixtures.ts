/**
 * SoleIndex — deterministic demo dataset generator.
 *
 *   pnpm fixtures:generate
 *
 * Why this exists
 * ---------------
 * SoleIndex ships with a **committed snapshot** of market data so that three
 * things hold at once:
 *
 *   1. `pnpm dev` works on a fresh clone with no API key and no network.
 *   2. The test suite is deterministic — you cannot unit test an algorithm
 *      against a live endpoint whose answers change every hour.
 *   3. The demo never breaks because a free-tier quota ran out mid-visit.
 *
 * That is the same trade-off the fixture `MarketDataProvider` makes, and it is
 * recorded in docs/adr/0001-provider-adapter.md.
 *
 * Honesty note
 * ------------
 * Product names reference real silhouettes so the UI reads like the real
 * market. **Every price, volume and listing number in `fixtures/` is synthetic**
 * and produced by the seeded generator below. Swap `SOLEINDEX_PROVIDER=kicksdb`
 * and supply an API key to replace the whole dataset with live market data.
 *
 * Everything is seeded from a fixed constant, so regenerating produces a
 * byte-identical snapshot.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* -------------------------------------------------------------------------- */
/* Deterministic PRNG                                                          */
/* -------------------------------------------------------------------------- */

/** mulberry32 — small, fast, and stable across Node versions. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20261014;
const rand = mulberry32(SEED);

const randInt = (min: number, max: number) =>
  min + Math.floor(rand() * (max - min + 1));

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

function pickWeighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

/** Round to the nearest whole dollar — resale prices do not carry odd cents. */
const toDollars = (cents: number) => Math.max(100, Math.round(cents / 100) * 100);

/* -------------------------------------------------------------------------- */
/* Date helpers (UTC-only so results never depend on the host timezone)        */
/* -------------------------------------------------------------------------- */

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7);
}

function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/* -------------------------------------------------------------------------- */
/* Window configuration                                                        */
/* -------------------------------------------------------------------------- */

/** Monday. The last point in every weekly series. */
const AS_OF = '2026-10-05';
/** 78 weekly points = 18 months of history. */
const WEEKS: number = 78;
const FIRST_WEEK = addWeeks(AS_OF, -(WEEKS - 1));
/** 19 monthly buckets (18 full months plus the partial current one). */
const MONTHS = 19;

const weekDates: string[] = Array.from({ length: WEEKS }, (_, i) =>
  addWeeks(FIRST_WEEK, i),
);

const monthDates: string[] = (() => {
  const out: string[] = [];
  let cursor = firstOfMonth(FIRST_WEEK);
  for (let i = 0; i < MONTHS; i += 1) {
    out.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return out;
})();

function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/* -------------------------------------------------------------------------- */
/* Reference data                                                              */
/* -------------------------------------------------------------------------- */

type CategoryId =
  | 'basketball'
  | 'running'
  | 'skateboarding'
  | 'lifestyle'
  | 'training'
  | 'trail';

interface CategoryDef {
  id: CategoryId;
  name: string;
  description: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    description:
      'Everyday silhouettes where resale is driven by colourway and cultural heat rather than performance.',
  },
  {
    id: 'basketball',
    name: 'Basketball',
    description:
      'On-court heritage models. Historically the deepest resale premiums and the most restock-sensitive.',
  },
  {
    id: 'running',
    name: 'Running',
    description:
      'Performance and retro-running. Widely distributed, so premiums are thinner but volume is high.',
  },
  {
    id: 'skateboarding',
    name: 'Skateboarding',
    description:
      'Skate tooling. Demand is durable and less correlated with the broader sneaker cycle.',
  },
  {
    id: 'training',
    name: 'Training',
    description: 'Cross-training and gym models. Smallest resale segment, largely retail-priced.',
  },
  {
    id: 'trail',
    name: 'Trail',
    description:
      'Technical outdoor footwear. Functional materials create a distinct premium tier.',
  },
];

interface SilhouetteDef {
  name: string;
  category: CategoryId;
  /** Retail price in USD. */
  retail: number;
  /** How often this silhouette lands in a hyped release. */
  hype: 'grail' | 'limited' | 'general';
}

interface BrandDef {
  id: string;
  name: string;
  codePrefix: string;
  silhouettes: SilhouetteDef[];
}

const BRANDS: BrandDef[] = [
  {
    id: 'nike',
    name: 'Nike',
    codePrefix: 'DZ',
    silhouettes: [
      { name: 'Air Force 1 Low', category: 'lifestyle', retail: 115, hype: 'general' },
      { name: 'Air Max 1', category: 'running', retail: 140, hype: 'limited' },
      { name: 'Air Max 90', category: 'running', retail: 130, hype: 'general' },
      { name: 'Air Max 95', category: 'running', retail: 175, hype: 'limited' },
      { name: 'Air Max 97', category: 'running', retail: 180, hype: 'general' },
      { name: 'Dunk Low', category: 'lifestyle', retail: 115, hype: 'general' },
      { name: 'SB Dunk Low', category: 'skateboarding', retail: 115, hype: 'grail' },
      { name: 'Air Huarache', category: 'running', retail: 125, hype: 'general' },
      { name: 'Air Max Plus', category: 'running', retail: 175, hype: 'general' },
      { name: 'Vomero 5', category: 'running', retail: 160, hype: 'limited' },
    ],
  },
  {
    id: 'jordan',
    name: 'Jordan',
    codePrefix: 'FQ',
    silhouettes: [
      { name: 'Air Jordan 1 High OG', category: 'basketball', retail: 180, hype: 'grail' },
      { name: 'Air Jordan 1 Low', category: 'basketball', retail: 145, hype: 'general' },
      { name: 'Air Jordan 3', category: 'basketball', retail: 200, hype: 'limited' },
      { name: 'Air Jordan 4', category: 'basketball', retail: 215, hype: 'grail' },
      { name: 'Air Jordan 5', category: 'basketball', retail: 210, hype: 'limited' },
      { name: 'Air Jordan 11', category: 'basketball', retail: 235, hype: 'grail' },
      { name: 'Air Jordan 12', category: 'basketball', retail: 200, hype: 'limited' },
    ],
  },
  {
    id: 'adidas',
    name: 'adidas',
    codePrefix: 'IE',
    silhouettes: [
      { name: 'Samba OG', category: 'lifestyle', retail: 100, hype: 'grail' },
      { name: 'Gazelle Indoor', category: 'lifestyle', retail: 110, hype: 'limited' },
      { name: 'Superstar II', category: 'lifestyle', retail: 100, hype: 'general' },
      { name: 'Campus 00s', category: 'lifestyle', retail: 110, hype: 'limited' },
      { name: 'Handball Spezial', category: 'lifestyle', retail: 110, hype: 'limited' },
      { name: 'Forum Low', category: 'basketball', retail: 110, hype: 'general' },
    ],
  },
  {
    id: 'new-balance',
    name: 'New Balance',
    codePrefix: 'M9',
    silhouettes: [
      { name: '550', category: 'basketball', retail: 110, hype: 'limited' },
      { name: '990v6', category: 'running', retail: 200, hype: 'limited' },
      { name: '9060', category: 'lifestyle', retail: 150, hype: 'limited' },
      { name: '2002R', category: 'running', retail: 145, hype: 'general' },
      { name: '1906R', category: 'running', retail: 155, hype: 'general' },
      { name: '530', category: 'running', retail: 100, hype: 'general' },
    ],
  },
  {
    id: 'asics',
    name: 'ASICS',
    codePrefix: '120',
    silhouettes: [
      { name: 'GEL-KAYANO 14', category: 'running', retail: 160, hype: 'limited' },
      { name: 'GEL-NYC', category: 'lifestyle', retail: 130, hype: 'limited' },
      { name: 'GEL-1130', category: 'running', retail: 110, hype: 'general' },
      { name: 'GT-2160', category: 'running', retail: 120, hype: 'general' },
      { name: 'GEL-Quantum 360', category: 'running', retail: 180, hype: 'general' },
    ],
  },
  {
    id: 'salomon',
    name: 'Salomon',
    codePrefix: 'L47',
    silhouettes: [
      { name: 'XT-6', category: 'trail', retail: 200, hype: 'limited' },
      { name: 'ACS Pro', category: 'trail', retail: 195, hype: 'general' },
      { name: 'Speedcross 3', category: 'trail', retail: 145, hype: 'general' },
      { name: 'XA Pro 3D', category: 'trail', retail: 165, hype: 'limited' },
    ],
  },
  {
    id: 'puma',
    name: 'PUMA',
    codePrefix: '39',
    silhouettes: [
      { name: 'Speedcat OG', category: 'lifestyle', retail: 100, hype: 'limited' },
      { name: 'Palermo', category: 'lifestyle', retail: 90, hype: 'limited' },
      { name: 'Suede Classic XXI', category: 'lifestyle', retail: 80, hype: 'general' },
      { name: 'Mostro', category: 'lifestyle', retail: 120, hype: 'general' },
    ],
  },
  {
    id: 'vans',
    name: 'Vans',
    codePrefix: 'VN0',
    silhouettes: [
      { name: 'Knu Skool', category: 'skateboarding', retail: 80, hype: 'limited' },
      { name: 'Old Skool', category: 'skateboarding', retail: 70, hype: 'general' },
      { name: 'Sk8-Hi', category: 'skateboarding', retail: 75, hype: 'general' },
      { name: 'Authentic', category: 'skateboarding', retail: 60, hype: 'general' },
    ],
  },
  {
    id: 'converse',
    name: 'Converse',
    codePrefix: 'A0',
    silhouettes: [
      { name: 'Chuck 70 High', category: 'lifestyle', retail: 90, hype: 'general' },
      { name: 'Chuck 70 Low', category: 'lifestyle', retail: 85, hype: 'general' },
      { name: 'Run Star Hike', category: 'lifestyle', retail: 110, hype: 'limited' },
    ],
  },
  {
    id: 'reebok',
    name: 'Reebok',
    codePrefix: '100',
    silhouettes: [
      { name: 'Club C 85', category: 'lifestyle', retail: 85, hype: 'general' },
      { name: 'Instapump Fury', category: 'running', retail: 200, hype: 'limited' },
      { name: 'Premier Road Plus', category: 'running', retail: 110, hype: 'general' },
    ],
  },
  {
    id: 'hoka',
    name: 'HOKA',
    codePrefix: '114',
    silhouettes: [
      { name: 'Mafate Speed 2', category: 'trail', retail: 185, hype: 'limited' },
      { name: 'Clifton 9', category: 'running', retail: 145, hype: 'general' },
      { name: 'Bondi 8', category: 'running', retail: 165, hype: 'general' },
    ],
  },
  {
    id: 'saucony',
    name: 'Saucony',
    codePrefix: 'S70',
    silhouettes: [
      { name: 'Shadow 6000', category: 'running', retail: 130, hype: 'general' },
      { name: 'ProGrid Omni 9', category: 'running', retail: 150, hype: 'limited' },
      { name: 'Grid Jazz 9', category: 'running', retail: 110, hype: 'general' },
    ],
  },
];

const COLOR_KEYS = [
  'black',
  'white',
  'grey',
  'red',
  'blue',
  'green',
  'orange',
  'purple',
  'pink',
  'brown',
  'yellow',
  'beige',
] as const;

type ColorKey = (typeof COLOR_KEYS)[number];

const COLOR_LABELS: Record<ColorKey, string> = {
  black: 'Black',
  white: 'White',
  grey: 'Grey',
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  purple: 'Purple',
  pink: 'Pink',
  brown: 'Brown',
  yellow: 'Yellow',
  beige: 'Beige',
};

const COLOR_HEX: Record<ColorKey, string> = {
  black: '#17181A',
  white: '#F4F4F2',
  grey: '#9AA0A6',
  red: '#D7373F',
  blue: '#2F6FD0',
  green: '#3F8F5B',
  orange: '#E07A2F',
  purple: '#7A5AC4',
  pink: '#E08CA8',
  brown: '#7A5844',
  yellow: '#E3C24A',
  beige: '#D8C9AE',
};

/** Colourway names keyed by the colour they read as. */
const COLORWAY_NAMES: Record<ColorKey, string[]> = {
  black: ['Triple Black', 'Black Cat', 'Shadow', 'Anthracite', 'Black Phantom'],
  white: ['Triple White', 'Sail', 'White Cement', 'Pure Platinum', 'Cloud White'],
  grey: ['Wolf Grey', 'Cool Grey', 'Ash Grey', 'Smoke Grey', 'Steel'],
  red: ['Varsity Red', 'Chicago', 'Bred', 'Team Red', 'Crimson Tint'],
  blue: ['University Blue', 'Royal', 'Military Blue', 'Obsidian', 'Marina'],
  green: ['Pine Green', 'Olive', 'Gorge Green', 'Celtics', 'Mint Foam'],
  orange: ['Shattered Backboard', 'Safety Orange', 'Clay', 'Sunset', 'Burnt Sienna'],
  purple: ['Court Purple', 'Violet Shock', 'Grape', 'Plum Fog'],
  pink: ['Arctic Pink', 'Rose Quartz', 'Bubblegum', 'Blush'],
  brown: ['Mocha', 'Mushroom', 'Taupe', 'Cacao', 'Chestnut'],
  yellow: ['Taxi', 'Varsity Maize', 'Butter', 'Lemon Wash'],
  beige: ['Sand', 'Cream', 'Bone', 'Oatmeal', 'Desert Ore'],
};

const MATERIALS = [
  'leather',
  'suede',
  'mesh',
  'knit',
  'canvas',
  'nubuck',
  'patent',
  'ripstop',
  'gore-tex',
  'corduroy',
] as const;

type MaterialKey = (typeof MATERIALS)[number];

const MATERIAL_LABELS: Record<MaterialKey, string> = {
  leather: 'Leather',
  suede: 'Suede',
  mesh: 'Mesh',
  knit: 'Knit',
  canvas: 'Canvas',
  nubuck: 'Nubuck',
  patent: 'Patent',
  ripstop: 'Ripstop',
  'gore-tex': 'GORE-TEX',
  corduroy: 'Corduroy',
};

const PLATFORMS = [
  { id: 'stockx', name: 'StockX', homepage: 'https://stockx.com' },
  { id: 'goat', name: 'GOAT', homepage: 'https://www.goat.com' },
  { id: 'ebay', name: 'eBay', homepage: 'https://www.ebay.com' },
];

/* -------------------------------------------------------------------------- */
/* Momentum profiles                                                           */
/* -------------------------------------------------------------------------- */

type Profile =
  | 'hyped_launch'
  | 'stable_premium'
  | 'rising'
  | 'cooling'
  | 'retail_flat'
  | 'volatile';

const PROFILE_LABEL: Record<Profile, string> = {
  hyped_launch: 'Hyped launch, decaying',
  stable_premium: 'Stable premium',
  rising: 'Rising',
  cooling: 'Cooling',
  retail_flat: 'At retail',
  volatile: 'Volatile',
};

/**
 * Which colourways and materials the market is rotating towards. This is the
 * only place a narrative is imposed on the data; everything downstream is
 * derived from the resulting series, which is what keeps the trend pages
 * internally consistent.
 */
const COLOR_PROFILE_BIAS: Partial<Record<ColorKey, readonly (readonly [Profile, number])[]>> = {
  green: [
    ['rising', 6],
    ['stable_premium', 3],
    ['volatile', 1],
  ],
  beige: [
    ['rising', 5],
    ['stable_premium', 4],
    ['retail_flat', 1],
  ],
  brown: [
    ['rising', 4],
    ['stable_premium', 4],
    ['cooling', 2],
  ],
  black: [
    ['cooling', 5],
    ['retail_flat', 4],
    ['stable_premium', 1],
  ],
  white: [
    ['retail_flat', 5],
    ['cooling', 4],
    ['stable_premium', 1],
  ],
};

const MATERIAL_PROFILE_BIAS: Partial<Record<MaterialKey, readonly (readonly [Profile, number])[]>> = {
  suede: [
    ['rising', 5],
    ['stable_premium', 4],
    ['cooling', 1],
  ],
  'gore-tex': [
    ['stable_premium', 5],
    ['rising', 3],
    ['retail_flat', 2],
  ],
  leather: [
    ['retail_flat', 5],
    ['cooling', 3],
    ['stable_premium', 2],
  ],
  mesh: [
    ['cooling', 5],
    ['retail_flat', 4],
    ['volatile', 1],
  ],
  knit: [
    ['cooling', 4],
    ['retail_flat', 4],
    ['volatile', 2],
  ],
};

const HYPE_PROFILE_BIAS: Record<SilhouetteDef['hype'], readonly (readonly [Profile, number])[]> = {
  grail: [
    ['hyped_launch', 5],
    ['stable_premium', 3],
    ['volatile', 2],
  ],
  limited: [
    ['stable_premium', 4],
    ['hyped_launch', 3],
    ['rising', 2],
    ['cooling', 1],
  ],
  general: [
    ['retail_flat', 5],
    ['cooling', 3],
    ['rising', 1],
    ['volatile', 1],
  ],
};

/**
 * Resale multiple of retail by profile, at the start and end of the window.
 *
 * These are calibrated to produce a market that compresses visibly but never
 * collapses: the catalogue index falls from roughly 1.45× to 1.18× across
 * eighteen months, which is a real narrowing without being a crash. The
 * `liquidity` field drives the bid/ask spread and the listing depth.
 */
const PROFILE_CURVE: Record<Profile, { start: number; end: number; volatility: number; liquidity: number }> = {
  hyped_launch: { start: 2.95, end: 1.1, volatility: 0.06, liquidity: 0.35 },
  stable_premium: { start: 2.05, end: 1.55, volatility: 0.035, liquidity: 0.5 },
  rising: { start: 0.95, end: 1.75, volatility: 0.045, liquidity: 0.6 },
  cooling: { start: 1.9, end: 0.88, volatility: 0.04, liquidity: 0.6 },
  retail_flat: { start: 1.02, end: 0.9, volatility: 0.03, liquidity: 0.85 },
  volatile: { start: 1.3, end: 1.45, volatility: 0.14, liquidity: 0.3 },
};

/**
 * Colour and material rotation.
 *
 * The profile curve gives each *product* its own lifecycle. These tilts add the
 * *cross-sectional* story on top: earth tones and suede are rotating in, black /
 * white and knit are rotating out. Applied as a multiplier that ramps linearly
 * across the window, they guarantee the trend-intelligence pages tell a
 * coherent story that is still derived from the price series rather than
 * hand-authored into the charts.
 */
const COLOR_TILT: Partial<Record<ColorKey, number>> = {
  green: 0.62,
  beige: 0.5,
  brown: 0.38,
  pink: 0.18,
  grey: -0.1,
  white: -0.26,
  black: -0.34,
};

const MATERIAL_TILT: Partial<Record<MaterialKey, number>> = {
  suede: 0.26,
  nubuck: 0.2,
  'gore-tex': 0.16,
  corduroy: 0.12,
  leather: -0.3,
  mesh: -0.22,
  knit: -0.28,
};

/* -------------------------------------------------------------------------- */
/* Catalogue construction                                                      */
/* -------------------------------------------------------------------------- */

interface FixtureProduct {
  id: string;
  slug: string;
  name: string;
  brandId: string;
  categoryId: CategoryId;
  silhouette: string;
  colorway: string;
  primaryColor: ColorKey;
  secondaryColor: ColorKey;
  materials: MaterialKey[];
  releaseDate: string;
  retailPriceCents: number;
  currency: 'USD';
  imageUrl: string;
  description: string;
  /** Generator-only metadata, stripped before it reaches the database. */
  profile: Profile;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function styleCode(brand: BrandDef, index: number): string {
  const letters = brand.codePrefix.replace(/[0-9]/g, '') || 'SX';
  const digits = brand.codePrefix.replace(/[A-Za-z-]/g, '') || '000';
  const alpha = `${letters}${String.fromCharCode(65 + (index % 26))}${String.fromCharCode(65 + ((index * 7) % 26))}`;
  return `${alpha}${String(1000 + ((index * 613) % 8999))}-${String(100 + ((index * 37) % 899))}`;
}

function materialsFor(category: CategoryId, silhouette: string): MaterialKey[] {
  const base: MaterialKey[] =
    category === 'trail'
      ? ['mesh', 'ripstop']
      : category === 'running'
        ? ['mesh', 'knit']
        : category === 'skateboarding'
          ? ['suede', 'canvas']
          : ['leather', 'suede'];

  const chosen = new Set<MaterialKey>(base);
  if (rand() > 0.55) chosen.add(pick(MATERIALS));
  if (/XT|Speedcross|Mafate|XA/.test(silhouette) && rand() > 0.3) chosen.add('gore-tex');
  if (/Samba|Gazelle|Campus|Spezial/.test(silhouette)) chosen.add('suede');
  if (/990|2002|1906|550/.test(silhouette) && rand() > 0.4) chosen.add('nubuck');
  return [...chosen].slice(0, 3);
}

function buildCatalogue(target: number): FixtureProduct[] {
  const products: FixtureProduct[] = [];
  const usedSlugs = new Set<string>();

  // Round-robin across brands so every brand is represented roughly equally.
  let guard = 0;
  while (products.length < target && guard < target * 40) {
    guard += 1;
    const brand = BRANDS[products.length % BRANDS.length]!;
    const silhouette = pick(brand.silhouettes);
    const primaryColor = pickWeighted(
      COLOR_KEYS.map((c) => [c, c === 'black' || c === 'white' ? 4 : 2] as const),
    );
    const secondaryPool = COLOR_KEYS.filter((c) => c !== primaryColor);
    const secondaryColor = pick(secondaryPool);
    const colorway = pick(COLORWAY_NAMES[primaryColor]);
    const materials = materialsFor(silhouette.category, silhouette.name);

    const index = products.length;
    const code = styleCode(brand, index);
    const name = `${brand.name} ${silhouette.name} "${colorway}"`;

    let slug = slugify(`${brand.name} ${silhouette.name} ${colorway}`);
    if (usedSlugs.has(slug)) slug = `${slug}-${code.split('-')[1]}`;
    if (usedSlugs.has(slug)) continue;
    usedSlugs.add(slug);

    // Release dates: ~30% land inside the 18-month window so the charts show a
    // real launch curve, the rest are catalogue history.
    const releaseDate =
      rand() < 0.3
        ? addDays(weekDates[randInt(0, WEEKS - 3)]!, randInt(0, 6))
        : addDays(FIRST_WEEK, -randInt(90, 1500));

    const retail = toDollars(silhouette.retail * 100 + randInt(-5, 5) * 100);

    // Profile = hype tier bias, then colour and material bias on top.
    const profile = pickWeighted<Profile>([
      ...HYPE_PROFILE_BIAS[silhouette.hype],
      ...(COLOR_PROFILE_BIAS[primaryColor] ?? []),
      ...materials.flatMap((m) => MATERIAL_PROFILE_BIAS[m] ?? []),
    ]);

    products.push({
      id: code,
      slug,
      name,
      brandId: brand.id,
      categoryId: silhouette.category,
      silhouette: silhouette.name,
      colorway,
      primaryColor,
      secondaryColor,
      materials,
      releaseDate,
      retailPriceCents: retail,
      currency: 'USD',
      imageUrl: `https://images.soleindex.dev/${slug}.jpg`,
      description:
        `${name} in a ${materials.map((m) => MATERIAL_LABELS[m].toLowerCase()).join(' and ')} build. ` +
        `${CATEGORIES.find((c) => c.id === silhouette.category)!.name} tier, retail $${Math.round(retail / 100)}.`,
      profile,
    });
  }

  return products;
}

/* -------------------------------------------------------------------------- */
/* Time series                                                                 */
/* -------------------------------------------------------------------------- */

interface Series {
  /** Flat triples: [lowestAsk, highestBid, lastSale] per week, cents. */
  p: number[];
  /** Flat triples: [volume, avgSale, activeListings] per week. */
  s: number[];
}

function buildSeries(product: FixtureProduct): Series {
  const curve = PROFILE_CURVE[product.profile];
  const retail = product.retailPriceCents;
  const p: number[] = [];
  const s: number[] = [];

  // Seasonal phase per product, so categories do not all peak together.
  const phase = rand() * 52;
  const seasonAmp = product.categoryId === 'trail' ? 0.09 : rand() * 0.05;

  // Cross-sectional colour / material rotation, ramped across the window.
  const tilt =
    (COLOR_TILT[product.primaryColor] ?? 0) +
    product.materials.reduce((sum, m) => sum + (MATERIAL_TILT[m] ?? 0), 0);

  // A launch spike only applies if the release actually falls inside the
  // observed window.
  //
  // This used to be `weekDates.findIndex(d => d >= releaseDate) >= 0`, which is
  // always true — for a product released two years ago the first bucket is still
  // ">= releaseDate". Every pre-window product was therefore given a launch
  // spike at week 0, producing a market index that fell from 1.80× to 1.42× in
  // six weeks and then flat-lined. The explicit range check is the fix.
  const windowStart = weekDates[0]!;
  const windowEnd = weekDates[WEEKS - 1]!;
  const launchedInWindow =
    product.releaseDate >= windowStart && product.releaseDate <= windowEnd;
  const releaseIdx = launchedInWindow
    ? weekDates.findIndex((d) => d >= product.releaseDate)
    : -1;

  const baseVolume =
    product.profile === 'retail_flat'
      ? randInt(90, 320)
      : product.profile === 'stable_premium'
        ? randInt(40, 140)
        : product.profile === 'hyped_launch'
          ? randInt(12, 70)
          : randInt(25, 160);

  for (let w = 0; w < WEEKS; w += 1) {
    const t = WEEKS === 1 ? 0 : w / (WEEKS - 1);

    // Linear ramp between the profile's start and end multiple.
    //
    // This is deliberately linear rather than an exponential decay. An
    // exponential front-loads the compression into the first couple of months,
    // which makes the index chart tell a crash story while the trailing
    // 12-month change reads as flat — an internal inconsistency a reader would
    // spot immediately. A steady ramp keeps the chart and the statistics
    // describing the same market.
    let multiple = curve.start + (curve.end - curve.start) * t;

    // Launch spike: a sharp pop then a decay towards the profile's end state.
    if (launchedInWindow && releaseIdx >= 0) {
      const since = w - releaseIdx;
      if (since >= 0) {
        const pop = product.profile === 'retail_flat' ? 0.18 : 0.85;
        multiple = curve.end * (1 + pop * Math.exp(-since / 5.5));
      }
    }

    // Apply the colour / material rotation last so it composes with whatever
    // lifecycle the product already has. The floor keeps deeply discounted
    // general releases from falling below a plausible clearance multiple.
    multiple *= 1 + tilt * t;
    multiple = Math.max(multiple, 0.6);

    let seasonal = 1 + seasonAmp * Math.sin((2 * Math.PI * (w + phase)) / 52);
    // Q4 demand lift.
    const month = Number(weekDates[w]!.slice(5, 7));
    if (month >= 10 && month <= 12) seasonal += 0.035;

    const noise = 1 + (rand() * 2 - 1) * curve.volatility;
    const price = toDollars(retail * multiple * seasonal * noise);

    // Bid/ask spread widens when a product is illiquid.
    const spread = 0.05 + (1 - curve.liquidity) * 0.12;
    const lowestAsk = toDollars(price * (1 + spread / 2));
    const highestBid = toDollars(price * (1 - spread / 2));
    const lastSale = toDollars((lowestAsk + highestBid) / 2);
    p.push(lowestAsk, highestBid, lastSale);

    // Volume decays in step with the premium, plus seasonality and noise.
    const premiumRatio = multiple / Math.max(curve.start, 0.6);
    const volume = Math.max(
      1,
      Math.round(
        baseVolume *
          (0.35 + 0.65 * Math.min(1.6, premiumRatio)) *
          seasonal *
          (1 + (rand() * 2 - 1) * 0.28),
      ),
    );
    const avgSale = toDollars(lastSale * (1 + (rand() * 2 - 1) * 0.015));

    // Listings are the supply side: thin when hype is high, deep when it is not.
    const listings = Math.max(
      3,
      Math.round(volume * (3.4 / Math.max(0.55, premiumRatio)) + randInt(-4, 12)),
    );
    s.push(volume, avgSale, listings);
  }

  return { p, s };
}

/* -------------------------------------------------------------------------- */
/* Attribute trends — derived, not invented                                    */
/* -------------------------------------------------------------------------- */

interface AttributePoint {
  attribute: 'color' | 'material' | 'category';
  value: string;
  month: string;
  share: number;
  avgPriceCents: number;
  productCount: number;
}

/**
 * Compute share-of-transaction-value per attribute per month directly from the
 * generated price/sales series.
 *
 * Deriving these instead of hand-writing them is what keeps the trend pages
 * consistent with the product pages: if a colourway is visibly climbing on a
 * product chart, it will also be climbing here. In production this is a
 * materialised view refreshed by the analytics job.
 */
function buildAttributeTrends(products: FixtureProduct[], series: Map<string, Series>): AttributePoint[] {
  const out: AttributePoint[] = [];

  const attributeAccessors: Record<
    AttributePoint['attribute'],
    (p: FixtureProduct) => string[]
  > = {
    color: (p) => [p.primaryColor],
    material: (p) => p.materials,
    category: (p) => [p.categoryId],
  };

  for (let m = 0; m < MONTHS; m += 1) {
    const monthStart = monthDates[m]!;
    const nextMonth = m + 1 < MONTHS ? monthDates[m + 1]! : addWeeks(AS_OF, 5);
    const weekIdx = weekDates
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d >= monthStart && d < nextMonth)
      .map(({ i }) => i);

    if (weekIdx.length === 0) continue;

    const totals = new Map<string, { value: number; cents: number; units: number; products: Set<string> }>();
    let grandTotal = 0;

    for (const product of products) {
      const s = series.get(product.id);
      if (!s) continue;
      if (product.releaseDate > nextMonth) continue;

      for (const idx of weekIdx) {
        const volume = s.s[idx * 3] ?? 0;
        const avgSale = s.s[idx * 3 + 1] ?? 0;
        const tradeValue = volume * avgSale;
        if (tradeValue <= 0) continue;
        grandTotal += tradeValue;

        for (const attribute of ['color', 'material', 'category'] as const) {
          for (const raw of attributeAccessors[attribute](product)) {
            const key = `${attribute}::${raw}`;
            const entry =
              totals.get(key) ?? { value: 0, cents: 0, units: 0, products: new Set<string>() };
            entry.value += tradeValue;
            entry.cents += avgSale * volume;
            entry.units += volume;
            entry.products.add(product.id);
            totals.set(key, entry);
          }
        }
      }
    }

    if (grandTotal <= 0) continue;

    for (const [key, entry] of totals) {
      const [attribute, value] = key.split('::') as [AttributePoint['attribute'], string];
      out.push({
        attribute,
        value,
        month: monthStart,
        // 4 decimal places is plenty and keeps the JSON small.
        share: Number((entry.value / grandTotal).toFixed(4)),
        avgPriceCents: Math.round(entry.cents / Math.max(1, entry.units)),
        productCount: entry.products.size,
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Editorial + analyst content                                                 */
/* -------------------------------------------------------------------------- */

const AUTHOR = {
  id: 'u-fanfan',
  email: 'analyst@soleindex.dev',
  name: 'Fanfan Feng',
  role: 'admin' as const,
  tier: 'pro' as const,
};

const EDITOR = {
  id: 'u-editor',
  email: 'editor@soleindex.dev',
  name: 'Mira Okafor',
  role: 'editor' as const,
  tier: 'pro' as const,
};

const VIEWER = {
  id: 'u-viewer',
  email: 'viewer@soleindex.dev',
  name: 'Demo Viewer',
  role: 'viewer' as const,
  tier: 'free' as const,
};

const SOURCES = [
  { id: 'src-kicksdb', name: 'KicksDB (StockX + GOAT aggregate)', url: 'https://kicks.dev', kind: 'api' as const, notes: 'Primary daily price and sales feed.' },
  { id: 'src-ebay', name: 'eBay Browse API', url: 'https://developer.ebay.com', kind: 'api' as const, notes: 'Listed-price cross-check for platforms outside the aggregate.' },
  { id: 'src-complex', name: 'Complex Sneakers', url: 'https://www.complex.com/sneakers', kind: 'editorial' as const, notes: 'Release calendar and editorial context.' },
  { id: 'src-reddit', name: 'r/Sneakers sentiment sample', url: 'https://www.reddit.com/r/Sneakers/', kind: 'social' as const, notes: 'Weekly thread sample for demand-side colour.' },
  { id: 'src-floor', name: 'Retail floor checks (Shenzhen + Hong Kong)', url: null, kind: 'retailer' as const, notes: 'Physical stock observation at partner retailers.' },
];

/**
 * A link from an insight to a catalogue entity.
 *
 * `entityId` may be given directly, or left to `match` — a selector resolved
 * against the generated catalogue. Using a selector means an insight never ends
 * up attached to a style code that the generator did not produce.
 */
interface FixtureInsightLink {
  entityType: 'product' | 'category' | 'color' | 'material' | 'brand';
  entityId?: string;
  match?: { brandId?: string; silhouette?: string; primaryColor?: string; material?: string };
}

interface FixtureInsight {
  id: string;
  kind: 'observation' | 'research' | 'market_note' | 'source_digest';
  title: string;
  body: string;
  authorId: string;
  sourceId: string | null;
  confidence: number;
  signal: string;
  status: 'draft' | 'published';
  publishedAt: string | null;
  /** Attach to catalogue entities — this is what makes one note appear everywhere. */
  links: FixtureInsightLink[];
}

const INSIGHTS: FixtureInsight[] = [
  {
    id: 'ins-001',
    kind: 'market_note',
    title: 'The premium is narrowing, not disappearing',
    body: 'Across the 240 tracked silhouettes the volume-weighted resale index has fallen from 1.44x retail to 1.16x over eighteen months, and 119 of 240 pairs now trade below retail. But the top decile is holding above 2x. What is decaying is breadth, not depth: general releases are converging on retail while genuinely scarce pairs hold. Treat "the market is cooling" as a statement about the middle of the distribution, not the top.',
    authorId: AUTHOR.id,
    sourceId: 'src-kicksdb',
    confidence: 5,
    signal: 'Index 1.44× → 1.16× · 119/240 below retail',
    status: 'published',
    publishedAt: '2026-09-28T09:00:00.000Z',
    links: [{ entityType: 'category', entityId: 'lifestyle' }],
  },
  {
    id: 'ins-002',
    kind: 'observation',
    title: 'Olive is absorbing share from triple-black',
    body: 'Earth-tone colourways have taken transaction-value share in nearly every month of the window while black and white combinations give ground. The tell is not price — it is listings. Olive pairs clear at a similar price to black but sit on materially fewer active listings, which is what a genuine preference shift looks like rather than a discount cycle.',
    authorId: AUTHOR.id,
    sourceId: 'src-reddit',
    confidence: 4,
    signal: 'Green +6.1pp · beige +7.3pp over 18m',
    status: 'published',
    publishedAt: '2026-09-21T09:00:00.000Z',
    links: [
      { entityType: 'color', entityId: 'green' },
      { entityType: 'color', entityId: 'black' },
      { entityType: 'material', entityId: 'suede' },
    ],
  },
  {
    id: 'ins-003',
    kind: 'research',
    title: 'GORE-TEX commands a durable, boring premium',
    body: 'Waterproofed trail and running silhouettes trade at a remarkably stable 1.5–1.8x retail with low week-to-week volatility. This is the least exciting and most reliable segment in the dataset: demand is functional, so it does not move with sneaker culture, and supply is constrained by the material rather than by a release strategy.',
    authorId: EDITOR.id,
    sourceId: 'src-complex',
    confidence: 4,
    signal: 'Volatility 0.9x catalogue median',
    status: 'published',
    publishedAt: '2026-09-14T09:00:00.000Z',
    links: [
      { entityType: 'material', entityId: 'gore-tex' },
      { entityType: 'category', entityId: 'trail' },
      { entityType: 'product', match: { material: 'gore-tex' } },
    ],
  },
  {
    id: 'ins-004',
    kind: 'observation',
    title: 'Samba restocks are compressing the entry tier',
    body: 'Repeated wide restocks have compressed Samba OG from a strong double-digit premium to roughly retail within our window. Volume is up while price is down, which is the signature of supply catching demand rather than demand weakening. Worth watching whether the same pattern follows the Campus and Spezial restocks.',
    authorId: AUTHOR.id,
    sourceId: 'src-kicksdb',
    confidence: 4,
    signal: 'Premium compressed to retail, volume up',
    status: 'published',
    publishedAt: '2026-09-07T09:00:00.000Z',
    links: [
      { entityType: 'product', match: { brandId: 'adidas', silhouette: 'Samba OG' } },
      { entityType: 'brand', entityId: 'adidas' },
    ],
  },
  {
    id: 'ins-005',
    kind: 'market_note',
    title: 'Skate tooling is decoupling from basketball heat',
    body: 'Basketball silhouettes and skate silhouettes used to move together. Over the last two quarters the correlation has broken down: basketball premiums are contracting while skate stays flat to slightly up. The likely driver is that skate demand is local and community-driven, so it is far less exposed to resale-platform speculation.',
    authorId: EDITOR.id,
    sourceId: 'src-complex',
    confidence: 3,
    signal: 'Rolling 12w correlation 0.71 → 0.22',
    status: 'published',
    publishedAt: '2026-08-31T09:00:00.000Z',
    links: [{ entityType: 'category', entityId: 'skateboarding' }],
  },
  {
    id: 'ins-006',
    kind: 'source_digest',
    title: 'Weekly source digest — restock calendar',
    body: 'Three wide restocks landed this week across adidas and New Balance. Historically a restock of this size takes four to six weeks to fully reprice the affected silhouette, so expect continued ask-side softening in the entry tier before any recovery.',
    authorId: AUTHOR.id,
    sourceId: 'src-complex',
    confidence: 3,
    signal: '3 wide restocks',
    status: 'published',
    publishedAt: '2026-08-24T09:00:00.000Z',
    links: [
      { entityType: 'brand', entityId: 'adidas' },
      { entityType: 'brand', entityId: 'new-balance' },
    ],
  },
  {
    id: 'ins-007',
    kind: 'research',
    title: 'Sell-through is a better leading indicator than price',
    body: 'Price moves after supply does. Across the dataset, a sustained rise in the listings-to-volume ratio precedes a price decline by roughly five weeks, consistently enough to be useful. That is why the trend model weights sell-through and listing depth rather than relying on price momentum alone.',
    authorId: AUTHOR.id,
    sourceId: 'src-kicksdb',
    confidence: 5,
    signal: 'Lead time ~5 weeks',
    status: 'published',
    publishedAt: '2026-08-17T09:00:00.000Z',
    links: [{ entityType: 'category', entityId: 'running' }],
  },
  {
    id: 'ins-008',
    kind: 'observation',
    title: 'Retail floor check: cream and bone are sold through',
    body: 'Two Shenzhen partner doors and one Hong Kong door confirm what the online data implies — neutral cream and bone colourways are selling through at full retail while black and white sit. Offline sell-through is a useful independent check because it is not affected by resale-platform bid/ask dynamics.',
    authorId: EDITOR.id,
    sourceId: 'src-floor',
    confidence: 4,
    signal: 'Full-price sell-through on neutrals',
    status: 'published',
    publishedAt: '2026-08-10T09:00:00.000Z',
    links: [
      { entityType: 'color', entityId: 'beige' },
      { entityType: 'color', entityId: 'white' },
    ],
  },
  {
    id: 'ins-009',
    kind: 'market_note',
    title: 'Q4 seasonality is weaker than the historical pattern',
    body: 'The usual October–December demand lift is present but muted, roughly a third of the amplitude we saw three years ago. Two readings: either the market has become less seasonal as it professionalises, or the promotional calendar has shifted earlier. Either way, do not underwrite inventory on the old seasonal curve.',
    authorId: AUTHOR.id,
    sourceId: 'src-kicksdb',
    confidence: 3,
    signal: 'Q4 lift ~1.2x vs 1.6x historical',
    status: 'published',
    publishedAt: '2026-08-03T09:00:00.000Z',
    links: [{ entityType: 'category', entityId: 'lifestyle' }],
  },
  {
    id: 'ins-010',
    kind: 'research',
    title: 'Knit uppers are losing the material argument',
    body: 'Knit-constructed silhouettes have fallen behind across every price band we track. Products carrying knit have dropped from 42% of transaction value to 28%; mesh has fallen 13.6pp alongside it. The mechanism looks structural rather than cyclical: knit photographs poorly, ages visibly, and reads as "value engineering" to a buyer who is already paying a premium. Suede and nubuck are picking up exactly that share.',
    authorId: EDITOR.id,
    sourceId: 'src-reddit',
    confidence: 4,
    signal: 'Knit-bearing value share 42% → 28%',
    status: 'published',
    publishedAt: '2026-07-27T09:00:00.000Z',
    links: [
      { entityType: 'material', entityId: 'knit' },
      { entityType: 'material', entityId: 'suede' },
      { entityType: 'material', entityId: 'nubuck' },
    ],
  },
  {
    id: 'ins-011',
    kind: 'observation',
    title: 'Air Max 1 colourways are diverging sharply',
    body: 'Within a single silhouette we now see a spread of more than 2x between the strongest and weakest colourway. That is unusually wide and argues against treating "Air Max 1" as one instrument — the silhouette-level index is masking two very different products.',
    authorId: AUTHOR.id,
    sourceId: 'src-kicksdb',
    confidence: 4,
    signal: 'Intra-silhouette spread > 2×',
    status: 'published',
    publishedAt: '2026-07-20T09:00:00.000Z',
    links: [{ entityType: 'product', match: { brandId: 'nike', silhouette: 'Air Max 1' } }],
  },
  {
    id: 'ins-012',
    kind: 'market_note',
    title: 'Draft: possible bid-side manipulation on two pairs',
    body: 'Two mid-tier Jordan colourways show bid stacks that look implausibly deep relative to their sale volume. Not yet confident enough to publish — needs a second week of data and a cross-check against a platform we do not aggregate.',
    authorId: EDITOR.id,
    sourceId: null,
    confidence: 2,
    signal: 'Unconfirmed',
    status: 'draft',
    publishedAt: null,
    links: [{ entityType: 'brand', entityId: 'jordan' }],
  },
];

interface FixtureArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImageUrl: string | null;
  authorId: string;
  categoryId: string | null;
  tags: string[];
  readingMinutes: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
}

const ARTICLES: FixtureArticle[] = [
  {
    id: 'art-001',
    slug: 'q3-2026-resale-report',
    title: 'Q3 2026 Resale Report: The Premium Is Narrowing',
    excerpt:
      'The median resale multiple fell for the sixth consecutive quarter. Depth at the top is intact — what is eroding is the middle of the market.',
    categoryId: 'lifestyle',
    tags: ['market-report', 'q3-2026', 'pricing'],
    readingMinutes: 9,
    authorId: AUTHOR.id,
    coverImageUrl: null,
    status: 'published',
    publishedAt: '2026-10-01T08:00:00.000Z',
    body: `## The headline number

The volume-weighted resale index closed Q3 at **1.16x retail**, down from 1.44x eighteen months earlier and 10.5% lower than a year ago. **119 of the 240 silhouettes we track now trade below retail.** On its own, that reads like a market in retreat.

It is not. The top decile is holding above **2.0x** and the top percentile is closer to 3.4x. The decline is concentrated entirely in the middle of the distribution — the general releases, the wide restocks, the colourways that were never scarce to begin with.

## Where the value went

Three forces are compressing the middle:

1. **Restock cadence.** Brands have shortened the interval between restocks. A silhouette that used to reprice upward for two quarters now reverts within six weeks.
2. **Listing depth.** Roughly 106,000 pairs sit as active listings against 101,000 units of four-week demand. That is more supply than the market is clearing, and it is a price story waiting to happen.
3. **Platform liquidity.** Faster clearing means less time for a premium to accumulate.

## What to do with this

If you are buying to hold, the middle of the catalogue is now a losing trade — the spread does not cover the carrying cost. If you are buying to sell, thinner premiums mean throughput matters more than margin, which favours high-volume general releases over scarce pairs.

The exception remains functional and material-driven scarcity: GORE-TEX, premium suede, and limited-material builds continue to hold a stable 1.5–1.8x with roughly half the volatility of the rest of the catalogue.

## The forward view

We expect the index to stabilise between 1.10x and 1.20x rather than revert. Consolidation, not collapse: fewer participants, thinner spreads, and a market that increasingly rewards operations over speculation.`,
  },
  {
    id: 'art-002',
    slug: 'olive-is-the-colourway-of-the-year',
    title: 'Why Olive Is the Colourway of the Year',
    excerpt:
      'Earth tones have taken transaction share in eight of the last nine months. The mechanism is supply, not fashion.',
    categoryId: 'lifestyle',
    tags: ['colour-trends', 'materials', 'suede'],
    readingMinutes: 6,
    authorId: EDITOR.id,
    coverImageUrl: null,
    status: 'published',
    publishedAt: '2026-09-22T08:00:00.000Z',
    body: `## A preference shift you can measure

Fashion stories are usually unfalsifiable. This one is not.

Olive and adjacent earth tones have increased their share of transaction value across the window, with green up 6.1 percentage points and beige up 7.3. That alone would be a weak signal — share can rise simply because more olive pairs were released.

The stronger evidence is the **listings ratio**. Olive pairs clear at roughly the same price as black and white equivalents while sitting on materially fewer active listings. Supply is not what is driving this; demand is absorbing it.

## Why suede is the transmission mechanism

Olive reads differently depending on the substrate. On mesh or knit it looks flat and washed out; on suede and nubuck it deepens and shifts with light. The colour trend and the material trend are the same trend.

This is why we track them together rather than as independent dimensions, and it is why the material share chart and the colour share chart move in lockstep.

## What breaks the trend

Every colour cycle ends the same way: over-supply of the colourway by brands chasing the trend, followed by a collapse in the premium while share stays high. Watch the listings ratio, not the price. When olive listings start growing faster than olive volume, the cycle is turning.`,
  },
  {
    id: 'art-003',
    slug: 'the-gore-tex-premium',
    title: 'The GORE-TEX Premium: Waterproofing as a Value Driver',
    excerpt:
      'The most stable segment in the catalogue is also the least fashionable. That is the point.',
    categoryId: 'trail',
    tags: ['materials', 'trail', 'volatility'],
    readingMinutes: 5,
    authorId: EDITOR.id,
    coverImageUrl: null,
    status: 'published',
    publishedAt: '2026-09-10T08:00:00.000Z',
    body: `## Boring is a feature

Waterproofed silhouettes trade at a stable 1.5–1.8x retail with week-to-week volatility at roughly 0.9x the catalogue median.

That combination — a healthy premium *and* low volatility — is rare, and it exists for a specific reason: the demand is functional. Someone buying a GORE-TEX trail shoe in November is buying it to wear in November, not to flip it in December.

## Why the premium persists

| Driver | Effect |
| --- | --- |
| Material cost | GORE-TEX membranes are licensed and expensive, so retail is already elevated |
| Production complexity | Seam-sealed construction limits how fast a factory can scale output |
| Functional durability | The product stays useful for years, so it is rarely dumped on the resale market |
| Low speculative interest | Flippers avoid it, which keeps bid/ask spreads tight and honest |

That last row is the counter-intuitive one. A segment that speculators ignore is a segment where prices reflect actual use.

## The practical read

If your goal is to hold inventory with predictable outcomes, this is the segment. If your goal is asymmetric upside, it is the wrong one — nothing here is going to double.`,
  },
  {
    id: 'art-004',
    slug: 'skate-vs-basketball-cycles',
    title: 'Skate vs Basketball: Two Different Cycles',
    excerpt:
      'For a decade these two categories moved together. The correlation has now broken — and the reason is structural.',
    categoryId: 'skateboarding',
    tags: ['category-trends', 'correlation', 'skateboarding'],
    readingMinutes: 7,
    authorId: AUTHOR.id,
    coverImageUrl: null,
    status: 'published',
    publishedAt: '2026-08-28T08:00:00.000Z',
    body: `## The correlation was never fundamental

Basketball and skate footwear shared a customer for years, so their resale prices moved together. That looked like a market relationship. It was closer to a coincidence of audience.

Rolling twelve-week correlation has fallen from **0.71 to 0.22**, and the divergence is not noise — it is persistent across every sub-segment we can slice.

## What changed

Skate demand is **local**. It is transmitted through shops, scenes and people who actually skate. Basketball demand is **global and platform-mediated** — it is transmitted through release calendars, raffles and resale feeds.

Those two transmission mechanisms respond to completely different inputs. When global speculative capital withdrew from the middle of the market, basketball premiums contracted. Skate premiums did not, because speculative capital was never what was setting them.

## The operational consequence

Skate is now the better segment for **inventory stability** and basketball remains the better one for **event-driven upside**. Treating them as one "sneaker market" will misprice both.`,
  },
  {
    id: 'art-005',
    slug: 'how-restocks-reprice-a-silhouette',
    title: 'How a Restock Reprices a Silhouette',
    excerpt:
      'We tracked eleven restock events. The repricing takes four to six weeks and follows a consistent shape.',
    categoryId: 'lifestyle',
    tags: ['restock', 'supply', 'pricing'],
    readingMinutes: 6,
    authorId: AUTHOR.id,
    coverImageUrl: null,
    status: 'published',
    publishedAt: '2026-08-15T08:00:00.000Z',
    body: `## The shape of a restock

A restock does not move the price on the day it happens. It moves the **ask**, and the sale price follows over four to six weeks as the new supply works through.

The sequence is consistent enough to be tradeable:

1. **Week 0 — restock announced.** Lowest ask drops 6–10%. Last sale is unchanged.
2. **Weeks 1–2 — supply lands.** Listing count spikes 40–120%. Bid stays flat; the spread widens.
3. **Weeks 3–4 —** Bids start to follow asks down. Volume rises as the lower price clears scarcity buyers.
4. **Weeks 5–6 — new equilibrium.** Typically 15–35% below the pre-restock premium for a wide restock.

## Why Samba is the case study

Samba OG went from a 2.3x premium to 1.2x across our window on the back of repeated wide restocks. Volume over the same period rose 38% — supply catching demand, not demand weakening. That distinction matters, because the two look identical in a price chart and imply opposite decisions.

## How to use it

If you are holding inventory when a restock is announced, the ask tells you what is about to happen. Six weeks is enough time to act, which is the entire reason we track listings alongside price.`,
  },
  {
    id: 'art-006',
    slug: 'materials-report-suedes-second-act',
    title: "Materials Report: Suede's Second Act",
    excerpt:
      'Suede is absorbing share from knit and mesh across every price band. The driver is photographic, not tactile.',
    categoryId: 'lifestyle',
    tags: ['materials', 'suede', 'knit'],
    readingMinutes: 5,
    authorId: EDITOR.id,
    coverImageUrl: null,
    status: 'published',
    publishedAt: '2026-08-05T08:00:00.000Z',
    body: `## The share transfer

Suede has taken **13.1 percentage points** of transaction share over eighteen months, with nubuck adding more. Knit and mesh have given up **13.8pp and 13.6pp** respectively. (Material shares overlap — a product can carry several — so they do not sum to 100%.)

That is a large move in a category as conservative as footwear materials, and the explanation is not comfort.

## Why suede wins on a screen

Most sneaker transactions now begin on a phone. Suede and nubuck have directional texture that reads as depth in a photograph; knit reads as flat, and mesh reads as a grid. A buyer scrolling a feed is evaluating a photograph, and one material photographs materially better.

There is a second, less flattering reason: knit ages visibly. Pilling and stretch are obvious in a resale listing's used-condition photos, which caps what a used pair can ask.

## The cyclical caveat

Suede is the least weather-tolerant material in the catalogue, which normally produces a seasonal dip in winter. That dip is currently being masked by the share trend, and it will be the first thing to test whether this is structural or cyclical.`,
  },
  {
    id: 'art-007',
    slug: 'reading-sell-through',
    title: "Reading Sell-Through: A Practitioner's Guide",
    excerpt:
      'Price is a lagging indicator. Listings depth is a leading one. Here is how we weight them.',
    categoryId: 'running',
    tags: ['methodology', 'sell-through', 'indicators'],
    readingMinutes: 8,
    authorId: AUTHOR.id,
    coverImageUrl: null,
    status: 'published',
    publishedAt: '2026-07-30T08:00:00.000Z',
    body: `## The problem with price momentum

A price chart tells you what already happened. If you are deciding whether to buy inventory, that is not enough information.

Across our dataset, a sustained rise in the **listings-to-volume ratio** precedes a price decline by roughly five weeks. The mechanism is straightforward: supply arrives before it clears, and price is the variable that eventually adjusts.

## The five inputs we use

Our Trend Momentum Index combines five signals, each normalised within its category:

| Signal | Weight | Why |
| --- | --- | --- |
| Price velocity | 35% | The direct observation, smoothed over 30 days |
| Volume delta | 25% | Distinguishes a real move from a thin print |
| Volatility (inverted) | 15% | Rewards stable appreciation over spikes |
| Sell-through | 15% | The leading indicator described above |
| Attention | 10% | Editorial mentions and external search interest |

The full definition, including the known limitations, is published at \`/trends/methodology\`.

## What the score is not

It is not a forecast. It is a **summary of the current state**, weighted so that leading and lagging signals both contribute. A high score means "this is currently in demand, with supply roughly in balance". It says nothing about next quarter.

Any tool that claims to predict a specific future price on this data is overfitting.`,
  },
  {
    id: 'art-008',
    slug: '2027-outlook-consolidation',
    title: 'The 2027 Outlook: Consolidation, Not Collapse',
    excerpt:
      'Fewer participants, thinner spreads, and a market that rewards operations over speculation.',
    categoryId: null,
    tags: ['outlook', '2027', 'strategy'],
    readingMinutes: 6,
    authorId: AUTHOR.id,
    coverImageUrl: null,
    status: 'draft',
    publishedAt: null,
    body: `## Draft

Working notes for the annual outlook. Not yet published — the Q4 data needs to close before the seasonal adjustment can be finalised.

Thesis: the resale market is professionalising rather than shrinking. Speculative participants are exiting because the middle of the distribution no longer pays for the risk they carry. Operational participants — people who can source, hold and move inventory efficiently — are taking that share at better economics.

If correct, the implication for tooling is that the valuable features shift from *detection* (what is hot) to *execution* (what should I buy, at what depth, and when do I exit).
`,
  },
];

/* -------------------------------------------------------------------------- */
/* Operations fixtures                                                         */
/* -------------------------------------------------------------------------- */

interface FixtureIngestionRun {
  id: string;
  provider: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  productsUpserted: number;
  pricePointsUpserted: number;
  durationMs: number | null;
  error: string | null;
  quota: Record<string, number | string>;
}

function buildIngestionRuns(): FixtureIngestionRun[] {
  const runs: FixtureIngestionRun[] = [];
  for (let i = 0; i < 14; i += 1) {
    const day = addDays(AS_OF, -i);
    const failed = i === 5;
    const running = i === 0;
    const started = `${day}T02:00:00.000Z`;
    runs.push({
      id: `run-${String(i).padStart(3, '0')}`,
      provider: i % 7 === 3 ? 'ebay' : 'kicksdb',
      status: running ? 'running' : failed ? 'failed' : 'success',
      startedAt: started,
      finishedAt: running ? null : `${day}T02:0${randInt(1, 9)}:00.000Z`,
      productsUpserted: running ? 0 : randInt(220, 240),
      pricePointsUpserted: running ? 0 : randInt(1400, 1900),
      durationMs: running ? null : randInt(9000, 42000),
      error: failed
        ? 'Upstream 429 after 3 retries: monthly request quota exhausted. Cached snapshot retained; next scheduled run will retry.'
        : null,
      quota: failed
        ? { monthlyLimit: 1000, used: 1000, remaining: 0, window: '2026-09' }
        : {
            monthlyLimit: 1000,
            used: 1000 - randInt(120, 800),
            remaining: randInt(120, 800),
            window: '2026-10',
          },
    });
  }
  return runs;
}

const FEATURE_FLAGS = [
  { key: 'dashboard.core', label: 'Core market dashboard', minTier: 'free' as const, enabled: true },
  { key: 'search.advanced', label: 'Advanced filtering and saved segments', minTier: 'free' as const, enabled: true },
  { key: 'compare.multi', label: 'Multi-product comparison (up to 4)', minTier: 'free' as const, enabled: true },
  { key: 'trends.momentum', label: 'Trend Momentum Index and rankings', minTier: 'pro' as const, enabled: true },
  { key: 'trends.attribute', label: 'Colour and material share series', minTier: 'pro' as const, enabled: true },
  { key: 'data.export', label: 'CSV export and API access', minTier: 'pro' as const, enabled: true },
  { key: 'ai.summaries', label: 'AI-generated market summaries', minTier: 'enterprise' as const, enabled: true },
  { key: 'alerts.custom', label: 'Custom price and supply alerts', minTier: 'enterprise' as const, enabled: true },
  { key: 'insights.write', label: 'Author analyst observations', minTier: 'pro' as const, enabled: true },
];

const SUBSCRIPTIONS = [
  {
    id: 'sub-analyst',
    userId: AUTHOR.id,
    tier: 'enterprise' as const,
    status: 'active',
    currentPeriodEnd: '2027-01-14T00:00:00.000Z',
    stripeCustomerId: 'cus_demo_analyst',
    stripeSubscriptionId: 'sub_demo_analyst',
  },
  {
    id: 'sub-editor',
    userId: EDITOR.id,
    tier: 'pro' as const,
    status: 'active',
    currentPeriodEnd: '2026-12-02T00:00:00.000Z',
    stripeCustomerId: 'cus_demo_editor',
    stripeSubscriptionId: 'sub_demo_editor',
  },
];

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

function main(): void {
  const started = Date.now();
  const outDir = resolve(process.cwd(), 'fixtures');
  mkdirSync(outDir, { recursive: true });

  const TARGET_PRODUCTS = 240;
  const products = buildCatalogue(TARGET_PRODUCTS);

  const series = new Map<string, Series>();
  for (const product of products) {
    series.set(product.id, buildSeries(product));
  }

  const attributeTrends = buildAttributeTrends(products, series);

  // Strip generator-only metadata from the catalogue snapshot.
  const catalogue = {
    brands: BRANDS.map(({ id, name }) => ({ id, name, slug: id })),
    categories: CATEGORIES.map(({ id, name, description }) => ({
      id,
      name,
      slug: id,
      description,
    })),
    platforms: PLATFORMS,
    products: products.map(({ profile, ...rest }) => rest),
    // Kept separately so the demo can explain *why* a product behaves as it
    // does without leaking generator fields into the production schema.
    profiles: Object.fromEntries(
      products.map((p) => [p.id, { profile: p.profile, label: PROFILE_LABEL[p.profile] }]),
    ),
    colorMeta: COLOR_KEYS.map((key) => ({
      key,
      label: COLOR_LABELS[key],
      hex: COLOR_HEX[key],
    })),
    materialMeta: MATERIALS.map((key) => ({ key, label: MATERIAL_LABELS[key] })),
  };

  /**
   * Resolve insight links against the generated catalogue.
   *
   * Links that name an entity outright are kept as-is; links expressed as a
   * selector are matched against the products that were actually generated. An
   * unmatched selector is dropped and counted, so the snapshot never contains a
   * dangling reference.
   */
  const resolveLink = (
    link: FixtureInsightLink,
  ): { entityType: FixtureInsightLink['entityType']; entityId: string } | null => {
    if (link.entityId) return { entityType: link.entityType, entityId: link.entityId };
    const spec = link.match;
    if (!spec) return null;
    const hit = products.find(
      (p) =>
        (!spec.brandId || p.brandId === spec.brandId) &&
        (!spec.silhouette || p.silhouette === spec.silhouette) &&
        (!spec.primaryColor || p.primaryColor === spec.primaryColor) &&
        (!spec.material || p.materials.includes(spec.material as MaterialKey)),
    );
    return hit ? { entityType: link.entityType, entityId: hit.id } : null;
  };

  let droppedLinks = 0;
  const insights = INSIGHTS.map((insight) => {
    const links = insight.links
      .map(resolveLink)
      .filter(
        (link): link is { entityType: FixtureInsightLink['entityType']; entityId: string } =>
          link !== null,
      );
    droppedLinks += insight.links.length - links.length;
    return { ...insight, links };
  });

  const editorial = {
    users: [AUTHOR, EDITOR, VIEWER],
    sources: SOURCES,
    insights,
    articles: ARTICLES,
  };

  const ops = {
    ingestionRuns: buildIngestionRuns(),
    featureFlags: FEATURE_FLAGS,
    subscriptions: SUBSCRIPTIONS,
  };

  const manifest = {
    generatedBy: 'scripts/generate-fixtures.ts',
    seed: SEED,
    asOf: AS_OF,
    cadence: 'weekly',
    weeks: WEEKS,
    monthBuckets: MONTHS,
    firstWeek: FIRST_WEEK,
    productCount: products.length,
    pricePointCount: products.length * WEEKS,
    salesPointCount: products.length * WEEKS,
    attributeTrendCount: attributeTrends.length,
    dataDisclaimer:
      'Product names reference real silhouettes. All prices, volumes and listing counts are synthetic, produced by a seeded generator for the purpose of a reproducible offline demo and test suite.',
  };

  const files: [string, unknown][] = [
    ['manifest.json', manifest],
    ['catalog.json', catalogue],
    ['series.json', { asOf: AS_OF, firstWeek: FIRST_WEEK, cadence: 'weekly', weeks: WEEKS, series: Object.fromEntries(series) }],
    ['attribute-trends.json', { months: monthDates, points: attributeTrends }],
    ['editorial.json', editorial],
    ['ops.json', ops],
  ];

  /**
   * `--check` regenerates into memory and compares against the committed files
   * instead of writing. CI runs this so a hand-edited fixture — or a change to
   * the generator that was not followed by a regeneration — fails the build
   * rather than silently shipping a dataset that does not match its source.
   */
  const checkOnly = process.argv.includes('--check');
  const drifted: string[] = [];

  for (const [name, payload] of files) {
    const path = resolve(outDir, name);
    const next = `${JSON.stringify(payload, null, name === 'series.json' ? 0 : 2)}\n`;
    if (checkOnly) {
      let current = '';
      try {
        current = readFileSync(path, 'utf8');
      } catch {
        current = '';
      }
      if (current !== next) drifted.push(name);
      continue;
    }
    writeFileSync(path, next);
  }

  if (checkOnly) {
    if (drifted.length > 0) {
      console.error('[sole-index] fixture drift detected in:');
      for (const name of drifted) console.error(`  ${name}`);
      console.error('Run `pnpm fixtures:generate` and commit the result.');
      process.exit(1);
    }
    console.log(`[sole-index] fixtures verified: ${files.length} files match the generator (seed ${SEED})`);
    return;
  }

  const totalBytes = files.reduce(
    (sum, [name]) => sum + statSync(resolve(outDir, name)).size,
    0,
  );

  console.log('[sole-index] fixtures generated');
  console.log(`  products            ${products.length}`);
  console.log(`  weekly series       ${products.length * WEEKS} price + ${products.length * WEEKS} sales points`);
  console.log(`  attribute trends    ${attributeTrends.length}`);
  console.log(`  insights            ${INSIGHTS.length}`);
  console.log(`  insight links       ${insights.reduce((n, i) => n + i.links.length, 0)}${droppedLinks ? ` (${droppedLinks} unresolved selectors dropped)` : ''}`);
  console.log(`  articles            ${ARTICLES.length}`);
  console.log(`  files               ${files.length} (${(totalBytes / 1024).toFixed(0)} KiB)`);
  console.log(`  elapsed             ${Date.now() - started}ms`);
}

main();
