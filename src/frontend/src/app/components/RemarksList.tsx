import { Clock, MapPin } from 'lucide-react';

interface Remark {
  time: string;
  type: string;
  description: string;
  location?: string;
}

interface RemarksListProps {
  remarks: Remark[];
}

const typeColors: Record<string, string> = {
  'On Duty': 'bg-blue-100 text-blue-700 border-blue-200',
  'Driving': 'bg-green-100 text-green-700 border-green-200',
  'Off Duty': 'bg-gray-100 text-gray-700 border-gray-200',
  'Sleeper': 'bg-purple-100 text-purple-700 border-purple-200',
};

export function RemarksList({ remarks }: RemarksListProps) {
  if (remarks.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic py-4 text-center bg-gray-50 rounded-lg">
        No remarks for this day
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {remarks.map((remark, index) => (
        <div
          key={index}
          className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-start gap-3">
            {/* Time badge */}
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-white px-3 py-1.5 rounded-md border border-gray-200 shrink-0">
              <Clock size={14} />
              {remark.time}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${typeColors[remark.type] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                  {remark.type}
                </span>
                {remark.location && (
                  <span className="flex items-center gap-1 text-xs text-gray-600">
                    <MapPin size={12} />
                    {remark.location}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700">{remark.description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
