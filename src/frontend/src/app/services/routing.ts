export interface LatLon {
  lat: number;
  lon: number;
}

export interface GeocodeResult extends LatLon {
  displayName: string;
}

export interface RouteResult {
  distanceMiles: number;
  durationHours: number;
  coordinates: LatLon[];
  legs: { distanceMiles: number; durationHours: number }[];
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

const geocodeCache = new Map<string, GeocodeResult>();

const knownCoords: Record<string, GeocodeResult> = {
  'green bay, wi': { lat: 44.5133, lon: -88.0133, displayName: 'Green Bay, Wisconsin, USA' },
  'chicago, il': { lat: 41.8781, lon: -87.6298, displayName: 'Chicago, Illinois, USA' },
  'atlanta, ga': { lat: 33.749, lon: -84.388, displayName: 'Atlanta, Georgia, USA' },
  'dallas, tx': { lat: 32.7767, lon: -96.797, displayName: 'Dallas, Texas, USA' },
  'denver, co': { lat: 39.7392, lon: -104.9903, displayName: 'Denver, Colorado, USA' },
  'salt lake city, ut': { lat: 40.7608, lon: -111.891, displayName: 'Salt Lake City, Utah, USA' },
  'los angeles, ca': { lat: 34.0522, lon: -118.2437, displayName: 'Los Angeles, California, USA' },
  'phoenix, az': { lat: 33.4484, lon: -112.074, displayName: 'Phoenix, Arizona, USA' },
  'nashville, tn': { lat: 36.1627, lon: -86.7816, displayName: 'Nashville, Tennessee, USA' },
  'milwaukee, wi': { lat: 43.0389, lon: -87.9065, displayName: 'Milwaukee, Wisconsin, USA' },
};

export async function searchSuggestions(
  query: string,
  signal?: AbortSignal,
  limit = 5,
): Promise<GeocodeResult[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 2) return [];

  const local = Object.entries(knownCoords)
    .filter(([k, v]) => k.includes(key) || v.displayName.toLowerCase().includes(key))
    .slice(0, limit)
    .map(([, v]) => v);

  try {
    const url = `${NOMINATIM}?format=json&limit=${limit}&addressdetails=0&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return local;
    const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
    const remote = data.map((d) => ({
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      displayName: d.display_name,
    }));

    const seen = new Set<string>();
    const merged: GeocodeResult[] = [];
    for (const item of [...local, ...remote]) {
      const dedupeKey = item.displayName.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(item);
      if (merged.length >= limit) break;
    }
    return merged;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return local;
  }
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult> {
  const key = query.trim().toLowerCase();
  if (!key) throw new Error('Empty location');

  const cached = geocodeCache.get(key);
  if (cached) return cached;

  const known = knownCoords[key];
  if (known) {
    geocodeCache.set(key, known);
    return known;
  }

  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Geocode failed for "${query}" (HTTP ${res.status})`);

  const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
  if (!data.length) throw new Error(`No results for "${query}"`);

  const result: GeocodeResult = {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
  geocodeCache.set(key, result);
  return result;
}

const METERS_PER_MILE = 1609.344;

export async function fetchRoute(points: LatLon[], signal?: AbortSignal): Promise<RouteResult> {
  if (points.length < 2) throw new Error('Need at least 2 points to build route');

  const coordPath = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const url = `${OSRM}/${coordPath}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { signal });

  if (!res.ok) throw new Error(`Routing failed (HTTP ${res.status})`);

  const data: {
    code: string;
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
      legs: Array<{ distance: number; duration: number }>;
    }>;
  } = await res.json();

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No route found for given locations');
  }

  const route = data.routes[0];
  return {
    distanceMiles: route.distance / METERS_PER_MILE,
    durationHours: route.duration / 3600,
    coordinates: route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
    legs: route.legs.map((leg) => ({
      distanceMiles: leg.distance / METERS_PER_MILE,
      durationHours: leg.duration / 3600,
    })),
  };
}

export function interpolateAlongRoute(coords: LatLon[], targetMiles: number): LatLon | null {
  if (coords.length < 2) return null;

  let accumulated = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const segMiles = haversineMiles(coords[i - 1], coords[i]);
    if (accumulated + segMiles >= targetMiles) {
      const t = (targetMiles - accumulated) / segMiles;
      return {
        lat: coords[i - 1].lat + (coords[i].lat - coords[i - 1].lat) * t,
        lon: coords[i - 1].lon + (coords[i].lon - coords[i - 1].lon) * t,
      };
    }
    accumulated += segMiles;
  }
  return coords[coords.length - 1];
}

export function haversineMiles(a: LatLon, b: LatLon): number {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
