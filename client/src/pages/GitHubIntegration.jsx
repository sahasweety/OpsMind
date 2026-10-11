import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LoaderCircle, Info, X, ShieldCheck, Gauge } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import api from '../api/client';
import RepoHeader from '../components/github/RepoHeader';
import WorkflowRunsPanel from '../components/github/WorkflowRunsPanel';
import CommitsPanel from '../components/github/CommitsPanel';
import CiIncidentsPanel from '../components/github/CiIncidentsPanel';
import ErrorNotice from '../components/github/ErrorNotice';
import { parseRepoInput, toApiError, isCanceled, formatDateTime } from '../utils/github';
import '../styles/github.css';

const ORG_KEY = 'opsmind.github.orgId';
const EMPTY = { loading: false, error: null, data: null };

const Skeletons = ({ count = 4, label }) => (
    <div className="gh-skeleton-list" aria-busy="true" aria-label={label}>
        {Array.from({ length: count }, (_, i) => <div key={i} className="gh-skeleton" />)}
    </div>
);

export default function GitHubIntegration() {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();

    // Organizations
    const [orgs, setOrgs] = useState([]);
    const [orgsState, setOrgsState] = useState({ loading: true, error: null });
    const [orgId, setOrgId] = useState(() => localStorage.getItem(ORG_KEY) || '');
    const [tokenConfigured, setTokenConfigured] = useState(null);

    // Connected repositories
    const [repos, setRepos] = useState([]);
    const [reposState, setReposState] = useState({ loading: false, error: null });
    const [repoId, setRepoId] = useState(null);

    // Connect form
    const [input, setInput] = useState('');
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState(null);

    // Data for the selected repository
    const [meta, setMeta] = useState(EMPTY);
    const [runs, setRuns] = useState(EMPTY);       // data: { runs, totalCount }
    const [commits, setCommits] = useState(EMPTY); // data: commit[]
    const [incidents, setIncidents] = useState(EMPTY);
    const [rateLimit, setRateLimit] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    // UI state
    const [tab, setTab] = useState('runs');
    const [filter, setFilter] = useState('all');
    const [notice, setNotice] = useState(null);
    const [creatingRunId, setCreatingRunId] = useState(null);
    const [incidentActionId, setIncidentActionId] = useState(null);
    const [highlightIncidentId, setHighlightIncidentId] = useState(null);
    const [disconnecting, setDisconnecting] = useState(false);

    const abortRef = useRef(null);

    const org = orgs.find((o) => o._id === orgId) || null;
    const record = repos.find((r) => r._id === repoId) || null;

    const membership = org?.members?.find((m) => {
        const memberId = (m.user?._id ?? m.user)?.toString();
        return memberId && user?._id && memberId === user._id.toString();
    });
    const canManage = membership?.role === 'owner' || membership?.role === 'admin';

    const handleAuthError = useCallback((err) => {
        if (err?.response?.status === 401) {
            logout();
            navigate('/login');
            return true;
        }
        return false;
    }, [logout, navigate]);

    // ─── Organizations ─────────────────────────────────────────────────────────
    const loadOrgs = useCallback(async () => {
        setOrgsState({ loading: true, error: null });
        try {
            const res = await api.get('/organizations');
            const list = res.data.organizations || [];
            setOrgs(list);
            setOrgId((current) => (list.some((o) => o._id === current) ? current : list[0]?._id || ''));
            setOrgsState({ loading: false, error: null });
        } catch (err) {
            if (handleAuthError(err)) return;
            setOrgsState({ loading: false, error: toApiError(err) });
        }
    }, [handleAuthError]);

    useEffect(() => {
        loadOrgs();
        api.get('/github/status')
            .then((res) => setTokenConfigured(res.data.tokenConfigured))
            .catch(() => { });
    }, [loadOrgs]);

    // ─── Connected repositories ────────────────────────────────────────────────
    useEffect(() => {
        if (!orgId) { setRepos([]); setRepoId(null); return undefined; }
        localStorage.setItem(ORG_KEY, orgId);

        const controller = new AbortController();
        setReposState({ loading: true, error: null });
        setRepos([]);
        setRepoId(null);
        api.get(`/github/repos?organizationId=${orgId}`, { signal: controller.signal })
            .then((res) => {
                setRepos(res.data.repos);
                setRepoId(res.data.repos[0]?._id || null);
                setReposState({ loading: false, error: null });
            })
            .catch((err) => {
                if (isCanceled(err) || handleAuthError(err)) return;
                setReposState({ loading: false, error: toApiError(err) });
            });
        return () => controller.abort();
    }, [orgId, handleAuthError]);

    // ─── Data for the selected repository ──────────────────────────────────────
    const loadIncidents = useCallback(async (rec, signal) => {
        setIncidents((s) => ({ ...s, loading: true, error: null }));
        try {
            const res = await api.get(`/incidents?organizationId=${rec.organization}&source=github_actions&limit=100`, { signal });
            const mine = res.data.incidents.filter((i) =>
                i.githubContext?.owner?.toLowerCase() === rec.owner.toLowerCase() &&
                i.githubContext?.repo?.toLowerCase() === rec.repo.toLowerCase());
            setIncidents({ loading: false, error: null, data: mine });
        } catch (err) {
            if (isCanceled(err) || handleAuthError(err)) return;
            setIncidents((s) => ({ ...s, loading: false, error: toApiError(err) }));
        }
    }, [handleAuthError]);

    const loadCommits = useCallback(async (id, signal) => {
        setCommits((s) => ({ ...s, loading: true, error: null }));
        try {
            const res = await api.get(`/github/repos/${id}/commits?perPage=30`, { signal });
            if (res.data.rateLimit) setRateLimit(res.data.rateLimit);
            setCommits({ loading: false, error: null, data: res.data.commits });
        } catch (err) {
            if (isCanceled(err) || handleAuthError(err)) return;
            setCommits((s) => ({ ...s, loading: false, error: toApiError(err) }));
        }
    }, [handleAuthError]);

    const loadRepo = useCallback(async (rec, { withCommits = false } = {}) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const { signal } = controller;

        setMeta((s) => ({ ...s, loading: true, error: null }));
        setRuns((s) => ({ ...s, loading: true, error: null }));

        const fail = (setter) => (err) => {
            if (isCanceled(err) || handleAuthError(err)) return;
            setter((s) => ({ ...s, loading: false, error: toApiError(err) }));
        };

        const tasks = [
            api.get(`/github/repos/${rec._id}`, { signal })
                .then((res) => {
                    if (res.data.rateLimit) setRateLimit(res.data.rateLimit);
                    setMeta({ loading: false, error: null, data: res.data.meta });
                })
                .catch(fail(setMeta)),
            api.get(`/github/repos/${rec._id}/workflows?perPage=30`, { signal })
                .then((res) => {
                    if (res.data.rateLimit) setRateLimit(res.data.rateLimit);
                    setRuns({ loading: false, error: null, data: { runs: res.data.runs, totalCount: res.data.totalCount } });
                })
                .catch(fail(setRuns)),
            loadIncidents(rec, signal)
        ];
        if (withCommits) tasks.push(loadCommits(rec._id, signal));

        await Promise.allSettled(tasks);
        if (!signal.aborted) setLastUpdated(new Date());
    }, [handleAuthError, loadIncidents, loadCommits]);

    // Switching repository: reset view state and load fresh data.
    useEffect(() => {
        setMeta(EMPTY); setRuns(EMPTY); setCommits(EMPTY); setIncidents(EMPTY);
        setLastUpdated(null); setTab('runs'); setFilter('all'); setHighlightIncidentId(null);
        abortRef.current?.abort();
        if (!record) return undefined;
        loadRepo(record);
        return () => abortRef.current?.abort();
        // Re-run only when the selected repository changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repoId]);

    // Commits load lazily when their tab is first opened (saves GitHub API quota).
    useEffect(() => {
        if (tab === 'commits' && record && commits.data === null && !commits.loading && !commits.error) {
            loadCommits(record._id, abortRef.current?.signal);
        }
    }, [tab, record, commits.data, commits.loading, commits.error, loadCommits]);

    // ─── Actions ───────────────────────────────────────────────────────────────
    const handleConnect = async (e) => {
        e.preventDefault();
        setConnectError(null);
        setNotice(null);
        const parsed = parseRepoInput(input);
        if (parsed.error) { setConnectError({ message: parsed.error }); return; }

        setConnecting(true);
        try {
            const res = await api.post('/github/repos', { organizationId: orgId, owner: parsed.owner, repo: parsed.repo });
            const saved = res.data.githubRepo;
            setInput('');
            setRepos((prev) => [saved, ...prev]);
            setRepoId(saved._id);
            setNotice({ type: 'success', text: `Connected ${saved.owner}/${saved.repo}.` });
        } catch (err) {
            if (handleAuthError(err)) return;
            setConnectError(toApiError(err));
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!record) return;
        setDisconnecting(true);
        try {
            await api.delete(`/github/repos/${record._id}`);
            const remaining = repos.filter((r) => r._id !== record._id);
            setRepos(remaining);
            setRepoId(remaining[0]?._id || null);
            setNotice({ type: 'info', text: `Disconnected ${record.owner}/${record.repo}. Existing incidents were kept.` });
        } catch (err) {
            if (handleAuthError(err)) return;
            setNotice({ type: 'error', text: toApiError(err).message });
        } finally {
            setDisconnecting(false);
        }
    };

    const handleRefresh = () => {
        if (!record) return;
        setNotice(null);
        loadRepo(record, { withCommits: commits.data !== null || tab === 'commits' });
    };

    const markRunIncident = (runId, incident) =>
        setRuns((s) => ({
            ...s,
            data: { ...s.data, runs: s.data.runs.map((r) => (r.id === runId ? { ...r, incident } : r)) }
        }));

    const handleCreateIncident = async (run) => {
        setCreatingRunId(run.id);
        setNotice(null);
        try {
            const res = await api.post(`/github/repos/${record._id}/create-incident`, { runId: run.id });
            const inc = res.data.incident;
            markRunIncident(run.id, { id: inc._id, status: inc.status });
            setHighlightIncidentId(inc._id);
            setNotice({ type: 'success', text: `Incident created for ${run.workflowName} #${run.runNumber}.`, incidentId: inc._id });
            loadIncidents(record);
        } catch (err) {
            if (handleAuthError(err)) return;
            const e = toApiError(err);
            if (e.status === 409 && e.data?.incidentId) {
                markRunIncident(run.id, { id: e.data.incidentId, status: 'open' });
                setNotice({ type: 'info', text: 'An incident already exists for this run.', incidentId: e.data.incidentId });
                loadIncidents(record);
            } else {
                setNotice({ type: 'error', text: e.message });
            }
        } finally {
            setCreatingRunId(null);
        }
    };

    const viewIncident = (id) => {
        setHighlightIncidentId(id);
        setTab('incidents');
    };

    const handleIncidentAction = async (id, action) => {
        setIncidentActionId(id);
        try {
            await api.post(`/incidents/${id}/${action}`);
            await loadIncidents(record);
        } catch (err) {
            if (handleAuthError(err)) return;
            setNotice({ type: 'error', text: toApiError(err).message });
        } finally {
            setIncidentActionId(null);
        }
    };

    // ─── Render ────────────────────────────────────────────────────────────────
    const refreshing = meta.loading || runs.loading || (commits.loading && commits.data !== null);
    const failedRunCount = runs.data ? runs.data.runs.filter((r) => r.canCreateIncident).length : 0;

    const tabs = [
        { key: 'runs', label: 'Workflow runs', count: runs.data?.runs.length },
        { key: 'commits', label: 'Commits', count: commits.data?.length },
        { key: 'incidents', label: 'CI/CD incidents', count: incidents.data?.length }
    ];

    return (
        <div className="gh-page">
            <div className="gh-container">
                <header className="gh-topbar">
                    <div>
                        <h1>GitHub CI/CD</h1>
                        <p className="gh-muted">Monitor repository activity and GitHub Actions workflow runs.</p>
                    </div>
                    <nav className="gh-topbar__nav" aria-label="Primary">
                        <button type="button" className="gh-btn gh-btn--sm" onClick={() => navigate('/')}>Dashboard</button>
                        <button type="button" className="gh-btn gh-btn--sm" onClick={() => navigate('/organizations')}>Organizations</button>
                        <button type="button" className="gh-btn gh-btn--sm" onClick={() => { logout(); navigate('/login'); }}>Logout</button>
                    </nav>
                </header>

                {orgsState.loading && <Skeletons count={3} label="Loading organizations" />}
                {orgsState.error && <ErrorNotice error={orgsState.error} onRetry={loadOrgs} />}

                {!orgsState.loading && !orgsState.error && orgs.length === 0 && (
                    <div className="gh-empty gh-card">
                        <h3>No organizations yet</h3>
                        <p>GitHub repositories are connected to an organization. Create one first.</p>
                        <button type="button" className="gh-btn gh-btn--primary" onClick={() => navigate('/organizations')}>Go to Organizations</button>
                    </div>
                )}

                {orgs.length > 0 && (
                    <>
                        <section className="gh-toolbar" aria-label="Organization and GitHub access">
                            <label className="gh-field">
                                <span>Organization</span>
                                <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                                    {orgs.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
                                </select>
                            </label>
                            <div className="gh-toolbar__pills">
                                {tokenConfigured !== null && (
                                    <span className={`gh-pill ${tokenConfigured ? 'gh-pill--ok' : ''}`} title={tokenConfigured
                                        ? 'The server uses a read-only GitHub token (never sent to your browser).'
                                        : 'No GITHUB_TOKEN is set on the server: public repositories only, limited to 60 GitHub API requests per hour.'}>
                                        <ShieldCheck size={12} aria-hidden="true" />
                                        {tokenConfigured ? 'GitHub token configured' : 'Anonymous access · public repos'}
                                    </span>
                                )}
                                {rateLimit && rateLimit.remaining !== null && (
                                    <span className={`gh-pill ${rateLimit.remaining < 10 ? 'gh-pill--warn' : ''}`}
                                        title={rateLimit.resetAt ? `Resets ${formatDateTime(rateLimit.resetAt)}` : undefined}>
                                        <Gauge size={12} aria-hidden="true" />
                                        GitHub API: {rateLimit.remaining}/{rateLimit.limit} left
                                    </span>
                                )}
                            </div>
                        </section>

                        {notice && (
                            <div className={`gh-notice gh-notice--${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
                                <span>
                                    {notice.text}
                                    {notice.incidentId && (
                                        <> <button type="button" className="gh-linkbtn" onClick={() => viewIncident(notice.incidentId)}>View incident</button></>
                                    )}
                                </span>
                                <button type="button" className="gh-iconbtn" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={14} aria-hidden="true" /></button>
                            </div>
                        )}

                        <section className="gh-card gh-connect">
                            <h2>Connect a repository</h2>
                            {canManage ? (
                                <form onSubmit={handleConnect} noValidate>
                                    <div className="gh-connect__row">
                                        <input
                                            type="text"
                                            value={input}
                                            onChange={(e) => { setInput(e.target.value); setConnectError(null); }}
                                            placeholder="owner/repository or https://github.com/owner/repository"
                                            aria-label="GitHub repository"
                                            aria-invalid={Boolean(connectError)}
                                            autoComplete="off"
                                            spellCheck="false"
                                            disabled={connecting}
                                        />
                                        <button type="submit" className="gh-btn gh-btn--primary" disabled={connecting || !input.trim()}>
                                            {connecting
                                                ? <><LoaderCircle size={14} className="gh-spin" aria-hidden="true" /> Connecting…</>
                                                : <><Plus size={14} aria-hidden="true" /> Connect</>}
                                        </button>
                                    </div>
                                    {connectError && <ErrorNotice error={connectError} />}
                                    <p className="gh-hint"><Info size={12} aria-hidden="true" /> Public repositories work without a token. Try <button type="button" className="gh-linkbtn" onClick={() => setInput('actions/checkout')}>actions/checkout</button>.</p>
                                </form>
                            ) : (
                                <p className="gh-muted">Only organization owners and admins can connect or disconnect repositories. You can view connected repositories below.</p>
                            )}
                        </section>

                        {reposState.loading && <Skeletons count={2} label="Loading repositories" />}
                        {reposState.error && <ErrorNotice error={reposState.error} onRetry={() => setOrgId((id) => `${id}`)} />}

                        {!reposState.loading && !reposState.error && repos.length === 0 && (
                            <div className="gh-empty gh-card">
                                <h3>No repositories connected</h3>
                                <p>{canManage
                                    ? 'Connect a repository above to see its commits and GitHub Actions workflow runs.'
                                    : 'Ask an organization owner or admin to connect a repository.'}</p>
                            </div>
                        )}

                        {repos.length > 0 && (
                            <div className="gh-repos" role="tablist" aria-label="Connected repositories">
                                {repos.map((r) => (
                                    <button
                                        key={r._id}
                                        type="button"
                                        role="tab"
                                        aria-selected={r._id === repoId}
                                        className={`gh-repochip${r._id === repoId ? ' is-active' : ''}`}
                                        onClick={() => setRepoId(r._id)}
                                    >
                                        {r.owner}/{r.repo}
                                    </button>
                                ))}
                            </div>
                        )}

                        {record && (
                            <>
                                {meta.error && (
                                    <ErrorNotice error={meta.error} onRetry={handleRefresh} retrying={refreshing}>
                                        {meta.error.code === 'NOT_FOUND' && canManage && (
                                            <p className="gh-muted">If this repository was deleted or made private, you can disconnect it below.</p>
                                        )}
                                    </ErrorNotice>
                                )}

                                <RepoHeader
                                    record={record}
                                    meta={meta.data}
                                    metaLoading={meta.loading}
                                    canManage={canManage}
                                    refreshing={refreshing}
                                    lastUpdated={lastUpdated}
                                    onRefresh={handleRefresh}
                                    onDisconnect={handleDisconnect}
                                    disconnecting={disconnecting}
                                />

                                <div className="gh-tabs" role="tablist" aria-label="Repository views">
                                    {tabs.map((t) => (
                                        <button
                                            key={t.key}
                                            type="button"
                                            role="tab"
                                            id={`gh-tab-${t.key}`}
                                            aria-selected={tab === t.key}
                                            aria-controls={`gh-panel-${t.key}`}
                                            className={`gh-tab${tab === t.key ? ' is-active' : ''}`}
                                            onClick={() => setTab(t.key)}
                                        >
                                            {t.label}
                                            {t.count !== undefined && <span className="gh-chip__count">{t.count}</span>}
                                        </button>
                                    ))}
                                </div>

                                <div role="tabpanel" id={`gh-panel-${tab}`} aria-labelledby={`gh-tab-${tab}`} className="gh-card gh-panel">
                                    {tab === 'runs' && (
                                        <>
                                            {runs.loading && !runs.data && <Skeletons label="Loading workflow runs" />}
                                            {runs.error && <ErrorNotice error={runs.error} onRetry={handleRefresh} retrying={refreshing} />}
                                            {runs.data && (
                                                <>
                                                    {failedRunCount > 0 && (
                                                        <p className="gh-callout">
                                                            {failedRunCount} failed run{failedRunCount === 1 ? '' : 's'} can be raised as CI/CD incidents. They are tracked separately from production service-health incidents.
                                                        </p>
                                                    )}
                                                    <WorkflowRunsPanel
                                                        runs={runs.data.runs}
                                                        totalCount={runs.data.totalCount}
                                                        filter={filter}
                                                        onFilter={setFilter}
                                                        creatingRunId={creatingRunId}
                                                        onCreateIncident={handleCreateIncident}
                                                        onViewIncident={viewIncident}
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}

                                    {tab === 'commits' && (
                                        <CommitsPanel state={commits} onRetry={() => loadCommits(record._id, abortRef.current?.signal)} />
                                    )}

                                    {tab === 'incidents' && (
                                        <CiIncidentsPanel
                                            state={incidents}
                                            highlightId={highlightIncidentId}
                                            actionId={incidentActionId}
                                            onAction={handleIncidentAction}
                                            onRetry={() => loadIncidents(record)}
                                        />
                                    )}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}