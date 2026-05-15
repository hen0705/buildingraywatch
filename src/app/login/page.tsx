'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.push('/admin');
  }

  return (
    <div className={styles.page}>
      <svg className={styles.bgRay} viewBox="0 0 400 200" aria-hidden>
        <path d="M20,100 Q200,20 380,100 Q200,180 20,100 Z" fill="#4fb8a0" />
        <path d="M200,180 L175,220 M200,180 L225,220" stroke="#4fb8a0" strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>

      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <div className={styles.logo}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#0a1628" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 4C6 4 2 10 2 14c0 4 4 6 10 6s10-2 10-6c0-4-4-10-10-10Z" />
              <path d="M12 20l-4 3M12 20l4 3" />
            </svg>
          </div>
          <h1>Admin Login</h1>
          <p className={styles.subtitle}>RayWatch moderation dashboard</p>
        </div>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.field}>
          <label>Email address</label>
          <input
            type="email" placeholder="admin@raywatch.org" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <div className={styles.field}>
          <label>Password</label>
          <input
            type="password" placeholder="••••••••" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>

        <button className={styles.btnLogin} disabled={loading} onClick={handleLogin}>
          {loading ? <><span className="rw-spinner" />Signing in…</> : 'Sign in'}
        </button>

        <a href="/" className={styles.backLink}>← Back to RayWatch</a>
      </div>
    </div>
  );
}