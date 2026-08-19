// Dựng DỮ LIỆU điền vào "Phiếu đề nghị sử dụng xe ô tô công vụ" từ một mục lịch.
// Tách riêng để dùng CHUNG cho: hộp chi tiết lịch (ký từng phiếu) và bảng Điều xe
// (phê duyệt + ký số HÀNG LOẠT nhiều ngày).
//
// HÀM THUẦN — test được bằng node (scripts/test-slip-data.mjs).
import { SESSIONS, UNIT_NAME, VEHICLE_SLIP, DEFAULT_DEPARTURE, isPrivateVehicle } from './constants';
import { fmtTime, fmtDMY, parseISO } from './dates';

// Các mục thuộc CÙNG MỘT SỰ KIỆN với `entry` (cùng nội dung + ngày + thời gian).
// Giống cách gộp thẻ ở hộp chi tiết: mục đã từ chối gộp riêng với nhau.
export function sameEventEntries(entry, entries) {
  const rejected = entry.status === 'tu_choi';
  const same = (entries || []).filter((e) =>
    e.content === entry.content
    && e.date === entry.date
    && e.session === entry.session
    && (e.start_time || '') === (entry.start_time || '')
    && (rejected ? e.status === 'tu_choi' : e.status !== 'tu_choi'));
  return same.length ? same : [entry];
}

// Lãnh đạo CHỦ TRÌ = người có STT (sort_order) nhỏ nhất trong các mục của sự kiện
export function chairLeaderOf(merged, leaderById) {
  return merged
    .map((e) => leaderById[e.leader_id]).filter(Boolean)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))[0] || null;
}

// Xe ghi trên phiếu: mọi xe đã gán cho sự kiện (kể cả xe riêng do Quản trị điều)
export function slipVehiclesOf(merged, vehicleById, { keepPrivate = true } = {}) {
  return [...new Map(
    merged
      .flatMap((e) => ((e.vehicle_ids && e.vehicle_ids.length) ? e.vehicle_ids : (e.vehicle_id ? [e.vehicle_id] : [])))
      .map((id) => vehicleById[id])
      .filter((v) => v && (keepPrivate || !isPrivateVehicle(v)))
      .map((v) => [v.id, v]),
  ).values()];
}

const hhmm = (dt) => `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

/**
 * @param {object} p
 *  entry     — mục lịch đại diện của sự kiện
 *  entries   — toàn bộ mục lịch đang nạp (để gộp sự kiện)
 *  leaders / vehicles / profiles — danh mục
 *  extra     — ghi đè khi vừa phê duyệt xong (entry chưa kịp làm mới):
 *              { signCode, approvedAt, approvedById, approveNote, digitalSign }
 */
export function buildSlipPayload({ entry, entries, leaders, vehicles, profiles, extra = {} }) {
  const leaderById = Object.fromEntries((leaders || []).map((l) => [l.id, l]));
  const vehicleById = Object.fromEntries((vehicles || []).map((v) => [v.id, v]));
  const profileById = Object.fromEntries((profiles || []).map((x) => [x.id, x]));

  const merged = sameEventEntries(entry, entries);
  const chair = chairLeaderOf(merged, leaderById);
  const cars = slipVehiclesOf(merged, vehicleById);

  // "Tên tôi là / Chức vụ / NGƯỜI BÁO XE" = LÃNH ĐẠO CHỦ TRÌ của lịch, không phải
  // chuyên viên nhập lịch (dự phòng: hồ sơ người đề nghị / người tạo lịch).
  const requester = chair || profileById[entry.vehicle_requested_by] || profileById[entry.created_by] || {};
  const dispatcher = profileById[entry.vehicle_assigned_by];
  const approver = profileById[extra.approvedById || entry.vehicle_approved_by] || {};

  const d = parseISO(entry.date);
  const reqD = parseISO((entry.vehicle_requested_at || entry.created_at || new Date().toISOString()).slice(0, 10));
  const appAt = extra.approvedAt || entry.vehicle_approved_at;
  const appD = appAt ? new Date(appAt) : null;
  const timeLabel = entry.session === 'gio'
    ? `${fmtTime(entry.start_time)}${entry.end_time ? ' - ' + fmtTime(entry.end_time) : ''}`
    : SESSIONS[entry.session];

  return {
    dateISO: entry.date,
    fileTitle: `Phieu dieu xe ${entry.date}`,
    unitName: 'VĂN PHÒNG ĐOÀN ĐBQH\nVÀ HĐND TỈNH THANH HÓA',
    unitName1: 'VĂN PHÒNG ĐOÀN ĐBQH',
    unitName2: 'VÀ HĐND TỈNH THANH HÓA',
    recipient: VEHICLE_SLIP.recipient,
    placeDateText: `${VEHICLE_SLIP.place}, ngày ${reqD.getDate()} tháng ${reqD.getMonth() + 1} năm ${reqD.getFullYear()}`,
    requesterName: requester.full_name || requester.email || '',
    requesterPosition: requester.position || '',
    purpose: entry.content || '',
    purposeMore: entry.location ? `Địa điểm: ${entry.location}` : '',
    timeText: `${timeLabel}, ngày ${fmtDMY(d)}`,
    riderText: entry.rider_count ? String(entry.rider_count) : '',
    // CHUYÊN VIÊN ĐỀ NGHỊ (người trực tiếp báo xe) — khác với lãnh đạo chủ trì ở phần
    // "Tên tôi là". Ưu tiên tên nhập trên biểu mẫu, dự phòng hồ sơ tài khoản đã đề nghị.
    requesterStaff: entry.vehicle_requester_name
      || profileById[entry.vehicle_requested_by]?.full_name
      || profileById[entry.created_by]?.full_name || '',
    departure: entry.departure_place || DEFAULT_DEPARTURE,
    plateText: cars.map((v) => v.plate).join('; '),
    driverText: cars.map((v) => [v.driver_name, v.driver_phone].filter(Boolean).join(' - ')).join('; '),
    hctcqtBlock: VEHICLE_SLIP.hctcqt.block,
    hctcqtSignTitle: VEHICLE_SLIP.hctcqt.signTitle,
    hctcqtSigner: dispatcher?.full_name || VEHICLE_SLIP.hctcqt.signer,
    hctcqtSign: dispatcher?.signature_data || '',
    vpBlock: VEHICLE_SLIP.vp.block,
    vpNote: extra.approveNote || entry.vehicle_approve_note || '',
    vpSignTitle: VEHICLE_SLIP.vp.signTitle,
    vpSigner: approver.full_name || VEHICLE_SLIP.vp.signer,
    vpSign: approver.signature_data || '',
    approvedAtText: appD ? `${hhmm(appD)} ngày ${fmtDMY(appD)}` : '',
    signCode: extra.signCode || entry.vehicle_sign_code || '',
    digitalSign: extra.digitalSign || null,
    _cars: cars,
    _chairLeader: chair,
  };
}

// Thông tin ô "ĐÃ KÝ SỐ" vẽ lên phiếu ngay trước khi ký bằng USB token
export function digitalSignInfo(cert, when = new Date()) {
  if (!cert) return null;
  return {
    signer: cert.subjectName || cert.subject || '',
    org: UNIT_NAME,
    issuer: cert.issuerName || '',
    timeText: `${hhmm(when)} ngày ${fmtDMY(when)}`,
  };
}
