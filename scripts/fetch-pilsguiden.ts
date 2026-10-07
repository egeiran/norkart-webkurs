// Henter ølpriser for Trondheim fra pilsguiden.no og lagrer dem som GeoJSON.
// Kjør med: pnpm fetch:pils
//
// Pilsguiden er bygget med SvelteKit, som eksponerer sidedataene som JSON på
// `<side>/__data.json`. Dataene er komprimert med `devalue`, så vi bruker
// `unflatten` for å gjøre dem om til vanlige objekter igjen.
import { writeFile } from 'node:fs/promises';
import { unflatten } from 'devalue';

const BASE_URL = 'https://www.pilsguiden.no';
const LIST_PATH = '/liste/trondelag/trondheim';
const OUTPUT_FILE = new URL(
  '../src/sample_data/pilsguiden_trondheim.json',
  import.meta.url
);
const DELAY_MS = 250;

type ListBar = {
  id: number;
  name: string;
  slug: string;
};

type BarPrice = {
  price: number;
  pint: number;
  price_checked: string;
  valid: string;
};

type BarDetails = {
  id: number;
  slug: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  size: number;
  brewery: string;
  prices: BarPrice[];
};

// Strukturert versjon av teksten i `valid`, slik at kartet kan finne ut
// hvilken pris som gjelder akkurat nå. Tider er minutter etter midnatt og
// dager følger Date.getDay() (0 = søndag).
type Validity =
  | { kind: 'always' }
  | { kind: 'fallback' }
  | { kind: 'window'; days: number[]; from?: number; to?: number }
  | { kind: 'unknown' };

const WEEKDAYS = [
  'søndag',
  'mandag',
  'tirsdag',
  'onsdag',
  'torsdag',
  'fredag',
  'lørdag',
];

// "Alle dager", "fredag", "mandag - lørdag" eller "mandag, onsdag - fredag"
const parseDays = (text: string): number[] | undefined => {
  if (text.toLowerCase() === 'alle dager') return [0, 1, 2, 3, 4, 5, 6];

  const days: number[] = [];
  for (const part of text.toLowerCase().split(',')) {
    const [start, end = start] = part.split('-').map((d) => d.trim());
    const startIndex = WEEKDAYS.indexOf(start);
    const endIndex = WEEKDAYS.indexOf(end);
    if (startIndex === -1 || endIndex === -1) return undefined;
    // Gå fra start til slutt, og rundt søndag ved behov (f.eks. fre - søn)
    for (let i = startIndex; ; i = (i + 1) % 7) {
      days.push(i);
      if (i === endIndex) break;
    }
  }
  return days;
};

const parseValidity = (valid: string): Validity => {
  if (valid === 'Prisen er alltid gyldig') return { kind: 'always' };
  if (valid === 'Gyldig når ingen annen pris gjelder') {
    return { kind: 'fallback' };
  }

  const match = valid.match(/^Gyldig (før|etter) kl (\d{2}):(\d{2}), (.+)$/);
  const days = match && parseDays(match[4]);
  if (!match || !days) {
    console.warn(`  ⚠ Forstår ikke gyldighet: "${valid}"`);
    return { kind: 'unknown' };
  }

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === 'før'
    ? { kind: 'window', days, to: minutes }
    : { kind: 'window', days, from: minutes };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchPageData = async (path: string) => {
  const response = await fetch(`${BASE_URL}${path}/__data.json`, {
    headers: { 'User-Agent': 'norkart-webkurs (kursprosjekt)' },
  });
  if (!response.ok) {
    throw new Error(`${path} svarte med status ${response.status}`);
  }
  const json = await response.json();
  // nodes[0] er layout-data, nodes[1] er dataene for selve siden
  return unflatten(json.nodes[1].data);
};

const main = async () => {
  const { list } = await fetchPageData(LIST_PATH);
  const bars: ListBar[] = list.bars;
  console.log(`Fant ${bars.length} steder i ${list.stats.location_name}`);

  const features = [];
  for (const bar of bars) {
    await sleep(DELAY_MS);
    const { barObj }: { barObj: BarDetails } = await fetchPageData(
      `/bar/${bar.slug}`
    );

    if (barObj.latitude == null || barObj.longitude == null) {
      console.warn(`Hopper over ${bar.name}: mangler koordinater`);
      continue;
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [barObj.longitude, barObj.latitude],
      },
      properties: {
        id: barObj.id,
        name: barObj.name,
        address: barObj.address,
        brewery: barObj.brewery,
        size: barObj.size,
        url: `${BASE_URL}/bar/${barObj.slug}`,
        prices: barObj.prices
          .map(({ price, pint, valid, price_checked }) => ({
            price,
            pint,
            valid,
            validity: parseValidity(valid),
            priceChecked: price_checked,
          }))
          .sort((a, b) => a.pint - b.pint),
      },
    });
    console.log(`  ✓ ${barObj.name}`);
  }

  const featureCollection = {
    type: 'FeatureCollection',
    metadata: {
      source: `${BASE_URL}${LIST_PATH}`,
      fetchedAt: new Date().toISOString(),
      medianPint: list.stats.median,
    },
    features,
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(featureCollection, null, 2));
  console.log(`Lagret ${features.length} steder til ${OUTPUT_FILE.pathname}`);
};

main();
