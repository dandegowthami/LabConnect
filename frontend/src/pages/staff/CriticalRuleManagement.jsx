import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import staffWorkspaceService from '../../services/staffWorkspaceService.js';

export default function CriticalRuleManagement() {
  const { user, logout } = useAuth();
  const [rules, setRules] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({ parameterName: '', unit: '', criticalLow: '', criticalHigh: '' });
  const [doctorForm, setDoctorForm] = useState({ doctorId: '', email: '', password: '' });
  const [pathologistForm, setPathologistForm] = useState({ name: '', email: '', password: '' });
  const [approvalNotes, setApprovalNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [ruleResponse, doctorResponse] = await Promise.all([
        staffWorkspaceService.getCriticalRules(),
        staffWorkspaceService.getDoctors()
      ]);
      setRules(ruleResponse.data.data.rules);
      setDoctors(doctorResponse.data.data.doctors);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Configuration data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function propose(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        parameterName: form.parameterName.trim(),
        unit: form.unit.trim(),
        ...(form.criticalLow !== '' ? { criticalLow: Number(form.criticalLow) } : {}),
        ...(form.criticalHigh !== '' ? { criticalHigh: Number(form.criticalHigh) } : {})
      };
      const response = await staffWorkspaceService.proposeCriticalRule(payload);
      setNotice(response.data.message);
      setForm({ parameterName: '', unit: '', criticalLow: '', criticalHigh: '' });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Critical threshold could not be proposed.');
    } finally {
      setBusy(false);
    }
  }

  async function approve(rule) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await staffWorkspaceService.approveCriticalRule(rule._id, approvalNotes[rule._id] || '');
      setNotice(response.data.message);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The rule could not be approved.');
    } finally {
      setBusy(false);
    }
  }

  async function provisionDoctor(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await staffWorkspaceService.provisionDoctorAccount(doctorForm);
      setNotice(response.data.message);
      setDoctorForm({ doctorId: '', email: '', password: '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Doctor account could not be provisioned.');
    } finally {
      setBusy(false);
    }
  }

  async function provisionPathologist(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await staffWorkspaceService.provisionPathologistAccount(pathologistForm);
      setNotice(response.data.message);
      setPathologistForm({ name: '', email: '', password: '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Pathologist account could not be provisioned.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="import-page">
      <header className="import-header"><Link className="site-brand" to="/staff"><span className="site-brand-mark">L</span>LabConnect</Link><div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div></header>
      <div className="import-content">
        <Link className="back-link import-back-link" to="/staff"><ArrowLeft size={17} /> Staff dashboard</Link>
        <div className="import-page-title"><p className="eyebrow">STAFF AND PATHOLOGIST CONTROLS</p><h1>Critical thresholds and doctor access</h1><p>No medical critical thresholds are preloaded. A proposed threshold is inactive until a pathologist approves it with a review note.</p></div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {(user?.role === 'staff' || user?.role === 'admin') && (
          <section className="import-card card">
            <h2>Propose a lab-approved threshold</h2>
            <form onSubmit={propose} className="row g-3">
              <div className="col-md-4"><label className="form-label" htmlFor="rule-parameter">Exact parameter name</label><input id="rule-parameter" className="form-control" value={form.parameterName} maxLength="120" onChange={(event) => setForm((current) => ({ ...current, parameterName: event.target.value }))} required /></div>
              <div className="col-md-2"><label className="form-label" htmlFor="rule-unit">Unit</label><input id="rule-unit" className="form-control" value={form.unit} maxLength="40" onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} required /></div>
              <div className="col-md-3"><label className="form-label" htmlFor="rule-low">Critical low (optional)</label><input id="rule-low" className="form-control" type="number" step="any" value={form.criticalLow} onChange={(event) => setForm((current) => ({ ...current, criticalLow: event.target.value }))} /></div>
              <div className="col-md-3"><label className="form-label" htmlFor="rule-high">Critical high (optional)</label><input id="rule-high" className="form-control" type="number" step="any" value={form.criticalHigh} onChange={(event) => setForm((current) => ({ ...current, criticalHigh: event.target.value }))} /></div>
              <div className="col-12"><p className="portal-disclaimer">Only use thresholds from an approved laboratory policy. Values at or below the low threshold, or at or above the high threshold, trigger review after sign-off. This form does not provide clinical guidance.</p><button className="primary-button btn" disabled={busy} type="submit">{busy ? 'Saving…' : 'Submit for pathologist approval'}</button></div>
            </form>
          </section>
        )}
        <section className="import-card card mt-4">
          <h2>Configured rules</h2>
          {loading ? <p role="status">Loading rules…</p> : rules.length === 0 ? <p>No thresholds are configured. All results are evaluated only against their supplied reference ranges.</p> : (
            <div className="table-responsive"><table className="table"><thead><tr><th>Parameter</th><th>Unit</th><th>Critical low</th><th>Critical high</th><th>Status/approval</th><th>Action</th></tr></thead><tbody>{rules.map((rule) => <tr key={rule._id}><th>{rule.parameterName}</th><td>{rule.unit}</td><td>{rule.criticalLow ?? '—'}</td><td>{rule.criticalHigh ?? '—'}</td><td>{rule.status}{rule.approvedBy && <small className="d-block">Approved by {rule.approvedBy.name} · {rule.approvalNote}</small>}</td><td>{rule.status === 'Pending approval' && user?.role === 'pathologist' ? <div><label className="visually-hidden" htmlFor={`approval-${rule._id}`}>Pathologist approval note</label><input id={`approval-${rule._id}`} className="form-control mb-2" value={approvalNotes[rule._id] || ''} maxLength="1000" onChange={(event) => setApprovalNotes((current) => ({ ...current, [rule._id]: event.target.value }))} placeholder="Approval note" /><button type="button" className="btn btn-primary" disabled={busy || (approvalNotes[rule._id] || '').trim().length < 3} onClick={() => approve(rule)}>Approve threshold</button></div> : '—'}</td></tr>)}</tbody></table></div>
          )}
        </section>
        {(user?.role === 'staff' || user?.role === 'admin') && (
          <section className="import-card card mt-4"><h2>Provision referring doctor account</h2><p>Only existing referring-doctor records can be linked. Public doctor registration is not available.</p>
            {doctors.length === 0 ? <p>No referring-doctor records have been imported.</p> : (
              <form className="row g-3" onSubmit={provisionDoctor}>
                <div className="col-md-4"><label className="form-label" htmlFor="doctor-record">Doctor record</label><select className="form-select" id="doctor-record" value={doctorForm.doctorId} onChange={(event) => setDoctorForm((current) => ({ ...current, doctorId: event.target.value }))} required><option value="">Select doctor</option>{doctors.map((doctor) => <option key={doctor._id} value={doctor._id}>{doctor.name} · {doctor.doctorId}</option>)}</select></div>
                <div className="col-md-3"><label className="form-label" htmlFor="doctor-account-email">Login email</label><input id="doctor-account-email" className="form-control" type="email" autoComplete="off" value={doctorForm.email} onChange={(event) => setDoctorForm((current) => ({ ...current, email: event.target.value }))} required /></div>
                <div className="col-md-3"><label className="form-label" htmlFor="doctor-account-password">Temporary password (12+ characters)</label><input id="doctor-account-password" className="form-control" type="password" autoComplete="new-password" minLength="12" value={doctorForm.password} onChange={(event) => setDoctorForm((current) => ({ ...current, password: event.target.value }))} required /></div>
                <div className="col-md-2 d-flex align-items-end"><button className="btn btn-outline-primary" type="submit" disabled={busy}>Provision doctor</button></div>
              </form>
            )}
          </section>
        )}
        {user?.role === 'admin' && <section className="import-card card mt-4"><h2>Provision pathologist account</h2><form className="row g-3" onSubmit={provisionPathologist}><div className="col-md-3"><label className="form-label" htmlFor="path-name">Name</label><input className="form-control" id="path-name" value={pathologistForm.name} onChange={(event) => setPathologistForm((current) => ({ ...current, name: event.target.value }))} required /></div><div className="col-md-3"><label className="form-label" htmlFor="path-email">Work email</label><input className="form-control" id="path-email" type="email" value={pathologistForm.email} onChange={(event) => setPathologistForm((current) => ({ ...current, email: event.target.value }))} required /></div><div className="col-md-4"><label className="form-label" htmlFor="path-password">Password (12+ characters)</label><input className="form-control" id="path-password" type="password" minLength="12" autoComplete="new-password" value={pathologistForm.password} onChange={(event) => setPathologistForm((current) => ({ ...current, password: event.target.value }))} required /></div><div className="col-md-2 d-flex align-items-end"><button className="btn btn-outline-primary" disabled={busy} type="submit">Provision pathologist</button></div></form></section>}
      </div>
    </main>
  );
}
