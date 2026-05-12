import { RotateCcw, Save } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ApiClientError,
  api,
  type HealthResponse,
  type PathsSettingsResponse,
  type ResolvedArchivePaths,
} from '../api/client';
import { Card } from '../components/ui/Card';

function pathsFormDefaults(from: ResolvedArchivePaths): Record<keyof ResolvedArchivePaths, string> {
  return {
    whatsappContainer: from.whatsappContainer ?? '',
    chatDb: from.chatDb ?? '',
    contactsDb: from.contactsDb ?? '',
    mediaRoot: from.mediaRoot ?? '',
    primaryDb: from.primaryDb ?? '',
  };
}

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [pathsMeta, setPathsMeta] = useState<PathsSettingsResponse | null>(null);
  const [form, setForm] = useState<Record<keyof ResolvedArchivePaths, string>>(() =>
    pathsFormDefaults({
      whatsappContainer: null,
      chatDb: null,
      contactsDb: null,
      mediaRoot: '',
      primaryDb: '',
    }),
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, p] = await Promise.all([api.health(), api.pathsSettings()]);
      setHealth(h);
      setPathsMeta(p);
      setForm(pathsFormDefaults(p.effective));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.pathsSettingsSave(form);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError(null);
    try {
      await api.pathsSettingsReset();
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Reset failed.');
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof ResolvedArchivePaths>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="space-y-6 p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Archive paths</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Point the API at your WhatsApp Desktop container and media folder. Overrides are saved locally under{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">~/.wacrawl/dashboard-paths.json</code>{' '}
          so images and videos load without extra headers.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      {health ? (
        <>
          <Card className={`text-sm ${health.ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'}`}>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              Primary database {health.ok ? 'opened successfully' : 'could not be opened'}
            </p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">{health.paths.primaryDb}</p>
          </Card>
          {health.mediaAccessible === false ? (
            <Card className="border-amber-200 bg-amber-50 text-sm dark:border-amber-900 dark:bg-amber-950/40">
              <p className="font-semibold text-amber-900 dark:text-amber-200">Media directory not accessible</p>
              <p className="mt-1 text-amber-800 dark:text-amber-300">{health.mediaError}</p>
              <p className="mt-2 text-amber-700 dark:text-amber-400">
                Media root: <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/60">{health.paths.mediaRoot}</code>
              </p>
            </Card>
          ) : null}
        </>
      ) : null}

      {pathsMeta?.pathsFile ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Using saved path overrides from disk (see JSON path above).</p>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">Currently using environment defaults only.</p>
      )}

      {loading ? (
        <Card className="animate-pulse py-16 text-center text-slate-500">Loading…</Card>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <Card className="space-y-5">
            <PathField
              label="WhatsApp shared container"
              description="Usually Library/Group Containers/group.net.whatsapp.WhatsApp.shared"
              value={form.whatsappContainer}
              onChange={(v) => update('whatsappContainer', v)}
            />
            <PathField
              label="Primary dashboard database (WaCrawl)"
              description="SQLite file produced by wacrawl sync — messages / chats / contacts schema expected."
              value={form.primaryDb}
              onChange={(v) => update('primaryDb', v)}
            />
            <PathField
              label="Chat database"
              description="ChatStorage.sqlite inside the WhatsApp container"
              value={form.chatDb}
              onChange={(v) => update('chatDb', v)}
            />
            <PathField
              label="Contacts database"
              description="ContactsV2.sqlite inside the WhatsApp container"
              value={form.contactsDb}
              onChange={(v) => update('contactsDb', v)}
            />
            <PathField
              label="Media directory"
              description="Typically …/Message/Media — used when resolving relative media paths"
              value={form.mediaRoot}
              onChange={(v) => update('mediaRoot', v)}
            />
          </Card>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save paths
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleReset()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to .env defaults
            </button>
          </div>

          {pathsMeta ? (
            <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
              <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">Environment defaults (.env)</summary>
              <dl className="mt-3 space-y-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                <PathRow label="Container" value={pathsMeta.envDefaults.whatsappContainer} />
                <PathRow label="Primary DB" value={pathsMeta.envDefaults.primaryDb} />
                <PathRow label="Chat DB" value={pathsMeta.envDefaults.chatDb} />
                <PathRow label="Contacts DB" value={pathsMeta.envDefaults.contactsDb} />
                <PathRow label="Media root" value={pathsMeta.envDefaults.mediaRoot} />
              </dl>
            </details>
          ) : null}
        </form>
      )}
    </main>
  );
}

function PathField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</span>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none ring-brand-500 focus:border-brand-500 focus:bg-white focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
      />
    </label>
  );
}

function PathRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
      <dt>{label}</dt>
      <dd className="break-all">{value ?? '—'}</dd>
    </div>
  );
}
