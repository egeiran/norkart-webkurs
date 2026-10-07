// Dataene hentes fra pilsguiden.no med `pnpm fetch:pils` og ligger i
// public/pilsguiden/ (se scripts/fetch-pilsguiden.ts)
import type { TileKey } from '../utils/pilsTiles';

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

// [id, lengdegrad, breddegrad, normalpris per halvliter]
export type PilsOversiktBar = [number, number, number, number];

export type PilsOversikt = {
  source: string;
  fetchedAt: string;
  tileZoom: number;
  bars: PilsOversiktBar[];
};

const DATA_URL = `${import.meta.env.BASE_URL}pilsguiden`;

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} svarte med status ${response.status}`);
  }
  return response.json();
};

// Posisjon og normalpris for alle steder i landet
export const getPilsOversikt = () =>
  fetchJson<PilsOversikt>(`${DATA_URL}/oversikt.json`);

// Alle detaljer for stedene i én rute
export const getPilsRute = (key: TileKey) =>
  fetchJson<PilsSted[]>(`${DATA_URL}/ruter/${key}.json`);
