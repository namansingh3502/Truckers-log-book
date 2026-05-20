export type DayStatus = 'past' | 'today' | 'future';

export interface DutySegment {
  type: 'off-duty' | 'sleeper' | 'driving' | 'on-duty';
  startHour: number;
  endHour: number;
  location?: string;
  notes?: string;
}

export interface TripForm {
  currentLocation: string;
  pickupLocation: string;
  dropoffLocation: string;
  currentCycleUsed: number;
}

export interface TripPlan {
  distanceMiles: number;
  drivingHours: number;
  totalTripHours: number;
  cycleRemaining: number;
  fuelStopCount: number;
}

export function getDayStatus(isoDate: string): DayStatus {
  const today = startOfDay(new Date()).getTime();
  const target = startOfDay(new Date(`${isoDate}T00:00:00`)).getTime();
  if (target < today) return 'past';
  if (target > today) return 'future';
  return 'today';
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatIsoAsLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function buildTripPlan(
  trip: TripForm,
  routeMetrics?: { distanceMiles: number; durationHours: number },
): TripPlan {
  const fallbackCurrentToPickup = 250;
  const fallbackPickupToDropoff = 500;
  const distanceMiles = routeMetrics
    ? Math.round(routeMetrics.distanceMiles)
    : fallbackCurrentToPickup + fallbackPickupToDropoff;
  const drivingHours = routeMetrics
    ? roundToQuarter(routeMetrics.durationHours)
    : roundToQuarter(distanceMiles / 58);
  const fuelStopCount = Math.floor(distanceMiles / 1000);
  const fuelHours = fuelStopCount * 0.5;
  const requiredBreaks = drivingHours > 8 ? Math.max(1, Math.floor(drivingHours / 8)) : 0;
  const breakHours = requiredBreaks * 0.5;
  const serviceHours = 2;
  const cycleRemaining = Math.max(0, 70 - clamp(trip.currentCycleUsed, 0, 70));
  const workingHours = drivingHours + fuelHours + breakHours + serviceHours;
  const restPeriods = Math.max(0, Math.ceil(Math.max(0, drivingHours - 10.5) / 10.5));
  const restHours = restPeriods * 10;
  const totalTripHours = workingHours + restHours;

  return {
    distanceMiles,
    drivingHours,
    totalTripHours,
    cycleRemaining,
    fuelStopCount,
  };
}

export function sumDuration(segments: DutySegment[], type: DutySegment['type']): number {
  return segments
    .filter((segment) => segment.type === type)
    .reduce((sum, segment) => sum + (segment.endHour - segment.startHour), 0);
}

export function formatDuration(totalHours: number): string {
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  if (hours === 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatDecimalHours(totalHours: number): string {
  const rounded = Math.round(totalHours * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString();
}

export function roundToQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
