import { useState } from 'react';
import { Star, GitFork, CircleDot, Lock, Globe, RefreshCw, Unlink, ExternalLink, GitBranch } from 'lucide-react';
import { safeGithubUrl, timeAgo, formatDateTime, formatTime } from '../../utils/github';

export default function RepoHeader({
    record, meta, metaLoading, canManage, refreshing, lastUpdated, onRefresh, onDisconnect, disconnecting
}) {
    const [confirming, setConfirming] = useState(false);
    const url = meta ? safeGithubUrl(meta.htmlUrl) : null;

    return (
        <div className="gh-card gh-repo">
            <div className="gh-repo__top">
                <div className="gh-repo__title">
                    <h2>
                        {url
                            ? <a href={url} target="_blank" rel="noopener noreferrer">{record.owner}/{record.repo}</a>
                            : `${record.owner}/${record.repo}`}
                    </h2>
                    {meta && (
                        <span className="gh-pill">
                            {meta.private ? <Lock size={12} aria-hidden="true" /> : <Globe size={12} aria-hidden="true" />}
                            {meta.private ? 'Private' : 'Public'}
                        </span>
                    )}
                    {meta?.archived && <span className="gh-pill">Archived</span>}
                </div>

                <div className="gh-repo__buttons">
                    <button type="button" className="gh-btn gh-btn--sm" onClick={onRefresh} disabled={refreshing}>
                        <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'gh-spin' : undefined} />
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                    {url && (
                        <a className="gh-btn gh-btn--sm" href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={14} aria-hidden="true" /> GitHub
                        </a>
                    )}
                    {canManage && !confirming && (
                        <button type="button" className="gh-btn gh-btn--sm gh-btn--ghost-danger" onClick={() => setConfirming(true)}>
                            <Unlink size={14} aria-hidden="true" /> Disconnect
                        </button>
                    )}
                    {canManage && confirming && (
                        <span className="gh-confirm" role="group" aria-label="Confirm disconnect">
                            Disconnect this repository?
                            <button type="button" className="gh-btn gh-btn--sm gh-btn--danger" disabled={disconnecting} onClick={onDisconnect}>
                                {disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
                            </button>
                            <button type="button" className="gh-btn gh-btn--sm" onClick={() => setConfirming(false)} disabled={disconnecting}>Cancel</button>
                        </span>
                    )}
                </div>
            </div>

            {metaLoading && !meta && <div className="gh-skeleton gh-skeleton--short" aria-busy="true" aria-label="Loading repository details" />}

            {meta && (
                <>
                    {meta.description && <p className="gh-repo__desc">{meta.description}</p>}
                    <div className="gh-stats">
                        {meta.language && <span className="gh-stat"><span className="gh-dot" aria-hidden="true" />{meta.language}</span>}
                        <span className="gh-stat" title="Stars"><Star size={14} aria-hidden="true" /> {meta.stargazersCount.toLocaleString()}</span>
                        <span className="gh-stat" title="Forks"><GitFork size={14} aria-hidden="true" /> {meta.forksCount.toLocaleString()}</span>
                        <span className="gh-stat" title="Open issues and pull requests"><CircleDot size={14} aria-hidden="true" /> {meta.openIssuesCount.toLocaleString()}</span>
                        <span className="gh-stat" title="Default branch"><GitBranch size={14} aria-hidden="true" /> {meta.defaultBranch}</span>
                        <span className="gh-stat gh-muted" title={formatDateTime(meta.pushedAt)}>Last push {timeAgo(meta.pushedAt)}</span>
                    </div>
                </>
            )}

            {lastUpdated && <div className="gh-updated gh-muted">Data fetched live from GitHub · updated {formatTime(lastUpdated)}</div>}
        </div>
    );
}