import { useMemo, useState } from 'react';

interface DutySegment {
  type: 'off-duty' | 'sleeper' | 'driving' | 'on-duty';
  startHour: number;
  endHour: number;
  location?: string;
  notes?: string;
}

interface DutyTimelineProps {
  segments: DutySegment[];
}

const dutyRows = [
  { type: 'off-duty', label: 'OFF DUTY', bg: 'bg-gradient-to-r from-gray-50 to-gray-100/50' },
  { type: 'sleeper', label: 'SLEEPER BERTH', bg: 'bg-gradient-to-r from-purple-50 to-purple-100/50' },
  { type: 'driving', label: 'DRIVING', bg: 'bg-gradient-to-r from-green-50 to-green-100/50' },
  { type: 'on-duty', label: 'ON DUTY', bg: 'bg-gradient-to-r from-blue-50 to-blue-100/50' },
];

interface Point {
  x: number;
  y: number;
  segment: DutySegment;
  time: number;
}

const ROW_HEIGHT = 48;
const TOTAL_HEIGHT = dutyRows.length * ROW_HEIGHT;

export function DutyTimeline({ segments }: DutyTimelineProps) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const hours = Array.from({ length: 25 }, (_, i) => i);

  const orderedSegments = useMemo(() => {
    return segments
      .map((segment) => {
        const rowIndex = dutyRows.findIndex((r) => r.type === segment.type);
        return { segment, rowIndex };
      })
      .filter((s) => s.rowIndex !== -1)
      .sort((a, b) => a.segment.startHour - b.segment.startHour)
      .map((s) => ({
        segment: s.segment,
        y: s.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
        startHour: s.segment.startHour,
        endHour: s.segment.endHour,
      }));
  }, [segments]);

  const rowTotals = useMemo(() => {
    const totals: Record<DutySegment['type'], number> = {
      'off-duty': 0,
      sleeper: 0,
      driving: 0,
      'on-duty': 0,
    };
    for (const s of segments) {
      if (s.type in totals) {
        totals[s.type] += Math.max(0, s.endHour - s.startHour);
      }
    }
    return totals;
  }, [segments]);

  const grandTotal = rowTotals['off-duty'] + rowTotals.sleeper + rowTotals.driving + rowTotals['on-duty'];

  const points = useMemo<Point[]>(() => {
    const list: Point[] = [];
    orderedSegments.forEach(({ segment, y, startHour, endHour }) => {
      list.push({ x: startHour, y, segment, time: startHour });
      list.push({ x: endHour, y, segment, time: endHour });
    });
    return list;
  }, [orderedSegments]);

  const pathD = useMemo(() => {
    if (orderedSegments.length === 0) return '';
    const xPct = (hour: number) => (hour / 24) * 100;
    const parts: string[] = [];

    orderedSegments.forEach((seg, i) => {
      parts.push(`M ${xPct(seg.startHour)} ${seg.y} L ${xPct(seg.endHour)} ${seg.y}`);
      const next = orderedSegments[i + 1];
      if (next && next.y !== seg.y) {
        const bridgeX = xPct(next.startHour);
        parts.push(`M ${bridgeX} ${seg.y} L ${bridgeX} ${next.y}`);
      }
    });

    return parts.join(' ');
  }, [orderedSegments]);

  return (
    <div className="space-y-3">
      {/* Timeline Grid */}
      <div className="relative bg-white rounded-lg border border-gray-300 overflow-hidden">
        {/* Header with hours */}
        <div className="bg-gradient-to-b from-gray-100 to-gray-50 border-b-2 border-gray-300">
          <div className="flex">
            {/* Label column */}
            <div className="w-32 shrink-0 border-r-2 border-gray-300" />

            {/* Hour columns with tick marks */}
            <div className="flex-1 flex">
              {hours.slice(0, 24).map((hour) => (
                <div
                  key={hour}
                  className="flex-1 border-r border-gray-200 last:border-r-0 relative"
                >
                  {/* Hour number */}
                  <div className="pt-1 pb-2 text-center">
                    <span className="text-xs font-semibold text-gray-700">
                      {hour.toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Total Hours column header */}
            <div className="w-20 shrink-0 border-l-2 border-gray-300 px-2 py-1 flex items-end justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-700 text-center leading-tight">
                Total<br />Hours
              </span>
            </div>
          </div>
        </div>

        {/* Duty status rows */}
        <div className="relative">
          {dutyRows.map((row, rowIndex) => (
            <div key={row.type} className={`flex border-b border-gray-200 last:border-b-0 ${row.bg}`}>
              {/* Row label */}
              <div className="w-32 shrink-0 border-r-2 border-gray-300 px-3 py-3 flex items-center" style={{ height: `${ROW_HEIGHT}px` }}>
                <span className="text-xs font-semibold text-gray-700">
                  {row.label}
                </span>
              </div>

              {/* Grid */}
              <div className="flex-1 relative" style={{ height: `${ROW_HEIGHT}px` }}>
                {/* Grid lines with 15-minute subdivisions */}
                <div className="absolute inset-0 flex">
                  {hours.slice(0, 24).map((hour) => (
                    <div key={hour} className="flex-1 border-r border-gray-200 last:border-r-0 relative">
                      {/* 15-minute marks */}
                      <div className="absolute top-0 left-1/4 w-px h-full bg-gray-100" />
                      {/* 30-minute mark - darker */}
                      <div className="absolute top-0 left-1/2 w-px h-full bg-gray-200" />
                      <div className="absolute top-0 left-3/4 w-px h-full bg-gray-100" />

                      <div className="relative h-3 border-t border-gray-300">
                        {/* Major tick (hour) - left edge */}
                        <div className="absolute left-0 top-0 w-px h-3 bg-gray-700" />

                        {/* 15min tick */}
                        <div className="absolute left-1/4 top-0 w-px h-2 bg-gray-400" />

                        {/* 30min tick (darker and longer) */}
                        <div className="absolute left-1/2 top-0 w-px h-2.5 bg-gray-700" />

                        {/* 45min tick */}
                        <div className="absolute left-3/4 top-0 w-px h-2 bg-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-row total */}
              <div
                className="w-20 shrink-0 border-l-2 border-gray-300 flex items-center justify-center"
                style={{ height: `${ROW_HEIGHT}px` }}
              >
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {formatTotal(rowTotals[row.type as DutySegment['type']])}
                </span>
              </div>
            </div>
          ))}

          {/* SVG line drawing - scales with parent via viewBox */}
          <svg
            className="absolute pointer-events-none"
            height={TOTAL_HEIGHT}
            style={{ left: '8rem', top: 0, width: 'calc(100% - 8rem - 5rem)' }}
            viewBox={`0 0 100 ${TOTAL_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="#000000"
                strokeWidth={2}
                strokeLinecap="square"
                strokeLinejoin="miter"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Points overlay */}
          <div className="absolute top-0 bottom-0" style={{ left: '8rem', right: '5rem' }}>
            {points.map((point, index) => {
              const isHovered = hoveredPoint === index;

              return (
                <div
                  key={index}
                  className="absolute pointer-events-auto cursor-pointer z-10"
                  style={{
                    left: `${(point.x / 24) * 100}%`,
                    top: `${point.y}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onMouseEnter={() => setHoveredPoint(index)}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  {/* Red circle point */}
                  <div className={`w-2.5 h-2.5 rounded-full bg-red-600 border-2 border-white shadow-md transition-transform ${
                    isHovered ? 'scale-150' : ''
                  }`} />

                  {/* Tooltip */}
                  {isHovered && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs whitespace-nowrap z-20">
                      <div className="font-semibold">
                        {dutyRows.find(r => r.type === point.segment.type)?.label}
                      </div>
                      <div className="text-gray-300 mt-1">
                        {formatTime(point.time)}
                      </div>
                      {point.segment.location && (
                        <div className="text-gray-300 mt-1">{point.segment.location}</div>
                      )}
                      {point.segment.notes && (
                        <div className="text-gray-300 mt-1">{point.segment.notes}</div>
                      )}
                      {/* Arrow */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Grand total row */}
        <div className="flex border-t-2 border-gray-300 bg-gray-50">
          <div className="w-32 shrink-0 border-r-2 border-gray-300 px-3 py-2 flex items-center">
            <span className="text-xs font-semibold text-gray-700">TOTAL</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-4 px-3 py-2 text-xs text-gray-600">
            {dutyRows.map((row) => (
              <span key={row.type} className="inline-flex items-center gap-1.5">
                <span className="font-medium text-gray-700">{row.label}:</span>
                <span className="tabular-nums text-gray-900">
                  {formatTotal(rowTotals[row.type as DutySegment['type']])}
                </span>
              </span>
            ))}
          </div>
          <div className="w-20 shrink-0 border-l-2 border-gray-300 flex items-center justify-center py-2">
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {formatTotal(grandTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTotal(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatTime(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}
