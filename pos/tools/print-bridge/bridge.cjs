const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 9123;
const PRINTER_NAME = process.env.PRINTER_NAME || 'Xprinter XP-80';
const RAW_PRINT_EXE = path.join(__dirname, 'rawprint.exe');
const isWin = process.platform === 'win32';

const setCorsHeaders = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
};

const server = http.createServer((req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', printer: PRINTER_NAME, port: PORT }));
    return;
  }

  if (req.method === 'POST' && req.url === '/print') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);

      if (isWin) {
        const child = spawn(RAW_PRINT_EXE, [PRINTER_NAME], {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.stdin.write(buffer);
        child.stdin.end();

        child.on('close', code => {
          if (code === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Printed directly to ' + PRINTER_NAME }));
          } else {
            console.error('Print failed with code', code, stderr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: stderr || 'Exit code ' + code }));
          }
        });

        child.on('error', err => {
          console.error('Failed to spawn rawprint.exe:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
      } else {
        // Linux / ChromeOS Crostini
        let devicePath = null;
        for (const candidate of ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/lp0']) {
          if (fs.existsSync(candidate)) {
            devicePath = candidate;
            break;
          }
        }

        if (devicePath) {
          try {
            fs.writeFileSync(devicePath, buffer);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Printed directly to ' + devicePath }));
            return;
          } catch (writeErr) {
            console.error('Direct device write failed, falling back to lp:', writeErr);
          }
        }

        const lpArgs = ['-o', 'raw'];
        if (PRINTER_NAME && PRINTER_NAME !== 'Xprinter XP-80') {
          lpArgs.unshift('-d', PRINTER_NAME);
        }
        const child = spawn('lp', lpArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.stdin.write(buffer);
        child.stdin.end();

        child.on('close', code => {
          if (code === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Printed via lp -o raw' }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: stderr || 'lp failed with code ' + code }));
          }
        });

        child.on('error', err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'No printer device found at /dev/usb/lp0 and lp command not available: ' + err.message 
          }));
        });
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ganewa Print Bridge active on http://0.0.0.0:${PORT} -> [${PRINTER_NAME}]`);
});
