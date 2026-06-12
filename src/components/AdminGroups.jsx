import { useState } from 'react';
import { Plus, Save, Trash2, Info } from 'lucide-react';
import { upsertParticipantGroup, deleteParticipantGroup } from '../lib/api';
import { leaderLabel } from '../lib/constants';

/**
 * Quản trị NHÓM THÀNH PHẦN dự họp — tạo sẵn để cán bộ tick nhanh khi nhập lịch.
 * Mỗi nhóm: Tên nhóm (hiện trên ô tick) + Danh sách thành phần — soạn bằng cách
 * TICK theo danh sách lãnh đạo (tự chèn tên + chức vụ) hoặc gõ tự do. Chính các
 * lãnh đạo được tick này cũng là thành viên của nhóm khi chọn ở trường "Lãnh đạo".
 */

// Dải ô tick lãnh đạo: tick -> chèn vào chuỗi; bỏ tick -> gỡ khỏi chuỗi
function LeaderTicks({ leaders, value, onChange }) {
  const toggle = (l) => {
    const label = leaderLabel(l);
    if ((value || '').includes(label)) {
      onChange((value || '')
        .replace(label, '')
        .replace(/;\s*;/g, ';')
        .replace(/^\s*;\s*|\s*;\s*$/g, '')
        .trim());
    } else {
      const base = (value || '').trim();
      onChange(base ? base.replace(/;?\s*$/, '') + '; ' + label : label);
    }
  };
  return (
    <div className="flex flex-wrap gap-1 mb-1">
      {(leaders || []).filter((l) => l.active).map((l) => (
        <label key={l.id} title={leaderLabel(l)} className={`flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 cursor-pointer border transition ${(value || '').includes(leaderLabel(l)) ? 'bg-red-50 border-red-300 text-red-900 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:border-red-200'}`}>
          <input type="checkbox" checked={(value || '').includes(leaderLabel(l))} onChange={() => toggle(l)} className="accent-red-700 w-3 h-3" />
          {l.full_name}
        </label>
      ))}
    </div>
  );
}

export default function AdminGroups({ groups, leaders, onChanged }) {
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', members: '', sort_order: 99 });

  const change = (g, field, value) =>
    setEditing((prev) => ({ ...prev, [g.id]: { ...g, ...prev[g.id], [field]: value } }));

  const save = async (g) => {
    const row = editing[g.id];
    if (!row) return;
    setBusy(g.id);
    await upsertParticipantGroup({ ...row, sort_order: Number(row.sort_order) || 0 });
    setBusy(null);
    setEditing((prev) => { const n = { ...prev }; delete n[g.id]; return n; });
    onChanged?.();
  };

  const remove = async (g) => {
    if (!window.confirm(`Xóa nhóm "${g.name}"? (Không ảnh hưởng các lịch đã nhập)`)) return;
    setBusy(g.id);
    await deleteParticipantGroup(g.id);
    setBusy(null);
    onChanged?.();
  };

  const addNew = async () => {
    if (!draft.name.trim() || !draft.members.trim()) { alert('Nhập đủ Tên nhóm và Danh sách thành phần.'); return; }
    setBusy('new');
    await upsertParticipantGroup({
      name: draft.name.trim(), members: draft.members.trim(),
      sort_order: Number(draft.sort_order) || 99,
    });
    setBusy(null); setAdding(false);
    setDraft({ name: '', members: '', sort_order: 99 });
    onChanged?.();
  };

  const input = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400 w-full';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-[13px] text-sky-900 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Nhóm thành phần hiện thành các <b>ô tick</b> trong form nhập lịch. Tick lãnh đạo để soạn <b>Danh sách thành phần</b>. Khi nhập lịch, chọn nhóm ở ô <b>"Thành phần"</b> để chèn danh sách; hoặc chọn nhóm ngay ở trường <b>"Lãnh đạo"</b> — hệ thống tạo mục cho đúng các lãnh đạo trong danh sách và lịch ghi <b>theo tên nhóm</b>.</p>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 shadow">
          <Plus className="w-4 h-4" /> Thêm nhóm
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px] gap-2">
            <div><label className="text-[11px] font-bold text-slate-600">Tên nhóm</label><input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="VD: Lãnh đạo các Ban HĐND tỉnh" /></div>
            <div><label className="text-[11px] font-bold text-slate-600">Thứ tự</label><input type="number" className={input} value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} /></div>
          </div>
          <div><label className="text-[11px] font-bold text-slate-600">Danh sách thành phần (tick lãnh đạo để chèn nhanh, hoặc gõ tự do)</label>
            <div className="mt-1">
              <LeaderTicks leaders={leaders} value={draft.members} onChange={(v) => setDraft({ ...draft, members: v })} />
            </div>
            <textarea rows={2} className={`${input} resize-y`} value={draft.members} onChange={(e) => setDraft({ ...draft, members: e.target.value })} placeholder="Đ/c Nguyễn Văn A, Trưởng ban ...; Đ/c Trần Thị B, Phó ban ..." />
          </div>
          <div className="flex justify-end">
            <button onClick={addNew} disabled={busy === 'new'} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
              <Save className="w-4 h-4" /> Lưu nhóm
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-red-800 text-white text-[12px]">
              <th className="px-3 py-2.5 text-left font-bold w-[60px]">TT</th>
              <th className="px-3 py-2.5 text-left font-bold w-[220px]">Tên nhóm</th>
              <th className="px-3 py-2.5 text-left font-bold">Danh sách thành phần</th>
              <th className="px-3 py-2.5 text-center font-bold w-[110px]">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(groups || []).map((g) => {
              const row = editing[g.id] || g;
              const dirty = !!editing[g.id];
              return (
                <tr key={g.id} className="align-top">
                  <td className="px-3 py-2"><input type="number" className={`${input} !w-16 text-center`} value={row.sort_order ?? 0} onChange={(e) => change(g, 'sort_order', e.target.value)} /></td>
                  <td className="px-3 py-2"><input className={input} value={row.name} onChange={(e) => change(g, 'name', e.target.value)} /></td>
                  <td className="px-3 py-2">
                    <LeaderTicks leaders={leaders} value={row.members} onChange={(v) => change(g, 'members', v)} />
                    <textarea rows={2} className={`${input} resize-y`} value={row.members} onChange={(e) => change(g, 'members', e.target.value)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {dirty && (
                        <button onClick={() => save(g)} disabled={busy === g.id} title="Lưu" className="p-1.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"><Save className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => remove(g)} disabled={busy === g.id} title="Xóa" className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(groups || []).length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-slate-400 italic">Chưa có nhóm nào — bấm "Thêm nhóm" để tạo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
