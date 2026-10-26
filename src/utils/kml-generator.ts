/**
 * KML generator for test locations inside Saudi Arabia.
 *
 * Produces a KML 2.2 document with one closed rectangular polygon (lon,lat order, as KML
 * requires). Points are drawn from INLAND regions only — sampling the national bounding box
 * (lon 34–56, lat 16–32) would also hit the Red Sea, the Gulf and neighbouring countries.
 *
 * The GIS task on TEST validates degree ranges of longitude 34–55 E and latitude 16–32 N and
 * displays coordinates as degrees/minutes/seconds; `toDms` gives that form for each corner.
 *
 *   import { generateKml } from '@utils/kml-generator';
 *   const { kml, corners } = generateKml({ region: 'madinah', widthKm: 2, heightKm: 2 });
 */

export interface Region {
  readonly name: string;
  readonly lat: readonly [number, number];
  readonly lon: readonly [number, number];
}

/** Inland boxes (Arabian Shield / mining belt), well away from borders and coastlines. */
export const SAUDI_REGIONS = {
  madinah: { name: 'Madinah (inland)', lat: [24.2, 25.5], lon: [39.6, 40.8] },
  riyadh: { name: 'Riyadh (west)', lat: [23.6, 24.5], lon: [44.6, 45.8] },
  qassim: { name: 'Al-Qassim', lat: [25.8, 26.6], lon: [42.6, 43.6] },
  hail: { name: 'Hail', lat: [27.0, 27.8], lon: [41.0, 42.4] },
  makkah: { name: 'Makkah (east, inland)', lat: [21.4, 22.5], lon: [41.2, 42.5] },
  tabuk: { name: 'Tabuk (inland)', lat: [27.6, 28.4], lon: [36.6, 37.8] },
  najran: { name: 'Najran (north)', lat: [18.0, 18.8], lon: [44.2, 45.4] },
} as const satisfies Record<string, Region>;

export type RegionKey = keyof typeof SAUDI_REGIONS;

export interface KmlOptions {
  /** Region to place the polygon in; random region when omitted. */
  region?: RegionKey;
  /** Explicit centre (overrides region); must lie inside one of SAUDI_REGIONS. */
  center?: { lat: number; lon: number };
  /** Rectangle size in kilometres (default 1 × 1). */
  widthKm?: number;
  heightKm?: number;
  /** Placemark / document name. */
  name?: string;
  /** Seed for repeatable output (same seed → same coordinates). */
  seed?: number;
  /**
   * Ring direction. Default 'clockwise': the Ta'adeen GIS map REJECTS counter-clockwise rings
   * ("الإحداثيات عكس اتجاه عقارب الساعة غير مسموحة" — VERIFIED on TEST 2026-10-26), even though
   * the KML spec itself prefers counter-clockwise outer boundaries.
   */
  orientation?: 'clockwise' | 'counter-clockwise';
}

export interface Corner {
  readonly lat: number;
  readonly lon: number;
}

export interface GeneratedKml {
  readonly kml: string;
  readonly region: string;
  readonly center: Corner;
  /** Four distinct corners in the requested orientation (default clockwise); the KML ring repeats the first. */
  readonly corners: Corner[];
}

/** Small deterministic PRNG (mulberry32) so a seed reproduces the same location. */
function random(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLon = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);
const round = (n: number) => Math.round(n * 1e6) / 1e6;

function insideRegion(p: Corner, r: Region): boolean {
  return p.lat >= r.lat[0] && p.lat <= r.lat[1] && p.lon >= r.lon[0] && p.lon <= r.lon[1];
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** Decimal degrees → { deg, min, sec } (seconds to 3 decimals), as the GIS task displays them. */
export function toDms(value: number): { deg: number; min: number; sec: number } {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 1000) / 1000;
  return { deg, min, sec };
}

export function generateKml(options: KmlOptions = {}): GeneratedKml {
  const rnd = random(options.seed);
  const keys = Object.keys(SAUDI_REGIONS) as RegionKey[];
  const widthKm = options.widthKm ?? 1;
  const heightKm = options.heightKm ?? 1;
  if (widthKm <= 0 || heightKm <= 0) throw new Error('widthKm and heightKm must be positive.');

  let region: Region;
  let center: Corner;
  if (options.center) {
    const owner = keys.map((k) => SAUDI_REGIONS[k]).find((r) => insideRegion(options.center!, r));
    if (!owner) throw new Error(`Centre ${options.center.lat},${options.center.lon} is outside the known inland Saudi regions.`);
    region = owner;
    center = options.center;
  } else {
    region = SAUDI_REGIONS[options.region ?? keys[Math.floor(rnd() * keys.length)]];
    // Keep the whole rectangle inside the region box.
    const halfLat = heightKm / 2 / KM_PER_DEG_LAT;
    const latMin = region.lat[0] + halfLat;
    const latMax = region.lat[1] - halfLat;
    const lat = latMin + rnd() * (latMax - latMin);
    const halfLon = widthKm / 2 / kmPerDegLon(lat);
    const lonMin = region.lon[0] + halfLon;
    const lonMax = region.lon[1] - halfLon;
    if (latMax <= latMin || lonMax <= lonMin) throw new Error(`A ${widthKm}×${heightKm} km rectangle does not fit in ${region.name}.`);
    center = { lat, lon: lonMin + rnd() * (lonMax - lonMin) };
  }

  const dLat = heightKm / 2 / KM_PER_DEG_LAT;
  const dLon = widthKm / 2 / kmPerDegLon(center.lat);
  // SW → NW → NE → SE is clockwise when looking at a north-up map.
  const clockwise: Corner[] = [
    { lat: center.lat - dLat, lon: center.lon - dLon },
    { lat: center.lat + dLat, lon: center.lon - dLon },
    { lat: center.lat + dLat, lon: center.lon + dLon },
    { lat: center.lat - dLat, lon: center.lon + dLon },
  ];
  const ordered = (options.orientation ?? 'clockwise') === 'clockwise' ? clockwise : [clockwise[0], ...clockwise.slice(1).reverse()];
  const corners: Corner[] = ordered.map((c) => ({ lat: round(c.lat), lon: round(c.lon) }));
  for (const c of corners) {
    if (!insideRegion(c, region)) throw new Error(`Corner ${c.lat},${c.lon} falls outside ${region.name}.`);
  }

  const ring = [...corners, corners[0]].map((c) => `${c.lon},${c.lat},0`).join(' ');
  const name = escapeXml(options.name ?? `Test area ${round(center.lat)},${round(center.lon)}`);
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Placemark>
      <name>${name}</name>
      <description>${escapeXml(`${region.name} — ${widthKm} x ${heightKm} km (approx. ${round(widthKm * heightKm)} km2)`)}</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${ring}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>
`;
  return { kml, region: region.name, center: { lat: round(center.lat), lon: round(center.lon) }, corners };
}
