import { FormEvent, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { api, ApiError, AuthUser, setToken } from '../services/api';

interface Props {
  onAuthed: (user: AuthUser) => void;
}

export function LoginForm({ onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'login'
          ? await api.auth.login(username, password)
          : await api.auth.register(username, password);
      setToken(res.token);
      onAuthed(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold text-slate-950">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">ELB Logbook</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Username</span>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          disabled={busy}
          className="h-10 w-full bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="block w-full text-center text-sm text-blue-700 hover:underline"
        >
          {mode === 'login' ? 'Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
