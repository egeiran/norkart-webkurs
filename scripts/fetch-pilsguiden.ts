// Henter ølpriser for hele landet fra pilsguiden.no.
// Kjør med: pnpm fetch:pils (legg til --refresh for å hoppe over cachen)
//
// Pilsguiden er bygget med SvelteKit, som eksponerer sidedataene som JSON på
// `<side>/__data.json`. Dataene er komprimert med `devalue`, så vi bruker
// `unflatten` for å gjøre dem om til vanlige objekter igjen.
//
// Resultatet skrives til public/pilsguiden/:
// - oversikt.json: posisjon og normalpris for alle steder (liten fil som
//   lastes med en gang, slik at heatmappet kan vise hele landet)
// - ruter/<x>/<y>.json: alle detaljer for stedene i hver rute. Kartet henter
//   bare rutene som er synlige når man zoomer inn.
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { unflatten } from 'devalue';
import { getTileKey, PILS_TILE_ZOOM } from '../src/utils/pilsTiles.ts';
import type {
  PilsOversikt,
  PilsPrice,
  PilsSted,
  PilsValidity,
} from '../src/api/getPilsData.ts';

const BASE_URL = 'https://www.pilsguiden.no';
const OUTPUT_DIR = new URL('../public/pilsguiden/', import.meta.url);
const CACHE_DIR = new URL('../.cache/pilsguiden/', import.meta.url);
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Vær snill med Pilsguiden: to forespørsler om gangen med pause mellom
const CONCURRENCY = 2;
const DELAY_MS = 250;
const MAX_ATTEMPTS = 3;

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
  latitude: number | null;
  longitude: number | null;
  size: number;
  brewery: string;
  prices: BarPrice[];
};

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

const unknownValidities = new Set<string>();

// Gjør teksten i `valid` om til et tidsvindu, slik at kartet kan finne ut
// hvilken pris som gjelder akkurat nå
const parseValidity = (valid: string): PilsValidity => {
  if (valid === 'Prisen er alltid gyldig') return { kind: 'always' };
  if (valid === 'Gyldig når ingen annen pris gjelder') {
    return { kind: 'fallback' };
  }

  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const TIME = '(\\d{1,2}:\\d{2})';

  // "Gyldig før kl 18:00, mandag - lørdag" / "Gyldig etter kl 21:00, fredag"
  const beforeAfter = valid.match(
    new RegExp(`^Gyldig (før|etter) kl ${TIME}, (.+)$`)
  );
  // "Gyldig mellom 15:00 og 18:00, tirsdag - fredag"
  const between = valid.match(
    new RegExp(`^Gyldig mellom ${TIME} og ${TIME}, (.+)$`)
  );
  // "Gyldig hele åpningstiden, søndag"
  const wholeDay = valid.match(/^Gyldig hele åpningstiden, (.+)$/);

  const days = parseDays(
    (beforeAfter?.[3] ?? between?.[3] ?? wholeDay?.[1]) || ''
  );
  if (days && beforeAfter) {
    const minutes = toMinutes(beforeAfter[2]);
    return beforeAfter[1] === 'før'
      ? { kind: 'window', days, to: minutes }
      : { kind: 'window', days, from: minutes };
  }
  if (days && between) {
    return {
      kind: 'window',
      days,
      from: toMinutes(between[1]),
      to: toMinutes(between[2]),
    };
  }
  if (days && wholeDay) return { kind: 'window', days };

  unknownValidities.add(valid);
  return { kind: 'unknown' };
};

// Prisen som gjelder utenom happy hour. Brukes i oversikten, før detaljene
// med tidsvinduer er lastet.
const getNormalPint = (prices: PilsPrice[]) => {
  const normal = prices.filter(
    (p) => p.validity.kind === 'fallback' || p.validity.kind === 'always'
  );
  const pints = (normal.length > 0 ? normal : prices).map((p) => p.pint);
  return normal.length > 0 ? Math.min(...pints) : Math.max(...pints);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'norkart-webkurs (kursprosjekt)' },
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return response;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await sleep(1000 * attempt);
    }
  }
};

const getBarSlugs = async () => {
  const sitemap = await (
    await fetchWithRetry(`${BASE_URL}/sitemap.xml`)
  ).text();
  const matches = sitemap.matchAll(
    /<loc>https:\/\/www\.pilsguiden\.no\/bar\/([^<]+)<\/loc>/g
  );
  return [...new Set([...matches].map((match) => match[1]))];
};

const isCacheFresh = async (file: URL) => {
  try {
    return Date.now() - (await stat(file)).mtimeMs < CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
};

const getBarDetails = async (
  slug: string,
  useCache: boolean
): Promise<BarDetails> => {
  const cacheFile = new URL(`${encodeURIComponent(slug)}.json`, CACHE_DIR);
  if (useCache && (await isCacheFresh(cacheFile))) {
    return JSON.parse(await readFile(cacheFile, 'utf8'));
  }

  await sleep(DELAY_MS);
  const response = await fetchWithRetry(`${BASE_URL}/bar/${slug}/__data.json`);
  const json = await response.json();
  // nodes[0] er layout-data, nodes[1] er dataene for selve siden
  const { barObj } = unflatten(json.nodes[1].data);
  await writeFile(cacheFile, JSON.stringify(barObj));
  return barObj;
};

const toPilsSted = (bar: BarDetails): PilsSted | undefined => {
  if (bar.latitude == null || bar.longitude == null) return undefined;
  if (!bar.prices?.length) return undefined;

  return {
    id: bar.id,
    name: bar.name,
    address: bar.address,
    brewery: bar.brewery,
    size: bar.size,
    url: `${BASE_URL}/bar/${bar.slug}`,
    longitude: bar.longitude,
    latitude: bar.latitude,
    prices: bar.prices
      .map(({ price, pint, valid, price_checked }) => ({
        price,
        pint,
        valid,
        validity: parseValidity(valid),
        priceChecked: price_checked,
      }))
      .sort((a, b) => a.pint - b.pint),
  };
};

const main = async () => {
  const useCache = !process.argv.includes('--refresh');
  await mkdir(CACHE_DIR, { recursive: true });

  const slugs = await getBarSlugs();
  console.log(`Fant ${slugs.length} steder i sitemapen`);

  const steder: PilsSted[] = [];
  const failed: string[] = [];
  let skipped = 0;
  let done = 0;

  // Et lite antall arbeidere som plukker neste sted fra køen
  const queue = [...slugs];
  const worker = async () => {
    for (let slug = queue.shift(); slug; slug = queue.shift()) {
      try {
        const sted = toPilsSted(await getBarDetails(slug, useCache));
        if (sted) steder.push(sted);
        else skipped++;
      } catch (error) {
        failed.push(`${slug} (${(error as Error).message})`);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${slugs.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Del stedene opp i ruter
  const tiles = new Map<string, PilsSted[]>();
  for (const sted of steder.sort((a, b) => a.id - b.id)) {
    const key = getTileKey(sted.longitude, sted.latitude);
    tiles.set(key, [...(tiles.get(key) ?? []), sted]);
  }

  const oversikt: PilsOversikt = {
    source: BASE_URL,
    fetchedAt: new Date().toISOString(),
    tileZoom: PILS_TILE_ZOOM,
    bars: steder.map((sted) => [
      sted.id,
      sted.longitude,
      sted.latitude,
      getNormalPint(sted.prices),
    ]),
  };

  // Start med en tom mappe så ruter uten steder ikke blir liggende igjen
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    new URL('oversikt.json', OUTPUT_DIR),
    JSON.stringify(oversikt)
  );
  for (const [key, tileSteder] of tiles) {
    const file = new URL(`ruter/${key}.json`, OUTPUT_DIR);
    await mkdir(new URL('.', file), { recursive: true });
    await writeFile(file, JSON.stringify(tileSteder));
  }

  console.log(
    `Lagret ${steder.length} steder i ${tiles.size} ruter til ${OUTPUT_DIR.pathname}`
  );
  if (skipped)
    console.log(`Hoppet over ${skipped} steder uten koordinater eller priser`);
  for (const valid of unknownValidities) {
    console.warn(`⚠ Forstår ikke gyldighet: "${valid}"`);
  }
  if (failed.length) {
    console.warn(`⚠ ${failed.length} steder feilet:\n  ${failed.join('\n  ')}`);
  }
};

main();
