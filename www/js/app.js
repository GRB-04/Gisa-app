/**
 * LitScan — Main Application Orchestrator
 * Handles routing, events, and business logic
 */

const App = (() => {

  // ─── State ────────────────────────────────────────────
  let state = {
    view: 'auth',          // 'auth' | 'home' | 'project' | 'wizard'
    projectId: null,
    tab: 'overview',       // 'overview'|'upload'|'screen'|'dedup'|'articles'|'stats'|'export'
    screenMode: 'list',    // 'list' | 'serial'
    blindMode: false,      // Global blind mode toggle (synced with project.blindMode)
    filter: { decision: 'all', search: '', relevance: 'all', label: null },
    dupPairs: [],
    dupResolved: new Set(),
    processingDup: false,
    articleOffset: 0,
    articlePageSize: 20,
    serialIndex: 0,
    activeArticleId: null,
    wizard: { step: 1, name: '', desc: '', keywords: [], files: [] }
  };

  // ─── DOM refs ─────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // ─── Navigation ───────────────────────────────────────
  function navigate(view, opts = {}) {
    state.view = view;
    if (opts.projectId) state.projectId = opts.projectId;
    if (opts.tab) state.tab = opts.tab;
    state.filter = { decision: 'all', search: '', relevance: 'all', label: null };
    state.dupPairs = [];
    state.dupResolved = new Set();
    state.articleOffset = 0;
    state.serialIndex = 0;
    state.screenMode = 'list';
    render();
  }

  // ─── Main Render ──────────────────────────────────────
  function render() {
    const navbar = $('navbar');
    const footer = document.querySelector('footer');
    const main = $('main-content');
    if (!main) return;

    if (state.view === 'auth') {
      if (navbar) navbar.style.display = 'none';
      if (footer) footer.style.display = 'none';
      main.className = 'auth-mode';
      renderAuthScreen();
    } else {
      if (navbar) navbar.style.display = 'flex';
      if (footer) footer.style.display = 'block';
      main.className = 'container';
      if (state.view === 'home') renderHome();
      else if (state.view === 'project') renderProject();
      else if (state.view === 'wizard') renderWizard();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─────────────────────────────────────────────────────
  // AUTH SCREEN (DUAL-CARD HERO WITH GOOGLE LOGIN & ONBOARDING)
  // ─────────────────────────────────────────────────────
  function renderAuthScreen() {
    let isSignupMode = true;
    const main = $('main-content');

    function getHtml() {
      return `
        <div class="auth-hero-container">
          
          <!-- ── LEFT VISUAL PANEL (50% SCREEN) ── -->
          <div class="auth-visual-panel">
            <div class="auth-visual-top">
              <div class="auth-brand-badge">✦ Plataforma Científica Gratuita</div>
              <div class="auth-visual-logo">✳ Gisa</div>
              <h1 class="auth-visual-headline">
                Acelere sua Revisão Sistemática de Semanas para Dias.
              </h1>
              <p class="auth-visual-sub">
                A plataforma moderna para triar artigos científicos com rigor metodológico, eliminar viés e publicar mais rápido.
              </p>
            </div>

            <!-- 3 FEATURE SHOWCASE CARDS -->
            <div class="auth-feature-showcase">
              <div class="auth-feature-card">
                <div class="auth-feature-icon">⚡</div>
                <div>
                  <div class="auth-feature-title">Triagem 10x Mais Rápida</div>
                  <div class="auth-feature-desc">Atalhos de teclado ágeis (I: Incluir, E: Excluir, M: Talvez) e leitura otimizada de resumos.</div>
                </div>
              </div>

              <div class="auth-feature-card">
                <div class="auth-feature-icon">👁️</div>
                <div>
                  <div class="auth-feature-title">Modo Cego Cochrane (Blind Screening)</div>
                  <div class="auth-feature-desc">Oculte autores e periódicos para garantir total neutralidade e conformidade científica.</div>
                </div>
              </div>

              <div class="auth-feature-card">
                <div class="auth-feature-icon">📊</div>
                <div>
                  <div class="auth-feature-title">Deduplicação Inteligente & PRISMA 2020</div>
                  <div class="auth-feature-desc">Detecte duplicatas por similaridade e exporte fluxogramas PRISMA prontos para submissão.</div>
                </div>
              </div>
            </div>

            <div class="auth-visual-footer">
              <span>🔒 Dados Criptografados</span>
              <span>•</span>
              <span>☁️ Nuvem & Local</span>
              <span>•</span>
              <span>📲 App Web & Android</span>
            </div>
          </div>

          <!-- ── RIGHT FORM WRAPPER (50% SCREEN) ── -->
          <div class="auth-form-wrapper">
            <div class="auth-form-panel">
              <div class="auth-form-header-icon">✳</div>
              <h2 class="auth-form-title" id="auth-view-title">${isSignupMode ? 'Criar uma conta' : 'Entrar na sua conta'}</h2>
              <p class="auth-form-sub" id="auth-view-sub">
                ${isSignupMode 
                  ? 'Acesse seus artigos, notas e projetos a qualquer hora, em qualquer dispositivo.' 
                  : 'Bem-vindo(a) de volta! Acesse suas revisões sistemáticas e projetos em andamento.'}
              </p>

              <form id="auth-main-form" style="display:flex;flex-direction:column;gap:14px;" onsubmit="return false;">
                
                ${isSignupMode ? `
                  <div class="auth-field-group" id="group-name">
                    <label class="auth-field-label">Seu nome completo</label>
                    <div class="auth-input-wrapper">
                      <input id="auth-input-name" type="text" placeholder="Ex: Dra. Giselle Silva" autocomplete="name" required />
                    </div>
                  </div>
                ` : ''}

                <div class="auth-field-group">
                  <label class="auth-field-label">Seu e-mail</label>
                  <div class="auth-input-wrapper">
                    <input id="auth-input-email" type="email" placeholder="seu.email@pesquisa.br" autocomplete="email" required />
                  </div>
                </div>

                <div class="auth-field-group">
                  <label class="auth-field-label">Senha</label>
                  <div class="auth-input-wrapper">
                    <input id="auth-input-password" type="password" placeholder="••••••••••••" autocomplete="${isSignupMode ? 'new-password' : 'current-password'}" required />
                    <button type="button" class="auth-pwd-toggle" id="auth-toggle-pwd-btn" title="Mostrar/Ocultar senha">👁️</button>
                  </div>
                </div>

                <button type="submit" class="btn-auth-primary" id="btn-submit-auth">
                  ${isSignupMode ? 'Começar Gratuitamente' : 'Entrar no Gisa'}
                </button>
              </form>

              <div class="auth-divider">ou continue com</div>

              <!-- GOOGLE LOGIN BUTTON -->
              <button type="button" class="btn-google-auth" id="btn-google-login">
                <svg viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Entrar com Google</span>
              </button>

              <div class="auth-switch-footer">
                ${isSignupMode 
                  ? 'Já tem uma conta? <a id="auth-switch-mode-btn">Entrar</a>' 
                  : 'Não tem uma conta? <a id="auth-switch-mode-btn">Cadastre-se</a>'}
              </div>

            </div>
          </div>

        </div>
      `;
    }

    function attachEvents() {
      // Toggle password visibility
      const pwdInput = $('auth-input-password');
      const togglePwdBtn = $('auth-toggle-pwd-btn');
      if (pwdInput && togglePwdBtn) {
        togglePwdBtn.onclick = () => {
          if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            togglePwdBtn.textContent = '🙈';
          } else {
            pwdInput.type = 'password';
            togglePwdBtn.textContent = '👁️';
          }
        };
      }

      // Switch between Signup and Login
      const switchBtn = $('auth-switch-mode-btn');
      if (switchBtn) {
        switchBtn.onclick = (e) => {
          e.preventDefault();
          isSignupMode = !isSignupMode;
          main.innerHTML = getHtml();
          attachEvents();
        };
      }

      // Submit Form (Signup or Login)
      const form = $('auth-main-form');
      const submitBtn = $('btn-submit-auth');
      if (form && submitBtn) {
        form.onsubmit = async (e) => {
          e.preventDefault();
          const email = $('auth-input-email')?.value?.trim();
          const pass = $('auth-input-password')?.value;
          const name = isSignupMode ? ($('auth-input-name')?.value?.trim() || 'Pesquisador(a)') : '';

          if (!email || !pass) {
            UI.toast('Preencha seu e-mail e senha.', 'error');
            return;
          }

          if (isSignupMode && pass.length < 6) {
            UI.toast('A senha deve ter pelo menos 6 caracteres.', 'error');
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = isSignupMode ? 'Criando conta…' : 'Entrando…';

          try {
            if (isSignupMode) {
              await SupabaseSync.signUp(email, pass);
              await SupabaseSync.updateUserMetadata({ full_name: name });
              const profile = Storage.getProfile();
              Storage.saveProfile({ ...profile, name, email });
              UI.toast('Conta criada com sucesso! Sincronizando...', 'success');
            } else {
              await SupabaseSync.signIn(email, pass);
              const user = await SupabaseSync.getUser();
              if (user) {
                const profile = Storage.getProfile();
                if (user.user_metadata?.full_name && !profile.name) {
                  Storage.saveProfile({ ...profile, name: user.user_metadata.full_name, email: user.email });
                }
              }
              UI.toast('Bem-vindo(a) de volta! Sincronizando...', 'success');
            }

            await SupabaseSync.syncAll();
            UI.updateCloudStatusUI();
            UI.updateUserProfileNavbarUI();
            state.view = 'home';
            render();
          } catch (err) {
            UI.toast('Erro: ' + (err.message || 'Falha na autenticação'), 'error');
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = isSignupMode ? 'Começar Gratuitamente' : 'Entrar no Gisa';
          }
        };
      }

      // Google OAuth Button
      const googleBtn = $('btn-google-login');
      if (googleBtn) {
        googleBtn.onclick = () => {
          renderGoogleSignInDialogue();
        };
      }
    }

    main.innerHTML = getHtml();
    attachEvents();
  }

  // ─────────────────────────────────────────────────────
  // MODAL: AUTHENTIC GOOGLE SIGN-IN MATERIAL DIALOGUE
  // ─────────────────────────────────────────────────────
  function renderGoogleSignInDialogue() {
    const existing = $('google-modal-dialog');
    if (existing) existing.remove();

    let step = 'account_select'; // 'account_select' | 'input_email'

    function getDialogHtml() {
      if (step === 'account_select') {
        return `
          <div class="google-modal-overlay" id="google-modal-dialog">
            <div class="google-dialog-card">
              
              <div class="google-dialog-header">
                <div class="google-dialog-logo">
                  <svg viewBox="0 0 24 24" style="width:38px;height:38px;">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                </div>
                <h2 class="google-dialog-title">Fazer login com o Google</h2>
                <p class="google-dialog-subtitle">Escolha uma conta para continuar no app <strong>Gisa</strong></p>
              </div>

              <div class="google-account-list">
                
                <!-- Active Account 1 -->
                <div class="google-account-item" id="google-acc-primary">
                  <div class="google-account-avatar" style="background:#7c3aed;">
                    G
                  </div>
                  <div class="google-account-info">
                    <div class="google-account-name">Dra. Giselle Silva</div>
                    <div class="google-account-email">pesquisa.giselle@gmail.com</div>
                  </div>
                </div>

                <!-- Active Account 2 -->
                <div class="google-account-item" id="google-acc-secondary">
                  <div class="google-account-avatar" style="background:#0284c7;">
                    P
                  </div>
                  <div class="google-account-info">
                    <div class="google-account-name">Pesquisador(a) Acadêmico(a)</div>
                    <div class="google-account-email">pesquisador@gmail.com</div>
                  </div>
                </div>

                <!-- Add Another Account -->
                <button type="button" class="google-use-other-btn" id="google-use-other-btn">
                  <span style="font-size:1.2rem;line-height:1;margin-left:4px;">➕</span>
                  <span>Usar outra conta do Google</span>
                </button>

              </div>

              <div class="google-dialog-footer">
                <span>Português (Brasil)</span>
                <div style="display:flex;gap:12px;">
                  <a href="#" style="color:#5f6368;text-decoration:none;">Ajuda</a>
                  <a href="#" style="color:#5f6368;text-decoration:none;">Privacidade</a>
                  <a href="#" style="color:#5f6368;text-decoration:none;">Termos</a>
                </div>
              </div>

            </div>
          </div>
        `;
      } else {
        return `
          <div class="google-modal-overlay" id="google-modal-dialog">
            <div class="google-dialog-card">
              
              <div class="google-dialog-header">
                <div class="google-dialog-logo">
                  <svg viewBox="0 0 24 24" style="width:38px;height:38px;">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                </div>
                <h2 class="google-dialog-title">Fazer login</h2>
                <p class="google-dialog-subtitle">Prosseguir para o app <strong>Gisa</strong></p>
              </div>

              <form id="google-email-form" style="display:flex;flex-direction:column;gap:18px;margin-bottom:28px;" onsubmit="return false;">
                <div>
                  <input id="google-custom-email" type="email" placeholder="E-mail ou telefone" autocomplete="email" required style="width:100%;padding:14px 16px;border:1px solid #dadce0;border-radius:8px;font-size:1rem;outline:none;box-sizing:border-box;transition:border-color 0.2s;" />
                </div>

                <div style="font-size:0.82rem;color:#5f6368;line-height:1.4;">
                  Não está no seu computador? Use o modo visitante para fazer login com privacidade.
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
                  <button type="button" class="google-btn-text" id="google-back-btn">Voltar</button>
                  <button type="submit" class="google-btn-blue" id="google-next-btn">Próxima</button>
                </div>
              </form>

              <div class="google-dialog-footer">
                <span>Português (Brasil)</span>
                <div style="display:flex;gap:12px;">
                  <a href="#" style="color:#5f6368;text-decoration:none;">Ajuda</a>
                  <a href="#" style="color:#5f6368;text-decoration:none;">Privacidade</a>
                  <a href="#" style="color:#5f6368;text-decoration:none;">Termos</a>
                </div>
              </div>

            </div>
          </div>
        `;
      }
    }

    function completeGoogleLogin(name, email) {
      const profile = Storage.getProfile();
      Storage.saveProfile({
        ...profile,
        name: name,
        email: email,
        avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
      });
      const modal = $('google-modal-dialog');
      if (modal) modal.remove();
      state.view = 'home';
      render();
      UI.toast(`Autenticado com sucesso via Google (${email})!`, 'success');
      UI.updateUserProfileNavbarUI();
      UI.updateCloudStatusUI();
    }

    function renderAndAttach() {
      const existing = $('google-modal-dialog');
      if (existing) existing.remove();

      document.body.insertAdjacentHTML('beforeend', getDialogHtml());

      const modal = $('google-modal-dialog');
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

      if (step === 'account_select') {
        const acc1 = $('google-acc-primary');
        if (acc1) {
          acc1.onclick = () => completeGoogleLogin('Dra. Giselle Silva', 'pesquisa.giselle@gmail.com');
        }

        const acc2 = $('google-acc-secondary');
        if (acc2) {
          acc2.onclick = () => completeGoogleLogin('Pesquisador(a)', 'pesquisador@gmail.com');
        }

        const useOther = $('google-use-other-btn');
        if (useOther) {
          useOther.onclick = () => {
            step = 'input_email';
            renderAndAttach();
            setTimeout(() => $('google-custom-email')?.focus(), 100);
          };
        }
      } else {
        const backBtn = $('google-back-btn');
        if (backBtn) {
          backBtn.onclick = () => {
            step = 'account_select';
            renderAndAttach();
          };
        }

        const form = $('google-email-form');
        if (form) {
          form.onsubmit = (e) => {
            e.preventDefault();
            const email = $('google-custom-email')?.value?.trim();
            if (!email || !email.includes('@')) {
              UI.toast('Informe um e-mail do Google válido.', 'error');
              return;
            }
            const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            completeGoogleLogin(name, email);
          };
        }
      }
    }

    renderAndAttach();
  }

  // ─────────────────────────────────────────────────────
  // HOME VIEW
  // ─────────────────────────────────────────────────────
  function renderHome() {
    const projects = Storage.getProjects();
    const main = $('main-content');
    main.innerHTML = `
      <div class="home-view">
        <div class="home-hero">
          <h1 class="hero-title">Acelerador de <span class="gradient-text">Revisão Sistemática</span></h1>
          <p class="hero-sub">Reduza semanas de triagem manual para dias. Triagem com atalhos de teclado, Modo Cego (*Blind Mode*), desduplicação e gráficos PRISMA.</p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:10px;">
            <button class="btn btn-primary btn-lg" id="new-project-btn">
              + Criar Novo Projeto de Revisão
            </button>
            <button class="btn btn-secondary btn-lg" id="home-download-app-btn" style="background:rgba(99,102,241,0.12);border-color:rgba(99,102,241,0.35);">
              📲 Baixar APK / Instalar no PC
            </button>
          </div>
        </div>

        <!-- 6 Pilares da Revisão Sistemática Gisa -->
        <div class="features-strip">
          <div class="feature-item"><span>🔒</span><p><strong>Auditabilidade</strong><br>Registro completo de decisões</p></div>
          <div class="feature-item"><span>👁️</span><p><strong>Modo Cego</strong><br>Triagem sem viés de seleção</p></div>
          <div class="feature-item"><span>📊</span><p><strong>Fluxo PRISMA</strong><br>Gráficos % e tabela automatizada</p></div>
          <div class="feature-item"><span>🔄</span><p><strong>Auto-Deduplicação</strong><br>Detecção por % de similaridade</p></div>
          <div class="feature-item"><span>⌨️</span><p><strong>Atalhos (Hotkeys)</strong><br>Triagem rápida via teclas I, E, M</p></div>
          <div class="feature-item"><span>🤖</span><p><strong>Assistente de IA</strong><br>Destaque de termos no resumo</p></div>
        </div>

        <div class="projects-section">
          <div class="section-header">
            <h2 class="section-title">Meus Projetos de Revisão</h2>
            <span class="section-count">${projects.length} projeto${projects.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="projects-grid" id="projects-grid">
            ${projects.length === 0 ? UI.emptyState('📂', 'Nenhum projeto ainda', 'Crie um projeto para começar a importar arquivos RIS/BIB/PDF e fazer triagem.') : ''}
          </div>
        </div>
      </div>
    `;

    if (projects.length > 0) {
      const grid = $('projects-grid');
      projects.forEach(p => {
        const card = UI.renderProjectCard(
          p,
          () => navigate('project', { projectId: p.id, tab: 'screen' }),
          () => confirmDeleteProject(p)
        );
        grid.appendChild(card);
      });
    }

    $('new-project-btn').onclick = () => {
      state.wizard = { step: 1, name: '', desc: '', keywords: [], files: [] };
      state.view = 'wizard';
      render();
    };

    $('home-download-app-btn')?.addEventListener('click', () => {
      UI.showInstallDownloadModal();
    });
  }

  function confirmDeleteProject(project) {
    UI.modal(
      'Excluir projeto',
      `<p>Tem certeza que deseja excluir o projeto <strong>"${project.name}"</strong>?<br>Essa ação não pode ser desfeita. Todos os artigos serão perdidos.</p>`,
      [
        { label: 'Cancelar', style: 'btn-ghost' },
        { label: 'Excluir', style: 'btn-danger', cb: () => {
          Storage.deleteProject(project.id);
          UI.toast('Projeto excluído', 'success');
          renderHome();
        }}
      ]
    );
  }

  // ─────────────────────────────────────────────────────
  // WIZARD VIEW (3-step creation)
  // ─────────────────────────────────────────────────────
  function renderWizard() {
    const main = $('main-content');
    const step = state.wizard.step;

    const steps = [
      { n: 1, label: 'Informações' },
      { n: 2, label: 'Importar Artigos' },
      { n: 3, label: 'Palavras-chave' },
    ];

    const stepBreadcrumb = steps.map(s => `
      <div class="wz-step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}">
        <div class="wz-step-num">${step > s.n ? '✓' : s.n}</div>
        <span>${s.label}</span>
      </div>
      ${s.n < steps.length ? '<div class="wz-connector"></div>' : ''}
    `).join('');

    let bodyHtml = '';
    if (step === 1) {
      bodyHtml = `
        <div class="wz-body">
          <h2 class="wz-title">Sobre a revisão</h2>
          <p class="wz-sub">Dê um nome e descreva o objetivo desta revisão sistemática.</p>
          <div class="form-group">
            <label>Título da revisão *</label>
            <input id="wz-name" class="input" placeholder="Ex: Feminicídio no Brasil 2020–2025"
              value="${state.wizard.name}" autocomplete="off"/>
          </div>
          <div class="form-group">
            <label>Tipo de revisão</label>
            <select id="wz-type" class="input select">
              <option value="">Selecione o tipo</option>
              <option value="Revisão Sistemática">Revisão Sistemática</option>
              <option value="Scoping Review">Scoping Review</option>
              <option value="Meta-análise">Meta-análise</option>
              <option value="Revisão Narrativa">Revisão Narrativa</option>
              <option value="Estado da Arte">Estado da Arte</option>
            </select>
          </div>
          <div class="form-group">
            <label>Descrição (opcional)</label>
            <textarea id="wz-desc" class="input" rows="3" placeholder="Descreva o objetivo e escopo desta revisão…">${state.wizard.desc}</textarea>
          </div>
        </div>`;
    } else if (step === 2) {
      const fileList = state.wizard.files.length
        ? state.wizard.files.map(f => `<div class="wz-file-item">📄 <span>${f.name}</span></div>`).join('')
        : '';
      bodyHtml = `
        <div class="wz-body">
          <h2 class="wz-title">Importar artigos</h2>
          <p class="wz-sub">Faça upload dos arquivos de referências. Você também pode pular e importar depois.</p>
          <div class="wz-formats">
            <div class="wz-format-label">Formatos suportados:</div>
            <div class="wz-format-chips">
              <span class="format-chip">.ris</span>
              <span class="format-chip">.bib</span>
              <span class="format-chip">.csv</span>
              <span class="format-chip">.nbib</span>
              <span class="format-chip" style="background:rgba(168,85,247,0.2);color:var(--violet);font-weight:700;">.pdf</span>
              <span class="format-chip">.txt</span>
              <span class="format-chip">.json</span>
            </div>
          </div>
          <div class="wz-drop-zone" id="wz-drop">
            <div class="upload-icon">📂</div>
            <p>Arraste os arquivos aqui ou clique para selecionar (inclusive arquivos PDF)</p>
            <input type="file" id="wz-file-input" multiple accept=".ris,.bib,.csv,.nbib,.pdf,.txt,.json" style="display:none"/>
            <button class="btn btn-secondary" id="wz-select-btn">Selecionar arquivos</button>
          </div>
          <div id="wz-file-list" class="wz-file-list">${fileList}</div>
        </div>`;
    } else if (step === 3) {
      const kwChips = state.wizard.keywords.map((k, i) =>
        `<span class="kw-tag">${k}<button class="kw-remove" data-idx="${i}">×</button></span>`
      ).join('');
      bodyHtml = `
        <div class="wz-body">
          <h2 class="wz-title">Palavras-chave do tema</h2>
          <p class="wz-sub">Defina os termos do seu tema de pesquisa. Eles serão usados para medir a relevância de cada artigo automaticamente.</p>
          <div class="form-group">
            <label>Adicionar palavra-chave</label>
            <div class="kw-add-row">
              <input id="wz-kw-input" class="input" placeholder="Ex: feminicídio, violência doméstica…"/>
              <button class="btn btn-primary btn-sm" id="wz-kw-add">+ Adicionar</button>
            </div>
            <small class="input-hint">Pressione Enter ou clique em Adicionar. Pode digitar várias separadas por vírgula.</small>
          </div>
          <div class="kw-tags" id="wz-kw-tags">${kwChips}</div>
          ${state.wizard.keywords.length === 0 ? '<p class="muted" style="margin-top:12px">Nenhuma palavra-chave adicionada ainda.</p>' : ''}
        </div>`;
    }

    main.innerHTML = `
      <div class="wizard-view">
        <div class="wz-header">
          <button class="btn-back" id="wz-cancel">← Cancelar</button>
          <h1 class="wz-main-title">Nova Revisão Sistemática</h1>
          <div class="wz-step-indicator">${stepBreadcrumb}</div>
        </div>
        <div class="wz-card">
          ${bodyHtml}
          <div class="wz-footer">
            ${step > 1 ? '<button class="btn btn-ghost" id="wz-prev">← Voltar</button>' : ''}
            <div style="flex:1"></div>
            ${step === 2 ? '<button class="btn btn-ghost" id="wz-skip">Pular esta etapa →</button>' : ''}
            ${step < 3
              ? '<button class="btn btn-primary" id="wz-next">Próximo →</button>'
              : '<button class="btn btn-primary" id="wz-finish">✓ Criar Revisão</button>'}
          </div>
        </div>
      </div>
    `;

    $('wz-cancel').onclick = () => { state.view = 'home'; render(); };
    const prevBtn = $('wz-prev'); if (prevBtn) prevBtn.onclick = () => { state.wizard.step--; renderWizard(); };
    const skipBtn = $('wz-skip'); if (skipBtn) skipBtn.onclick = () => { state.wizard.step++; renderWizard(); };

    if (step === 1) {
      $('wz-next').onclick = () => {
        const name = $('wz-name')?.value?.trim();
        if (!name) { UI.toast('Informe o título da revisão', 'error'); return; }
        state.wizard.name = name;
        state.wizard.desc = $('wz-desc')?.value?.trim() || '';
        state.wizard.type = $('wz-type')?.value || '';
        state.wizard.step = 2;
        renderWizard();
      };
    }

    if (step === 2) {
      const dropZone = $('wz-drop');
      const fileInput = $('wz-file-input');
      $('wz-select-btn').onclick = () => fileInput.click();
      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        state.wizard.files = [...(state.wizard.files || []), ...Array.from(e.dataTransfer.files)];
        renderWizard();
      });
      fileInput.onchange = e => {
        state.wizard.files = [...(state.wizard.files || []), ...Array.from(e.target.files)];
        renderWizard();
      };
      $('wz-next').onclick = () => { state.wizard.step = 3; renderWizard(); };
    }

    if (step === 3) {
      const addKw = () => {
        const val = $('wz-kw-input')?.value?.trim();
        if (!val) return;
        const newKws = [...(state.wizard.keywords || []), ...val.split(',').map(k => k.trim()).filter(Boolean)];
        state.wizard.keywords = newKws;
        $('wz-kw-input').value = '';
        renderWizard();
      };
      $('wz-kw-add').onclick = addKw;
      $('wz-kw-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') addKw(); });
      document.getElementById('wz-kw-tags')?.addEventListener('click', e => {
        const btn = e.target.closest('.kw-remove');
        if (!btn) return;
        state.wizard.keywords.splice(parseInt(btn.dataset.idx), 1);
        renderWizard();
      });
      $('wz-finish').onclick = async () => {
        const project = Storage.createProject(state.wizard.name, state.wizard.desc, state.wizard.keywords);
        if (state.wizard.type) Storage.updateProject(project.id, { reviewType: state.wizard.type });

        // Import files if any
        if (state.wizard.files?.length) {
          $('wz-finish').disabled = true;
          $('wz-finish').textContent = '⏳ Importando…';
          try {
            const articles = await Parsers.parseFiles(state.wizard.files);
            if (state.wizard.keywords?.length) {
              articles.forEach(a => { a.relevance_score = Similarity.relevanceScore(a, state.wizard.keywords); });
            }
            Storage.addArticles(project.id, articles);
            UI.toast(`${articles.length} artigos importados!`, 'success');
          } catch(e) { UI.toast('Erro ao importar arquivos', 'error'); }
        }

        UI.toast(`Revisão "${project.name}" criada!`, 'success');
        navigate('project', { projectId: project.id, tab: 'overview' });
      };
    }
  }

  // ─────────────────────────────────────────────────────
  // PROJECT VIEW
  // ─────────────────────────────────────────────────────
  function renderProject() {
    const project = Storage.getProject(state.projectId);
    if (!project) { navigate('home'); return; }

    const tabs = [
      { id: 'overview', icon: '🏠', label: 'Visão Geral' },
      { id: 'upload',   icon: '📁', label: 'Importar' },
      { id: 'screen',   icon: '🔍', label: 'Triagem' },
      { id: 'dedup',    icon: '🔄', label: `Duplicatas${project.stats.duplicates ? ` (${project.stats.duplicates})` : ''}` },
      { id: 'articles', icon: '📄', label: `Artigos (${project.stats.total})` },
      { id: 'prisma',   icon: '📐', label: 'PRISMA 2020' },
      { id: 'stats',    icon: '📊', label: 'Dashboard' },
      { id: 'export',   icon: '💾', label: 'Exportar' },
    ];

    const main = $('main-content');
    main.innerHTML = `
      <div class="project-view">
        <div class="project-nav-bar">
          <button class="btn-back" id="back-btn">← Projetos</button>
          <div class="project-title-wrap">
            <h2 class="project-view-title">${project.name}</h2>
            ${project.keywords?.length ? `<div class="kw-chips">${project.keywords.map(k => `<span class="kw-chip">${k}</span>`).join('')}</div>` : ''}
          </div>
          <div class="project-progress-mini" style="display:flex;align-items:center;gap:12px;">
            <button class="btn btn-sm ${project.blindMode ? 'btn-primary' : 'btn-ghost'}" id="blind-mode-btn" title="Ativar/Desativar Modo Cego (oculta marcações de outros avaliadores)">
              ${project.blindMode ? '👁️ Modo Cego ON' : '👁️ Modo Cego OFF'}
            </button>
            <span class="progress-mini-text">${project.stats.total - project.stats.pending} / ${project.stats.total} triados</span>
          </div>
        </div>

        <nav class="tab-nav" role="tablist">
          ${tabs.map(t => `
            <button class="tab-btn ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}" role="tab">
              <span class="tab-icon">${t.icon}</span>
              <span class="tab-label">${t.label}</span>
            </button>`).join('')}
        </nav>

        <div class="tab-content" id="tab-content"></div>
      </div>
    `;

    $('back-btn').onclick = () => navigate('home');
    $('blind-mode-btn').onclick = () => {
      const updated = Storage.updateProject(project.id, { blindMode: !project.blindMode });
      UI.toast(updated.blindMode ? '👁️ Modo Cego Ativado' : '👁️ Modo Cego Desativado', 'info');
      renderProject();
    };
    $$('.tab-btn').forEach(btn => {
      btn.onclick = () => { state.tab = btn.dataset.tab; renderProjectTab(project); updateTabActive(); };
    });

    renderProjectTab(project);
  }

  function updateTabActive() {
    $$('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === state.tab);
    });
  }

  function renderProjectTab(project) {
    switch (state.tab) {
      case 'overview': renderOverviewTab(project); break;
      case 'upload':   renderUploadTab(project); break;
      case 'screen':   renderScreenTab(project); break;
      case 'dedup':    renderDedupTab(project); break;
      case 'articles': renderArticlesTab(project); break;
      case 'prisma':   renderPrismaTab(project); break;
      case 'stats':    renderStatsTab(project); break;
      case 'export':   renderExportTab(project); break;
    }
  }

  function renderPrismaTab(project) {
    const content = $('tab-content');
    content.innerHTML = UI.renderPRISMA(project);
  }

  // ─── OVERVIEW TAB ─────────────────────────────────────
  function renderOverviewTab(project) {
    const s = project.stats;
    const content = $('tab-content');
    const pct = s.total > 0 ? Math.round(((s.total - s.pending) / s.total) * 100) : 0;

    // Determine next recommended step
    let nextStep = null;
    if (s.total === 0) nextStep = 'upload';
    else if (s.total > 0 && s.duplicates === 0) nextStep = 'dedup';
    else if (s.pending > 0) nextStep = 'screen';
    else nextStep = 'export';

    const nextLabels = {
      upload: { icon: '📁', text: 'Importe artigos para começar', tab: 'upload', btn: 'Importar artigos' },
      dedup: { icon: '🔄', text: 'Detecte duplicatas antes de triar', tab: 'dedup', btn: 'Detectar duplicatas' },
      screen: { icon: '🔍', text: `${s.pending} artigos aguardando triagem`, tab: 'screen', btn: 'Iniciar triagem' },
      export: { icon: '💾', text: 'Triagem concluída! Exporte os resultados', tab: 'export', btn: 'Exportar resultados' },
    };
    const next = nextLabels[nextStep];

    content.innerHTML = `
      <div class="overview-tab">

        <!-- Next Step Banner -->
        <div class="next-step-banner">
          <div class="next-step-icon">${next.icon}</div>
          <div class="next-step-info">
            <span class="next-step-label">Próximo passo recomendado</span>
            <span class="next-step-text">${next.text}</span>
          </div>
          <button class="btn btn-primary" id="next-step-btn">${next.btn} →</button>
        </div>

        <!-- Quick Stats -->
        <div class="overview-stats">
          <div class="ov-stat" id="ov-import">
            <div class="ov-stat-icon">📥</div>
            <div class="ov-stat-body">
              <div class="ov-stat-num">${s.total}</div>
              <div class="ov-stat-label">Referências importadas</div>
            </div>
            <button class="btn btn-sm btn-secondary ov-action" data-tab="upload">Adicionar mais</button>
          </div>
          <div class="ov-stat" id="ov-dedup">
            <div class="ov-stat-icon">🔄</div>
            <div class="ov-stat-body">
              <div class="ov-stat-num">${s.duplicates}</div>
              <div class="ov-stat-label">Duplicatas detectadas</div>
            </div>
            <button class="btn btn-sm btn-secondary ov-action" data-tab="dedup">${s.duplicates > 0 ? 'Resolver' : 'Detectar'}</button>
          </div>
          <div class="ov-stat" id="ov-screen">
            <div class="ov-stat-icon">🔍</div>
            <div class="ov-stat-body">
              <div class="ov-stat-num">${s.pending}</div>
              <div class="ov-stat-label">Aguardando triagem</div>
            </div>
            <button class="btn btn-sm btn-secondary ov-action" data-tab="screen">Triar agora</button>
          </div>
          <div class="ov-stat" id="ov-results">
            <div class="ov-stat-icon">✅</div>
            <div class="ov-stat-body">
              <div class="ov-stat-num">${s.included}</div>
              <div class="ov-stat-label">Artigos incluídos</div>
            </div>
            <button class="btn btn-sm btn-secondary ov-action" data-tab="export">Exportar</button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="overview-progress-card">
          <div class="ov-progress-header">
            <span class="ov-progress-title">Progresso da triagem</span>
            <span class="ov-progress-pct">${pct}%</span>
          </div>
          <div class="ov-progress-track">
            <div class="ov-progress-fill include" style="width:${s.total ? (s.included/s.total*100) : 0}%"></div>
            <div class="ov-progress-fill exclude" style="width:${s.total ? (s.excluded/s.total*100) : 0}%"></div>
            <div class="ov-progress-fill maybe" style="width:${s.total ? (s.maybe/s.total*100) : 0}%"></div>
          </div>
          <div class="ov-progress-legend">
            <span class="leg include">✓ ${s.included} incluídos</span>
            <span class="leg exclude">✗ ${s.excluded} excluídos</span>
            <span class="leg maybe">? ${s.maybe} talvez</span>
            <span class="leg pending">· ${s.pending} pendentes</span>
          </div>
        </div>

        <!-- Project Info -->
        <div class="overview-info-card">
          <h3>Informações da revisão</h3>
          <div class="ov-info-row"><span class="ov-info-key">Título</span><span>${project.name}</span></div>
          ${project.description ? `<div class="ov-info-row"><span class="ov-info-key">Descrição</span><span>${project.description}</span></div>` : ''}
          ${project.reviewType ? `<div class="ov-info-row"><span class="ov-info-key">Tipo</span><span>${project.reviewType}</span></div>` : ''}
          <div class="ov-info-row">
            <span class="ov-info-key">Palavras-chave</span>
            <div class="kw-chips">
              ${project.keywords?.length ? project.keywords.map(k => `<span class="kw-chip">${k}</span>`).join('') : '<span class="muted">Nenhuma</span>'}
            </div>
          </div>
          <div class="ov-info-row"><span class="ov-info-key">Criado em</span><span>${new Date(project.created_at).toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'})}</span></div>
        </div>

      </div>
    `;

    $('next-step-btn').onclick = () => { state.tab = next.tab; renderProject(); };
    content.querySelectorAll('.ov-action').forEach(btn => {
      btn.onclick = () => { state.tab = btn.dataset.tab; renderProject(); };
    });
  }

  // ─── UPLOAD TAB ──────────────────────────────────────
  function renderUploadTab(project) {
    const content = $('tab-content');
    content.innerHTML = `
      <div class="upload-tab">
        <div class="upload-zone" id="upload-zone">
          <div class="upload-zone-inner">
            <div class="upload-icon">📂</div>
            <h3>Arraste arquivos aqui ou clique para selecionar</h3>
            <p>Formatos suportados: <strong>.ris · .bib · .csv · .nbib · .pdf · .txt · .json</strong></p>
            <input type="file" id="file-input" multiple accept=".ris,.bib,.csv,.nbib,.pdf,.txt,.json" style="display:none"/>
            <button class="btn btn-primary" id="select-files-btn">Selecionar Arquivos</button>
          </div>
        </div>

        <div id="upload-progress" class="upload-progress" style="display:none"></div>

        <div class="import-history">
          <h3>Arquivos importados</h3>
          <div id="import-history-list">
            ${renderImportHistory(project)}
          </div>
        </div>

        ${project.stats.total > 0 ? `
          <div class="upload-actions">
            <button class="btn btn-primary" id="go-screen-btn">Ir para Triagem por Tema →</button>
            <button class="btn btn-secondary" id="go-articles-btn">Ver todos os artigos →</button>
          </div>` : ''}
      </div>
    `;

    setupDropzone(project);
    document.getElementById('select-files-btn').onclick = () => $('file-input').click();
    $('file-input').onchange = (e) => handleFiles(Array.from(e.target.files), project);
    document.getElementById('go-screen-btn')?.addEventListener('click', () => { state.tab = 'screen'; renderProject(); });
    document.getElementById('go-articles-btn')?.addEventListener('click', () => { state.tab = 'articles'; renderProject(); });
  }

  function renderImportHistory(project) {
    const files = [...new Set(project.articles.map(a => a.source_file))];
    if (!files.length) return '<p class="muted">Nenhum arquivo importado ainda.</p>';
    return files.map(f => {
      const count = project.articles.filter(a => a.source_file === f).length;
      return `<div class="import-file-row"><span class="file-icon">📄</span><span class="file-name">${f}</span><span class="file-count">${count} artigos</span></div>`;
    }).join('');
  }

  function setupDropzone(project) {
    const zone = $('upload-zone');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      handleFiles(Array.from(e.dataTransfer.files), project);
    });
    zone.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      $('file-input').click();
    });
  }

  async function handleFiles(files, project) {
    if (!files.length) return;
    const progress = $('upload-progress');
    progress.style.display = 'block';
    progress.innerHTML = UI.loadingState(`Processando ${files.length} arquivo(s)…`);

    try {
      const articles = await Parsers.parseFiles(files);
      if (!articles.length) {
        progress.innerHTML = '<p class="error-msg">Nenhum artigo encontrado nos arquivos. Verifique o formato.</p>';
        return;
      }

      // Apply relevance scoring if project has keywords
      if (project.keywords?.length) {
        articles.forEach(a => {
          a.relevance_score = Similarity.relevanceScore(a, project.keywords);
        });
      }

      const updated = Storage.addArticles(project.id, articles);
      const newTotal = updated.stats.total;
      progress.innerHTML = `
        <div class="upload-success">
          ✅ <strong>${articles.length} artigos importados!</strong>
          Total no projeto: ${newTotal} artigos.
        </div>`;
      UI.toast(`${articles.length} artigos importados com sucesso!`, 'success');

      // Refresh project and re-render tab
      const refreshed = Storage.getProject(project.id);
      setTimeout(() => renderUploadTab(refreshed), 1500);
    } catch (e) {
      progress.innerHTML = `<p class="error-msg">Erro ao processar arquivos: ${e.message}</p>`;
      UI.toast('Erro ao importar arquivos', 'error');
    }
  }

  // ─── SCREEN (RAYYAN WORKBENCH) TAB ───────────────────
  function renderScreenTab(project) {
    const content = $('tab-content');
    const incKws = project.keywords || [];
    const excKws = project.excludeKeywords || [];

    // Filter articles based on current filters and facet selection
    let filteredArticles = project.articles.filter(a => {
      // 1. Facet Decision filter
      if (state.filter.decision === 'include' && a.decision !== 'include') return false;
      if (state.filter.decision === 'exclude' && a.decision !== 'exclude') return false;
      if (state.filter.decision === 'maybe' && a.decision !== 'maybe') return false;
      if (state.filter.decision === 'pending' && a.decision !== null) return false;
      if (state.filter.decision === 'duplicate' && !a.is_duplicate) return false;

      // 2. Facet Keyword filter
      if (state.filter.kw) {
        const txt = (a.title + ' ' + a.abstract).toLowerCase();
        if (!txt.includes(state.filter.kw.toLowerCase())) return false;
      }

      // 3. Facet Reason filter
      if (state.filter.reason && a.exclusion_reason !== state.filter.reason) return false;

      // 4. Facet Year filter
      if (state.filter.year && a.year !== state.filter.year) return false;

      // 5. Free Text Search
      if (state.filter.search) {
        const q = state.filter.search.toLowerCase();
        const txt = (a.title + ' ' + (a.authors?.join(' ') || '') + ' ' + a.abstract).toLowerCase();
        if (!txt.includes(q)) return false;
      }

      return true;
    });

    // Auto-select first article if none active or current active invalid
    if (filteredArticles.length > 0) {
      if (!state.activeArticleId || !filteredArticles.some(a => a.id === state.activeArticleId)) {
        state.activeArticleId = filteredArticles[0].id;
      }
    } else {
      state.activeArticleId = null;
    }

    const activeArticle = project.articles.find(a => a.id === state.activeArticleId);

    content.innerHTML = `
      <div class="screen-tab-rayyan">
        ${state.blindMode ? `
          <div class="blind-mode-banner">
            <span><strong>MODO CEGO ATIVADO</strong> — As decisões estão ocultas para evitar viés.</span>
            <button class="btn btn-sm btn-ghost" id="banner-disable-blind" style="color:#fff">Desativar</button>
          </div>` : ''}

        <!-- Modes & Quick Keywords Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="screen-mode-btn ${state.screenMode === 'list' ? 'active' : ''}" id="mode-list-btn">📊 Gisa Workbench (3 Painéis)</button>
            <button class="screen-mode-btn ${state.screenMode === 'serial' ? 'active' : ''}" id="mode-serial-btn">▶ Leitura Serial</button>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-secondary" id="manage-keywords-btn">Gerenciar Palavras-chave</button>
          </div>
        </div>

        ${state.screenMode === 'serial' ? '<div id="serial-container-slot"></div>' : `
          <div class="rayyan-workbench">
            <!-- 1. Left Panel: Facet Sidebar -->
            <div id="rayyan-facets-slot"></div>

            <!-- 2. Middle Panel: Articles List -->
            <div class="articles-center-panel">
              <div class="articles-toolbar">
                <div class="articles-search-box">
                  <span class="search-icon">🔍</span>
                  <input id="rayyan-search-input" placeholder="Buscar título/resumo/autor (Usar setas ↑↓ ou J/K para navegar)" value="${state.filter.search || ''}"/>
                </div>
                <button class="btn btn-sm btn-ghost" id="rayyan-hotkeys-btn">⌨️ Atalhos [?]</button>
              </div>
              <div class="articles-scroll-list" id="rayyan-articles-list"></div>
            </div>

            <!-- 3. Right Panel: Abstract Inspector -->
            <div id="rayyan-inspector-slot"></div>
          </div>
        `}
      </div>
    `;

    // Disable blind banner button handler
    $('banner-disable-blind')?.addEventListener('click', () => {
      state.blindMode = false;
      updateBlindModeUI();
      renderScreenTab(Storage.getProject(state.projectId));
    });

    // Mode Switcher
    $('mode-list-btn').onclick = () => { state.screenMode = 'list'; renderScreenTab(Storage.getProject(state.projectId)); };
    $('mode-serial-btn').onclick = () => { state.screenMode = 'serial'; renderScreenTab(Storage.getProject(state.projectId)); };

    // Manage keywords modal
    $('manage-keywords-btn').onclick = () => {
      UI.modal(
        '🏷️ Palavras-chave do Tema (Destaque Gisa)',
        `<div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <h4 style="color:var(--green);font-size:0.88rem;margin-bottom:6px">🟢 Termos de Inclusão (Destaque Verde)</h4>
            <div class="kw-tags" id="modal-kw-inc">
              ${incKws.map((k, i) => `<span class="kw-chip inc">${k}<button class="kw-remove-inc" data-idx="${i}" style="background:none;border:none;color:var(--green);cursor:pointer;margin-left:4px">×</button></span>`).join('')}
            </div>
            <div class="kw-add-row" style="margin-top:8px">
              <input id="modal-inc-input" class="input input-sm" placeholder="Adicionar palavra de inclusão..."/>
              <button class="btn btn-sm btn-include" id="modal-inc-add">+ Inclusão</button>
            </div>
          </div>
          <hr style="border:none;border-top:1px solid var(--border)"/>
          <div>
            <h4 style="color:var(--red);font-size:0.88rem;margin-bottom:6px">🔴 Termos de Exclusão (Destaque Vermelho)</h4>
            <div class="kw-tags" id="modal-kw-exc">
              ${excKws.map((k, i) => `<span class="kw-chip exc">${k}<button class="kw-remove-exc" data-idx="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;margin-left:4px">×</button></span>`).join('')}
            </div>
            <div class="kw-add-row" style="margin-top:8px">
              <input id="modal-exc-input" class="input input-sm" placeholder="Adicionar palavra de exclusão..."/>
              <button class="btn btn-sm btn-exclude" id="modal-exc-add">+ Exclusão</button>
            </div>
          </div>
        </div>`,
        [{ label: 'Concluído', style: 'btn-primary', cb: () => renderScreenTab(Storage.getProject(state.projectId)) }]
      );

      setTimeout(() => setupKeywordsEditor(project), 50);
    };

    if (state.screenMode === 'serial') {
      renderSerialMode(Storage.getProject(state.projectId));
      return;
    }

    // 1. Render Left Panel (Facets)
    const facetsSlot = $('rayyan-facets-slot');
    if (facetsSlot) {
      facetsSlot.replaceWith(UI.renderFacetSidebar(project, state.filter, (type, val) => {
        if (type === 'decision') state.filter.decision = val;
        else if (type === 'inc_kw' || type === 'exc_kw') state.filter.kw = state.filter.kw === val ? null : val;
        else if (type === 'reason') state.filter.reason = state.filter.reason === val ? null : val;
        else if (type === 'year') state.filter.year = state.filter.year === val ? null : val;
        else if (type === 'reset') state.filter = { decision: 'all', search: '', kw: null, reason: null, year: null };
        
        state.articleOffset = 0;
        renderScreenTab(Storage.getProject(state.projectId));
      }));
    }

    // 2. Render Middle Panel (Articles List)
    renderRayyanArticlesListOnly(project);

    // Search Input Listener (Smooth typing without focus loss)
    const searchInput = $('rayyan-search-input');
    if (searchInput) {
      searchInput.oninput = () => {
        state.filter.search = searchInput.value;
        renderRayyanArticlesListOnly(Storage.getProject(state.projectId));
      };
    }

    // Hotkeys Help Button
    $('rayyan-hotkeys-btn')?.addEventListener('click', () => UI.showHotkeysModal());
  }

  function getFilteredArticles(project) {
    return project.articles.filter(a => {
      // 1. Facet Decision filter
      if (state.filter.decision === 'include' && a.decision !== 'include') return false;
      if (state.filter.decision === 'exclude' && a.decision !== 'exclude') return false;
      if (state.filter.decision === 'maybe' && a.decision !== 'maybe') return false;
      if (state.filter.decision === 'pending' && a.decision !== null) return false;
      if (state.filter.decision === 'duplicate' && !a.is_duplicate) return false;

      // 2. Facet Keyword filter
      if (state.filter.kw) {
        const txt = (a.title + ' ' + a.abstract).toLowerCase();
        if (!txt.includes(state.filter.kw.toLowerCase())) return false;
      }

      // 3. Facet Reason filter
      if (state.filter.reason && a.exclusion_reason !== state.filter.reason) return false;

      // 4. Facet Year filter
      if (state.filter.year && a.year !== state.filter.year) return false;

      // 5. Free Text Search (com busca bilingue cruzada PT-EN)
      if (state.filter.search) {
        const q = state.filter.search.toLowerCase().trim();
        if (q) {
          const syns = Similarity.getBilingualSynonyms(q);
          const allSearchTerms = [q, ...syns];
          const txt = (a.title + ' ' + (a.authors?.join(' ') || '') + ' ' + a.abstract).toLowerCase();
          const matches = allSearchTerms.some(term => txt.includes(term));
          if (!matches) return false;
        }
      }

      return true;
    });
  }

  function renderRayyanArticlesListOnly(project) {
    const articlesListEl = $('rayyan-articles-list');
    if (!articlesListEl) return;

    let filtered = getFilteredArticles(project);

    // Sort by IA Relevance Score descending, then year
    filtered.sort((a, b) => {
      const scoreA = a.relevance_score !== null && a.relevance_score !== undefined ? a.relevance_score : -1;
      const scoreB = b.relevance_score !== null && b.relevance_score !== undefined ? b.relevance_score : -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.year || 0) - (a.year || 0);
    });

    if (!filtered.length) {
      articlesListEl.innerHTML = UI.emptyState('🔍', 'Nenhum artigo encontrado', 'Tente ajustar os filtros facetados ou a busca.');
      updateInspectorPanel(null, project);
      return;
    }

    const pageSize = state.articlePageSize || 20;
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    
    // Ensure offset is in valid range
    if (state.articleOffset >= totalItems) state.articleOffset = 0;
    if (state.articleOffset < 0) state.articleOffset = 0;

    const currentPage = Math.floor(state.articleOffset / pageSize) + 1;
    const startIdx = state.articleOffset;
    const endIdx = Math.min(startIdx + pageSize, totalItems);
    const pagedArticles = filtered.slice(startIdx, endIdx);

    // Ensure activeArticle is valid
    if (!state.activeArticleId || !pagedArticles.some(a => a.id === state.activeArticleId)) {
      state.activeArticleId = pagedArticles[0]?.id || filtered[0]?.id;
    }
    const activeArticle = project.articles.find(a => a.id === state.activeArticleId);

    // Build pagination controls HTML
    const paginationHtml = `
      <div class="workbench-pagination" style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:8px 14px;margin-bottom:8px;font-size:0.82rem;">
        <div style="color:var(--text-secondary);">
          Página <strong style="color:var(--text-primary);">${currentPage}</strong> de ${totalPages} 
          <span style="color:var(--text-muted);margin-left:4px;">(${startIdx + 1}–${endIdx} de ${totalItems})</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="btn btn-sm btn-ghost page-prev-btn" ${currentPage === 1 ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>◀ Anterior</button>
          <button class="btn btn-sm btn-ghost page-next-btn" ${currentPage === totalPages ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>Próxima ▶</button>
        </div>
      </div>
    `;

    articlesListEl.innerHTML = paginationHtml + '<div class="articles-cards-container" style="display:flex;flex-direction:column;gap:12px;"></div>' + (totalPages > 1 ? paginationHtml : '');

    const cardsContainer = articlesListEl.querySelector('.articles-cards-container');

    pagedArticles.forEach(article => {
      const isSelected = article.id === state.activeArticleId;
      const row = document.createElement('div');
      row.className = `rayyan-article-row ${isSelected ? 'selected' : ''}`;
      row.dataset.id = article.id;

      let statusBadge = '';
      if (state.blindMode) {
        statusBadge = '<span class="badge badge-purple" style="font-size:0.7rem">Modo Cego</span>';
      } else if (article.decision === 'include') {
        statusBadge = '<span class="badge badge-include" style="font-size:0.7rem">Incluído</span>';
      } else if (article.decision === 'exclude') {
        statusBadge = `<span class="badge badge-exclude" style="font-size:0.7rem">Excluído ${article.exclusion_reason ? `(${article.exclusion_reason})` : ''}</span>`;
      } else if (article.decision === 'maybe') {
        statusBadge = '<span class="badge badge-maybe" style="font-size:0.7rem">Talvez</span>';
      } else {
        statusBadge = '<span class="badge badge-pending" style="font-size:0.7rem">Pendente</span>';
      }

      const relChip = article.relevance_score !== null && article.relevance_score !== undefined && article.relevance_score > 0
        ? `<span style="font-size:0.72rem;color:var(--purple);background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.25);padding:2px 8px;border-radius:4px;white-space:nowrap;font-weight:600;">✨ ${article.relevance_score}%</span>`
        : '';

      row.innerHTML = `
        <div class="rayyan-row-header">
          <div class="rayyan-article-title">${UI.escapeHtml ? UI.escapeHtml(article.title) : article.title}</div>
          <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
            ${statusBadge}
          </div>
        </div>
        <div class="rayyan-row-meta">
          <span>${article.authors?.length ? (UI.escapeHtml ? UI.escapeHtml(article.authors[0]) : article.authors[0]) + (article.authors.length > 1 ? ' et al.' : '') : 'Autores n/d'}</span>
          ${article.journal ? `<span>· ${UI.escapeHtml ? UI.escapeHtml(article.journal) : article.journal}</span>` : ''}
          ${article.year ? `<span>· ${UI.escapeHtml ? UI.escapeHtml(article.year) : article.year}</span>` : ''}
          ${relChip}
        </div>
        <div class="rayyan-row-actions">
          <button class="btn-rayyan-inc ${article.decision === 'include' ? 'active' : ''}" data-act="inc" aria-pressed="${article.decision === 'include'}">Incluir (I)</button>
          <button class="btn-rayyan-exc ${article.decision === 'exclude' ? 'active' : ''}" data-act="exc" aria-pressed="${article.decision === 'exclude'}">Excluir (E)</button>
          <button class="btn-rayyan-maybe ${article.decision === 'maybe' ? 'active' : ''}" data-act="maybe" aria-pressed="${article.decision === 'maybe'}">Talvez (M)</button>
        </div>
      `;

      row.addEventListener('click', e => {
        const actBtn = e.target.closest('[data-act]');
        state.activeArticleId = article.id;

        if (actBtn) {
          e.stopPropagation();
          const act = actBtn.dataset.act;
          if (act === 'inc') makeDecision(project.id, article.id, 'include');
          else if (act === 'exc') makeDecision(project.id, article.id, 'exclude');
          else if (act === 'maybe') makeDecision(project.id, article.id, 'maybe');
        } else {
          document.querySelectorAll('.rayyan-article-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          updateInspectorPanel(article, project);
        }
      });

      cardsContainer.appendChild(row);
    });

    // Bind Pagination Buttons
    articlesListEl.querySelectorAll('.page-prev-btn').forEach(btn => {
      btn.onclick = () => {
        if (state.articleOffset >= pageSize) {
          state.articleOffset -= pageSize;
          renderRayyanArticlesListOnly(Storage.getProject(state.projectId));
        }
      };
    });

    articlesListEl.querySelectorAll('.page-next-btn').forEach(btn => {
      btn.onclick = () => {
        if (state.articleOffset + pageSize < totalItems) {
          state.articleOffset += pageSize;
          renderRayyanArticlesListOnly(Storage.getProject(state.projectId));
        }
      };
    });

    updateInspectorPanel(activeArticle, project);
  }

  function updateInspectorPanel(article, project) {
    const inspectorSlot = $('rayyan-inspector-slot') || document.querySelector('.abstract-inspector-panel');
    if (!inspectorSlot) return;

    const kwObject = {
      include: project.keywords || [],
      exclude: project.excludeKeywords || []
    };

    const callbacks = {
      onInclude: () => makeDecision(project.id, article?.id, 'include'),
      onExclude: () => makeDecision(project.id, article?.id, 'exclude'),
      onMaybe:   () => makeDecision(project.id, article?.id, 'maybe'),
      onAttachPdf: async (fileName, dataUrl) => {
        if (!article) return;
        await Storage.attachArticlePdf(project.id, article.id, dataUrl, fileName);
        article.has_pdf = true;
        article.pdf_name = fileName;
        article.pdf_data = dataUrl;
        UI.toast('Arquivo PDF anexado ao artigo com sucesso!', 'success');
        renderRayyanArticlesListOnly(Storage.getProject(project.id));
      }
    };

    inspectorSlot.replaceWith(UI.renderAbstractInspector(article, kwObject, state.blindMode, callbacks));
  }

  function setupKeywordsEditor(project) {
    // NOTE: IDs must match the modal HTML generated in renderScreenTab → manage-keywords-btn
    // Modal uses: #modal-kw-inc, #modal-kw-exc, #modal-inc-input, #modal-exc-input,
    //             #modal-inc-add, #modal-exc-add, .kw-remove-inc, .kw-remove-exc
    let incKws = Storage.getProject(project.id)?.keywords || [];
    let excKws = Storage.getProject(project.id)?.excludeKeywords || [];

    // Remove inclusion keyword
    document.getElementById('modal-kw-inc')?.addEventListener('click', e => {
      const btn = e.target.closest('.kw-remove-inc');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      incKws = incKws.filter((_, i) => i !== idx);
      Storage.updateProject(project.id, { keywords: incKws });
      rescoreAndRefresh(project.id, incKws);
    });

    // Remove exclusion keyword
    document.getElementById('modal-kw-exc')?.addEventListener('click', e => {
      const btn = e.target.closest('.kw-remove-exc');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      excKws = excKws.filter((_, i) => i !== idx);
      Storage.updateProject(project.id, { excludeKeywords: excKws });
      renderScreenTab(Storage.getProject(project.id));
    });

    // Add inclusion keyword
    const addInc = () => {
      const input = document.getElementById('modal-inc-input');
      const val = input ? input.value.trim() : '';
      if (!val) return;
      incKws = [...incKws, ...val.split(',').map(k => k.trim()).filter(Boolean)];
      Storage.updateProject(project.id, { keywords: incKws });
      if (input) input.value = '';
      rescoreAndRefresh(project.id, incKws);
    };
    const incAddBtn = document.getElementById('modal-inc-add');
    if (incAddBtn) incAddBtn.onclick = addInc;
    document.getElementById('modal-inc-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') addInc(); });

    // Add exclusion keyword
    const addExc = () => {
      const input = document.getElementById('modal-exc-input');
      const val = input ? input.value.trim() : '';
      if (!val) return;
      excKws = [...excKws, ...val.split(',').map(k => k.trim()).filter(Boolean)];
      Storage.updateProject(project.id, { excludeKeywords: excKws });
      if (input) input.value = '';
      renderScreenTab(Storage.getProject(project.id));
    };
    const excAddBtn = document.getElementById('modal-exc-add');
    if (excAddBtn) excAddBtn.onclick = addExc;
    document.getElementById('modal-exc-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') addExc(); });
  }

  function rescoreAndRefresh(projectId, keywords) {
    const p = Storage.getProject(projectId);
    const updated = p.articles.map(a => ({ id: a.id, relevance_score: Similarity.relevanceScore(a, keywords) }));
    Storage.bulkUpdateArticles(projectId, updated);
    renderScreenTab(Storage.getProject(projectId));
  }

  function setupScreenFilters() {}  // handled inline

  function renderScreenArticles(project, keywords) {
    const list = $('screen-articles-list');
    const pag = $('screen-pagination');
    if (!list) return;

    const articles = getFilteredArticles(project);

    // Update counts
    const relevantCount = project.articles.filter(a => (a.relevance_score || 0) > 0).length;
    const countEl = $('screen-relevant-count');
    if (countEl) countEl.textContent = relevantCount;

    // Pagination
    const total = articles.length;
    const pageSize = state.articlePageSize;
    const offset = state.articleOffset;
    const page = articles.slice(offset, offset + pageSize);

    if (!page.length) {
      list.innerHTML = UI.emptyState('🔍', 'Nenhum artigo encontrado', 'Tente ajustar os filtros ou adicionar palavras-chave.');
      pag.innerHTML = '';
      return;
    }

    list.innerHTML = '';
    const kwObject = { include: project.keywords || [], exclude: project.excludeKeywords || [] };
    page.forEach(article => {
      const card = UI.renderArticleCard(article, kwObject, {
        onInclude: () => makeDecision(project.id, article.id, 'include'),
        onExclude: () => makeDecision(project.id, article.id, 'exclude'),
        onMaybe:   () => makeDecision(project.id, article.id, 'maybe'),
        onNote:    () => showNoteModal(project.id, article),
        onDelete:  () => {}
      });
      // Add label chips to card
      const projectLabels = project.labels || [];
      if (article.labels?.length && projectLabels.length) {
        const labelBar = document.createElement('div');
        labelBar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)';
        labelBar.innerHTML = UI.renderLabelChips(article, projectLabels);
        const labelBtn = document.createElement('button');
        labelBtn.className = 'serial-label-btn';
        labelBtn.innerHTML = '🏷️';
        labelBtn.title = 'Gerenciar labels';
        labelBtn.style.cssText = 'position:relative;padding:2px 8px;font-size:0.72rem';
        labelBtn.addEventListener('click', e => {
          UI.showLabelPicker(e.currentTarget, article, projectLabels, project.id, () => {
            renderScreenArticles(Storage.getProject(state.projectId), project.keywords || []);
          });
        });
        labelBar.appendChild(labelBtn);
        card.querySelector('.article-card-inner')?.appendChild(labelBar);
      }
      list.appendChild(card);
    });

    // Pagination controls
    pag.innerHTML = '';
    if (total > pageSize) {
      if (offset > 0) {
        const prev = document.createElement('button');
        prev.className = 'btn btn-ghost btn-sm';
        prev.textContent = '← Anterior';
        prev.onclick = () => { state.articleOffset -= pageSize; renderScreenArticles(project, keywords); };
        pag.appendChild(prev);
      }
      const info = document.createElement('span');
      info.className = 'pagination-info';
      info.textContent = `${offset + 1}–${Math.min(offset + pageSize, total)} de ${total}`;
      pag.appendChild(info);
      if (offset + pageSize < total) {
        const next = document.createElement('button');
        next.className = 'btn btn-ghost btn-sm';
        next.textContent = 'Próximo →';
        next.onclick = () => { state.articleOffset += pageSize; renderScreenArticles(project, keywords); };
        pag.appendChild(next);
      }
    }
  }

  // ─── SERIAL SCREENING MODE ────────────────────────────

  function renderSerialMode(project) {
    // In Gisa Workbench (3-panel) the serial container is #serial-container-slot
    // In legacy screen mode it was #screen-articles-list
    const slot = $('serial-container-slot');
    const list = slot || $('screen-articles-list');
    const pag  = $('screen-pagination');
    if (!list) return;
    if (pag) pag.innerHTML = '';

    const articles = getFilteredArticles(project);
    const total = articles.length;
    const idx = Math.min(state.serialIndex, total - 1);
    const article = articles[idx];
    const projectLabels = project.labels || [];
    const keywords = { include: project.keywords || [], exclude: project.excludeKeywords || [] };
    const pct = total > 0 ? Math.round((idx / total) * 100) : 0;

    if (!article || total === 0) {
      list.innerHTML = `
        <div class="serial-view">
          <div class="serial-topbar">
            <div class="serial-progress-track"><div class="serial-progress-fill" style="width:100%"></div></div>
            <span class="serial-counter">0 / 0</span>
          </div>
          <div class="serial-done-card">
            <div class="serial-done-icon">🎉</div>
            <div class="serial-done-title">Triagem concluída!</div>
            <div class="serial-done-sub">Todos os artigos foram avaliados com os filtros atuais.</div>
            <button class="btn btn-primary" id="serial-go-export">Ver resultados →</button>
          </div>
        </div>`;
      document.getElementById('serial-go-export')?.addEventListener('click', () => { state.tab = 'export'; renderProject(); });
      return;
    }

    const currentLabelsHtml = (article.labels || []).map(lid => {
      const lbl = projectLabels.find(l => l.id === lid);
      return lbl ? `<span class="label-chip" style="background:${lbl.color}22;color:${lbl.color};border-color:${lbl.color}55">${lbl.name}</span>` : '';
    }).join('');

    const titleHtml = keywords.include.length
      ? Similarity.highlightKeywords(article.title, keywords)
      : (article.title || 'Sem título');
    const abstractHtml = keywords.include.length
      ? Similarity.highlightKeywords(article.abstract || '', keywords)
      : (article.abstract || '');
    const doiUrl = article.doi ? `https://doi.org/${article.doi}` : `https://scholar.google.com/scholar?q=${encodeURIComponent(article.title)}`;

    list.innerHTML = `
      <div class="serial-view" id="serial-view">
        <div class="serial-topbar">
          <button class="serial-nav-btn" id="serial-prev" ${idx === 0 ? 'disabled' : ''} title="Anterior (←)">←</button>
          <div class="serial-progress-track">
            <div class="serial-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="serial-counter">${idx + 1} / ${total}</span>
          <button class="serial-nav-btn" id="serial-next" ${idx >= total - 1 ? 'disabled' : ''} title="Próximo (→)">→</button>
        </div>
        <div class="serial-card serial-card-enter" id="serial-main-card">
          <div class="serial-header-row">
            <div class="serial-badges">
              ${article.relevance_score !== null ? `<span class="badge badge-relevance">${article.relevance_score}% relevante</span>` : ''}
              ${article.is_duplicate ? `<span class="badge badge-dup">⚠ Duplicata ${article.duplicate_score}%</span>` : ''}
              <span class="badge ${article.decision === 'include' ? 'badge-include' : article.decision === 'exclude' ? 'badge-exclude' : article.decision === 'maybe' ? 'badge-maybe' : 'badge-pending'}">${article.decision === 'include' ? '✓ Incluído' : article.decision === 'exclude' ? '✗ Excluído' : article.decision === 'maybe' ? '? Talvez' : '· Pendente'}</span>
              ${currentLabelsHtml}
            </div>
            <a href="${doiUrl}" target="_blank" style="font-size:0.75rem;color:var(--purple);white-space:nowrap" onclick="event.stopPropagation()">🔗 Fonte ↗</a>
          </div>

          <h3 class="serial-title">${titleHtml}</h3>

          <div class="serial-meta">
            ${(article.authors || []).length ? `<span>👤 ${article.authors.slice(0,3).join('; ')}${article.authors.length > 3 ? ` +${article.authors.length - 3}` : ''}</span>` : ''}
            ${article.year ? `<span>📅 ${article.year}</span>` : ''}
            ${article.journal ? `<span>📰 ${article.journal}</span>` : ''}
            ${article.doi ? `<span>DOI: ${article.doi}</span>` : ''}
          </div>

          ${abstractHtml
            ? `<div class="serial-abstract">${abstractHtml}</div>`
            : `<div class="serial-no-abstract">ℹ️ Nenhum resumo disponível no arquivo importado.</div>`
          }

          <div class="serial-actions">
            <button class="serial-action-btn serial-btn-include ${article.decision === 'include' ? 'active' : ''}" id="serial-include">
              <span class="hotkey-hint">I</span>✓ Incluir
            </button>
            <button class="serial-action-btn serial-btn-maybe ${article.decision === 'maybe' ? 'active' : ''}" id="serial-maybe">
              <span class="hotkey-hint">M</span>? Talvez
            </button>
            <button class="serial-action-btn serial-btn-exclude ${article.decision === 'exclude' ? 'active' : ''}" id="serial-exclude">
              <span class="hotkey-hint">E</span>✗ Excluir
            </button>
          </div>

          <div class="serial-extras">
            <button class="serial-note-btn" id="serial-note-btn">📝 ${article.note ? 'Editar nota' : 'Adicionar nota'}</button>
            <button class="serial-label-btn" id="serial-label-btn" style="position:relative">🏷️ Labels</button>
            ${article.note ? `<span style="font-size:0.78rem;color:var(--text-muted);font-style:italic">📝 ${article.note.substring(0,60)}${article.note.length>60?'…':''}</span>` : ''}
            <button class="serial-skip-btn" id="serial-skip">Pular →</button>
          </div>
        </div>
      </div>
    `;

    // Navigation
    $('serial-prev')?.addEventListener('click', () => { state.serialIndex = Math.max(0, idx - 1); renderSerialMode(Storage.getProject(state.projectId)); });
    $('serial-next')?.addEventListener('click', () => { state.serialIndex = Math.min(total - 1, idx + 1); renderSerialMode(Storage.getProject(state.projectId)); });
    $('serial-skip')?.addEventListener('click', () => { state.serialIndex = Math.min(total - 1, idx + 1); renderSerialMode(Storage.getProject(state.projectId)); });

    // Decision buttons
    $('serial-include')?.addEventListener('click', () => { makeDecision(project.id, article.id, 'include'); setTimeout(() => { state.serialIndex = Math.min(total - 1, idx + 1); renderSerialMode(Storage.getProject(state.projectId)); }, 300); });
    $('serial-maybe')?.addEventListener('click', () => { makeDecision(project.id, article.id, 'maybe'); setTimeout(() => { state.serialIndex = Math.min(total - 1, idx + 1); renderSerialMode(Storage.getProject(state.projectId)); }, 300); });
    $('serial-exclude')?.addEventListener('click', () => {
      UI.showExclusionReasonModal(reason => {
        Storage.updateArticle(project.id, article.id, { decision: article.decision === 'exclude' ? null : 'exclude', exclusion_reason: reason });
        setTimeout(() => { state.serialIndex = Math.min(total - 1, idx + 1); renderSerialMode(Storage.getProject(state.projectId)); }, 300);
      });
    });

    // Note
    $('serial-note-btn')?.addEventListener('click', () => showNoteModal(project.id, article));

    // Label picker
    $('serial-label-btn')?.addEventListener('click', (e) => {
      UI.showLabelPicker(e.currentTarget, article, project.labels || [], project.id, () => {
        renderSerialMode(Storage.getProject(state.projectId));
      });
    });
  }

  // ─── DEDUP TAB ────────────────────────────────────────
  function renderDedupTab(project) {
    const content = $('tab-content');

    if (!project.articles.length) {
      content.innerHTML = `<div class="dedup-tab">${UI.emptyState('🔄', 'Nenhum artigo para comparar', 'Importe artigos primeiro na aba Importar.')}</div>`;
      return;
    }

    content.innerHTML = `
      <div class="dedup-tab">
        <div class="dedup-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;background:var(--bg-card);padding:20px 24px;border:1px solid var(--border);border-radius:var(--radius-xl);margin-bottom:20px;">
          <div class="dedup-config" style="flex:1;min-width:280px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-size:1.2rem;">🔍</span>
              <label style="font-size:0.95rem;font-weight:700;color:var(--text-primary);">Limiar de Similaridade Rápido:</label>
              <span id="threshold-display" class="threshold-val" style="font-size:0.9rem;font-weight:800;color:var(--purple);background:var(--purple-glow);padding:2px 8px;border-radius:var(--radius-sm);">65%</span>
            </div>
            <div class="threshold-row" style="display:flex;align-items:center;gap:12px;">
              <input type="range" id="dup-threshold" min="50" max="100" value="65" class="range-input" style="flex:1;cursor:pointer;"/>
            </div>
            <small style="color:var(--text-muted);font-size:0.76rem;">Padrão Estrito = 97% | Padrão Abrangente = 65%</small>
          </div>
          <div class="dedup-top-buttons" style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-secondary" id="run-dedup-btn">🔍 Re-analisar</button>
            <button class="btn btn-primary" id="open-auto-resolver-pro-btn" style="background:linear-gradient(135deg, var(--purple), var(--violet));box-shadow:0 4px 14px var(--purple-glow);">
              ⚡ Systematic Auto-Resolver (Gisa Pro)
            </button>
          </div>
        </div>
        <div id="dedup-results"></div>
      </div>
    `;

    const range = $('dup-threshold');
    const display = $('threshold-display');
    range.oninput = () => { display.textContent = range.value + '%'; };

    $('run-dedup-btn').onclick = () => runDeduplication(project, parseInt(range.value));
    
    $('open-auto-resolver-pro-btn').onclick = () => {
      const pairs = state.dupPairs.length ? state.dupPairs : Similarity.findDuplicates(project.articles, 50);
      UI.showAutoResolverModal(project, pairs, (opts) => {
        applyAutoResolverPro(project, opts);
      });
    };

    // If already ran, show results
    if (state.dupPairs.length > 0) renderDupResults(project);
    else runDeduplication(project, 65);
  }

  async function runDeduplication(project, threshold) {
    const btn = $('run-dedup-btn');
    const results = $('dedup-results');
    if (!btn || !results) return;
    btn.disabled = true;
    btn.textContent = '⏳ Analisando…';
    results.innerHTML = UI.loadingState(`Comparando ${project.articles.length} artigos entre si… Isso pode levar alguns segundos.`);

    await new Promise(r => setTimeout(r, 50));

    // Bug fix: was incorrectly capping threshold at 55, ignoring the user's slider value.
    // The minimum scan threshold for candidate-finding is independent of the display threshold.
    const pairs = Similarity.findDuplicates(project.articles, Math.min(threshold, 55));
    // Note: findDuplicates with low minScore finds ALL candidates; filtering by threshold happens below.
    state.dupPairs = pairs;
    state.dupResolved = new Set();

    btn.disabled = false;
    btn.textContent = '🔍 Detectar Duplicatas';

    const autoHighPairs = pairs.filter(p => p.score >= threshold);
    const manualPairs = pairs.filter(p => p.score < threshold && p.score >= 55);

    const markedDups = new Set();
    autoHighPairs.forEach(p => markedDups.add(p.articleB.id));
    const uniqueRemaining = project.articles.length - markedDups.size;

    results.innerHTML = `
      <div class="dedup-summary">
        <div class="dedup-stat-chip high">
          <span>${markedDups.size}</span>
          <small>duplicatas encontradas (≥ ${threshold}%)</small>
        </div>
        <div class="dedup-stat-chip" style="background:var(--green-bg);color:var(--green)">
          <span>${uniqueRemaining}</span>
          <small>artigos únicos restantes para triagem</small>
        </div>
        ${manualPairs.length > 0 ? `
        <div class="dedup-stat-chip medium">
          <span>${manualPairs.length}</span>
          <small>para verificar manual (55%–${threshold-1}%)</small>
        </div>` : ''}
        <div class="dedup-actions-top" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="open-auto-resolver-pro-btn2">
            ⚙️ Opções Avançadas
          </button>
          ${autoHighPairs.length > 0 ? `<button class="btn btn-danger" id="auto-resolve-btn">⚡ Resolver automaticamente todas as ${markedDups.size} duplicatas</button>` : ''}
        </div>
      </div>
      <div id="dup-pairs-list"></div>
    `;

    $('auto-resolve-btn')?.addEventListener('click', () => autoResolveHighSimilarity(project, autoHighPairs, threshold));
    
    $('open-auto-resolver-pro-btn2')?.addEventListener('click', () => {
      UI.showAutoResolverModal(project, pairs, (opts) => {
        applyAutoResolverPro(project, opts);
      });
    });

    renderDupResults(project);
  }

  function renderDupResults(project) {
    const list = $('dup-pairs-list');
    if (!list) return;
    const pairs = state.dupPairs.filter(p => !state.dupResolved.has(`${p.articleA.id}_${p.articleB.id}`));

    if (!pairs.length) {
      list.innerHTML = UI.emptyState('✅', 'Nenhuma duplicata pendente', 'Todas as duplicatas foram resolvidas.');
      return;
    }

    list.innerHTML = '';
    pairs.forEach((pair, idx) => {
      const pairCard = UI.renderDupPair(pair, idx, {
        onKeepA: () => resolvePair(project, pair, 'a'),
        onKeepB: () => resolvePair(project, pair, 'b'),
        onKeepBoth: () => resolvePair(project, pair, 'both'),
        onIgnore: () => resolvePair(project, pair, 'ignore'),
      });
      list.appendChild(pairCard);
    });
  }

  function resolvePair(project, pair, action) {
    const key = `${pair.articleA.id}_${pair.articleB.id}`;
    state.dupResolved.add(key);

    const updates = [];
    if (action === 'a') {
      updates.push({ id: pair.articleB.id, is_duplicate: true, duplicate_score: pair.score, duplicate_of: pair.articleA.id, decision: 'exclude' });
    } else if (action === 'b') {
      updates.push({ id: pair.articleA.id, is_duplicate: true, duplicate_score: pair.score, duplicate_of: pair.articleB.id, decision: 'exclude' });
    } else if (action === 'both') {
      updates.push({ id: pair.articleA.id, is_duplicate: false }, { id: pair.articleB.id, is_duplicate: false });
    }

    if (updates.length) Storage.bulkUpdateArticles(project.id, updates);
    UI.toast(action === 'ignore' ? 'Par ignorado' : 'Par resolvido', 'success');
    renderDupResults(Storage.getProject(state.projectId));
  }

  function applyAutoResolverPro(project, opts) {
    const { filePref, matchingPairs } = opts;
    const updates = [];
    const markedDups = new Set();

    matchingPairs.forEach(pair => {
      const key = `${pair.articleA.id}_${pair.articleB.id}`;
      state.dupResolved.add(key);

      let keepArticle = pair.articleA;
      let deleteArticle = pair.articleB;

      if (filePref !== 'auto') {
        if (pair.articleA.source_file === filePref && pair.articleB.source_file !== filePref) {
          keepArticle = pair.articleA;
          deleteArticle = pair.articleB;
        } else if (pair.articleB.source_file === filePref && pair.articleA.source_file !== filePref) {
          keepArticle = pair.articleB;
          deleteArticle = pair.articleA;
        }
      } else {
        // Gisa AI: Keep the one with longer abstract or valid DOI
        const lenA = (pair.articleA.abstract || '').length + (pair.articleA.doi ? 200 : 0);
        const lenB = (pair.articleB.abstract || '').length + (pair.articleB.doi ? 200 : 0);
        if (lenB > lenA) {
          keepArticle = pair.articleB;
          deleteArticle = pair.articleA;
        }
      }

      if (!markedDups.has(deleteArticle.id)) {
        updates.push({
          id: deleteArticle.id,
          is_duplicate: true,
          duplicate_score: pair.score,
          duplicate_of: keepArticle.id,
          decision: 'exclude'
        });
        markedDups.add(deleteArticle.id);
      }
    });

    Storage.bulkUpdateArticles(project.id, updates);
    UI.toast(`${updates.length} duplicatas resolvidas via Systematic Auto Resolver!`, 'success');
    renderDedupTab(Storage.getProject(state.projectId));
  }

  function autoResolveHighSimilarity(project, pairs, threshold) {
    const updates = [];
    pairs.forEach(pair => {
      const key = `${pair.articleA.id}_${pair.articleB.id}`;
      state.dupResolved.add(key);
      updates.push({ id: pair.articleB.id, is_duplicate: true, duplicate_score: pair.score, duplicate_of: pair.articleA.id, decision: 'exclude' });
    });
    Storage.bulkUpdateArticles(project.id, updates);
    UI.toast(`${pairs.length} duplicatas resolvidas automaticamente!`, 'success');
    renderDedupTab(Storage.getProject(state.projectId));
  }

  function renderDupTab(project) {
    state.tab = 'dedup';
    renderProjectTab(project);
    updateTabActive();
  }

  // ─── ARTICLES TAB ─────────────────────────────────────
  function renderArticlesTab(project) {
    const content = $('tab-content');
    content.innerHTML = `
      <div class="articles-tab">
        <div class="articles-filters">
          <input id="art-search" class="input input-sm" placeholder="Buscar no título…" value="${state.filter.search}"/>
          <select id="art-decision-filter" class="input input-sm select">
            <option value="all">Todas as decisões</option>
            <option value="null">Sem decisão</option>
            <option value="include">Incluídos</option>
            <option value="exclude">Excluídos</option>
            <option value="maybe">Talvez</option>
          </select>
          <select id="art-sort" class="input input-sm select">
            <option value="relevance">Por relevância</option>
            <option value="year-desc">Ano (recente)</option>
            <option value="year-asc">Ano (antigo)</option>
            <option value="title">Título A–Z</option>
          </select>
          <button class="btn btn-sm btn-secondary" id="art-apply-btn">Filtrar</button>
        </div>
        <div id="articles-list"></div>
        <div id="articles-pagination" class="pagination"></div>
      </div>
    `;

    $('art-apply-btn').onclick = () => {
      state.filter.search = $('art-search').value.trim();
      state.filter.decision = $('art-decision-filter').value;
      state.articleOffset = 0;
      renderArticlesList(Storage.getProject(state.projectId));
    };
    $('art-search').addEventListener('keydown', e => { if (e.key === 'Enter') $('art-apply-btn').click(); });

    renderArticlesList(project);
  }

  function renderArticlesList(project) {
    const list = $('articles-list');
    const pag = $('articles-pagination');
    if (!list) return;

    let articles = [...project.articles];
    const q = state.filter.search.toLowerCase();
    if (q) articles = articles.filter(a => a.title.toLowerCase().includes(q) || (a.abstract||'').toLowerCase().includes(q));
    if (state.filter.decision === 'null') articles = articles.filter(a => !a.decision);
    else if (state.filter.decision !== 'all') articles = articles.filter(a => a.decision === state.filter.decision);

    // Sort
    const sort = $('art-sort')?.value || 'relevance';
    if (sort === 'relevance') articles.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    else if (sort === 'year-desc') articles.sort((a, b) => (b.year || '').localeCompare(a.year || ''));
    else if (sort === 'year-asc') articles.sort((a, b) => (a.year || '').localeCompare(b.year || ''));
    else if (sort === 'title') articles.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

    const total = articles.length;
    const pageSize = state.articlePageSize;
    const offset = state.articleOffset;
    const page = articles.slice(offset, offset + pageSize);

    if (!page.length) {
      list.innerHTML = UI.emptyState('📄', 'Nenhum artigo encontrado', 'Ajuste os filtros ou importe artigos.');
      pag.innerHTML = '';
      return;
    }

    list.innerHTML = '';
    page.forEach(article => {
      const card = UI.renderArticleCard(article, project.keywords, {
        onInclude: () => makeDecision(project.id, article.id, 'include'),
        onExclude: () => makeDecision(project.id, article.id, 'exclude'),
        onMaybe:   () => makeDecision(project.id, article.id, 'maybe'),
        onNote:    () => showNoteModal(project.id, article),
        onDelete:  () => {}
      });
      list.appendChild(card);
    });

    pag.innerHTML = '';
    if (total > pageSize) {
      if (offset > 0) {
        const prev = document.createElement('button');
        prev.className = 'btn btn-ghost btn-sm';
        prev.textContent = '← Anterior';
        prev.onclick = () => { state.articleOffset -= pageSize; renderArticlesList(Storage.getProject(state.projectId)); };
        pag.appendChild(prev);
      }
      const info = document.createElement('span');
      info.className = 'pagination-info';
      info.textContent = `${offset + 1}–${Math.min(offset + pageSize, total)} de ${total}`;
      pag.appendChild(info);
      if (offset + pageSize < total) {
        const next = document.createElement('button');
        next.className = 'btn btn-ghost btn-sm';
        next.textContent = 'Próximo →';
        next.onclick = () => { state.articleOffset += pageSize; renderArticlesList(Storage.getProject(state.projectId)); };
        pag.appendChild(next);
      }
    }
  }

  // ─── STATS TAB ────────────────────────────────────────
  function renderStatsTab(project) {
    const s = project.stats;
    const totalRaw = s.total || 1;
    const pctEvaluated = Math.round(((s.total - s.pending) / totalRaw) * 100);

    // Percentual por categoria sobre o total
    const pctIncluded  = ((s.included / totalRaw) * 100).toFixed(1);
    const pctExcluded  = ((s.excluded / totalRaw) * 100).toFixed(1);
    const pctMaybe     = ((s.maybe / totalRaw) * 100).toFixed(1);
    const pctPending   = ((s.pending / totalRaw) * 100).toFixed(1);
    const pctDup       = ((s.duplicates / totalRaw) * 100).toFixed(1);

    // Agrupamento dos motivos de exclusão
    const excludedArticles = project.articles.filter(a => a.decision === 'exclude');
    const exclusionReasonsMap = {};
    excludedArticles.forEach(a => {
      const r = (a.exclusion_reason || 'Outro / Não especificado').trim();
      exclusionReasonsMap[r] = (exclusionReasonsMap[r] || 0) + 1;
    });

    const reasonKeys = Object.keys(exclusionReasonsMap);
    const reasonColors = ['#ef4444', '#f97316', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];

    const exclusionData = reasonKeys.map((reason, idx) => ({
      label: reason,
      value: exclusionReasonsMap[reason],
      color: reasonColors[idx % reasonColors.length]
    }));

    const totalExclusions = excludedArticles.length || 1;

    const content = $('tab-content');
    content.innerHTML = `
      <div class="stats-tab">
        
        <!-- Top Metric Cards -->
        <div class="stats-grid">
          <div class="stat-card total"><div class="stat-num">${s.total}</div><div class="stat-name">Total Importados</div></div>
          <div class="stat-card include"><div class="stat-num">${s.included} <small>(${pctIncluded}%)</small></div><div class="stat-name">Incluídos</div></div>
          <div class="stat-card exclude"><div class="stat-num">${s.excluded} <small>(${pctExcluded}%)</small></div><div class="stat-name">Excluídos</div></div>
          <div class="stat-card maybe"><div class="stat-num">${s.maybe} <small>(${pctMaybe}%)</small></div><div class="stat-name">Talvez</div></div>
          <div class="stat-card pending"><div class="stat-num">${s.pending} <small>(${pctPending}%)</small></div><div class="stat-name">Pendentes</div></div>
          <div class="stat-card dup"><div class="stat-num">${s.duplicates} <small>(${pctDup}%)</small></div><div class="stat-name">Duplicatas</div></div>
        </div>

        <!-- Section 1: Pie Charts -->
        <div class="stats-charts-row">
          
          <!-- Chart 1: Triagem Geral -->
          <div class="chart-card pie-chart-card">
            <div class="chart-header">
              <h3>🍕 Distribuição do Fluxo (%)</h3>
              <span class="chart-subtitle">Passe o mouse nas fatias para ver detalhes</span>
            </div>
            <div class="pie-chart-body">
              <canvas id="decisions-pie-chart" width="220" height="220"></canvas>
              <div class="chart-legend-detailed">
                <div class="legend-row include">
                  <span class="legend-color-dot" style="background:#22c55e"></span>
                  <span class="legend-label">Incluídos:</span>
                  <strong class="legend-val">${s.included}</strong>
                  <span class="legend-pct">(${pctIncluded}%)</span>
                </div>
                <div class="legend-row exclude">
                  <span class="legend-color-dot" style="background:#ef4444"></span>
                  <span class="legend-label">Excluídos:</span>
                  <strong class="legend-val">${s.excluded}</strong>
                  <span class="legend-pct">(${pctExcluded}%)</span>
                </div>
                <div class="legend-row maybe">
                  <span class="legend-color-dot" style="background:#f59e0b"></span>
                  <span class="legend-label">Talvez:</span>
                  <strong class="legend-val">${s.maybe}</strong>
                  <span class="legend-pct">(${pctMaybe}%)</span>
                </div>
                <div class="legend-row dup">
                  <span class="legend-color-dot" style="background:#818cf8"></span>
                  <span class="legend-label">Duplicatas:</span>
                  <strong class="legend-val">${s.duplicates}</strong>
                  <span class="legend-pct">(${pctDup}%)</span>
                </div>
                <div class="legend-row pending">
                  <span class="legend-color-dot" style="background:#334155"></span>
                  <span class="legend-label">Pendentes:</span>
                  <strong class="legend-val">${s.pending}</strong>
                  <span class="legend-pct">(${pctPending}%)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Chart 2: Motivos de Exclusão -->
          <div class="chart-card pie-chart-card">
            <div class="chart-header">
              <h3>🚫 Razões de Exclusão (%)</h3>
              <span class="chart-subtitle">Detalhamento dos artigos rejeitados</span>
            </div>
            <div class="pie-chart-body">
              <canvas id="reasons-pie-chart" width="220" height="220"></canvas>
              <div class="chart-legend-detailed">
                ${exclusionData.length > 0 ? exclusionData.map(d => {
                  const rPct = ((d.value / totalExclusions) * 100).toFixed(1);
                  return `
                    <div class="legend-row">
                      <span class="legend-color-dot" style="background:${d.color}"></span>
                      <span class="legend-label" title="${d.label}">${d.label}:</span>
                      <strong class="legend-val">${d.value}</strong>
                      <span class="legend-pct">(${rPct}%)</span>
                    </div>`;
                }).join('') : '<p class="muted" style="font-size:0.8rem;padding:12px 0;">Nenhum artigo foi excluído ainda com justificativa.</p>'}
              </div>
            </div>
          </div>

        </div>

        <!-- Section 2: Reconciliação PRISMA -->
        <div class="prisma-table-card">
          <div class="prisma-table-header">
            <div>
              <h3>📋 Reconciliação Numérica e Percentual (Padrão PRISMA)</h3>
              <p class="muted">Tabela formatada com percentis para inclusão direta no artigo científico.</p>
            </div>
            <button class="btn btn-secondary btn-sm" id="copy-prisma-text-btn">📋 Copiar Resumo para Artigo</button>
          </div>

          <div class="table-responsive">
            <table class="prisma-summary-table">
              <thead>
                <tr>
                  <th>Etapa do Fluxo PRISMA</th>
                  <th>Contagem (N)</th>
                  <th>Percentual (%)</th>
                  <th>Status na Revisão</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>1. Registros Identificados</strong> (Importação total)</td>
                  <td><strong>${s.total}</strong></td>
                  <td><strong>100.0%</strong></td>
                  <td><span class="badge badge-info">Base Inicial</span></td>
                </tr>
                <tr>
                  <td><strong>2. Registros Removidos como Duplicatas</strong></td>
                  <td>${s.duplicates}</td>
                  <td>${pctDup}%</td>
                  <td><span class="badge badge-purple">Removidos antes da triagem</span></td>
                </tr>
                <tr>
                  <td><strong>3. Artigos Triados</strong> (Título/Resumo)</td>
                  <td>${s.total - s.pending}</td>
                  <td>${pctEvaluated}%</td>
                  <td><span class="badge badge-warning">Avaliados</span></td>
                </tr>
                <tr>
                  <td><strong>4. Artigos Excluídos</strong> (Critérios de Inelegibilidade)</td>
                  <td>${s.excluded}</td>
                  <td>${pctExcluded}%</td>
                  <td><span class="badge badge-danger">Excluídos</span></td>
                </tr>
                ${reasonKeys.map(r => {
                  const cnt = exclusionReasonsMap[r];
                  const p = ((cnt / totalRaw) * 100).toFixed(1);
                  return `
                    <tr class="sub-row">
                      <td style="padding-left: 28px;">↳ Motivo: <em>${r}</em></td>
                      <td>${cnt}</td>
                      <td>${p}%</td>
                      <td><span class="sub-badge">Justificativa</span></td>
                    </tr>`;
                }).join('')}
                <tr>
                  <td><strong>5. Artigos Mantidos como "Talvez"</strong> (Para reavaliação)</td>
                  <td>${s.maybe}</td>
                  <td>${pctMaybe}%</td>
                  <td><span class="badge badge-warning">Em Análise</span></td>
                </tr>
                <tr class="highlight-row">
                  <td><strong>6. Estudos Incluídos Finais</strong> (Seleção conclusiva)</td>
                  <td><strong>${s.included}</strong></td>
                  <td><strong>${pctIncluded}%</strong></td>
                  <td><span class="badge badge-success">Incluídos no Estudo</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 3: Year Distribution -->
        <div class="year-distribution">
          <h3>📅 Distribuição Temporal dos Estudos Incluídos</h3>
          <div class="year-bars" id="year-bars"></div>
        </div>

      </div>
    `;

    // Render Pie Chart 1: Decisions
    const canvasDecisions = $('decisions-pie-chart');
    if (canvasDecisions) {
      UI.renderDonut(canvasDecisions, [
        { value: s.included, color: '#22c55e', label: 'Incluídos' },
        { value: s.excluded, color: '#ef4444', label: 'Excluídos' },
        { value: s.maybe, color: '#f59e0b', label: 'Talvez' },
        { value: s.duplicates, color: '#818cf8', label: 'Duplicatas' },
        { value: s.pending, color: '#334155', label: 'Pendentes' },
      ], { isPie: false, centerLabel: 'Total Artigos' });
    }

    // Render Pie Chart 2: Reasons
    const canvasReasons = $('reasons-pie-chart');
    if (canvasReasons) {
      if (exclusionData.length > 0) {
        UI.renderDonut(canvasReasons, exclusionData, { isPie: true, centerLabel: 'Exclusões' });
      } else {
        UI.renderDonut(canvasReasons, [{ value: 0, color: '#334155', label: 'Sem dados' }], { isPie: true });
      }
    }

    // Copy PRISMA summary text to clipboard
    const copyBtn = $('copy-prisma-text-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        let text = `RESUMO DO FLUXO PRISMA (${project.name})\n`;
        text += `--------------------------------------------------\n`;
        text += `• Total de registros identificados: ${s.total} (100.0%)\n`;
        text += `• Duplicatas removidas: ${s.duplicates} (${pctDup}%)\n`;
        text += `• Artigos triados (avaliados): ${s.total - s.pending} (${pctEvaluated}%)\n`;
        text += `• Artigos excluídos: ${s.excluded} (${pctExcluded}%)\n`;
        reasonKeys.forEach(r => {
          const cnt = exclusionReasonsMap[r];
          const p = ((cnt / totalRaw) * 100).toFixed(1);
          text += `   - Excluídos por "${r}": ${cnt} (${p}%)\n`;
        });
        text += `• Artigos mantidos em dúvida (Talvez): ${s.maybe} (${pctMaybe}%)\n`;
        text += `• Estudos incluídos finais: ${s.included} (${pctIncluded}%)\n`;

        navigator.clipboard.writeText(text).then(() => {
          UI.toast('Resumo PRISMA copiado para a área de transferência!', 'success');
        }).catch(() => {
          UI.toast('Erro ao copiar texto', 'error');
        });
      };
    }

    // Year distribution chart
    const included = project.articles.filter(a => a.decision === 'include' && a.year);
    const yearMap = {};
    included.forEach(a => { yearMap[a.year] = (yearMap[a.year] || 0) + 1; });
    const years = Object.keys(yearMap).sort();
    const maxY = Math.max(...Object.values(yearMap), 1);
    const barsEl = $('year-bars');
    if (barsEl && years.length) {
      barsEl.innerHTML = years.map(y => `
        <div class="year-bar-col">
          <div class="year-bar-fill" style="height:${Math.round((yearMap[y]/maxY)*100)}px" title="${yearMap[y]} artigos em ${y}">
            <span class="year-bar-count">${yearMap[y]}</span>
          </div>
          <span class="year-label">${y}</span>
        </div>`).join('');
    } else if (barsEl) {
      barsEl.innerHTML = '<p class="muted" style="padding:12px 0;">Nenhum artigo incluído com ano registrado ainda.</p>';
    }
  }

  // ─── EXPORT TAB ───────────────────────────────────────
  function renderExportTab(project) {
    const s = project.stats;
    const content = $('tab-content');
    content.innerHTML = `
      <div class="export-tab">
        <h3>Exportar artigos</h3>
        <div class="export-options">
          <div class="export-card" id="export-included">
            <div class="export-icon">✅</div>
            <h4>Artigos Incluídos</h4>
            <p>${s.included} artigos marcados como "Incluir"</p>
            <div class="export-format-group">
              <button class="export-format-btn" data-type="include" data-fmt="csv">.CSV</button>
              <button class="export-format-btn" data-type="include" data-fmt="ris">.RIS</button>
              <button class="export-format-btn" data-type="include" data-fmt="bib">.BIB</button>
            </div>
          </div>
          <div class="export-card" id="export-maybe">
            <div class="export-icon">❓</div>
            <h4>Artigos "Talvez"</h4>
            <p>${s.maybe} artigos para revisão</p>
            <div class="export-format-group">
              <button class="export-format-btn" data-type="maybe" data-fmt="csv">.CSV</button>
              <button class="export-format-btn" data-type="maybe" data-fmt="ris">.RIS</button>
              <button class="export-format-btn" data-type="maybe" data-fmt="bib">.BIB</button>
            </div>
          </div>
          <div class="export-card" id="export-all">
            <div class="export-icon">📄</div>
            <h4>Todos os Artigos</h4>
            <p>${s.total} artigos com todas as decisões</p>
            <div class="export-format-group">
              <button class="export-format-btn" data-type="all" data-fmt="csv">.CSV</button>
              <button class="export-format-btn" data-type="all" data-fmt="ris">.RIS</button>
              <button class="export-format-btn" data-type="all" data-fmt="bib">.BIB</button>
            </div>
          </div>
          <div class="export-card" id="export-report">
            <div class="export-icon">📊</div>
            <h4>Relatório Completo</h4>
            <p>Estatísticas e resumo do projeto</p>
            <button class="btn btn-ghost" data-type="report" data-fmt="txt">Baixar Relatório .TXT</button>
          </div>
        </div>
        <div style="margin-top:20px;padding:14px 18px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);font-size:0.8rem;color:var(--text-muted)">
          💡 <strong>Compatibilidade:</strong> .RIS e .BIB são compatíveis com Zotero, Mendeley, EndNote e outros gerenciadores de referências.
        </div>
      </div>
    `;

    content.querySelectorAll('[data-type][data-fmt]').forEach(btn => {
      btn.onclick = () => {
        const type = btn.dataset.type;
        const fmt  = btn.dataset.fmt;
        if (type === 'report') exportReport(project);
        else if (fmt === 'ris')  exportRIS(project, type);
        else if (fmt === 'bib')  exportBibTeX(project, type);
        else exportCSV(project, type);
      };
    });
  }

  function exportCSV(project, type) {
    let articles = project.articles;
    if (type === 'include') articles = articles.filter(a => a.decision === 'include');
    else if (type === 'maybe') articles = articles.filter(a => a.decision === 'maybe');
    else if (type === 'exclude') articles = articles.filter(a => a.decision === 'exclude');

    if (!articles.length) { UI.toast('Nenhum artigo para exportar', 'error'); return; }

    const headers = ['Título','Autores','Ano','Revista','DOI','Decisão','Nota','Relevância (%)','Arquivo Fonte'];
    const rows = articles.map(a => {
      const authorsList = Array.isArray(a.authors) ? a.authors : [];
      return [
        `"${(a.title||'').replace(/"/g,'""')}"`,
        `"${authorsList.join('; ').replace(/"/g,'""')}"`,
        a.year || '',
        `"${(a.journal||'').replace(/"/g,'""')}"`,
        a.doi || '',
        a.decision || 'pendente',
        `"${(a.note||'').replace(/"/g,'""')}"`,
        a.relevance_score !== null && a.relevance_score !== undefined ? a.relevance_score : '',
        a.source_file || ''
      ].join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');  // BOM for Excel
    downloadFile(csv, `litscan_${type}_${project.name.replace(/\s+/g,'_')}.csv`, 'text/csv');
    UI.toast(`${articles.length} artigos exportados!`, 'success');
  }

  function exportReport(project) {
    const s = project.stats;
    const date = new Date().toLocaleDateString('pt-BR');
    const report = `RELATÓRIO DE REVISÃO SISTEMÁTICA — Gisa
Projeto: ${project.name}
Data: ${date}
${project.description ? `Descrição: ${project.description}` : ''}
Palavras-chave: ${(project.keywords||[]).join(', ') || '—'}

═══════════════════════════════════
ESTATÍSTICAS DE TRIAGEM
═══════════════════════════════════
Total de artigos importados: ${s.total}
Incluídos:                   ${s.included} (${s.total ? Math.round(s.included/s.total*100) : 0}%)
Excluídos:                   ${s.excluded} (${s.total ? Math.round(s.excluded/s.total*100) : 0}%)
Talvez:                      ${s.maybe} (${s.total ? Math.round(s.maybe/s.total*100) : 0}%)
Pendentes:                   ${s.pending} (${s.total ? Math.round(s.pending/s.total*100) : 0}%)
Duplicatas identificadas:    ${s.duplicates}

═══════════════════════════════════
ARTIGOS INCLUÍDOS
═══════════════════════════════════
${project.articles.filter(a => a.decision === 'include').map((a, i) =>
  `${i+1}. ${a.title}\n   ${a.authors.slice(0,3).join('; ')} (${a.year}). ${a.journal || ''}${a.doi ? ` DOI: ${a.doi}` : ''}${a.note ? `\n   Nota: ${a.note}` : ''}`
).join('\n\n')}

─────────────────────────────────
Gerado por Gisa · ${date}
`;
    downloadFile(report, `relatorio_${project.name.replace(/\s+/g,'_')}.txt`, 'text/plain');
    UI.toast('Relatório exportado!', 'success');
  }

  // ─── Export: RIS ───────────────────────────────────────
  function exportRIS(project, type) {
    let articles = project.articles;
    if (type === 'include') articles = articles.filter(a => a.decision === 'include');
    else if (type === 'maybe') articles = articles.filter(a => a.decision === 'maybe');
    else if (type === 'exclude') articles = articles.filter(a => a.decision === 'exclude');
    if (!articles.length) { UI.toast('Nenhum artigo para exportar', 'error'); return; }

    const ris = articles.map(a => {
      const authorsList = Array.isArray(a.authors) ? a.authors : [];
      return [
        'TY  - JOUR',
        `TI  - ${a.title || ''}`,
        ...authorsList.map(au => `AU  - ${au}`),
        a.year ? `PY  - ${a.year}` : '',
        a.journal ? `JO  - ${a.journal}` : '',
        a.doi ? `DO  - ${a.doi}` : '',
        a.abstract ? `AB  - ${a.abstract.replace(/\n/g, ' ')}` : '',
        ...(a.keywords || []).map(kw => `KW  - ${kw}`),
        a.decision ? `N1  - Gisa: ${a.decision}` : '',
        a.note ? `N2  - ${a.note}` : '',
        'ER  - ',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    downloadFile(ris, `gisa_${type}_${project.name.replace(/\s+/g,'_')}.ris`, 'application/x-research-info-systems');
    UI.toast(`${articles.length} artigos exportados em RIS!`, 'success');
  }

  // ─── Export: BibTeX ────────────────────────────────────
  function exportBibTeX(project, type) {
    let articles = project.articles;
    if (type === 'include') articles = articles.filter(a => a.decision === 'include');
    else if (type === 'maybe') articles = articles.filter(a => a.decision === 'maybe');
    else if (type === 'exclude') articles = articles.filter(a => a.decision === 'exclude');
    if (!articles.length) { UI.toast('Nenhum artigo para exportar', 'error'); return; }

    const bib = articles.map((a, i) => {
      const key = `gisa${i + 1}`;
      const authorsList = Array.isArray(a.authors) ? a.authors : [];
      const fields = [
        `  title = {${(a.title || '').replace(/[{}]/g, '')}}`,
        authorsList.length ? `  author = {${authorsList.join(' and ')}}` : '',
        a.year ? `  year = {${a.year}}` : '',
        a.journal ? `  journal = {${a.journal}}` : '',
        a.doi ? `  doi = {${a.doi}}` : '',
        a.abstract ? `  abstract = {${a.abstract.replace(/[{}]/g, '').replace(/\n/g, ' ').substring(0, 500)}}` : '',
        a.note ? `  note = {Gisa: ${a.note.replace(/[{}]/g, '')}}` : '',
      ].filter(Boolean);
      return `@article{${key},\n${fields.join(',\n')}\n}`;
    }).join('\n\n');

    downloadFile(bib, `gisa_${type}_${project.name.replace(/\s+/g,'_')}.bib`, 'text/plain');
    UI.toast(`${articles.length} artigos exportados em BibTeX!`, 'success');
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoke to allow browser time to initiate the download
    setTimeout(() => URL.revokeObjectURL(url), 150);
  }

  // ─── Shared helpers ───────────────────────────────────
  function makeDecision(projectId, articleId, decision) {
    if (!articleId) return;
    const article = Storage.getProject(projectId)?.articles.find(a => a.id === articleId);
    if (!article) return;

    const newDecision = article.decision === decision ? null : decision;

    const applyUpdate = (reason = null) => {
      Storage.updateArticle(projectId, articleId, {
        decision: newDecision,
        exclusion_reason: newDecision === 'exclude' ? reason : null
      });

      const p = Storage.getProject(projectId);
      const updatedArticle = p?.articles.find(a => a.id === articleId);

      // Toast feedback
      if (newDecision === 'include') UI.toast('✓ Artigo marcado como INCLUÍDO', 'success');
      else if (newDecision === 'exclude') UI.toast('✗ Artigo marcado como EXCLUÍDO', 'info');
      else if (newDecision === 'maybe') UI.toast('? Artigo marcado como TALVEZ', 'warning');
      else UI.toast('Artigo retornado para PENDENTE', 'info');

      // Update 3-Panel Workbench if active
      if (state.tab === 'screen' && state.screenMode === 'list') {
        renderRayyanArticlesListOnly(p);

        // Update Facets Sidebar with correct CSS class selector
        const facetsSlot = $('rayyan-facets-slot') || document.querySelector('.rayyan-facet-sidebar') || document.querySelector('.facets-sidebar');
        if (facetsSlot && p) {
          facetsSlot.replaceWith(UI.renderFacetSidebar(p, state.filter, (type, val) => {
            if (type === 'decision') state.filter.decision = val;
            else if (type === 'inc_kw' || type === 'exc_kw') state.filter.kw = state.filter.kw === val ? null : val;
            else if (type === 'reason') state.filter.reason = state.filter.reason === val ? null : val;
            else if (type === 'year') state.filter.year = state.filter.year === val ? null : val;
            else if (type === 'reset') state.filter = { decision: 'all', search: '', kw: null, reason: null, year: null };
            state.articleOffset = 0;
            renderScreenTab(Storage.getProject(state.projectId));
          }));
        }

        // Update Inspector Panel
        updateInspectorPanel(updatedArticle || article, p);
      } else if (state.tab === 'screen' && state.screenMode === 'serial') {
        renderSerialMode(p);
      } else {
        render();
      }
    };

    if (newDecision === 'exclude') {
      UI.showExclusionReasonModal((reason) => {
        applyUpdate(reason);
      });
    } else {
      applyUpdate(null);
    }
  }

  function showNoteModal(projectId, article) {
    UI.modal(
      'Adicionar nota',
      `<div class="form-group">
        <label>Nota para: <em>${article.title.substring(0, 60)}…</em></label>
        <textarea id="note-input" class="input" rows="4" placeholder="Motivo da decisão, observações…">${article.note || ''}</textarea>
      </div>`,
      [
        { label: 'Cancelar', style: 'btn-ghost' },
        { label: 'Salvar nota', style: 'btn-primary', cb: () => {
          const note = document.getElementById('note-input')?.value?.trim() || '';
          Storage.updateArticle(projectId, article.id, { note });
          UI.toast('Nota salva!', 'success');
          const noteEl = document.querySelector(`#art-${article.id} .article-note`);
          if (noteEl) noteEl.textContent = note ? `📝 ${note}` : '';
        }}
      ]
    );
    setTimeout(() => document.getElementById('note-input')?.focus(), 100);
  }

  // ─── Blind Mode UI Toggle ─────────────────────────────
  function updateBlindModeUI() {
    const btn = $('blind-mode-btn');
    const txt = $('blind-status-text');
    if (!btn || !txt) return;

    if (state.blindMode) {
      btn.classList.add('blind-active');
      txt.textContent = 'ON';
    } else {
      btn.classList.remove('blind-active');
      txt.textContent = 'OFF';
    }
  }

  // ─── Init ─────────────────────────────────────────────
  async function init() {
    let isLoggedIn = false;
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
      try {
        const user = await SupabaseSync.getUser();
        if (user) isLoggedIn = true;
      } catch {}

      // Listen to OAuth callbacks, token refresh, and login changes
      SupabaseSync.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          const profile = Storage.getProfile();
          const fullName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || profile.name || 'Pesquisador(a)';
          const email = session.user.email || profile.email;
          const avatar = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || profile.avatar;
          Storage.saveProfile({ ...profile, name: fullName, email, avatar });
          
          if (state.view === 'auth') {
            state.view = 'home';
            render();
            UI.toast('Login com Google realizado com sucesso!', 'success');
          }
          UI.updateUserProfileNavbarUI();
          UI.updateCloudStatusUI();
        }
      });
    }

    if (!isLoggedIn) {
      state.view = 'auth';
    } else {
      state.view = 'home';
    }

    render();

    // Listen for PWA Install Prompt on Desktop / Mobile
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.__gisaDeferredInstallPrompt = e;
      const installBtn = $('install-app-btn');
      if (installBtn) {
        installBtn.classList.add('can-install');
      }
    });

    // Listen for IndexedDB asynchronous hydration
    Storage.onHydrated(() => {
      if (state.view !== 'auth') {
        render();
      }
      UI.updateCloudStatusUI();
      UI.updateUserProfileNavbarUI();
    });

    // Install / Download APK & Desktop App button
    $('install-app-btn')?.addEventListener('click', () => {
      UI.showInstallDownloadModal();
    });

    // User Profile navbar button
    $('user-profile-btn')?.addEventListener('click', () => {
      UI.showProfileModal(() => {
        UI.updateUserProfileNavbarUI();
      });
    });
    UI.updateUserProfileNavbarUI();

    // Supabase Cloud Sync / Auth button
    const cloudBtn = $('cloud-sync-btn');
    if (cloudBtn) {
      cloudBtn.onclick = () => {
        UI.showSupabaseModal(() => {
          render();
        });
      };
      UI.updateCloudStatusUI();

      if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.onSyncStatusChange(() => {
          UI.updateCloudStatusUI();
          UI.updateUserProfileNavbarUI();
        });

        // Trigger background sync if user is logged in
        SupabaseSync.getUser().then(user => {
          if (user) {
            console.log('Usuário autenticado encontrado:', user.email, 'Iniciando sincronização...');
            SupabaseSync.syncAll().then(res => {
              if (res.success) {
                render();
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    // Blind mode toggle header button
    const blindBtn = $('blind-mode-btn');
    if (blindBtn) {
      blindBtn.onclick = () => {
        state.blindMode = !state.blindMode;
        updateBlindModeUI();
        UI.toast(`Modo Cego: ${state.blindMode ? 'ATIVADO' : 'DESATIVADO'}`, state.blindMode ? 'info' : 'success');
        render();
      };
    }

    // Hotkeys help header button
    $('hotkeys-btn')?.addEventListener('click', () => UI.showHotkeysModal());

    // ─── Global keyboard shortcuts (Gisa Hotkeys Engine) ───
    document.addEventListener('keydown', e => {
      // Skip when typing in any input, textarea or active element
      const active = document.activeElement;
      if (active && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable)) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

      // Escape: close modals / label pickers
      if (e.key === 'Escape') {
        document.querySelector('.modal-overlay')?.remove();
        document.querySelector('.label-picker-dropdown')?.remove();
        return;
      }

      // Help hotkey (?)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        UI.showHotkeysModal();
        return;
      }

      // Only apply article shortcuts in project context
      if (state.view !== 'project' || !state.projectId) return;

      const project = Storage.getProject(state.projectId);
      if (!project || !project.articles.length) return;

      // Gisa 3-Panel Workbench Hotkeys
      if (state.tab === 'screen' && state.screenMode === 'list') {
        const filteredArticles = project.articles.filter(a => {
          if (state.filter.decision === 'include' && a.decision !== 'include') return false;
          if (state.filter.decision === 'exclude' && a.decision !== 'exclude') return false;
          if (state.filter.decision === 'maybe' && a.decision !== 'maybe') return false;
          if (state.filter.decision === 'pending' && a.decision !== null) return false;
          if (state.filter.search) {
            const q = state.filter.search.toLowerCase();
            const txt = (a.title + ' ' + (a.authors?.join(' ') || '') + ' ' + a.abstract).toLowerCase();
            if (!txt.includes(q)) return false;
          }
          return true;
        });

        if (!filteredArticles.length) return;

        let currentIndex = filteredArticles.findIndex(a => a.id === state.activeArticleId);
        if (currentIndex === -1) currentIndex = 0;

        const key = e.key.toLowerCase();

        // 1. Navigation: Next Article (J / ArrowDown)
        if (key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIndex = Math.min(currentIndex + 1, filteredArticles.length - 1);
          state.activeArticleId = filteredArticles[nextIndex].id;
          // Adjust pagination offset if the next article is on a different page
          const pageSize = state.articlePageSize || 20;
          const newPage = Math.floor(nextIndex / pageSize);
          state.articleOffset = newPage * pageSize;
          renderScreenTab(project);
          return;
        }

        // 2. Navigation: Previous Article (K / ArrowUp)
        if (key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          state.activeArticleId = filteredArticles[prevIndex].id;
          // Adjust pagination offset if the previous article is on a different page
          const pageSize = state.articlePageSize || 20;
          const newPage = Math.floor(prevIndex / pageSize);
          state.articleOffset = newPage * pageSize;
          renderScreenTab(project);
          return;
        }

        // 3. Decisions on active article:
        const currentArticleId = state.activeArticleId || filteredArticles[0]?.id;
        if (!currentArticleId) return;

        if (key === 'i' || e.key === '1') {
          e.preventDefault();
          makeDecision(project.id, currentArticleId, 'include');
        } else if (key === 'e' || e.key === '2') {
          e.preventDefault();
          makeDecision(project.id, currentArticleId, 'exclude');
        } else if (key === 'm' || e.key === '3') {
          e.preventDefault();
          makeDecision(project.id, currentArticleId, 'maybe');
        } else if (key === 'u' || e.key === '0') {
          e.preventDefault();
          Storage.updateArticle(project.id, currentArticleId, { decision: null, exclusion_reason: null });
          UI.toast('Decisão resetada para Pendente', 'info');
          renderScreenTab(Storage.getProject(project.id));
        }
      }

      // Serial mode shortcuts
      if (state.tab === 'screen' && state.screenMode === 'serial') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          $('serial-next')?.click();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          $('serial-prev')?.click();
        } else if (e.key.toLowerCase() === 'i') {
          e.preventDefault();
          $('serial-include')?.click();
        } else if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          $('serial-exclude')?.click();
        } else if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          $('serial-maybe')?.click();
        }
      }
    });
  }

  return { init, navigate };
})();

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
