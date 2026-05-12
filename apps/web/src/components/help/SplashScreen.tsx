import {
  BarChart3,
  CalendarRange,
  Database,
  HelpCircle,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

interface SplashScreenProps {
  onClose: () => void;
}

const highlights = [
  {
    icon: Database,
    title: 'Your archive stays local',
    description: 'WaCrawl reads your SQLite archive from this machine. The dashboard is designed for local insight, not cloud sync.',
  },
  {
    icon: BarChart3,
    title: 'A fast overview first',
    description: 'The landing dashboard summarizes messages, chats, contacts, media, activity, and top relationships at a glance.',
  },
  {
    icon: CalendarRange,
    title: 'Filter the story',
    description: 'Use the date range controls to switch between recent activity and the full history of your WhatsApp archive.',
  },
];

const workflow = [
  {
    icon: ShieldCheck,
    label: 'Read-only API',
    text: 'The local API opens the WaCrawl database in readonly mode.',
  },
  {
    icon: MessageSquareText,
    label: 'Private analytics',
    text: 'The UI turns raw chats into trends without sending them elsewhere.',
  },
  {
    icon: Search,
    label: 'Explore deeper',
    text: 'Use search and the upcoming sections to move from totals into people, chats, and media.',
  },
];

export function SplashScreen({ onClose }: SplashScreenProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="relative max-h-full w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/40 bg-white shadow-2xl">
        <div className="absolute right-5 top-5 z-10">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/90 p-2 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Close welcome guide"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative overflow-hidden bg-slate-950 p-8 text-white sm:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.45),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.35),_transparent_30%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm text-white/80">
                <Sparkles className="h-4 w-4 text-brand-500" />
                Welcome to WaCrawl
              </div>
              <h2 id="welcome-title" className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
                Understand your WhatsApp archive without giving it away.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-white/75">
                This dashboard connects to your local WaCrawl database, turns it into readable analytics, and helps you explore
                patterns across conversations, time, people, and media.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  ['Local-first', 'No cloud sync'],
                  ['Readonly', 'Safer by default'],
                  ['Interactive', 'Filter and search'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                    <p className="text-sm text-white/55">{label}</p>
                    <p className="mt-1 font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="p-8 sm:p-10">
            <div className="flex items-center gap-3 text-slate-500">
              <HelpCircle className="h-5 w-5 text-brand-600" />
              <p className="text-sm font-semibold uppercase tracking-[0.2em]">What is going on?</p>
            </div>

            <div className="mt-6 space-y-4">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-950">{item.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-950">How the app works</p>
              <div className="mt-4 space-y-3">
                {workflow.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="text-sm leading-6 text-slate-500">{item.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                Start exploring
              </button>
              <p className="text-sm text-slate-500">You can reopen this anytime from Help.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
