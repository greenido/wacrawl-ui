import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TopContact } from '../../api/client';
import { formatNumber } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';

interface TopContactsBarProps {
  data: TopContact[];
  loading: boolean;
  onContactClick?: (jid: string) => void;
}

export function TopContactsBar({ data, loading, onContactClick }: TopContactsBarProps) {
  const chartData = data.map((contact) => ({
    ...contact,
    shortName: contact.name.length > 24 ? `${contact.name.slice(0, 24)}...` : contact.name,
  }));

  return (
    <Card className="col-span-2">
      <div className="mb-4">
        <CardTitle>Top Contacts</CardTitle>
        <p className="text-sm text-slate-500">Most active conversations — click a contact to see all chats</p>
      </div>
      {loading ? (
        <Skeleton className="h-80" />
      ) : data.length === 0 ? (
        <div className="flex h-80 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
          No activity in this period.
        </div>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis dataKey="shortName" type="category" tick={{ fontSize: 13 }} tickLine={false} axisLine={false} width={160} />
              <Tooltip
                formatter={(value) => formatNumber(Number(value))}
                cursor={{ fill: 'rgba(34,197,94,0.08)' }}
              />
              <Bar
                dataKey="messageCount"
                name="Messages"
                fill="#22c55e"
                radius={[0, 8, 8, 0]}
                cursor={onContactClick ? 'pointer' : undefined}
                onClick={(entry) => {
                  const jid = (entry as { payload?: Partial<TopContact> }).payload?.jid;
                  if (onContactClick && jid) onContactClick(jid);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
