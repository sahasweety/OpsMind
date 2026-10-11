import { GitBranch, GitCommitHorizontal, ExternalLink, Siren, LoaderCircle } from 'lucide-react';
import RunStatusBadge from './RunStatusBadge';
import {
    RUN_FILTERS, countByFilter, filterRuns, getRunState, isFailedRun,
    safeGithubUrl, timeAgo, formatDateTime, runDuration
} from '../../utils/github';

export default function WorkflowRunsPanel({
    runs, totalCount, filter, onFilter, creatingRunId, onCreateIncident, onViewIncident
}) {
    if (runs.length === 0) {
        return (
            <div className="gh-empty">
                <h3>No workflow runs yet</h3>
                <p>This repository has no GitHub Actions runs, or Actions is disabled for it.</p>
            </div>
        );
    }

    const counts = countByFilter(runs);
    const visible = filterRuns(runs, filter);

    return (
        <div>
            <div className="gh-filters" role="group" aria-label="Filter workflow runs">
                {RUN_FILTERS.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        className={`gh-chip${filter === f.key ? ' is-active' : ''}`}
                        aria-pressed={filter === f.key}
                        onClick={() => onFilter(f.key)}
                    >
                        {f.label} <span className="gh-chip__count">{counts[f.key]}</span>
                    </button>
                ))}
            </div>

            {totalCount > runs.length && (
                <p className="gh-muted gh-note">Showing the {runs.length} most recent of {totalCount} runs.</p>
            )}

            {visible.length === 0 ? (
                <div className="gh-empty">
                    <h3>No runs match this filter</h3>
                    <button type="button" className="gh-btn gh-btn--sm" onClick={() => onFilter('all')}>Show all runs</button>
                </div>
            ) : (
                <ul className="gh-list">
                    {visible.map((run) => {
                        const runUrl = safeGithubUrl(run.htmlUrl);
                        const commitUrl = safeGithubUrl(run.commitUrl);
                        const duration = runDuration(run);
                        const eligible = run.canCreateIncident ?? isFailedRun(run);
                        const state = getRunState(run);
                        return (
                            <li key={run.id} className={`gh-run gh-run--${state.tone}`} data-run-id={run.id}>
                                <div className="gh-run__status"><RunStatusBadge run={run} /></div>

                                <div className="gh-run__main">
                                    <div className="gh-run__title">{run.displayTitle || run.workflowName}</div>
                                    <div className="gh-run__meta">
                                        <span>{run.workflowName} #{run.runNumber}</span>
                                        {run.event && <span>· {run.event}</span>}
                                        {run.actor && <span>· {run.actor}</span>}
                                    </div>
                                    <div className="gh-run__meta">
                                        <span className="gh-pill" title="Branch"><GitBranch size={12} aria-hidden="true" /> {run.branch || 'unknown'}</span>
                                        <span className="gh-commit" title={run.commitMessage}>
                                            <GitCommitHorizontal size={12} aria-hidden="true" />
                                            {commitUrl
                                                ? <a href={commitUrl} target="_blank" rel="noopener noreferrer"><code>{run.shortSha}</code></a>
                                                : <code>{run.shortSha}</code>}
                                            {run.commitMessage && <span className="gh-commit__msg">{run.commitMessage}</span>}
                                        </span>
                                    </div>
                                </div>

                                <div className="gh-run__side">
                                    <time dateTime={run.createdAt} title={formatDateTime(run.createdAt)}>{timeAgo(run.createdAt)}</time>
                                    {duration && <span className="gh-muted">{duration}</span>}
                                    <div className="gh-run__actions">
                                        {runUrl && (
                                            <a className="gh-link" href={runUrl} target="_blank" rel="noopener noreferrer">
                                                View on GitHub <ExternalLink size={12} aria-hidden="true" />
                                            </a>
                                        )}
                                        {run.incident ? (
                                            <button type="button" className="gh-btn gh-btn--sm" onClick={() => onViewIncident(run.incident.id)}>
                                                <Siren size={14} aria-hidden="true" /> View incident
                                            </button>
                                        ) : eligible ? (
                                            <button
                                                type="button"
                                                className="gh-btn gh-btn--sm gh-btn--danger"
                                                disabled={creatingRunId === run.id}
                                                onClick={() => onCreateIncident(run)}
                                            >
                                                {creatingRunId === run.id
                                                    ? <><LoaderCircle size={14} className="gh-spin" aria-hidden="true" /> Creating…</>
                                                    : <><Siren size={14} aria-hidden="true" /> Create incident</>}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}