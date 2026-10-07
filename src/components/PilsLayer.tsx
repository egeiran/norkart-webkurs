import { RMarker, RPopup } from 'maplibre-react-components';
import { useState } from 'react';
import type { PilsSted } from '../api/getPilsSteder';

const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const formatLiter = (liter: number) => `${liter.toLocaleString('nb-NO')} l`;

export function PilsLayer({ steder }: { steder: PilsSted[] }) {
  const [hovered, setHovered] = useState<PilsSted | undefined>(undefined);

  return (
    <>
      {steder.map((sted) => (
        <RMarker
          key={sted.id}
          longitude={sted.longitude}
          latitude={sted.latitude}
        >
          <div
            onMouseEnter={() => setHovered(sted)}
            onMouseLeave={() => setHovered(undefined)}
            onClick={() => window.open(sted.url, '_blank', 'noopener')}
            style={{
              fontSize: '26px',
              cursor: 'pointer',
              filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))',
            }}
          >
            🍺
          </div>
        </RMarker>
      ))}

      {hovered && (
        <RPopup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          initialAnchor="bottom"
          offset={22}
          maxWidth="280px"
        >
          <PilsPopupContent sted={hovered} />
        </RPopup>
      )}
    </>
  );
}

function PilsPopupContent({ sted }: { sted: PilsSted }) {
  const cheapest = sted.prices[0];

  return (
    <div style={{ fontSize: '13px', lineHeight: 1.4 }}>
      <strong style={{ fontSize: '15px' }}>{sted.name}</strong>
      <div style={{ color: '#666' }}>{sted.address}</div>
      <div style={{ margin: '6px 0' }}>
        {sted.brewery} · {formatLiter(sted.size)}
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {sted.prices.map((price) => (
            <tr
              key={`${price.pint}-${price.valid}`}
              style={{ borderTop: '1px solid #eee' }}
            >
              <td
                style={{
                  padding: '4px 8px 4px 0',
                  fontWeight: price === cheapest ? 'bold' : 'normal',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'top',
                }}
              >
                {price.pint},-
              </td>
              <td style={{ padding: '4px 0' }}>
                {price.valid}
                <div style={{ color: '#888', fontSize: '11px' }}>
                  {price.price},- for {formatLiter(sted.size)} · sjekket{' '}
                  {formatDate(price.priceChecked)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>
        Priser per halvliter. Kilde: pilsguiden.no
      </div>
    </div>
  );
}
