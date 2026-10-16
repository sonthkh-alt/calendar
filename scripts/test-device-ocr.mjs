// Kiểm chứng ĐỌC TRÊN MÁY (miễn phí, không khóa API): chọn số ODO từ chữ nhận dạng, tiền xử lý ảnh, tự dò
// dãy chữ số, đọc hóa đơn điện tử XML / chữ trong PDF / văn bản nhận dạng, và CHẠY THẬT Tesseract trên
// ảnh đồng hồ mô phỏng (LCD 7 đoạn + màn hình chữ sáng). npm run test:device-ocr
import { createRequire } from 'module';
import { build } from 'esbuild';
import { ROBOTO_VFS } from '../src/lib/pdfFonts.js';
const require = createRequire(import.meta.url);
await build({
  stdin: {
    contents: "export * from './src/lib/ocrImage.js'; export * from './src/lib/odoOcr.js'; export * from './src/lib/invoiceParse.js'; export { pdfTextFromData } from './src/lib/deviceOcr.js';",
    resolveDir: '.', loader: 'js',
  },
  bundle: true, format: 'cjs', platform: 'node', outfile: 'scripts/.device-ocr.cjs', logLevel: 'silent',
  external: ['tesseract.js', 'pdfjs-dist/*'],
  plugins: [{ name: 'stub', setup(b) {
    b.onResolve({ filter: /\/supabase$/ }, () => ({ path: 'supabase', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = null;' }));
  } }],
});
const L = require('./.device-ocr.cjs');
let pass = true;
const must = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) pass = false; };
const eq = (a, b, m) => must(JSON.stringify(a) === JSON.stringify(b), `${m} (được ${JSON.stringify(a)}, cần ${JSON.stringify(b)})`);

// ---------- Chọn số ODO ----------
eq(L.pickOdoCandidate('10001055266117', 55129).value, 55266, 'Viền màn hình dính vào số -> dò chuỗi con hợp lý so với lần ghi trước');
eq(L.pickOdoCandidate('1203417..7', 203280).value, 203417, 'Tách chỗ nhiều dấu liền nhau');
eq(L.pickOdoCandidate('7125486.', null).value, 125486, 'Không có lần trước: dãy 7 chữ số -> bỏ ký tự nhiễu mép trái (ODO tối đa 6 chữ số)');
eq(L.pickOdoCandidate('ODO 055266 km TRIP 123.4', 55235).value, 55266, 'Vẫn bỏ TRIP có thập phân');
eq(L.pickOdoCandidate('77777777', 55235).value, null, 'Chuỗi con không hợp lý -> không tin');
eq(L.voteOdo(['125486', '', '125436', '125486'], null).value, 125486, 'Bỏ phiếu: số được nhiều lượt đọc ra thắng');
eq(L.voteOdo(['', ''], 1000).value, null, 'Không lượt nào ra số -> null');
const regs = L.odoRegions({ saved: { x: 0.1, y: 0.1, w: 0.3, h: 0.1 }, detected: [{ x: 0.2, y: 0.5, w: 0.3, h: 0.1 }] });
eq(regs.map((r) => r.kind), ['rect', 'auto', 'full'], 'Thứ tự vùng: vùng đã nhớ -> vùng tự dò -> cả ảnh');
eq(L.odoRegions({ rect: { x: 0, y: 0, w: 1, h: 1 } }).length, 1, 'Lái xe vừa khoanh: chỉ đọc vùng đó');
must(L.validRect({ x: 0.2, y: 0.3, w: 0.4, h: 0.1 }) && !L.validRect({ x: 0.9, y: 0.3, w: 0.4, h: 0.1 }) && !L.validRect(null), 'Kiểm tra vùng khoanh hợp lệ');
const pd = L.padDetected({ x: 0.4, y: 0.5, w: 0.2, h: 0.1 }, 4 / 3);
must(pd.x < 0.4 && pd.x + pd.w > 0.6 && pd.y < 0.5, 'Nới vùng tự dò sang hai bên');

// ---------- Tiền xử lý ảnh ----------
const W = 60, H = 20;
const gray = new Uint8ClampedArray(W * H).fill(30); // nền tối, chữ sáng
for (let y = 5; y < 15; y += 1) for (let x = 20; x < 24; x += 1) gray[y * W + x] = 220;
for (let y = 0; y < H; y += 1) gray[y * W] = 220; // vệt sáng dính mép trái
const bin = L.binarize(gray);
must(bin[10 * W + 21] === 0 && bin[2 * W + 40] === 255, 'Nhị phân tự đảo: chữ sáng trên nền tối -> chữ đen nền trắng');
const clean = L.cleanBinary(bin, W, H, { minArea: 3 });
must(clean[10 * W] === 255 && clean[10 * W + 21] === 0, 'Xóa mảng dính mép (viền màn hình), giữ chữ');
eq(L.rectToPixels({ x: 0.5, y: 0.5, w: 0.25, h: 0.25 }, 400, 200, 0), { sx: 200, sy: 100, sw: 100, sh: 50 }, 'Đổi vùng tỉ lệ -> pixel');

// ---------- Hóa đơn: số viết kiểu Việt Nam ----------
eq(L.vnNumberReadings('1.234.567'), [1234567], 'Số có dấu chấm phân nhóm nghìn');
eq(L.vnNumberReadings('20.500,00'), [20500], 'Số có cả dấu nghìn và thập phân');
eq(L.vnNumberReadings('45,500'), [45500, 45.5], 'Số mơ hồ "45,500" -> hai cách hiểu');
eq(L.vnNumberReadings('45,5'), [45.5], 'Thập phân 1 chữ số');
eq(L.findPlate('Biển số xe: 36a-123.68'), '36A-123.68', 'Biển số chuẩn hóa');
eq(L.findPlate('BKS 36A12368 nhận hàng'), '36A-123.68', 'Biển số viết liền');
eq(L.findPlate('Xe 36LD-012.34'), '36LD-012.34', 'Biển số 2 chữ cái');
eq(L.detectFuelType('CÔNG TY XĂNG DẦU THANH HÓA — Dầu DO 0,05S-II'), 'dau', 'Loại: dầu DO (không nhầm tên "Công ty xăng dầu")');
eq(L.detectFuelType('Công ty Xăng dầu — Xăng RON 95-III'), 'xang', 'Loại: xăng RON 95');
eq(L.detectFuelType('Xăng sinh học E5 RON 92-II'), 'xang', 'Loại: xăng E5');

// ---------- Hóa đơn điện tử XML (Thông tư 78) ----------
const xml = `<?xml version="1.0" encoding="UTF-8"?><HDon><DLHDon Id="data"><TTChung><PBan>2.0.1</PBan><THDon>HÓA ĐƠN GIÁ TRỊ GIA TĂNG</THDon>
<KHMSHDon>1</KHMSHDon><KHHDon>C26TXD</KHHDon><SHDon>0012345</SHDon><NLap>2026-10-15</NLap><DVTTe>VND</DVTTe></TTChung>
<NDHDon><NBan><Ten>CÔNG TY XĂNG DẦU THANH HÓA &amp; CHI NHÁNH</Ten><MST>2800123456</MST></NBan>
<NMua><Ten>VĂN PHÒNG ĐOÀN ĐBQH VÀ HĐND TỈNH THANH HÓA</Ten></NMua>
<DSHHDVu><HHDVu><TChat>1</TChat><STT>1</STT><THHDVu>Dầu DO 0,05S-II</THHDVu><DVTinh>Lít</DVTinh><SLuong>45.5</SLuong><DGia>18636.364</DGia><ThTien>847955</ThTien><TSuat>10%</TSuat></HHDVu></DSHHDVu>
<TToan><TgTCThue>847955</TgTCThue><TgTThue>84795</TgTThue><TgTTTBSo>932750</TgTTTBSo></TToan>
<TTKhac><TTin><TTruong>Biển số xe</TTruong><KDLieu>string</KDLieu><DLieu>36A-123.68</DLieu></TTin></TTKhac></NDHDon></DLHDon></HDon>`;
const X1 = L.parseInvoiceXml(xml);
eq([X1.found, X1.invoice_no, X1.invoice_date, X1.fuel_type, X1.liters, X1.amount, X1.unit_price, X1.plate],
  [true, '12345', '2026-10-15', 'dau', 45.5, 932750, 20500, '36A-123.68'], 'XML: số HĐ, ngày, loại, lít, tổng tiền gồm thuế, đơn giá/lít, biển số');
eq(X1.seller, 'CÔNG TY XĂNG DẦU THANH HÓA & CHI NHÁNH', 'XML: đơn vị bán (giải mã &amp;)');
const xml2 = xml.replace('</HHDVu></DSHHDVu>', '</HHDVu><HHDVu><TChat>1</TChat><THHDVu>Dầu nhớt Castrol</THHDVu><DVTinh>Can</DVTinh><SLuong>1</SLuong><DGia>200000</DGia><ThTien>200000</ThTien><TSuat>10%</TSuat></HHDVu></DSHHDVu>')
  .replace('<TgTTTBSo>932750</TgTTTBSo>', '<TgTTTBSo>1152750</TgTTTBSo>');
const X2 = L.parseInvoiceXml(xml2);
eq([X2.liters, X2.amount], [45.5, 932751], 'XML có thêm dầu nhớt: chỉ tính phần nhiên liệu (thành tiền × thuế suất)');
must(!L.parseInvoiceXml('<root><a>1</a></root>').found, 'XML không phải hóa đơn -> không nhận');

// ---------- Hóa đơn từ VĂN BẢN (PDF / nhận dạng ảnh) ----------
const T1 = `HÓA ĐƠN GIÁ TRỊ GIA TĂNG (VAT INVOICE)
Ký hiệu (Serial): 1C26TAA Số (No.): 00004567
Ngày (Date) 05 tháng (month) 10 năm (year) 2026
Đơn vị bán hàng (Seller): CỬA HÀNG XĂNG DẦU SỐ 1 - PETROLIMEX THANH HÓA
Mã số thuế (Tax code): 2800123456
Tên đơn vị mua: Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa. Biển số: 36A-003.42
STT Tên hàng hóa, dịch vụ ĐVT Số lượng Đơn giá Thành tiền
1 Xăng RON 95-III Lít 40,250 21.500 865.375
Cộng tiền hàng: 786.705
Thuế suất GTGT: 10% Tiền thuế GTGT: 78.670
Tổng cộng tiền thanh toán (Total payment): 865.375`;
const P1 = L.parseInvoiceText(T1, 'pdf');
eq([P1.found, P1.invoice_no, P1.invoice_date, P1.fuel_type, P1.liters, P1.unit_price, P1.amount, P1.plate],
  [true, '4567', '2026-10-05', 'xang', 40.25, 21500, 865375, '36A-003.42'], 'Văn bản: giải bộ ba lít × đơn giá = thành tiền ("40,250" là 40,25 lít)');
must(/PETROLIMEX/.test(P1.seller), 'Văn bản: đơn vị bán');
const T2 = 'PHIẾU XUẤT KHO KIÊM HĐ\nNgày 12/10/2026\nDầu DO 0,05S  SL: 50 lít  Đơn giá chưa thuế: 18.000\nTổng tiền thanh toán: 990.000';
const P2 = L.parseInvoiceText(T2, 'ocr');
eq([P2.liters, P2.amount, P2.unit_price, P2.invoice_date, P2.fuel_type], [50, 990000, 19800, '2026-10-12', 'dau'], 'Đơn giá CHƯA thuế: thành tiền = lít × giá × 1,1 -> đơn giá thực trả/lít');
const P3 = L.parseInvoiceText('Ảnh mờ, chỉ thấy: Tổng tiền thanh toán 500.000', 'ocr');
must(!P3.found && P3.amount === 500000, 'Không đủ số lít -> chưa nhận, nhưng vẫn giữ số tiền đọc được để người nhập bổ sung');

// ---------- PDF THẬT: dựng hóa đơn bằng pdfmake -> pdf.js lấy chữ -> đọc ----------
const PdfPrinter = require('pdfmake');
const b64 = (n) => Buffer.from(ROBOTO_VFS[n], 'base64');
const printer = new PdfPrinter({ Roboto: { normal: b64('Roboto-Regular.ttf'), bold: b64('Roboto-Medium.ttf'), italics: b64('Roboto-Italic.ttf'), bolditalics: b64('Roboto-MediumItalic.ttf') } });
const pdfBuf = await new Promise((resolve) => {
  const doc = printer.createPdfKitDocument({
    content: [
      { text: 'HÓA ĐƠN GIÁ TRỊ GIA TĂNG', bold: true, alignment: 'center' },
      { columns: [{ text: 'Ký hiệu: 1C26TXD' }, { text: 'Số (No.): 0000789', alignment: 'right' }] },
      'Ngày 14 tháng 10 năm 2026',
      'Đơn vị bán hàng: CÔNG TY TNHH XĂNG DẦU HỒNG ĐỨC',
      'Biển số xe: 36A-123.68',
      { table: { body: [['STT', 'Tên hàng hóa', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền'], ['1', 'Dầu DO 0,05S-II', 'Lít', '52,000', '20.600', '1.071.200']] } },
      'Tổng cộng tiền thanh toán: 1.071.200',
    ],
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.end();
});
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { text: pdfText } = await L.pdfTextFromData(new Uint8Array(pdfBuf), pdfjs);
const P4 = L.parseInvoiceText(pdfText, 'pdf');
eq([P4.found, P4.invoice_no, P4.invoice_date, P4.fuel_type, P4.liters, P4.unit_price, P4.amount, P4.plate],
  [true, '789', '2026-10-14', 'dau', 52, 20600, 1071200, '36A-123.68'], 'PDF thật: pdf.js lấy chữ (gom theo dòng) -> đọc đủ trường');

// ---------- Tesseract THẬT trên ảnh đồng hồ mô phỏng ----------
let T, Cv;
try { T = require('tesseract.js'); Cv = require('@napi-rs/canvas'); } catch { T = null; }
if (!T || !Cv) {
  console.log('… bỏ qua phần nhận dạng ảnh thật (thiếu tesseract.js / @napi-rs/canvas)');
} else {
  const fs = require('fs'), path = require('path');
  const cache = path.resolve('scripts/.tess-cache');
  fs.mkdirSync(cache, { recursive: true });
  let workers = null;
  try {
    workers = {
      eng: await T.createWorker('eng', 1, { cachePath: cache }),
      ssd: await T.createWorker('ssd_int', 1, { langPath: path.resolve('public/tessdata'), gzip: false, cachePath: cache }),
    };
  } catch (e) {
    console.log('… bỏ qua phần nhận dạng ảnh thật (không tải được dữ liệu nhận dạng: ' + (e?.message || e) + ')');
  }
  if (workers) {
    const { createCanvas } = Cv;
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
    const seg7 = (ctx, str, x, y, h, color) => {
      const w = h * 0.52, t = h * 0.15;
      ctx.fillStyle = color;
      for (const ch of str) {
        const S = { a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + h / 2 - t / 2, w - 2 * t, t], f: [x, y + t, t, h / 2 - 1.5 * t], b: [x + w - t, y + t, t, h / 2 - 1.5 * t], e: [x, y + h / 2 + t / 2, t, h / 2 - 1.5 * t], c: [x + w - t, y + h / 2 + t / 2, t, h / 2 - 1.5 * t] };
        for (const k of SEG[ch]) { const [a, b2, c, d] = S[k]; ctx.fillRect(a + 0.5, b2 + 0.5, c - 1, d - 1); }
        x += w + h * 0.18;
      }
    };
    const scene = (draw, rot) => {
      const c = createCanvas(1200, 900), ctx = c.getContext('2d');
      ctx.fillStyle = '#15181c'; ctx.fillRect(0, 0, 1200, 900);
      ctx.strokeStyle = '#dde'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(600, 420, 330, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      ctx.fillStyle = '#eee'; ctx.font = 'bold 36px Arial';
      [20, 60, 100, 140, 180].forEach((v, i) => { const a = Math.PI * 0.75 + i * Math.PI * 1.5 / 4; ctx.fillText(String(v), 600 + Math.cos(a) * 270 - 25, 420 + Math.sin(a) * 270 + 12); });
      ctx.save(); ctx.translate(600, 640); ctx.rotate(rot * Math.PI / 180); draw(ctx); ctx.restore();
      const im = ctx.getImageData(0, 0, 1200, 900);
      for (let i = 0; i < im.data.length; i += 4) { const n = (rnd() - 0.5) * 26; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; }
      ctx.putImageData(im, 0, 0);
      return c;
    };
    const render = (img, rect, mode) => {
      const { sx, sy, sw, sh } = rect ? L.rectToPixels(rect, img.width, img.height) : { sx: 0, sy: 0, sw: img.width, sh: img.height };
      const k = L.scaleFor(sw, sh, { crop: !!rect });
      const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
      const c = createCanvas(w, h), x = c.getContext('2d');
      x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      const id = x.getImageData(0, 0, w, h);
      let g = L.stretch(L.toGray(id));
      g = mode !== 'gray' ? L.cleanBinary(L.binarize(g), w, h) : L.lightBackground(g);
      id.data.set(L.grayToRgba(g, w, h).data); x.putImageData(id, 0, 0);
      const P = rect ? 16 : 0, c2 = createCanvas(w + 2 * P, h + 2 * P), x2 = c2.getContext('2d');
      x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height); x2.drawImage(c, P, P);
      return mode === 'seg7' ? L.decodeSevenSegment(L.toGray(x2.getImageData(0, 0, c2.width, c2.height)), c2.width, c2.height) : c2.toBuffer('image/png');
    };
    // Cùng quy trình với deviceOcr.readOdoOnDevice (dò vùng -> các lượt đọc -> dừng sớm / bỏ phiếu)
    const readOdo = async (img, { lastOdo = null, rect = null } = {}) => {
      const s = createCanvas(500, Math.round(500 * img.height / img.width)), sx = s.getContext('2d');
      sx.drawImage(img, 0, 0, s.width, s.height);
      const detected = rect ? [] : L.findDigitRows(sx.getImageData(0, 0, s.width, s.height), { max: 4 }).map((r) => L.padDetected(r, s.width / s.height));
      const texts = [];
      outer: for (const region of L.odoRegions({ rect, detected })) {
        for (const p of L.odoPassPlan(region.kind)) {
          let text;
          if (p.lang === 'seg7') text = render(img, region.rect, 'seg7');
          else {
            const w = workers[p.lang];
            await w.setParameters({ tessedit_char_whitelist: '0123456789., ', tessedit_pageseg_mode: p.psm });
            text = (await w.recognize(render(img, region.rect, p.mode))).data.text;
          }
          texts.push(text);
          const pk = L.pickOdoCandidate(text, lastOdo);
          if (lastOdo != null && pk.via === 'direct' && L.checkPlausible(pk.value, lastOdo).ok) break outer;
        }
      }
      if (process.env.OCR_DEBUG) console.log(JSON.stringify(texts));
      return { value: L.voteOdo(texts, lastOdo).value, detected };
    };
    const lcd = scene((ctx) => { ctx.fillStyle = '#a8bba2'; ctx.fillRect(-260, -70, 520, 150); ctx.fillStyle = '#222'; ctx.font = 'bold 26px Arial'; ctx.fillText('ODO', -245, -35); seg7(ctx, '125486', -150, -50, 90, '#18201b'); }, 2);
    const tft = scene((ctx) => { ctx.fillStyle = '#0b1016'; ctx.fillRect(-300, -70, 600, 150); ctx.fillStyle = '#e8f4ff'; ctx.font = 'bold 66px Arial'; ctx.fillText('ODO 055266 km', -270, 5); ctx.font = '28px Arial'; ctx.fillStyle = '#9ad'; ctx.fillText('TRIP A 123.4 km', -160, 58); }, 1.5);
    const amber = scene((ctx) => { ctx.fillStyle = '#050505'; ctx.fillRect(-270, -70, 540, 140); seg7(ctx, '203417', -210, -45, 88, '#ffb347'); }, -2);
    const close = (c) => { const z = createCanvas(1000, 750); z.getContext("2d").drawImage(c, 300, 430, 600, 450, 0, 0, 1000, 750); return z; };

    let r = await readOdo(lcd, { rect: { x: 0.33, y: 0.63, w: 0.38, h: 0.14 } });
    eq(r.value, 125486, 'Ảnh thật: đồng hồ LCD 7 đoạn, lái xe khoanh vùng -> đọc đúng (chưa có lần ghi trước)');
    r = await readOdo(tft, { rect: { x: 0.26, y: 0.63, w: 0.5, h: 0.1 }, lastOdo: 55120 });
    eq(r.value, 55266, 'Ảnh thật: màn hình chữ sáng nền tối, khoanh vùng -> đọc đúng, bỏ TRIP');
    r = await readOdo(close(amber), { rect: { x: 0.02, y: 0.36, w: 0.96, h: 0.3 }, lastOdo: 203280 });
    eq(r.value, 203417, 'Ảnh thật: LCD chữ cam nền đen (ảnh chụp gần), khoanh vùng -> đọc đúng');
    r = await readOdo(tft, { lastOdo: 55120 });
    must(r.detected.length > 0, 'Tự dò được dãy chữ số trên cả bảng đồng hồ (không cần khoanh)');
    eq(r.value, 55266, 'Ảnh thật: cả bảng đồng hồ, KHÔNG khoanh -> tự dò vùng + đọc đúng');
    for (const w of Object.values(workers)) await w.terminate();
  }
}

console.log(pass ? '\nTẤT CẢ ĐẠT' : '\nCÓ LỖI');
process.exit(pass ? 0 : 1);
