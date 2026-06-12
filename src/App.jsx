import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarRange, CalendarDays, CalendarClock, ClipboardCheck, Car, Settings,
  LogOut, KeyRound, Loader2, Users, UserSquare2, ListChecks, DatabaseBackup,
} from 'lucide-react';
import Login from './Login';
import SetPassword from './SetPassword';
import { supabase } from './lib/supabase';
import { getSession, onAuthChange, signOut, getMyProfile, isGuestEmail } from './lib/auth';
import { fetchBans, fetchLeaders, fetchVehicles, fetchEntries, fetchParticipantGroups, deleteEntry, deleteEntries } from './lib/api';
import { BOOTSTRAP_ADMIN_EMAILS, UNIT_NAME, APP_NAME, ROLES, COMMON_LOCATIONS } from './lib/constants';
import { canReview, canAssignVehicle, canAdmin, canEditEntry, canCreateFor } from './lib/permissions';
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
import ScheduleForm from './components/ScheduleForm';
import EntryDetail from './components/EntryDetail';
import DeviceSelect from './components/DeviceSelect';

export default function App() {
  // ===== Phiên đăng nhập =====
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [showChangePw, setShowChangePw] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await getSession();
      if (mounted) { setSession(s); setBooting(false); }
    })();
    const off = onAuthChange((s) => setSession(s));
    return () => { mounted = false; off(); };
  }, []);

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
  const [filters, setFilters] = useState({ banId: null, leaderId: null, status: null });
  const [bans, setBans] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [pGroups, setPGroups] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [duplicating, setDuplicating] = useState(null); // entry gốc khi nhân bản
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
    const [b, l, v, g] = await Promise.all([fetchBans(), fetchLeaders(), fetchVehicles(), fetchParticipantGroups()]);
    setBans(b.data || []); setLeaders(l.data || []); setVehicles(v.data || []); setPGroups(g.data || []);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchEntries(range.from, range.to);
    setEntries(data || []);
    setLoading(false);
  }, [range]);

  useEffect(() => { if (session && profile) loadCatalogs(); }, [session, profile, loadCatalogs]);
  useEffect(() => { if (session && profile) loadEntries(); }, [session, profile, loadEntries]);

  const refresh = useCallback(() => { loadEntries(); }, [loadEntries]);

  const onAdd = (pf) => { setEditing(null); setDuplicating(null); setPrefill(pf || null); setFormOpen(true); };
  const onEdit = (entry) => { setEditing(entry); setDuplicating(null); setPrefill(null); setFormOpen(true); };
  const onDuplicate = (entry) => { setEditing(null); setDuplicating(entry); setPrefill(null); setFormOpen(true); };
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

  const pendingCount = useMemo(() => entries.filter((e) => e.status === 'cho_duyet').length, [entries]);

  // CẢNH BÁO TRÙNG ĐỊA ĐIỂM trong CẢ NĂM: >= 2 lịch của các Ban tới cùng một
  // địa điểm (bỏ qua địa điểm mặc định) -> dupMap: id -> danh sách mục trùng
  // kèm ngày tháng + đơn vị, để người duyệt biết chi tiết và cân nhắc gộp đoàn.
  const dupMap = useMemo(() => {
    const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const commonSet = new Set(COMMON_LOCATIONS.map(norm));
    const leaderById = Object.fromEntries(leaders.map((l) => [l.id, l]));
    const groups = {};
    for (const e of entries) {
      if (e.status === 'tu_choi' || !e.location) continue;
      if (leaderById[e.leader_id]?.leader_type !== 'ban') continue;
      // Lịch nhập theo NHÓM (chọn nhanh theo nhóm) là chủ đích -> không tính trùng địa điểm
      if (e.group_label) continue;
      const loc = norm(e.location);
      if (commonSet.has(loc)) continue;
      (groups[loc] ||= []).push(e);
    }
    // CHỈ tính là trùng khi có >= 2 SỰ KIỆN KHÁC NHAU cùng địa điểm. Một sự kiện
    // có nhiều lãnh đạo Ban -> nhiều dòng cùng group_id (nội dung+ngày+buổi) =>
    // KHÔNG tự cảnh báo lẫn nhau.
    const eventKey = (e) => e.group_id || `${e.content}|${e.date}|${e.session}|${e.start_time || ''}`;
    const map = new Map();
    for (const g of Object.values(groups)) {
      // Gom các dòng theo sự kiện
      const events = new Map();
      for (const e of g) {
        const k = eventKey(e);
        if (!events.has(k)) events.set(k, { date: e.date, names: [], ids: [] });
        const ev = events.get(k);
        ev.ids.push(e.id);
        const nm = leaderById[e.leader_id]?.full_name;
        if (nm && !ev.names.includes(nm)) ev.names.push(nm);
      }
      const eventList = [...events.values()];
      if (eventList.length < 2) continue; // chỉ 1 sự kiện tại địa điểm này -> không trùng
      for (const e of g) {
        const others = eventList
          .filter((ev) => !ev.ids.includes(e.id))
          .map((ev) => ({ date: ev.date, name: ev.names.join(', ') }));
        if (others.length) map.set(e.id, others);
      }
    }
    return map;
  }, [entries, leaders]);

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
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-[13px] font-bold leading-tight">{profile.full_name || profile.email}</p>
              <p className="text-[11px] text-amber-200">{ROLES[profile.role]}</p>
            </div>
            {!isGuestEmail(profile.email) && (
              <button onClick={() => setShowChangePw(true)} title="Đổi mật khẩu" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"><KeyRound className="w-4 h-4" /></button>
            )}
            <button onClick={signOut} title="Đăng xuất" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"><LogOut className="w-4 h-4" /></button>
          </div>
          <button onClick={signOut} className="sm:hidden p-2 rounded-lg bg-white/10"><LogOut className="w-4 h-4" /></button>
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
          <WeekView profile={profile} anchor={anchor} entries={entries} leaders={leaders} bans={bans} vehicles={vehicles} groups={pGroups} filters={filters} dupMap={dupMap} isMobile={isMobile} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onDeleteMany={onDeleteMany} onDuplicate={onDuplicate} onView={setViewing} />
        )}
        {tab === 'month' && (
          <MonthView profile={profile} anchor={anchor} entries={entries} leaders={leaders} filters={filters} onPickDay={(d) => { setAnchor(d); setTab('day'); }} />
        )}
        {tab === 'day' && (
          <DayView profile={profile} anchor={anchor} entries={entries} leaders={leaders} vehicles={vehicles} filters={filters} dupMap={dupMap} onEdit={onEdit} onDelete={onDelete} onDeleteMany={onDeleteMany} onDuplicate={onDuplicate} onView={setViewing} />
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
            {adminTab === 'backup' && <AdminBackup onRestored={() => { loadCatalogs(); loadEntries(); }} />}
          </div>
        )}
      </main>

      <footer className="no-print max-w-[1400px] mx-auto px-4 pb-5 text-center text-[11px] text-slate-400">
        © {UNIT_NAME} — Hệ thống quản lý lịch công tác tuần
      </footer>

      {/* Modal */}
      {formOpen && (
        <ScheduleForm
          profile={profile}
          leaders={leaders}
          entries={entries}
          groups={pGroups}
          editing={editing}
          duplicating={duplicating}
          prefill={prefill}
          onClose={() => { setFormOpen(false); setEditing(null); setDuplicating(null); setPrefill(null); }}
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
          onChanged={refresh}
          canEdit={canEditEntry(profile, viewing, leaders.find((l) => l.id === viewing.leader_id))}
          canDuplicate={canDup(viewing)}
          dupOthers={dupMap.get(viewing.id)}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onClose={() => setViewing(null)}
        />
      )}
      {showChangePw && <SetPassword mode="change" onClose={() => setShowChangePw(false)} onDone={() => setTimeout(() => setShowChangePw(false), 1200)} />}
    </div>
  );
}
