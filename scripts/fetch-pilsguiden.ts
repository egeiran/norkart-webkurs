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
