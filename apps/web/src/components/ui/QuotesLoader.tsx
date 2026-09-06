import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

const loadingQuotes = [
  { text: 'The single biggest problem in communication is the illusion that it has taken place.', author: 'George Bernard Shaw' },
  { text: 'The art of conversation is the art of hearing as well as of being heard.', author: 'William Hazlitt' },
  { text: 'Data is a precious thing and will last longer than the systems themselves.', author: 'Tim Berners-Lee' },
  { text: 'Deep-diving into your conversational archives...', author: 'WaCrawl' },
  { text: 'Counting your emojis, exclamation marks, and late-night messages...', author: 'WaCrawl' },
  { text: 'Reconstructing the history of your digital connections...', author: 'WaCrawl' },
  { text: 'Sorting through memories, media files, and long-forgotten threads...', author: 'WaCrawl' },
  { text: "The most important thing in communication is hearing what isn't said.", author: 'Peter Drucker' },
];

export function QuotesLoader({ isLoading }: { isLoading: boolean }) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');
  const [shouldRender, setShouldRender] = useState(isLoading);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setFadeState('out');
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % loadingQuotes.length);
        setFadeState('in');
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setShouldRender(false), 550);
      return () => clearTimeout(timer);
    }
    setShouldRender(true);
  }, [isLoading]);

  if (!shouldRender) return null;

  const currentQuote = loadingQuotes[quoteIndex];

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md transition-opacity duration-500',
        isLoading ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="max-w-md space-y-6 px-6 text-center">
        <div className="relative mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/30">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-8 w-8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
          <span className="absolute -right-1 -top-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500" />
          </span>
        </div>

        <div
          className={cn(
            'flex min-h-[80px] transform flex-col justify-center transition-all duration-300',
            fadeState === 'in' ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
          )}
        >
          <p className="text-lg font-medium italic leading-relaxed text-slate-100">
            &ldquo;{currentQuote.text}&rdquo;
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-brand-400">
            — {currentQuote.author}
          </p>
        </div>

        <div className="relative mx-auto h-1 w-48 overflow-hidden rounded-full bg-slate-800">
          <div className="animate-progress absolute left-0 top-0 h-full w-1/2 rounded-full bg-brand-500" />
        </div>
      </div>
    </div>
  );
}
