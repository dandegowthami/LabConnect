import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';

function maskMobile(mobile) {
  return `${mobile.slice(0, 2)}******${mobile.slice(-2)}`;
}

export default function PatientOTP() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const mobile = location.state?.mobile;
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  if (!mobile) return <Navigate to="/patient/login" replace />;

  async function handleVerify(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the six-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/auth/patient/verify-otp', { mobile, otp });
      login(response.data.data.token, response.data.data.patient);
      navigate('/patient', { replace: true });
    } catch (verifyError) {
      setError(verifyError.response?.data?.message || 'We could not verify that code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (seconds > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      await api.post('/auth/patient/request-otp', { mobile });
      setSeconds(30);
      setOtp('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'We could not send a new code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="auth-page container-fluid d-flex align-items-center justify-content-center">
      <section className="auth-card card" aria-labelledby="otp-title">
        <Link className="back-link" to="/patient/login" aria-label="Back to mobile sign in"><ArrowLeft size={18} /> Back</Link>
        <p className="eyebrow">VERIFY YOUR NUMBER</p>
        <h1 id="otp-title">Check your messages</h1>
        <p className="intro">Enter the six-digit code sent to <strong>+91 {maskMobile(mobile)}</strong>.</p>
        <form onSubmit={handleVerify} noValidate>
          <label className="form-label" htmlFor="otp">One-time code</label>
          <input
            className="otp-input form-control"
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
            aria-describedby={error ? 'otp-error' : undefined}
            aria-invalid={Boolean(error)}
          />
          {error && <p className="form-error" id="otp-error" role="alert">{error}</p>}
          <button className="primary-button btn btn-primary w-100" type="submit" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify and continue'}
          </button>
        </form>
        <button className="resend-button btn btn-link" type="button" onClick={handleResend} disabled={seconds > 0 || resending}>
          <RefreshCw size={16} aria-hidden="true" />
          {resending ? 'Sending a new code…' : seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
        </button>
      </section>
    </main>
  );
}
