import type { PilsPrice, PilsValidity } from '../api/getPilsSteder';

// Utelivsdøgnet starter kl 06. Kl 01 natt til lørdag regnes dermed som
// fredag kveld, slik at "etter kl 21:00, fredag" fortsatt gjelder.
const DAY_START = 6 * 60;
const MINUTES_PER_DAY = 24 * 60;

const toNightMinutes = (minutes: number) =>
  minutes < DAY_START ? minutes + MINUTES_PER_DAY : minutes;

const isValidNow = (validity: PilsValidity, now: Date) => {
  if (validity.kind === 'always') return true;
  if (validity.kind !== 'window') return false;

  const clockMinutes = now.getHours() * 60 + now.getMinutes();
  const isAfterMidnight = clockMinutes < DAY_START;
  const day = isAfterMidnight ? (now.getDay() + 6) % 7 : now.getDay();
  const minutes = toNightMinutes(clockMinutes);

  const from = toNightMinutes(validity.from ?? DAY_START);
  const to = toNightMinutes(validity.to ?? DAY_START + MINUTES_PER_DAY);

  return validity.days.includes(day) && minutes >= from && minutes < to;
};

// Velger den billigste prisen som gjelder nå. Finnes ingen, brukes prisen som
// gjelder "når ingen annen pris gjelder".
export const getCurrentPrice = (prices: PilsPrice[], now: Date): PilsPrice => {
  const cheapest = (candidates: PilsPrice[]) =>
    candidates.reduce((a, b) => (b.pint < a.pint ? b : a));

  const validNow = prices.filter((p) => isValidNow(p.validity, now));
  if (validNow.length > 0) return cheapest(validNow);

  const fallback = prices.filter((p) => p.validity.kind === 'fallback');
  return cheapest(fallback.length > 0 ? fallback : prices);
};

// 0 = billigst, 1 = dyrest
export const getPriceLevel = (pint: number, min: number, max: number) =>
  max === min ? 0 : (pint - min) / (max - min);

// Grønn for billig, gul i midten og rød for dyrt
export const getPriceColor = (level: number) =>
  `hsl(${Math.round(120 * (1 - level))}, 75%, 38%)`;
