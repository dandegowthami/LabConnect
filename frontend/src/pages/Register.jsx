import { ArrowLeft, ArrowRight, Building2, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Register() {
  return (
    <main className="public-page registration-page">
      <header className="site-header">
        <Link className="site-brand" to="/" aria-label="LabConnect home">
          <span className="site-brand-mark"><Building2 size={20} aria-hidden="true" /></span>
          <span>LabConnect</span>
        </Link>
        <Link className="header-sign-in" to="/patient/login">Patient sign in</Link>
      </header>

      <section className="registration-content">
        <Link className="public-back-link" to="/"><ArrowLeft size={17} aria-hidden="true" /> Back to home</Link>
        <div className="registration-card">
          <span className="registration-icon"><Building2 size={24} aria-hidden="true" /></span>
          <p className="eyebrow">PATIENT REGISTRATION</p>
          <h1>Get started with LabConnect.</h1>
          <p className="registration-intro">
            Your diagnostic centre needs to create your patient profile before you can sign in.
            This helps make sure your account is linked to the right records.
          </p>
          <div className="registration-steps">
            <div className="registration-step">
              <span><CheckCircle2 size={18} aria-hidden="true" /></span>
              <p><strong>Contact your diagnostic centre</strong><small>Ask their staff to register your patient profile.</small></p>
            </div>
            <div className="registration-step">
              <span><CheckCircle2 size={18} aria-hidden="true" /></span>
              <p><strong>Confirm your mobile number</strong><small>Make sure they add the number you’ll use to sign in.</small></p>
            </div>
            <div className="registration-step">
              <span><CheckCircle2 size={18} aria-hidden="true" /></span>
              <p><strong>Return here to sign in</strong><small>We’ll send a one-time code to your registered number.</small></p>
            </div>
          </div>
          <Link className="public-button registration-button" to="/patient/login">
            Continue to patient sign in <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p className="registration-note">Already registered? Sign in using the mobile number on your patient profile.</p>
        </div>
      </section>
    </main>
  );
}
