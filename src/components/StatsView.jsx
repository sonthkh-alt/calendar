import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, RotateCcw, Loader2, FileSpreadsheet, FileText, FileType2,
  Search, AlertTriangle, ListChecks, CalendarDays, Info,
} from 'lucide-react';
import { fetchEntries } from '../lib/api';
import { STATUS, UNIT_GROUP_FILTERS, TRUONG_BAN_FILTER_KEY, TRUONG_BAN_GROUP_NAME, leaderInUnits, canExportDocx } from '../lib/constants';
import { canViewProcessStats, canViewVehicleStats, canDispatchPrivateVehicle } from '../lib/permissions';
import { toISODate } from '../lib/dates';
import {
  PERIOD_TYPES, COMPARE_MODES, MAX_CUSTOM_DAYS, STAT_GROUPS, ACTIVITY_CATEGORIES,
  periodRange, shiftAnchor, comparisonRange, buildStatsReport, formatCell, isNumericType, totalNeedsLabel,
} from '../lib/stats';
import { exportStatsXlsx, exportStatsPdf, exportStatsDocx } from '../lib/statsExport';
import DateField from './DateField';

/**
 * Tab THỐNG KÊ — số liệu + xuất báo cáo (Excel / PDF / Word) từ dữ liệu lịch công tác.
 * Tự nạp dữ liệu theo kỳ báo cáo (độc lập với năm đang xem ở lịch), kèm kỳ so sánh.
 * Mọi con số trên màn hình và trong tệp xuất đều lấy từ CÙNG mô hình lib/stats.
 */
export default function StatsView({ profile, leaders, bans, vehicles, profiles, truongBanIds, onView }) {
  // ===== Kỳ báo cáo & bộ lọc =====
  const [ptype, setPtype] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const todayIso = toISODate(new Date());
  const [cFrom, setCFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [cTo, setCTo] = useState(todayIso);
  const [compare, setCompare] = useState('prev');
  const [unitKeys, setUnitKeys] = useState([]);
  const [leaderId, setLeaderId] = useState('');
  const [statusMode, setStatusMode] = useState('active');
  const [unitOpen, setUnitOpen] = useState(false);
  const [group, setGroup] = useState('overview');

  const perms = useMemo(() => ({
    process: canViewProcessStats(profile),
    vehicle: canViewVehicleStats(profile),
    privateVehicles: canDispatchPrivateVehicle(profile),
  }), [profile]);

  const range = useMemo(() => periodRange(ptype, anchor, { from: cFrom, to: cTo }), [ptype, anchor, cFrom, cTo]);
  const cmpRange = useMemo(() => comparisonRange(ptype, anchor, range, compare), [ptype, anchor, range, compare]);
  const customTooLong = ptype === 'custom' && cFrom && cTo && range.to !== (cTo > cFrom ? cTo : cFrom);

  // ===== Nạp dữ liệu kỳ báo cáo + kỳ so sánh =====
  const [data, setData] = useState(null); // { cur, prev, range, cmpRange, at }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqRef.current;
    setLoading(true); setError('');
    const [a, b] = await Promise.all([
      fetchEntries(range.from, range.to),
      cmpRange ? fetchEntries(cmpRange.from, cmpRange.to) : Promise.resolve({ data: null, error: null }),
    ]);
    if (id !== reqRef.current) return; // đã có yêu cầu mới hơn (đổi kỳ liên tục)
    if (a.error || b.error) setError((a.error || b.error).message || 'Không tải được dữ liệu.');
    setData({ cur: a.data || [], prev: b.data || null, range, cmpRange, at: new Date() });
    setLoading(false);
  }, [range, cmpRange]);
  useEffect(() => { load(); }, [load]);

  const report = useMemo(() => {
    if (!data) return null;
    return buildStatsReport({
      entries: data.cur, compareEntries: data.prev, range: data.range, compareRange: data.cmpRange,
      leaders, bans, vehicles, profiles, unitKeys, leaderId: leaderId || null, statusMode, truongBanIds,
      perms, today: toISODate(data.at), now: data.at, author: profile?.full_name || profile?.email || '',
    });
  }, [data, leaders, bans, vehicles, profiles, unitKeys, leaderId, statusMode, truongBanIds, perms, profile]);

  // ===== Xuất báo cáo =====
  const [excluded, setExcluded] = useState(() => new Set(['detail', 'locations']));
  const [pickOpen, setPickOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const printKeys = report ? report.sections.map((s) => s.key).filter((k) => !excluded.has(k)) : [];
  const doExport = async (kind) => {
    if (!report || exporting) return;
    setExporting(kind);
    try {
      if (kind === 'xlsx') await exportStatsXlsx(report);
      else if (kind === 'pdf') await exportStatsPdf(report, { sectionKeys: printKeys });
      else await exportStatsDocx(report, { sectionKeys: printKeys });
    } catch (e) {
      alert('Không xuất được báo cáo: ' + (e?.message || e));
    } finally {
      setExporting('');
    }
  };

  // ===== Danh sách đơn vị / lãnh đạo (như FilterBar) =====
  const unitOptions = useMemo(() => [
    { key: 'grp:pct', label: UNIT_GROUP_FILTERS[0].label },
    { key: 'grp:doan', label: UNIT_GROUP_FILTERS[1].label },
    ...((truongBanIds && truongBanIds.size) ? [{ key: TRUONG_BAN_FILTER_KEY, label: TRUONG_BAN_GROUP_NAME }] : []),
    ...(bans || []).map((b) => ({ key: b.id, label: b.name })),
    { key: 'grp:vanphong', label: UNIT_GROUP_FILTERS[2].label },
  ], [bans, truongBanIds]);
  const visibleLeaders = (leaders || []).filter((l) => leaderInUnits(l, unitKeys, { truongBanIds }));
  const toggleUnit = (k) => {
    const s = new Set(unitKeys);
    if (s.has(k)) s.delete(k); else s.add(k);
    setUnitKeys([...s]); setLeaderId('');
  };
  const unitSummary = unitKeys.length === 0 ? 'Tất cả đơn vị' : unitOptions.filter((o) => unitKeys.includes(o.key)).map((o) => o.label).join(', ');

  const groups = STAT_GROUPS.filter((g) => !g.perm || perms[g.perm]);
  const sel = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400';
  const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition disabled:opacity-50';
  const isCurrent = ptype !== 'custom' && periodRange(ptype, new Date()).from === range.from;
  const issueCount = report?.sections.find((s) => s.key === 'issues')?.rows.length || 0;

  return (
    <div className="space-y-3">
      {/* ===== Kỳ báo cáo + bộ lọc ===== */}
      <div className="no-print rounded-xl border border-slate-200 bg-white/95 shadow-sm p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wide text-slate-500 mr-1">Kỳ báo cáo</span>
          <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-0.5">
            {PERIOD_TYPES.map((p) => (
              <button key={p.key} onClick={() => setPtype(p.key)}
                className={`px-2.5 py-1 rounded-md text-[13px] font-semibold transition ${ptype === p.key ? 'bg-red-700 text-white shadow' : 'text-slate-600 hover:bg-white'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {ptype !== 'custom' ? (
            <div className="flex items-center gap-1">
              <button onClick={() => setAnchor((a) => shiftAnchor(ptype, a, -1))} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-600" title="Kỳ trước"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-1 text-[13px] font-bold text-slate-800 text-center">{range.fullLabel}</span>
              <button onClick={() => setAnchor((a) => shiftAnchor(ptype, a, 1))} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-600" title="Kỳ sau"><ChevronRight className="w-4 h-4" /></button>
              {!isCurrent && (
                <button onClick={() => setAnchor(new Date())} className={`${btn} bg-white border border-slate-200 text-slate-600 hover:bg-red-50`}>
                  <CalendarDays className="w-3.5 h-3.5" /> Kỳ hiện tại
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-600">
              Từ <div className="w-[150px]"><DateField value={cFrom} onChange={setCFrom} /></div>
              đến <div className="w-[150px]"><DateField value={cTo} onChange={setCTo} /></div>
              <span className="text-slate-400">({range.days.toLocaleString('vi-VN')} ngày)</span>
            </div>
          )}
        </div>
        {customTooLong && (
          <p className="text-[12px] text-amber-700">Khoảng tùy chọn được giới hạn tối đa {MAX_CUSTOM_DAYS.toLocaleString('vi-VN')} ngày (5 năm) — đã cắt đến {formatCell(range.to, 'date')}.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select value={compare} onChange={(e) => setCompare(e.target.value)} className={sel} title="Kỳ so sánh">
            {COMPARE_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <div className="relative">
            <button onClick={() => setUnitOpen((o) => !o)} className={`${sel} flex items-center gap-1.5`} title="Phạm vi đơn vị (chọn nhiều)">
              <span className="max-w-[220px] truncate">{unitSummary}</span>
              {unitKeys.length > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-700 text-white text-[10px] font-bold">{unitKeys.length}</span>}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {unitOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUnitOpen(false)} />
                <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1.5">
                  {unitOptions.map((o) => (
                    <label key={o.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-red-50 cursor-pointer text-[13px] text-slate-700">
                      <input type="checkbox" checked={unitKeys.includes(o.key)} onChange={() => toggleUnit(o.key)} className="accent-red-700 w-4 h-4" />
                      {o.label}
                    </label>
                  ))}
                  {unitKeys.length > 0 && (
                    <button onClick={() => { setUnitKeys([]); setLeaderId(''); }} className="w-full mt-1 px-2 py-1.5 rounded-md text-[12px] font-semibold text-slate-500 hover:bg-slate-100 text-left">
                      Bỏ chọn (mọi đơn vị)
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)} className={sel}>
            <option value="">Tất cả lãnh đạo</option>
            {visibleLeaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}{l.active === false ? ' (đã nghỉ)' : ''}</option>)}
          </select>
          <select value={statusMode} onChange={(e) => setStatusMode(e.target.value)} className={sel} title="Lịch nào được tính vào số liệu">
            <option value="active">Tính lịch đã duyệt + chờ duyệt</option>
            <option value="approved">Chỉ lịch đã duyệt</option>
            <option value="all">Tính cả lịch bị từ chối</option>
          </select>
          {(unitKeys.length > 0 || leaderId || statusMode !== 'active') && (
            <button onClick={() => { setUnitKeys([]); setLeaderId(''); setStatusMode('active'); }} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-red-700 font-medium">
              <RotateCcw className="w-3.5 h-3.5" /> Xóa lọc
            </button>
          )}
          <div className="flex-1" />
          <button onClick={load} disabled={loading} className={`${btn} bg-white border border-slate-200 text-slate-600 hover:bg-red-50`} title="Nạp lại số liệu mới nhất">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {data?.at ? `Số liệu lúc ${data.at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Tải số liệu'}
          </button>
        </div>
      </div>

      {/* ===== Xuất báo cáo ===== */}
      <div className="no-print rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-amber-50 px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-red-900 mr-1">Xuất báo cáo:</span>
        <button onClick={() => doExport('xlsx')} disabled={!report || !!exporting} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`} title="Mỗi bảng một sheet, đầy đủ mọi cột — để lọc, tính toán tiếp">
          {exporting === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Excel
        </button>
        <button onClick={() => doExport('pdf')} disabled={!report || !!exporting || !printKeys.length} className={`${btn} bg-red-700 text-white hover:bg-red-800`} title="Báo cáo trình ký: quốc hiệu, kỳ báo cáo, bảng số liệu, chữ ký">
          {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
        </button>
        {canExportDocx(profile?.email) && (
          <button onClick={() => doExport('docx')} disabled={!report || !!exporting || !printKeys.length} className={`${btn} bg-sky-700 text-white hover:bg-sky-800`} title="Bản Word để biên tập thành báo cáo">
            {exporting === 'docx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileType2 className="w-4 h-4" />} Word
          </button>
        )}
        <div className="relative">
          <button onClick={() => setPickOpen((o) => !o)} disabled={!report} className={`${btn} bg-white border border-slate-200 text-slate-700 hover:bg-red-50`}>
            <ListChecks className="w-4 h-4" /> Nội dung bản in ({printKeys.length}/{report?.sections.length || 0}) <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {pickOpen && report && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickOpen(false)} />
              <div className="absolute z-20 mt-1 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-2">
                <p className="text-[11px] text-slate-500 px-1 pb-1.5">Chọn các bảng đưa vào bản PDF / Word. Bản Excel luôn có đầy đủ mọi bảng.</p>
                {report.sections.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-red-50 cursor-pointer text-[13px] text-slate-700">
                    <input type="checkbox" className="accent-red-700 w-4 h-4" checked={!excluded.has(s.key)}
                      onChange={() => setExcluded((prev) => { const n = new Set(prev); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })} />
                    {s.title}{s.key === 'detail' && <span className="text-[11px] text-slate-400">({s.rows.length} dòng)</span>}
                  </label>
                ))}
                <div className="flex gap-2 pt-1.5 px-1">
                  <button onClick={() => setExcluded(new Set())} className="text-[12px] font-semibold text-red-700 hover:underline">Chọn tất cả</button>
                  <button onClick={() => setExcluded(new Set(['detail', 'locations']))} className="text-[12px] font-semibold text-slate-500 hover:underline">Mặc định</button>
                </div>
              </div>
            </>
          )}
        </div>
        <span className="text-[12px] text-slate-500 basis-full sm:basis-auto">
          {report ? <>Phạm vi: <b className="text-slate-700">{report.meta.scopeLabel}</b></> : null}
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Không tải được đầy đủ dữ liệu: {error}. Số liệu bên dưới có thể chưa đủ — bấm "Tải số liệu" để thử lại.
        </div>
      )}

      {!report ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-[13px]">
          <Loader2 className="w-5 h-5 animate-spin inline mr-1.5" /> Đang tổng hợp số liệu…
        </div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <KpiTiles kpis={report.kpis} compare={report.meta.compare} />

          {/* Thẻ con */}
          <div className="no-print flex gap-1 overflow-x-auto mt-3 mb-3 pb-0.5">
            {groups.map((g) => (
              <button key={g.key} onClick={() => setGroup(g.key)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition ${group === g.key ? 'bg-red-700 text-white shadow' : 'bg-white/90 border border-slate-200 text-slate-600 hover:bg-red-50'}`}>
                {g.label}
                {g.key === 'issues' && issueCount > 0 && (
                  <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${group === g.key ? 'bg-white text-red-800' : 'bg-amber-400 text-red-900'}`}>{issueCount}</span>
                )}
              </button>
            ))}
          </div>

          {group === 'detail' ? (
            <DetailSection section={report.sections.find((s) => s.key === 'detail')} onView={onView} />
          ) : (
            <div className="space-y-3">
              {report.sections.filter((s) => s.group === group).map((s) => (
                <SectionCard key={s.key} section={s} onView={s.key === 'issues' ? onView : null} />
              ))}
              {group === 'overview' && <MethodNotes notes={report.meta.notes} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===================== Thẻ chỉ tiêu =====================
function KpiTiles({ kpis, compare }) {
  const tiles = kpis.filter((k) => k.tile);
  // Kỳ so sánh trống hoàn toàn (vd hệ thống chưa dùng) -> không hiện "tăng" ảo
  const prevEmpty = compare && kpis.find((k) => k.key === 'events')?.prev === 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {tiles.map((k) => (
        <div key={k.key} className="rounded-xl border border-slate-200 bg-white shadow-sm px-3 py-2.5" title={k.hint || k.label}>
          <p className="text-[11.5px] leading-tight text-slate-500 min-h-[28px]">{k.label}</p>
          <p className="text-[24px] font-extrabold text-slate-800 tabular-nums leading-tight mt-0.5">{formatCell(k.value, 'num')}</p>
          {prevEmpty && <p className="text-[11px] text-slate-400" title={`${compare.kind}: ${compare.fullLabel}`}>Kỳ so sánh chưa có dữ liệu</p>}
          {compare && !prevEmpty && (
            <p className="text-[11px] text-slate-500 tabular-nums" title={`${compare.kind}: ${compare.fullLabel}`}>
              {k.delta > 0 ? '▲' : k.delta < 0 ? '▼' : '='} {formatCell(k.delta, 'delta')}
              {k.deltaPct != null && ` (${formatCell(k.deltaPct, 'deltaPct')})`}
              <span className="text-slate-400"> · kỳ so sánh {formatCell(k.prev, 'num')}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ===================== Bảng số liệu (dùng chung) =====================
function SectionCard({ section: s, onView }) {
  const chartKey = s.chart;
  const max = chartKey ? Math.max(0, ...s.rows.map((r) => Number(r[chartKey]) || 0)) : 0;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b border-slate-100">
        <h3 className="text-[14px] font-bold text-slate-800">{s.title}</h3>
        {s.description && <p className="text-[12px] text-slate-500 mt-0.5">{s.description}</p>}
      </header>
      {s.chartType === 'column' && <ColumnChart rows={s.rows} valueKey={chartKey} />}
      {s.chartStatus && <StatusBar rows={s.rows} />}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-red-800 text-white">
              {s.columns.map((c) => (
                <th key={c.key} className={`px-2.5 py-2 font-bold whitespace-nowrap ${isNumericType(c.type) ? 'text-right' : 'text-left'} ${c.key === chartKey ? 'min-w-[150px]' : ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {s.rows.length === 0 && (
              <tr><td colSpan={s.columns.length} className="px-3 py-6 text-center text-slate-400 italic">Không có dữ liệu trong kỳ báo cáo</td></tr>
            )}
            {s.rows.map((r, i) => (
              <tr key={i} onClick={onView && r._entry ? () => onView(r._entry) : undefined}
                className={`${onView && r._entry ? 'cursor-pointer hover:bg-red-50' : 'hover:bg-slate-50'} ${r.level === 'Khẩn' ? 'bg-rose-50/60' : ''}`}>
                {s.columns.map((c) => (
                  <td key={c.key} className={`px-2.5 py-1.5 align-top ${isNumericType(c.type) ? 'text-right tabular-nums whitespace-nowrap' : 'text-slate-700'} ${c.key === 'level' ? 'font-semibold whitespace-nowrap' : ''}`}>
                    {c.key === chartKey ? <BarCell value={r[c.key]} max={max} label={c.label} /> : formatCell(r[c.key], c.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {s.total && (
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                {s.columns.map((c, i) => (
                  <td key={c.key} className={`px-2.5 py-1.5 ${isNumericType(c.type) ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>
                    {s.total[c.key] != null ? formatCell(s.total[c.key], c.type) : (i === 0 && totalNeedsLabel(s) ? 'Cộng' : '')}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {(s.notes || []).length > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 space-y-0.5">
          {s.notes.map((n, i) => <p key={i} className="text-[11.5px] text-slate-500 italic">Ghi chú: {n}</p>)}
        </div>
      )}
    </section>
  );
}

// Thanh ngang trong ô: một màu (độ lớn), số liệu ghi bằng chữ thường bên cạnh
function BarCell({ value, max, label }) {
  const v = Number(value) || 0;
  const w = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * 100) : 0;
  return (
    <div className="flex items-center justify-end gap-2" title={`${label}: ${formatCell(v, 'int')}`}>
      <div className="flex-1 h-2 rounded-r bg-slate-100 overflow-hidden min-w-[60px]">
        <div className="h-full bg-red-700/80 rounded-r" style={{ width: `${w}%` }} />
      </div>
      <span className="tabular-nums w-10 text-right">{formatCell(v, 'int')}</span>
    </div>
  );
}

// Biểu đồ cột theo thời gian (một chuỗi số liệu -> không cần chú giải; di chuột xem số)
function ColumnChart({ rows, valueKey }) {
  const max = Math.max(0, ...rows.map((r) => Number(r[valueKey]) || 0));
  if (!rows.length) return null;
  const showVals = rows.length <= 16;
  const labelEvery = rows.length > 31 ? Math.ceil(rows.length / 16) : 1;
  return (
    <div className="px-4 pt-3 pb-2 overflow-x-auto">
      <div className="flex items-end gap-[2px] h-36" style={{ minWidth: rows.length * 14 }}>
        {rows.map((r, i) => {
          const v = Number(r[valueKey]) || 0;
          const h = max > 0 ? (v / max) * 100 : 0;
          return (
            <div key={i} className="group flex-1 h-full flex flex-col justify-end items-center relative" title={`${r.label} (${r.span}): ${v} sự kiện`}>
              {showVals && v > 0 && <span className="text-[10px] text-slate-600 tabular-nums mb-0.5">{v}</span>}
              <div className="w-full max-w-[44px] bg-red-700/80 group-hover:bg-red-800 rounded-t" style={{ height: `${h}%`, minHeight: v > 0 ? 2 : 0 }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px] border-t border-slate-300 pt-1" style={{ minWidth: rows.length * 14 }}>
        {rows.map((r, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-slate-500 truncate">{i % labelEvery === 0 ? r.label.replace('Tháng ', 'T').replace('Tuần ', 'T') : ''}</div>
        ))}
      </div>
    </div>
  );
}

// Thanh xếp chồng theo TRẠNG THÁI DUYỆT (màu trạng thái chuẩn của hệ thống + nhãn)
function StatusBar({ rows }) {
  const total = rows.reduce((n, r) => n + (r.events || 0), 0);
  if (!total) return null;
  const colorOf = (k) => STATUS[k]?.dot || 'bg-slate-400';
  return (
    <div className="px-4 pt-3 pb-1">
      <div className="flex h-3 rounded overflow-hidden gap-[2px] bg-white">
        {rows.filter((r) => r.events > 0).map((r) => (
          <div key={r.key} className={colorOf(r.key)} style={{ width: `${(r.events / total) * 100}%` }} title={`${r.label}: ${r.events}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
        {rows.map((r) => (
          <span key={r.key} className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
            <span className={`w-2.5 h-2.5 rounded-sm ${colorOf(r.key)}`} /> {r.label}: <b className="tabular-nums">{r.events}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// ===================== Danh sách chi tiết (lọc + bấm xem lịch) =====================
const PAGE = 300;
function DetailSection({ section, onView }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [st, setSt] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (section?.rows || []).filter((r) => (!cat || r.categoryKey === cat) && (!st || r.status === st)
      && (!t || `${r.content} ${r.location} ${r.who}`.toLowerCase().includes(t)));
  }, [section, q, cat, st]);
  if (!section) return null;
  const cols = section.columns.filter((c) => c.key !== 'units');
  const sel = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400';
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <div className="min-w-0 mr-auto">
          <h3 className="text-[14px] font-bold text-slate-800">{section.title}</h3>
          <p className="text-[12px] text-slate-500">Bấm vào một dòng để mở chi tiết lịch. Đang hiển thị {Math.min(limit, rows.length).toLocaleString('vi-VN')}/{rows.length.toLocaleString('vi-VN')} sự kiện.</p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Lọc nội dung, địa điểm, lãnh đạo" className={`${sel} pl-7 w-60`} />
        </div>
        <select value={cat} onChange={(e) => { setCat(e.target.value); setLimit(PAGE); }} className={sel}>
          <option value="">Mọi loại hoạt động</option>
          {ACTIVITY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={st} onChange={(e) => { setSt(e.target.value); setLimit(PAGE); }} className={sel}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[900px]">
          <thead>
            <tr className="bg-red-800 text-white">
              {cols.map((c) => <th key={c.key} className="px-2.5 py-2 font-bold text-left whitespace-nowrap">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-slate-400 italic">Không có hoạt động phù hợp</td></tr>}
            {rows.slice(0, limit).map((r) => (
              <tr key={r.stt} onClick={() => onView?.(r._entry)} className="cursor-pointer hover:bg-red-50 align-top">
                {cols.map((c) => (
                  <td key={c.key} className={`px-2.5 py-1.5 ${c.key === 'content' ? 'text-slate-800 font-medium min-w-[240px]' : 'text-slate-600'} ${['date', 'weekday', 'time', 'stt'].includes(c.key) ? 'whitespace-nowrap' : ''}`}>
                    {c.key === 'statusLabel'
                      ? <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${STATUS[r.status]?.bg || ''} ${STATUS[r.status]?.text || ''}`}>{r.statusLabel}</span>
                      : formatCell(r[c.key], c.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="px-4 py-2 border-t border-slate-100 text-center">
          <button onClick={() => setLimit((n) => n + PAGE)} className="text-[13px] font-semibold text-red-700 hover:underline">Xem thêm {Math.min(PAGE, rows.length - limit)} dòng</button>
          <span className="text-[12px] text-slate-400"> — hoặc xuất Excel để có toàn bộ danh sách</span>
        </div>
      )}
    </section>
  );
}

function MethodNotes({ notes }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 bg-white/90 shadow-sm">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-4 py-2.5 flex items-center gap-2 text-left text-[13px] font-semibold text-slate-700">
        <Info className="w-4 h-4 text-slate-400" /> Ghi chú phương pháp tính (in kèm cuối báo cáo)
        <ChevronDown className={`w-4 h-4 ml-auto text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="px-4 pb-3 pl-9 list-decimal space-y-1 text-[12.5px] text-slate-600">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ol>
      )}
    </section>
  );
}
