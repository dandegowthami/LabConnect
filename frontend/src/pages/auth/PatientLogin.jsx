import { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api.js';

const mobilePattern = /^[6-9]\d{9}$/;

export default function PatientLogin() {
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedMobile = mobile.trim();
    if (!mobilePattern.test(normalizedMobile)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await api.post('/auth/patient/request-otp', { mobile: normalizedMobile });
      navigate('/patient/otp', { state: { mobile: normalizedMobile } });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'We could not send a code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page container-fluid d-flex align-items-center justify-content-center">
      <section className="auth-card card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">L</div>
        <p className="eyebrow">PATIENT PORTAL</p>
        <h1 id="login-title">Your health records, connected.</h1>
        <p className="intro">Enter the mobile number registered with your diagnostic centre. We’ll send you a one-time code.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label className="form-label" htmlFor="mobile">Mobile number</label>
          <div className="phone-input input-group">
            <span className="input-group-text" aria-hidden="true">+91</span>
            <input
              className="form-control"
              id="mobile"
              name="mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              placeholder="10-digit mobile number"
              value={mobile}
              onChange={(event) => setMobile(event.target.value.replace(/\D/g, ''))}
              aria-describedby={error ? 'mobile-error' : undefined}
              aria-invalid={Boolean(error)}
            />
          </div>
          {error && <p className="form-error" id="mobile-error" role="alert">{error}</p>}
          <button className="primary-button btn btn-primary w-100" type="submit" disabled={loading}>
            {loading ? 'Sending code…' : 'Continue'} {!loading && <ArrowRight size={18} aria-hidden="true" />}
          </button>
        </form>
        <div className="privacy-note"><ShieldCheck size={18} aria-hidden="true" /><span>Your sign-in is protected. We never share your details.</span></div>
        <p className="staff-link">New to LabConnect? <Link to="/register">Registration information</Link></p>
        <p className="staff-link">Are you a staff member? <Link to="/staff/login">Staff sign in</Link></p>
      </section>
    </main>
  );
}
