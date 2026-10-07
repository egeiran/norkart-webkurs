import type { PilsSted } from '../api/getPilsData';

export const GANGFART_KMT = 5;
export const MIN_ANTALL_STOPP = 2;
export const MAKS_ANTALL_STOPP = 10;

// Antall steder (utenom start og slutt) som algoritmen vurderer.
// Søket er eksakt innenfor disse, og 2^15 delmengder går fort nok i nettleseren.
const MAKS_KANDIDATER = 15;

export type Pilscrawl = {
  stopp: PilsSted[];
  rute?: GeoJSON.LineString;
};

export type Avstand = (fra: PilsSted, til: PilsSted) => number;

export const billigstePils = (sted: PilsSted) =>
  Math.min(...sted.prices.map((price) => price.pint));

// Avstand i km mellom to punkter i luftlinje (haversine)
const avstandKm = (
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

const posisjon = (sted: PilsSted): [number, number] => [
  sted.longitude,
  sted.latitude,
];

export const luftlinje: Avstand = (fra, til) =>
  avstandKm(posisjon(fra), posisjon(til));

// Gjør om en avstandsmatrise (fra f.eks. OSRM) til en avstandsfunksjon
export const avstandFraMatrise = (
  steder: PilsSted[],
  matrise: number[][]
): Avstand => {
  const indeks = new Map(steder.map((sted, i) => [sted.id, i]));
  return (fra, til) => matrise[indeks.get(fra.id)!][indeks.get(til.id)!];
};

// Velger stedene som ligger best til for en crawl fra start (og eventuelt til
// slutt): de med kortest omvei start → sted → slutt i luftlinje
export const velgKandidater = (
  steder: PilsSted[],
  start: PilsSted,
  slutt: PilsSted | null
): PilsSted[] => {
  const omvei = (sted: PilsSted) =>
    luftlinje(start, sted) + (slutt ? luftlinje(sted, slutt) : 0);
  return steder
    .filter((sted) => sted.id !== start.id && sted.id !== slutt?.id)
    .sort((a, b) => omvei(a) - omvei(b))
    .slice(0, MAKS_KANDIDATER);
};

// Finner den korteste ruten som starter på `start`, eventuelt slutter på
// `slutt`, og besøker totalt `antall` steder (start og slutt inkludert).
// Bruker Held–Karp (dynamisk programmering over delmengder):
// kortest[maske][j] er korteste vei fra start som har besøkt nøyaktig
// kandidatene i `maske` og står på kandidat j.
export const lagKortestePilscrawl = (
  start: PilsSted,
  slutt: PilsSted | null,
  kandidater: PilsSted[],
  antall: number,
  avstand: Avstand
): PilsSted[] => {
  const n = kandidater.length;
  const besok = Math.min(antall - 1 - (slutt ? 1 : 0), n);
  const medSlutt = (rute: PilsSted[]) => (slutt ? [...rute, slutt] : rute);
  if (besok <= 0) return medSlutt([start]);

  const fraStart = kandidater.map((sted) => avstand(start, sted));
  const tilSlutt = kandidater.map((sted) => (slutt ? avstand(sted, slutt) : 0));
  const mellom = kandidater.map((a) => kandidater.map((b) => avstand(a, b)));

  const antallMasker = 1 << n;
  const kortest = new Float64Array(antallMasker * n).fill(Infinity);
  const forrige = new Int8Array(antallMasker * n).fill(-1);
  const antallBiter = new Uint8Array(antallMasker);
  for (let maske = 1; maske < antallMasker; maske++) {
    antallBiter[maske] = antallBiter[maske >> 1] + (maske & 1);
  }

  for (let j = 0; j < n; j++) {
    kortest[(1 << j) * n + j] = fraStart[j];
  }

  let besteLengde = Infinity;
  let besteMaske = 0;
  let besteSiste = -1;

  for (let maske = 1; maske < antallMasker; maske++) {
    const biter = antallBiter[maske];
    if (biter > besok) continue;

    for (let j = 0; j < n; j++) {
      const lengde = kortest[maske * n + j];
      if (lengde === Infinity) continue;

      if (biter === besok) {
        const total = lengde + tilSlutt[j];
        if (total < besteLengde) {
          besteLengde = total;
          besteMaske = maske;
          besteSiste = j;
        }
        continue;
      }

      for (let k = 0; k < n; k++) {
        if (maske & (1 << k)) continue;
        const nyMaske = maske | (1 << k);
        const nyLengde = lengde + mellom[j][k];
        if (nyLengde < kortest[nyMaske * n + k]) {
          kortest[nyMaske * n + k] = nyLengde;
          forrige[nyMaske * n + k] = j;
        }
      }
    }
  }

  // Gå baklengs gjennom `forrige` for å finne rekkefølgen
  const rekkefolge: PilsSted[] = [];
  let maske = besteMaske;
  let j = besteSiste;
  while (j !== -1) {
    rekkefolge.unshift(kandidater[j]);
    const fra = forrige[maske * n + j];
    maske &= ~(1 << j);
    j = fra;
  }
  return medSlutt([start, ...rekkefolge]);
};

export const ruteLengdeKm = (crawl: Pilscrawl) => {
  // Bruk gåruten hvis vi har den, ellers luftlinje mellom stoppene
  const linje = crawl.rute?.coordinates ?? crawl.stopp.map(posisjon);
  return linje
    .slice(1)
    .reduce(
      (sum, punkt, i) =>
        sum +
        avstandKm(linje[i] as [number, number], punkt as [number, number]),
      0
    );
};
