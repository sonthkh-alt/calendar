import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarRange, CalendarDays, CalendarClock, ClipboardCheck, Car, Settings,
  LogOut, KeyRound, Loader2, Users, UserSquare2, ListChecks, DatabaseBackup,
} from 'lucide-react';
import Login from './Login';
import SetPassword from './SetPassword';
import { supabase } from './lib/supabase';
import { getSession, onAuthChange, signOut, getMyProfile, isGuestEmail } from './lib/auth';
import { fetchBans, fetchLeaders, fetchVehicles, fetchEntries, fetchParticipantGroups, deleteEntry } from './lib/api';
import { BOOTSTRAP_ADMIN_EMAILS, UNIT_NAME, APP_NAME, ROLES } from './lib/constants';
import { toISODate, weekStart, weekEnd, startOfMonth, endOfMonth } from './lib/dates';
import { canReview, canAssignVehicle, canAdmin, canEditEntry } from './lib/permissions';
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
  const [prefill, setPrefill] = useState(null);
  const [viewing, setViewing] = useState(null); // entry đang xem chi tiết

  // Khoảng nạp dữ liệu: phủ lưới tháng chứa anchor (luôn chứa tuần & ngày đang xem)
  const range = useMemo(() => ({
    from: toISODate(weekStart(startOfMonth(anchor))),
    to: toISODate(weekEnd(endOfMonth(anchor))),
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

  const onAdd = (pf) => { setEditing(null); setPrefill(pf || null); setFormOpen(true); };
  const onEdit = (entry) => { setEditing(entry); setPrefill(null); setFormOpen(true); };
  const onDelete = async (entry) => {
    if (!window.confirm(`Xóa mục lịch "${entry.content}"?`)) return;
    const { error } = await deleteEntry(entry.id);
    if (error) { alert('Không xóa được: ' + error.message); return; }
    refresh();
  };

  const pendingCount = useMemo(() => entries.filter((e) => e.status === 'cho_duyet').length, [entries]);

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
      <main className="max-w-[1400px] mx-auto px-4 py-4">
        {['week', 'month', 'day'].includes(tab) && (
          <FilterBar view={tab} anchor={anchor} onAnchor={setAnchor} bans={bans} leaders={leaders} filters={filters} onFilters={setFilters} />
        )}
        {['approve', 'vehicles'].includes(tab) && (
          <FilterBar view="week" anchor={anchor} onAnchor={setAnchor} bans={bans} leaders={leaders} filters={filters} onFilters={setFilters} />
        )}

        {loading && <p className="no-print text-[12px] text-slate-400 mb-2 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải dữ liệu...</p>}

        {tab === 'week' && (
          <WeekView profile={profile} anchor={anchor} entries={entries} leaders={leaders} bans={bans} vehicles={vehicles} filters={filters} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onView={setViewing} />
        )}
        {tab === 'month' && (
          <MonthView profile={profile} anchor={anchor} entries={entries} leaders={leaders} filters={filters} onPickDay={(d) => { setAnchor(d); setTab('day'); }} />
        )}
        {tab === 'day' && (
          <DayView profile={profile} anchor={anchor} entries={entries} leaders={leaders} vehicles={vehicles} filters={filters} onEdit={onEdit} onDelete={onDelete} onView={setViewing} />
        )}
        {tab === 'approve' && canReview(profile) && (
          <ApprovalQueue profile={profile} anchor={anchor} entries={entries} leaders={leaders} bans={bans} onChanged={refresh} />
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
            {adminTab === 'groups' && <AdminGroups groups={pGroups} onChanged={loadCatalogs} />}
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
          prefill={prefill}
          onClose={() => { setFormOpen(false); setEditing(null); setPrefill(null); }}
          onSaved={refresh}
        />
      )}
      {viewing && (
        <EntryDetail
          entry={viewing}
          entries={entries}
          leaders={leaders}
          vehicles={vehicles}
          canEdit={canEditEntry(profile, viewing, leaders.find((l) => l.id === viewing.leader_id))}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={() => setViewing(null)}
        />
      )}
      {showChangePw && <SetPassword mode="change" onClose={() => setShowChangePw(false)} onDone={() => setTimeout(() => setShowChangePw(false), 1200)} />}
    </div>
  );
}
