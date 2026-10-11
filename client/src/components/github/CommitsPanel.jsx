import { ExternalLink } from 'lucide-react';
import ErrorNotice from './ErrorNotice';
import { safeGithubUrl, timeAgo, formatDateTime } from '../../utils/github';

export default function CommitsPanel({ state, onRetry }) {
    if (state.loading && !state.data) {
        return <div className="gh-skeleton-list" aria-busy="true" aria-label="Loading commits">{[0, 1, 2, 3].map((i) => <div key={i} className="gh-skeleton" />)}</div>;
    }
    if (state.error) return <ErrorNotice error={state.error} onRetry={onRetry} />;
    if (!state.data) return null;
    if (state.data.length === 0) {
        return <div className="gh-empty"><h3>No commits</h3><p>This repository has no commits yet.</p></div>;
    }

    return (
        <ul className="gh-list">
            {state.data.map((c) => {
                const url = safeGithubUrl(c.htmlUrl);
                const avatar = c.author?.avatarUrl && c.author.avatarUrl.startsWith('https://') ? c.author.avatarUrl : null;
                return (
                    <li key={c.sha} className="gh-commit-row">
                        {avatar
                            ? <img className="gh-avatar" src={avatar} alt="" width="28" height="28" loading="lazy" />
                            : <span className="gh-avatar gh-avatar--blank" aria-hidden="true" />}
                        <div className="gh-commit-row__main">
                            <div className="gh-run__title">{c.message || '(no message)'}</div>
                            <div className="gh-run__meta">
                                <span>{c.author?.login || c.author?.name || 'Unknown author'}</span>
                                <span>· <time dateTime={c.author?.date || undefined} title={formatDateTime(c.author?.date)}>{timeAgo(c.author?.date)}</time></span>
                            </div>
                        </div>
                        <div className="gh-run__actions">
                            {url ? (
                                <a className="gh-link" href={url} target="_blank" rel="noopener noreferrer">
                                    <code>{c.shortSha}</code> <ExternalLink size={12} aria-hidden="true" />
                                </a>
                            ) : <code>{c.shortSha}</code>}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}