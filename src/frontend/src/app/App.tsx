import { useEffect, useState } from 'react';
import { LogbookEntry } from './components/LogbookEntry';
import { LoginForm } from './components/LoginForm';
import { api, ApiError, AuthUser, getSessionKey, setSessionKey } from './services/api';

type AuthState =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'authed'; user: AuthUser };

export default function App() {
  const [auth, setAuth] = useState<AuthState>(() =>
    getSessionKey() ? { status: 'loading' } : { status: 'anon' },
  );

  useEffect(() => {
    if (auth.status !== 'loading') return;
    let cancelled = false;
    api.auth
      .me()
      .then((user) => {
        if (!cancelled) setAuth({ status: 'authed', user });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) setSessionKey(null);
        setAuth({ status: 'anon' });
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        Loading…
      </div>
    );
  }

  if (auth.status === 'anon') {
    return <LoginForm onAuthed={(user) => setAuth({ status: 'authed', user })} />;
  }

  async function handleLogout() {
    try {
      await api.auth.logout();
    } catch {
      // ignore; local UI state is enough after a failed session cleanup
    }
    setSessionKey(null);
    setAuth({ status: 'anon' });
  }

  return <LogbookEntry user={auth.user} onLogout={handleLogout} />;
}
