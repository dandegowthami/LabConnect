import { Activity, ArrowRight, Building2, ShieldCheck, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <main className="public-page">
      <header className="site-header">
        <Link className="site-brand" to="/" aria-label="LabConnect home">
          <span className="site-brand-mark"><Activity size={21} aria-hidden="true" /></span>
          <span>LabConnect</span>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link className="header-sign-in" to="/patient/login">Patient sign in</Link>
        </nav>
      </header>

      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">A simpler way to stay connected</p>
          <h1>Your health journey, <span>connected.</span></h1>
          <p className="hero-description">
            A simple, secure way for patients to connect with their diagnostic centre.
            Sign in with your registered mobile number to get started.
          </p>
          <div className="hero-actions">
            <Link className="public-button" to="/patient/login">
              Patient sign in <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="public-text-link" to="/register">New to LabConnect?</Link>
          </div>
          <p className="hero-assurance"><ShieldCheck size={17} aria-hidden="true" /> Your account is protected with a one-time code.</p>
        </div>

        <div className="hero-visual" aria-label="How LabConnect works">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="care-card">
            <div className="care-card-top">
              <span className="care-card-icon"><Activity size={21} aria-hidden="true" /></span>
              <span className="care-card-status"><span /> Easy access</span>
            </div>
            <p className="care-card-label">YOUR PATIENT PORTAL</p>
            <h2>Care that stays connected.</h2>
            <div className="care-card-rule" />
            <div className="care-card-step">
              <span className="step-number">01</span>
              <span><strong>Verify your number</strong><small>Use the mobile number registered with your centre</small></span>
            </div>
            <div className="care-card-step">
              <span className="step-number">02</span>
              <span><strong>Sign in securely</strong><small>Confirm your identity with a one-time code</small></span>
            </div>
            <div className="care-card-footer"><ShieldCheck size={16} aria-hidden="true" /> Private by design</div>
          </div>
          <span className="visual-decoration decoration-top" aria-hidden="true"><span /></span>
          <span className="visual-decoration decoration-bottom" aria-hidden="true"><Building2 size={21} /></span>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">GETTING STARTED</p>
          <h2>Simple from the first step.</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <span className="feature-icon"><Building2 size={20} aria-hidden="true" /></span>
            <h3>Registered with your centre</h3>
            <p>Your diagnostic centre adds your patient profile so your access starts with the right information.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon"><Smartphone size={20} aria-hidden="true" /></span>
            <h3>Sign in with your mobile</h3>
            <p>Use the mobile number linked to your patient profile and verify it with a one-time code.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
            <h3>Access with confidence</h3>
            <p>Your sign-in is protected. Patient identity and access are handled carefully.</p>
          </article>
        </div>
      </section>

      <footer className="site-footer">
        <Link className="site-brand footer-brand" to="/">
          <span className="site-brand-mark"><Activity size={18} aria-hidden="true" /></span>
          <span>LabConnect</span>
        </Link>
        <p>Already registered with a diagnostic centre? <Link to="/patient/login">Sign in with your mobile</Link></p>
      </footer>
    </main>
  );
}
