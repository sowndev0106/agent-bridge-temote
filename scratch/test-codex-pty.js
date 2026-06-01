import * as nodePty from 'node-pty';
import { stripTerminalSequences } from '../src/server/sessions/manager.js';
import { extractLink } from '../src/server/sessions/link-extractor.js';

console.log('--- BAT DAU THU NGHIEM TINH KHA THI CODEX PTY ---');

// Cấu hình tham số giống hệt lúc RemoteBridge chạy thực tế
const command = 'codex';
const port = 4098;
const args = ['app-server', '--listen', `ws://127.0.0.1:${port}`];
const linkPattern = `ws://127.0.0.1:\\d+`; // Khớp với ws://127.0.0.1:<port>

console.log(`Command: ${command} ${args.join(' ')}`);
console.log(`Pattern: ${linkPattern}`);

// Buffer để gộp dòng từ chunks dữ liệu
let buffer = '';

try {
  const child = nodePty.spawn(command, args, {
    name: 'xterm-256color',
    cwd: process.cwd(),
    env: process.env,
    cols: 200,
    rows: 40
  });

  console.log(`[PTY] Khoi tao thanh cong! PID: ${child.pid}`);

  const timeout = setTimeout(() => {
    console.error('[FAILED] Khong trich xuat duoc link trong 10 giay. Timeout!');
    child.kill('SIGKILL');
    process.exit(1);
  }, 10000);

  child.onData((data) => {
    buffer += data;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = stripTerminalSequences(rawLine);
      if (!line) continue;

      console.log(`[Codex Stdout] ${line}`);

      // Kiem tra xem co trung khop voi link khong
      const link = extractLink(line, linkPattern);
      if (link) {
        console.log('\n=========================================');
        console.log(`[SUCCESS] TRICH XUAT DUOC LINK REMOTE: ${link}`);
        console.log('=========================================\n');
        
        clearTimeout(timeout);

        // Thu nghiem dung tien trinh sach se
        console.log('[PTY] Dang dung tien trinh Codex...');
        child.kill('SIGTERM');
      }
    }
  });

  child.onExit(({ exitCode, signal }) => {
    console.log(`[PTY] Tien trinh Codex da thoat. ExitCode: ${exitCode}, Signal: ${signal}`);
    console.log('--- KET THUC THU NGHIEM THANH CONG ---');
    process.exit(0);
  });

} catch (err) {
  console.error('[ERROR] Co loi khi khoi chay node-pty:', err);
  process.exit(1);
}
