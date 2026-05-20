import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { LocationAutocomplete } from './LocationAutocomplete';

export interface DutySegment {
  type: 'off-duty' | 'sleeper' | 'driving' | 'on-duty';
  startHour: number;
  endHour: number;
  location?: string;
  notes?: string;
}

const SEGMENT_TYPES: Array<{ value: DutySegment['type']; label: string }> = [
  { value: 'off-duty', label: 'Off Duty' },
  { value: 'sleeper', label: 'Sleeper Berth' },
  { value: 'driving', label: 'Driving' },
  { value: 'on-duty', label: 'On Duty, Not Driving' },
];

const typeColors: Record<DutySegment['type'], string> = {
  'off-duty': 'bg-slate-100 text-slate-800',
  sleeper: 'bg-violet-100 text-violet-800',
  driving: 'bg-emerald-100 text-emerald-800',
  'on-duty': 'bg-blue-100 text-blue-800',
};

interface Props {
  segments: DutySegment[];
  onChange: (next: DutySegment[]) => void;
  readOnly?: boolean;
}

interface DraftSegment {
  type: DutySegment['type'];
  startTime: string;
  endTime: string;
  endsAtMidnight: boolean;
  location: string;
  notes: string;
}

const emptyDraft: DraftSegment = {
  type: 'driving',
  startTime: '08:00',
  endTime: '09:00',
  endsAtMidnight: false,
  location: '',
  notes: '',
};

export function SegmentEditor({ segments, onChange, readOnly = false }: Props) {
  const [draft, setDraft] = useState<DraftSegment>(emptyDraft);
  const [error, setError] = useState<string | undefined>();

  const sorted = [...segments].sort((a, b) => a.startHour - b.startHour);
  const nextStartHour = sorted.length ? sorted[sorted.length - 1].endHour : 0;
  const nextStartTime = hoursToTime(nextStartHour);
  const dayFull = nextStartHour >= 24;

  const addSegment = () => {
    const startHour = nextStartHour;
    const endHour = draft.endsAtMidnight ? 24 : timeToHours(draft.endTime);
    if (Number.isNaN(endHour)) {
      setError('Invalid time');
      return;
    }
    if (endHour <= startHour) {
      setError('End must be after start');
      return;
    }
    if (endHour > 24) {
      setError('End must be ≤ 24:00');
      return;
    }
    setError(undefined);
    const next: DutySegment = {
      type: draft.type,
      startHour,
      endHour,
      location: draft.location.trim() || undefined,
      notes: draft.notes.trim() || undefined,
    };
    onChange([...segments, next].sort((a, b) => a.startHour - b.startHour));
    setDraft({
      ...emptyDraft,
      startTime: hoursToTime(endHour),
      endTime: hoursToTime(Math.min(24, endHour + 1)),
      endsAtMidnight: false,
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50">
        <div className="grid grid-cols-[1fr_100px_170px_1fr_1.5fr] items-start gap-2 border-b border-slate-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Type</div>
          <div>Start</div>
          <div>End</div>
          <div>Location</div>
          <div>Remarks</div>
        </div>

        {sorted.length === 0 && (
          <div className="px-3 py-4 text-sm text-slate-500">No segments yet. Add one below.</div>
        )}

        {sorted.map((seg, i) => (
          <div
            key={`${seg.startHour}-${seg.endHour}-${i}`}
            className="grid grid-cols-[1fr_100px_170px_1fr_1.5fr] items-start gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
          >
            <div className={`inline-flex min-h-9 items-center rounded-md px-2 py-1 ${typeColors[seg.type]}`}>
              {SEGMENT_TYPES.find((t) => t.value === seg.type)?.label ?? seg.type}
            </div>
            <div className="flex min-h-9 items-center px-1 text-slate-700">{hoursToTime(seg.startHour)}</div>
            <div className="flex min-h-9 items-center px-1 text-slate-700">{hoursToTime(seg.endHour)}</div>
            <div className="flex min-h-9 items-center px-1 text-slate-700 break-words">{seg.location ?? '—'}</div>
            <div className="flex min-h-9 items-center px-1 py-1 text-slate-700 whitespace-pre-wrap break-words">{seg.notes ?? '—'}</div>
          </div>
        ))}
      </div>

      {!readOnly && (
      <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-blue-800">
          <span>Add segment</span>
        </div>
        {dayFull ? (
          <div className="px-1 py-2 text-sm text-slate-600">Day full — 24:00 reached. No more segments can be added.</div>
        ) : (
        <div className="grid grid-cols-[1fr_100px_170px_1fr_1.5fr_auto] items-center gap-2">
          <select
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as DutySegment['type'] })}
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            {SEGMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="flex h-9 items-center justify-center rounded-md border border-slate-200 bg-slate-100 px-2 text-sm text-slate-700">
            {nextStartTime}
          </div>
          <div className="flex h-9 items-stretch gap-1">
            {draft.endsAtMidnight ? (
              <div className="flex flex-1 items-center justify-center rounded-md border border-blue-300 bg-blue-100 px-2 text-sm font-medium text-blue-900">
                24:00
              </div>
            ) : (
              <Input
                type="time"
                value={draft.endTime}
                onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                className="h-9 flex-1"
              />
            )}
            <button
              type="button"
              onClick={() => setDraft({ ...draft, endsAtMidnight: !draft.endsAtMidnight })}
              title="Set end to midnight (24:00)"
              aria-pressed={draft.endsAtMidnight}
              className={`h-9 shrink-0 rounded-md border px-2 text-xs font-medium transition-colors ${
                draft.endsAtMidnight
                  ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              EOD
            </button>
          </div>
          <LocationAutocomplete
            value={draft.location}
            onChange={(value) => setDraft({ ...draft, location: value })}
            onSelect={(suggestion) => setDraft({ ...draft, location: suggestion.displayName })}
            placeholder="Location"
          />
          <Input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Remarks"
            className="h-9"
          />
          <Button
            type="button"
            onClick={addSegment}
            className="h-9 bg-blue-700 px-3 text-white hover:bg-blue-800"
          >
            <Plus size={16} className="mr-1" />
            Add
          </Button>
        </div>
        )}
        {error && <div className="mt-2 text-sm font-medium text-rose-600">{error}</div>}
      </div>
      )}
    </div>
  );
}

function timeToHours(time: string): number {
  if (!time) return NaN;
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h + m / 60;
}

function hoursToTime(hours: number): string {
  const safe = Math.max(0, Math.min(24, hours));
  const h = Math.floor(safe);
  const m = Math.round((safe - h) * 60);
  if (m === 60) return `${String(h + 1).padStart(2, '0')}:00`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
