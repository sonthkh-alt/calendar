import { useState } from 'react';
import { Plus, Save, Trash2, Car } from 'lucide-react';
import { upsertVehicle, deleteVehicle } from '../lib/api';
import { VEHICLE_TYPES } from '../lib/constants';

/**
 * Quản trị danh sách xe: biển số, lái xe, SĐT, loại (riêng/dùng chung), PCT gắn.
 */
export default function AdminVehicles({ vehicles, leaders, onChanged }) {
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ plate: '', driver_name: '', driver_phone: '', vehicle_type: 'dung_chung', assigned_leader_id: '' });

  const pctLeaders = (leaders || []).filter((l) => l.leader_type === 'pct');

  const change = (v, field, value) =>
    setEditing((prev) => ({ ...prev, [v.id]: { ...v, ...prev[v.id], [field]: value } }));

  const save = async (v) => {
    const row = editing[v.id];
    if (!row) return;
    setBusy(v.id);
    await upsertVehicle({ ...row, assigned_leader_id: row.vehicle_type === 'rieng' ? (row.assigned_leader_id || null) : null });
    setBusy(null);
    setEditing((prev) => { const n = { ...prev }; delete n[v.id]; return n; });
    onChanged?.();
  };

  const remove = async (v) => {
    if (!window.confirm(`Xóa xe ${v.plate}?`)) return;
    setBusy(v.id);
    const { error } = await deleteVehicle(v.id);
    setBusy(null);
    if (error) { alert('Không xóa được (xe đang được gán cho lịch): ' + error.message); return; }
    onChanged?.();
  };

  const addNew = async () => {
    if (!draft.plate.trim()) { alert('Nhập biển số xe.'); return; }
    setBusy('new');
    await upsertVehicle({
      plate: draft.plate.trim(), driver_name: draft.driver_name.trim() || null,
      driver_phone: draft.driver_phone.trim() || null, vehicle_type: draft.vehicle_type,
      assigned_leader_id: draft.vehicle_type === 'rieng' ? (draft.assigned_leader_id || null) : null,
      active: true,
    });
    setBusy(null); setAdding(false);
    setDraft({ plate: '', driver_name: '', driver_phone: '', vehicle_type: 'dung_chung', assigned_leader_id: '' });
    onChanged?.();
  };

  const input = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400 w-full';

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 shadow">
          <Plus className="w-4 h-4" /> Thêm xe
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
          <div><label className="text-[11px] font-bold text-slate-600">Biển số</label><input className={input} value={draft.plate} onChange={(e) => setDraft({ ...draft, plate: e.target.value })} placeholder="36A-..." /></div>
          <div><label className="text-[11px] font-bold text-slate-600">Lái xe</label><input className={input} value={draft.driver_name} onChange={(e) => setDraft({ ...draft, driver_name: e.target.value })} /></div>
          <div><label className="text-[11px] font-bold text-slate-600">SĐT lái xe</label><input className={input} value={draft.driver_phone} onChange={(e) => setDraft({ ...draft, driver_phone: e.target.value })} /></div>
          <div>
            <label className="text-[11px] font-bold text-slate-600">Loại xe</label>
            <select className={input} value={draft.vehicle_type} onChange={(e) => setDraft({ ...draft, vehicle_type: e.target.value })}>
              {Object.entries(VEHICLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600">Phục vụ PCT</label>
            <select className={input} disabled={draft.vehicle_type !== 'rieng'} value={draft.assigned_leader_id} onChange={(e) => setDraft({ ...draft, assigned_leader_id: e.target.value })}>
              <option value="">— Chọn —</option>
              {pctLeaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
            </select>
          </div>
          <button onClick={addNew} disabled={busy === 'new'} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
            <Save className="w-4 h-4" /> Lưu
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="bg-red-800 text-white text-[12px]">
              <th className="px-3 py-2.5 text-left font-bold">Biển số</th>
              <th className="px-3 py-2.5 text-left font-bold">Lái xe</th>
              <th className="px-3 py-2.5 text-left font-bold">SĐT</th>
              <th className="px-3 py-2.5 text-left font-bold">Loại / Phục vụ</th>
              <th className="px-3 py-2.5 text-center font-bold w-[110px]">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(vehicles || []).map((v) => {
              const row = editing[v.id] || v;
              const dirty = !!editing[v.id];
              return (
                <tr key={v.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Car className={`w-4 h-4 shrink-0 ${row.vehicle_type === 'rieng' ? 'text-red-700' : 'text-sky-600'}`} />
                      <input className={input} value={row.plate} onChange={(e) => change(v, 'plate', e.target.value)} />
                    </div>
                  </td>
                  <td className="px-3 py-2"><input className={input} value={row.driver_name || ''} onChange={(e) => change(v, 'driver_name', e.target.value)} /></td>
                  <td className="px-3 py-2"><input className={input} value={row.driver_phone || ''} onChange={(e) => change(v, 'driver_phone', e.target.value)} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <select className={input} value={row.vehicle_type} onChange={(e) => change(v, 'vehicle_type', e.target.value)}>
                        {Object.entries(VEHICLE_TYPES).map(([k, val]) => <option key={k} value={k}>{val}</option>)}
                      </select>
                      {row.vehicle_type === 'rieng' && (
                        <select className={input} value={row.assigned_leader_id || ''} onChange={(e) => change(v, 'assigned_leader_id', e.target.value)}>
                          <option value="">— PCT —</option>
                          {pctLeaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {dirty && (
                        <button onClick={() => save(v)} disabled={busy === v.id} title="Lưu" className="p-1.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"><Save className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => remove(v)} disabled={busy === v.id} title="Xóa" className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
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
