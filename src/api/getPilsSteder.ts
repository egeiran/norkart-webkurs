// Dataene hentes fra pilsguiden.no med `pnpm fetch:pils`
// (se scripts/fetch-pilsguiden.ts)

type PilsPrice = {
  price: number;
  pint: number;
  valid: string;
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
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  }));
};
