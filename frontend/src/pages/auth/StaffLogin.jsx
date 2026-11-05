import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';

export default function StaffLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setError('Enter a valid work email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/auth/staff/login', { email: email.trim(), password });
      login(response.data.data.token, response.data.data.user);
      navigate('/staff', { replace: true });
    } catch (loginError) {
      setError(loginError.response?.data?.message || 'We could not sign you in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page container-fluid d-flex align-items-center justify-content-center">
      <section className="auth-card card" aria-labelledby="staff-title">
        <Link className="back-link" to="/patient/login">Patient sign in</Link>
        <div className="brand-mark brand-mark-small" aria-hidden="true"><LockKeyhole size={21} /></div>
        <p className="eyebrow">STAFF PORTAL</p>
        <h1 id="staff-title">Welcome back</h1>
        <p className="intro">Sign in with your LabConnect staff account.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label className="form-label" htmlFor="email">Work email</label>
          <input className="form-control" id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="form-label" htmlFor="password">Password</label>
          <div className="password-input input-group">
            <input className="form-control" id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" className="icon-button btn btn-outline-secondary" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button btn btn-primary w-100" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}
