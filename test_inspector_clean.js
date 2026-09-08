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
  const remotePort = 9227;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-inspector-' + Date.now());

  console.log('🚀 Iniciando Chrome...');
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1400,900',
    'http://localhost:8000/'
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

    // Inicializar projeto e navegar para a aba de triagem
    await cdp.eval(`
      (async () => {
        const guestBtn = document.getElementById('btn-guest-login');
        if (guestBtn) guestBtn.click();
        else await App.navigate('home');

        let p = Storage.getProjects()[0];
        if (!p) {
          p = Storage.createProject('Projeto Teste Limpeza', 'Revisão Sistemática de Avaliação', ['triagem', 'clinica']);
        }
        if (!p.articles || p.articles.length === 0) {
          p.articles = [
            {
              id: 'art-01',
              title: 'A Stepped Bereavement Care Model for Children and Young People',
              authors: ['Müller, H.', 'Berthold, D.', 'Kiepke-Ziemes, S.', 'Doering, B.K.'],
              year: 2026,
              journal: 'Zeitschrift fur Kinder- und Jugendpsychiatrie und Psychotherapie',
              doi: '10.1024/1422-4917/a001062',
              abstract: 'Objective: Losing a caregiver can have a profound impact on the mental health of children and young people. A stepped care approach ensures that support is provided according to individual needs. Methods: We conducted a systematic review following PRISMA guidelines to identify intervention outcomes across diverse cohorts.',
              decision: 'include'
            }
          ];
          Storage.updateProject(p.id, { articles: p.articles });
        }

        await App.navigate('project', { projectId: p.id, tab: 'screen' });
      })()
    `);
    await sleep(1500);

    // Verificar se os botões foram removidos do painel direito
    const result = await cdp.eval(`
      (function() {
        const insp = document.getElementById('abstract-inspector');
        const hasInspInclude = !!document.getElementById('insp-btn-include');
        const hasInspExclude = !!document.getElementById('insp-btn-exclude');
        const hasInspMaybe = !!document.getElementById('insp-btn-maybe');
        const hasAbstract = !!document.getElementById('inspector-abstract-body');
        
        // Verificar se os botões do card da esquerda continuam presentes
        const cardInclude = !!document.querySelector('.article-card .btn-include');
        const cardExclude = !!document.querySelector('.article-card .btn-exclude');
        const cardMaybe = !!document.querySelector('.article-card .btn-maybe');

        return {
          inspectorExists: !!insp,
          redundantButtonsRemoved: !hasInspInclude && !hasInspExclude && !hasInspMaybe,
          abstractVisible: hasAbstract,
          cardButtonsStillWorking: cardInclude && cardExclude && cardMaybe
        };
      })()
    `);

    console.log('Resultado da validação do Leitor de Resumo:', result);
    await cdp.screenshot('browser_test_inspector_clean.png');

    if (result.redundantButtonsRemoved && result.abstractVisible && result.cardButtonsStillWorking) {
      console.log('✅ SUCESSO: Botões redundantes removidos com perfeição! Leitor de resumo limpo e botões dos cards intactos.');
    } else {
      console.error('❌ Falha na validação:', result);
      process.exitCode = 1;
    }
  } finally {
    try { chromeProc.kill(); } catch (e) {}
  }
}

run().catch(console.error);
