// Cầu nối Node -> PowerShell -> kho chứng thư Windows (USB token SafeNet).
// Không dùng thư viện biên dịch (native) nào để cài đặt trên máy văn phòng cho nhẹ.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PS1 = path.join(HERE, 'winsign.ps1');
const PS = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe';

// windowsHide: ẩn cửa sổ PowerShell. RIÊNG lúc KÝ thì KHÔNG ẩn — tiến trình có cửa sổ
// thật trên màn hình nền giúp hộp nhập mã PIN của SafeNet hiện ra đúng chỗ (ẩn đi dễ bị
// CryptoAPI báo "The operation was canceled by the user").
function run(args, timeoutMs, hide = true) {
  return new Promise((resolve, reject) => {
    execFile(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args],
      { timeout: timeoutMs, windowsHide: hide, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || stdout || err.message || '').toString().trim();
          reject(new Error(msg || 'PowerShell lỗi không rõ nguyên nhân'));
          return;
        }
        resolve((stdout || '').toString());
      });
  });
}

const tmp = (name) => path.join(os.tmpdir(), `kyso-${process.pid}-${Date.now()}-${name}`);

// Danh sách chứng thư có khóa riêng trong kho CurrentUser\My (gồm chứng thư trên token)
export async function listCertificates() {
  const out = tmp('certs.json');
  try {
    await run(['-Mode', 'list', '-Out', out], 30000);
    const json = await fs.readFile(out, 'utf8');
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [arr];
  } finally {
    await fs.rm(out, { force: true });
  }
}

/**
 * Ký PKCS#7 detached (DER) trên `content`.
 * SafeNet sẽ hiện hộp nhập mã PIN -> để timeout rộng (mặc định 3 phút).
 */
export async function signDetachedCms(content, thumbprint, { sha1 = false, timeoutMs = 180000 } = {}) {
  const inFile = tmp('tbs.bin');
  const outFile = tmp('sig.der');
  try {
    await fs.writeFile(inFile, content);
    const args = ['-Mode', 'sign', '-In', inFile, '-Out', outFile, '-Thumbprint', thumbprint];
    if (sha1) args.push('-Sha1');
    await run(args, timeoutMs, false);
    return await fs.readFile(outFile);
  } finally {
    await fs.rm(inFile, { force: true });
    await fs.rm(outFile, { force: true });
  }
}
