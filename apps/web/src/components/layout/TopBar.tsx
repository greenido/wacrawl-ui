import { FlaskConical, HelpCircle, Moon, Search, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { DateRangePicker } from './DateRangePicker';
import { RefreshButton } from './RefreshButton';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/people': 'People',
  '/chats': 'Chats',
  '/groups': 'Groups',
  '/media': 'Media',
  '/search': 'Search',
  '/settings': 'Settings',
};

/** Sections whose routes carry a parameter, so an exact path lookup misses them. */
const prefixTitles: Array<[string, string]> = [
  ['/contacts', 'Contact'],
  ['/groups', 'Group'],
  ['/years', 'Year in Review'],
];

function titleFor(pathname: string): string {
  const exact = titles[pathname];
  if (exact) return exact;
  return prefixTitles.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Dashboard';
}

interface TopBarProps {
  onOpenHelp: () => void;
}

/** Nobody should mistake invented messages, or a screenshot of them, for a real archive. */
function DemoBadge() {
  const pathname = useLocation().pathname;
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [demo, setDemo] = useState(false);

  // Rechecked on navigation because Settings can repoint the API at another archive.
  useEffect(() => {
    let active = true;
    api.health()
      .then((health) => {
        if (active) setDemo(health.demo);
      })
      .catch(() => {
        // The pages themselves report API trouble.
      });
    return () => {
      active = false;
    };
  }, [pathname, dataVersion]);

  if (!demo) return null;

  return (
    <span
      title="This dashboard is showing an invented archive from --demo, not your messages."
      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <FlaskConical className="h-3.5 w-3.5" aria-hidden />
      Demo data
    </span>
  );
}

export function TopBar({ onOpenHelp }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const title = titleFor(location.pathname);
  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-8 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">WhatsApp archive</p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{title}</h1>
          <DemoBadge />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <RefreshButton />
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
          className="flex w-44 items-center gap-2 rounded-full 2xl:w-64 border border-slate-200 bg-white px-4 py-2 text-left text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <Search className="h-4 w-4" />
          Search messages
          <kbd className="ml-auto hidden rounded 2xl:inline bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">⌘K</kbd>
        </button>
        {location.pathname === '/' ? <DateRangePicker /> : null}
      </div>
    </header>
  );
}
