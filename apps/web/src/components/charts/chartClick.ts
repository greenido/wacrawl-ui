import type { MouseHandlerDataParam } from 'recharts';

/** The data row under a chart click, or undefined for a click outside the plot. */
export function clickedRow<T>(data: T[], state: MouseHandlerDataParam): T | undefined {
  const index = state.activeTooltipIndex;
  return state.isTooltipActive && index != null ? data[Number(index)] : undefined;
}
