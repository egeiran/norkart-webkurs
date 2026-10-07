// Dataene hentes fra pilsguiden.no med `pnpm fetch:pils`
// (se scripts/fetch-pilsguiden.ts)

// Når en pris gjelder. Tider er minutter etter midnatt og dager følger
// Date.getDay() (0 = søndag).
export type PilsValidity =
  | { kind: 'always' }
  | { kind: 'fallback' }
  | { kind: 'window'; days: number[]; from?: number; to?: number }
  | { kind: 'unknown' };

export type PilsPrice = {
  price: number;
  pint: number;
  valid: string;
  validity: PilsValidity;
  priceChecked: string;
};

export type PilsSted = {
  id: number;
  name: string;
  address: string;
  brewery: string;
  size: number;
  url: string;
  prices: PilsPrice[];
  longitude: number;
  latitude: number;
};

export const getPilsSteder = async (): Promise<PilsSted[]> => {
  const { default: data } =
    await import('../sample_data/pilsguiden_trondheim.json');
  return data.features.map((feature) => ({
    ...feature.properties,
    prices: feature.properties.prices as PilsPrice[],
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  }));
};
