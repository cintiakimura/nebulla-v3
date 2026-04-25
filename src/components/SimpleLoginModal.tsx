import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';

export function SimpleLoginModal({
  open,
  onClose,
  cloudStorageReady,
  onSignedIn,
}: {
  open: boolean;
  onClose: () => void;
  cloudStorageReady: boolean;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setEmail('');
      setPassword('');
      setBusy(false);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const runJson = async (path: string, body: object) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await readResponseJson<{ error?: string }>(res);
    return { res, data };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cloudStorageReady) {
      setError('Server database is not configured (DATABASE_URL).');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    setBusy(true);
    try {
      const login = await runJson('/api/auth/login', {
        email: normalizedEmail,
        password,
        remember: true,
      });
      if (!login.res.ok) {
        const shouldCreate = login.res.status === 401 || login.res.status === 404;
        if (!shouldCreate) {
          setError(login.data.error || 'Login failed.');
          return;
        }
        const register = await runJson('/api/auth/register', {
          email: normalizedEmail,
          password,
          remember: true,
        });
        if (!register.res.ok) {
          setError(register.data.error || 'Could not create account.');
          return;
        }
      }
      onSignedIn();
      onClose();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-white/10 flex flex-col gap-5 shadow-2xl">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="text-2xl font-headline text-slate-100 font-normal">Login</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Use your email and password. If this is your first time, your account is created automatically.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm text-red-400/95">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 font-headline text-sm disabled:opacity-50"
          >
            {busy ? 'Please wait…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
