/**
 * Generates KML test polygons inside Saudi Arabia into test-data/kml/.
 *
 *   npm run kml                                   -> 1 file, random inland region, 1 x 1 km
 *   npm run kml -- --region madinah --width 2 --height 3 --count 5
 *   npm run kml -- --lat 25.35 --lon 40.52 --name "Site A"
 *   npm run kml -- --seed 42                      -> repeatable coordinates
 *
 * Regions: madinah, riyadh, qassim, hail, makkah, tabuk, najran (see src/utils/kml-generator.ts).
 */
import fs from 'fs';
import path from 'path';
import { generateKml, RegionKey, SAUDI_REGIONS, toDms } from '../src/utils/kml-generator';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const num = (name: string) => (arg(name) === undefined ? undefined : Number(arg(name)));

const region = arg('region') as RegionKey | undefined;
if (region && !(region in SAUDI_REGIONS)) {
  console.error(`Unknown region "${region}". Use one of: ${Object.keys(SAUDI_REGIONS).join(', ')}`);
  process.exit(1);
}
const lat = num('lat');
const lon = num('lon');
const count = num('count') ?? 1;
const seed = num('seed');
const outDir = path.resolve(__dirname, '../test-data/kml');
fs.mkdirSync(outDir, { recursive: true });

const fmt = (v: number) => {
  const d = toDms(v);
  return `${d.deg}° ${d.min}' ${d.sec}"`;
};

for (let i = 0; i < count; i++) {
  const result = generateKml({
    region,
    center: lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
    widthKm: num('width'),
    heightKm: num('height'),
    name: arg('name'),
    seed: seed === undefined ? undefined : seed + i,
  });
  const file = path.join(outDir, `area-${result.center.lat}_${result.center.lon}.kml`);
  fs.writeFileSync(file, result.kml);
  console.log(`\n${path.relative(process.cwd(), file)}  (${result.region})`);
  result.corners.forEach((c, k) => console.log(`  corner ${k + 1}: lat ${c.lat} (${fmt(c.lat)} N)  lon ${c.lon} (${fmt(c.lon)} E)`));
}
