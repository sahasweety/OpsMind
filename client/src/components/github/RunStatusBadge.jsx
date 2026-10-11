import { CircleCheck, CircleX, LoaderCircle, Clock, Ban, CircleMinus, CircleDot } from 'lucide-react';
import { getRunState } from '../../utils/github';

const ICONS = {
    success: CircleCheck,
    failure: CircleX,
    timed_out: CircleX,
    startup_failure: CircleX,
    in_progress: LoaderCircle,
    queued: Clock,
    cancelled: Ban,
    skipped: CircleMinus
};

export default function RunStatusBadge({ run }) {
    const state = getRunState(run);
    const Icon = ICONS[state.key] || CircleDot;
    return (
        <span className={`gh-badge gh-badge--${state.tone}`} data-state={state.key}>
            <Icon size={14} aria-hidden="true" className={state.key === 'in_progress' ? 'gh-spin' : undefined} />
            {state.label}
        </span>
    );
}