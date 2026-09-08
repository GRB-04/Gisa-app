/**
 * Gisa - Demonstração Automatizada Interativa no Navegador (Visível)
 * Abre o Google Chrome visivelmente na sua tela e percorre todas as possibilidades automaticamente!
 * 
 * Para executar a qualquer momento:
 *   node demo_browser_live.js
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runLiveBrowserDemo() {
  console.log('================================================================');
  console.log('  INICIANDO DEMONSTRAÇÃO VISUAL AUTOMATIZADA NO GOOGLE CHROME');
  console.log('  O navegador abrirá na sua tela e executará todas as etapas.');
  console.log('================================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_live_demo_'));
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  // Abre o Chrome VISÍVEL (sem --headless)
  const proc = spawn(chromePath, [
    '--remote-debugging-port=9223',
    `--user-data-dir=${tmpDir}`,
    '--window-size=1440,900',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:8000/'
  ]);

  await new Promise(r => setTimeout(r, 2500));

  let client = null;
  try {
    const targetsRes = await fetch('http://127.0.0.1:9223/json/list');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('Página do Chrome não encontrada.');

    client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    const pause = ms => new Promise(r => setTimeout(r, ms));

    console.log('▶️ 1. Realizando login e configurando projeto...');
    await client.eval(`
      (async () => {
        const guestBtn = document.getElementById('btn-guest-login');
        if (guestBtn) guestBtn.click();
        else await App.navigate('home');

        let projects = Storage.getProjects();
        let p = projects.find(x => x.name === 'mais um teste' || (typeof x.name === 'object' && x.name?.name === 'mais um teste'));
        if (p) {
          p.name = 'mais um teste';
          Storage.updateProject(p.id, { name: 'mais um teste' });
        } else {
          p = Storage.createProject('mais um teste', 'Revisão Sistemática', ['support', 'depression', 'stress', 'learning', 'flow']);
        }
        await App.navigate('project', { projectId: p.id, tab: 'overview' });
      })()
    `);
    await pause(2500);

    console.log('▶️ 2. Navegando para Visão Geral...');
    await client.eval(`App.navigate('project', { tab: 'overview' })`);
    await pause(2500);

    console.log('▶️ 3. Navegando para Triagem (3 painéis interativos)...');
    await client.eval(`App.navigate('project', { tab: 'screen' })`);
    await pause(3000);

    console.log('▶️ 4. Navegando para Duplicatas (limiar e comparação lado a lado)...');
    await client.eval(`App.navigate('project', { tab: 'dedup' })`);
    await pause(3000);

    console.log('▶️ 5. Navegando para Incluídos (Fase 2: Elegibilidade)...');
    await client.eval(`App.navigate('project', { tab: 'articles' })`);
    await pause(3000);

    console.log('▶️ 6. Clicando em "☆ Confirmar Seleção Final"...');
    await client.eval(`
      (() => {
        const btns = document.querySelectorAll('.btn-final-action');
        if (btns.length > 1) btns[1].click();
      })()
    `);
    await pause(2500);

    console.log('▶️ 7. Navegando para Selecionados (Fase 3: Síntese Definitiva)...');
    await client.eval(`App.navigate('project', { tab: 'final' })`);
    await pause(3000);

    console.log('▶️ 8. Recolhendo/expandindo bandeja temática...');
    await client.eval(`
      (() => {
        const btn = document.querySelector('.toggle-tray-btn');
        if (btn) btn.click();
      })()
    `);
    await pause(2500);

    console.log('▶️ 9. Navegando para Fluxograma PRISMA 2020...');
    await client.eval(`App.navigate('project', { tab: 'prisma' })`);
    await pause(3500);

    console.log('▶️ 10. Navegando para Dashboard (Métricas e Gráficos)...');
    await client.eval(`App.navigate('project', { tab: 'stats' })`);
    await pause(4000);

    console.log('▶️ 11. Navegando para Exportar...');
    await client.eval(`App.navigate('project', { tab: 'export' })`);
    await pause(3500);

    console.log('\n✅ Demonstração visual concluída com sucesso!');
  } catch (e) {
    console.error('Erro durante demonstração:', e);
  } finally {
    if (client) client.close();
    proc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) {
  runLiveBrowserDemo();
}
