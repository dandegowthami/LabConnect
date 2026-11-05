import { useAuth } from '../context/AuthContext.jsx';

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  return (
    <main className="dashboard container-fluid d-flex align-items-center justify-content-center">
      <div className="dashboard-card card">
        <div className="brand-mark" aria-hidden="true">L</div>
        <p className="eyebrow">PATIENT PORTAL</p>
        <h1>You’re securely signed in.</h1>
        <p className="intro">Your mobile contact has been verified. Patient identity and report access require separate verification and are not part of this demo.</p>
        {user?.mobile && <p>Verified contact: +91 {user.mobile}</p>}
        <button className="secondary-button btn w-100" onClick={() => logout()}>Sign out</button>
      </div>
    </main>
  );
}
