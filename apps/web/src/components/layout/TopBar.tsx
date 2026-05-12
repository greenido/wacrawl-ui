import { Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DateRangePicker } from './DateRangePicker';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/people': 'People',
  '/chats': 'Chats',
  '/media': 'Media',
  '/search': 'Search',
};

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = titles[location.pathname] ?? 'Dashboard';

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-8 py-4 backdrop-blur">
      <div>
        <p className="text-sm text-slate-500">WhatsApp archive</p>
        <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/search')}
          className="flex w-64 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-left text-sm text-slate-500 shadow-sm"
        >
          <Search className="h-4 w-4" />
          Search messages
          <kbd className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">⌘K</kbd>
        </button>
        {location.pathname === '/' ? <DateRangePicker /> : null}
      </div>
    </header>
  );
}
