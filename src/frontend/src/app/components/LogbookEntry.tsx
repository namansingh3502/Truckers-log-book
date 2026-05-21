import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  LogOut,
  MapPin,
  Navigation,
  Plus,
  Truck,
} from 'lucide-react';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DutyTimeline } from './DutyTimeline';
import { LocationAutocomplete } from './LocationAutocomplete';
import { RouteMap } from './RouteMap';
import { SegmentEditor } from './SegmentEditor';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { fetchRoute, geocode, GeocodeResult, RouteResult } from '../services/routing';
import {
  api,
  ApiError,
  ApiSegmentType,
  AuthUser,
  DailyLogOut,
  DailyLogPatch,
  SegmentOut,
  SegmentPayload,
} from '../services/api';
import {
  buildTripPlan,
  clamp,
  DayStatus,
  DutySegment,
  formatDecimalHours,
  formatDuration,
  formatIsoAsLong,
  getDayStatus,
  sumDuration,
  toIsoDate,
  TripForm,
} from './logbook-utils';

interface LogEntry {
  id: number;
  date: string;
  isoDate: string;
  from: string;
  to: string;
  truck: string;
  trailer: string;
  carrier: string;
  miles: number;
  totalMileage: number;
  mainOfficeAddress: string;
  homeTerminalAddress: string;
  totalDriving: string;
  totalOnDuty: string;
  dutySegments: DutySegment[];
}

interface RouteData {
  current: GeocodeResult;
  pickup: GeocodeResult;
  dropoff: GeocodeResult;
  route: RouteResult;
}

const defaultTrip: TripForm = {
  currentLocation: 'Green Bay, WI',
  pickupLocation: 'Chicago, IL',
  dropoffLocation: 'Atlanta, GA',
  currentCycleUsed: 14,
};

interface Props {
  user: AuthUser;
  onLogout: () => void;
}

const UI_TO_API_SEG: Record<DutySegment['type'], ApiSegmentType> = {
  'off-duty': 'off_duty',
  sleeper: 'sleeper',
  driving: 'driving',
  'on-duty': 'on_duty',
};

const API_TO_UI_SEG: Record<ApiSegmentType, DutySegment['type']> = {
  off_duty: 'off-duty',
  sleeper: 'sleeper',
  driving: 'driving',
  on_duty: 'on-duty',
};

function uiSegToApi(s: DutySegment): SegmentPayload {
  return {
    type: UI_TO_API_SEG[s.type],
    start_minute: Math.round(s.startHour * 60),
    end_minute: Math.round(s.endHour * 60),
    location: s.location ?? '',
    notes: s.notes ?? '',
  };
}

function apiSegToUi(s: SegmentOut): DutySegment {
  return {
    type: API_TO_UI_SEG[s.type],
    startHour: s.start_minute / 60,
    endHour: s.end_minute / 60,
    location: s.location || undefined,
    notes: s.notes || undefined,
  };
}

function apiLogToUi(l: DailyLogOut): LogEntry {
  return {
    id: l.id,
    date: formatIsoAsLong(l.log_date),
    isoDate: l.log_date,
    from: l.from_location,
    to: l.to_location,
    truck: l.truck_number,
    trailer: l.trailer_number,
    carrier: l.carrier_name,
    miles: l.miles_today,
    totalMileage: l.total_mileage,
    mainOfficeAddress: l.main_office_address,
    homeTerminalAddress: l.home_terminal_address,
    totalDriving: formatDuration(l.total_driving_minutes / 60),
    totalOnDuty: formatDuration(l.total_on_duty_minutes / 60),
    dutySegments: l.segments.map(apiSegToUi),
  };
}

const PATCH_FIELDS: Array<keyof LogEntry> = [
  'from',
  'to',
  'truck',
  'trailer',
  'carrier',
  'miles',
  'totalMileage',
  'mainOfficeAddress',
  'homeTerminalAddress',
];

function logPatchFromEntry(entry: LogEntry): DailyLogPatch {
  return {
    from_location: entry.from,
    to_location: entry.to,
    truck_number: entry.truck,
    trailer_number: entry.trailer,
    carrier_name: entry.carrier,
    miles_today: entry.miles,
    total_mileage: entry.totalMileage,
    main_office_address: entry.mainOfficeAddress,
    home_terminal_address: entry.homeTerminalAddress,
  };
}

export function LogbookEntry({ user, onLogout }: Props) {
  const [form, setForm] = useState<TripForm>(defaultTrip);
  const [submittedTrip, setSubmittedTrip] = useState<TripForm>(defaultTrip);
  const [expandedDay, setExpandedDay] = useState<number | null>(1);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | undefined>();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalLogs, setTotalLogs] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [currentTripId, setCurrentTripId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const patchTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    api.logs
      .list({ page, page_size: pageSize })
      .then((data) => {
        if (cancelled) return;
        setLogs(data.items.map(apiLogToUi));
        setTotalLogs(data.total);
        setHasNext(data.has_next);
        setExpandedDay(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLogsError(err instanceof ApiError ? err.message : 'Failed to load logs');
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize]);

  useEffect(() => {
    return () => {
      patchTimers.current.forEach(clearTimeout);
      patchTimers.current.clear();
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));

  const loadRoute = useCallback(async (trip: TripForm, persist: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRouteLoading(true);
    setRouteError(undefined);

    try {
      const [current, pickup, dropoff] = await Promise.all([
        geocode(trip.currentLocation, controller.signal),
        geocode(trip.pickupLocation, controller.signal),
        geocode(trip.dropoffLocation, controller.signal),
      ]);
      const route = await fetchRoute([current, pickup, dropoff], controller.signal);
      if (controller.signal.aborted) return;
      setRouteData({ current, pickup, dropoff, route });

      if (persist) {
        const plan = buildTripPlan(trip, {
          distanceMiles: route.distanceMiles,
          durationHours: route.durationHours,
        });
        try {
          const created = await api.trips.create({
            current_location: trip.currentLocation,
            pickup_location: trip.pickupLocation,
            dropoff_location: trip.dropoffLocation,
            current_cycle_used_hours: clamp(trip.currentCycleUsed, 0, 70),
            distance_miles: plan.distanceMiles,
            driving_hours: plan.drivingHours,
            total_trip_hours: plan.totalTripHours,
            fuel_stop_count: plan.fuelStopCount,
            route_geometry: route.coordinates,
            geocoded: {
              current: { ...current },
              pickup: { ...pickup },
              dropoff: { ...dropoff },
            },
          });
          if (!controller.signal.aborted) setCurrentTripId(created.id);
        } catch {
          // non-fatal — keep route visible even if persistence fails
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setRouteData(null);
      setRouteError((err as Error).message || 'Unable to plan route');
    } finally {
      if (!controller.signal.aborted) setRouteLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoute(defaultTrip, false);
    return () => abortRef.current?.abort();
  }, [loadRoute]);

  const tripPlan = useMemo(
    () =>
      buildTripPlan(
        submittedTrip,
        routeData
          ? { distanceMiles: routeData.route.distanceMiles, durationHours: routeData.route.durationHours }
          : undefined,
      ),
    [submittedTrip, routeData],
  );

  const hasToday = useMemo(() => logs.some((log) => getDayStatus(log.isoDate) === 'today'), [logs]);
  const orderedLogs = useMemo(
    () => [...logs].sort((a, b) => b.isoDate.localeCompare(a.isoDate)),
    [logs],
  );

  const schedulePatch = useCallback((logId: number, patch: DailyLogPatch) => {
    const timers = patchTimers.current;
    const existing = timers.get(logId);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      api.logs.update(logId, patch).catch((err) => {
        setLogsError(err instanceof ApiError ? err.message : 'Failed to save log');
      });
      timers.delete(logId);
    }, 600);
    timers.set(logId, handle);
  }, []);

  const updateLogField = (logIndex: number, patch: Partial<LogEntry>) => {
    setLogs((prev) => {
      const target = prev[logIndex];
      if (!target) return prev;
      if (getDayStatus(target.isoDate) !== 'today') return prev;
      const next = prev.map((log, i) => (i === logIndex ? { ...log, ...patch } : log));
      const updated = next[logIndex];
      const onlyFields = Object.fromEntries(
        Object.entries(patch).filter(([k]) => (PATCH_FIELDS as string[]).includes(k)),
      ) as Partial<LogEntry>;
      if (Object.keys(onlyFields).length) {
        schedulePatch(updated.id, logPatchFromEntry(updated));
      }
      return next;
    });
  };

  const updateLogSegments = async (logIndex: number, segments: DutySegment[]) => {
    const target = logs[logIndex];
    if (!target || getDayStatus(target.isoDate) !== 'today') return;
    try {
      await api.logs.replaceSegments(target.id, segments.map(uiSegToApi));
      const fresh = await api.logs.get(target.id);
      setLogs((prev) =>
        prev.map((log, i) => (i === logIndex ? apiLogToUi(fresh) : log)),
      );
    } catch (err) {
      setLogsError(err instanceof ApiError ? err.message : 'Failed to save segments');
    }
  };

  const addDay = async () => {
    if (hasToday) return;
    const todayIso = toIsoDate(new Date());
    const previous = logs[logs.length - 1];
    try {
      const created = await api.logs.create({
        log_date: todayIso,
        trip_id: currentTripId,
        from_location: previous?.to || submittedTrip.currentLocation,
        to_location: '',
        truck_number: previous?.truck ?? '',
        trailer_number: previous?.trailer ?? '',
        carrier_name: previous?.carrier ?? '',
        miles_today: 0,
        total_mileage: previous?.totalMileage ?? 0,
        main_office_address: previous?.mainOfficeAddress ?? user.main_office_address ?? '',
        home_terminal_address: previous?.homeTerminalAddress ?? user.home_terminal_address ?? '',
      });
      setLogs((prev) => [...prev, apiLogToUi(created)]);
      setExpandedDay(1);
    } catch (err) {
      setLogsError(err instanceof ApiError ? err.message : 'Failed to add log');
    }
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned: TripForm = {
      ...form,
      currentCycleUsed: clamp(Number(form.currentCycleUsed) || 0, 0, 70),
    };
    setSubmittedTrip(cleaned);
    setExpandedDay(1);
    loadRoute(cleaned, true);
  }

  function applyLocationSelection(field: keyof TripForm, value: string) {
    const next: TripForm = { ...form, [field]: value };
    const cleaned: TripForm = {
      ...next,
      currentCycleUsed: clamp(Number(next.currentCycleUsed) || 0, 0, 70),
    };
    setForm(next);
    setSubmittedTrip(cleaned);
    loadRoute(cleaned, false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                <Truck size={16} />
                Trip Planner
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">Route and ELD Log Generator</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Plan a property-carrying trip with pickup, drop off, fuel, rest stops, and daily log sheets.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-medium text-slate-900">{user.username}</span>
              </span>
              <Button
                type="button"
                onClick={onLogout}
                className="h-9 border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              >
                <LogOut size={14} className="mr-1.5" />
                Log out
              </Button>
            </div>
          </div>
        </header>

        {logsError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {logsError}
          </div>
        )}

        <Tabs defaultValue="route" className="w-full">
          <TabsList className="h-10 w-full max-w-md rounded-lg bg-slate-200 p-1">
            <TabsTrigger value="route" className="flex-1 rounded-md data-[state=active]:bg-white data-[state=active]:shadow">
              <Navigation size={16} className="mr-1.5" />
              Route Planner
            </TabsTrigger>
            <TabsTrigger value="logbook" className="flex-1 rounded-md data-[state=active]:bg-white data-[state=active]:shadow">
              <FileText size={16} className="mr-1.5" />
              Logbook
            </TabsTrigger>
          </TabsList>

          <TabsContent value="route" className="mt-4 space-y-6">
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="h-[450px] space-y-4 lg:col-span-2">
                <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                      <Navigation size={18} />
                      Trip Details
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-slate-950">Search trip route</h2>
                  </div>

                  <div className="space-y-3">
                    <Field label="Current location">
                      <LocationAutocomplete
                        value={form.currentLocation}
                        onChange={(value) => setForm((prev) => ({ ...prev, currentLocation: value }))}
                        onSelect={(suggestion) =>
                          applyLocationSelection('currentLocation', suggestion.displayName)
                        }
                        placeholder="City, ST"
                        required
                      />
                    </Field>
                    <Field label="Pickup location">
                      <LocationAutocomplete
                        value={form.pickupLocation}
                        onChange={(value) => setForm((prev) => ({ ...prev, pickupLocation: value }))}
                        onSelect={(suggestion) =>
                          applyLocationSelection('pickupLocation', suggestion.displayName)
                        }
                        placeholder="City, ST"
                        required
                      />
                    </Field>
                    <Field label="Dropoff location">
                      <LocationAutocomplete
                        value={form.dropoffLocation}
                        onChange={(value) => setForm((prev) => ({ ...prev, dropoffLocation: value }))}
                        onSelect={(suggestion) =>
                          applyLocationSelection('dropoffLocation', suggestion.displayName)
                        }
                        placeholder="City, ST"
                        required
                      />
                    </Field>
                    <Field label="Current cycle used">
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          max={70}
                          step={0.25}
                          value={form.currentCycleUsed}
                          onChange={(event) => setForm({ ...form, currentCycleUsed: Number(event.target.value) })}
                          className="pr-14"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">hrs</span>
                      </div>
                    </Field>
                    <Button className="h-11 w-full bg-blue-700 px-6 text-white hover:bg-blue-800">
                      Search Route
                    </Button>
                  </div>
                </form>
              </div>

              <div className="lg:col-span-3">
                <RouteMap
                  currentLocation={routeData ? { ...routeData.current, label: submittedTrip.currentLocation } : undefined}
                  pickupLocation={routeData ? { ...routeData.pickup, label: submittedTrip.pickupLocation } : undefined}
                  dropoffLocation={routeData ? { ...routeData.dropoff, label: submittedTrip.dropoffLocation } : undefined}
                  route={routeData?.route}
                  fuelStopCount={tripPlan.fuelStopCount}
                  loading={routeLoading}
                  error={routeError}
                  totalTripHours={tripPlan.totalTripHours}
                />
              </div>
            </div>

          </TabsContent>

          <TabsContent value="logbook" className="mt-4 space-y-6">
            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-xl font-semibold text-slate-950">Daily Log Sheets</h2>
              </div>

              {!hasToday && (
                <Button
                  type="button"
                  onClick={addDay}
                  className="w-full justify-center border border-dashed border-blue-300 bg-blue-50 py-3 text-blue-800 hover:bg-blue-100"
                >
                  <Plus size={16} className="mr-1.5" />
                  Add today's log
                </Button>
              )}

              {orderedLogs.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
                  No daily logs yet. Add today's log to begin.
                </div>
              )}

              {orderedLogs.map((entry, displayIndex) => {
                const index = logs.findIndex((l) => l.id === entry.id);
                const dayNumber = displayIndex + 1;
                const isExpanded = expandedDay === dayNumber;
                const status = getDayStatus(entry.isoDate);
                const editable = status === 'today';

                return (
                  <div key={entry.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <button
                      onClick={() => setExpandedDay(isExpanded ? null : dayNumber)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-950">{entry.date}</span>
                            <StatusBadge status={status} />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <MapPin size={14} />
                              {entry.from || '—'} → {entry.to || '—'}
                            </span>
                            <span>{entry.miles} miles</span>
                            <span>Driving: {entry.totalDriving}</span>
                            <span>On Duty: {entry.totalOnDuty}</span>
                          </div>
                        </div>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3">
                        {(() => {
                          const decimal = formatDecimalHours(
                            sumDuration(entry.dutySegments, 'driving') +
                              sumDuration(entry.dutySegments, 'on-duty'),
                          );
                          return (
                            <div
                              className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-red-500 bg-red-50 text-red-600 shadow-sm"
                              title="Total driving + on-duty time (decimal hours)"
                              aria-label={`Total driving plus on-duty time: ${decimal} hours`}
                            >
                              <span className="text-lg font-bold leading-none tabular-nums">{decimal}</span>
                              <span className="mt-1 text-[9px] font-semibold uppercase leading-none tracking-wide">
                                hrs
                              </span>
                            </div>
                          );
                        })()}
                        <ChevronDown
                          size={20}
                          className={`shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100">
                        <div className="space-y-5 border-b border-slate-100 px-5 py-4">
                          <FieldGroup title="Trip">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <Field label="From (start of day)">
                                <Input
                                  value={entry.from}
                                  onChange={(e) => updateLogField(index, { from: e.target.value })}
                                  placeholder="Start location"
                                  disabled={!editable}
                                />
                              </Field>
                              <Field label="To (end of day)">
                                <Input
                                  value={entry.to}
                                  onChange={(e) => updateLogField(index, { to: e.target.value })}
                                  placeholder="End Location"
                                  disabled={!editable}
                                />
                              </Field>
                              <Field label="Truck/Trailer # or License Plate(s)/State">
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    value={entry.truck}
                                    onChange={(e) => updateLogField(index, { truck: e.target.value })}
                                    placeholder="Tractor #"
                                    disabled={!editable}
                                  />
                                  <Input
                                    value={entry.trailer}
                                    onChange={(e) => updateLogField(index, { trailer: e.target.value })}
                                    placeholder="Trailer #"
                                    disabled={!editable}
                                  />
                                </div>
                              </Field>
                            </div>
                          </FieldGroup>

                          <FieldGroup title="Mileage">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field label="Total Miles Driving Today">
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={entry.miles}
                                  onChange={(e) => updateLogField(index, { miles: Number(e.target.value) || 0 })}
                                  disabled={!editable}
                                />
                              </Field>
                              <Field label="Total Mileage Today">
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={entry.totalMileage}
                                  onChange={(e) => updateLogField(index, { totalMileage: Number(e.target.value) || 0 })}
                                  placeholder="Odometer total"
                                  disabled={!editable}
                                />
                              </Field>
                            </div>
                          </FieldGroup>

                          <FieldGroup title="Carrier">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <Field label="Name of Carrier or Carriers">
                                <Input
                                  value={entry.carrier}
                                  onChange={(e) => updateLogField(index, { carrier: e.target.value })}
                                  placeholder="Carrier name"
                                  disabled={!editable}
                                />
                              </Field>
                              <Field label="Main Office Address">
                                <Input
                                  value={entry.mainOfficeAddress}
                                  onChange={(e) => updateLogField(index, { mainOfficeAddress: e.target.value })}
                                  placeholder="Street, City, ST ZIP"
                                  disabled={!editable}
                                />
                              </Field>
                              <Field label="Home Terminal Address">
                                <Input
                                  value={entry.homeTerminalAddress}
                                  onChange={(e) => updateLogField(index, { homeTerminalAddress: e.target.value })}
                                  placeholder="Street, City, ST ZIP"
                                  disabled={!editable}
                                />
                              </Field>
                            </div>
                          </FieldGroup>
                        </div>

                        <div className="overflow-x-auto p-5">
                          <div className="min-w-[920px]">
                            <DutyTimeline segments={entry.dutySegments} />
                          </div>
                        </div>

                        <div className="px-5 pb-5">
                          <div className="mb-3 flex items-center gap-2">
                            <FileText size={16} className="text-slate-600" />
                            <h3 className="font-medium text-slate-950">Duty segments</h3>
                          </div>
                          <SegmentEditor
                            segments={entry.dutySegments}
                            onChange={(next) => updateLogSegments(index, next)}
                            readOnly={!editable}
                          />
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}

              {totalLogs > 0 && (
                <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row">
                  <div className="text-sm text-slate-600">
                    Showing{' '}
                    <span className="font-medium text-slate-900">
                      {(page - 1) * pageSize + 1}
                      –
                      {Math.min(page * pageSize, totalLogs)}
                    </span>{' '}
                    of <span className="font-medium text-slate-900">{totalLogs}</span> logs
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-sm text-slate-600">
                      <span>Per page</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setPage(1);
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        {[5, 10, 20, 50].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || logsLoading}
                      className="h-9 px-3"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="min-w-[5rem] text-center text-sm text-slate-600 tabular-nums">
                      Page {page} / {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!hasNext || logsLoading}
                      className="h-9 px-3"
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DayStatus }) {
  if (status === 'today') {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Today</span>;
  }
  if (status === 'past') {
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Past</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Upcoming</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}
