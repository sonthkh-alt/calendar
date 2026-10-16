// ĐỌC HÓA ĐƠN NHIÊN LIỆU TRÊN MÁY — HÀM THUẦN (test ở node), không gọi dịch vụ nào.
//  - parseInvoiceXml: tệp XML HÓA ĐƠN ĐIỆN TỬ theo Thông tư 78/2021/TT-BTC (HDon/DLHDon: SHDon, NLap,
//    NBan/Ten, DSHHDVu/HHDVu: THHDVu, DVTinh, SLuong, DGia, ThTien, TSuat; TToan/TgTTTBSo) — CHÍNH XÁC.
//  - parseInvoiceText: chữ lấy từ PDF hoặc từ nhận dạng ảnh -> dò số HĐ, ngày, đơn vị bán, loại nhiên
//    liệu, biển số; số lít / đơn giá / thành tiền tìm bằng cách GIẢI BỘ BA lít × đơn giá ≈ thành tiền
//    (cách viết số Việt Nam "45,500" có thể là 45,5 lít hoặc 45.500 đồng — bộ ba khớp nhau mới chọn).
// Kết quả cùng dạng với api/ocr-invoice: { found, invoice_no, invoice_date, seller, fuel_type, liters,
// unit_price, amount, plate, note, engine }.

const EMPTY = { found: false, invoice_no: '', invoice_date: '', seller: '', fuel_type: '', liters: 0, unit_price: 0, amount: 0, plate: '', note: '' };
const round2 = (n) => Math.round(n * 100) / 100;

const decodeXml = (s) => String(s ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&').trim();
// Nội dung thẻ đầu tiên tên `tag` (bỏ qua tiền tố namespace) trong `xml`
const tagBlocks = (xml, tag) => [...String(xml).matchAll(new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'g'))].map((m) => m[1]);
const tag = (xml, t) => { const b = tagBlocks(xml, t); return b.length ? decodeXml(b[0]) : ''; };
const xmlNum = (s) => { const n = Number(String(s || '').trim().replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

/** Văn bản (bỏ thẻ) của XML — để dò biển số ở các trường thông tin khác. */
const xmlText = (xml) => decodeXml(String(xml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

// --- Nhận diện loại nhiên liệu, biển số ---
export function detectFuelType(text) {
  const s = String(text || '').replace(/x[ăa]ng\s*d[ầa]u/gi, ' '); // "Công ty xăng dầu" không nói lên loại
  if (/diesel|\bD\.?O\b|d[ầa]u\s*(?:D\.?O|diesel)|\bDO\s*0[.,]0[05]/i.test(s)) return 'dau';
  if (/x[ăa]ng|\bRON\s*9[25]|\bE\s?(?:5|10)\b|\bA9[25]\b/i.test(s)) return 'xang';
  if (/\bd[ầa]u\b/i.test(s) && !/d[ầa]u\s*(?:nhớt|máy|mỡ|hỏa|ăn)/i.test(s)) return 'dau';
  return '';
}

/** Biển số xe Việt Nam: 36A-123.68 / 36A12368 / 36LD-012.34 / 36A-1234 -> chuẩn "36A-123.68". */
export function findPlate(text) {
  const s = String(text || '').toUpperCase();
  const m = s.match(/(?<![0-9A-Z])(\d{2})\s*([A-Z]{1,2}\d?)\s*[-–.\s]?\s*(\d{3})[.\s]?(\d{2})(?![0-9])/)
    || s.match(/(?<![0-9A-Z])(\d{2})\s*([A-Z]{1,2})\s*[-–.\s]?\s*(\d{4})(?![0-9])/);
  if (!m) return '';
  return m[4] ? `${m[1]}${m[2]}-${m[3]}.${m[4]}` : `${m[1]}${m[2]}-${m[3]}`;
}

// --- XML hóa đơn điện tử ---
const FUEL_ITEM = /x[ăa]ng|d[ầa]u|diesel|\bD\.?O\b|\bRON\b|\bE\s?(?:5|10)\b|nhiên liệu/i;
const NOT_FUEL = /nhớt|mỡ|dầu\s*(?:máy|hộp số|phanh|thủy lực|bôi trơn)|lọc|rửa|phí\b|AdBlue/i;

export function parseInvoiceXml(xml) {
  const src = String(xml || '');
  if (!/<(?:[\w-]+:)?(?:HDon|DLHDon|TTChung)\b/.test(src)) return { ...EMPTY, engine: 'xml', note: 'Không phải tệp XML hóa đơn điện tử.' };
  const nban = tagBlocks(src, 'NBan')[0] || '';
  const items = tagBlocks(src, 'HHDVu').map((b) => ({
    name: tag(b, 'THHDVu'), unit: tag(b, 'DVTinh'), qty: xmlNum(tag(b, 'SLuong')), price: xmlNum(tag(b, 'DGia')),
    amount: xmlNum(tag(b, 'ThTien')), rate: tag(b, 'TSuat'), kind: xmlNum(tag(b, 'TChat')),
  }));
  let fuel = items.filter((i) => FUEL_ITEM.test(i.name) && !NOT_FUEL.test(i.name) && (i.qty || 0) > 0 && i.kind !== 3);
  if (!fuel.length) fuel = items.filter((i) => /l[íi]t/i.test(i.unit) && (i.qty || 0) > 0 && i.kind !== 3);
  const liters = round2(fuel.reduce((s, i) => s + (i.qty || 0), 0));
  const total = xmlNum(tag(src, 'TgTTTBSo'));
  const vat = (r) => { const m = String(r || '').match(/(\d+(?:[.,]\d+)?)\s*%/); return m ? Number(m[1].replace(',', '.')) / 100 : 0; };
  const goods = items.filter((i) => i.kind !== 3 && (i.amount || 0) > 0);
  let amount;
  if (total && goods.length && goods.every((i) => fuel.includes(i))) amount = total; // hóa đơn chỉ có nhiên liệu
  else amount = Math.round(fuel.reduce((s, i) => s + (i.amount ?? (i.qty || 0) * (i.price || 0)) * (1 + vat(i.rate)), 0));
  const date = tag(src, 'NLap').slice(0, 10);
  const no = tag(src, 'SHDon');
  const out = {
    ...EMPTY,
    engine: 'xml',
    invoice_no: no ? String(no).replace(/^0+(?=\d)/, '') : '',
    invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    seller: tag(nban, 'Ten'),
    seller_tax: tag(nban, 'MST'),
    fuel_type: detectFuelType(fuel.map((i) => i.name).join(' ')),
    liters,
    amount: amount || 0,
    unit_price: liters > 0 && amount ? Math.round(amount / liters) : 0,
    plate: findPlate(xmlText(tagBlocks(src, 'NDHDon')[0] || src)),
    items: fuel.map((i) => i.name).join('; '),
  };
  out.found = out.liters > 0;
  if (!out.found) out.note = 'Không thấy mặt hàng xăng / dầu trong hóa đơn.';
  return out;
}

// --- Số viết kiểu Việt Nam ---
/**
 * Các cách hiểu có thể của một số viết tay/in: "1.234.567" -> 1234567; "20.500,00" -> 20500;
 * "45,500" -> [45.5, 45500]; "45.5" -> [45.5]; "932750" -> [932750].
 */
export function vnNumberReadings(tok) {
  const s = String(tok).trim();
  if (!/^\d[\d.,]*$/.test(s)) return [];
  const seps = s.replace(/\d/g, '');
  const parts = s.split(/[.,]/);
  if (!seps) return [Number(s)];
  if (seps.length === 1) {
    const [a, b] = parts;
    if (b.length === 3) return [...new Set([Number(a + b), Number(`${a}.${b}`)])]; // nghìn hoặc thập phân 3 chữ số
    return [Number(`${a}.${b}`)];
  }
  const last = seps[seps.length - 1];
  const allSame = new Set(seps).size === 1;
  if (allSame) return parts.slice(1).every((p) => p.length === 3) ? [Number(parts.join(''))] : [];
  // hai loại dấu: dấu cuối là thập phân
  const i = s.lastIndexOf(last);
  const intPart = s.slice(0, i).replace(/[.,]/g, ''), dec = s.slice(i + 1);
  return [Number(`${intPart}.${dec}`)];
}

/** Mọi số trong văn bản kèm vị trí. Bỏ dãy giống mã số thuế / điện thoại / số tài khoản (≥ 10 chữ số liền). */
function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/\d[\d.,]*\d|\d/g)) {
    const tok = m[0];
    if (/^\d{10,}$/.test(tok)) continue;
    const readings = vnNumberReadings(tok).filter((v) => Number.isFinite(v));
    if (readings.length) out.push({ tok, index: m.index, readings });
  }
  return out;
}

const LITER_AFTER = /^\s*(?:l[íi]t|lit|L)\b/i;
const TOTAL_BEFORE = /(t[ổo]ng\s*(?:c[ộo]ng\s*)?(?:ti[ềe]n\s*)?(?:thanh\s*to[áa]n|ph[ảa]i\s*tr[ảa])|total\s*(?:payment|amount)?|th[àa]nh\s*ti[ềe]n|t[ổo]ng\s*c[ộo]ng)\s*(?:\([^)]*\))?\s*[:.]?\s*(?:VN[DĐ]|đ)?\s*$/i;
const PRICE_BEFORE = /(đ[ơo]n\s*gi[áa]|unit\s*price|gi[áa])\s*(?:\([^)]*\))?\s*[:.]?\s*$/i;

/**
 * GIẢI BỘ BA lít × đơn giá ≈ thành tiền trong văn bản. Đơn giá nhiên liệu ở Việt Nam 10.000–60.000 đ/lít;
 * đơn giá có thể chưa gồm thuế (thành tiền = lít × giá × 1,1 / 1,08). Ưu tiên: số tiền có nhãn "Tổng tiền
 * thanh toán", số lít có chữ "lít" đứng sau, số tiền lớn nhất. Trả { liters, unit_price, amount } | null.
 */
export function solveFuelTriple(text) {
  const nums = numbersIn(text);
  const ctxBefore = (n) => String(text).slice(Math.max(0, n.index - 60), n.index);
  const ctxAfter = (n) => String(text).slice(n.index + n.tok.length, n.index + n.tok.length + 8);
  const L = [], P = [], A = [];
  for (const n of nums) {
    // "45,5 lít" (đơn vị sau số) hoặc cột ĐVT "Lít" đứng ngay trước cột Số lượng
    const litMark = LITER_AFTER.test(ctxAfter(n)) || /l[íi]t\s*$/i.test(ctxBefore(n).slice(-12)) ? 3 : 0;
    const totMark = TOTAL_BEFORE.test(ctxBefore(n)) ? 3 : 0;
    const priceMark = PRICE_BEFORE.test(ctxBefore(n)) ? 2 : 0;
    for (const v of n.readings) {
      if (v >= 1 && v <= 400) L.push({ v, s: litMark + (Number.isInteger(v) ? 0 : 1), n });
      if (v >= 10000 && v <= 60000) P.push({ v, s: priceMark, n });
      if (v >= 10000) A.push({ v, s: totMark, n });
    }
  }
  let best = null;
  for (const l of L) for (const p of P) {
    if (p.n === l.n) continue;
    for (const k of [1, 1.1, 1.08, 1.05]) {
      const want = l.v * p.v * k;
      for (const a of A) {
        if (a.n === l.n || a.n === p.n) continue;
        if (Math.abs(a.v - want) > Math.max(300, a.v * 0.004)) continue;
        // thứ tự cột trên hóa đơn: Số lượng -> Đơn giá -> Thành tiền; đơn giá xăng dầu thường 15.000–35.000
        const order = l.n.index < p.n.index && p.n.index < a.n.index ? 2 : 0;
        const usual = p.v >= 15000 && p.v <= 35000 ? 0.5 : 0;
        const score = l.s + p.s + a.s + order + usual + (k === 1 ? 1 : 0) + a.v / 1e9;
        if (!best || score > best.score || (score === best.score && a.v > best.a)) best = { score, l: l.v, p: p.v, a: a.v, k };
      }
    }
  }
  if (!best) return null;
  // Đã tìm được bộ ba; nếu có "Tổng tiền thanh toán" lớn hơn (gồm thuế) đúng bằng thành tiền × (1+VAT) thì lấy nó
  const total = A.filter((a) => a.s >= 3).map((a) => a.v).find((v) => [1.1, 1.08, 1.05].some((k) => Math.abs(v - best.a * k) <= Math.max(300, v * 0.004)));
  const amount = total || best.a;
  return { liters: round2(best.l), amount: Math.round(amount), unit_price: Math.round(amount / best.l) };
}

const VN_DATE = /ng[àa]y\D{0,20}?(\d{1,2})\D{1,25}?th[áa]ng\D{0,20}?(\d{1,2})\D{1,25}?n[ăa]m\D{0,20}?(\d{4})/i;
const iso = (d, m, y) => {
  const dd = +d, mm = +m, yy = +y;
  if (!(yy >= 2000 && yy <= 2100 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return '';
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
};

/** Đọc hóa đơn từ VĂN BẢN (chữ trong PDF hoặc chữ nhận dạng từ ảnh). */
export function parseInvoiceText(text, engine = 'text') {
  const s = String(text || '').replace(/\r/g, '').normalize('NFC');
  const out = { ...EMPTY, engine };
  const dm = s.match(VN_DATE);
  out.invoice_date = dm ? iso(dm[1], dm[2], dm[3]) : '';
  if (!out.invoice_date) {
    const m = s.match(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})(?!\d)/);
    if (m) out.invoice_date = iso(m[1], m[2], m[3]);
  }
  const no = s.match(/s[ốo]\s*(?:h[óo]a\s*đ[ơo]n|HĐ)\s*(?:\([^)]*\))?\s*[:.]?\s*0*(\d{1,8})(?!\d)/i)
    || s.match(/(?:^|[\s(])(?:S[ốo]|No)\.?\s*(?:\((?:No|Invoice\s*No)\.?\))?\s*[:.]\s*0*(\d{1,8})(?!\d)/im);
  out.invoice_no = no ? no[1] : '';
  const sel = s.match(/(?:đ[ơo]n\s*v[ịi]\s*b[áa]n(?:\s*h[àa]ng)?|t[êe]n\s*ng[ưươ]*[ờo]i\s*b[áa]n|ng[ưươ]*[ờo]i\s*b[áa]n|seller)\s*(?:\([^)]*\))?\s*[:.]\s*([^\n]{3,120})/i);
  if (sel) out.seller = sel[1].trim();
  else {
    const line = s.split('\n').map((x) => x.trim()).find((x) => /(c[ôo]ng\s*ty|c[ửu]a\s*h[àa]ng|CHXD|petrolimex|pvoil|x[ăa]ng\s*d[ầa]u)/i.test(x) && x.length <= 120);
    out.seller = line || '';
  }
  out.fuel_type = detectFuelType(s);
  out.plate = findPlate(s);
  const t = solveFuelTriple(s);
  if (t) Object.assign(out, t);
  else {
    // Không giải được bộ ba: lấy số có nhãn rõ ràng (để người nhập bổ sung phần còn lại)
    const lit = s.match(/(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:l[íi]t|lit)\b/i);
    if (lit) { const r = vnNumberReadings(lit[1]).filter((v) => v > 0 && v <= 400); if (r.length) out.liters = round2(r[r.length - 1]); }
    const tot = s.match(/t[ổo]ng\s*(?:c[ộo]ng\s*)?(?:ti[ềe]n\s*)?thanh\s*to[áa]n[^\d\n]{0,40}(\d[\d.,]*\d)/i);
    if (tot) { const r = vnNumberReadings(tot[1]).filter((v) => v >= 1000); if (r.length) out.amount = Math.max(...r); }
    if (out.liters && out.amount) out.unit_price = Math.round(out.amount / out.liters);
  }
  out.found = out.liters > 0;
  if (!out.found) out.note = 'Chưa đọc được số lít.';
  return out;
}
