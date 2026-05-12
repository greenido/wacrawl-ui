import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { TopContact } from '../../api/client';
import { formatNumber } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';

interface TopContactsBarProps {
  data: TopContact[];
  loading: boolean;
}

export function TopContactsBar({ data, loading }: TopContactsBarProps) {
  const chartData = data.map((contact) => ({
    ...contact,
    shortName: contact.name.length > 18 ? `${contact.name.slice(0, 18)}...` : contact.name,
  }));

  return (
    <Card>
      <div className="mb-4">
        <CardTitle>Top Contacts</CardTitle>
        <p className="text-sm text-slate-500">Most active conversations</p>
      </div>
      {loading ? (
        <Skeleton className="h-72" />
      ) : data.length === 0 ? (
        <div className="flex h-72 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
          No activity in this period.
        </div>
      ) : (
        <div className="h-72 overflow-x-auto">
          <BarChart width={560} height={288} data={chartData} layout="vertical" margin={{ left: 12, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis dataKey="shortName" type="category" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={120} />
              <Tooltip formatter={(value) => formatNumber(Number(value))} />
              <Bar dataKey="messageCount" name="Messages" fill="#22c55e" radius={[0, 8, 8, 0]} />
          </BarChart>
        </div>
      )}
    </Card>
  );
}
