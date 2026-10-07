import { Autocomplete, Button, MenuItem, TextField } from '@mui/material';
import { RLayer, RMarker, RSource } from 'maplibre-react-components';
import { useState } from 'react';
import type { PilsSted } from '../api/getPilsSteder';
import {
  billigstePils,
  GANGFART_KMT,
  MAKS_ANTALL_STOPP,
  MIN_ANTALL_STOPP,
  ruteLengdeKm,
  type Pilscrawl,
} from '../utils/pilscrawl';

const lineStyle = {
  'line-color': '#5c2e00',
  'line-width': 5,
  'line-opacity': 0.85,
};

export function PilscrawlLayer({ crawl }: { crawl: Pilscrawl }) {
  return (
    <>
      {crawl.rute && (
        <>
          <RSource id="pilscrawl" type="geojson" data={crawl.rute} />
          <RLayer
            source="pilscrawl"
            id="pilscrawl-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={lineStyle}
          />
        </>
      )}
      {crawl.stopp.map((sted, i) => (
        <RMarker
          key={sted.id}
          longitude={sted.longitude}
          latitude={sted.latitude}
        >
          <div
            title={sted.name}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#f2a900',
              border: '3px solid white',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '14px',
              color: '#3b1d00',
            }}
          >
            {i + 1}
          </div>
        </RMarker>
      ))}
    </>
  );
}

export function PilscrawlOppsummering({ crawl }: { crawl: Pilscrawl }) {
  const km = ruteLengdeKm(crawl);
  const minutter = Math.round((km / GANGFART_KMT) * 60);
  const totalPris = crawl.stopp.reduce(
    (sum, sted) => sum + billigstePils(sted),
    0
  );

  return (
    <div style={{ marginTop: '12px', fontSize: '14px' }}>
      <ol style={{ margin: '6px 0', paddingLeft: '20px' }}>
        {crawl.stopp.map((sted) => (
          <li key={sted.id}>
            {sted.name} – {billigstePils(sted)},-
          </li>
        ))}
      </ol>
      <div style={{ color: '#555' }}>
        🚶 {km.toFixed(1)} km · ca. {minutter} min gange · 💰 {totalPris},-
        totalt
      </div>
    </div>
  );
}

export function PilscrawlPanel({
  steder,
  crawl,
  onLag,
  onFjern,
}: {
  steder: PilsSted[];
  crawl?: Pilscrawl;
  onLag: (start: PilsSted, slutt: PilsSted | null, antall: number) => void;
  onFjern: () => void;
}) {
  const [start, setStart] = useState<PilsSted | null>(null);
  const [slutt, setSlutt] = useState<PilsSted | null>(null);
  const [antall, setAntall] = useState(4);

  const sorterteSteder = [...steder].sort((a, b) =>
    a.name.localeCompare(b.name, 'nb')
  );

  return (
    <div style={{ marginTop: '12px', width: '320px' }}>
      <strong>🍻 Bar crawl</strong>
      <Autocomplete
        sx={{ mt: 1 }}
        size="small"
        options={sorterteSteder}
        getOptionLabel={(sted) => sted.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        value={start}
        onChange={(_, valgt) => setStart(valgt)}
        renderInput={(params) => <TextField {...params} label="Startsted" />}
      />
      <Autocomplete
        sx={{ mt: 1 }}
        size="small"
        options={sorterteSteder.filter((sted) => sted.id !== start?.id)}
        getOptionLabel={(sted) => sted.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        value={slutt?.id === start?.id ? null : slutt}
        onChange={(_, valgt) => setSlutt(valgt)}
        renderInput={(params) => (
          <TextField {...params} label="Sluttsted (valgfritt)" />
        )}
      />
      <TextField
        select
        sx={{ mt: 1, width: '140px' }}
        size="small"
        label="Antall barer"
        value={antall}
        onChange={(e) => setAntall(Number(e.target.value))}
      >
        {Array.from(
          { length: MAKS_ANTALL_STOPP - MIN_ANTALL_STOPP + 1 },
          (_, i) => MIN_ANTALL_STOPP + i
        ).map((n) => (
          <MenuItem key={n} value={n}>
            {n}
          </MenuItem>
        ))}
      </TextField>
      <div style={{ marginTop: '8px' }}>
        <Button
          variant="contained"
          disabled={!start}
          onClick={() =>
            start && onLag(start, slutt?.id === start.id ? null : slutt, antall)
          }
        >
          Finn bar crawl
        </Button>
        {crawl && (
          <Button sx={{ ml: 1 }} onClick={onFjern}>
            Fjern
          </Button>
        )}
      </div>
      {crawl && <PilscrawlOppsummering crawl={crawl} />}
    </div>
  );
}
