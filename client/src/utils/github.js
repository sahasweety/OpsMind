const OWNER_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

/** Accepts owner/repo, a GitHub URL, .git URLs, or git@github.com:owner/repo.git */
export function parseRepoInput(input) {
    const raw = (input || '').trim();
    if (!raw) return { error: 'Enter a repository as owner/name, or paste its GitHub URL.' };

    let path = raw;
    let isUrl = false;
    const url = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
    const ssh = raw.match(/^git@github\.com:(.+)$/i);
    if (url) { path = url[1]; isUrl = true; }
    else if (ssh) { path = ssh[1]; isUrl = true; }

    path = path.split(/[?#]/)[0].replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);

    if (parts.length < 2 || (!isUrl && parts.length > 2)) {
        return { error: 'Use the form owner/repository, for example actions/checkout.' };
    }
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');

    if (!OWNER_RE.test(owner)) return { error: `"${owner}" is not a valid GitHub owner name.` };
    if (!REPO_RE.test(repo) || repo === '.' || repo === '..') {
        return { error: `"${repo}" is not a valid repository name.` };
    }
    return { owner, repo };
}

// ─── Workflow run state (single source of truth) ─────────────────────────────
const FAILED = ['failure', 'timed_out', 'startup_failure'];

export function getRunState(run) {
    const { status, conclusion } = run;

    if (status === 'in_progress') return { key: 'in_progress', label: 'In progress', tone: 'info', group: 'in_progress' };
    if (status === 'queued' || status === 'waiting' || status === 'requested' || status === 'pending') {
        return { key: 'queued', label: status === 'queued' ? 'Queued' : 'Waiting', tone: 'warning', group: 'queued' };
    }

    switch (conclusion) {
        case 'success': return { key: 'success', label: 'Successful', tone: 'success', group: 'success' };
        case 'failure': return { key: 'failure', label: 'Failed', tone: 'danger', group: 'failed' };
        case 'timed_out': return { key: 'timed_out', label: 'Timed out', tone: 'danger', group: 'failed' };
        case 'startup_failure': return { key: 'startup_failure', label: 'Startup failure', tone: 'danger', group: 'failed' };
        case 'cancelled': return { key: 'cancelled', label: 'Cancelled', tone: 'muted', group: 'cancelled' };
        case 'skipped': return { key: 'skipped', label: 'Skipped', tone: 'muted', group: 'other' };
        case 'action_required': return { key: 'action_required', label: 'Action required', tone: 'warning', group: 'other' };
        default: return { key: 'neutral', label: conclusion ? conclusion.replace(/_/g, ' ') : 'Completed', tone: 'muted', group: 'other' };
    }
}

export const isFailedRun = (run) => run.status === 'completed' && FAILED.includes(run.conclusion);

export const RUN_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'failed', label: 'Failed' },
    { key: 'success', label: 'Successful' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'queued', label: 'Queued' },
    { key: 'cancelled', label: 'Cancelled' }
];

export const countByFilter = (runs) => {
    const counts = { all: runs.length, failed: 0, success: 0, in_progress: 0, queued: 0, cancelled: 0 };
    for (const run of runs) {
        const g = getRunState(run).group;
        if (g in counts) counts[g] += 1;
    }
    return counts;
};

export const filterRuns = (runs, filter) =>
    filter === 'all' ? runs : runs.filter((run) => getRunState(run).group === filter);

// ─── Safe links ──────────────────────────────────────────────────────────────
export const safeGithubUrl = (url) => {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname === 'www.github.com') ? u.href : null;
    } catch {
        return null;
    }
};

// ─── Time ────────────────────────────────────────────────────────────────────
export const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
export const formatTime = (d) => d.toLocaleTimeString();

export function timeAgo(iso, now = Date.now()) {
    if (!iso) return '—';
    const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
    if (seconds < 45) return 'just now';
    const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [name, size] of units) {
        if (seconds >= size) {
            const n = Math.floor(seconds / size);
            return `${n} ${name}${n === 1 ? '' : 's'} ago`;
        }
    }
    return 'just now';
}

export function runDuration(run) {
    if (run.status !== 'completed' || !run.startedAt || !run.updatedAt) return null;
    const s = Math.round((new Date(run.updatedAt) - new Date(run.startedAt)) / 1000);
    if (!Number.isFinite(s) || s < 0) return null;
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ─── Errors ──────────────────────────────────────────────────────────────────
export const toApiError = (err) => ({
    message: err?.response?.data?.message || err?.message || 'Something went wrong',
    code: err?.response?.data?.code || null,
    resetAt: err?.response?.data?.resetAt || null,
    status: err?.response?.status || null,
    data: err?.response?.data || null
});

export const isCanceled = (err) => err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';
