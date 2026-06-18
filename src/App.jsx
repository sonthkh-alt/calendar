import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarRange, CalendarDays, CalendarClock, ClipboardCheck, Car, Settings,
  LogOut, LogIn, KeyRound, Loader2, Users, UserSquare2, ListChecks, DatabaseBackup, History, MapPin,
} from 'lucide-react';
import Login from './Login';
import SetPassword from './SetPassword';
import { supabase } from './lib/supabase';
import { getSession, onAuthChange, signOut, getMyProfile, isGuestEmail, signInWithPassword, GUEST } from './lib/auth';
import { fetchBans, fetchLeaders, fetchVehicles, fetchEntries, fetchParticipantGroups, fetchLocations, fetchProfiles, fetchActivityLog, recordLogin, deleteEntry, deleteEntries } from './lib/api';
import { weekStart, parseISO, toISODate } from './lib/dates';
import { BOOTSTRAP_ADMIN_EMAILS, UNIT_NAME, APP_NAME, ROLES, COMMON_LOCATIONS, DEMO_NOTICE, CONTACT_INFO } from './lib/constants';
import { canReview, canReviewEntry, canAssignVehicle, canAdmin, canEditEntry, canCreateFor } from './lib/permissions';
import FilterBar from './components/FilterBar';
import WeekView from './components/WeekView';
import MonthView from './components/MonthView';
import DayView from './components/DayView';
import ApprovalQueue from './components/ApprovalQueue';
import VehicleBoard from './components/VehicleBoard';
import AdminUsers from './components/AdminUsers';
import AdminLeaders from './components/AdminLeaders';
import AdminVehicles from './components/AdminVehicles';
import AdminGroups from './components/AdminGroups';
import AdminBackup from './components/AdminBackup';
import AdminLog from './components/AdminLog';
import AdminLoginLog from './components/AdminLoginLog';
import AdminLocations from './components/AdminLocations';
import ScheduleForm from './components/ScheduleForm';
import EntryDetail from './components/EntryDetail';
import DeviceSelect from './components/DeviceSelect';
import NotificationBell from './components/NotificationBell';

export default function App() {
  // ===== Phiên đăng nhập =====
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [showLogin, setShowLogin] = useState(false); // modal đăng nhập (khi đang là khách)

  useEffect(() => {
    let mounted = true;
    (async () => {
      let s = await getSession();
      // Chưa đăng nhập -> TỰ ĐĂNG NHẬP KHÁCH (chỉ xem) để vào thẳng trang chủ.
      // Nếu tài khoản khách chưa được tạo trên máy chủ -> để session null (hiện màn Login dự phòng).
      if (!s && supabase) {
        const { error } = await signInWithPassword(GUEST.email, GUEST.password);
        if (!error) s = await getSession();
      }
      if (mounted) { setSession(s); setBooting(false); }
    })();
    const off = onAuthChange((s) => setSession(s));
    return () => { mounted = false; off(); };
  }, []);

  // Đăng nhập thành công bằng tài khoản thật -> tự đóng modal đăng nhập
  useEffect(() => {
    if (showLogin && session && !isGuestEmail(session.user?.email)) setShowLogin(false);
  }, [showLogin, session]);

  // GHI NHẬT KÝ ĐĂNG NHẬP: 1 dòng cho mỗi phiên làm việc (bỏ qua tài khoản khách).
  // Chống ghi trùng bằng sessionStorage (đóng tab/mở lại = phiên mới = lần đăng nhập mới).
  useEffect(() => {
    if (!session || !profile) return;
    const email = session.user?.email || '';
    if (isGuestEmail(email)) return;
    const key = `login_logged_${session.user.id}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* bỏ qua */ }
    recordLogin({ user_id: session.user.id, email, full_name: profile.full_name || null, role: profile.role || null });
    try { sessionStorage.setItem(key, '1'); } catch { /* bỏ qua */ }
  }, [session, profile]);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    (async () => {
      const p = await getMyProfile();
      const email = session.user?.email || '';
      const isBootstrap = BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase());
      setProfile(p ? { ...p, role: isBootstrap ? 'quan_tri' : p.role } : { id: session.user.id, email, role: isBootstrap ? 'quan_tri' : 'nguoi_xem', ban_ids: [] });
    })();
  }, [session]);

  // ===== Dữ liệu =====
  const [tab, setTab] = useState('week'); // week | month | day | approve | vehicles | admin
  const [adminTab, setAdminTab] = useState('users');
  const [anchor, setAnchor] = useState(new Date());
  const [filters, setFilters] = useState({ banIds: [], leaderId: null, status: null });
  const [bans, setBans] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [pGroups, setPGroups] = useState([]);
  const [pLocations, setPLocations] = useState([]);
  const [pProfiles, setPProfiles] = useState([]); // hồ sơ tài khoản (để hiện người phê duyệt)
  const [entries, setEntries] = useState([]);
  const [activity, setActivity] = useState([]); // nhật ký thao tác (nguồn thông báo cho người duyệt)
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [duplicating, setDuplicating] = useState(null); // entry gốc khi nhân bản
  const [adjusting, setAdjusting] = useState(null); // entry đang ĐIỀU CHỈNH (người duyệt)
  const [prefill, setPrefill] = useState(null);
  const [viewing, setViewing] = useState(null); // entry đang xem chi tiết

  // ===== Khung hình theo thiết bị =====
  // deviceMode: 'auto' (theo màn hình) | 'desktop' | 'mobile'. Lưu localStorage.
  const [deviceMode, setDeviceMode] = useState(() => {
    try { return localStorage.getItem('deviceMode') || 'auto'; } catch { return 'auto'; }
  });
  const [viewportNarrow, setViewportNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = (e) => setViewportNarrow(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => { try { localStorage.setItem('deviceMode', deviceMode); } catch { /* bỏ qua */ } }, [deviceMode]);
  // Có hiển thị như điện thoại không (ép thủ công, hoặc auto + màn hẹp)
  const isMobile = deviceMode === 'mobile' || (deviceMode === 'auto' && viewportNarrow);
  // Mô phỏng khung điện thoại trên màn rộng (chọn "Điện thoại" khi đang dùng máy tính)
  const phoneFrame = deviceMode === 'mobile' && !viewportNarrow;

  // Khoảng nạp dữ liệu: CẢ NĂM chứa anchor — phục vụ cảnh báo trùng địa điểm
  // trong toàn năm (khối lượng dữ liệu văn phòng nhỏ nên vẫn nhẹ)
  const range = useMemo(() => ({
    from: `${anchor.getFullYear()}-01-01`,
    to: `${anchor.getFullYear()}-12-31`,
  }), [anchor]);

  const loadCatalogs = useCallback(async () => {
    const [b, l, v, g, loc, pr] = await Promise.all([fetchBans(), fetchLeaders(), fetchVehicles(), fetchParticipantGroups(), fetchLocations(), fetchProfiles()]);
    setBans(b.data || []); setLeaders(l.data || []); setVehicles(v.data || []); setPGroups(g.data || []); setPLocations(loc.data || []); setPProfiles(pr.data || []);
  }, []);

  // Tra cứu người phê duyệt theo id (reviewed_by) -> hiện chức vụ + họ tên trên chi tiết lịch
  const reviewerById = useMemo(
    () => Object.fromEntries((pProfiles || []).map((p) => [p.id, p])),
    [pProfiles]
  );

  // Tên địa điểm gợi ý (dùng cho ô gợi ý + bỏ qua cảnh báo trùng); rỗng -> mặc định
  const locationNames = useMemo(
    () => (pLocations.length ? pLocations.map((x) => x.name) : COMMON_LOCATIONS),
    [pLocations]
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchEntries(range.from, range.to);
    setEntries(data || []);
    setLoading(false);
  }, [range]);

  // Nhật ký thao tác -> nguồn thông báo. Chỉ người PHÊ DUYỆT mới cần (đỡ truy vấn thừa).
  const loadActivity = useCallback(async () => {
    if (!canReview(profile)) { setActivity([]); return; }
    const { data } = await fetchActivityLog(80);
    setActivity(data || []);
  }, [profile]);

  useEffect(() => { if (session && profile) loadCatalogs(); }, [session, profile, loadCatalogs]);
  useEffect(() => { if (session && profile) loadEntries(); }, [session, profile, loadEntries]);
  useEffect(() => { if (session && profile) loadActivity(); }, [session, profile, loadActivity]);

  // Realtime: tự cập nhật khi NGƯỜI KHÁC thay đổi lịch / danh mục (không cần tải lại trang).
  // Gom sự kiện trong 400ms để 1 thao tác nhiều dòng (vd tạo cả nhóm) chỉ refetch 1 lần.
  useEffect(() => {
    if (!supabase || !session || !profile) return undefined;
    let tE, tC;
    // Lịch đổi -> nạp lại cả entries lẫn nhật ký (để chuông thông báo cập nhật ngay)
    const bumpEntries = () => { clearTimeout(tE); tE = setTimeout(() => { loadEntries(); loadActivity(); }, 400); };
    const bumpCatalogs = () => { clearTimeout(tC); tC = setTimeout(() => loadCatalogs(), 400); };
    const ch = supabase
      .channel('rt-lichcongtac')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_entries' }, bumpEntries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaders' }, bumpCatalogs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, bumpCatalogs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participant_groups' }, bumpCatalogs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, bumpCatalogs)
      .subscribe();
    return () => { clearTimeout(tE); clearTimeout(tC); supabase.removeChannel(ch); };
  }, [session, profile, loadEntries, loadCatalogs, loadActivity]);

  const refresh = useCallback(() => { loadEntries(); }, [loadEntries]);

  // Bấm 1 thông báo -> mở CHI TIẾT lịch tương ứng (tra theo entry_id, dự phòng group_id).
  // Lịch đã xóa / ngoài phạm vi đang tải -> báo nhẹ.
  const onOpenActivity = useCallback((a) => {
    const ent = entries.find((e) => e.id === a.entry_id)
      || (a.group_id ? entries.find((e) => e.group_id === a.group_id) : null);
    if (ent) setViewing(ent);
    else alert('Lịch trong thông báo này không còn (có thể đã bị xóa) hoặc nằm ngoài phạm vi đang tải.');
  }, [entries]);

  // Đăng xuất tài khoản thật -> quay lại chế độ KHÁCH (vào thẳng trang chủ chỉ xem),
  // không rơi về màn đăng nhập.
  const handleSignOut = useCallback(async () => {
    await signOut();
    if (supabase) {
      const { error } = await signInWithPassword(GUEST.email, GUEST.password);
      if (!error) setSession(await getSession());
    }
  }, []);

  const onAdd = (pf) => { setEditing(null); setDuplicating(null); setAdjusting(null); setPrefill(pf || null); setFormOpen(true); };
  const onEdit = (entry) => { setEditing(entry); setDuplicating(null); setAdjusting(null); setPrefill(null); setFormOpen(true); };
  const onDuplicate = (entry) => { setEditing(null); setDuplicating(entry); setAdjusting(null); setPrefill(null); setFormOpen(true); };
  // Điều chỉnh (người duyệt): mở form đầy đủ như Sửa, lưu thành "đã điều chỉnh" + ghi chú
  const onAdjust = (entry) => { setEditing(null); setDuplicating(null); setAdjusting(entry); setPrefill(null); setFormOpen(true); };
  const canDup = (entry) => canCreateFor(profile, leaders.find((l) => l.id === entry.leader_id));
  const onDelete = async (entry) => {
    if (!window.confirm(`Xóa mục lịch "${entry.content}"?`)) return;
    const { error } = await deleteEntry(entry.id);
    if (error) { alert('Không xóa được: ' + error.message); return; }
    refresh();
  };
  // Xóa thẻ đã gộp nhiều mục (nhóm nhiều đơn vị cùng nội dung) — xóa tất cả
  const onDeleteMany = async (ids, content) => {
    if (!ids || ids.length <= 1) return onDelete({ id: ids?.[0], content });
    if (!window.confirm(`Xóa mục lịch "${content}" (gồm ${ids.length} đơn vị)?`)) return;
    const { error } = await deleteEntries(ids);
    if (error) { alert('Không xóa được: ' + error.message); return; }
    refresh();
  };

  const pendingCount = useMemo(() => {
    const lbi = Object.fromEntries(leaders.map((l) => [l.id, l]));
    return entries.filter((e) => e.status === 'cho_duyet' && canReviewEntry(profile, e, lbi[e.leader_id])).length;
  }, [entries, leaders, profile]);

  // Thông báo liên quan tới người phê duyệt: bỏ thao tác do CHÍNH MÌNH thực hiện;
  // Phó Trưởng Đoàn chỉ nhận thông báo lịch Đoàn ĐBQH (tra leader_type qua entry/group).
  const relevantActivity = useMemo(() => {
    if (!canReview(profile)) return [];
    const lbi = Object.fromEntries(leaders.map((l) => [l.id, l]));
    const entById = Object.fromEntries(entries.map((e) => [e.id, e]));
    const isDoan = (a) => {
      const ent = entById[a.entry_id] || (a.group_id ? entries.find((e) => e.group_id === a.group_id) : null);
      return ent ? lbi[ent.leader_id]?.leader_type === 'doan' : false;
    };
    return activity.filter((a) => {
      if (a.action === 'vehicle') return false; // KHÔNG thông báo việc điều xe
      if (a.actor_id && a.actor_id === profile.id) return false; // không tự báo việc mình làm
      if (profile.role === 'pho_truong_doan') return isDoan(a);
      return true; // pct / quan_tri: mọi thay đổi
    });
  }, [activity, entries, leaders, profile]);

  // CẢNH BÁO TRÙNG ĐỊA ĐIỂM: >= 2 nhóm/đoàn KHÁC NHAU tới CÙNG một địa điểm là
  // XÃ / PHƯỜNG / THỊ TRẤN (các địa điểm khác KHÔNG cảnh báo; bỏ qua danh mục
  // loại trừ và mục đã đặt dup_ignored). dupMap: id -> { severity, others }.
  //   - severity 'week' (ĐỎ): có nhóm khác cùng địa điểm trong CÙNG TUẦN.
  //   - severity 'year' (VÀNG): chỉ trùng ở tuần khác trong năm.
  const dupMap = useMemo(() => {
    const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    // Trích "đơn vị + TÊN xã/phường/thị trấn" từ địa điểm (bỏ phần mô tả xung quanh)
    // để các cách ghi KHÁC NHAU của CÙNG một xã vẫn gom chung. Ví dụ:
    // "Mỏ vật liệu xây dựng tại xã Biện Thượng" và "Xã Biện Thượng" -> "xã biện thượng".
    const communeKey = (loc) => {
      const m = norm(loc).match(/(?:^|[\s,.])(xã|phường|thị trấn)\s+([a-zà-ỹ]+(?:\s+[a-zà-ỹ]+){0,2})/u);
      if (!m) return null;
      const name = m[2].replace(/\s+(huyện|tỉnh|thành phố|thị xã)[\s\S]*$/u, '').trim();
      return `${m[1]} ${name}`;
    };
    const excludedCommunes = new Set(locationNames.map((n) => communeKey(n)).filter(Boolean));
    const leaderById = Object.fromEntries(leaders.map((l) => [l.id, l]));
    const eventKey = (e) => e.group_id || `${e.content}|${e.date}|${e.session}|${e.start_time || ''}`;
    const weekKey = (d) => { try { return toISODate(weekStart(parseISO(d))); } catch { return d; } };
    // Gom theo địa điểm (cả năm) -> các SỰ KIỆN khác nhau (1 sự kiện = 1 nhóm,
    // dù nhiều lãnh đạo cùng group_id -> không tự cảnh báo lẫn nhau)
    const byLoc = {};
    for (const e of entries) {
      if (e.status === 'tu_choi' || e.at_office || e.dup_ignored || !e.location) continue;
      const key = communeKey(e.location); // CHỈ cảnh báo địa điểm xã/phường/thị trấn
      if (!key || excludedCommunes.has(key)) continue;
      (byLoc[key] ||= new Map());
      const k = eventKey(e);
      let ev = byLoc[key].get(k);
      if (!ev) { ev = { date: e.date, week: weekKey(e.date), ids: [], names: new Set() }; byLoc[key].set(k, ev); }
      ev.ids.push(e.id);
      const nm = e.group_label || leaderById[e.leader_id]?.full_name;
      if (nm) ev.names.add(nm);
    }
    const map = new Map();
    for (const locN of Object.keys(byLoc)) {
      const events = [...byLoc[locN].values()];
      if (events.length < 2) continue; // chỉ 1 nhóm tại địa điểm -> không trùng
      for (const ev of events) {
        const others = events.filter((o) => o !== ev);
        const severity = others.some((o) => o.week === ev.week) ? 'week' : 'year';
        const list = others.map((o) => ({ date: o.date, name: [...o.names].join(', ') }));
        for (const id of ev.ids) map.set(id, { severity, others: list });
      }
    }
    return map;
  }, [entries, leaders, locationNames]);

  // ===== Các cổng vào =====
  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg bg-white rounded-2xl border border-amber-300 shadow-xl p-7 text-center">
          <p className="text-3xl mb-2">⚙️</p>
          <h1 className="text-lg font-extrabold text-slate-800">Chưa cấu hình máy chủ dữ liệu</h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Sao chép <b>.env.example</b> thành <b>.env</b> và điền <b>VITE_SUPABASE_URL</b>, <b>VITE_SUPABASE_ANON_KEY</b> từ
            Supabase Dashboard → Settings → API, sau đó chạy lại <b>npm run dev</b>.
          </p>
        </div>
      </div>
    );
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-700 animate-spin" />
      </div>
    );
  }

  if (!session) return <Login />;

  if (!session.user?.user_metadata?.pw_set && !isGuestEmail(session.user?.email)) {
    return <SetPassword unit={UNIT_NAME} email={session.user?.email} onDone={() => getMyProfile().then((p) => p && setProfile((prev) => ({ ...prev, ...p })))} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-700 animate-spin" />
      </div>
    );
  }

  // ===== Tabs theo vai trò =====
  const tabs = [
    { key: 'week', label: 'Lịch tuần', icon: CalendarRange },
    { key: 'month', label: 'Lịch tháng', icon: CalendarDays },
    { key: 'day', label: 'Lịch ngày', icon: CalendarClock },
    ...(canReview(profile) ? [{ key: 'approve', label: 'Chờ duyệt', icon: ClipboardCheck, badge: pendingCount }] : []),
    ...(canAssignVehicle(profile) ? [{ key: 'vehicles', label: 'Điều xe', icon: Car }] : []),
    ...(canAdmin(profile) ? [{ key: 'admin', label: 'Quản trị', icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen">
      {/* ===== Header ===== */}
      <header className="no-print relative bg-gradient-to-r from-[#6b1212] via-[#a51c1c] to-[#7f1d1d] text-white shadow-lg">
        <div className="absolute inset-0 tech-grid opacity-50" />
        <div className="relative max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/95 p-1.5 shadow-lg ring-2 ring-amber-300/60 shrink-0">
            <img src="/quoc-huy.svg" alt="Quốc huy" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-extrabold leading-tight aurora-text uppercase tracking-wide">{APP_NAME}</h1>
            <p className="text-[12px] text-red-100/90 truncate">{UNIT_NAME}</p>
          </div>
          <div className="shrink-0"><DeviceSelect value={deviceMode} onChange={setDeviceMode} /></div>
          {canReview(profile) && (
            <div className="shrink-0"><NotificationBell profile={profile} items={relevantActivity} onSelect={onOpenActivity} /></div>
          )}
          {isGuestEmail(profile.email) ? (
            // Chế độ KHÁCH (chỉ xem): nút Đăng nhập ở góc trên bên phải (mở modal)
            <button onClick={() => setShowLogin(true)} title="Đăng nhập" className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition text-[13px] font-semibold">
              <LogIn className="w-4 h-4" /> <span className="hidden sm:inline">Đăng nhập</span>
            </button>
          ) : (
            <>
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <p className="text-[13px] font-bold leading-tight">{profile.full_name || profile.email}</p>
                  <p className="text-[11px] text-amber-200">{ROLES[profile.role]}</p>
                </div>
                <button onClick={() => setShowChangePw(true)} title="Đổi mật khẩu" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"><KeyRound className="w-4 h-4" /></button>
                <button onClick={handleSignOut} title="Đăng xuất" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"><LogOut className="w-4 h-4" /></button>
              </div>
              <button onClick={handleSignOut} className="sm:hidden p-2 rounded-lg bg-white/10"><LogOut className="w-4 h-4" /></button>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="relative max-w-[1400px] mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-[13px] font-semibold whitespace-nowrap transition
                ${tab === t.key ? 'bg-[#eef2f7] text-red-800' : 'text-red-100 hover:bg-white/10'}`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
              {t.badge > 0 && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-red-900 text-[10px] font-bold flex items-center justify-center">{t.badge}</span>}
            </button>
          ))}
        </div>
      </header>

      {/* ===== Nội dung ===== */}
      <main className={phoneFrame
        ? 'max-w-[430px] mx-auto my-5 px-3 py-4 bg-slate-50 rounded-[28px] shadow-2xl ring-[6px] ring-slate-800/85'
        : 'max-w-[1400px] mx-auto px-4 py-4'}>
        {['week', 'month', 'day'].includes(tab) && (
          <FilterBar view={tab} anchor={anchor} onAnchor={setAnchor} bans={bans} leaders={leaders} filters={filters} onFilters={setFilters} />
        )}
        {['approve', 'vehicles'].includes(tab) && (
          <FilterBar view="week" anchor={anchor} onAnchor={setAnchor} bans={bans} leaders={leaders} filters={filters} onFilters={setFilters} />
        )}

        {loading && <p className="no-print text-[12px] text-slate-400 mb-2 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải dữ liệu...</p>}

        {tab === 'week' && (
          <WeekView profile={profile} anchor={anchor} entries={entries} leaders={leaders} bans={bans} vehicles={vehicles} groups={pGroups} filters={filters} dupMap={dupMap} isMobile={isMobile} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onDeleteMany={onDeleteMany} onDuplicate={onDuplicate} onView={setViewing} onChanged={refresh} />
        )}
        {tab === 'month' && (
          <MonthView profile={profile} anchor={anchor} entries={entries} leaders={leaders} filters={filters} onPickDay={(d) => { setAnchor(d); setTab('day'); }} />
        )}
        {tab === 'day' && (
          <DayView profile={profile} anchor={anchor} entries={entries} leaders={leaders} vehicles={vehicles} filters={filters} dupMap={dupMap} onEdit={onEdit} onDelete={onDelete} onDeleteMany={onDeleteMany} onDuplicate={onDuplicate} onView={setViewing} onChanged={refresh} />
        )}
        {tab === 'approve' && canReview(profile) && (
          <ApprovalQueue profile={profile} anchor={anchor} entries={entries} leaders={leaders} bans={bans} dupMap={dupMap} onChanged={refresh} />
        )}
        {tab === 'vehicles' && canAssignVehicle(profile) && (
          <VehicleBoard profile={profile} anchor={anchor} entries={entries} leaders={leaders} vehicles={vehicles} onChanged={refresh} />
        )}
        {tab === 'admin' && canAdmin(profile) && (
          <div>
            <div className="no-print flex gap-1 mb-3">
              {[
                { key: 'users', label: 'Tài khoản', icon: Users },
                { key: 'leaders', label: 'Lãnh đạo', icon: UserSquare2 },
                { key: 'vehicles', label: 'Xe công vụ', icon: Car },
                { key: 'groups', label: 'Nhóm thành phần', icon: ListChecks },
                { key: 'locations', label: 'Địa điểm', icon: MapPin },
                { key: 'log', label: 'Nhật ký', icon: History },
                { key: 'logins', label: 'Đăng nhập', icon: LogIn },
                { key: 'backup', label: 'Sao lưu', icon: DatabaseBackup },
              ].map((t) => (
                <button key={t.key} onClick={() => setAdminTab(t.key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition ${adminTab === t.key ? 'bg-red-700 text-white shadow' : 'bg-white/90 border border-slate-200 text-slate-600 hover:bg-red-50'}`}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>
            {adminTab === 'users' && <AdminUsers bans={bans} leaders={leaders} />}
            {adminTab === 'leaders' && <AdminLeaders leaders={leaders} bans={bans} onChanged={loadCatalogs} />}
            {adminTab === 'vehicles' && <AdminVehicles vehicles={vehicles} leaders={leaders} onChanged={loadCatalogs} />}
            {adminTab === 'groups' && <AdminGroups groups={pGroups} leaders={leaders} onChanged={loadCatalogs} />}
            {adminTab === 'locations' && <AdminLocations locations={pLocations} onChanged={loadCatalogs} />}
            {adminTab === 'log' && <AdminLog />}
            {adminTab === 'logins' && <AdminLoginLog />}
            {adminTab === 'backup' && <AdminBackup onRestored={() => { loadCatalogs(); loadEntries(); }} />}
          </div>
        )}
      </main>

      <footer className="no-print max-w-[1400px] mx-auto px-4 pb-5 text-center space-y-1">
        <p className="text-[12px] font-bold text-amber-700">{DEMO_NOTICE}</p>
        <p className="text-[11px] text-slate-500">{CONTACT_INFO}</p>
        <p className="text-[11px] text-slate-400">© {UNIT_NAME} — Hệ thống quản lý lịch công tác tuần</p>
      </footer>

      {/* Modal */}
      {formOpen && (
        <ScheduleForm
          profile={profile}
          leaders={leaders}
          entries={entries}
          groups={pGroups}
          locations={locationNames}
          editing={editing}
          duplicating={duplicating}
          adjusting={adjusting}
          prefill={prefill}
          onClose={() => { setFormOpen(false); setEditing(null); setDuplicating(null); setAdjusting(null); setPrefill(null); }}
          onSaved={refresh}
        />
      )}
      {viewing && (
        <EntryDetail
          entry={viewing}
          entries={entries}
          leaders={leaders}
          vehicles={vehicles}
          profile={profile}
          reviewer={reviewerById[viewing.reviewed_by]}
          onChanged={refresh}
          canEdit={canEditEntry(profile, viewing, leaders.find((l) => l.id === viewing.leader_id))}
          canDuplicate={canDup(viewing)}
          dupInfo={dupMap.get(viewing.id)}
          onEdit={onEdit}
          onAdjust={onAdjust}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onClose={() => setViewing(null)}
        />
      )}
      {showChangePw && <SetPassword mode="change" onClose={() => setShowChangePw(false)} onDone={() => setTimeout(() => setShowChangePw(false), 1200)} />}
      {showLogin && <Login onClose={() => setShowLogin(false)} />}
    </div>
  );
}
