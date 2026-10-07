// Pilsdataene for hele landet er delt opp i ruter etter samme oppdeling som
// vanlige kartfliser (slippy map tiles). Brukes både av hentescriptet og kartet,
// så filen kan ikke importere noe annet.

// Zoomnivå for rutene. På nivå 9 er en rute omtrent 35 x 35 km i Midt-Norge.
export const PILS_TILE_ZOOM = 9;

export type TileKey = `${number}/${number}`;

export const lngToTileX = (lng: number, zoom = PILS_TILE_ZOOM) =>
  Math.floor(((lng + 180) / 360) * 2 ** zoom);

export const latToTileY = (lat: number, zoom = PILS_TILE_ZOOM) => {
  const latRad = (lat * Math.PI) / 180;
  const mercatorY = Math.log(Math.tan(latRad) + 1 / Math.cos(latRad));
  return Math.floor(((1 - mercatorY / Math.PI) / 2) * 2 ** zoom);
};

export const getTileKey = (lng: number, lat: number): TileKey =>
  `${lngToTileX(lng)}/${latToTileY(lat)}`;

// Alle ruter som dekker et område. Merk at y øker sørover.
export const getTileKeysInBounds = (
  west: number,
  south: number,
  east: number,
  north: number
): TileKey[] => {
  const keys: TileKey[] = [];
  for (let x = lngToTileX(west); x <= lngToTileX(east); x++) {
    for (let y = latToTileY(north); y <= latToTileY(south); y++) {
      keys.push(`${x}/${y}`);
    }
  }
  return keys;
};
