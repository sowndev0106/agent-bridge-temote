import * as nodePty from 'node-pty';
import WebSocket from 'ws';

console.log('--- BAT DAU THU NGHIEM KET NOI WEBSOCKET CODEX ---');

const command = 'codex';
const port = 4099;
const args = ['app-server', '--listen', `ws://127.0.0.1:${port}`];

try {
  const child = nodePty.spawn(command, args, {
    name: 'xterm-256color',
    cwd: process.cwd(),
    env: process.env,
    cols: 200,
    rows: 40
  });

  console.log(`[PTY] Khoi tao Codex PID: ${child.pid}`);

  // Doi 2 giay de server khoi dong va lang nghe
  setTimeout(() => {
    const wsUrl = `ws://127.0.0.1:${port}`;
    console.log(`[WS] Dang ket noi toi ${wsUrl}...`);

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('[WS] Ket noi thanh cong! Dang gui ping/request...');
      
      // Gui message JSON-RPC phu hop voi MCP/protocol cua Codex
      const request = {
        jsonrpc: '2.0',
        id: '1',
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: { name: 'RemoteBridge-Test', version: '1.0.0' }
        }
      };
      
      ws.send(JSON.stringify(request));
      console.log(`[WS] Da gui: ${JSON.stringify(request)}`);
    });

    ws.on('message', (data) => {
      console.log(`[WS Nhận phản hồi]: ${data.toString()}`);
      console.log('[SUCCESS] Giao tiep qua WebSocket voi Codex thanh cong!');
      
      ws.close();
      child.kill('SIGTERM');
    });

    ws.on('error', (err) => {
      console.error('[WS ERROR]', err);
      child.kill('SIGTERM');
      process.exit(1);
    });

  }, 2000);

  child.onExit(({ exitCode, signal }) => {
    console.log(`[PTY] Codex thoat. ExitCode: ${exitCode}, Signal: ${signal}`);
    console.log('--- KET THUC THU NGHIEM ---');
    process.exit(0);
  });

} catch (err) {
  console.error('[ERROR]', err);
  process.exit(1);
}
