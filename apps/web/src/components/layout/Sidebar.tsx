import { BarChart3, HelpCircle, Image, LayoutDashboard, MessageCircle, Search, Settings as SettingsIcon, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/people', label: 'People', icon: Users },
  { to: '/chats', label: 'Chats', icon: MessageCircle },
  { to: '/media', label: 'Media', icon: Image },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

interface SidebarProps {
  onOpenHelp: () => void;
}

export function Sidebar({ onOpenHelp }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-[220px] flex-col border-r border-slate-200 bg-slate-950 text-white">
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-white/60">Local analytics</p>
            <h1 className="text-lg font-semibold">WaCrawl</h1>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive ? 'bg-white text-slate-950' : 'text-white/70 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <button
          type="button"
          onClick={onOpenHelp}
          className="mb-4 flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-left text-sm font-medium text-white/80 transition hover:bg-white hover:text-slate-950"
        >
          <HelpCircle className="h-4 w-4" />
          Help guide
        </button>
        <div className="text-xs text-white/50">
        <p>Archive stays local.</p>
        <p>No cloud sync.</p>
        </div>
      </div>
    </aside>
  );
}
