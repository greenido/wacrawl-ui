import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { SplashScreen } from './components/help/SplashScreen';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { Chats } from './pages/Chats';
import { Dashboard } from './pages/Dashboard';
import { Media } from './pages/Media';
import { People } from './pages/People';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { useAppStore } from './store/appStore';

const WELCOME_SEEN_KEY = 'wacrawl:welcome-seen';
const shortcutRoutes: Record<string, string> = {
  '1': '/',
  '2': '/people',
  '3': '/chats',
  '4': '/media',
  '5': '/search',
  '6': '/settings',
};

export function App() {
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate('/search');
      }
      if (event.metaKey && shortcutRoutes[event.key]) {
        event.preventDefault();
        navigate(shortcutRoutes[event.key]);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    try {
      setShowWelcome(window.localStorage.getItem(WELCOME_SEEN_KEY) !== 'true');
    } catch {
      setShowWelcome(true);
    }
  }, []);

  function openHelp() {
    setShowWelcome(true);
  }

  function closeHelp() {
    try {
      window.localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    } catch {
      // Storage can be blocked in private contexts; closing the modal should still work.
    }
    setShowWelcome(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <Sidebar onOpenHelp={openHelp} />
      <div className="ml-[220px] min-h-screen">
        <TopBar onOpenHelp={openHelp} />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/people" element={<People />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/media" element={<Media />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {showWelcome ? <SplashScreen onClose={closeHelp} /> : null}
    </div>
  );
}
