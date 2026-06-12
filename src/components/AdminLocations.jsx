import { useState } from 'react';
import { Plus, Save, Trash2, MapPin, Info, ArrowUp, ArrowDown } from 'lucide-react';
import { upsertLocation, deleteLocation } from '../lib/api';

/**
 * Quản trị ĐỊA ĐIỂM GỢI Ý: thêm/sửa/xóa + đổi thứ tự.
 * Dùng cho ô gợi ý khi nhập Địa điểm; đồng thời các địa điểm này được BỎ QUA
 * khi cảnh báo trùng địa điểm (nơi công cộng nhiều đơn vị hay tới).
 */
export default function AdminLocations({ locations, onChanged }) {
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const list = [...(locations || [])];
  const change = (l, value) => setEditing((p) => ({ ...p, [l.id]: { ...l, ...p[l.id], name: value } }));

  const save = async (l) => {
    const row = editing[l.id];
    if (!row || !row.name.trim()) return;
    setBusy(l.id);
    await upsertLocation({ ...row, name: row.name.trim() });
    setBusy(null);
    setEditing((p) => { const n = { ...p }; delete n[l.id]; return n; });
    onChanged?.();
  };

  const remove = async (l) => {
    if (!window.confirm(`Xóa địa điểm gợi ý "${l.name}"?`)) return;
    setBusy(l.id);
    await deleteLocation(l.id);
    setBusy(null);
    onChanged?.();
  };

  const addNew = async () => {
    if (!draft.trim()) { alert('Nhập tên địa điểm.'); return; }
    setBusy('new');
    const maxSort = list.reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
    await upsertLocation({ name: draft.trim(), sort_order: maxSort + 1 });
    setBusy(null); setAdding(false); setDraft('');
    onChanged?.();
  };

  // Hoán đổi thứ tự với hàng kề
  const swap = async (i, j) => {
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    setBusy(a.id);
    await upsertLocation({ ...a, sort_order: b.sort_order ?? j });
    await upsertLocation({ ...b, sort_order: a.sort_order ?? i });
    setBusy(null);
    onChanged?.();
  };

  const input = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400 w-full';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-[13px] text-sky-900 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Các địa điểm này hiện thành <b>gợi ý</b> khi nhập Địa điểm (vẫn gõ tự do được), và được <b>bỏ qua khi cảnh báo trùng địa điểm</b> (nơi công cộng nhiều đơn vị hay tới).</p>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 shadow">
          <Plus className="w-4 h-4" /> Thêm địa điểm
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 flex items-end gap-2">
          <div className="flex-1"><label className="text-[11px] font-bold text-slate-600">Tên địa điểm</label>
            <input className={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="VD: UBND huyện Thọ Xuân" onKeyDown={(e) => e.key === 'Enter' && addNew()} />
          </div>
          <button onClick={addNew} disabled={busy === 'new'} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
            <Save className="w-4 h-4" /> Lưu
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="bg-red-800 text-white text-[12px]">
              <th className="px-3 py-2.5 text-left font-bold w-[70px]">TT</th>
              <th className="px-3 py-2.5 text-left font-bold">Tên địa điểm</th>
              <th className="px-3 py-2.5 text-center font-bold w-[150px]">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((l, i) => {
              const row = editing[l.id] || l;
              const dirty = !!editing[l.id];
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[13px] font-semibold text-slate-500 w-5 text-center">{i + 1}</span>
                      <button onClick={() => swap(i, i - 1)} disabled={i === 0 || busy} title="Lên" className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => swap(i, i + 1)} disabled={i === list.length - 1 || busy} title="Xuống" className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <input className={input} value={row.name} onChange={(e) => change(l, e.target.value)} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {dirty && (
                        <button onClick={() => save(l)} disabled={busy === l.id} title="Lưu" className="p-1.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"><Save className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => remove(l)} disabled={busy === l.id} title="Xóa" className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px] text-slate-400 italic">Chưa có địa điểm nào — bấm "Thêm địa điểm".</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
