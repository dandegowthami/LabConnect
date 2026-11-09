import { useState } from 'react';
import { Eye, EyeOff, Stethoscope } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import doctorService from '../../services/doctorService.js';

export default function DoctorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setError('Enter your provisioned doctor email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await doctorService.login(email.trim(), password);
      login(response.data.data.token, response.data.data.user);
      navigate('/doctor/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Doctor sign-in is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page container-fluid d-flex align-items-center justify-content-center">
      <section className="auth-card card" aria-labelledby="doctor-login-title">
        <Link className="back-link" to="/">LabConnect home</Link>
        <div className="brand-mark brand-mark-small" aria-hidden="true"><Stethoscope size={21} /></div>
        <p className="eyebrow">REFERRING DOCTOR PORTAL</p>
        <h1 id="doctor-login-title">Doctor sign in</h1>
        <p className="intro">Doctor accounts are provisioned by authorized staff. Public registration is not available.</p>
        <form onSubmit={submit} noValidate>
          <label className="form-label" htmlFor="doctor-email">Work email</label>
          <input className="form-control form-control-lg" id="doctor-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="form-label mt-3" htmlFor="doctor-password">Password</label>
          <div className="input-group">
            <input className="form-control form-control-lg" id="doctor-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" className="btn btn-outline-secondary" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button btn w-100 mt-4" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in securely'}</button>
        </form>
      </section>
    </main>
  );
}
