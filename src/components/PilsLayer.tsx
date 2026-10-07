import type {
  ExpressionSpecification,
  HeatmapLayerSpecification,
  LngLatBounds,
} from 'maplibre-gl';
import {
  RLayer,
  RMarker,
  RPopup,
  RSource,
  useMap,
} from 'maplibre-react-components';
import { useEffect, useMemo, useState } from 'react';
import type { PilsPrice, PilsSted } from '../api/getPilsData';
import { usePilsData } from '../hooks/usePilsData';
import {
  getCurrentPrice,
  getPriceColor,
  getPriceLevel,
  getPriceScale,
} from '../utils/pilsPris';

// Fra dette zoomnivået vises hvert enkelt sted med pris
const DETAIL_ZOOM = 14;

// Hvor langt "varmen" fra et sted rekker
const HEAT_RADIUS_METERS = 350;

// Heatmap-radius oppgis i piksler, så vi regner om fra meter. En piksel dekker
// halvparten så mange meter for hvert zoomnivå, derfor eksponentiell skala.
// Utzoomet går vi over til faste størrelser så heatmappet ikke forsvinner.
// Meter per piksel varierer med breddegraden, så vi regner fra midt i Norge.
const REFERENCE_LATITUDE = 63;
const METERS_PER_PIXEL_AT_ZOOM_0 =
  (40075016.686 * Math.cos((REFERENCE_LATITUDE * Math.PI) / 180)) / 512;
const RADIUS_AT_ZOOM_0 = HEAT_RADIUS_METERS / METERS_PER_PIXEL_AT_ZOOM_0;

const heatmapRadius: ExpressionSpecification = [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  5,
  10,
  10,
  20,
  12,
  RADIUS_AT_ZOOM_0 * 2 ** 12,
  20,
  RADIUS_AT_ZOOM_0 * 2 ** 20,
];

// Alle steder gir litt varme, så alle synes. Resten av vekten går til de
// billige stedene, slik at områder med mye billig pils blir varmest.
const MIN_WEIGHT = 0.3;
const getHeatWeight = (priceLevel: number) =>
  MIN_WEIGHT + (1 - MIN_WEIGHT) * (1 - priceLevel) ** 2;

const heatmapPaint: HeatmapLayerSpecification['paint'] = {
  'heatmap-weight': ['get', 'weight'],
  'heatmap-radius': heatmapRadius,
  // Utzoomet overlapper stedene mer, så vi demper for at sentrum ikke skal
  // bli mettet og skjule forskjellen på billig og dyrt
  'heatmap-intensity': [
    'interpolate',
    ['linear'],
    ['zoom'],
    5,
    0.4,
    10,
    0.35,
    DETAIL_ZOOM,
    0.9,
  ],
  // Pilsfarget fra rav til mørk brun. Selv lav tetthet (en bar alene) får
  // tydelig farge, mens de mørkeste fargene er forbeholdt mye billig pils.
  'heatmap-color': [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(240, 140, 10, 0)',
    0.01,
    'rgba(240, 140, 10, 0.4)',
    0.05,
    'rgba(234, 120, 8, 0.7)',
    0.25,
    'rgba(222, 95, 6, 0.78)',
    0.5,
    'rgba(200, 70, 8, 0.84)',
    0.75,
    'rgba(170, 45, 10, 0.88)',
    1,
    'rgba(124, 30, 18, 0.92)',
  ],
  // Tones ut når vi zoomer inn og de enkelte stedene vises
  'heatmap-opacity': [
    'interpolate',
    ['linear'],
    ['zoom'],
    DETAIL_ZOOM - 1,
    0.9,
    DETAIL_ZOOM + 1,
    0.35,
    DETAIL_ZOOM + 2.5,
    0,
  ],
};

type PilsStedNow = PilsSted & {
  currentPrice: PilsPrice;
  priceLevel: number;
};

const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const formatLiter = (liter: number) => `${liter.toLocaleString('nb-NO')} l`;

// Klokka brukes til å finne prisen som gjelder nå, og oppdateres hvert minutt
const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);
  return now;
};

// Om vi er zoomet inn nok til å vise enkeltsteder, og hvilket område som er
// synlig. Området oppdateres når kartet har stoppet, for å unngå mange
// oppdateringer mens man drar i kartet.
const useMapView = (detailZoom: number) => {
  const map = useMap();
  const [showDetails, setShowDetails] = useState(
    () => map.getZoom() >= detailZoom
  );
  const [bounds, setBounds] = useState<LngLatBounds>(() => map.getBounds());

  useEffect(() => {
    const onZoom = () => setShowDetails(map.getZoom() >= detailZoom);
    const onMoveEnd = () => setBounds(map.getBounds());
    map.on('zoom', onZoom);
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('zoom', onZoom);
      map.off('moveend', onMoveEnd);
    };
  }, [map, detailZoom]);

  return { showDetails, bounds };
};

export function PilsLayer() {
  const [hovered, setHovered] = useState<PilsStedNow | undefined>(undefined);
  const now = useNow();
  const { showDetails, bounds } = useMapView(DETAIL_ZOOM);
  const { oversikt, details } = usePilsData();

  // Alle steder i landet med prisen som gjelder nå. Er detaljene for stedet
  // ikke hentet ennå, bruker vi normalprisen fra oversikten.
  const heatPoints = useMemo(
    () =>
      (oversikt?.bars ?? []).map(([id, longitude, latitude, normalPint]) => {
        const sted = details.get(id);
        return {
          longitude,
          latitude,
          pint: sted ? getCurrentPrice(sted.prices, now).pint : normalPint,
        };
      }),
    [oversikt, details, now]
  );

  const priceScale = useMemo(
    () => getPriceScale(heatPoints.map((point) => point.pint)),
    [heatPoints]
  );

  const heatmapData: GeoJSON.FeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: heatPoints.map((point) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [point.longitude, point.latitude],
        },
        properties: {
          weight: getHeatWeight(getPriceLevel(point.pint, priceScale)),
        },
      })),
    }),
    [heatPoints, priceScale]
  );

  // Pils-ikoner bare for stedene som er synlige
  const visibleSteder: PilsStedNow[] = useMemo(() => {
    if (!showDetails) return [];
    return [...details.values()]
      .filter((sted) => bounds.contains([sted.longitude, sted.latitude]))
      .map((sted) => {
        const currentPrice = getCurrentPrice(sted.prices, now);
        return {
          ...sted,
          currentPrice,
          priceLevel: getPriceLevel(currentPrice.pint, priceScale),
        };
      });
  }, [showDetails, details, bounds, now, priceScale]);

  return (
    <>
      <RSource id="pils" type="geojson" data={heatmapData} />
      <RLayer
        id="pils-heatmap"
        type="heatmap"
        source="pils"
        paint={heatmapPaint}
      />

      {visibleSteder.map((sted) => (
        <RMarker
          key={sted.id}
          longitude={sted.longitude}
          latitude={sted.latitude}
        >
          <PilsMarker
            sted={sted}
            onMouseEnter={() => setHovered(sted)}
            onMouseLeave={() => setHovered(undefined)}
          />
        </RMarker>
      ))}

      {showDetails && hovered && (
        <RPopup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          offset={30}
          maxWidth="280px"
        >
          <PilsPopupContent sted={hovered} />
        </RPopup>
      )}
    </>
  );
}

function PilsMarker({
  sted,
  onMouseEnter,
  onMouseLeave,
}: {
  sted: PilsStedNow;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={() => window.open(sted.url, '_blank', 'noopener')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))',
      }}
    >
      <span style={{ fontSize: '22px', lineHeight: 1 }}>🍺</span>
      <span
        style={{
          marginTop: '-2px',
          padding: '1px 5px',
          borderRadius: '8px',
          backgroundColor: getPriceColor(sted.priceLevel),
          color: 'white',
          fontSize: '11px',
          fontWeight: 'bold',
        }}
      >
        {sted.currentPrice.pint},-
      </span>
    </div>
  );
}

function PilsPopupContent({ sted }: { sted: PilsStedNow }) {
  return (
    <div style={{ fontSize: '13px', lineHeight: 1.4 }}>
      <strong style={{ fontSize: '15px' }}>{sted.name}</strong>
      <div style={{ color: '#666' }}>{sted.address}</div>
      <div style={{ margin: '6px 0' }}>
        {sted.brewery} · {formatLiter(sted.size)}
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {sted.prices.map((price) => {
            const isCurrent = price === sted.currentPrice;
            return (
              <tr
                key={`${price.pint}-${price.valid}`}
                style={{ borderTop: '1px solid #eee' }}
              >
                <td
                  style={{
                    padding: '4px 8px 4px 0',
                    fontWeight: isCurrent ? 'bold' : 'normal',
                    color: isCurrent
                      ? getPriceColor(sted.priceLevel)
                      : 'inherit',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'top',
                  }}
                >
                  {price.pint},-
                </td>
                <td style={{ padding: '4px 0' }}>
                  {isCurrent && <strong>Nå · </strong>}
                  {price.valid}
                  <div style={{ color: '#888', fontSize: '11px' }}>
                    {price.price},- for {formatLiter(sted.size)} · sjekket{' '}
                    {formatDate(price.priceChecked)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>
        Priser per halvliter. Kilde: pilsguiden.no
      </div>
    </div>
  );
}
