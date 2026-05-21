import { useEffect, useState } from 'react';
import { LogbookEntry } from './components/LogbookEntry';
import { LoginForm } from './components/LoginForm';
import { api, AuthUser } from './services/api';

type AuthState =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'authed'; user: AuthUser };

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    if (auth.status !== 'loading') return;
    let cancelled = false;
    api.auth
      .me()
      .then((user) => {
        if (!cancelled) setAuth({ status: 'authed', user });
      })
      .catch(() => {
        if (cancelled) return;
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
    setAuth({ status: 'anon' });
  }

  return <LogbookEntry user={auth.user} onLogout={handleLogout} />;
}
