import { STATUS } from '../lib/constants';

export default function StatusBadge({ status, small }) {
  const s = STATUS[status];
  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${s.bg} ${s.text} border ${s.border} ${small ? 'text-[10px] px-1.5 py-0' : 'text-[11px] px-2 py-0.5'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
