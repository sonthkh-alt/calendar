import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, MapPin, X } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { searchEntries } from '../lib/api';
import { SESSIONS } from '../lib/constants';
import { toISODate, parseISO, fmtDMY, dayName } from '../lib/dates';

/**
 * Ô tìm kiếm gõ trực tiếp (đặt cạnh "Tuần sau"). Kết quả xổ xuống ngay dưới ô.
 * Tìm TOÀN BỘ lịch (mọi năm, mọi trạng thái) theo Nội dung/Địa điểm/Thành phần/Tên nhóm/
 * Tên lãnh đạo. Sắp xếp: HÔM NAY & SẮP TỚI (tăng dần) trước, rồi ĐÃ QUA (gần nhất trước).
 * props: leaders, onView(entry)
 */
const ts = (e) => `${e.start_time || ''}`;

export default function SearchBox({ leaders, onView }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setResults([]); setSearched(false); setLoading(false); return undefined; }
    setLoading(true);
    const my = ++seq.current;
    const handle = setTimeout(async () => {
      const ql = q.toLowerCase();
      const leaderIds = (leaders || []).filter((l) => (l.full_name || '').toLowerCase().includes(ql)).map((l) => l.id);
      const { data } = await searchEntries(q, leaderIds);
      if (my !== seq.current) return;
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

  const pick = (e) => { onView?.(e); setOpen(false); };
  const clear = () => { setTerm(''); setResults([]); setSearched(false); setOpen(false); };

  const Row = (e) => {
    const d = parseISO(e.date);
    const who = e.group_label || leaderById[e.leader_id]?.full_name || '';
    return (
      <button key={e.id} onClick={() => pick(e)} className="w-full text-left px-3 py-2 hover:bg-red-50 transition border-b border-slate-100 last:border-b-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-red-800">{dayName(d)}, {fmtDMY(d)} · {timeLabel(e)}</span>
          <StatusBadge status={e.status} small />
        </div>
        <p className="text-[13px] font-semibold text-slate-800 mt-0.5 line-clamp-2">{e.content}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
          {who}{!e.at_office && e.location ? <span className="inline-flex items-center gap-0.5"> · <MapPin className="w-3 h-3" /> {e.location}</span> : null}
          {e.at_office ? ' · Làm việc tại cơ quan' : null}
        </p>
      </button>
    );
  };

  const showPanel = open && term.trim().length >= 2;
  const total = upcoming.length + past.length;

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 bg-white/90 border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100 transition">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Tìm kiếm"
          className="w-40 sm:w-52 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
        />
        {loading && <Loader2 className="w-3.5 h-3.5 text-red-600 animate-spin shrink-0" />}
        {!loading && term && <button onClick={clear} title="Xóa" className="shrink-0 text-slate-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 left-0 mt-1 w-[min(92vw,420px)] max-h-[70vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl">
            {!searched && loading && (
              <p className="px-3 py-4 text-center text-[13px] text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Đang tìm…</p>
            )}
            {searched && total === 0 && (
              <p className="px-3 py-4 text-center text-[13px] text-slate-400 italic">Không có lịch nào khớp “{term.trim()}”.</p>
            )}
            {total > 0 && (
              <>
                <p className="px-3 py-1.5 text-[11px] text-slate-500 bg-slate-50 border-b border-slate-100">Tìm thấy <b className="text-slate-700">{total}</b> lịch (mọi trạng thái)</p>
                {upcoming.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Hôm nay & sắp tới ({upcoming.length})</p>
                    {upcoming.map(Row)}
                  </>
                )}
                {past.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Đã qua ({past.length})</p>
                    {past.map(Row)}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
