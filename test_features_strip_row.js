const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACTS_DIR = 'C:\\Users\\gabri\\.gemini\\antigravity-ide\\brain\\45508123-a705-4dd9-89b4-6799adfd4dc2';

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.id && this.pending.has(data.id)) {
            const { resolve, reject } = this.pending.get(data.id);
            this.pending.delete(data.id);
            if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
            else resolve(data.result);
          }
        } catch (e) {
          console.error('Erro CDP:', e);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const fullPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    console.log(`📸 Screenshot salvo: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return fullPath;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const remotePort = 9226;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-features-' + Date.now());

  console.log('🚀 Iniciando Chrome...');
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1366,768',
    'http://localhost:8000/#home'
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const resp = await fetch(`http://127.0.0.1:${remotePort}/json`);
        const targets = await resp.json();
        const page = targets.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error('Não foi possível conectar ao Chrome');

    const cdp = new CDPClient(wsUrl);
    await cdp.connect();
    console.log('🔗 Conectado via Chrome CDP!');

    await sleep(2000);

    // Fazer login como convidado caso esteja na tela de auth
    await cdp.eval(`
      (async () => {
        const guestBtn = document.getElementById('btn-guest-login');
        if (guestBtn) guestBtn.click();
        else await App.navigate('home');
      })()
    `);
    await sleep(1000);

    // Validar alinhamento dos 6 itens da features-strip
    const check = await cdp.eval(`
      (function() {
        const strip = document.querySelector('.features-strip');
        if (!strip) return { error: 'features-strip não encontrada' };
        const items = Array.from(strip.querySelectorAll('.feature-item'));
        const rects = items.map(el => {
          const r = el.getBoundingClientRect();
          return {
            text: el.querySelector('strong')?.innerText,
            top: Math.round(r.top),
            left: Math.round(r.left),
            width: Math.round(r.width),
            height: Math.round(r.height)
          };
        });

        // Verificar se todos os itens possuem o mesmo 'top' (ou variação máxima de 2px)
        const tops = rects.map(r => r.top);
        const uniqueTops = Array.from(new Set(tops));
        const allInOneLine = (Math.max(...tops) - Math.min(...tops)) <= 2;

        return {
          totalItems: items.length,
          allInOneLine,
          uniqueTopsCount: uniqueTops.length,
          rects
        };
      })()
    `);

    console.log('Verificação dos 6 Pilares na Home:', check);
    await cdp.screenshot('browser_test_features_strip_one_line.png');

    if (!check.allInOneLine) {
      console.error('❌ ERRO: Itens não estão em uma única linha!');
      process.exitCode = 1;
    } else {
      console.log('✅ SUCESSO: Todos os 6 pilares estão perfeitamente alinhados em UMA ÚNICA LINHA SEGUIDA!');
    }
  } finally {
    try { chromeProc.kill(); } catch (e) {}
  }
}

run().catch(console.error);
