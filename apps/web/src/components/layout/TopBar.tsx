import { HelpCircle, Moon, Search, Sun } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { DateRangePicker } from './DateRangePicker';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/people': 'People',
  '/chats': 'Chats',
  '/media': 'Media',
  '/search': 'Search',
  '/settings': 'Settings',
};

interface TopBarProps {
  onOpenHelp: () => void;
}

export function TopBar({ onOpenHelp }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const title = titles[location.pathname] ?? 'Dashboard';
  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-8 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">WhatsApp archive</p>
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-brand-500 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ThemeIcon className="h-4 w-4" />
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-brand-500 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <HelpCircle className="h-4 w-4" />
          Help
        </button>
        <button
          type="button"
          onClick={() => navigate('/search')}
          className="flex w-64 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-left text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <Search className="h-4 w-4" />
          Search messages
          <kbd className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">⌘K</kbd>
        </button>
        {location.pathname === '/' ? <DateRangePicker /> : null}
      </div>
    </header>
  );
}
