import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { STATUS } from '../lib/constants';
import {
  getNotifSeen, setNotifSeen, notifSupported, notifPermission,
  requestNotifyPermission, showOsNotification,
} from '../lib/notifications';

/**
 * Chuông thông báo cho người phê duyệt: báo khi có thay đổi lịch (tạo / điều chỉnh /
 * sửa / duyệt / điều xe / xóa). Nguồn dữ liệu = activity_log (đã lọc theo quyền ở App).
 * - Huy hiệu số đếm "chưa đọc": mục có thời gian > mốc "đã xem". Bấm chuông -> đặt mốc
 *   "đã xem" = bây giờ -> huy hiệu biến mất.
 * - Mục mới đến (qua realtime) -> bắn thông báo HỆ ĐIỀU HÀNH ra ngoài màn hình.
 * props: profile, items (mảng activity_log đã lọc liên quan tới người này),
 *   onSelect (tùy chọn): bấm 1 mục -> mở chi tiết lịch tương ứng.
 */
const ACTION_TEXT = {
  create: 'Lịch mới',
  status: 'Cập nhật duyệt',
  vehicle: 'Điều xe',
  update: 'Chỉnh sửa lịch',
  delete: 'Xóa lịch',
};
const statusLabel = (c) => (c && STATUS[c]?.label) || c || '';
const ts = (x) => (x ? new Date(x).getTime() : 0);

function describe(a) {
  if (a.action === 'status') return `${statusLabel(a.old_status)} → ${statusLabel(a.new_status)}`;
  return a.summary || ACTION_TEXT[a.action] || a.action;
}

export default function NotificationBell({ profile, items, onSelect }) {
  const uid = profile?.id;
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => getNotifSeen(uid));
  const [perm, setPerm] = useState(() => notifPermission());
  const notifiedRef = useRef(null); // mốc 'at' (ms) đã bắn OS notification — null = chưa khởi tạo

  const sorted = useMemo(
    () => [...(items || [])].sort((a, b) => ts(b.at) - ts(a.at)),
    [items]
  );
  const unread = useMemo(
    () => sorted.filter((a) => ts(a.at) > ts(lastSeen)).length,
    [sorted, lastSeen]
  );

  // Đổi tài khoản -> nạp lại mốc đã xem của tài khoản đó
  useEffect(() => { setLastSeen(getNotifSeen(uid)); notifiedRef.current = null; }, [uid]);

  // Bắn thông báo HỆ ĐIỀU HÀNH cho mục MỚI đến (bỏ qua đợt tải đầu tiên để không spam)
  useEffect(() => {
    if (!sorted.length) return;
    const newest = ts(sorted[0].at);
    if (notifiedRef.current === null) { notifiedRef.current = newest; return; }
    if (newest > notifiedRef.current && perm === 'granted') {
      const fresh = sorted.filter((a) => ts(a.at) > notifiedRef.current);
      if (fresh.length) {
        const top = fresh[0];
        const title = fresh.length === 1
          ? (ACTION_TEXT[top.action] || 'Thay đổi lịch')
          : `${fresh.length} thay đổi lịch mới`;
        const body = fresh.length === 1
          ? `${top.content || ''}\n${describe(top)}`.trim()
          : (top.content || 'Có nhiều thay đổi cần xem');
        showOsNotification(title, { body, tag: 'lichcongtac-notify', renotify: true });
      }
    }
    notifiedRef.current = Math.max(notifiedRef.current, newest);
  }, [sorted, perm]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        const now = new Date().toISOString();
        setNotifSeen(uid, now); setLastSeen(now);
      }
      return next;
    });
  };

  const enable = async () => { const p = await requestNotifyPermission(); setPerm(p); };

  return (
    <div className="relative">
      <button onClick={toggle} title="Thông báo thay đổi lịch" className="relative p-2 rounded-lg bg-white/10 hover:bg-white/20 transition">
        {unread > 0 ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-red-900 text-[10px] font-bold flex items-center justify-center ring-2 ring-red-800">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[330px] max-w-[calc(100vw-1.5rem)] max-h-[72vh] overflow-y-auto bg-white rounded-xl shadow-2xl ring-1 ring-black/10 z-50 text-slate-800 animate-fadeUp">
            <div className="sticky top-0 bg-red-800 text-white px-4 py-2.5 flex items-center justify-between rounded-t-xl">
              <span className="font-bold text-sm flex items-center gap-1.5"><Bell className="w-4 h-4" /> Thông báo thay đổi lịch</span>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20"><X className="w-4 h-4" /></button>
            </div>

            {notifSupported() && perm !== 'granted' && (
              <button onClick={enable} className="w-full text-left px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-800 hover:bg-amber-100 transition">
                🔔 <b>Bật thông báo trên thiết bị</b> để nhận báo ra ngoài màn hình (kể cả khi đang ở tab/ứng dụng khác).
              </button>
            )}

            <ul className="divide-y divide-slate-100">
              {sorted.length === 0 && (
                <li className="px-4 py-6 text-center text-[13px] text-slate-400 italic">Chưa có thay đổi nào.</li>
              )}
              {sorted.slice(0, 50).map((a) => {
                const isNew = ts(a.at) > ts(lastSeen);
                const clickable = !!onSelect && a.action !== 'delete';
                const pick = () => { if (clickable) { onSelect(a); setOpen(false); } };
                return (
                  <li key={a.id}>
                    <button
                      type="button" onClick={pick} disabled={!clickable}
                      className={`w-full text-left px-4 py-2.5 ${isNew ? 'bg-amber-50/60' : ''} ${clickable ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-red-700 flex items-center gap-1">
                          {isNew && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                          {ACTION_TEXT[a.action] || a.action}
                        </span>
                        <span className="text-[11px] text-slate-400">{a.at ? format(new Date(a.at), 'HH:mm dd/MM', { locale: vi }) : ''}</span>
                      </div>
                      <p className="text-[13px] text-slate-800 font-medium mt-0.5 break-words">{a.content || '—'}</p>
                      <p className="text-[12px] text-slate-500">{describe(a)}</p>
                      {a.actor_email && <p className="text-[11px] text-slate-400 mt-0.5">bởi {a.actor_email}</p>}
                      {clickable && <p className="text-[11px] text-red-600 mt-0.5 font-medium">Bấm để xem chi tiết lịch →</p>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
