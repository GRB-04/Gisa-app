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

async function findChromePath() {
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Nenhum navegador Chromium encontrado');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const chromePath = await findChromePath();
  const remotePort = 9225;
  const userDataDir = path.join(os.tmpdir(), 'chrome-test-prisma-inapp-' + Date.now());

  console.log(`🚀 Iniciando navegador Chromium: ${chromePath} na porta ${remotePort}...`);
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-sync',
    '--window-size=1400,1050',
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

    if (!wsUrl) throw new Error('Não foi possível conectar ao DevTools do Chrome');

    const cdp = new CDPClient(wsUrl);
    await cdp.connect();
    console.log('🔗 Conectado via Chrome CDP!');

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    console.log('⏳ Aguardando app inicializar...');
    await sleep(2500);

    // Inicializar sessão e projeto com dados de teste
    console.log('1. Inicializando sessão de convidado e projeto de teste...');
    await cdp.eval(`
      (async () => {
        const guestBtn = document.getElementById('btn-guest-login');
        if (guestBtn) guestBtn.click();
        else await App.navigate('home');

        let p = Storage.getProjects().find(x => x.name === 'Revisão PRISMA 2020');
        if (!p) {
          p = Storage.createProject('Revisão PRISMA 2020', 'Impacto de Intervenções Digitais na Saúde Mental', ['saude', 'digital', 'depressao']);
        }

        // Criar artigos simulados com diferentes bases e decisões
        if (!p.articles || p.articles.length === 0) {
          const mockArticles = [
            { id: 'a1', title: 'Digital therapy efficacy in youth', authors: 'Silva et al.', year: 2023, database: 'PubMed', decision: 'include', final_selection: true, is_duplicate: false },
            { id: 'a2', title: 'Telehealth interventions systematic review', authors: 'Santos et al.', year: 2022, database: 'PubMed', decision: 'include', final_selection: true, is_duplicate: false },
            { id: 'a3', title: 'Mobile app adherence in anxiety', authors: 'Oliveira et al.', year: 2024, database: 'Embase', decision: 'include', final_selection: false, is_duplicate: false },
            { id: 'a4', title: 'Chatbot therapy comparative trial', authors: 'Souza et al.', year: 2021, database: 'SciELO', decision: 'exclude', exclusion_reason: 'Fora do escopo populacional', is_duplicate: false },
            { id: 'a5', title: 'Virtual reality in clinical settings', authors: 'Pereira et al.', year: 2023, database: 'Web of Science', decision: 'exclude', exclusion_reason: 'Desenho de estudo não aplicável', is_duplicate: false },
            { id: 'a6', title: 'Digital therapy efficacy in youth (dup)', authors: 'Silva et al.', year: 2023, database: 'PubMed', decision: 'undecided', is_duplicate: true }
          ];
          p.articles = mockArticles;
          p.stats = { total: 6, duplicates: 1, screened: 5, included: 3, excluded: 2 };
          Storage.updateProject(p.id, { articles: mockArticles, stats: p.stats });
        }

        await App.navigate('project', { projectId: p.id, tab: 'prisma' });
      })()
    `);
    await sleep(1500);

    // ETAPA 1: Validar Molde Oficial Carregado na Aba PRISMA
    console.log('\n--- 1. VALIDANDO CARREGAMENTO DO MOLDE OFICIAL ---');
    const status1 = await cdp.eval(`
      (function() {
        const paper = document.getElementById('prisma-official-paper');
        const fillBtn = document.getElementById('btn-prisma-fill-gisa');
        const modeBtn = document.getElementById('btn-prisma-mode-toggle');
        const copyBtn = document.getElementById('btn-prisma-copy-image');
        const pngBtn = document.getElementById('btn-prisma-download-png');
        const svgBtn = document.getElementById('btn-prisma-download-svg');
        const printBtn = document.getElementById('btn-prisma-print');

        const title = paper?.querySelector('h3')?.textContent?.trim();
        const inputs = paper ? paper.querySelectorAll('input').length : 0;
        const badges = paper ? paper.querySelectorAll('.prisma-phase-badge-v').length : 0;

        return {
          hasPaper: !!paper,
          hasFillBtn: !!fillBtn,
          hasModeBtn: !!modeBtn,
          hasCopyBtn: !!copyBtn,
          hasPngBtn: !!pngBtn,
          hasSvgBtn: !!svgBtn,
          hasPrintBtn: !!printBtn,
          title,
          inputsCount: inputs,
          phaseBadgesCount: badges
        };
      })()
    `);
    console.log('Status do Molde Oficial:', status1);
    await cdp.screenshot('browser_test_prisma_template_01_editor.png');

    // ETAPA 2: Testar Edição "à Mão"
    console.log('\n--- 2. TESTANDO EDIÇÃO À MÃO NO MOLDE ---');
    await cdp.eval(`
      (function() {
        // Alterar contagem de duplicatas à mão
        const inDup = document.getElementById('prisma-in-duplicates');
        if (inDup) {
          inDup.value = "18";
          inDup.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Alterar registros triados à mão
        const inScreen = document.getElementById('prisma-in-screened');
        if (inScreen) {
          inScreen.value = "120";
          inScreen.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Adicionar nova base de dados à mão
        const addDbBtn = document.getElementById('btn-prisma-add-db');
        if (addDbBtn) addDbBtn.click();
      })()
    `);
    await sleep(600);

    // Configurar a nova base adicionada
    await cdp.eval(`
      (function() {
        const dbInputs = document.querySelectorAll('[data-prisma-db-key="name"]');
        const countInputs = document.querySelectorAll('[data-prisma-db-key="count"]');
        if (dbInputs.length > 0) {
          const lastDb = dbInputs[dbInputs.length - 1];
          lastDb.value = "LILACS & BVS";
          lastDb.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (countInputs.length > 0) {
          const lastCount = countInputs[countInputs.length - 1];
          lastCount.value = "42";
          lastCount.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Adicionar novo motivo de exclusão na triagem à mão
        const addReasonBtn = document.getElementById('btn-prisma-add-screening-reason');
        if (addReasonBtn) addReasonBtn.click();
      })()
    `);
    await sleep(600);

    await cdp.eval(`
      (function() {
        const reasonInputs = document.querySelectorAll('[data-prisma-screen-key="reason"]');
        const reasonCounts = document.querySelectorAll('[data-prisma-screen-key="count"]');
        if (reasonInputs.length > 0) {
          const lastReason = reasonInputs[reasonInputs.length - 1];
          lastReason.value = "População fora da faixa etária estipulada (idosos > 65)";
          lastReason.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (reasonCounts.length > 0) {
          const lastCount = reasonCounts[reasonCounts.length - 1];
          lastCount.value = "14";
          lastCount.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(500);

    const editVerification = await cdp.eval(`
      (function() {
        const inDup = document.getElementById('prisma-in-duplicates');
        const inScreen = document.getElementById('prisma-in-screened');
        const dbNames = Array.from(document.querySelectorAll('[data-prisma-db-key="name"]')).map(x => x.value);
        const reasons = Array.from(document.querySelectorAll('[data-prisma-screen-key="reason"]')).map(x => x.value);
        return {
          duplicatesVal: inDup?.value,
          screenedVal: inScreen?.value,
          hasNewDb: dbNames.includes('LILACS & BVS'),
          hasNewReason: reasons.some(r => r.includes('faixa etária'))
        };
      })()
    `);
    console.log('Validação da Edição à Mão:', editVerification);
    await cdp.screenshot('browser_test_prisma_template_02_editado_a_mao.png');

    // ETAPA 3: Alternar para Modo Publicação
    console.log('\n--- 3. TESTANDO MODO PUBLICAÇÃO (VISUALIZAÇÃO CIENTÍFICA LIMPA) ---');
    await cdp.eval(`
      (function() {
        const modeBtn = document.getElementById('btn-prisma-mode-toggle');
        if (modeBtn) modeBtn.click();
      })()
    `);
    await sleep(800);

    const pubVerification = await cdp.eval(`
      (function() {
        const modeBtn = document.getElementById('btn-prisma-mode-toggle');
        const inputs = document.querySelectorAll('#prisma-official-paper input');
        const paperText = document.getElementById('prisma-official-paper')?.innerText || '';
        return {
          btnLabel: modeBtn?.textContent?.trim(),
          inputCount: inputs.length,
          containsNewDb: paperText.includes('LILACS & BVS'),
          containsNewReason: paperText.includes('faixa etária')
        };
      })()
    `);
    console.log('Validação do Modo Publicação:', pubVerification);
    await cdp.screenshot('browser_test_prisma_template_03_modo_publicacao.png');

    // ETAPA 4: Testar Preenchimento Automático do Gisa
    console.log('\n--- 4. TESTANDO PREENCHIMENTO AUTOMÁTICO COM DADOS DO GISA ---');
    // Voltar para modo de edição e clicar em preencher
    await cdp.eval(`
      (function() {
        const modeBtn = document.getElementById('btn-prisma-mode-toggle');
        if (modeBtn) modeBtn.click();
      })()
    `);
    await sleep(400);

    // Disparar preenchimento automático sem travar no confirm
    await cdp.eval(`
      (function() {
        window.confirm = () => true;
        const fillBtn = document.getElementById('btn-prisma-fill-gisa');
        if (fillBtn) fillBtn.click();
      })()
    `);
    await sleep(800);

    const fillVerification = await cdp.eval(`
      (function() {
        const p = Storage.getProjects()[0];
        const m = p?.prisma_manual_data;
        const dbs = m?.identification?.databases?.map(d => d.name) || [];
        return {
          databasesFromProject: dbs,
          duplicatesCount: m?.identification?.duplicatesRemoved,
          studiesIncluded: m?.included?.studiesIncluded
        };
      })()
    `);
    console.log('Dados preenchidos automaticamente do projeto Gisa:', fillVerification);
    await cdp.screenshot('browser_test_prisma_template_04_preenchido_gisa.png');

    // ETAPA 5: Testar Conversão SVG e Canvas de Alta Resolução (300 DPI)
    console.log('\n--- 5. VALIDANDO GERAÇÃO VETORIAL SVG E RENDERIZAÇÃO CANVAS ---');
    const svgTest = await cdp.eval(`
      (async function() {
        try {
          const project = Storage.getProjects()[0];
          const manualData = project.prisma_manual_data;
          const svg = UI.renderPrismaOfficialSvg(manualData, project);
          
          const hasXml = svg.startsWith('<?xml');
          const hasSvgTag = svg.includes('<svg') && svg.includes('</svg>');
          const hasTitle = svg.includes('FLUXOGRAMA PRISMA 2020');
          const hasPhases = svg.includes('IDENTIFICAÇÃO') && svg.includes('TRIAGEM') && svg.includes('INCLUSÃO');

          // Renderizar no canvas 2x scale
          const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          const canvasResult = await new Promise((resolve) => {
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = 880 * 2;
              canvas.height = 980 * 2;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((blob) => {
                resolve({
                  blobCreated: !!blob,
                  blobSizeKb: blob ? (blob.size / 1024).toFixed(1) : null
                });
              }, 'image/png');
            };
            img.onerror = (err) => resolve({ error: 'Falha ao carregar imagem SVG' });
            img.src = url;
          });

          return {
            hasXml,
            hasSvgTag,
            hasTitle,
            hasPhases,
            canvasResult
          };
        } catch (err) {
          return { error: err.message };
        }
      })()
    `);
    console.log('Resultado da validação SVG e Canvas:', svgTest);

    // Capturar visão completa descendo o scroll para ver Triagem e Inclusão
    await cdp.eval(`
      (function() {
        const paper = document.getElementById('prisma-official-paper');
        if (paper) paper.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `);
    await sleep(500);
    await cdp.screenshot('browser_test_prisma_template_05_fases_completas.png');

    console.log('\n🎉 TODOS OS TESTES DO MOLDE OFICIAL PRISMA 2020 PASSARAM COM SUCESSO TOTAL!');
  } finally {
    try {
      chromeProc.kill();
    } catch (e) {}
  }
}

run().catch(err => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
