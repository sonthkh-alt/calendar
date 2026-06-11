import { useEffect, useMemo, useState } from 'react';
import { UserCog, Save, Info } from 'lucide-react';
import { fetchProfiles, updateProfile } from '../lib/api';
import { ROLES } from '../lib/constants';

/**
 * Quản trị tài khoản: đặt vai trò, Ban theo dõi (cb_ban), lãnh đạo gắn (pct).
 * Tạo tài khoản mới: người dùng tự nhận magic link lần đầu (trigger tự tạo profile),
 * sau đó quản trị vào đây gán vai trò.
 */
export default function AdminUsers({ bans, leaders }) {
  const [profiles, setProfiles] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const { data } = await fetchProfiles();
    setProfiles(data || []);
  };
  useEffect(() => { load(); }, []);

  const pctLeaders = useMemo(() => (leaders || []).filter((l) => l.leader_type === 'pct'), [leaders]);

  const save = async (p, patch) => {
    setBusy(p.id); setMsg('');
    const { error } = await updateProfile(p.id, patch);
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    setMsg(`Đã cập nhật ${p.email}.`);
    load();
  };

  const toggleBan = (p, banId) => {
    const cur = p.ban_ids || [];
    const next = cur.includes(banId) ? cur.filter((x) => x !== banId) : [...cur, banId];
    save(p, { ban_ids: next });
  };

  const sel = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-[13px] text-sky-900 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-bold">Cấp tài khoản mới</p>
          <p className="mt-0.5">Hướng dẫn cán bộ mở trang đăng nhập → bấm <b>"Lần đầu đăng nhập"</b> → nhập email cơ quan → nhận liên kết kích hoạt → tạo mật khẩu. Tài khoản sẽ tự xuất hiện trong danh sách dưới đây với vai trò <b>Người xem</b>; quản trị gán vai trò phù hợp sau.</p>
        </div>
      </div>

      {msg && <p className="text-[13px] font-semibold text-emerald-700">{msg}</p>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-red-800 text-white text-[12px]">
              <th className="px-3 py-2.5 text-left font-bold">Tài khoản</th>
              <th className="px-3 py-2.5 text-left font-bold">Vai trò</th>
              <th className="px-3 py-2.5 text-left font-bold">Phân công</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-3 py-3">
                  <p className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5"><UserCog className="w-3.5 h-3.5 text-slate-400" /> {p.full_name || '(chưa đặt tên)'}</p>
                  <p className="text-[12px] text-slate-500">{p.email}</p>
                  {p.position && <p className="text-[12px] text-slate-500 italic">{p.position}</p>}
                </td>
                <td className="px-3 py-3">
                  <select value={p.role} disabled={busy === p.id} onChange={(e) => save(p, { role: e.target.value })} className={sel}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  {p.role === 'cb_ban' && (
                    <div className="flex flex-wrap gap-1.5">
                      {(bans || []).map((b) => (
                        <label key={b.id} className={`flex items-center gap-1 text-[12px] rounded-lg px-2 py-1 cursor-pointer border transition ${(p.ban_ids || []).includes(b.id) ? 'bg-red-50 border-red-300 text-red-900 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}>
                          <input type="checkbox" checked={(p.ban_ids || []).includes(b.id)} onChange={() => toggleBan(p, b.id)} disabled={busy === p.id} className="accent-red-700" />
                          {b.short_name || b.name}
                        </label>
                      ))}
                    </div>
                  )}
                  {p.role === 'pct' && (
                    <select value={p.leader_id || ''} disabled={busy === p.id} onChange={(e) => save(p, { leader_id: e.target.value || null })} className={sel}>
                      <option value="">— Gắn với lãnh đạo —</option>
                      {pctLeaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                    </select>
                  )}
                  {!['cb_ban', 'pct'].includes(p.role) && <span className="text-[12px] text-slate-400 italic">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
