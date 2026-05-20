import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Clock, Fuel, Map as MapIcon, Route as RouteIcon } from 'lucide-react';
import type { LatLon, RouteResult } from '../services/routing';
import { interpolateAlongRoute } from '../services/routing';

interface Props {
  currentLocation?: LatLon & { label: string };
  pickupLocation?: LatLon & { label: string };
  dropoffLocation?: LatLon & { label: string };
  route?: RouteResult;
  fuelStopCount: number;
  loading: boolean;
  error?: string;
  totalTripHours: number;
}

type MarkerKind = 'Current' | 'Pickup' | 'Dropoff' | 'Fuel';

const markerColors: Record<MarkerKind, string> = {
  Current: '#0f172a',
  Pickup: '#2563eb',
  Dropoff: '#059669',
  Fuel: '#f59e0b',
};

function buildDivIcon(type: MarkerKind, label: string) {
  const color = markerColors[type];
  const initial = type[0];
  const html = `
    <div style="display:flex;align-items:center;gap:6px;transform:translate(-12px,-28px);">
      <div style="width:26px;height:26px;border-radius:9999px;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.25);border:2px solid #fff;">${initial}</div>
      <div style="background:rgba(255,255,255,0.96);padding:2px 8px;border-radius:6px;font-size:12px;font-weight:500;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,0.2);white-space:nowrap;">${label}</div>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

export function RouteMap({
  currentLocation,
  pickupLocation,
  dropoffLocation,
  route,
  fuelStopCount,
  loading,
  error,
  totalTripHours,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const fuelMarkers = useMemo(() => {
    if (!route || fuelStopCount === 0) return [] as Array<LatLon & { label: string }>;
    const markers: Array<LatLon & { label: string }> = [];
    for (let i = 1; i <= fuelStopCount; i += 1) {
      const targetMiles = (i * route.distanceMiles) / (fuelStopCount + 1);
      const point = interpolateAlongRoute(route.coordinates, targetMiles);
      if (point) markers.push({ ...point, label: `Fuel ${i}` });
    }
    return markers;
  }, [route, fuelStopCount]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [39.5, -98.35],
      zoom: 4,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const allPoints: LatLon[] = [];

    if (route?.coordinates.length) {
      const positions = route.coordinates.map((c) => [c.lat, c.lon] as [number, number]);
      L.polyline(positions, { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(layer);
      allPoints.push(...route.coordinates);
    }

    const addMarker = (point: (LatLon & { label: string }) | undefined, kind: MarkerKind) => {
      if (!point) return;
      L.marker([point.lat, point.lon], { icon: buildDivIcon(kind, point.label) })
        .bindPopup(`${kind}: ${point.label}`)
        .addTo(layer);
      allPoints.push(point);
    };

    addMarker(currentLocation, 'Current');
    addMarker(pickupLocation, 'Pickup');
    addMarker(dropoffLocation, 'Dropoff');

    fuelMarkers.forEach((m) => addMarker(m, 'Fuel'));

    if (allPoints.length > 1) {
      const bounds = L.latLngBounds(allPoints.map((p) => [p.lat, p.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (allPoints.length === 1) {
      map.setView([allPoints[0].lat, allPoints[0].lon], 6);
    }
  }, [currentLocation, pickupLocation, dropoffLocation, route, fuelMarkers]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        {route && (
          <div className="flex flex-wrap gap-3 text-sm text-slate-700">
            <span className="flex items-center gap-1.5">
              <RouteIcon size={14} />
              {route.distanceMiles.toFixed(0)} mi
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {totalTripHours.toFixed(1)} h trip plan
            </span>
            <span className="flex items-center gap-1.5">
              <Fuel size={14} />
              {fuelStopCount} fuel stops
            </span>
          </div>
        )}
      </div>

      <div className="relative h-[400px] w-full">
        {loading && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow">
              Fetching route from OSRM…
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 shadow">
            {error}
          </div>
        )}

        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
