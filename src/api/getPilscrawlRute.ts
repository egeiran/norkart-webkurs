import type { LineString } from 'geojson';

// Norkarts ruteberegner har bare bilnett, så for gange bruker vi OSRM sin
// gåprofil fra OpenStreetMap. Den kjenner gangstier og gangbruer som Gamle Bybro.
const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot';

type Stopp = { longitude: number; latitude: number };

const tilKoordinater = (stopp: Stopp[]) =>
  stopp.map((s) => `${s.longitude},${s.latitude}`).join(';');

// Henter en gårute som går innom alle stoppene i rekkefølge
export const getPilscrawlRute = async (
  stopp: Stopp[]
): Promise<LineString | undefined> => {
  if (stopp.length < 2) {
    return undefined;
  }

  const query = `${OSRM_FOOT_URL}/route/v1/foot/${tilKoordinater(stopp)}?overview=full&geometries=geojson`;

  try {
    const apiResult = await fetch(query);

    if (apiResult.ok) {
      const data = await apiResult.json();
      return data.routes?.[0]?.geometry;
    } else {
      console.error('API request failed with status:', apiResult.status);
      return undefined;
    }
  } catch (error) {
    console.error('An error occurred while fetching data:', error);
    return undefined;
  }
};

// Henter gangavstand i km mellom alle par av stopp (matrise[i][j] = fra i til j)
export const getGangavstander = async (
  stopp: Stopp[]
): Promise<number[][] | undefined> => {
  const query = `${OSRM_FOOT_URL}/table/v1/foot/${tilKoordinater(stopp)}?annotations=distance`;

  try {
    const apiResult = await fetch(query);

    if (apiResult.ok) {
      const data = await apiResult.json();
      const meter: (number | null)[][] | undefined = data.distances;
      // null betyr at OSRM ikke fant noen vei mellom punktene
      return meter?.map((rad) =>
        rad.map((m) => (m === null ? Infinity : m / 1000))
      );
    } else {
      console.error('API request failed with status:', apiResult.status);
      return undefined;
    }
  } catch (error) {
    console.error('An error occurred while fetching data:', error);
    return undefined;
  }
};
