import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { Dashboard } from './pages/Dashboard';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-8">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        {title} is planned for a later milestone.
      </div>
    </div>
  );
}

export function App() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate('/search');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <Sidebar />
      <div className="ml-[220px] min-h-screen">
        <TopBar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/people" element={<PlaceholderPage title="People" />} />
          <Route path="/chats" element={<PlaceholderPage title="Chats" />} />
          <Route path="/media" element={<PlaceholderPage title="Media" />} />
          <Route path="/search" element={<PlaceholderPage title="Search" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
