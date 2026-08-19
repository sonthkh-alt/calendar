import { useMemo, useState } from 'react';
import { X, Clock, MapPin, Users, Car, MessageSquareText, Pencil, Trash2, Building2, Copy, Check, XCircle, Zap, SlidersHorizontal, UserCheck, ShieldCheck, Printer, FileDown, Upload, FileCheck2, Loader2 } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { SESSIONS, UNIT_NAME, UNIT_GROUP_LABELS, isHqLocation, hidesDriver, VEHICLE_STATUS, VEHICLE_SLIP, DEFAULT_DEPARTURE, isPrivateVehicle } from '../lib/constants';
import { fmtTime, fmtDMY, dayName, parseISO, sessionsOverlap, fmtDM } from '../lib/dates';
import { canReviewEntry, canAssignVehicle, entryNeedsVehicleOk, canAdmin, canApproveVehicle, canDispatchPrivateVehicle, canPrintVehicleSlip } from '../lib/permissions';
import { reviewEntries, updateEntries, uploadSignedSlip, getSignedSlipUrl } from '../lib/api';
import { printVehicleSlip, makeSignCode } from '../lib/vehicleSlip';
import { buildSlipPayload, digitalSignInfo, chairLeaderOf, slipVehiclesOf } from '../lib/vehicleSlipData';
import { downloadVehicleSlipPdf, getVehicleSlipPdfBlob, vehicleSlipFileName } from '../lib/vehicleSlipPdf';
import { probeAgent, signPdfViaAgent, signingCertInfo } from '../lib/signAgent';

/**
 * Modal chi tiết 1 mục lịch — hiển thị ĐẦY ĐỦ, không cắt chữ.
 * Các mục TRÙNG nội dung + thời gian được GỘP: thành phần nối lại với nhau.
 * Khu "Xử lý nhanh": Duyệt/Từ chối (PCT, Quản trị) + chọn xe (Văn phòng, Quản trị).
 */
export default function EntryDetail({ entry, entries, leaders, vehicles, profiles, profile, reviewer, canEdit, canDuplicate, dupInfo, onEdit, onAdjust, onDelete, onDuplicate, onChanged, onClose }) {
  const dupOthers = dupInfo?.others;
  const dupWeek = dupInfo?.severity === 'week';
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [signBusy, setSignBusy] = useState(false); // đang tạo PDF / tải tệp ký số
  const [signStep, setSignStep] = useState('');    // dòng trạng thái khi ký số tự động
  const [agentOn, setAgentOn] = useState(null);    // null = chưa dò, true/false = có/không có trợ lý
  const [note, setNote] = useState('');
  // Từ chối theo TỪNG thành viên: id các mục được chọn áp dụng
  const [selIds, setSelIds] = useState([]);
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const vehicleById = useMemo(() => Object.fromEntries((vehicles || []).map((v) => [v.id, v])), [vehicles]);

  // Gộp các mục trùng nội dung + ngày + thời gian (khác thành phần / đơn vị).
  // Lịch ĐÃ TỪ CHỐI gộp riêng với nhau; lịch chưa từ chối gộp riêng -> khi từ chối một
  // vài thành viên thì thẻ bị từ chối (gạch ngang) tách khỏi thẻ còn lại (bình thường).
  const rejectedEntry = entry.status === 'tu_choi';
  const same = useMemo(
    () => (entries || []).filter((e) =>
      e.content === entry.content &&
      e.date === entry.date &&
      e.session === entry.session &&
      (e.start_time || '') === (entry.start_time || '') &&
      (rejectedEntry ? e.status === 'tu_choi' : e.status !== 'tu_choi')
    ),
    [entries, entry, rejectedEntry]
  );
  const merged = useMemo(() => (same.length > 0 ? same : [entry]), [same, entry]);

  // Admin: BỎ QUA / TÍNH LẠI cảnh báo trùng cho RIÊNG lịch này (đặt cờ dup_ignored
  // trên các mục của sự kiện) — KHÔNG ảnh hưởng các lịch khác cùng địa điểm.
  const setDupIgnored = async (val) => {
    const ids = [...new Set(merged.map((x) => x.id))];
    if (!ids.length) return;
    if (val && !window.confirm(`Bỏ qua cảnh báo trùng địa điểm cho RIÊNG lịch này?\n\nChỉ lịch "${entry.content}" sẽ không bị tính/cảnh báo trùng nữa; các lịch khác cùng địa điểm vẫn cảnh báo bình thường.`)) return;
    setBusy(true);
    const { error } = await updateEntries(ids, { dup_ignored: val });
    setBusy(false);
    if (error) { alert('Không lưu được: ' + error.message); return; }
    onChanged?.();
  };

  const unitLabels = [...new Set(merged.map((e) => {
    const l = leaderById[e.leader_id];
    return l ? (UNIT_GROUP_LABELS[l.leader_type] || l.full_name) : null;
  }).filter(Boolean))];

  // Lãnh đạo đích danh của các mục đã gộp
  const leaderNames = [...new Set(merged.map((e) => leaderById[e.leader_id]?.full_name).filter(Boolean))];

  const mergedParticipants = [...new Set(merged.map((e) => (e.participants || '').trim()).filter(Boolean))].join('; ');

  // Xe hiển thị = xe ĐÃ GÁN, KHÔNG tính XE RIÊNG (xe riêng không lên lịch công tác,
  // chỉ Quản trị điều — xem constants.isPrivateVehicle).
  const mergedVehicles = [...new Map(
    merged.flatMap((e) => {
      if (hidesDriver(leaderById[e.leader_id]?.leader_type)) return [];
      const ids = (e.vehicle_ids && e.vehicle_ids.length) ? e.vehicle_ids : (e.vehicle_id ? [e.vehicle_id] : []);
      return ids.map((id) => vehicleById[id]).filter((v) => v && !isPrivateVehicle(v));
    }).map((v) => [v.id, v])
  ).values()];

  const d = parseISO(entry.date);
  const timeLabel = entry.session === 'gio'
    ? `${fmtTime(entry.start_time)}${entry.end_time ? ' - ' + fmtTime(entry.end_time) : ''}`
    : SESSIONS[entry.session];

  // ===== Xử lý nhanh: duyệt / điều chỉnh / từ chối / điều xe ngay trong hộp chi tiết =====
  const leader = leaderById[entry.leader_id];
  // Người này là NGƯỜI PHÊ DUYỆT của mục lịch này? -> dùng "Điều chỉnh", KHÔNG hiện nút "Sửa"
  const isReviewerOfEntry = canReviewEntry(profile, entry, leader);
  // Cho phép xử lý cả khi đã duyệt: điều chỉnh / từ chối lịch đã phê duyệt
  const canModerate = isReviewerOfEntry && ['cho_duyet', 'da_duyet', 'da_dieu_chinh'].includes(entry.status);
  const canApproveNow = entry.status !== 'da_duyet'; // đã duyệt rồi thì không cần nút Phê duyệt
  // Khu PHÂN XE nhanh (Phòng HC-TC-QT): chỉ hiện khi chuyến CÓ đề nghị bố trí xe.
  // Lãnh đạo HĐND tỉnh / Đoàn ĐBQH: ô Lái xe luôn để trống -> không hiện khu này.
  const showVehicle = canAssignVehicle(profile) && entryNeedsVehicleOk(entry, leader)
    && (entry.vehicle_status || 'none') !== 'none'
    && !isHqLocation(entry.location) && !hidesDriver(leader?.leader_type);
  const activeVehicles = (vehicles || []).filter((v) => v.active);
  // Xe RIÊNG chỉ Quản trị mới được điều
  const vehicleOptions = [...activeVehicles]
    .filter((v) => canDispatchPrivateVehicle(profile) || !isPrivateVehicle(v))
    .sort((a, b) => {
    const ap = a.assigned_leader_id === leader?.id ? 0 : a.vehicle_type === 'dung_chung' ? 1 : 2;
    const bp = b.assigned_leader_id === leader?.id ? 0 : b.vehicle_type === 'dung_chung' ? 1 : 2;
    return ap - bp;
  });
  const findConflicts = (vehId) => (entries || []).filter((x) =>
    (x.vehicle_ids || []).includes(vehId) && x.id !== entry.id && x.date === entry.date &&
    (!entry.group_id || x.group_id !== entry.group_id) &&
    x.status !== 'tu_choi' && sessionsOverlap(x, entry)
  );

  // Duyệt áp dụng cho TẤT CẢ mục đã gộp (mọi đơn vị/thành viên của sự kiện)
  const mergedIds = [...new Set(merged.map((e) => e.id))];
  // Danh sách THÀNH VIÊN của sự kiện (mỗi đơn vị/lãnh đạo 1 mục) — để điều chỉnh/từ chối
  // theo TỪNG người thay vì cả nhóm khi sự kiện có nhiều thành viên.
  const members = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const e of merged) {
      if (seen.has(e.id)) continue; seen.add(e.id);
      out.push({ id: e.id, name: leaderById[e.leader_id]?.full_name || e.group_label || 'Đơn vị', status: e.status });
    }
    return out;
  }, [merged, leaderById]);
  const isGroup = members.length > 1;
  const toggleSel = (id) => setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const doApprove = async () => {
    setBusy(true);
    await reviewEntries(mergedIds, 'da_duyet', null, profile.id);
    setBusy(false); onChanged?.(); onClose?.();
  };
  const openReject = () => {
    setRejecting(true); setNote(''); setSelIds(mergedIds);
  };
  const doReject = async () => {
    if (!selIds.length) { alert('Vui lòng chọn ít nhất một thành viên để từ chối.'); return; }
    if (!note.trim()) { alert('Vui lòng nhập lý do từ chối.'); return; }
    setBusy(true);
    await reviewEntries(selIds, 'tu_choi', note.trim(), profile.id);
    // Thành viên KHÔNG bị từ chối nhưng còn CHỜ DUYỆT -> phê duyệt bình thường
    // (lịch của họ vẫn hiển thị bình thường, không bị gạch ngang theo người bị từ chối)
    const restIds = merged.filter((e) => !selIds.includes(e.id) && e.status === 'cho_duyet').map((e) => e.id);
    if (restIds.length) await reviewEntries(restIds, 'da_duyet', null, profile.id);
    setBusy(false); onChanged?.(); onClose?.();
  };
  // ĐIỀU CHỈNH: mở form đầy đủ như "Sửa" (ScheduleForm chế độ điều chỉnh) — đóng modal trước
  const doOpenAdjust = () => { onClose?.(); onAdjust?.(entry); };
  const doAssign = async (vehId) => {
    if (vehId) {
      const cf = findConflicts(vehId);
      if (cf.length > 0) {
        const v = activeVehicles.find((x) => x.id === vehId);
        const who = leaderById[cf[0].leader_id]?.full_name || '';
        if (!window.confirm(`⚠️ Xe ${v?.plate} đã được điều cho ${who} (${fmtDM(parseISO(cf[0].date))}): ${cf[0].content}\n\nVẫn gán xe này?`)) return;
      }
    }
    setBusy(true);
    const ids = [...new Set(merged.map((x) => x.id))];
    // Phân xe -> chờ Lãnh đạo Văn phòng duyệt; bỏ xe -> quay lại chờ phân xe
    const patch = vehId
      ? {
        vehicle_ids: [vehId], vehicle_id: vehId, no_vehicle: false, vehicle_requested: true,
        vehicle_status: 'da_phan_xe', vehicle_approved_by: null, vehicle_approved_at: null, vehicle_sign_code: null,
        vehicle_assigned_by: profile.id, vehicle_assigned_at: new Date().toISOString(),
      }
      : {
        vehicle_ids: [], vehicle_id: null, vehicle_status: 'de_xuat',
        vehicle_approved_by: null, vehicle_approved_at: null, vehicle_sign_code: null,
      };
    await updateEntries(ids, patch);
    setBusy(false); onChanged?.(); onClose?.();
  };

  // ===== PHIẾU ĐỀ NGHỊ SỬ DỤNG XE Ô TÔ CÔNG VỤ =====
  // Luồng: chuyên viên tick đề nghị -> Phòng HC-TC-QT phân xe -> Lãnh đạo Văn phòng
  // (Quản trị) phê duyệt -> in phiếu theo mẫu (docs/Đề nghị sử dụng xe oto.docx).
  const vStatus = entry.vehicle_status || 'none';
  const vSt = VEHICLE_STATUS[vStatus] || VEHICLE_STATUS.none;
  const hasRequest = vStatus !== 'none';
  // Lãnh đạo Văn phòng CHỈ xem xét/ký duyệt SAU KHI Phòng HC-TC-QT đã phân xe.
  // Đang ở 'de_xuat' (chưa có xe) thì không hiện nút duyệt — đúng trình tự nghiệp vụ.
  const canApproveVeh = canApproveVehicle(profile) && vStatus === 'da_phan_xe';
  // Từ chối (không bố trí được xe) thì làm được ở cả 2 bước
  const canRefuseVeh = canApproveVehicle(profile) && ['de_xuat', 'da_phan_xe'].includes(vStatus);
  const canPrintSlip = canPrintVehicleSlip(profile, entry);
  // Lãnh đạo CHỦ TRÌ + xe của phiếu — dùng chung logic với bảng Điều xe
  const chairLeader = chairLeaderOf(merged, leaderById);
  const slipVehicles = slipVehiclesOf(merged, vehicleById);

  // Dữ liệu điền phiếu — dùng CHUNG với bảng Điều xe (src/lib/vehicleSlipData.js).
  // `extra` cho phép ghi đè khi vừa phê duyệt xong (entry trong props chưa kịp làm mới).
  const slipPayload = (extra = {}) => buildSlipPayload({ entry, entries, leaders, vehicles, profiles, extra });

  // PHÊ DUYỆT = bắt đầu luôn thủ tục KÝ SỐ: ghi phê duyệt -> ký bằng USB token (hoặc tải
  // PDF về ký tay nếu chưa bật trợ lý) -> lưu bản đã ký (xem docs/KY-SO.md).
  const doApproveVehicle = async () => {
    const note = window.prompt('Ý kiến của Lãnh đạo Văn phòng (in trên phiếu):', 'Đồng ý bố trí xe theo đề nghị.');
    if (note === null) return;
    const code = makeSignCode();
    const at = new Date().toISOString();
    const approveNote = note.trim() || 'Đồng ý.';
    setBusy(true);
    const { error } = await updateEntries(mergedIds, {
      vehicle_status: 'da_duyet', vehicle_approve_note: approveNote,
      vehicle_approved_by: profile.id, vehicle_approved_at: at, vehicle_sign_code: code,
    });
    setBusy(false);
    if (error) { alert('Không lưu được phê duyệt: ' + error.message); return; }
    onChanged?.();

    // Phê duyệt xong -> KÝ SỐ LUÔN nếu trợ lý đang chạy trên máy này
    const extra = { signCode: code, approvedAt: at, approvedById: profile.id, approveNote };
    setSignBusy(true);
    const agent = await probeAgent();
    setAgentOn(!!agent);
    if (agent) {
      try {
        await signViaAgent(extra);
        setSignBusy(false);
        alert('Đã phê duyệt và KÝ SỐ xong. Chuyên viên có thể tải phiếu về ngay.');
        return;
      } catch (e) {
        setSignStep('');
        alert('Đã phê duyệt nhưng chưa ký số được: ' + (e?.message || e)
          + '\n\nTệp PDF sẽ được tải về để ký bằng phần mềm trên máy, sau đó tải bản đã ký lên.');
      }
    }
    // Không có trợ lý (hoặc ký lỗi) -> tải PDF về để ký thủ công như trước
    try {
      await downloadVehicleSlipPdf(slipPayload(extra));
    } catch (e) {
      alert('Chưa tải được tệp PDF: ' + (e?.message || e) + '\nBấm “Xuất PDF phiếu” để tải lại.');
    }
    setSignBusy(false);
  };

  // KÝ SỐ TỰ ĐỘNG: dựng PDF -> gửi sang trợ lý trên máy có token (người ký nhập PIN)
  // -> nhận PDF đã ký -> tải lên kho -> ghi vào mục lịch. Trả về true nếu xong xuôi.
  const signViaAgent = async (extra = {}) => {
    setSignStep('Đang đọc chứng thư trên USB token...');
    const cert = await signingCertInfo();
    // Vẽ sẵn ô "ĐÃ KÝ SỐ" (ký bởi / cơ quan / ngày ký) rồi mới ký -> chữ ký mật mã phủ
    // luôn phần hiển thị này, và người đọc nhìn thấy ngay trên trang giấy.
    const payload = slipPayload({ ...extra, digitalSign: digitalSignInfo(cert) });
    setSignStep('Đang dựng phiếu PDF...');
    const pdf = await getVehicleSlipPdfBlob(payload);
    setSignStep('Đang chờ ký số — vui lòng nhập mã PIN của USB token...');
    const signed = await signPdfViaAgent(pdf, {
      reason: `Phê duyệt phiếu điều xe ${payload.signCode || ''}`.trim(),
      name: payload.vpSigner,
      location: 'Thanh Hoá',
    });
    setSignStep('Đang lưu tệp đã ký lên hệ thống...');
    const fileName = vehicleSlipFileName(payload).replace(/\.pdf$/i, '-da-ky-so.pdf');
    const file = new File([signed], fileName, { type: 'application/pdf' });
    const { data, error } = await uploadSignedSlip(entry.id, file);
    if (error) throw new Error(error.message);
    const { error: e2 } = await updateEntries(mergedIds, {
      vehicle_signed_path: data.path, vehicle_signed_name: data.name,
      vehicle_signed_at: new Date().toISOString(), vehicle_signed_by: profile.id,
    });
    if (e2) throw new Error(e2.message);
    setSignStep('');
    onChanged?.();
    return true;
  };

  // Nút "Ký số bằng USB token" trong khối hướng dẫn (dùng khi phê duyệt xong mà chưa ký,
  // hoặc lần trước ký lỗi)
  const doSignNow = async () => {
    setSignBusy(true);
    try {
      await signViaAgent();
      alert('Đã ký số và lưu phiếu. Chuyên viên có thể tải về ngay.');
    } catch (e) {
      setSignStep('');
      alert('Chưa ký số được: ' + (e?.message || e)
        + '\n\nKiểm tra: đã cắm USB token chưa, trợ lý ký số đã chạy chưa (cửa sổ "TRỢ LÝ KÝ SỐ").'
        + '\nVẫn có thể ký thủ công: bấm "Xuất PDF phiếu" rồi tải bản đã ký lên.');
    }
    setSignBusy(false);
  };

  // Tải lại tệp PDF phiếu (chưa ký) — để đưa vào phần mềm ký số
  const doDownloadPdf = async () => {
    setSignBusy(true);
    try { await downloadVehicleSlipPdf(slipPayload()); }
    catch (e) { alert('Không tạo được tệp PDF: ' + (e?.message || e)); }
    setSignBusy(false);
  };

  // Tải TỆP ĐÃ KÝ SỐ lên hệ thống -> chuyên viên vào tải về là xong
  const doUploadSigned = async (file) => {
    if (!file) return;
    if (!/pdf$/i.test(file.name || '') && file.type !== 'application/pdf') {
      alert('Chỉ nhận tệp PDF đã ký số.'); return;
    }
    setSignBusy(true);
    const { data, error } = await uploadSignedSlip(entry.id, file);
    if (error) {
      setSignBusy(false);
      alert('Không tải tệp lên được: ' + error.message
        + '\n(Nếu báo thiếu kho lưu trữ: vào Supabase -> Storage -> tạo bucket “phieu-dieu-xe” dạng Private.)');
      return;
    }
    const { error: e2 } = await updateEntries(mergedIds, {
      vehicle_signed_path: data.path, vehicle_signed_name: data.name,
      vehicle_signed_at: new Date().toISOString(), vehicle_signed_by: profile.id,
    });
    setSignBusy(false);
    if (e2) { alert('Đã tải tệp lên nhưng chưa lưu được vào lịch: ' + e2.message); return; }
    onChanged?.();
  };

  // Mở / tải tệp phiếu đã ký số
  const doOpenSigned = async () => {
    setSignBusy(true);
    const { data, error } = await getSignedSlipUrl(entry.vehicle_signed_path);
    setSignBusy(false);
    if (error || !data?.signedUrl) { alert('Không lấy được tệp đã ký: ' + (error?.message || 'không rõ nguyên nhân')); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  const doRejectVehicle = async () => {
    const note = window.prompt('Lý do KHÔNG bố trí xe (hiện cho chuyên viên):', '');
    if (note === null) return;
    setBusy(true);
    await updateEntries(mergedIds, {
      vehicle_status: 'tu_choi', vehicle_approve_note: note.trim() || 'Không bố trí được xe.',
      vehicle_approved_by: profile.id, vehicle_approved_at: new Date().toISOString(),
      no_vehicle: true, vehicle_sign_code: null,
    });
    setBusy(false); onChanged?.();
  };

  const doPrintSlip = () => {
    const ok = printVehicleSlip(slipPayload());
    if (!ok) alert('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép cửa sổ bật lên (pop-up) cho trang này rồi bấm lại.');
  };

  const row = 'flex items-start gap-2.5';
  const ic = 'w-4 h-4 shrink-0 text-red-700 mt-0.5';
  const lab = 'text-[11px] font-bold text-slate-400 uppercase tracking-wide';
  const val = 'text-[14px] text-slate-800 leading-relaxed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-full overflow-y-auto animate-fadeUp">
        <div className="sticky top-0 bg-gradient-to-r from-red-800 to-red-700 text-white px-5 py-3.5 rounded-t-2xl flex items-center justify-between gap-3">
          <h2 className="font-bold text-[15px] leading-snug">Chi tiết lịch công tác</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {dupOthers?.length > 0 && (
            <div className={`text-[13px] rounded-xl p-3 border ${dupWeek ? 'text-red-900 bg-red-50 border-red-300' : 'text-amber-900 bg-amber-50 border-amber-300'}`}>
              <p className="font-bold">
                {dupWeek
                  ? `⚠️ TRÙNG ĐỊA ĐIỂM TRONG TUẦN: có nhóm khác cùng đến "${entry.location}" trong tuần này:`
                  : `⚠️ Trùng địa điểm "${entry.location}" với các lịch khác trong năm:`}
              </p>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {dupOthers.map((o, i) => (
                  <li key={i}>{dayName(parseISO(o.date))}, ngày {fmtDMY(parseISO(o.date))}{o.name ? ` — ${o.name}` : ''}</li>
                ))}
              </ul>
              <p className="mt-1 italic">Đề nghị cân nhắc gộp đoàn hoặc điều phối chung xe.</p>
              {canAdmin(profile) && (
                <button onClick={() => setDupIgnored(true)} disabled={busy} className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold bg-white disabled:opacity-60 ${dupWeek ? 'text-red-800 border border-red-300 hover:bg-red-100' : 'text-amber-800 border border-amber-300 hover:bg-amber-100'}`}>
                  <XCircle className="w-3.5 h-3.5" /> Bỏ qua cảnh báo trùng cho RIÊNG lịch này
                </button>
              )}
            </div>
          )}
          {entry.dup_ignored && canAdmin(profile) && (
            <div className="text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <span className="italic">Lịch này đang được BỎ QUA cảnh báo trùng địa điểm.</span>
              <button onClick={() => setDupIgnored(false)} disabled={busy} className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60">
                <Check className="w-3.5 h-3.5" /> Tính lại cảnh báo
              </button>
            </div>
          )}
          {/* Nội dung */}
          <div>
            <p className={lab}>Nội dung</p>
            <p className="text-[15px] font-bold text-slate-900 leading-relaxed mt-0.5">{entry.content}</p>
          </div>

          {/* Lãnh đạo / Đơn vị */}
          <div className={row}>
            <Building2 className={ic} />
            <div>
              <p className={lab}>Lãnh đạo / Đơn vị</p>
              <p className={val}>{entry.group_label || leaderNames.join('; ') || unitLabels.join(' · ') || '—'}</p>
            </div>
          </div>

          {entry.at_office ? (
            /* Làm việc tại cơ quan: dòng chữ in đậm + Thành phần (để in công văn) */
            <>
              <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-bold text-amber-800">
                <Building2 className="w-5 h-5 shrink-0" /> Làm việc tại cơ quan
              </div>
              {mergedParticipants && (
                <div className={row}>
                  <Users className={ic} />
                  <div>
                    <p className={lab}>Thành phần</p>
                    <p className={val}>{mergedParticipants}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Thời gian */}
              <div className={row}>
                <Clock className={ic} />
                <div>
                  <p className={lab}>Thời gian</p>
                  <p className={val}>{dayName(d)}, ngày {fmtDMY(d)} · {timeLabel}</p>
                </div>
              </div>

              {/* Địa điểm */}
              <div className={row}>
                <MapPin className={ic} />
                <div>
                  <p className={lab}>Địa điểm</p>
                  <p className={val}>{entry.location || '—'}</p>
                </div>
              </div>

              {/* Thành phần (đã gộp) */}
              <div className={row}>
                <Users className={ic} />
                <div>
                  <p className={lab}>Thành phần</p>
                  <p className={val}>{mergedParticipants || '—'}</p>
                </div>
              </div>

              {/* Lái xe / Xe phục vụ */}
              <div className={row}>
                <Car className={ic} />
                <div>
                  <p className={lab}>Lái xe / Xe phục vụ</p>
                  <p className={val}>{mergedVehicles.length > 0
                    ? mergedVehicles.map((v) => `${[v.driver_name, v.plate].filter(Boolean).join(' · ')}${v.driver_phone ? ` (${v.driver_phone})` : ''}`).join('; ')
                    : '—'}</p>
                </div>
              </div>
            </>
          )}

          {/* Ghi chú duyệt */}
          {entry.review_note && (
            <div className={row}>
              <MessageSquareText className={ic} />
              <div>
                <p className={lab}>Ghi chú của lãnh đạo</p>
                <p className={`${val} italic`}>{entry.review_note}</p>
              </div>
            </div>
          )}

          {/* Lý do chỉnh sửa — khi người tạo sửa lịch đã duyệt, lịch chờ duyệt lại */}
          {entry.edit_note && entry.status === 'cho_duyet' && (
            <div className={row}>
              <MessageSquareText className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className={lab}>Lý do chỉnh sửa (chờ duyệt lại)</p>
                <p className={`${val} italic text-amber-800`}>{entry.edit_note}</p>
              </div>
            </div>
          )}

          {/* Người phê duyệt (chức vụ + họ tên) — hiện khi lịch đã được xử lý */}
          {reviewer && ['da_duyet', 'da_dieu_chinh', 'tu_choi'].includes(entry.status) && (
            <div className={row}>
              <UserCheck className={ic} />
              <div>
                <p className={lab}>Người phê duyệt</p>
                <p className={`${val} font-semibold`}>{[reviewer.position, reviewer.full_name].filter(Boolean).join(' — ') || reviewer.email}</p>
              </div>
            </div>
          )}

          {/* ===== PHIẾU ĐỀ NGHỊ SỬ DỤNG XE Ô TÔ CÔNG VỤ ===== */}
          {hasRequest && (
            <div className={`rounded-xl border p-3.5 space-y-2 ${vSt.bg} ${vSt.border}`}>
              <p className={`flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide ${vSt.text}`}>
                <Car className="w-4 h-4" /> Đề nghị bố trí xe — {vSt.label}
              </p>
              <div className="text-[13px] text-slate-700 space-y-0.5">
                {chairLeader && <p>Người đề nghị (chủ trì): <b>{chairLeader.full_name}</b>{chairLeader.position ? ' — ' + chairLeader.position : ''}</p>}
                {entry.vehicle_requester_name && <p>Chuyên viên đề nghị: <b>{entry.vehicle_requester_name}</b></p>}
                {entry.rider_count ? <p>Số người: <b>{entry.rider_count}</b></p> : null}
                <p>Địa điểm xuất phát: <b>{entry.departure_place || DEFAULT_DEPARTURE}</b></p>
                {slipVehicles.length > 0 && (
                  <p>Xe được điều: <b>{slipVehicles.map((v) => [v.plate, v.driver_name].filter(Boolean).join(' · ')).join('; ')}</b></p>
                )}
                {entry.vehicle_approve_note && <p className="italic">Ý kiến Lãnh đạo Văn phòng: “{entry.vehicle_approve_note}”</p>}
                {entry.vehicle_sign_code && (
                  <p className="text-[12px] text-slate-500">Mã xác thực phê duyệt: <b>{entry.vehicle_sign_code}</b></p>
                )}
              </div>
              {/* Đã có tệp PDF ĐÃ KÝ SỐ -> ai cũng tải về được (trừ tài khoản chỉ xem) */}
              {entry.vehicle_signed_path && (
                <div className="rounded-lg border border-emerald-300 bg-white p-2.5 space-y-1.5">
                  <p className="text-[12px] text-emerald-800 font-semibold flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4" /> Phiếu đã ký số
                    {entry.vehicle_signed_at && <span className="font-normal text-slate-500">· {fmtDMY(new Date(entry.vehicle_signed_at))}</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {canPrintSlip && (
                      <button onClick={doOpenSigned} disabled={signBusy} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60">
                        {signBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Tải phiếu đã ký số (PDF)
                      </button>
                    )}
                    {canApproveVehicle(profile) && (
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50">
                        <Upload className="w-3.5 h-3.5" /> Thay bằng tệp khác
                        <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={signBusy} onChange={(e) => { doUploadSigned(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canApproveVeh && (
                  <button onClick={doApproveVehicle} disabled={busy} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                    <ShieldCheck className="w-4 h-4" /> Phê duyệt &amp; ký số
                  </button>
                )}
                {canRefuseVeh && (
                  <button onClick={doRejectVehicle} disabled={busy} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">
                    <XCircle className="w-4 h-4" /> Không bố trí xe
                  </button>
                )}
                {canApproveVehicle(profile) && vStatus === 'de_xuat' && (
                  <span className="text-[12px] text-amber-800 italic">Chờ lãnh đạo Phòng HC-TC-QT xem xét, phân bổ xe rồi mới ký duyệt được.</span>
                )}
                {canPrintSlip && !entry.vehicle_signed_path && (
                  <>
                    <button onClick={doDownloadPdf} disabled={signBusy} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-60">
                      {signBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Xuất PDF phiếu
                    </button>
                    <button onClick={doPrintSlip} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-700 border border-slate-300 hover:bg-white">
                      <Printer className="w-4 h-4" /> In giấy
                    </button>
                  </>
                )}
                {!canPrintSlip && !canApproveVeh && !canRefuseVeh && (
                  <span className="text-[12px] text-slate-500 italic">Xuất được phiếu sau khi Lãnh đạo Văn phòng phê duyệt.</span>
                )}
              </div>

              {/* Thủ tục KÝ SỐ — hiện cho Lãnh đạo Văn phòng ngay sau khi phê duyệt */}
              {canApproveVehicle(profile) && vStatus === 'da_duyet' && !entry.vehicle_signed_path && (
                <div className="rounded-lg border border-emerald-300 bg-white p-3 space-y-2">
                  <p className="text-[12px] font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> Ký số phiếu bằng USB token
                  </p>
                  {signStep && (
                    <p className="text-[12.5px] text-emerald-800 font-semibold flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin" /> {signStep}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={doSignNow} disabled={signBusy} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60">
                      {signBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Ký số bằng USB token
                    </button>
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50">
                      <Upload className="w-3.5 h-3.5" /> Hoặc tải lên tệp đã ký sẵn
                      <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={signBusy} onChange={(e) => { doUploadSigned(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                  </div>
                  {agentOn === false && (
                    <p className="text-[12px] text-amber-800">
                      Chưa thấy <b>Trợ lý ký số</b> chạy trên máy này. Mở thư mục <code>tools/ky-so-agent</code> →
                      chạy <code>npm start</code> (hoặc lối tắt đã tạo), cắm USB token rồi bấm lại.
                    </p>
                  )}
                  <p className="text-[11.5px] text-slate-500 italic">
                    Cách khác (không cần trợ lý): bấm “Xuất PDF phiếu” → ký bằng phần mềm trên máy →
                    “Hoặc tải lên tệp đã ký sẵn”. Chi tiết: docs/KY-SO.md.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ===== XỬ LÝ NHANH (duyệt / điều chỉnh / từ chối / điều xe ngay tại đây) ===== */}
          {(canModerate || showVehicle) && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-3.5 space-y-3">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-red-800 uppercase tracking-wide"><Zap className="w-4 h-4" /> Xử lý nhanh</p>

              {canModerate && !rejecting && (
                <div className="flex flex-wrap items-center gap-2">
                  {!canApproveNow && <span className="text-[12px] text-emerald-700 font-semibold mr-1">Lịch đã duyệt — có thể điều chỉnh hoặc từ chối:</span>}
                  {canApproveNow && (
                    <button onClick={doApprove} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                      <Check className="w-4 h-4" /> Phê duyệt
                    </button>
                  )}
                  <button onClick={doOpenAdjust} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60" title="Mở biểu mẫu đầy đủ như Sửa để điều chỉnh (lưu thành 'Đã điều chỉnh')">
                    <SlidersHorizontal className="w-4 h-4" /> Điều chỉnh
                  </button>
                  <button onClick={openReject} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">
                    <XCircle className="w-4 h-4" /> Từ chối
                  </button>
                </div>
              )}
              {canModerate && rejecting && (
                <div className="space-y-2">
                  {isGroup && (
                    <div className="rounded-lg border border-rose-200 bg-white p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-bold text-slate-500">Từ chối thành viên ({selIds.length}/{members.length}):</p>
                        <div className="flex gap-2 text-[11px] font-semibold">
                          <button type="button" onClick={() => setSelIds(members.map((m) => m.id))} className="text-slate-500 hover:text-rose-700">Tất cả</button>
                          <button type="button" onClick={() => setSelIds([])} className="text-slate-500 hover:text-rose-700">Bỏ chọn</button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {members.map((m) => (
                          <label key={m.id} className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={selIds.includes(m.id)} onChange={() => toggleSel(m.id)} className="accent-rose-600 w-4 h-4" />
                            {m.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do từ chối (bắt buộc)" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRejecting(false)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-white">Hủy</button>
                    <button onClick={doReject} disabled={busy} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">Xác nhận từ chối</button>
                  </div>
                </div>
              )}

              {showVehicle && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-600 flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Điều xe:</span>
                  <select
                    disabled={busy}
                    value={entry.vehicle_id || ''}
                    onChange={(e) => doAssign(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400"
                  >
                    <option value="">— Chưa gán xe —</option>
                    {vehicleOptions.map((v) => {
                      const own = v.assigned_leader_id === leader?.id;
                      const conflict = findConflicts(v.id).length > 0;
                      return (
                        <option key={v.id} value={v.id}>
                          {v.plate} · {v.driver_name}{own ? ' (xe riêng)' : v.vehicle_type === 'dung_chung' ? ' (dùng chung)' : ''}{conflict ? ' ⚠ trùng giờ' : ''}
                        </option>
                      );
                    })}
                  </select>
                  {entry.vehicle_id && (
                    <button onClick={() => doAssign('')} disabled={busy} className="text-[12px] font-semibold text-slate-500 hover:text-rose-700">Bỏ gán xe</button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <StatusBadge status={entry.status} />
            <div className="flex items-center gap-2">
              {canDuplicate && (
                <button onClick={() => { onClose?.(); onDuplicate?.(entry); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700" title="Tạo mục lịch mới giống mục này để sửa một vài chi tiết">
                  <Copy className="w-3.5 h-3.5" /> Nhân bản
                </button>
              )}
              {/* Nút "Sửa" KHÔNG hiện với người phê duyệt mục này (họ dùng "Điều chỉnh") */}
              {canEdit && !isReviewerOfEntry && (
                <button onClick={() => { onClose?.(); onEdit?.(entry); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-sky-600 hover:bg-sky-700">
                  <Pencil className="w-3.5 h-3.5" /> Sửa
                </button>
              )}
              {canEdit && (
                <button onClick={() => { onClose?.(); onDelete?.(entry); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-rose-600 hover:bg-rose-700">
                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                </button>
              )}
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-600 hover:bg-slate-100">Đóng</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
