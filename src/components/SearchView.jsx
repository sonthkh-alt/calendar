import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, MapPin, Users, Clock, CalendarDays } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { searchEntries } from '../lib/api';
import { SESSIONS } from '../lib/constants';
import { toISODate, parseISO, fmtDMY, dayName } from '../lib/dates';

/**
 * Tìm kiếm lịch toàn hệ thống (mọi năm, mọi trạng thái: chờ duyệt / đã duyệt / đã điều
 * chỉnh / từ chối). Khớp Nội dung / Địa điểm / Thành phần / Tên nhóm / Tên lãnh đạo.
 * Sắp xếp ưu tiên: HÔM NAY & SẮP TỚI (tăng dần) trước, rồi ĐÃ QUA (gần nhất trước).
 * props: leaders, onView(entry)
 */
const ts = (e) => `${e.start_time || ''}`;

export default function SearchView({ leaders, onView }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0); // chống kết quả cũ ghi đè kết quả mới

  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);

  // Tìm (debounce 300ms). Khớp thêm lãnh đạo theo tên (tra ở bộ nhớ).
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setResults([]); setSearched(false); setLoading(false); return undefined; }
    setLoading(true);
    const my = ++seq.current;
    const handle = setTimeout(async () => {
      const ql = q.toLowerCase();
      const leaderIds = (leaders || []).filter((l) => (l.full_name || '').toLowerCase().includes(ql)).map((l) => l.id);
      const { data } = await searchEntries(q, leaderIds);
      if (my !== seq.current) return; // đã có lần tìm mới hơn
      // Gộp theo sự kiện (group_id) -> 1 kết quả/sự kiện
      const byEvent = new Map();
      for (const e of data || []) {
        const k = e.group_id || e.id;
        if (!byEvent.has(k)) byEvent.set(k, e);
      }
      setResults([...byEvent.values()]);
      setSearched(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [term, leaders]);

  // Sắp xếp: hôm nay & tương lai (tăng dần) trước; quá khứ (gần nhất trước) sau.
  const { upcoming, past } = useMemo(() => {
    const today = toISODate(new Date());
    const up = [], pa = [];
    for (const e of results) (e.date >= today ? up : pa).push(e);
    up.sort((a, b) => a.date.localeCompare(b.date) || ts(a).localeCompare(ts(b)));
    pa.sort((a, b) => b.date.localeCompare(a.date) || ts(a).localeCompare(ts(b)));
    return { upcoming: up, past: pa };
  }, [results]);

  const timeLabel = (e) => (e.session === 'gio'
    ? `${(e.start_time || '').slice(0, 5)}${e.end_time ? '–' + e.end_time.slice(0, 5) : ''}`
    : SESSIONS[e.session] || '');

  const Row = (e) => {
    const d = parseISO(e.date);
    const who = e.group_label || leaderById[e.leader_id]?.full_name || '';
    return (
      <button key={e.id} onClick={() => onView?.(e)} className="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-red-300 hover:shadow-sm transition p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-red-800 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> {dayName(d)}, {fmtDMY(d)}
            <span className="text-slate-400 font-normal flex items-center gap-1"><Clock className="w-3 h-3" /> {timeLabel(e)}</span>
          </span>
          <StatusBadge status={e.status} />
        </div>
        <p className="text-[14px] font-semibold text-slate-800 mt-1 break-words">{e.content}</p>
        {who && <p className="text-[12px] text-slate-600 mt-0.5 flex items-start gap-1"><Users className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {who}</p>}
        {e.at_office
          ? <p className="text-[12px] font-semibold text-amber-700 mt-0.5">Làm việc tại cơ quan</p>
          : e.location && <p className="text-[12px] text-slate-500 mt-0.5 flex items-start gap-1"><MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {e.location}</p>}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          autoFocus value={term} onChange={(e) => setTerm(e.target.value)}
          placeholder="Tìm theo nội dung, địa điểm, thành phần, tên nhóm hoặc tên lãnh đạo…"
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition shadow-sm"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-600 animate-spin" />}
      </div>

      {term.trim().length >= 2 && searched && (
        <p className="text-[13px] text-slate-500">Tìm thấy <b className="text-slate-700">{upcoming.length + past.length}</b> lịch (mọi trạng thái).</p>
      )}

      {!loading && searched && upcoming.length === 0 && past.length === 0 && (
        <p className="text-center text-[14px] text-slate-400 italic py-10">Không có lịch nào khớp “{term.trim()}”.</p>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-emerald-700 uppercase tracking-wide">Hôm nay & sắp tới ({upcoming.length})</p>
          {upcoming.map(Row)}
        </div>
      )}
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wide">Đã qua ({past.length})</p>
          {past.map(Row)}
        </div>
      )}
    </div>
  );
}
