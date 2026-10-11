import { useEffect, useRef } from 'react';
import { ExternalLink, GitBranch } from 'lucide-react';
import ErrorNotice from './ErrorNotice';
import { safeGithubUrl, timeAgo, formatDateTime } from '../../utils/github';

const ACTIONS = {
    open: [['acknowledge', 'Acknowledge'], ['resolve', 'Resolve']],
    acknowledged: [['resolve', 'Resolve']],
    investigating: [['resolve', 'Resolve']],
    resolved: [['reopen', 'Reopen']]
};

/** CI/CD incidents, separate from production service-health incidents. */
export default function CiIncidentsPanel({ state, highlightId, actionId, onAction, onRetry }) {
    const highlightRef = useRef(null);
    useEffect(() => {
        if (highlightId && highlightRef.current) highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [highlightId, state.data]);

    if (state.loading && !state.data) {
        return <div className="gh-skeleton-list" aria-busy="true" aria-label="Loading incidents">{[0, 1].map((i) => <div key={i} className="gh-skeleton" />)}</div>;
    }
    if (state.error) return <ErrorNotice error={state.error} onRetry={onRetry} />;
    if (!state.data) return null;

    if (state.data.length === 0) {
        return (
            <div className="gh-empty">
                <h3>No CI/CD incidents</h3>
                <p>Use “Create incident” on a failed workflow run. CI/CD incidents are tracked here, separately from production service-health incidents.</p>
            </div>
        );
    }

    return (
        <ul className="gh-list">
            {state.data.map((inc) => {
                const ctx = inc.githubContext || {};
                const runUrl = safeGithubUrl(ctx.runUrl);
                const busy = actionId === inc._id;
                return (
                    <li
                        key={inc._id}
                        ref={inc._id === highlightId ? highlightRef : null}
                        className={`gh-incident${inc._id === highlightId ? ' is-highlighted' : ''}`}
                    >
                        <div className="gh-incident__main">
                            <div className="gh-run__title">{inc.title}</div>
                            <div className="gh-run__meta">
                                <span className={`gh-badge gh-badge--${inc.status === 'resolved' ? 'success' : inc.status === 'open' ? 'danger' : 'warning'}`}>{inc.status}</span>
                                <span className="gh-pill">{inc.severity}</span>
                                {ctx.branch && <span className="gh-pill"><GitBranch size={12} aria-hidden="true" /> {ctx.branch}</span>}
                                {ctx.runNumber && <span>Run #{ctx.runNumber}</span>}
                                <time dateTime={inc.createdAt} title={formatDateTime(inc.createdAt)}>· raised {timeAgo(inc.createdAt)}</time>
                            </div>
                        </div>
                        <div className="gh-run__actions">
                            {runUrl && (
                                <a className="gh-link" href={runUrl} target="_blank" rel="noopener noreferrer">
                                    View run <ExternalLink size={12} aria-hidden="true" />
                                </a>
                            )}
                            {(ACTIONS[inc.status] || []).map(([action, label]) => (
                                <button key={action} type="button" className="gh-btn gh-btn--sm" disabled={busy} onClick={() => onAction(inc._id, action)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}