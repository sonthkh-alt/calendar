import { useState } from 'react';
import { Plus, Save, Trash2, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react';
import { upsertLeader, deleteLeader } from '../lib/api';
import { LEADER_TYPES } from '../lib/constants';

/**
 * Quản trị danh sách lãnh đạo: sửa tên/chức vụ/Ban/thứ tự, ẩn/hiện, thêm, xóa.
 */
export default function AdminLeaders({ leaders, bans, onChanged }) {
  const [editing, setEditing] = useState({}); // id -> bản sửa đổi
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ full_name: '', position: '', leader_type: 'ban', ban_id: '' });

  const change = (l, field, value) =>
    setEditing((prev) => ({ ...prev, [l.id]: { ...l, ...prev[l.id], [field]: value } }));

  // Đổi thứ tự: hoán đổi sort_order với dòng liền kề (TT tự đánh số theo thứ tự này)
  const move = async (idx, dir) => {
    const list = leaders || [];
    const j = dir === 'up' ? idx - 1 : idx + 1;
    if (j < 0 || j >= list.length) return;
    const a = list[idx], b = list[j];
    setBusy(a.id);
    await upsertLeader({ ...a, sort_order: b.sort_order });
    await upsertLeader({ ...b, sort_order: a.sort_order });
    setBusy(null);
    onChanged?.();
  };

  const save = async (l) => {
    const row = editing[l.id];
    if (!row) return;
    setBusy(l.id);
    await upsertLeader({ ...row, ban_id: row.leader_type === 'ban' ? row.ban_id : null, sort_order: Number(row.sort_order) || 0 });
    setBusy(null);
    setEditing((prev) => { const n = { ...prev }; delete n[l.id]; return n; });
    onChanged?.();
  };

  const toggleActive = async (l) => {
    setBusy(l.id);
    await upsertLeader({ ...l, active: !l.active });
    setBusy(null);
    onChanged?.();
  };

  const remove = async (l) => {
    if (!window.confirm(`Xóa "${l.full_name}"? Toàn bộ lịch của lãnh đạo này cũng sẽ bị xóa.`)) return;
    setBusy(l.id);
    const { error } = await deleteLeader(l.id);
    setBusy(null);
    if (error) { alert('Không xóa được: ' + error.message); return; }
    onChanged?.();
  };

  const addNew = async () => {
    if (!draft.full_name.trim() || !draft.position.trim()) { alert('Nhập đủ Họ tên và Chức vụ.'); return; }
    if (draft.leader_type === 'ban' && !draft.ban_id) { alert('Chọn Ban cho lãnh đạo Ban.'); return; }
    setBusy('new');
    // Số thứ tự tự nhảy: lấy số lớn nhất hiện có + 1
    const nextSort = Math.max(0, ...(leaders || []).map((x) => Number(x.sort_order) || 0)) + 1;
    await upsertLeader({
      full_name: draft.full_name.trim(), position: draft.position.trim(),
      leader_type: draft.leader_type, ban_id: draft.leader_type === 'ban' ? draft.ban_id : null,
      sort_order: nextSort, active: true,
    });
    setBusy(null); setAdding(false);
    setDraft({ full_name: '', position: '', leader_type: 'ban', ban_id: '' });
    onChanged?.();
  };

  const input = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400 w-full';

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 shadow">
          <Plus className="w-4 h-4" /> Thêm lãnh đạo
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
          <div><label className="text-[11px] font-bold text-slate-600">Họ và tên</label><input className={input} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} /></div>
          <div><label className="text-[11px] font-bold text-slate-600">Chức vụ</label><input className={input} value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} /></div>
          <div>
            <label className="text-[11px] font-bold text-slate-600">Nhóm</label>
            <select className={input} value={draft.leader_type} onChange={(e) => setDraft({ ...draft, leader_type: e.target.value })}>
              {Object.entries(LEADER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600">Ban</label>
            <select className={input} disabled={draft.leader_type !== 'ban'} value={draft.ban_id} onChange={(e) => setDraft({ ...draft, ban_id: e.target.value })}>
              <option value="">— Chọn Ban —</option>
              {(bans || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <button onClick={addNew} disabled={busy === 'new'} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
            <Save className="w-4 h-4" /> Lưu
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="bg-red-800 text-white text-[12px]">
              <th className="px-3 py-2.5 text-center font-bold w-[78px]">TT</th>
              <th className="px-3 py-2.5 text-left font-bold">Họ và tên</th>
              <th className="px-3 py-2.5 text-left font-bold">Chức vụ</th>
              <th className="px-3 py-2.5 text-left font-bold">Nhóm / Ban</th>
              <th className="px-3 py-2.5 text-center font-bold w-[150px]">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(leaders || []).map((l, idx) => {
              const row = editing[l.id] || l;
              const dirty = !!editing[l.id];
              const last = (leaders || []).length - 1;
              return (
                <tr key={l.id} className={l.active ? '' : 'opacity-50 bg-slate-50'}>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <span className="w-5 text-center text-[13px] font-bold text-slate-700">{idx + 1}</span>
                      <div className="flex flex-col">
                        <button onClick={() => move(idx, 'up')} disabled={idx === 0 || busy === l.id} title="Lên trên" className="text-slate-400 hover:text-red-700 disabled:opacity-30 disabled:hover:text-slate-400"><ChevronUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => move(idx, 'down')} disabled={idx === last || busy === l.id} title="Xuống dưới" className="text-slate-400 hover:text-red-700 disabled:opacity-30 disabled:hover:text-slate-400"><ChevronDown className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2"><input className={input} value={row.full_name} onChange={(e) => change(l, 'full_name', e.target.value)} /></td>
                  <td className="px-3 py-2"><input className={input} value={row.position} onChange={(e) => change(l, 'position', e.target.value)} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <select className={input} value={row.leader_type} onChange={(e) => change(l, 'leader_type', e.target.value)}>
                        {Object.entries(LEADER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      {row.leader_type === 'ban' && (
                        <select className={input} value={row.ban_id || ''} onChange={(e) => change(l, 'ban_id', e.target.value)}>
                          <option value="">— Ban —</option>
                          {(bans || []).map((b) => <option key={b.id} value={b.id}>{b.short_name || b.name}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {dirty && (
                        <button onClick={() => save(l)} disabled={busy === l.id} title="Lưu thay đổi" className="p-1.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"><Save className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => toggleActive(l)} disabled={busy === l.id} title={l.active ? 'Ẩn khỏi lịch' : 'Hiện trên lịch'} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                        {l.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => remove(l)} disabled={busy === l.id} title="Xóa" className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
