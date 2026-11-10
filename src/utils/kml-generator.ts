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

/**
 * Inland outline of Saudi Arabia as [lat, lon] — kept roughly 50 km or more inside the land borders
 * and the Red Sea / Gulf coastlines, so a random point never lands in the sea or a neighbouring country.
 */
export const SAUDI_INLAND_OUTLINE: readonly (readonly [number, number])[] = [
  [28.8, 36.3], [29.0, 37.4], [29.4, 38.4], [30.0, 39.6], [30.2, 40.8], [29.6, 42.5], [28.6, 44.6],
  [28.3, 46.5], [27.8, 47.6], [26.9, 48.6], [25.5, 49.3], [24.0, 50.3], [22.9, 52.0], [21.8, 53.8],
  [19.7, 51.6], [18.8, 49.0], [18.2, 46.5], [18.0, 44.4], [18.0, 43.4], [19.5, 42.4], [21.3, 40.3],
  [23.0, 39.6], [24.3, 38.9], [25.5, 37.9], [26.8, 37.0], [28.0, 36.6],
];

/** 'saudi' = a random point anywhere inside SAUDI_INLAND_OUTLINE instead of one of the region boxes. */
export const ANYWHERE_IN_SAUDI = 'saudi';
export type LocationArea = RegionKey | typeof ANYWHERE_IN_SAUDI;

export interface KmlOptions {
  /** Region to place the polygon in ('saudi' = anywhere inland); random region box when omitted. */
  region?: LocationArea;
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

/** Ray casting point-in-polygon on SAUDI_INLAND_OUTLINE. */
function insideSaudi(p: Corner): boolean {
  const poly = SAUDI_INLAND_OUTLINE;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [latI, lonI] = poly[i];
    const [latJ, lonJ] = poly[j];
    if (latI > p.lat !== latJ > p.lat && p.lon < ((lonJ - lonI) * (p.lat - latI)) / (latJ - latI) + lonI) inside = !inside;
  }
  return inside;
}

/** SW → NW → NE → SE is clockwise when looking at a north-up map. */
function rectangle(center: Corner, widthKm: number, heightKm: number): Corner[] {
  const dLat = heightKm / 2 / KM_PER_DEG_LAT;
  const dLon = widthKm / 2 / kmPerDegLon(center.lat);
  return [
    { lat: center.lat - dLat, lon: center.lon - dLon },
    { lat: center.lat + dLat, lon: center.lon - dLon },
    { lat: center.lat + dLat, lon: center.lon + dLon },
    { lat: center.lat - dLat, lon: center.lon + dLon },
  ];
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
  let inside: (p: Corner) => boolean = (p) => insideRegion(p, region);
  if (options.region === ANYWHERE_IN_SAUDI && !options.center) {
    const lats = SAUDI_INLAND_OUTLINE.map(([lat]) => lat);
    const lons = SAUDI_INLAND_OUTLINE.map(([, lon]) => lon);
    region = { name: 'Saudi Arabia (random)', lat: [Math.min(...lats), Math.max(...lats)], lon: [Math.min(...lons), Math.max(...lons)] };
    inside = insideSaudi;
    // Draw from the outline's bounding box until the whole rectangle lies inside the outline.
    let found: Corner | undefined;
    for (let i = 0; i < 10_000 && !found; i++) {
      const c = { lat: region.lat[0] + rnd() * (region.lat[1] - region.lat[0]), lon: region.lon[0] + rnd() * (region.lon[1] - region.lon[0]) };
      if (rectangle(c, widthKm, heightKm).every(insideSaudi)) found = c;
    }
    if (!found) throw new Error(`A ${widthKm}×${heightKm} km rectangle does not fit inside Saudi Arabia.`);
    center = found;
  } else if (options.center) {
    // A region box when the centre lies in one, else the inland outline (e.g. a smaller area nested in a 'saudi' one).
    const owner = keys.map((k) => SAUDI_REGIONS[k]).find((r) => insideRegion(options.center!, r));
    if (owner) region = owner;
    else if (insideSaudi(options.center)) {
      region = { name: 'Saudi Arabia', lat: [options.center.lat, options.center.lat], lon: [options.center.lon, options.center.lon] };
      inside = insideSaudi;
    } else throw new Error(`Centre ${options.center.lat},${options.center.lon} is outside the known inland Saudi regions.`);
    center = options.center;
  } else {
    const key = options.region && options.region !== ANYWHERE_IN_SAUDI ? options.region : keys[Math.floor(rnd() * keys.length)];
    region = SAUDI_REGIONS[key];
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

  const clockwise = rectangle(center, widthKm, heightKm);
  const ordered = (options.orientation ?? 'clockwise') === 'clockwise' ? clockwise : [clockwise[0], ...clockwise.slice(1).reverse()];
  const corners: Corner[] = ordered.map((c) => ({ lat: round(c.lat), lon: round(c.lon) }));
  for (const c of corners) {
    if (!inside(c)) throw new Error(`Corner ${c.lat},${c.lon} falls outside ${region.name}.`);
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
