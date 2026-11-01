import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TopContact } from '../../api/client';
import { formatNumber } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';
import { clickedRow } from './chartClick';

type TopContactChartRow = TopContact & { phone?: string | null; shortName: string };
type TopContactTooltipPayload = ReadonlyArray<{ payload?: unknown }>;

function TopContactTooltip({ active, payload }: { active?: boolean; payload?: TopContactTooltipPayload }) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload as TopContactChartRow | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <div className="font-medium text-slate-900">{row.name}</div>
      {row.phone ? <div className="mt-1 text-slate-600">Phone: {row.phone}</div> : null}
      <div className="mt-1 text-slate-600">
        <span className="text-slate-500">Messages</span>{' '}
        <span className="font-medium text-slate-800">{formatNumber(row.messageCount)}</span>
      </div>
    </div>
  );
}

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
        <p className="text-sm text-slate-500">Most active conversations — click a contact to see your messages in this period</p>
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
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 12, right: 24, top: 0, bottom: 0 }}
              style={onContactClick ? { cursor: 'pointer' } : undefined}
              onClick={(state) => {
                // On the chart, not the bar, so a contact with a stub of a bar is still clickable.
                const contact = clickedRow(chartData, state);
                if (contact && onContactClick) onContactClick(contact.jid);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis dataKey="shortName" type="category" tick={{ fontSize: 13 }} tickLine={false} axisLine={false} width={160} />
              <Tooltip
                content={(props) => (
                  <TopContactTooltip active={props.active} payload={props.payload as unknown as TopContactTooltipPayload} />
                )}
                cursor={{ fill: 'rgba(34,197,94,0.08)' }}
              />
              <Bar
                dataKey="messageCount"
                name="Messages"
                fill="#22c55e"
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
