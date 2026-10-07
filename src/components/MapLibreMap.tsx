import {
  LngLat,
  type MapLayerMouseEvent,
  type RequestTransformFunction,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RMap, useMap } from 'maplibre-react-components';
import { getHoydeFromPunkt } from '../api/getHoydeFromPunkt';
import { useEffect, useState } from 'react';
import { Overlay } from './Overlay';
import DrawComponent from './DrawComponent';
import { Button } from '@mui/material';
import { PilsLayer } from './PilsLayer';
import { getPilsSteder, type PilsSted } from '../api/getPilsSteder';
import { getGangavstander, getPilscrawlRute } from '../api/getPilscrawlRute';
import {
  avstandFraMatrise,
  lagKortestePilscrawl,
  luftlinje,
  velgKandidater,
  type Pilscrawl,
} from '../utils/pilscrawl';
import { PilscrawlLayer, PilscrawlPanel } from './PilsCrawl';

const TRONDHEIM_COORDS: [number, number] = [10.40565401, 63.4156575];

const KVP_BASE_URL = 'https://kvp.maps.norkart.no/mvt/';

type NorkartBasemapVariant =
  | 'standard'
  | 'standard-without-text'
  | 'greyscale'
  | 'greyscale-without-text'
  | 'darkmode'
  | 'transparent'
  | 'hybrid'
  | 'ortofoto';
const NORKART_BASEMAP_VARIANT: NorkartBasemapVariant = 'standard';

const NORKART_BASEMAP_STYLE = `${KVP_BASE_URL}norkart-basemap/${NORKART_BASEMAP_VARIANT}/style.json`;

export const MapLibreMap = () => {
  const [pointHoyde, setPointHoydeAtPunkt] = useState<number | undefined>(
    undefined
  );
  const [clickPoint, setClickPoint] = useState<LngLat | undefined>(undefined);
  const [pilsSteder, setPilsSteder] = useState<PilsSted[] | undefined>(
    undefined
  );

  const [pilscrawl, setPilscrawl] = useState<Pilscrawl | undefined>(undefined);
  const [alleSteder, setAlleSteder] = useState<PilsSted[]>([]);

  useEffect(() => {
    getPilsSteder().then(setAlleSteder);
  }, []);

  const togglePilsSteder = async () => {
    if (pilsSteder) {
      // Bar crawlen hører til pilskartet, så den forsvinner sammen med det
      setPilsSteder(undefined);
      setPilscrawl(undefined);
      return;
    }
    setPilsSteder(await getPilsSteder());
  };

  const lagPilscrawl = async (
    start: PilsSted,
    slutt: PilsSted | null,
    antall: number
  ) => {
    const kandidater = velgKandidater(alleSteder, start, slutt);
    const punkter = slutt
      ? [start, ...kandidater, slutt]
      : [start, ...kandidater];
    // Ekte gangavstander fra OSRM, med luftlinje som reserve hvis kallet feiler
    const matrise = await getGangavstander(punkter);
    const avstand = matrise ? avstandFraMatrise(punkter, matrise) : luftlinje;

    const stopp = lagKortestePilscrawl(
      start,
      slutt,
      kandidater,
      antall,
      avstand
    );
    setPilscrawl({ stopp });
    const rute = await getPilscrawlRute(stopp);
    // Ikke overskriv en nyere crawl hvis brukeren har laget en ny i mellomtiden
    setPilscrawl((naa) => (naa?.stopp === stopp ? { stopp, rute } : naa));
  };

  useEffect(() => {
    console.log(pointHoyde, clickPoint);
  }, [clickPoint, pointHoyde]);

  const onMapClick = async (e: MapLayerMouseEvent) => {
    const hoyder = await getHoydeFromPunkt(e.lngLat.lng, e.lngLat.lat);
    setPointHoydeAtPunkt(hoyder[0].Z);
    setClickPoint(new LngLat(e.lngLat.lng, e.lngLat.lat));
  };

  return (
    <RMap
      minZoom={6}
      initialCenter={TRONDHEIM_COORDS}
      initialZoom={12}
      mapStyle={NORKART_BASEMAP_STYLE}
      initialTransformRequest={transformRequest}
      style={{
        height: `calc(100dvh - var(--header-height))`,
      }}
      onClick={onMapClick}
      className={pilsSteder ? 'map-pils' : undefined}
    >
      <Overlay>
        <Button variant="contained" onClick={togglePilsSteder}>
          {pilsSteder ? 'Skjul pilspriser' : '🍺 Vis pilspriser'}
        </Button>
        {pilsSteder && (
          <PilscrawlPanel
            steder={alleSteder}
            crawl={pilscrawl}
            onLag={lagPilscrawl}
            onFjern={() => setPilscrawl(undefined)}
          />
        )}
      </Overlay>
      {pilsSteder && <PilsLayer steder={pilsSteder} />}
      {pilsSteder && pilscrawl && <PilscrawlLayer crawl={pilscrawl} />}
      <DrawComponent />
    </RMap>
  );
};

function MapFlyTo({ lng, lat }: { lng: number; lat: number }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo({ center: [lng, lat], zoom: 20, speed: 10 });
  }, [lng, lat, map]);

  return null;
}

const transformRequest: RequestTransformFunction = (url) => {
  if (!url.startsWith(KVP_BASE_URL)) {
    return { url };
  }

  const apiKey = import.meta.env.VITE_API_KEY;
  const separator = url.includes('?') ? '&' : '?';
  return { url: `${url}${separator}api_key=${encodeURIComponent(apiKey)}` };
};
