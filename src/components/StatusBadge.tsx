import type { ConfidenceLevel, VerificationStatus } from '../shared/types.ts';
import { CONFIDENCE_LABEL, STATUS_LABEL } from '../shared/status.ts';

const STYLE: Record<VerificationStatus, string> = {
  confirmed: 'bg-brand-50 text-brand-700',
  to_confirm: 'bg-warn-50 text-warn-600',
  conflicting: 'bg-danger-50 text-danger-600',
  expired: 'bg-[#F1F2F4] text-neutral-500',
};
const DOT: Record<VerificationStatus, string> = {
  confirmed: 'bg-brand-600',
  to_confirm: 'bg-warn-600',
  conflicting: 'bg-danger-600',
  expired: 'bg-neutral-500',
};

export function StatusBadge({ status, confidence }: { status: VerificationStatus; confidence?: ConfidenceLevel }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${STYLE[status]}`}>
        <span className={`h-2 w-2 rounded-full ${DOT[status]}`} aria-hidden="true" />
        {STATUS_LABEL[status]}
      </span>
      {confidence && status !== 'expired' && <span className="text-[11px] font-semibold text-muted">{CONFIDENCE_LABEL[confidence]}</span>}
    </span>
  );
}
