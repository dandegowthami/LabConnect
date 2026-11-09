import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';

export default function PatientIdentitySetup() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [password, setPassword] = useState('');
  const [portalConsentAccepted, setPortalConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!patientId.trim() || password.length < 8 || !portalConsentAccepted) {
      setError('Enter your patient ID, an account password of at least eight characters, and accept the privacy notice.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/patient/identify', {
        patientId: patientId.trim(),
        password,
        ...(activationCode.trim() ? { activationCode: activationCode.trim() } : {}),
        portalConsentAccepted: true
      });
      login(response.data.data.token, response.data.data.patient);
      navigate('/patient/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'We could not verify this patient profile. Check your details and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page container-fluid d-flex align-items-center justify-content-center">
      <section className="auth-card card" aria-labelledby="patient-identity-title">
        <Link className="back-link" to="/patient/login">LabConnect home</Link>
        <p className="eyebrow">SECURE PATIENT PROFILE</p>
        <h1 id="patient-identity-title">Link your verified profile</h1>
        <p className="intro">Mobile OTP confirms access to a phone, not which family member owns a record. Enter your patient ID and account password to open only your profile.</p>
        <form onSubmit={submit} noValidate>
          <label className="form-label" htmlFor="identity-patient-id">Patient ID</label>
          <input
            className="form-control form-control-lg"
            id="identity-patient-id"
            autoComplete="username"
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            maxLength={100}
          />
          <label className="form-label mt-3" htmlFor="identity-activation-code">One-time clinic activation code (first-time setup)</label>
          <input
            className="form-control form-control-lg"
            id="identity-activation-code"
            autoComplete="one-time-code"
            value={activationCode}
            onChange={(event) => setActivationCode(event.target.value)}
            maxLength={43}
          />
          <label className="form-label mt-3" htmlFor="identity-password">Create or enter your portal password</label>
          <input
            className="form-control form-control-lg"
            id="identity-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={128}
          />
          <div className="form-check mt-3">
            <input
              className="form-check-input"
              id="portal-privacy-consent"
              type="checkbox"
              checked={portalConsentAccepted}
              onChange={(event) => setPortalConsentAccepted(event.target.checked)}
            />
            <label className="form-check-label" htmlFor="portal-privacy-consent">
              I agree to use the patient portal to access my records. This is separate from consent to share reports with a referring doctor.
            </label>
          </div>
          {error && <p className="form-error mt-3" role="alert">{error}</p>}
          <button className="primary-button btn btn-primary w-100 mt-4" type="submit" disabled={loading}>
            {loading ? 'Verifying your profile…' : 'Verify and open my reports'}
          </button>
        </form>
        <p className="portal-disclaimer mt-3">For first-time setup, ask laboratory staff to verify your identity in person and give you an activation code directly. It expires after 24 hours.</p>
        <button className="btn btn-link mt-2" type="button" onClick={() => logout()}>Sign out</button>
      </section>
    </main>
  );
}
