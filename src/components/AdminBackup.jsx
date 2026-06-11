import { useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { backupAll, restoreAll } from '../lib/api';

/**
 * Sao lưu / Phục hồi toàn bộ dữ liệu (chỉ Quản trị).
 * - Sao lưu: tải file .json chứa Ban, lãnh đạo, xe, nhóm thành phần, lịch, phân quyền.
 * - Phục hồi: chọn file .json đã sao lưu -> XÓA dữ liệu hiện tại và nạp lại từ file.
 */
export default function AdminBackup({ onRestored }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(null); // 'backup' | 'restore'
  const [msg, setMsg] = useState(null);   // { ok, text }

  const doBackup = async () => {
    setBusy('backup'); setMsg(null);
    const { data, error } = await backupAll();
    setBusy(null);
    if (error) { setMsg({ ok: false, text: 'Không sao lưu được: ' + error.message }); return; }
    const counts = Object.entries(data.data).map(([t, rows]) => `${t}: ${rows.length}`).join(', ');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', 'h');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lich-cong-tac-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg({ ok: true, text: `Đã tải bản sao lưu (${counts}). Hãy cất file ở nơi an toàn (ổ cứng, USB, Drive...).` });
  };

  const doRestore = async (file) => {
    if (!file) return;
    setMsg(null);
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setMsg({ ok: false, text: 'Tệp không đọc được — không phải file sao lưu .json hợp lệ.' });
      return;
    }
    const d = payload?.data || {};
    const summary = `Bản sao lưu lúc ${payload?.exported_at ? new Date(payload.exported_at).toLocaleString('vi-VN') : '(không rõ)'}:\n` +
      `- ${d.leaders?.length || 0} lãnh đạo/đơn vị · ${d.schedule_entries?.length || 0} mục lịch\n` +
      `- ${d.vehicles?.length || 0} xe · ${d.participant_groups?.length || 0} nhóm thành phần · ${d.bans?.length || 0} Ban`;
    const ok = window.confirm(
      `⚠️ PHỤC HỒI DỮ LIỆU\n\n${summary}\n\nTOÀN BỘ dữ liệu hiện tại sẽ bị XÓA và thay bằng nội dung file này.\nNên bấm "Tải bản sao lưu" trước để giữ lại bản hiện tại.\n\nTiếp tục phục hồi?`
    );
    if (!ok) return;
    setBusy('restore');
    const { error } = await restoreAll(payload);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: 'Phục hồi thất bại: ' + error.message }); return; }
    setMsg({ ok: true, text: 'Phục hồi thành công! Dữ liệu đã được nạp lại từ bản sao lưu.' });
    onRestored?.();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <h3 className="flex items-center gap-2 font-bold text-slate-800 text-[15px]"><DatabaseBackup className="w-5 h-5 text-red-700" /> Sao lưu dữ liệu</h3>
        <p className="text-[13px] text-slate-600 mt-1.5 leading-relaxed">
          Tải về một file <b>.json</b> chứa toàn bộ: danh sách Ban, lãnh đạo, xe công vụ, nhóm thành phần,
          lịch công tác và phân quyền tài khoản. Nên sao lưu định kỳ (vd: chiều thứ Sáu sau khi chốt lịch tuần).
        </p>
        <button onClick={doBackup} disabled={busy} className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 disabled:opacity-60 shadow">
          {busy === 'backup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Tải bản sao lưu (.json)
        </button>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50/60 shadow-sm p-5">
        <h3 className="flex items-center gap-2 font-bold text-amber-900 text-[15px]"><Upload className="w-5 h-5" /> Phục hồi từ bản sao lưu</h3>
        <p className="text-[13px] text-amber-900/90 mt-1.5 leading-relaxed">
          Chọn file .json đã sao lưu để nạp lại. <b>Toàn bộ dữ liệu hiện tại sẽ bị thay thế</b> —
          hệ thống sẽ hỏi xác nhận trước khi thực hiện. Tài khoản đăng nhập không bị ảnh hưởng
          (chỉ khôi phục vai trò/phân công cho các email đang tồn tại).
        </p>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { doRestore(e.target.files?.[0]); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 shadow">
          {busy === 'restore' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Chọn file & phục hồi
        </button>
      </div>

      {msg && (
        <p className={`flex items-start gap-2 text-[13px] font-semibold rounded-xl border p-3 ${msg.ok ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-rose-800 bg-rose-50 border-rose-200'}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />} {msg.text}
        </p>
      )}
    </div>
  );
}
