import React, { useState } from 'react';

// ── AuthScreen ────────────────────────────────────────────────────────────────
// Shown when no student JWT is present.
// Props:
//   backend    — API base URL
//   onAuth(token, name, email) — called on successful login or register

export default function AuthScreen({ backend, onAuth }) {
  const [mode, setMode] = useState('login');   // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setError('');

    if (mode === 'register') {
      if (!form.name.trim())            return setError('Please enter your full name');
      if (!form.email.trim())           return setError('Please enter your SAU email');
      if (form.password.length < 6)     return setError('Password must be at least 6 characters');
      if (form.password !== form.confirm) return setError('Passwords do not match');
    } else {
      if (!form.email.trim())  return setError('Please enter your email');
      if (!form.password)      return setError('Please enter your password');
    }

    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body = mode === 'register'
        ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
        : { email: form.email.trim(), password: form.password };

      const res = await fetch(`${backend}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
      } else {
        // Persist token so it survives page refresh
        localStorage.setItem('cm_student_token', data.token);
        localStorage.setItem('cm_student_name', data.name);
        localStorage.setItem('cm_student_email', data.email);
        onAuth(data.token, data.name, data.email);
      }
    } catch {
      setError('Could not connect to server');
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: '60px auto', padding: '0 20px' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 24, padding: '36px 28px',
        animation: 'float-up 0.5s ease both',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>🛺</div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24,
            color: 'var(--text)', letterSpacing: '-0.5px', marginBottom: 4,
          }}>CampusMove</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {mode === 'login' ? 'Sign in to your student account' : 'Create your student account'}
          </p>
        </div>

        {/* Tab toggle */}
        <div style={{
          display: 'flex', background: 'var(--bg3)',
          borderRadius: 10, padding: 4, marginBottom: 24,
          border: '1px solid var(--border)',
        }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setForm({ name:'', email:'', password:'', confirm:'' }); }} style={{
              flex: 1, padding: '8px', borderRadius: 7, border: 'none',
              background: mode === m ? 'var(--surface2)' : 'transparent',
              color: mode === m ? 'var(--text)' : 'var(--text-faint)',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
            }}>
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {mode === 'register' && (
            <Field label="FULL NAME" type="text" placeholder="e.g. Shubham Verma"
              value={form.name} onChange={v => set('name', v)} />
          )}

          <Field label="SAU EMAIL" type="email" placeholder="yourname@students.sau.ac.in"
            value={form.email} onChange={v => set('email', v)} />

          <Field label="PASSWORD" type="password"
            placeholder={mode === 'register' ? 'Min. 6 characters' : 'Enter password'}
            value={form.password} onChange={v => set('password', v)}
            onEnter={mode === 'login' ? handleSubmit : undefined}
          />

          {mode === 'register' && (
            <Field label="CONFIRM PASSWORD" type="password" placeholder="Re-enter password"
              value={form.confirm} onChange={v => set('confirm', v)}
              onEnter={handleSubmit}
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 10,
            background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)',
            fontSize: 13, color: 'var(--red)',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', marginTop: 20, padding: '14px', borderRadius: 12, border: 'none',
          background: loading ? 'var(--surface2)' : 'var(--amber)',
          color: loading ? 'var(--text-faint)' : '#0a0a0f',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
          cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.3px',
          boxShadow: loading ? 'none' : '0 4px 20px rgba(245,166,35,0.3)',
          transition: 'all 0.2s',
        }}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
        </button>

        {/* SAU domain note */}
        <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.6 }}>
          Only SAU email addresses are accepted<br />
          <span style={{ color: 'rgba(245,166,35,0.6)' }}>@students.sau.ac.in · @sau.ac.in</span>
        </p>
      </div>
    </div>
  );
}

// ── Reusable field ────────────────────────────────────────────────────────────
function Field({ label, type, placeholder, value, onChange, onEnter }) {
  return (
    <div>
      <label style={{
        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        letterSpacing: '1px', color: 'var(--text-faint)', display: 'block', marginBottom: 6,
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        style={{
          width: '100%', padding: '12px 14px', background: 'var(--bg3)',
          border: '1px solid var(--border)', borderRadius: 10,
          color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)',
          outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(245,166,35,0.5)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  );
}
