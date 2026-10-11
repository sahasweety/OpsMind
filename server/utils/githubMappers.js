const mapRepoMeta = (r) => ({
    id: r.id,
    name: r.name,
    owner: r.owner?.login,
    fullName: r.full_name,
    description: r.description,
    private: r.private,
    archived: r.archived,
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    language: r.language,
    stargazersCount: r.stargazers_count,
    forksCount: r.forks_count,
    openIssuesCount: r.open_issues_count,
    pushedAt: r.pushed_at,
    updatedAt: r.updated_at
});

const mapCommit = (c) => ({
    sha: c.sha,
    shortSha: c.sha ? c.sha.slice(0, 7) : '',
    message: (c.commit?.message || '').split('\n')[0],
    author: {
        name: c.commit?.author?.name || null,
        date: c.commit?.author?.date || null,
        login: c.author?.login || null,
        avatarUrl: c.author?.avatar_url || null
    },
    htmlUrl: c.html_url
});

const mapRun = (r) => ({
    id: String(r.id),
    runNumber: r.run_number,
    runAttempt: r.run_attempt,
    workflowName: r.name,
    displayTitle: r.display_title,
    event: r.event,
    status: r.status,
    conclusion: r.conclusion,
    branch: r.head_branch,
    headSha: r.head_sha,
    shortSha: r.head_sha ? r.head_sha.slice(0, 7) : '',
    commitMessage: (r.head_commit?.message || '').split('\n')[0],
    commitUrl: r.repository?.html_url && r.head_sha ? `${r.repository.html_url}/commit/${r.head_sha}` : null,
    actor: r.actor?.login || r.triggering_actor?.login || null,
    actorAvatar: r.actor?.avatar_url || null,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    startedAt: r.run_started_at || null,
    updatedAt: r.updated_at
});

const INCIDENT_CONCLUSIONS = ['failure', 'timed_out', 'startup_failure'];

const isIncidentEligible = (run) =>
    run.status === 'completed' && INCIDENT_CONCLUSIONS.includes(run.conclusion);

module.exports = { mapRepoMeta, mapCommit, mapRun, INCIDENT_CONCLUSIONS, isIncidentEligible };