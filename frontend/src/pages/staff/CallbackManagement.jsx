import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, LogOut, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import staffWorkspaceService from '../../services/staffWorkspaceService.js';

export default function CallbackManagement() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskResponse, userResponse] = await Promise.all([
        staffWorkspaceService.getCallbackTasks({ page: 1, limit: 50 }),
        staffWorkspaceService.getUsers()
      ]);
      setTasks(taskResponse.data.data.tasks);
      setUsers(userResponse.data.data.users);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Review tasks could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateDraft(task, key, value) {
    setDrafts((current) => ({
      ...current,
      [task.id]: { ...current[task.id], [key]: value }
    }));
  }

  async function save(task) {
    const draft = drafts[task.id] || {};
    const data = {};
    if (draft.status) data.status = draft.status;
    if (draft.assignedTo !== undefined) data.assignedTo = draft.assignedTo || null;
    if (draft.resolutionNotes !== undefined) data.resolutionNotes = draft.resolutionNotes;
    setBusyId(task.id);
    setError('');
    setNotice('');
    try {
      await staffWorkspaceService.updateCallbackTask(task.id, data);
      setNotice('Review task updated.');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The review task could not be updated.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <main className="import-page">
      <header className="import-header"><Link className="site-brand" to="/staff"><span className="site-brand-mark">L</span>LabConnect</Link><div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div></header>
      <div className="import-content">
        <Link className="back-link import-back-link" to="/staff"><ArrowLeft size={17} /> Staff dashboard</Link>
        <div className="delivery-history-heading"><div className="import-page-title"><p className="eyebrow">STAFF AND PATHOLOGIST REVIEW</p><h1>Callbacks and flagged explanations</h1><p>Original laboratory values are read-only. Resolve a critical callback only after recording the review notes.</p></div><button className="portal-refresh" type="button" aria-label="Refresh review tasks" onClick={load}><RefreshCw size={18} /></button></div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {loading ? <p role="status">Loading review tasks…</p> : tasks.length === 0 ? <div className="portal-empty"><h2>No open review tasks</h2><p>Critical results and patient feedback appear here.</p></div> : (
          <div className="callback-task-list">{tasks.map((task) => {
            const draft = drafts[task.id] || {};
            return (
              <article className="import-card card callback-task" key={task.id}>
                <div className="callback-task-heading"><div><p className="eyebrow">{task.severity}</p><h2>{task.parameterName}</h2></div><span className={`portal-status ${task.status.toLowerCase().replace(' ', '-')}`}>{task.status}</span></div>
                <dl className="report-meta">
                  <div><dt>Report</dt><dd><Link to={`/staff/report/${encodeURIComponent(task.reportId)}`}>{task.reportId}</Link></dd></div>
                  <div><dt>Patient</dt><dd>{task.patient?.name} · {task.patient?.mobileMasked}</dd></div>
                  <div><dt>Created</dt><dd>{new Date(task.createdAt).toLocaleString()}</dd></div>
                  <div><dt>Resolved</dt><dd>{task.resolvedAt ? new Date(task.resolvedAt).toLocaleString() : 'Not resolved'}</dd></div>
                  {task.flagReason && <div><dt>Patient feedback ({task.flaggedLanguage})</dt><dd>{task.flagReason}</dd></div>}
                </dl>
                <div className="row g-3">
                  <div className="col-md-4"><label className="form-label" htmlFor={`assignee-${task.id}`}>Assigned staff/pathologist</label><select id={`assignee-${task.id}`} className="form-select" value={draft.assignedTo ?? task.assignedTo?.id ?? ''} onChange={(event) => updateDraft(task, 'assignedTo', event.target.value)}><option value="">Unassigned</option>{users.map((person) => <option value={person.id} key={person.id}>{person.name} ({person.role})</option>)}</select></div>
                  <div className="col-md-4"><label className="form-label" htmlFor={`status-${task.id}`}>Task status</label><select id={`status-${task.id}`} className="form-select" value={draft.status ?? task.status} onChange={(event) => updateDraft(task, 'status', event.target.value)}><option>Pending</option><option>In Progress</option><option>Resolved</option></select></div>
                  <div className="col-12"><label className="form-label" htmlFor={`notes-${task.id}`}>Resolution/review notes</label><textarea id={`notes-${task.id}`} className="form-control" rows="2" maxLength="2000" value={draft.resolutionNotes ?? task.resolutionNotes ?? ''} onChange={(event) => updateDraft(task, 'resolutionNotes', event.target.value)} /></div>
                </div>
                <button className="primary-button btn mt-3" type="button" disabled={busyId === task.id} onClick={() => save(task)}>{busyId === task.id ? 'Saving…' : 'Save review'}</button>
              </article>
            );
          })}</div>
        )}
      </div>
    </main>
  );
}
