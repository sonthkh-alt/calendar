// TIỀN XỬ LÝ ẢNH cho nhận dạng chữ NGAY TRÊN MÁY (Tesseract) — HÀM THUẦN trên { data, width, height }
// (RGBA, cùng dạng ImageData của canvas) để test được ở node. Ảnh chụp đồng hồ thường tối, lóa, chữ
// sáng trên nền tối (hoặc ngược lại) — Tesseract đọc tốt nhất khi CHỮ ĐEN TRÊN NỀN TRẮNG, cỡ chữ vừa phải.

/** Ảnh xám (độ sáng cảm nhận). Trả Uint8ClampedArray width*height. */
export function toGray({ data, width, height }) {
  const g = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j += 1) g[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  return g;
}

/** Kéo giãn tương phản: bỏ 1% điểm tối nhất / sáng nhất rồi trải về 0..255. */
export function stretch(gray) {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v] += 1;
  const cut = gray.length * 0.01;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < cut) lo += 1;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < cut) hi -= 1;
  if (hi <= lo) return gray;
  const out = new Uint8ClampedArray(gray.length);
  const k = 255 / (hi - lo);
  for (let i = 0; i < gray.length; i += 1) out[i] = (gray[i] - lo) * k;
  return out;
}

/** Ngưỡng Otsu (tách chữ / nền tối ưu theo histogram). */
export function otsu(gray) {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v] += 1;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/**
 * Nhị phân hóa + TỰ CHỌN CHIỀU: chữ luôn là phần ÍT điểm hơn -> đảo để chữ đen / nền trắng
 * (đồng hồ chữ sáng trên nền tối sẽ được đảo). Trả mảng xám 0/255.
 */
export function binarize(gray, thr = otsu(gray)) {
  let dark = 0;
  for (const v of gray) if (v <= thr) dark += 1;
  const invert = dark > gray.length / 2;
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    const isDark = gray[i] <= thr;
    out[i] = (isDark !== invert) ? 0 : 255;
  }
  return out;
}

/**
 * Làm sạch ảnh nhị phân (chữ = 0, nền = 255): xóa VIỀN dính mép vùng cắt (khung màn hình, mép bảng đồng hồ
 * — hay bị đọc thành "1": mảng chạm mép mà dài gần hết chiều cao / quá nửa chiều rộng) và các đốm nhỏ hơn
 * `minArea` điểm. Chữ số bị khung cắt sát mép vẫn được giữ. Trả mảng mới.
 */
export function cleanBinary(bin, width, height, { minArea = null } = {}) {
  const out = new Uint8ClampedArray(bin);
  const seen = new Uint8Array(bin.length);
  const min = minArea ?? Math.max(6, Math.round(width * height * 0.00015));
  const stack = new Int32Array(bin.length);
  for (let start = 0; start < bin.length; start += 1) {
    if (out[start] !== 0 || seen[start]) continue;
    let top = 0, n = 0, border = false, x0 = width, x1 = 0, y0 = height, y1 = 0, edges = 0;
    stack[top++] = start; seen[start] = 1;
    const members = [];
    while (top) {
      const p = stack[--top];
      members.push(p); n += 1;
      const x = p % width, y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x === 0) edges |= 1;
      if (x === width - 1) edges |= 2;
      if (y === 0) edges |= 4;
      if (y === height - 1) edges |= 8;
      border = edges !== 0;
      if (x > 0 && !seen[p - 1] && out[p - 1] === 0) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < width - 1 && !seen[p + 1] && out[p + 1] === 0) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && !seen[p - width] && out[p - width] === 0) { seen[p - width] = 1; stack[top++] = p - width; }
      if (y < height - 1 && !seen[p + width] && out[p + width] === 0) { seen[p + width] = 1; stack[top++] = p + width; }
    }
    const corner = ((edges & 3) && (edges & 12)) || (edges & 3) === 3 || (edges & 12) === 12; // chạm ≥ 2 mép
    const frame = border && (corner || y1 - y0 + 1 > height * 0.85 || x1 - x0 + 1 > width * 0.5 || n < min * 3);
    if (frame || n < min) for (const p of members) out[p] = 255;
  }
  return out;
}

// Mẫu 7 đoạn: a (trên), b (phải trên), c (phải dưới), d (dưới), e (trái dưới), f (trái trên), g (giữa)
const SEG7 = {
  abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', acdfg: '5', acdefg: '6', abc: '7', abcf: '7',
  abcdefg: '8', abcdfg: '9', abcfg: '9', cdefg: '6',
};

/**
 * GIẢI MÃ CHỮ SỐ 7 ĐOẠN (đồng hồ LCD) KHÔNG CẦN MÔ HÌNH — cách của công cụ ssocr: trên ảnh nhị phân của
 * vùng số (chữ = 0), lấy DẢI DÒNG cao nhất có mực (dãy ODO là chữ to nhất), tách chữ số theo các cột trống,
 * rồi xét 7 vùng đoạn trong mỗi chữ số có mực hay không -> tra bảng. Chữ số hẹp (< 35% chiều cao) là "1".
 * Trả chuỗi chữ số — '' nếu không thấy dãy nào hoặc có chữ số không giải được.
 */
export function decodeSevenSegment(bin, W, H) {
  const ink = (x, y) => bin[y * W + x] === 0;
  // 1) dải dòng: các dòng có mực (> 1% chiều rộng), nối khe ≤ 2% chiều cao, chọn dải cao nhất
  const rowInk = new Array(H).fill(0);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (ink(x, y)) rowInk[y] += 1;
  const bands = [];
  const gapRows = Math.max(1, Math.round(H * 0.02));
  for (let y = 0; y < H; y += 1) {
    if (rowInk[y] <= W * 0.01) continue;
    const last = bands[bands.length - 1];
    if (last && y - last.y1 <= gapRows + 1) last.y1 = y;
    else bands.push({ y0: y, y1: y });
  }
  if (!bands.length) return '';
  const band = bands.reduce((a, b) => (b.y1 - b.y0 > a.y1 - a.y0 ? b : a));
  const bh = band.y1 - band.y0 + 1;
  if (bh < 8) return '';
  // 2) tách chữ số theo cột: cột có mực trong dải; nối khe ≤ 4% chiều cao dải (góc giữa các đoạn)
  const colInk = new Array(W).fill(0);
  for (let x = 0; x < W; x += 1) for (let y = band.y0; y <= band.y1; y += 1) if (ink(x, y)) colInk[x] += 1;
  const runs = [];
  const gapCols = Math.max(1, Math.round(bh * 0.04));
  for (let x = 0; x < W; x += 1) {
    if (!colInk[x]) continue;
    const last = runs[runs.length - 1];
    if (last && x - last.x1 <= gapCols + 1) last.x1 = x;
    else runs.push({ x0: x, x1: x });
  }
  // khung dọc từng cụm; chiều cao chuẩn = cụm cao nhất ("1", "4", "7" không có đoạn trên/dưới nên thấp hơn)
  for (const r of runs) {
    let y0 = band.y1, y1 = band.y0;
    for (let y = band.y0; y <= band.y1; y += 1) {
      for (let x = r.x0; x <= r.x1; x += 1) {
        if (ink(x, y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
      }
    }
    Object.assign(r, { y0, y1, w: r.x1 - r.x0 + 1, h: y1 - y0 + 1 });
  }
  const ref = Math.max(0, ...runs.filter((r) => r.w <= r.h * 1.2).map((r) => r.h));
  let out = '';
  for (const r of runs) {
    const { y0, w, h } = r;
    if (h < ref * 0.5) continue;           // chữ nhỏ ("km", dấu chấm) -> bỏ
    if (w > h * 1.2) continue;             // vệt ngang dài -> không phải chữ số
    if (w < h * 0.35) { out += '1'; continue; }
    const fill = (fx0, fx1, fy0, fy1) => {
      let n = 0, t = 0;
      const ax = r.x0 + Math.floor(w * fx0), bx = r.x0 + Math.ceil(w * fx1) - 1;
      const ay = y0 + Math.floor(h * fy0), by = y0 + Math.ceil(h * fy1) - 1;
      for (let y = ay; y <= by; y += 1) for (let x = ax; x <= bx; x += 1) { t += 1; if (ink(x, y)) n += 1; }
      return t ? n / t : 0;
    };
    const on = {
      a: fill(0.3, 0.7, 0, 0.18), g: fill(0.3, 0.7, 0.41, 0.59), d: fill(0.3, 0.7, 0.82, 1),
      f: fill(0, 0.3, 0.18, 0.42), b: fill(0.7, 1, 0.18, 0.42), e: fill(0, 0.3, 0.58, 0.82), c: fill(0.7, 1, 0.58, 0.82),
    };
    const key = 'abcdefg'.split('').filter((k) => on[k] > 0.18).join('');
    out += SEG7[key] ?? '?';
  }
  // có chữ số không giải được -> không phải màn hình 7 đoạn (hoặc ảnh quá xấu): bỏ, để Tesseract đọc
  return out.includes('?') ? '' : out;
}

/** Đảo chiều sao cho nền (đa số) sáng — dùng cho ảnh xám chưa nhị phân. */
export function lightBackground(gray) {
  let s = 0;
  for (const v of gray) s += v;
  if (s / gray.length >= 128) return gray;
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i += 1) out[i] = 255 - gray[i];
  return out;
}

/**
 * TỰ DÒ DÃY CHỮ SỐ trong ảnh (để không bắt lái xe khoanh vùng): ngưỡng THÍCH NGHI theo vùng (chịu được
 * lóa sáng), lấy các mảng chữ TỐI và SÁNG (đồng hồ LCD chữ tối / màn hình chữ sáng), nới 1 điểm để các
 * đoạn của chữ số 7 đoạn dính lại, rồi nối các mảng CAO BẰNG NHAU, THẲNG HÀNG, sát nhau thành dãy.
 * Dãy ≥ 4 ký tự (ODO có 5–7 chữ số; số trên mặt đồng hồ tốc độ chỉ 2–3) -> vùng ứng viên.
 * img nên nhỏ (cạnh dài ~500px) cho nhanh. Trả tối đa `max` vùng { x, y, w, h } tỉ lệ 0..1, tốt nhất trước.
 */
export function findDigitRows(img, { max = 4 } = {}) {
  const { width: W, height: H } = img;
  const g = stretch(toGray(img));
  // ảnh tích phân -> trung bình cửa sổ
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y += 1) {
    let row = 0;
    for (let x = 0; x < W; x += 1) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
  }
  const r = Math.max(4, Math.round(Math.max(W, H) / 16));
  const mean = (x, y) => {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
    return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  };
  const C = 18;
  const rows = [];
  for (const polarity of [-1, 1]) {
    const m = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const d = g[y * W + x] - mean(x, y);
      if (polarity < 0 ? d < -C : d > C) m[y * W + x] = 1;
    }
    // 3 cách: giữ nguyên; NỚI THEO CHIỀU DỌC (dính các đoạn của chữ số 7 đoạn mà không dính sang chữ số bên
    // cạnh); nới dọc + 1 điểm ngang (các đoạn chỉ chạm nhau ở góc, ảnh thu nhỏ)
    const ry = Math.max(1, Math.round(H / 140));
    const dilate = (rx) => {
      const md2 = new Uint8Array(W * H);
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        if (!m[y * W + x]) continue;
        for (let dy = -ry; dy <= ry; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -rx; dx <= rx; dx += 1) { const xx = x + dx; if (xx >= 0 && xx < W) md2[yy * W + xx] = 1; }
        }
      }
      return md2;
    };
    for (const md of [m, dilate(0), dilate(1)]) {
    // các mảng liên thông
    const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), comps = [];
    for (let s = 0; s < W * H; s += 1) {
      if (!md[s] || seen[s]) continue;
      let top = 0, n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
      stack[top++] = s; seen[s] = 1;
      while (top) {
        const p = stack[--top]; n += 1;
        const x = p % W, y = (p - x) / W;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && md[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
        if (x < W - 1 && md[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
        if (y > 0 && md[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[top++] = p - W; }
        if (y < H - 1 && md[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[top++] = p + W; }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (h < Math.max(8, H * 0.025) || h > H * 0.6) continue;
      if (w > h * 1.1 || w < h * 0.12) continue;
      if (n < w * h * 0.12) continue;
      comps.push({ x0, y0, x1, y1, w, h, cy: (y0 + y1) / 2 });
    }
    comps.sort((a, b) => a.x0 - b.x0);
    // nối thành dãy
    const used = new Set();
    for (let i = 0; i < comps.length; i += 1) {
      if (used.has(i)) continue;
      const chain = [comps[i]];
      let last = comps[i];
      for (let j = i + 1; j < comps.length; j += 1) {
        const c = comps[j];
        if (used.has(j)) continue;
        const gap = c.x0 - last.x1;
        if (gap > last.h * 0.9) { if (c.x0 - last.x1 > last.h * 3) break; continue; }
        if (gap < -last.h * 0.2) continue;
        if (Math.abs(c.cy - last.cy) > last.h * 0.3 || c.h / last.h > 1.35 || c.h / last.h < 0.74) continue;
        chain.push(c); used.add(j); last = c;
      }
      if (chain.length < 4 || chain.length > 10) continue;
      const x0 = Math.min(...chain.map((c) => c.x0)), x1 = Math.max(...chain.map((c) => c.x1));
      const y0 = Math.min(...chain.map((c) => c.y0)), y1 = Math.max(...chain.map((c) => c.y1));
      const hAvg = chain.reduce((s, c) => s + c.h, 0) / chain.length;
      const score = (chain.length >= 5 && chain.length <= 7 ? 3 : 1) + hAvg / H * 10;
      rows.push({ x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H, score, n: chain.length });
    }
    }
  }
  // vùng chồng nhau (cùng một dãy dò theo nhiều cách) -> GỘP thành vùng bao (không cắt mất chữ số)
  rows.sort((a, b) => b.score - a.score);
  const out = [];
  for (const rw of rows) {
    const o = out.find((q) => {
      const ix = Math.max(0, Math.min(q.x + q.w, rw.x + rw.w) - Math.max(q.x, rw.x));
      const iy = Math.max(0, Math.min(q.y + q.h, rw.y + rw.h) - Math.max(q.y, rw.y));
      return ix * iy > 0.3 * Math.min(q.w * q.h, rw.w * rw.h);
    });
    if (o) {
      const x1 = Math.max(o.x + o.w, rw.x + rw.w), y1 = Math.max(o.y + o.h, rw.y + rw.h);
      o.x = Math.min(o.x, rw.x); o.y = Math.min(o.y, rw.y); o.w = x1 - o.x; o.h = y1 - o.y;
    } else if (out.length < max) out.push({ ...rw });
  }
  return out.map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/** Mảng xám -> RGBA { data, width, height } (để putImageData / đưa vào Tesseract). */
export function grayToRgba(gray, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0, i = 0; j < gray.length; j += 1, i += 4) {
    data[i] = data[i + 1] = data[i + 2] = gray[j];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

/**
 * Vùng cắt (tỉ lệ 0..1 theo ảnh) -> khung pixel, nới thêm lề `pad` (tỉ lệ theo cạnh vùng), kẹp trong ảnh.
 * rect: { x, y, w, h } tỉ lệ. Trả { sx, sy, sw, sh } số nguyên.
 */
export function rectToPixels(rect, width, height, pad = 0.08) {
  const px = rect.w * pad, py = rect.h * pad;
  const x0 = Math.max(0, (rect.x - px) * width), y0 = Math.max(0, (rect.y - py) * height);
  const x1 = Math.min(width, (rect.x + rect.w + px) * width), y1 = Math.min(height, (rect.y + rect.h + py) * height);
  return { sx: Math.floor(x0), sy: Math.floor(y0), sw: Math.max(1, Math.round(x1 - x0)), sh: Math.max(1, Math.round(y1 - y0)) };
}

/**
 * Kích thước đưa vào Tesseract: vùng cắt (1 dòng số) phóng sao cho cao ~`lineHeight` px;
 * ảnh nguyên giữ cạnh dài ≤ `maxSide`. Trả hệ số phóng.
 */
export function scaleFor(sw, sh, { crop = false, lineHeight = 90, maxSide = 1600 } = {}) {
  if (crop) return Math.min(4, Math.max(0.5, lineHeight / sh), 2400 / sw);
  return Math.min(1, maxSide / Math.max(sw, sh));
}
