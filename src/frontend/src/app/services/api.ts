import { config } from '../config';

const SESSION_KEY = 'elb.auth.session';

export interface AuthUser {
  id: number;
  username: string;
  email?: string | null;
  cdl_number?: string;
  home_terminal_address?: string;
  main_office_address?: string;
}

export interface AuthResponse {
  session_key: string;
  user: AuthUser;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface TripPayload {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used_hours: number;
  distance_miles?: number | null;
  driving_hours?: number | null;
  total_trip_hours?: number | null;
  fuel_stop_count?: number | null;
  route_geometry?: LatLon[];
  geocoded?: Record<string, unknown>;
}

export interface TripOut extends TripPayload {
  id: number;
  created_at: string;
  updated_at: string;
}

export type ApiSegmentType = 'off_duty' | 'sleeper' | 'driving' | 'on_duty';

export interface SegmentPayload {
  type: ApiSegmentType;
  start_minute: number;
  end_minute: number;
  location?: string;
  notes?: string;
}

export interface SegmentOut extends SegmentPayload {
  id: number;
}

export interface DailyLogPayload {
  trip_id?: number | null;
  log_date: string;
  from_location?: string;
  to_location?: string;
  truck_number?: string;
  trailer_number?: string;
  carrier_name?: string;
  miles_today?: number;
  total_mileage?: number;
  main_office_address?: string;
  home_terminal_address?: string;
}

export interface DailyLogPatch {
  trip_id?: number | null;
  from_location?: string;
  to_location?: string;
  truck_number?: string;
  trailer_number?: string;
  carrier_name?: string;
  miles_today?: number;
  total_mileage?: number;
  main_office_address?: string;
  home_terminal_address?: string;
}

export interface DailyLogOut {
  id: number;
  trip_id: number | null;
  log_date: string;
  from_location: string;
  to_location: string;
  truck_number: string;
  trailer_number: string;
  carrier_name: string;
  miles_today: number;
  total_mileage: number;
  main_office_address: string;
  home_terminal_address: string;
  total_driving_minutes: number;
  total_on_duty_minutes: number;
  segments: SegmentOut[];
  created_at: string;
  updated_at: string;
}

export interface PaginatedDailyLogs {
  items: DailyLogOut[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getSessionKey(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function setSessionKey(key: string | null): void {
  if (typeof window === 'undefined') return;
  if (key) window.localStorage.setItem(SESSION_KEY, key);
  else window.localStorage.removeItem(SESSION_KEY);
}

function persistAuthResponse(response: AuthResponse): AuthResponse {
  if (!response.session_key) {
    throw new ApiError(401, 'Login response did not include a session key');
  }
  setSessionKey(response.session_key);
  return response;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const sessionKey = getSessionKey();
  if (sessionKey) {
    headers.Authorization = `Session ${sessionKey}`;
    headers['X-Session-Key'] = sessionKey;
  }

  const res = await fetch(`${config.apiUrl}/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : `Request failed (HTTP ${res.status})`);
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  auth: {
    register: (username: string, password: string, email?: string) =>
      request<AuthResponse>('POST', '/auth/register', { username, password, email }).then(
        persistAuthResponse,
      ),
    login: (username: string, password: string) =>
      request<AuthResponse>('POST', '/auth/login', { username, password }).then(persistAuthResponse),
    logout: () => request<void>('POST', '/auth/logout'),
    me: () => request<AuthUser>('GET', '/auth/me'),
  },
  trips: {
    list: () => request<TripOut[]>('GET', '/trips/'),
    create: (payload: TripPayload) => request<TripOut>('POST', '/trips/', payload),
    get: (id: number) => request<TripOut>('GET', `/trips/${id}`),
    update: (id: number, payload: Partial<TripPayload>) =>
      request<TripOut>('PATCH', `/trips/${id}`, payload),
    remove: (id: number) => request<void>('DELETE', `/trips/${id}`),
  },
  logs: {
    list: (params?: {
      date_from?: string;
      date_to?: string;
      trip_id?: number;
      page?: number;
      page_size?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.date_from) qs.set('date_from', params.date_from);
      if (params?.date_to) qs.set('date_to', params.date_to);
      if (params?.trip_id) qs.set('trip_id', String(params.trip_id));
      if (params?.page) qs.set('page', String(params.page));
      if (params?.page_size) qs.set('page_size', String(params.page_size));
      const suffix = qs.toString() ? `?${qs}` : '';
      return request<PaginatedDailyLogs>('GET', `/logs/${suffix}`);
    },
    today: () => request<DailyLogOut>('GET', '/logs/today'),
    create: (payload: DailyLogPayload) => request<DailyLogOut>('POST', '/logs/', payload),
    get: (id: number) => request<DailyLogOut>('GET', `/logs/${id}`),
    update: (id: number, payload: DailyLogPatch) =>
      request<DailyLogOut>('PATCH', `/logs/${id}`, payload),
    remove: (id: number) => request<void>('DELETE', `/logs/${id}`),
    replaceSegments: (id: number, segments: SegmentPayload[]) =>
      request<SegmentOut[]>('PUT', `/logs/${id}/segments`, segments),
  },
};
