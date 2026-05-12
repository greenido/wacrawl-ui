import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { MessageVolumePoint } from '../../api/client';
import { Card, CardTitle, Skeleton } from '../ui/Card';

interface MessageVolumeAreaProps {
  data: MessageVolumePoint[];
  loading: boolean;
}

export function MessageVolumeArea({ data, loading }: MessageVolumeAreaProps) {
  return (
    <Card className="col-span-2">
      <div className="mb-4 flex items-center justify-between">
        <CardTitle>Message Volume</CardTitle>
        <p className="text-sm text-slate-500">Sent vs received</p>
      </div>
      {loading ? (
        <Skeleton className="h-72" />
      ) : data.length === 0 ? (
        <div className="flex h-72 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
          No activity in this period.
        </div>
      ) : (
        <div className="h-72 overflow-x-auto">
          <AreaChart width={960} height={288} data={data} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="sentGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="receivedGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#0f172a" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#0f172a" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip />
              <Area type="monotone" dataKey="received" name="Received" stroke="#0f172a" fill="url(#receivedGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="sent" name="Sent" stroke="#22c55e" fill="url(#sentGradient)" strokeWidth={2} />
          </AreaChart>
        </div>
      )}
    </Card>
  );
}
