import { useMap } from 'maplibre-react-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getPilsOversikt,
  getPilsRute,
  type PilsOversikt,
  type PilsSted,
} from '../api/getPilsData';
import {
  getTileKey,
  getTileKeysInBounds,
  type TileKey,
} from '../utils/pilsTiles';

// Detaljene (navn, priser og tidsvinduer) hentes først når man har zoomet
// såpass langt inn at bare noen få ruter er synlige
const LOAD_DETAILS_FROM_ZOOM = 10;

// Laster oversikten over alle steder med en gang, og henter detaljene for
// rutene som er synlige hver gang kartet har flyttet seg. Ruter som allerede
// er hentet, hentes ikke på nytt.
export const usePilsData = () => {
  const map = useMap();
  const [oversikt, setOversikt] = useState<PilsOversikt | undefined>();
  const [details, setDetails] = useState<Map<number, PilsSted>>(new Map());
  const requestedTiles = useRef(new Set<TileKey>());

  useEffect(() => {
    getPilsOversikt()
      .then(setOversikt)
      .catch((error) => console.error('Kunne ikke hente pilsdata', error));
  }, []);

  // Bare ruter som faktisk har steder finnes som filer
  const tilesWithBars = useMemo(
    () => new Set(oversikt?.bars.map(([, lng, lat]) => getTileKey(lng, lat))),
    [oversikt]
  );

  useEffect(() => {
    if (!oversikt) return;

    const loadVisibleTiles = () => {
      if (map.getZoom() < LOAD_DETAILS_FROM_ZOOM) return;

      const bounds = map.getBounds();
      const newTiles = getTileKeysInBounds(
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ).filter(
        (key) => tilesWithBars.has(key) && !requestedTiles.current.has(key)
      );

      for (const key of newTiles) {
        requestedTiles.current.add(key);
        getPilsRute(key)
          .then((steder) =>
            setDetails((previous) => {
              const next = new Map(previous);
              for (const sted of steder) next.set(sted.id, sted);
              return next;
            })
          )
          .catch((error) => {
            // Prøv igjen neste gang kartet flyttes
            requestedTiles.current.delete(key);
            console.error(`Kunne ikke hente pilsrute ${key}`, error);
          });
      }
    };

    loadVisibleTiles();
    map.on('moveend', loadVisibleTiles);
    return () => {
      map.off('moveend', loadVisibleTiles);
    };
  }, [map, oversikt, tilesWithBars]);

  return { oversikt, details };
};
