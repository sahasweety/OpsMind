import { TriangleAlert, RefreshCw } from 'lucide-react';
import { formatDateTime } from '../../utils/github';

const TITLES = {
    RATE_LIMITED: 'GitHub rate limit reached',
    NOT_FOUND: 'Repository not found or not accessible',
    BAD_CREDENTIALS: 'GitHub token problem',
    FORBIDDEN: 'GitHub denied access',
    TIMEOUT: 'GitHub timed out',
    NETWORK: 'Could not reach GitHub'
};

export default function ErrorNotice({ error, onRetry, retrying = false, children }) {
    if (!error) return null;
    const title = TITLES[error.code] || 'Something went wrong';
    return (
        <div className="gh-error" role="alert">
            <TriangleAlert size={20} aria-hidden="true" className="gh-error__icon" />
            <div className="gh-error__body">
                <strong>{title}</strong>
                <p>{error.message}</p>
                {error.code === 'RATE_LIMITED' && error.resetAt && (
                    <p className="gh-muted">Limit resets at {formatDateTime(error.resetAt)}.</p>
                )}
                {children}
            </div>
            {onRetry && (
                <button type="button" className="gh-btn gh-btn--sm" onClick={onRetry} disabled={retrying}>
                    <RefreshCw size={14} aria-hidden="true" /> Retry
                </button>
            )}
        </div>
    );
}