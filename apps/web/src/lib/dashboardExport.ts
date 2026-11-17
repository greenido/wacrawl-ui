import { toCsv, type CsvColumn } from '../../../api/src/lib/csv';
import type { Period } from '../api/client';
import type { DashboardData } from '../hooks/useDashboardData';

/** One number from one chart: long form, so any spreadsheet can pivot it back. */
export interface ChartValue {
  chart: string;
  label: string;
  series: string;
  value: number;
}

/**
 * Every numeric field of every row becomes a value, labelled by `labelKey`.
 * Generic on purpose: a field added to a stat type shows up here unasked.
 */
function chartValues<Row extends object>(chart: string, rows: Row[], labelKey: keyof Row & string): ChartValue[] {
  return rows.flatMap((row) => Object.entries(row)
    .filter(([key, value]) => key !== labelKey && typeof value === 'number')
    .map(([series, value]) => ({ chart, label: String(row[labelKey]), series, value: value as number })));
}

/** The charts on the dashboard's main grid, in the order they appear there. */
export function dashboardChartValues(data: DashboardData): ChartValue[] {
  return [
    ...(data.overview ? chartValues('overview', [{ label: 'archive', ...data.overview }], 'label') : []),
    ...chartValues('message_volume', data.messageVolume, 'date'),
    ...chartValues('top_contacts', data.topContacts, 'name'),
    ...chartValues(`activity_heatmap_${data.heatmapYear}`, data.heatmap, 'date'),
    ...chartValues('hour_of_day', data.hourOfDay, 'hour'),
    ...chartValues('day_of_week', data.dayOfWeek, 'label'),
    ...chartValues('sent_received_ratio', data.sentReceivedRatio, 'month'),
    ...chartValues('media_breakdown', data.mediaBreakdown, 'mediaType'),
    ...chartValues('media_senders', data.mediaSenders, 'name'),
    ...chartValues('response_times', data.responseTimes, 'name'),
    ...chartValues('group_activity', data.groupActivity, 'name'),
    ...(data.streaks ? chartValues('streaks', [{ label: 'days', ...data.streaks }], 'label') : []),
  ];
}

const COLUMNS: Array<CsvColumn<ChartValue>> = [
  { header: 'chart', value: (row) => row.chart },
  { header: 'label', value: (row) => row.label },
  { header: 'series', value: (row) => row.series },
  { header: 'value', value: (row) => row.value },
];

export function dashboardCsv(data: DashboardData): string {
  return toCsv(COLUMNS, dashboardChartValues(data));
}

/** Everything the dashboard loaded, as the API returned it. */
export function dashboardJson(data: DashboardData, period: Period, timeZone: string, now = new Date()): string {
  const { loadingOverview: _a, loadingCharts: _b, error: _c, heatmapYear, ...charts } = data;
  return `${JSON.stringify({ exportedAt: now.toISOString(), period, timeZone, heatmapYear, ...charts }, null, 2)}\n`;
}
