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
    isDeduplicating: false,
    dedupScanId: 0,
    dedupProgress: { pct: 0, phase: 'idle' },
    articleOffset: 0,
    articlePageSize: 20,
    serialIndex: 0,
    activeArticleId: null,
    prismaSubTab: 'template',
    prismaEditMode: true,
    wizard: { step: 1, name: '', desc: '', keywords: [], files: [] }
  };

  // ─── DOM refs & Utilities ──────────────────────────────
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  if (typeof window !== 'undefined') window.escapeHtml = escapeHtml;

  // ─── Navigation ───────────────────────────────────────
  async function navigate(view, opts = {}, pushHistory = true) {
    state.view = view;
    if (opts.projectId) state.projectId = opts.projectId;
    if (opts.tab) state.tab = opts.tab;
    if (view === 'wizard') {
      if (!state.wizard || opts.resetWizard) {
        state.wizard = { step: opts.wizardStep || 1, name: '', desc: '', keywords: [], files: [] };
      } else if (opts.wizardStep) {
        state.wizard.step = opts.wizardStep;
      }
    }
    state.filter = { decision: 'all', search: '', relevance: 'all', label: null };
    state.dedupScanId = (state.dedupScanId || 0) + 1; // Gracefully cancel any running dedup scan
    state.isDeduplicating = false;
    state.dupPairs = [];
    state.dupResolved = new Set();
    state.articleOffset = 0;
    state.serialIndex = 0;
    state.screenMode = 'list';

    if (pushHistory && typeof history !== 'undefined') {
      const step = (view === 'wizard' && state.wizard) ? state.wizard.step : 1;
      const stateObj = { view, projectId: state.projectId, tab: state.tab, wizardStep: step };
      let hash = '';
      if (view === 'wizard') {
        hash = `#novo-projeto-etapa-${step}`;
      } else if (view === 'project' && state.projectId) {
        hash = `#projeto-${state.projectId}-${state.tab || 'screen'}`;
      } else if (view === 'home') {
        hash = '#home';
      }
      history.pushState(stateObj, '', hash || window.location.pathname);
    }

    if (view === 'project' && state.projectId) {
      const proj = Storage.getProject(state.projectId);
      if (proj && !proj._articlesLoaded && Storage.loadProjectArticles) {
        await Storage.loadProjectArticles(state.projectId);
      }
    }

    render();
    if (pushHistory) {
      window.scrollTo(0, 0);
    }
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
                      <input id="auth-input-name" type="text" placeholder="Ex: Dra. Giselle Corrêa" autocomplete="name" required />
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

              <!-- LOCAL / GUEST PROFILE BUTTON -->
              <div style="margin-top:12px;text-align:center;">
                <button type="button" class="btn btn-ghost btn-sm" id="btn-guest-login" style="color:var(--text-secondary);border:1px solid var(--border);border-radius:var(--radius-md);width:100%;padding:9px;font-size:0.84rem;">
                  ⚡ Continuar com Perfil Local (Modo Offline / Sem Senha)
                </button>
              </div>

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

  const DEFAULT_GOOGLE_CLIENT_ID = '972694917146-u96c5krng4onh7kol52lav60m90lam98.apps.googleusercontent.com';

      // Google OAuth Button
      const googleBtn = $('btn-google-login');
      if (googleBtn) {
        googleBtn.onclick = () => {
          const settings = Storage.getSettings();
          let clientId = (settings.google_client_id || '').trim();
          if (!clientId || clientId.includes('74325871114')) {
            clientId = DEFAULT_GOOGLE_CLIENT_ID;
          }
          triggerGoogleOAuth2(clientId);
        };
      }

      // Guest / Local Profile Button
      const guestBtn = $('btn-guest-login');
      if (guestBtn) {
        guestBtn.onclick = () => {
          const profile = Storage.getProfile();
          if (!profile.name || profile.name === 'Pesquisador(a)') {
            profile.name = 'Pesquisador(a) Gisa';
          }
          if (!profile.email) {
            profile.email = 'pesquisador@local.gisa';
          }
          Storage.saveProfile(profile);
          UI.toast('Perfil local ativado com sucesso!', 'success');
          UI.updateUserProfileNavbarUI();
          state.view = 'home';
          render();
        };
      }
    }

    main.innerHTML = getHtml();
    attachEvents();
  }

  // ─────────────────────────────────────────────────────
  // OFFICIAL GOOGLE OAUTH 2.0 DIRECT API INTEGRATION
  // ─────────────────────────────────────────────────────
  function triggerGoogleOAuth2(clientId) {
    let cid = (clientId || '').trim();
    if (!cid || cid.includes('74325871114')) {
      cid = DEFAULT_GOOGLE_CLIENT_ID;
    }

    const startGSI = () => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        try {
          const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: cid,
            scope: 'email profile openid',
            prompt: 'select_account',
            callback: async (tokenResponse) => {
              if (tokenResponse && tokenResponse.access_token) {
                await handleGoogleAccessToken(tokenResponse.access_token);
              } else if (tokenResponse && tokenResponse.error) {
                UI.toast('Erro no Google OAuth: ' + tokenResponse.error, 'error');
              }
            }
          });
          tokenClient.requestAccessToken({ prompt: 'select_account' });
          return true;
        } catch (e) {
          console.warn('GSI TokenClient falhou, usando redirecionamento:', e);
        }
      }
      return false;
    };

    if (startGSI()) return;

    // If GSI library is still loading asynchronously, wait up to 2 seconds before fallback
    UI.toast('Conectando ao Google...', 'info');
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (startGSI()) {
        clearInterval(interval);
      } else if (attempts >= 10) {
        clearInterval(interval);
        // Fallback: Direct Google OAuth 2.0 Redirect Fallback
        const redirectUri = window.location.origin + window.location.pathname;
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(cid)}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=token&` +
          `scope=email%20profile%20openid&` +
          `prompt=select_account`;
        window.location.href = authUrl;
      }
    }, 200);
  }

  async function handleGoogleJwtCredential(jwt) {
    try {
      const base64Url = jwt.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(jsonPayload);
      
      const profile = Storage.getProfile();
      Storage.saveProfile({
        ...profile,
        name: payload.name || payload.given_name || 'Pesquisador(a)',
        email: payload.email,
        avatar: payload.picture || 'https://lh3.googleusercontent.com/a/default-user=s96-c'
      });

      // Navigate immediately so the user never faces a frozen screen
      state.view = 'home';
      render();
      UI.toast(`Bem-vindo(a), ${payload.name}! Conectado via Google.`, 'success');
      UI.updateUserProfileNavbarUI();
      UI.updateCloudStatusUI();

      // Cloud sync in background
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
        (async () => {
          try {
            const sb = SupabaseSync.getClient();
            if (sb && sb.auth && sb.auth.signInWithIdToken) {
              await sb.auth.signInWithIdToken({
                provider: 'google',
                token: jwt
              });
            }
            const res = await SupabaseSync.syncAll();
            if (res && res.success) render();
          } catch (e) {
            console.warn('Sync em segundo plano:', e);
          }
        })();
      }
    } catch (err) {
      console.error('Erro ao decodificar credencial do Google:', err);
      UI.toast('Erro ao autenticar com o Google.', 'error');
    }
  }

  async function handleGoogleAccessToken(accessToken) {
    try {
      UI.toast('Autenticando conta Google...', 'info');
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Não foi possível obter os dados do perfil Google.');
      const user = await res.json();
      
      const profile = Storage.getProfile();
      Storage.saveProfile({
        ...profile,
        name: user.name || user.given_name || 'Pesquisador(a)',
        email: user.email,
        avatar: user.picture || 'https://lh3.googleusercontent.com/a/default-user=s96-c'
      });

      // Navigate immediately so the user never faces a frozen screen
      state.view = 'home';
      render();
      UI.toast(`Bem-vindo(a), ${user.name}! Login com Google realizado.`, 'success');
      UI.updateUserProfileNavbarUI();
      UI.updateCloudStatusUI();

      // Cloud sync in background
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
        SupabaseSync.syncAll().then(res => {
          if (res && res.success) render();
        }).catch(err => console.warn('Sync em segundo plano:', err));
      }
    } catch (err) {
      UI.toast('Erro ao autenticar com o Google: ' + err.message, 'error');
    }
  }

  function renderGoogleConfigModal() {
    const existing = $('google-config-modal');
    if (existing) existing.remove();

    const settings = Storage.getSettings();
    const currentClientId = settings.google_client_id || '';
    const redirectUri = window.location.origin + window.location.pathname;
    const jsOrigin = window.location.origin;

    const html = `
      <div class="google-modal-overlay" id="google-config-modal">
        <div class="google-dialog-card" style="max-width:540px;">
          
          <div class="google-dialog-header" style="text-align:left;display:flex;align-items:center;gap:14px;margin-bottom:18px;">
            <div class="google-dialog-logo" style="margin:0;width:40px;height:40px;">
              <svg viewBox="0 0 24 24" style="width:36px;height:36px;">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </div>
            <div>
              <h2 class="google-dialog-title" style="font-size:1.25rem;margin:0;">Conectar API do Google OAuth 2.0</h2>
              <p class="google-dialog-subtitle" style="font-size:0.85rem;">Insira o seu Google Client ID para abrir a janela oficial do Google</p>
            </div>
          </div>

          <form id="google-client-form" style="display:flex;flex-direction:column;gap:14px;margin-bottom:18px;" onsubmit="return false;">
            <div>
              <label style="display:block;font-size:0.8rem;font-weight:600;color:#3c4043;margin-bottom:6px;">Google OAuth Client ID</label>
              <input id="input-google-client-id" type="text" placeholder="ex: 123456789-abcdef.apps.googleusercontent.com" value="${currentClientId}" required style="width:100%;padding:12px 14px;border:1px solid #dadce0;border-radius:8px;font-size:0.92rem;outline:none;box-sizing:border-box;font-family:monospace;" />
            </div>

            <div style="background:#f8f9fa;border:1px solid #e8eaed;border-radius:10px;padding:12px;font-size:0.78rem;color:#5f6368;line-height:1.45;">
              <strong>📋 Configuração no Google Cloud Console:</strong>
              <ol style="margin:6px 0 0 16px;padding:0;">
                <li>Acesse o <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:#1a73e8;font-weight:600;">Google Cloud Console (Credenciais)</a></li>
                <li>Crie um <strong>ID do cliente OAuth</strong> do tipo <em>Aplicativo da Web</em></li>
                <li>Em <strong>Origens JavaScript autorizadas</strong>, adicione:<br><code style="background:#e8eaed;padding:2px 4px;border-radius:4px;color:#202124;">${jsOrigin}</code></li>
                <li>Em <strong>URIs de redirecionamento autorizados</strong>, adicione:<br><code style="background:#e8eaed;padding:2px 4px;border-radius:4px;color:#202124;">${redirectUri}</code></li>
              </ol>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
              <button type="button" class="google-btn-text" id="btn-cancel-google-modal">Cancelar</button>
              <button type="submit" class="google-btn-blue" id="btn-save-google-oauth">Salvar e Abrir Login Google</button>
            </div>
          </form>

          <div class="google-dialog-footer" style="padding-top:12px;">
            <span>API Google Identity Services v2</span>
            <a href="https://developers.google.com/identity/gsi/web/guides/overview" target="_blank" style="color:#5f6368;text-decoration:none;">Documentação Oficial</a>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const modal = $('google-config-modal');
    $('btn-cancel-google-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    $('google-client-form').onsubmit = (e) => {
      e.preventDefault();
      const id = $('input-google-client-id').value.trim();
      if (!id || !id.includes('.apps.googleusercontent.com')) {
        UI.toast('Informe um Google Client ID válido (terminado em .apps.googleusercontent.com)', 'error');
        return;
      }
      Storage.saveSetting('google_client_id', id);
      modal.remove();
      UI.toast('Google Client ID salvo! Abrindo login oficial do Google...', 'info');
      triggerGoogleOAuth2(id);
    };
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
          <div class="home-hero-actions">
            <button class="btn btn-primary btn-create-project-hero" id="new-project-btn">
              + Criar Novo Projeto de Revisão
            </button>
          </div>
        </div>

        <!-- 6 Pilares da Revisão Sistemática Gisa -->
        <div class="features-strip">
          <div class="feature-item"><span>🔒</span><p><strong>Auditabilidade</strong><br>Registro completo de decisões</p></div>
          <div class="feature-item"><span>👁️</span><p><strong>Modo Cego</strong><br>Triagem sem viés de seleção</p></div>
          <div class="feature-item"><span>📊</span><p><strong>Fluxo PRISMA</strong><br>Gráficos % e tabela automatizada</p></div>
          <div class="feature-item"><span>🔄</span><p><strong>Deduplicação</strong><br>Detecção por % de similaridade</p></div>
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
      navigate('wizard', { resetWizard: true, wizardStep: 1 });
    };

    $('home-download-app-btn')?.addEventListener('click', () => {
      UI.showInstallDownloadModal();
    });

    // Auto-verify all projects against IndexedDB in background idle (runs once per session)
    if (!window.__gisaCheckedRecovery && Storage.checkAndRecoverAllProjects) {
      window.__gisaCheckedRecovery = true;
      setTimeout(() => {
        Storage.checkAndRecoverAllProjects().then(recoveredCount => {
          if (recoveredCount > 0) {
            console.log(`[Gisa] Auto-recuperados ${recoveredCount} artigos nos projetos locais.`);
            if (state.view === 'home') renderHome();
          }
        }).catch(() => {});
      }, 1500);
    }
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
    main.className = 'wizard-main-wrapper';
    const step = state.wizard.step;

    const steps = [
      { n: 1, label: 'Informações' },
      { n: 2, label: 'Importar Artigos' },
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
          <div class="wz-title-wrap">
            <h2 class="wz-title">Sobre a revisão</h2>
            <p class="wz-sub">Dê um nome e descreva o objetivo desta revisão sistemática.</p>
          </div>
          
          <div class="wz-form-grid">
            <div class="form-group wz-field-title">
              <label>Título da revisão *</label>
              <input id="wz-name" class="input" placeholder="Ex: Feminicídio no Brasil 2020–2025"
                value="${state.wizard.name}" autocomplete="off"/>
            </div>
            <div class="form-group wz-field-type">
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
            <div class="form-group wz-field-desc">
              <label>Descrição (opcional)</label>
              <textarea id="wz-desc" class="input" rows="2" placeholder="Descreva o objetivo e escopo desta revisão…">${state.wizard.desc}</textarea>
            </div>
          </div>
        </div>`;
    } else if (step === 2) {
      const fileList = state.wizard.files.length
        ? state.wizard.files.map(f => `<div class="wz-file-item">📄 <span>${escapeHtml(f.name)}</span></div>`).join('')
        : '';
      bodyHtml = `
        <div class="wz-body">
          <div class="wz-title-wrap">
            <h2 class="wz-title">Importar artigos</h2>
            <p class="wz-sub">Faça upload dos arquivos de referências (.ris, .bib, .csv, .pdf, .zip ou pastas). Você também pode pular e importar depois.</p>
          </div>
          <div class="wz-drop-zone" id="wz-drop">
            <div class="upload-icon">📂</div>
            <p>Arraste arquivos, pastas ou arquivo .ZIP aqui</p>
            <input type="file" id="wz-file-input" multiple accept=".ris,.bib,.csv,.nbib,.pdf,.txt,.json,.zip,application/zip,application/x-zip-compressed" style="display:none"/>
            <input type="file" id="wz-folder-input" webkitdirectory directory multiple style="display:none"/>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px;">
              <button class="btn btn-secondary btn-sm" id="wz-select-btn">Selecionar Arquivos / .ZIP</button>
              <button class="btn btn-secondary btn-sm" id="wz-select-folder-btn" style="background:rgba(16,185,129,0.15);border-color:rgba(16,185,129,0.35);color:#fff;">📁 Selecionar Pasta</button>
            </div>
          </div>
          <div class="wz-formats">
            <span class="wz-format-label">Formatos suportados:</span>
            <span class="format-chip">.ris</span>
            <span class="format-chip">.bib</span>
            <span class="format-chip">.csv</span>
            <span class="format-chip">.pdf</span>
            <span class="format-chip">.nbib</span>
            <span class="format-chip">.txt</span>
            <span class="format-chip" style="background:rgba(59,130,246,0.2);color:#93c5fd;border-color:rgba(59,130,246,0.4)">.zip</span>
          </div>
          <div id="wz-file-list" class="wz-file-list">${fileList}</div>
        </div>`;
    }

    main.innerHTML = `
      <div class="wizard-view">
        <div class="wz-header">
          <div class="wz-header-left">
            <button class="btn-back" id="wz-cancel">← Cancelar</button>
            <h1 class="wz-main-title">Nova Revisão Sistemática</h1>
          </div>
          <div class="wz-step-indicator">${stepBreadcrumb}</div>
        </div>
        <div class="wz-card">
          ${bodyHtml}
          <div class="wz-footer">
            ${step > 1 ? '<button class="btn btn-ghost" id="wz-prev">← Voltar</button>' : ''}
            <div style="flex:1"></div>
            ${step === 2 ? '<button class="btn btn-ghost" id="wz-skip">Pular importação e criar →</button>' : ''}
            ${step === 1
              ? '<button class="btn btn-primary" id="wz-next">Avançar para Importação →</button>'
              : '<button class="btn btn-primary" id="wz-finish">✓ Criar e Abrir Revisão</button>'}
          </div>
        </div>
      </div>
    `;

    $('wz-cancel').onclick = () => {
      if (window.history.length > 1 && window.location.hash.startsWith('#novo-projeto')) {
        history.back();
      } else {
        navigate('home');
      }
    };
    const prevBtn = $('wz-prev');
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (window.history.length > 1 && window.location.hash.startsWith('#novo-projeto')) {
          history.back();
        } else {
          state.wizard.step--;
          renderWizard();
        }
      };
    }

    if (step === 1) {
      $('wz-next').onclick = () => {
        const name = $('wz-name')?.value?.trim();
        if (!name) { UI.toast('Informe o título da revisão', 'error'); return; }
        state.wizard.name = name;
        state.wizard.desc = $('wz-desc')?.value?.trim() || '';
        state.wizard.type = $('wz-type')?.value || '';
        state.wizard.step = 2;
        if (typeof history !== 'undefined') {
          history.pushState({ view: 'wizard', wizardStep: 2 }, '', '#novo-projeto-etapa-2');
        }
        renderWizard();
      };
    }

    if (step === 2) {
      const dropZone = $('wz-drop');
      const fileInput = $('wz-file-input');
      const folderInput = $('wz-folder-input');

      $('wz-select-btn').onclick = () => fileInput.click();
      if (folderInput) $('wz-select-folder-btn').onclick = () => folderInput.click();

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

      if (folderInput) {
        folderInput.onchange = e => {
          state.wizard.files = [...(state.wizard.files || []), ...Array.from(e.target.files)];
          renderWizard();
        };
      }

      const finishCreation = async (skipFiles = false) => {
        const project = Storage.createProject(state.wizard.name, state.wizard.desc, state.wizard.keywords || []);
        if (state.wizard.type) Storage.updateProject(project.id, { reviewType: state.wizard.type });

        if (!skipFiles && state.wizard.files?.length) {
          const btn = $('wz-finish');
          if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Importando artigos…';
          }
          try {
            const articles = await Parsers.parseFiles(state.wizard.files);
            Storage.addArticles(project.id, articles);
            UI.toast(`${articles.length} artigos importados com sucesso!`, 'success');
          } catch(e) {
            console.error(e);
            UI.toast('Erro ao importar alguns arquivos: ' + (e.message || ''), 'error');
          }
        }

        UI.toast(`Revisão "${project.name}" criada com sucesso!`, 'success');
        navigate('project', { projectId: project.id, tab: 'overview' });
      };

      $('wz-finish').onclick = () => finishCreation(false);
      $('wz-skip').onclick = () => finishCreation(true);
    }
  }

  // ─────────────────────────────────────────────────────
  // PROJECT VIEW
  // ─────────────────────────────────────────────────────
  function renderProject() {
    const project = Storage.getProject(state.projectId);
    if (!project) { navigate('home'); return; }

    const duplicatesTotal = project.articles ? project.articles.filter(a => a.is_duplicate).length : (project.stats?.duplicates || 0);
    const screenableTotal = project.articles ? project.articles.filter(a => !a.is_duplicate).length : Math.max(0, (project.stats?.total || 0) - duplicatesTotal);
    const includedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate).length : (project.stats?.included || 0);
    const finalSelectedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection).length : 0;
    const triadosTotal = project.articles ? project.articles.filter(a => a.decision && !a.is_duplicate).length : Math.max(0, screenableTotal - (project.stats?.pending || 0));

    const tabs = [
      { id: 'overview', icon: '🏠', label: 'Visão Geral' },
      { id: 'upload',   icon: '📁', label: 'Importar' },
      { id: 'dedup',    icon: '🔄', label: `Duplicatas${duplicatesTotal ? ` (${duplicatesTotal})` : ''}` },
      { id: 'screen',   icon: '🔍', label: `Triagem (${screenableTotal})` },
      { id: 'articles', icon: '✅', label: `Incluídos (${includedTotal})` },
      { id: 'final',    icon: '⭐', label: `Selecionados (${finalSelectedTotal})` },
      ...(project.hide_prisma_tab ? [] : [{ id: 'prisma',   icon: '📐', label: 'PRISMA 2020' }]),
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
          <div class="project-progress-mini" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${project.hide_prisma_tab ? `
              <button class="btn btn-sm btn-ghost" id="btn-restore-prisma-tab" title="Reativar e exibir a aba PRISMA 2020 nesta revisão" style="color:#a855f7;border:1px dashed rgba(168,85,247,0.45);background:rgba(168,85,247,0.08);border-radius:var(--radius-md);font-size:0.78rem;">
                📐 Reativar Aba PRISMA
              </button>
            ` : ''}
            <button class="btn btn-sm ${project.blindMode ? 'btn-primary' : 'btn-ghost'}" id="blind-mode-btn" title="Ativar/Desativar Modo Cego">
              ${project.blindMode ? '👁️ Modo Cego ON' : '👁️ Modo Cego OFF'}
            </button>
            <span class="progress-mini-text">${triadosTotal} / ${screenableTotal} triados</span>
            <button class="btn btn-sm btn-ghost" id="project-delete-btn" title="Excluir este projeto permanentemente" style="color:#ef4444;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.08);margin-left:4px;">
              🗑️ Excluir Projeto
            </button>
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
    $('project-delete-btn').onclick = () => confirmDeleteProject(project);

    const restorePrismaBtn = $('btn-restore-prisma-tab');
    if (restorePrismaBtn) {
      restorePrismaBtn.onclick = () => {
        Storage.updateProject(project.id, { hide_prisma_tab: false });
        project.hide_prisma_tab = false;
        UI.toast('Aba PRISMA 2020 reativada com sucesso!', 'success');
        navigate('project', { tab: 'prisma' });
      };
    }
    $('blind-mode-btn').onclick = () => {
      const updated = Storage.updateProject(project.id, { blindMode: !project.blindMode });
      UI.toast(updated.blindMode ? '👁️ Modo Cego Ativado' : '👁️ Modo Cego Desativado', 'info');
      renderProject();
    };
    $$('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        if (state.tab !== btn.dataset.tab) {
          if (state.tab === 'dedup' && state.isDeduplicating) {
            state.dedupScanId = (state.dedupScanId || 0) + 1;
            state.isDeduplicating = false;
          }
          state.tab = btn.dataset.tab;
          if (state.tab === 'articles') {
            state.filter.decision = 'include';
            state.filter.category = 'all';
            state.articleOffset = 0;
          } else if (state.tab === 'final') {
            state.filter.decision = 'final_selected';
            state.filter.category = 'all';
            state.articleOffset = 0;
          }
          renderProjectTab(project);
          updateTabActive();
        }
      };
    });

    renderProjectTab(project);

    // Auto-check project integrity from IndexedDB (self-healing, runs once per project session)
    if (!project._integrityChecked && Storage.restoreProjectArticlesFromIDB) {
      project._integrityChecked = true;
      Storage.restoreProjectArticlesFromIDB(project.id).then(res => {
        if (res && res.recovered) {
          console.log(`[Gisa] Auto-recuperados ${res.total} artigos para ${project.name}!`);
          UI.toast(`Restaurados ${res.total} artigos preservados no banco local!`, 'success');
          if (state.isDeduplicating) {
            state.dedupScanId = (state.dedupScanId || 0) + 1;
            state.isDeduplicating = false;
          }
          const fresh = Storage.getProject(project.id) || project;
          renderProjectTab(fresh);
          updateProjectNavHeader(fresh);
        }
      });
    }
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
      case 'dedup':    renderDedupTab(project); break;
      case 'screen':   renderScreenTab(project); break;
      case 'articles': renderArticlesTab(project, false); break;
      case 'final':    renderArticlesTab(project, true); break;
      case 'prisma':   renderPrismaTab(project); break;
      case 'stats':    renderStatsTab(project); break;
      case 'export':   renderExportTab(project); break;
    }
  }

  // ─── PRISMA 2020 OFFICIAL CSV TEMPLATE GENERATOR ──────
  function generatePrisma2020Csv(project) {
    const s = project.stats || {};
    const articles = project.articles || [];
    const excludedScreening = articles.filter(a => a.decision === 'exclude' && !a.is_duplicate);
    const reasonsMap = {};
    excludedScreening.forEach(a => {
      const r = (a.exclusion_reason || 'Outros motivos metodológicos').replace(/[,;"]/g, ' ');
      reasonsMap[r] = (reasonsMap[r] || 0) + 1;
    });
    const reasonsStr = Object.entries(reasonsMap).map(([r, c]) => `${r}, ${c}`).join('; ');

    const recordsIdentified = s.total || articles.length;
    const duplicatesRemoved = s.duplicates || articles.filter(a => a.is_duplicate).length;
    const recordsScreened = Math.max(0, recordsIdentified - duplicatesRemoved);
    const recordsExcluded = excludedScreening.length;
    const recordsIncluded = articles.filter(a => a.decision === 'include' && !a.is_duplicate).length;
    const finalSelectedCount = articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true).length;

    return `data,node,box,description,boxtext,tooltips,url,n
NA,node4,prevstud,Grey title box; Previous studies,Previous studies,Grey title box; Previous studies,prevstud.html,0
previous_studies,node5,box1,Studies included in previous version of review,Studies included in previous version of review,Studies included in previous version of review,previous_studies.html,0
previous_reports,NA,box1,Reports of studies included in previous version of review,Reports of studies included in previous version of review,NA,previous_reports.html,0
NA,node6,newstud,Yellow title box; Identification of new studies via databases and registers,Identification of new studies via databases and registers,Yellow title box; Identification of new studies via databases and registers,newstud.html,0
database_results,node7,box2,Records identified from: Databases,Databases,Records identified from: Databases and Registers,database_results.html,${recordsIdentified}
database_specific_results,NA,box2,Records identified from: specific databases,Specific Databases,NA,database_results.html,"Bases de dados, ${recordsIdentified}"
register_results,NA,box2,Records identified from: Registers,Registers,NA,NA,0
register_specific_results,NA,box2,Records identified from: specific registers,Specific Registers,NA,database_results.html,"Registros, 0"
NA,node16,othstud,Grey title box; Identification of new studies via other methods,Identification of new studies via other methods,Grey title box; Identification of new studies via other methods,othstud.html,0
website_results,node17,box11,Records identified from: Websites,Websites,"Records identified from: Websites, Organisations and Citation Searching",website_results.html,0
organisation_results,,box11,Records identified from: Organisations,Organisations,NA,NA,0
citations_results,NA,box11,Records identified from: Citation searching,Citation searching,NA,NA,0
duplicates,node8,box3,Duplicate records,Duplicate records,Duplicate records,duplicates.html,${duplicatesRemoved}
excluded_automatic,NA,box3,Records marked as ineligible by automation tools,Records marked as ineligible by automation tools,NA,NA,0
excluded_other,NA,box3,Records removed for other reasons,Records removed for other reasons,NA,NA,0
records_screened,node9,box4,Records screened (databases and registers),Records screened,Records screened (databases and registers),records_screened.html,${recordsScreened}
records_excluded,node10,box5,Records excluded (databases and registers),Records excluded,Records excluded (databases and registers),records_excluded.html,${recordsExcluded}
dbr_sought_reports,node11,box6,Reports sought for retrieval (databases and registers),Reports sought for retrieval,Reports sought for retrieval (databases and registers),dbr_sought_reports.html,${recordsIncluded}
dbr_notretrieved_reports,node12,box7,Reports not retrieved (databases and registers),Reports not retrieved,Reports not retrieved (databases and registers),dbr_notretrieved_reports.html,0
other_sought_reports,node18,box12,Reports sought for retrieval (other),Reports sought for retrieval,Reports sought for retrieval (other),other_sought_reports.html,0
other_notretrieved_reports,node19,box13,Reports not retrieved (other),Reports not retrieved,Reports not retrieved (other),other_notretrieved_reports.html,0
dbr_assessed,node13,box8,Reports assessed for eligibility (databases and registers),Reports assessed for eligibility,Reports assessed for eligibility (databases and registers),dbr_assessed.html,${recordsIncluded}
dbr_excluded,node14,box9,"Reports excluded (databases and registers): [separate reasons and numbers using ; e.g. Reason1, xxx; Reason2, xxx; Reason3, xxx]",Reports excluded,Reports excluded (databases and registers),dbrexcludedrecords.html,"${reasonsStr || 'Critérios metodológicos, 0'}"
other_assessed,node20,box14,Reports assessed for eligibility (other),Reports assessed for eligibility,Reports assessed for eligibility (other),other_assessed.html,0
other_excluded,node21,box15,"Reports excluded (other): [separate reasons and numbers using ; e.g. Reason1, xxx; Reason2, xxx; Reason3, xxx]",Reports excluded,Reports excluded (other),other_excluded.html,"Reason1, 0"
new_studies,node15,box10,New studies included in review,New studies included in review,New studies included in review,new_studies.html,${finalSelectedCount}
new_reports,NA,box10,Reports of new included studies,Reports of new included studies,NA,NA,${finalSelectedCount}

total_studies,node22,box16,Total studies included in review,Total studies included in review,Total studies included in review,total_studies.html,${finalSelectedCount}
total_reports,NA,box16,Reports of total included studies,Reports of total included studies,NA,NA,${finalSelectedCount}
identification,node1,identification,Blue identification box,Identification,Blue identification box,identification.html,0
screening,node2,screening,Blue screening box,Screening,Blue screening box,screening.html,0
included,node3,included,Blue included box,Included,Blue included box,included.html,0
total_studies_ma,node23,box17,Total studies included in meta-analysis,Total studies included in meta-analysis,Total studies included in meta-analysis,total_studies_meta_analysis.html,${finalSelectedCount}
total_reports_ma,NA,box17,Reports of total included studies in meta-analysis,Reports of total included studies in meta-analysis,NA,NA,${finalSelectedCount}
`;
  }

  function getDefaultPrismaManualData(project) {
    const s = project.stats || {};
    const articles = project.articles || [];

    // 1. Group databases from articles
    const dbMap = {};
    articles.forEach(a => {
      let source = a.database || a.source || a.db_source || a.file_name || '';
      source = source.trim();
      if (!source || source === 'undefined') {
        source = 'Bases de dados consultadas';
      }
      source = source.replace(/\.(csv|ris|bib|txt|ciw|enw)$/i, '');
      dbMap[source] = (dbMap[source] || 0) + 1;
    });

    const databases = Object.entries(dbMap).map(([name, count]) => ({ name, count }));
    if (databases.length === 0) {
      databases.push({ name: 'Bases de dados consultadas', count: s.total || articles.length });
    }

    // 2. Duplicates
    const duplicatesCount = s.duplicates || articles.filter(a => a.is_duplicate).length;
    const totalIdentified = s.total || articles.length;
    const recordsScreened = Math.max(0, totalIdentified - duplicatesCount);

    // 3. Screening exclusions
    const excludedScreening = articles.filter(a => a.decision === 'exclude' && !a.is_duplicate);
    const screeningReasonsMap = {};
    excludedScreening.forEach(a => {
      const r = (a.exclusion_reason && a.exclusion_reason.trim()) ? a.exclusion_reason.trim() : 'Critério de exclusão na triagem';
      screeningReasonsMap[r] = (screeningReasonsMap[r] || 0) + 1;
    });
    const screeningExclusionReasons = Object.entries(screeningReasonsMap).map(([reason, count]) => ({ reason, count }));
    if (screeningExclusionReasons.length === 0 && excludedScreening.length > 0) {
      screeningExclusionReasons.push({ reason: 'Artigos fora do escopo temático', count: excludedScreening.length });
    }

    // 4. Reports sought and assessed for eligibility (Phase 2)
    const includedPhase1 = articles.filter(a => a.decision === 'include' && !a.is_duplicate);
    const reportsSought = includedPhase1.length;
    const reportsNotRetrieved = 0;
    const reportsAssessed = reportsSought - reportsNotRetrieved;

    // 5. Final Selection (Phase 3)
    const finalSelected = articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true);
    const studiesIncluded = finalSelected.length > 0 ? finalSelected.length : reportsAssessed;
    const reportsExcluded = Math.max(0, reportsAssessed - studiesIncluded);

    const eligibilityExclusionReasons = [];
    if (reportsExcluded > 0) {
      eligibilityExclusionReasons.push({ reason: 'Critérios PICO não preenchidos integralmente', count: reportsExcluded });
    } else {
      eligibilityExclusionReasons.push({ reason: 'Critérios de inclusão não atendidos', count: 0 });
    }

    return {
      includeOtherSources: false,
      identification: {
        databases,
        registersCount: 0,
        duplicatesRemoved: duplicatesCount,
        automationIneligible: 0,
        otherReasonsRemoved: 0
      },
      screening: {
        recordsScreened,
        recordsExcluded: excludedScreening.length,
        screeningExclusionReasons: screeningExclusionReasons.length > 0 ? screeningExclusionReasons : [{ reason: 'Artigos fora do escopo', count: 0 }],
        reportsSought,
        reportsNotRetrieved: 0,
        reportsNotRetrievedReason: 'Texto completo indisponível',
        reportsAssessed,
        reportsExcluded,
        eligibilityExclusionReasons
      },
      included: {
        studiesIncluded,
        reportsOfIncludedStudies: studiesIncluded,
        includeMetaAnalysis: false,
        studiesIncludedMetaAnalysis: 0,
        metaAnalysisText: 'Estudos incluídos na síntese quantitativa (meta-análise)'
      }
    };
  }

  function convertPrismaSvgToCanvas(svgString, scale = 2) {
    return new Promise((resolve, reject) => {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobUrl = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 880 * scale;
          canvas.height = 980 * scale;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(blobUrl);
          resolve(canvas);
        } catch (err) {
          URL.revokeObjectURL(blobUrl);
          reject(err);
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(blobUrl);
        reject(e);
      };
      img.src = blobUrl;
    });
  }

  function downloadCanvasAsPng(canvas, project) {
    const a = document.createElement('a');
    const safeName = (project.name || 'revisao').toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.download = `PRISMA2020_${safeName}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  async function copyPrismaImage(project) {
    try {
      const manualData = project.prisma_manual_data || getDefaultPrismaManualData(project);
      const svgString = UI.renderPrismaOfficialSvg(manualData, project);
      const canvas = await convertPrismaSvgToCanvas(svgString, 2);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          UI.toast('Erro ao gerar imagem.', 'error');
          return;
        }
        if (navigator.clipboard && navigator.clipboard.write) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            UI.toast('📋 Imagem do PRISMA copiada! Cole no Google Docs com Ctrl+V.', 'success');
            return;
          } catch (clipErr) {
            console.warn('Clipboard write failed, downloading instead:', clipErr);
          }
        }
        downloadCanvasAsPng(canvas, project);
        UI.toast('Imagem PNG baixada (cópia direta não suportada pelo navegador).', 'info');
      }, 'image/png');
    } catch (err) {
      console.error('Erro ao copiar imagem PRISMA:', err);
      UI.toast('Falha ao gerar imagem do diagrama.', 'error');
    }
  }

  async function downloadPrismaPng(project) {
    try {
      const manualData = project.prisma_manual_data || getDefaultPrismaManualData(project);
      const svgString = UI.renderPrismaOfficialSvg(manualData, project);
      const canvas = await convertPrismaSvgToCanvas(svgString, 2);
      downloadCanvasAsPng(canvas, project);
      UI.toast('📷 Imagem PNG (300 DPI) baixada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao baixar PNG:', err);
      UI.toast('Falha ao baixar imagem PNG.', 'error');
    }
  }

  function downloadPrismaSvg(project) {
    const manualData = project.prisma_manual_data || getDefaultPrismaManualData(project);
    const svgString = UI.renderPrismaOfficialSvg(manualData, project);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (project.name || 'revisao').toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.download = `PRISMA2020_${safeName}.svg`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('📄 Arquivo vetorial SVG baixado com sucesso!', 'success');
  }

  function renderPrismaTab(project) {
    const content = $('tab-content');
    if (!content) return;

    if (!project.prisma_manual_data) {
      project.prisma_manual_data = getDefaultPrismaManualData(project);
      Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
    }

    const currentSubTab = state.prismaSubTab || 'template';
    const isEditMode = state.prismaEditMode !== false;

    content.innerHTML = UI.renderPRISMA(project, {
      activeSubTab: currentSubTab,
      isEditMode: isEditMode
    });

    // ── 1. Preencher com Dados do Gisa ──
    const btnFillGisa = $('btn-prisma-fill-gisa');
    if (btnFillGisa) {
      btnFillGisa.onclick = () => {
        if (confirm('Deseja recarregar o molde com as contagens atuais do Gisa?\n\nIsso atualizará os números com os artigos e motivos registrados nesta revisão.')) {
          project.prisma_manual_data = getDefaultPrismaManualData(project);
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
          UI.toast('🪄 Molde PRISMA 2020 preenchido com os dados do Gisa!', 'success');
          renderPrismaTab(project);
        }
      };
    }

    // ── 2. Alternar Modo Edição / Modo Publicação ──
    const btnModeToggle = $('btn-prisma-mode-toggle');
    if (btnModeToggle) {
      btnModeToggle.onclick = () => {
        state.prismaEditMode = !state.prismaEditMode;
        renderPrismaTab(project);
      };
    }

    // ── 3. Copiar Imagem para o Google Docs (Ctrl+V) ──
    const btnCopyImage = $('btn-prisma-copy-image');
    if (btnCopyImage) {
      btnCopyImage.onclick = () => copyPrismaImage(project);
    }

    // ── 4. Download PNG 300 DPI ──
    const btnDownloadPng = $('btn-prisma-download-png');
    if (btnDownloadPng) {
      btnDownloadPng.onclick = () => downloadPrismaPng(project);
    }

    // ── 5. Download SVG ──
    const btnDownloadSvg = $('btn-prisma-download-svg');
    if (btnDownloadSvg) {
      btnDownloadSvg.onclick = () => downloadPrismaSvg(project);
    }

    // ── 6. Imprimir / Salvar PDF ──
    const btnPrint = $('btn-prisma-print');
    if (btnPrint) {
      btnPrint.onclick = () => window.print();
    }

    // ── 7. Download CSV para ferramenta oficial ShinyApp ──
    const btnDownloadCsv = $('btn-prisma-download-csv');
    if (btnDownloadCsv) {
      btnDownloadCsv.onclick = () => {
        const csvContent = generatePrisma2020Csv(project);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (project.name || 'revisao').toLowerCase().replace(/[^a-z0-9]/g, '_');
        a.download = `PRISMA2020_${safeName}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        UI.toast('Arquivo CSV oficial PRISMA 2020 baixado com sucesso!', 'success');
      };
    }

    // ── 8. Ocultar Aba PRISMA ──
    const btnHide = $('btn-prisma-hide-tab');
    if (btnHide) {
      btnHide.onclick = () => {
        if (confirm('Deseja ocultar a aba PRISMA 2020 desta revisão?\n\nVocê poderá reativá-la a qualquer momento no topo da tela através do botão "📐 Reativar Aba PRISMA".')) {
          Storage.updateProject(project.id, { hide_prisma_tab: true });
          project.hide_prisma_tab = true;
          UI.toast('Aba PRISMA ocultada. Você pode reativá-la a qualquer momento no topo.', 'info');
          navigate('project', { tab: 'overview' });
        }
      };
    }

    // ── 9. Sub-tabs toggle (Template vs Imported vs Auto) ──
    const tabTemplate = $('btn-tab-view-template');
    const tabImported = $('btn-tab-view-imported');
    const tabAuto = $('btn-tab-view-auto');
    if (tabTemplate) {
      tabTemplate.onclick = () => {
        state.prismaSubTab = 'template';
        renderPrismaTab(project);
      };
    }
    if (tabImported) {
      tabImported.onclick = () => {
        state.prismaSubTab = 'imported';
        renderPrismaTab(project);
      };
    }
    if (tabAuto) {
      tabAuto.onclick = () => {
        state.prismaSubTab = 'auto';
        renderPrismaTab(project);
      };
    }

    // ── 10. File upload handlers (Imported View) ──
    const fileInput = $('prisma-file-upload-input');
    const triggerUploadBtn = $('btn-trigger-prisma-upload');
    const replaceFileBtn = $('btn-replace-prisma-file');

    if (triggerUploadBtn && fileInput) {
      triggerUploadBtn.onclick = () => fileInput.click();
    }
    if (replaceFileBtn && fileInput) {
      replaceFileBtn.onclick = () => fileInput.click();
    }

    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
          UI.toast('O arquivo é muito grande (máx 25MB).', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const customFile = {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            dataUrl: reader.result,
            uploadedAt: new Date().toISOString()
          };
          Storage.updateProject(project.id, { prisma_custom_file: customFile });
          project.prisma_custom_file = customFile;
          state.prismaSubTab = 'imported';
          UI.toast(`Fluxograma oficial "${file.name}" importado com sucesso!`, 'success');
          renderPrismaTab(project);
        };
        reader.readAsDataURL(file);
      };
    }

    const btnRemoveFile = $('btn-remove-prisma-file');
    if (btnRemoveFile) {
      btnRemoveFile.onclick = () => {
        if (confirm('Deseja remover o fluxograma anexado desta revisão?')) {
          Storage.updateProject(project.id, { prisma_custom_file: null });
          project.prisma_custom_file = null;
          state.prismaSubTab = 'template';
          UI.toast('Fluxograma anexado removido.', 'info');
          renderPrismaTab(project);
        }
      };
    }

    // ── 11. Inline Edit Listeners on Paper ──
    const paper = $('prisma-official-paper');
    if (paper && isEditMode) {
      let saveTimer = null;
      const debouncedSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
        }, 500);
      };

      paper.addEventListener('input', (e) => {
        const t = e.target;
        const m = project.prisma_manual_data;
        if (!m) return;

        // Databases
        if (t.dataset.prismaDbIdx !== undefined) {
          const idx = Number(t.dataset.prismaDbIdx);
          const key = t.dataset.prismaDbKey;
          if (m.identification?.databases?.[idx]) {
            m.identification.databases[idx][key] = key === 'count' ? (Number(t.value) || 0) : t.value;
          }
        }
        // Registers
        else if (t.id === 'prisma-in-registers') {
          m.identification.registersCount = Number(t.value) || 0;
        }
        // Duplicates
        else if (t.id === 'prisma-in-duplicates') {
          m.identification.duplicatesRemoved = Number(t.value) || 0;
        }
        // Automation
        else if (t.id === 'prisma-in-automation') {
          m.identification.automationIneligible = Number(t.value) || 0;
        }
        // Other reasons
        else if (t.id === 'prisma-in-other-reasons') {
          m.identification.otherReasonsRemoved = Number(t.value) || 0;
        }
        // Screened
        else if (t.id === 'prisma-in-screened') {
          m.screening.recordsScreened = Number(t.value) || 0;
        }
        // Screened excluded
        else if (t.id === 'prisma-in-screened-excluded') {
          m.screening.recordsExcluded = Number(t.value) || 0;
        }
        // Screening reasons list item
        else if (t.dataset.prismaScreenIdx !== undefined) {
          const idx = Number(t.dataset.prismaScreenIdx);
          const key = t.dataset.prismaScreenKey;
          if (m.screening?.screeningExclusionReasons?.[idx]) {
            m.screening.screeningExclusionReasons[idx][key] = key === 'count' ? (Number(t.value) || 0) : t.value;
          }
        }
        // Reports sought
        else if (t.id === 'prisma-in-reports-sought') {
          m.screening.reportsSought = Number(t.value) || 0;
        }
        // Reports not retrieved
        else if (t.id === 'prisma-in-reports-not-retrieved') {
          m.screening.reportsNotRetrieved = Number(t.value) || 0;
        }
        else if (t.id === 'prisma-in-reports-not-retrieved-reason') {
          m.screening.reportsNotRetrievedReason = t.value;
        }
        // Reports assessed
        else if (t.id === 'prisma-in-reports-assessed') {
          m.screening.reportsAssessed = Number(t.value) || 0;
        }
        // Reports excluded
        else if (t.id === 'prisma-in-reports-excluded') {
          m.screening.reportsExcluded = Number(t.value) || 0;
        }
        // Eligibility reasons list item
        else if (t.dataset.prismaEligIdx !== undefined) {
          const idx = Number(t.dataset.prismaEligIdx);
          const key = t.dataset.prismaEligKey;
          if (m.screening?.eligibilityExclusionReasons?.[idx]) {
            m.screening.eligibilityExclusionReasons[idx][key] = key === 'count' ? (Number(t.value) || 0) : t.value;
          }
        }
        // Studies included
        else if (t.id === 'prisma-in-studies-included') {
          m.included.studiesIncluded = Number(t.value) || 0;
        }
        // Reports included
        else if (t.id === 'prisma-in-reports-included') {
          m.included.reportsOfIncludedStudies = Number(t.value) || 0;
        }
        // Meta analysis
        else if (t.id === 'prisma-in-meta-text') {
          m.included.metaAnalysisText = t.value;
        }
        else if (t.id === 'prisma-in-studies-meta') {
          m.included.studiesIncludedMetaAnalysis = Number(t.value) || 0;
        }

        debouncedSave();
      });

      // Meta analysis toggle
      const chkMeta = $('prisma-chk-meta');
      if (chkMeta) {
        chkMeta.onchange = () => {
          project.prisma_manual_data.included.includeMetaAnalysis = chkMeta.checked;
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
          renderPrismaTab(project);
        };
      }

      // Add database button
      const btnAddDb = $('btn-prisma-add-db');
      if (btnAddDb) {
        btnAddDb.onclick = () => {
          project.prisma_manual_data.identification.databases = project.prisma_manual_data.identification.databases || [];
          project.prisma_manual_data.identification.databases.push({ name: 'Nova Base de Dados', count: 0 });
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
          renderPrismaTab(project);
        };
      }

      // Delete database buttons
      $$('.btn-del-prisma-db').forEach(btn => {
        btn.onclick = (ev) => {
          ev.stopPropagation();
          const idx = Number(btn.dataset.idx);
          project.prisma_manual_data.identification.databases.splice(idx, 1);
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
          renderPrismaTab(project);
        };
      });

      // Add screening reason button
      const btnAddScreenReason = $('btn-prisma-add-screening-reason');
      if (btnAddScreenReason) {
        btnAddScreenReason.onclick = () => {
          project.prisma_manual_data.screening.screeningExclusionReasons = project.prisma_manual_data.screening.screeningExclusionReasons || [];
          project.prisma_manual_data.screening.screeningExclusionReasons.push({ reason: 'Novo motivo de exclusão', count: 0 });
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
          renderPrismaTab(project);
        };
      }

      // Delete screening reason buttons
      $$('.btn-del-screen-reason').forEach(btn => {
        btn.onclick = (ev) => {
          ev.stopPropagation();
          const idx = Number(btn.dataset.idx);
          project.prisma_manual_data.screening.screeningExclusionReasons.splice(idx, 1);
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
          renderPrismaTab(project);
        };
      });

      // Add eligibility reason button
      const btnAddEligReason = $('btn-prisma-add-eligibility-reason');
      if (btnAddEligReason) {
        btnAddEligReason.onclick = () => {
          project.prisma_manual_data.screening.eligibilityExclusionReasons = project.prisma_manual_data.screening.eligibilityExclusionReasons || [];
          project.prisma_manual_data.screening.eligibilityExclusionReasons.push({ reason: 'Novo critério PICO não atendido', count: 0 });
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
          renderPrismaTab(project);
        };
      }

      // Delete eligibility reason buttons
      $$('.btn-del-elig-reason').forEach(btn => {
        btn.onclick = (ev) => {
          ev.stopPropagation();
          const idx = Number(btn.dataset.idx);
          project.prisma_manual_data.screening.eligibilityExclusionReasons.splice(idx, 1);
          Storage.updateProject(project.id, { prisma_manual_data: project.prisma_manual_data });
          renderPrismaTab(project);
        };
      });
    }
  }

  // ─── OVERVIEW TAB ─────────────────────────────────────
  function renderOverviewTab(project) {
    const rawTotal = project.articles ? project.articles.length : (project.stats?.total || 0);
    const duplicatesTotal = project.articles ? project.articles.filter(a => a.is_duplicate).length : (project.stats?.duplicates || 0);
    const screenableTotal = project.articles ? project.articles.filter(a => !a.is_duplicate).length : Math.max(0, rawTotal - duplicatesTotal);
    const includedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate).length : (project.stats?.included || 0);
    const excludedTotal = project.articles ? project.articles.filter(a => a.decision === 'exclude' && !a.is_duplicate).length : (project.stats?.excluded || 0);
    const maybeTotal = project.articles ? project.articles.filter(a => a.decision === 'maybe' && !a.is_duplicate).length : (project.stats?.maybe || 0);
    const pendingTotal = project.articles ? project.articles.filter(a => !a.decision && !a.is_duplicate).length : Math.max(0, screenableTotal - includedTotal - excludedTotal - maybeTotal);
    const triadosTotal = screenableTotal - pendingTotal;
    const pct = screenableTotal > 0 ? Math.round((triadosTotal / screenableTotal) * 100) : 0;
    const content = $('tab-content');

    // Determine next recommended step
    let nextStep = null;
    if (rawTotal === 0) nextStep = 'upload';
    else if (rawTotal > 0 && duplicatesTotal === 0 && !state.dupPairs?.length) nextStep = 'dedup';
    else if (pendingTotal > 0) nextStep = 'screen';
    else nextStep = 'export';

    const nextLabels = {
      upload: { icon: '📁', text: 'Importe artigos para começar', tab: 'upload', btn: 'Importar artigos' },
      dedup: { icon: '🔄', text: 'Detecte duplicatas antes de triar', tab: 'dedup', btn: 'Detectar duplicatas' },
      screen: { icon: '🔍', text: `${pendingTotal} artigos únicos aguardando triagem`, tab: 'screen', btn: 'Iniciar triagem' },
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

        <!-- Quick Stats (Clean Scientific Breakdown) -->
        <div class="overview-stats">
          <div class="ov-stat" id="ov-import">
            <div class="ov-stat-icon">📥</div>
            <div class="ov-stat-body">
              <div class="ov-stat-num">${rawTotal}</div>
              <div class="ov-stat-label">Referências importadas</div>
            </div>
            <button class="btn btn-sm btn-secondary ov-action" data-tab="upload">Adicionar mais</button>
          </div>
          <div class="ov-stat" id="ov-dedup">
            <div class="ov-stat-icon">🔄</div>
            <div class="ov-stat-body">
              <div class="ov-stat-num">${duplicatesTotal}</div>
              <div class="ov-stat-label">Duplicatas descartadas</div>
            </div>
            <button class="btn btn-sm btn-secondary ov-action" data-tab="dedup">${duplicatesTotal > 0 ? 'Gerenciar' : 'Detectar'}</button>
          </div>
          <div class="ov-stat" id="ov-screen">
            <div class="ov-stat-icon">🔍</div>
            <div class="ov-stat-body">
              <div class="ov-stat-num">${screenableTotal}</div>
              <div class="ov-stat-label">Artigos únicos para triagem</div>
            </div>
            <button class="btn btn-sm btn-secondary ov-action" data-tab="screen">Triar agora</button>
          </div>
          <div class="ov-stat" id="ov-results">
            <div class="ov-stat-icon">✅</div>
            <div class="ov-stat-body">
              <div class="ov-stat-num">${includedTotal}</div>
              <div class="ov-stat-label">Artigos incluídos</div>
            </div>
            <button class="btn btn-sm btn-secondary ov-action" data-tab="articles">Ver incluídos</button>
          </div>
        </div>

        <!-- Progress Bar (Based on Screenable Unique Pool) -->
        <div class="overview-progress-card">
          <div class="ov-progress-header">
            <span class="ov-progress-title">Progresso da triagem (${triadosTotal} de ${screenableTotal} únicos)</span>
            <span class="ov-progress-pct">${pct}%</span>
          </div>
          <div class="ov-progress-track">
            <div class="ov-progress-fill include" style="width:${screenableTotal ? (includedTotal/screenableTotal*100) : 0}%"></div>
            <div class="ov-progress-fill exclude" style="width:${screenableTotal ? (excludedTotal/screenableTotal*100) : 0}%"></div>
            <div class="ov-progress-fill maybe" style="width:${screenableTotal ? (maybeTotal/screenableTotal*100) : 0}%"></div>
          </div>
          <div class="ov-progress-legend">
            <span class="leg include">✓ ${includedTotal} incluídos</span>
            <span class="leg exclude">✗ ${excludedTotal} excluídos</span>
            <span class="leg maybe">? ${maybeTotal} talvez</span>
            <span class="leg pending">· ${pendingTotal} pendentes</span>
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
          <div class="ov-info-row" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span class="ov-info-key">Banco de Dados Local</span>
            <button class="btn btn-sm btn-ghost" id="ov-btn-repair-articles" style="border:1px dashed var(--purple);color:var(--purple);font-size:0.78rem;padding:5px 12px;border-radius:var(--radius-sm);cursor:pointer;">🔄 Diagnóstico: Verificar e Recuperar Banco Local</button>
          </div>
        </div>

      </div>
    `;

    $('next-step-btn').onclick = () => { state.tab = next.tab; renderProject(); };
    content.querySelectorAll('.ov-action').forEach(btn => {
      btn.onclick = () => { state.tab = btn.dataset.tab; renderProject(); };
    });

    document.getElementById('ov-btn-repair-articles')?.addEventListener('click', async () => {
      const res = await Storage.restoreProjectArticlesFromIDB(project.id);
      if (res && res.recovered) {
        UI.toast(`Sucesso! ${res.total} artigos recuperados do banco local!`, 'success');
        renderProject();
      } else {
        UI.toast(`Banco local íntegro: ${res.total} artigos confirmados.`, 'info');
      }
    });
  }

  // ─── UPLOAD TAB ──────────────────────────────────────
  function renderUploadTab(project) {
    const content = $('tab-content');
    const screenableCount = project.stats.screenable !== undefined ? project.stats.screenable : Math.max(0, project.stats.total - (project.stats.duplicates || 0));
    content.innerHTML = `
      <div class="upload-tab">
        <div class="upload-zone" id="upload-zone">
          <div class="upload-zone-inner">
            <div class="upload-icon">📂</div>
            <h3>Arraste arquivos, pastas ou arquivo .ZIP aqui</h3>
            <p>Formatos suportados: <strong>.ris · .bib · .csv · .nbib · .pdf · .txt · .json · .zip (pasta compactada)</strong></p>
            <input type="file" id="file-input" multiple accept=".ris,.bib,.csv,.nbib,.pdf,.txt,.json,.zip,application/zip,application/x-zip-compressed" style="display:none"/>
            <input type="file" id="folder-input" webkitdirectory directory multiple style="display:none"/>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px;">
              <button class="btn btn-primary" id="select-files-btn" style="border-radius:9999px;">Selecionar Arquivos</button>
              <button class="btn btn-secondary" id="select-zip-btn" style="border-radius:9999px;background:rgba(59,130,246,0.15);border-color:rgba(59,130,246,0.4);color:#fff;">📦 Pasta ZIP (.zip)</button>
              <button class="btn btn-secondary" id="select-folder-btn" style="border-radius:9999px;background:rgba(16,185,129,0.15);border-color:rgba(16,185,129,0.4);color:#fff;">📁 Selecionar Pasta</button>
              <button class="btn btn-secondary" id="select-pdf-btn" style="border-radius:9999px;background:rgba(168,85,247,0.15);border-color:var(--purple);color:#fff;">📄 PDFs Científicos</button>
            </div>
          </div>
        </div>

        <div id="upload-progress" class="upload-progress" style="display:none"></div>

        <div class="import-history">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
            <h3 style="margin:0;">Arquivos importados</h3>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-sm btn-ghost" id="btn-repair-articles" style="border:1px dashed var(--purple);color:var(--purple);font-size:0.78rem;padding:5px 10px;border-radius:var(--radius-sm);cursor:pointer;">🔄 Recuperar do Banco Local</button>
              <span class="muted" style="font-size:0.8rem;">Gerencie ou retire arquivos importados por engano</span>
            </div>
          </div>
          <div id="import-history-list">
            ${renderImportHistory(project)}
          </div>
        </div>

        ${project.stats.total > 0 ? `
          <div class="upload-actions" style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="go-dedup-btn">🔄 Detectar e Resolver Duplicatas →</button>
            <button class="btn btn-secondary" id="go-screen-btn">🔍 Ir para Triagem (${screenableCount}) →</button>
            <button class="btn btn-ghost" id="go-articles-btn">Ver todos os artigos →</button>
          </div>` : ''}
      </div>
    `;

    setupDropzone(project);
    document.getElementById('select-files-btn').onclick = () => {
      const fi = $('file-input');
      fi.accept = '.ris,.bib,.csv,.nbib,.pdf,.txt,.json,.zip,application/zip,application/x-zip-compressed';
      fi.click();
    };
    document.getElementById('select-zip-btn').onclick = () => {
      const fi = $('file-input');
      fi.accept = '.zip,application/zip,application/x-zip-compressed';
      fi.click();
    };
    document.getElementById('select-folder-btn').onclick = () => {
      $('folder-input').click();
    };
    document.getElementById('select-pdf-btn').onclick = () => {
      const pdfInput = $('file-input');
      pdfInput.accept = '.pdf,application/pdf';
      pdfInput.click();
    };
    $('file-input').onchange = (e) => {
      handleFiles(Array.from(e.target.files), project);
      $('file-input').accept = '.ris,.bib,.csv,.nbib,.pdf,.txt,.json,.zip,application/zip,application/x-zip-compressed';
    };
    $('folder-input').onchange = (e) => {
      handleFiles(Array.from(e.target.files), project);
    };
    document.getElementById('go-dedup-btn')?.addEventListener('click', () => { state.tab = 'dedup'; renderProject(); });
    document.getElementById('go-screen-btn')?.addEventListener('click', () => { state.tab = 'screen'; renderProject(); });
    document.getElementById('go-articles-btn')?.addEventListener('click', () => { state.tab = 'articles'; renderProject(); });

    document.getElementById('btn-repair-articles')?.addEventListener('click', async () => {
      const res = await Storage.restoreProjectArticlesFromIDB(project.id);
      if (res && res.recovered) {
        UI.toast(`Sucesso! ${res.total} artigos recuperados do banco local!`, 'success');
        renderProject();
      } else {
        UI.toast(`Banco local íntegro: ${res.total} artigos confirmados.`, 'info');
      }
    });

    // Bind remove source file buttons
    content.querySelectorAll('.btn-remove-source-file').forEach(btn => {
      btn.onclick = () => {
        const fileName = decodeURIComponent(btn.dataset.file);
        const count = btn.dataset.count;
        UI.modal(
          'Retirar arquivo importado',
          `<p>Deseja realmente retirar o arquivo <strong>"${UI.escapeHtml ? UI.escapeHtml(fileName) : fileName}"</strong> deste projeto?</p>
           <p style="color:var(--text-muted);font-size:0.88rem;margin-top:10px;">Isso removerá os <strong>${count}</strong> artigos cadastrados por este arquivo. As estatísticas e duplicatas serão recalculadas automaticamente.</p>`,
          [
            { label: 'Cancelar', style: 'btn-ghost' },
            {
              label: 'Sim, Retirar Arquivo',
              style: 'btn-danger',
              cb: () => {
                const updated = Storage.deleteArticlesBySourceFile(project.id, fileName);
                UI.toast(`Arquivo "${fileName}" e seus ${count} artigos foram retirados com sucesso!`, 'success');
                renderProject();
              }
            }
          ]
        );
      };
    });
  }

  function renderImportHistory(project) {
    const files = [...new Set((project.articles || []).map(a => a.source_file).filter(Boolean))];
    if (!files.length) return '<p class="muted">Nenhum arquivo importado ainda.</p>';
    return files.map(f => {
      const count = project.articles.filter(a => a.source_file === f).length;
      return `
        <div class="import-file-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;flex-wrap:wrap;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;overflow:hidden;min-width:200px;flex:1;">
            <span class="file-icon" style="font-size:1.3rem;">📄</span>
            <div style="overflow:hidden;">
              <div class="file-name" style="font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${UI.escapeHtml ? UI.escapeHtml(f) : f}">${UI.escapeHtml ? UI.escapeHtml(f) : f}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${count} artigo${count !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-remove-source-file" data-file="${encodeURIComponent(f)}" data-count="${count}" title="Retirar este arquivo e seus ${count} artigos" style="color:#ef4444;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.08);padding:6px 12px;border-radius:var(--radius-sm);cursor:pointer;flex-shrink:0;font-weight:600;">
            🗑️ Retirar Arquivo
          </button>
        </div>
      `;
    }).join('');
  }

  function setupDropzone(project) {
    const zone = $('upload-zone');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');

      const files = [];
      const items = e.dataTransfer.items;

      if (items && items.length && items[0].webkitGetAsEntry) {
        // Traverse dropped folders/directories recursively
        const traverseEntry = async (entry) => {
          if (entry.isFile) {
            const file = await new Promise(res => entry.file(res));
            files.push(file);
          } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await new Promise(res => reader.readEntries(res));
            for (const child of entries) {
              await traverseEntry(child);
            }
          }
        };

        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) {
            await traverseEntry(entry);
          } else {
            const f = items[i].getAsFile();
            if (f) files.push(f);
          }
        }
      } else {
        files.push(...Array.from(e.dataTransfer.files));
      }

      handleFiles(files, project);
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

    const hasZip = files.some(f => f.name.toLowerCase().endsWith('.zip') || f.type.includes('zip'));
    progress.innerHTML = UI.loadingState(hasZip ? `Descompactando e lendo pasta ZIP…` : `Processando ${files.length} arquivo(s)…`);

    try {
      const articles = await Parsers.parseFiles(files, (msg) => {
        progress.innerHTML = UI.loadingState(msg);
      });

      if (!articles.length) {
        progress.innerHTML = '<p class="error-msg">Nenhum artigo encontrado nos arquivos ou na pasta ZIP. Verifique os formatos (.ris, .bib, .csv, .pdf, .zip).</p>';
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
          ✅ <strong>${articles.length} artigos importados com sucesso!</strong>
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

  // ─── SCREEN (GISA WORKBENCH) TAB ───────────────────
  function renderScreenTab(project) {
    const content = $('tab-content');
    const incKws = project.keywords || [];
    const excKws = project.excludeKeywords || [];

    // Filter articles based on current filters and facet selection
    let filteredArticles = project.articles.filter(a => {
      // Duplicates are excluded from regular screening flow by default
      if (state.filter.decision !== 'duplicate' && a.is_duplicate) return false;

      // 1. Facet Decision filter
      if (state.filter.decision === 'include' && a.decision !== 'include') return false;
      if (state.filter.decision === 'exclude' && (a.decision !== 'exclude' || a.is_duplicate)) return false;
      if (state.filter.decision === 'maybe' && a.decision !== 'maybe') return false;
      if (state.filter.decision === 'pending' && (a.decision !== null || a.is_duplicate)) return false;
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
      <div class="screen-tab-gisa">
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
          <div class="gisa-workbench">
            <!-- 1. Left Panel: Facet Sidebar -->
            <div id="gisa-facets-slot"></div>

            <!-- 2. Middle Panel: Articles List -->
            <div class="articles-center-panel">
              <div class="articles-toolbar">
                <div class="articles-search-box">
                  <span class="search-icon">🔍</span>
                  <input id="gisa-search-input" placeholder="Buscar título/resumo/autor (Usar setas ↑↓ ou J/K para navegar)" value="${state.filter.search || ''}"/>
                </div>
                <button class="btn btn-sm btn-ghost" id="gisa-hotkeys-btn">⌨️ Atalhos [?]</button>
              </div>
              <div class="articles-scroll-list" id="gisa-articles-list"></div>
            </div>

            <!-- 3. Right Panel: Abstract Inspector -->
            <div id="gisa-inspector-slot"></div>
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
    const facetsSlot = $('gisa-facets-slot');
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
    renderGisaArticlesListOnly(project);

    // Search Input Listener (Smooth typing without focus loss)
    const searchInput = $('gisa-search-input');
    if (searchInput) {
      searchInput.oninput = () => {
        state.filter.search = searchInput.value;
        renderGisaArticlesListOnly(Storage.getProject(state.projectId));
      };
    }

    // Hotkeys Help Button
    $('gisa-hotkeys-btn')?.addEventListener('click', () => UI.showHotkeysModal());
  }

  function getFilteredArticles(project) {
    return (project.articles || []).filter(a => {
      // Duplicates are excluded from regular screening flow by default
      if (state.filter.decision !== 'duplicate' && a.is_duplicate) return false;

      // 1. Facet Decision filter
      if (state.filter.decision === 'include' && a.decision !== 'include') return false;
      if (state.filter.decision === 'exclude' && (a.decision !== 'exclude' || a.is_duplicate)) return false;
      if (state.filter.decision === 'maybe' && a.decision !== 'maybe') return false;
      if (state.filter.decision === 'pending' && (a.decision !== null || a.is_duplicate)) return false;
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

  function renderGisaArticlesListOnly(project) {
    const articlesListEl = $('gisa-articles-list');
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
      row.className = `gisa-article-row ${isSelected ? 'selected' : ''}`;
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
        <div class="gisa-row-header">
          <div class="gisa-article-title">${UI.escapeHtml ? UI.escapeHtml(article.title) : article.title}</div>
          <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
            ${statusBadge}
          </div>
        </div>
        <div class="gisa-row-meta">
          <span>${article.authors?.length ? (UI.escapeHtml ? UI.escapeHtml(article.authors[0]) : article.authors[0]) + (article.authors.length > 1 ? ' et al.' : '') : 'Autores n/d'}</span>
          ${article.journal ? `<span>· ${UI.escapeHtml ? UI.escapeHtml(article.journal) : article.journal}</span>` : ''}
          ${article.year ? `<span>· ${UI.escapeHtml ? UI.escapeHtml(article.year) : article.year}</span>` : ''}
          ${relChip}
        </div>
        <div class="gisa-row-actions">
          <button class="btn-gisa-inc ${article.decision === 'include' ? 'active' : ''}" data-act="inc" aria-pressed="${article.decision === 'include'}">Incluir (I)</button>
          <button class="btn-gisa-exc ${article.decision === 'exclude' ? 'active' : ''}" data-act="exc" aria-pressed="${article.decision === 'exclude'}">Excluir (E)</button>
          <button class="btn-gisa-maybe ${article.decision === 'maybe' ? 'active' : ''}" data-act="maybe" aria-pressed="${article.decision === 'maybe'}">Talvez (M)</button>
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
          document.querySelectorAll('.gisa-article-row').forEach(r => r.classList.remove('selected'));
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
          renderGisaArticlesListOnly(Storage.getProject(state.projectId));
        }
      };
    });

    articlesListEl.querySelectorAll('.page-next-btn').forEach(btn => {
      btn.onclick = () => {
        if (state.articleOffset + pageSize < totalItems) {
          state.articleOffset += pageSize;
          renderGisaArticlesListOnly(Storage.getProject(state.projectId));
        }
      };
    });

    updateInspectorPanel(activeArticle, project);
  }

  function updateInspectorPanel(article, project) {
    const inspectorSlot = $('gisa-inspector-slot') || document.querySelector('.abstract-inspector-panel');
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
        renderGisaArticlesListOnly(Storage.getProject(project.id));
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
            ? `<div class="serial-abstract" style="text-align:justify;text-justify:inter-word;text-align-last:left;line-height:1.75;">${abstractHtml}</div>`
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

  // ─── DEDUP TAB (DEDUPLICAÇÃO INCREMENTAL EM CAMADAS) ──
  function renderDedupTab(project) {
    const content = $('tab-content');
    if (!content) return;

    if (!project.articles || !project.articles.length) {
      content.innerHTML = `<div class="dedup-tab">${UI.emptyState('🔄', 'Nenhum artigo para comparar', 'Importe artigos primeiro na aba Importar.')}</div>`;
      return;
    }

    state.dupThreshold = state.dupThreshold || 65;
    state.dupFilter = state.dupFilter || 'pending_all';

    content.innerHTML = `
      <div class="dedup-tab">
        <div class="dedup-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;background:var(--bg-card);padding:20px 24px;border:1px solid var(--border);border-radius:var(--radius-xl);margin-bottom:20px;">
          <div class="dedup-config" style="flex:1;min-width:280px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-size:1.2rem;">🔍</span>
              <label style="font-size:0.95rem;font-weight:700;color:var(--text-primary);">Limiar de Similaridade:</label>
              <span id="threshold-display" class="threshold-val" style="font-size:0.9rem;font-weight:800;color:var(--purple);background:var(--purple-glow);padding:2px 8px;border-radius:var(--radius-sm);">${state.dupThreshold}%</span>
            </div>
            <div class="threshold-row" style="display:flex;align-items:center;gap:12px;">
              <input type="range" id="dup-threshold" min="50" max="100" value="${state.dupThreshold}" class="range-input" style="flex:1;cursor:pointer;accent-color:var(--purple);"/>
            </div>
            <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm ${state.dupThreshold === 97 ? 'btn-primary' : 'btn-ghost'} dup-preset-quick" data-val="97" style="font-size:0.75rem;padding:3px 12px;border-radius:9999px;">97% (Estrito)</button>
              <button type="button" class="btn btn-sm ${state.dupThreshold === 85 ? 'btn-primary' : 'btn-ghost'} dup-preset-quick" data-val="85" style="font-size:0.75rem;padding:3px 12px;border-radius:9999px;">85% (Moderado)</button>
              <button type="button" class="btn btn-sm ${state.dupThreshold === 60 ? 'btn-primary' : 'btn-ghost'} dup-preset-quick" data-val="60" style="font-size:0.75rem;padding:3px 12px;border-radius:9999px;">60% (Amplo)</button>
              <button type="button" class="btn btn-sm ${state.dupThreshold === 55 ? 'btn-primary' : 'btn-ghost'} dup-preset-quick" data-val="55" style="font-size:0.75rem;padding:3px 12px;border-radius:9999px;">55% (Todos)</button>
            </div>
          </div>
          <div class="dedup-top-buttons" style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-secondary" id="run-dedup-btn" style="border-radius:9999px;">🔍 Re-analisar Base</button>
            <button class="btn btn-primary" id="open-auto-resolver-pro-btn" style="border-radius:9999px;background:linear-gradient(135deg, var(--purple), var(--violet));box-shadow:0 4px 14px var(--purple-glow);">
              ⚡ Systematic Auto-Resolver (Gisa Pro)
            </button>
          </div>
        </div>
        <div id="dedup-results"></div>
      </div>
    `;

    const range = $('dup-threshold');
    const display = $('threshold-display');

    const syncPresetButtons = (val) => {
      content.querySelectorAll('.dup-preset-quick').forEach(b => {
        const bVal = parseInt(b.dataset.val);
        if (bVal === val) {
          b.className = 'btn btn-sm btn-primary dup-preset-quick';
        } else {
          b.className = 'btn btn-sm btn-ghost dup-preset-quick';
        }
      });
    };

    if (range && display) {
      range.oninput = () => {
        state.dupThreshold = parseInt(range.value);
        state.dupFilter = 'pending_all';
        state.dupOffset = 0;
        display.textContent = state.dupThreshold + '%';
        syncPresetButtons(state.dupThreshold);
        if (state.dupPairs && state.dupPairs.length > 0) {
          renderDupResults(Storage.getProject(project.id) || project);
        }
      };
    }

    content.querySelectorAll('.dup-preset-quick').forEach(btn => {
      btn.onclick = () => {
        const val = parseInt(btn.dataset.val);
        state.dupThreshold = val;
        state.dupFilter = 'pending_all';
        state.dupOffset = 0;
        if (range) range.value = val;
        if (display) display.textContent = val + '%';
        syncPresetButtons(val);
        if (state.dupPairs && state.dupPairs.length > 0) {
          renderDupResults(Storage.getProject(project.id) || project);
        }
      };
    });

    $('run-dedup-btn')?.addEventListener('click', () => {
      // Force a clean restart of deduplication
      state.dedupScanId = (state.dedupScanId || 0) + 1;
      state.isDeduplicating = false;
      state.dupPairs = [];
      runDeduplication(project, state.dupThreshold);
    });
    
    $('open-auto-resolver-pro-btn')?.addEventListener('click', () => {
      const currentProject = Storage.getProject(project.id) || project;
      const pairs = (state.dupPairs && state.dupPairs.length) ? state.dupPairs : Similarity.findDuplicates(currentProject.articles, 50);
      UI.showAutoResolverModal(currentProject, pairs, (opts) => {
        applyAutoResolverPro(currentProject, opts);
      });
    });

    // If pairs already in state for this project, render directly;
    // else if already scanning, maintain active progress UI;
    // else run initial scan
    if (state.dupPairs && state.dupPairs.length > 0) {
      renderDupResults(project);
    } else if (state.isDeduplicating) {
      const results = $('dedup-results');
      const btn = $('run-dedup-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Analisando…';
      }
      if (results) {
        const pct = Math.max(5, (state.dedupProgress && state.dedupProgress.pct) || 5);
        const articlesCount = project.articles ? project.articles.length : 0;
        const textMsg = pct < 35 ? `Indexando ${articlesCount} artigos… (${pct}%)` : `Comparando duplicatas (${pct}%)…`;
        results.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:45px 20px;gap:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:20px;margin:20px 0;backdrop-filter:blur(12px);">
            <div class="spinner" style="width:36px;height:36px;border-width:3px;border-top-color:var(--purple);"></div>
            <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);" id="dedup-prog-text">
              ${textMsg}
            </div>
            <div style="width:260px;height:7px;background:rgba(255,255,255,0.12);border-radius:9999px;overflow:hidden;">
              <div id="dedup-prog-bar" style="width:${pct}%;height:100%;background:linear-gradient(90deg, var(--purple), #6366f1);transition:width 0.2s ease;"></div>
            </div>
            <small style="color:var(--text-muted);font-size:0.8rem;" id="dedup-prog-detail">${pct}% concluído — interface ativa</small>
          </div>
        `;
      }
    } else {
      runDeduplication(project, state.dupThreshold);
    }
  }

  async function runDeduplication(project, threshold) {
    state.dedupScanId = (state.dedupScanId || 0) + 1;
    const thisScanId = state.dedupScanId;
    state.isDeduplicating = true;
    state.dedupProgress = { pct: 0, phase: 'start' };

    const btn = $('run-dedup-btn');
    const results = $('dedup-results');
    if (!results) {
      state.isDeduplicating = false;
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Analisando…';
    }

    results.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:45px 20px;gap:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:20px;margin:20px 0;backdrop-filter:blur(12px);">
        <div class="spinner" style="width:36px;height:36px;border-width:3px;border-top-color:var(--purple);"></div>
        <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);" id="dedup-prog-text">
          Comparando referências científicas…
        </div>
        <div style="width:260px;height:7px;background:rgba(255,255,255,0.12);border-radius:9999px;overflow:hidden;">
          <div id="dedup-prog-bar" style="width:5%;height:100%;background:linear-gradient(90deg, var(--purple), #6366f1);transition:width 0.2s ease;"></div>
        </div>
        <small style="color:var(--text-muted);font-size:0.8rem;" id="dedup-prog-detail">Iniciando análise inteligente em camadas…</small>
      </div>
    `;

    await new Promise(r => setTimeout(r, 40));
    if (thisScanId !== state.dedupScanId) return;

    const currentProject = Storage.getProject(project.id) || project;
    const articlesToScan = currentProject.articles || [];

    let maxReportedPct = 0;
    const isCancelled = () => {
      return thisScanId !== state.dedupScanId || state.tab !== 'dedup' || state.projectId !== project.id;
    };

    try {
      const pairs = await (Similarity.findDuplicatesAsync
        ? Similarity.findDuplicatesAsync(articlesToScan, 50, (prog) => {
            if (isCancelled()) return;
            const pct = Math.max(maxReportedPct, Math.min(100, Math.round(prog.pct || 0)));
            maxReportedPct = pct;
            state.dedupProgress = { pct, phase: prog.phase };

            const bar = $('dedup-prog-bar');
            const text = $('dedup-prog-text');
            const detail = $('dedup-prog-detail');
            if (bar) bar.style.width = `${Math.max(5, pct)}%`;
            if (text) {
              if (pct < 35) text.textContent = `Indexando ${articlesToScan.length} artigos… (${pct}%)`;
              else text.textContent = `Comparando duplicatas (${pct}%)…`;
            }
            if (detail) {
              detail.textContent = `${pct}% concluído — interface ativa`;
            }
          }, isCancelled)
        : Promise.resolve(Similarity.findDuplicates(articlesToScan, 50)));

      if (isCancelled()) return;

      state.dupPairs = pairs;
      state.dupResolved = state.dupResolved || new Set();
      state.dupOffset = 0;
      state.dupFilter = state.dupFilter || 'pending_all';

      renderDupResults(currentProject);
    } catch (err) {
      console.error('[Gisa Dedup Error]', err);
    } finally {
      if (thisScanId === state.dedupScanId) {
        state.isDeduplicating = false;
        const freshBtn = $('run-dedup-btn');
        if (freshBtn) {
          freshBtn.disabled = false;
          freshBtn.textContent = '🔍 Re-analisar Base';
        }
      }
    }
  }

  function renderDupResults(project) {
    const results = $('dedup-results');
    if (!results) return;

    const currentProject = Storage.getProject(project.id) || project;
    const articles = currentProject.articles || [];
    const duplicateArticleIds = new Set(articles.filter(a => a.is_duplicate).map(a => a.id));
    const resolvedTotal = duplicateArticleIds.size;
    const totalRaw = articles.length;
    const screenableTotal = Math.max(0, totalRaw - resolvedTotal);

    state.dupResolved = state.dupResolved || new Set();
    const allPairs = state.dupPairs || [];

    // Separate into PENDING vs ALREADY RESOLVED
    const isPending = p => !duplicateArticleIds.has(p.articleA.id) &&
                          !duplicateArticleIds.has(p.articleB.id) &&
                          !state.dupResolved.has(`${p.articleA.id}_${p.articleB.id}`);

    const pendingPairs = allPairs.filter(isPending);
    const resolvedPairs = allPairs.filter(p => !isPending(p));

    // Tiers within pending
    const pendingHigh = pendingPairs.filter(p => p.score >= 97);
    const pendingMed = pendingPairs.filter(p => p.score >= 85 && p.score < 97);
    const pendingManual = pendingPairs.filter(p => p.score < 85); // 55% - 84% (os 107 manuais!)

    const currentThresh = state.dupThreshold || 65;
    const pendingAtThreshold = pendingPairs.filter(p => p.score >= currentThresh);

    // Determine current active filter list
    state.dupFilter = state.dupFilter || 'pending_all';
    let filteredPairs = [];
    if (state.dupFilter === 'pending_all') filteredPairs = pendingAtThreshold;
    else if (state.dupFilter === 'pending_high') filteredPairs = pendingHigh;
    else if (state.dupFilter === 'pending_med') filteredPairs = pendingMed;
    else if (state.dupFilter === 'pending_manual') filteredPairs = pendingManual;
    else if (state.dupFilter === 'resolved') filteredPairs = resolvedPairs;

    results.innerHTML = `
      <div class="dedup-summary" style="margin-bottom:20px;">
        <div class="dedup-stat-chip all ${state.dupFilter === 'pending_all' ? 'active' : ''}" data-filter="pending_all" title="Pares de artigos com similaridade igual ou superior a ${currentThresh}%">
          <span>${pendingAtThreshold.length} <small style="font-size:0.7rem;color:var(--text-muted);font-weight:normal;">/ ${pendingPairs.length}</small></span>
          <small>Suspeitos (≥ ${currentThresh}%)</small>
        </div>
        <div class="dedup-stat-chip high ${state.dupFilter === 'pending_high' ? 'active' : ''}" data-filter="pending_high" title="Pares com 97% a 100% de similaridade (praticamente idênticos)">
          <span>${pendingHigh.length}</span>
          <small>Alta (≥ 97%)</small>
        </div>
        <div class="dedup-stat-chip medium ${state.dupFilter === 'pending_med' ? 'active' : ''}" data-filter="pending_med" title="Pares com 85% a 96% de similaridade">
          <span>${pendingMed.length}</span>
          <small>Média (85%–96%)</small>
        </div>
        <div class="dedup-stat-chip manual ${state.dupFilter === 'pending_manual' ? 'active' : ''}" data-filter="pending_manual" title="Pares de artigos com similaridade abaixo de 85% para conferência humana">
          <span>${pendingManual.length}</span>
          <small>Verificação Manual (&lt; 85%)</small>
        </div>
        <div class="dedup-stat-chip resolved ${state.dupFilter === 'resolved' ? 'active' : ''}" data-filter="resolved" title="Total de artigos repetidos que já foram descartados pelo desduplicador">
          <span>${resolvedTotal}</span>
          <small>Cópias Descartadas</small>
        </div>
        <div class="dedup-stat-chip" style="cursor:default;border-color:rgba(34,197,94,0.3);background:rgba(34,197,94,0.06);color:var(--green);" title="Artigos únicos da sua busca que você irá avaliar na Triagem de Título e Resumo">
          <span>${screenableTotal}</span>
          <small>Artigos Únicos p/ Triagem</small>
        </div>

        <div class="dedup-actions-top">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${pendingHigh.length > 0 ? `
              <button class="btn btn-danger btn-sm" id="btn-quick-resolve-high" style="border-radius:9999px;font-weight:700;">
                ⚡ Resolver ${pendingHigh.length} Alta Similaridade (≥ 97%)
              </button>
            ` : ''}
            ${pendingAtThreshold.length > 0 ? `
              <button class="btn btn-primary btn-sm" id="btn-quick-resolve-thresh" style="border-radius:9999px;font-weight:700;background:linear-gradient(135deg,var(--purple),var(--violet));">
                ⚡ Resolver ${pendingAtThreshold.length} Duplicatas Pendentes (≥ ${currentThresh}%)
              </button>
            ` : ''}
            ${pendingPairs.length === 0 && resolvedTotal > 0 ? `
              <button class="btn btn-primary btn-sm" id="btn-go-to-screen" style="border-radius:9999px;font-weight:700;background:linear-gradient(135deg,#10b981,#059669);">
                🔍 Prosseguir para a Triagem (${screenableTotal}) →
              </button>
            ` : ''}
          </div>

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${resolvedTotal > 0 ? `
              <button class="btn btn-ghost btn-sm" id="btn-reset-duplicates" style="border-radius:9999px;color:#f87171;border:1px dashed rgba(239,68,68,0.35);font-size:0.75rem;" title="Restaurar todos os artigos duplicados de volta para a base ativa">
                🔄 Desfazer Duplicatas
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <div id="dup-pairs-list"></div>
    `;

    // Bind Filter Chips Click
    results.querySelectorAll('.dedup-stat-chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.dataset.filter;
        state.dupFilter = f;
        state.dupOffset = 0;
        if (f === 'pending_high') state.dupThreshold = 97;
        else if (f === 'pending_med') state.dupThreshold = 85;
        else if (f === 'pending_manual') state.dupThreshold = 60;
        
        const r = $('dup-threshold');
        const d = $('threshold-display');
        if (r) r.value = state.dupThreshold;
        if (d) d.textContent = state.dupThreshold + '%';
        document.querySelectorAll('.dup-preset-quick').forEach(b => {
          b.className = parseInt(b.dataset.val) === state.dupThreshold ? 'btn btn-sm btn-primary dup-preset-quick' : 'btn btn-sm btn-ghost dup-preset-quick';
        });
        renderDupResults(currentProject);
      });
    });

    // Quick Action Buttons
    $('btn-quick-resolve-high')?.addEventListener('click', () => {
      autoResolvePendingPairs(currentProject, pendingHigh, 'Alta Similaridade (≥ 97%)');
    });

    $('btn-quick-resolve-thresh')?.addEventListener('click', () => {
      autoResolvePendingPairs(currentProject, pendingAtThreshold, `Similaridade ≥ ${currentThresh}%`);
    });

    $('btn-go-to-screen')?.addEventListener('click', () => {
      state.tab = 'screen';
      renderProjectTab(currentProject);
      updateTabActive();
    });

    $('btn-reset-duplicates')?.addEventListener('click', () => {
      confirmResetDuplicates(currentProject);
    });

    // Render list items
    const list = $('dup-pairs-list');
    if (!list) return;

    if (!filteredPairs.length) {
      if (state.dupFilter === 'pending_all') {
        list.innerHTML = `
          <div style="text-align:center;padding:18px 20px;background:rgba(26,17,50,0.6);border:1px solid rgba(168,85,247,0.25);border-radius:var(--radius-lg);margin:10px 0;">
            <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:6px;">
              <span style="font-size:1.4rem;">✅</span>
              <h3 style="color:var(--text-primary);margin:0;font-size:1.05rem;">Nenhum par pendente com similaridade ≥ ${currentThresh}%</h3>
            </div>
            <p style="color:var(--text-muted);font-size:0.85rem;max-width:620px;margin:0 auto 12px;line-height:1.4;">
              ${pendingPairs.length > 0 
                ? `Todas as duplicatas com similaridade acima de <strong>${currentThresh}%</strong> já foram resolvidas! Restam <strong>${pendingPairs.length} pares com menor similaridade (&lt; 85%)</strong> que requerem verificação humana.` 
                : 'Todas as duplicatas encontradas já foram descartadas e a base está 100% limpa.'}
            </p>
            ${pendingPairs.length > 0 ? `
              <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" id="btn-show-manual-pairs" style="border-radius:9999px;font-size:0.8rem;padding:5px 16px;">
                  🔍 Ver os ${pendingPairs.length} Pares para Verificação Manual (< 85%)
                </button>
                <button class="btn btn-ghost btn-sm" id="btn-lower-threshold-55" style="border-radius:9999px;border:1px solid rgba(255,255,255,0.18);font-size:0.8rem;padding:5px 16px;">
                  Exibir Todos os Pares (55%)
                </button>
              </div>
            ` : ''}
          </div>
        `;
        list.querySelector('#btn-show-manual-pairs')?.addEventListener('click', () => {
          state.dupFilter = 'pending_manual';
          state.dupOffset = 0;
          renderDupResults(currentProject);
        });
        list.querySelector('#btn-lower-threshold-55')?.addEventListener('click', () => {
          state.dupThreshold = 55;
          state.dupFilter = 'pending_all';
          state.dupOffset = 0;
          const r = $('dup-threshold');
          const d = $('threshold-display');
          if (r) r.value = 55;
          if (d) d.textContent = '55%';
          document.querySelectorAll('.dup-preset-quick').forEach(b => {
            b.className = parseInt(b.dataset.val) === 55 ? 'btn btn-sm btn-primary dup-preset-quick' : 'btn btn-sm btn-ghost dup-preset-quick';
          });
          renderDupResults(currentProject);
        });
      } else if (state.dupFilter === 'pending_manual') {
        list.innerHTML = UI.emptyState('✨', 'Nenhum par manual pendente', 'Todos os casos de média/baixa similaridade já foram resolvidos ou não existem na base.');
      } else if (state.dupFilter === 'pending_high') {
        list.innerHTML = UI.emptyState('✓', 'Nenhuma duplicata de alta similaridade pendente', 'Todas as duplicatas estritas (≥97%) foram descartadas.');
      } else if (state.dupFilter === 'pending_med') {
        list.innerHTML = UI.emptyState('✓', 'Nenhuma duplicata de média similaridade pendente', 'Todas as duplicatas entre 85% e 96% foram descartadas.');
      } else if (state.dupFilter === 'resolved') {
        list.innerHTML = UI.emptyState('📋', 'Nenhuma duplicata descartada ainda', 'Execute a resolução automática ou manual acima para eliminar duplicatas.');
      } else {
        list.innerHTML = UI.emptyState('✅', 'Todas as duplicatas resolvidas', `Base limpa com ${screenableTotal} artigos únicos prontos para a triagem.`);
      }
      return;
    }

    const pageSize = 20;
    const total = filteredPairs.length;
    if (state.dupOffset === undefined || state.dupOffset >= total) {
      state.dupOffset = 0;
    }
    const offset = state.dupOffset;
    const page = filteredPairs.slice(offset, offset + pageSize);
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = Math.floor(offset / pageSize) + 1;

    list.innerHTML = '';

    // Filter subtitle banner
    const banner = document.createElement('div');
    banner.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);';
    banner.innerHTML = `
      <span style="font-size:0.84rem;font-weight:700;color:var(--text-primary);">
        Exibindo: <strong style="color:var(--purple);">${
          state.dupFilter === 'pending_manual' ? '🔍 Pares para Verificação Manual (< 85%)' :
          state.dupFilter === 'pending_high' ? '🔴 Alta Similaridade (≥ 97%)' :
          state.dupFilter === 'pending_med' ? '🟡 Média Similaridade (85%–96%)' :
          state.dupFilter === 'resolved' ? '🟢 Duplicatas Já Descartadas' :
          `🔘 Pares Pendentes com Similaridade ≥ ${currentThresh}%`
        }</strong> (${total} ${total === 1 ? 'par' : 'pares'})
      </span>
      <span style="font-size:0.78rem;color:var(--text-muted);">${totalPages > 1 ? `Página ${currentPage} de ${totalPages}` : ''}</span>
    `;
    list.appendChild(banner);

    page.forEach((pair, idx) => {
      const globalIdx = offset + idx;
      const pairCard = UI.renderDupPair(pair, globalIdx, {
        onKeepA: () => resolvePair(currentProject, pair, 'a'),
        onKeepB: () => resolvePair(currentProject, pair, 'b'),
        onKeepBoth: () => resolvePair(currentProject, pair, 'both'),
        onIgnore: () => resolvePair(currentProject, pair, 'ignore'),
      });
      list.appendChild(pairCard);
    });

    if (total > pageSize) {
      const pag = document.createElement('div');
      pag.className = 'pagination';
      pag.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;margin:24px 0;';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn btn-ghost btn-sm';
      prevBtn.style.borderRadius = '9999px';
      prevBtn.textContent = '← Anterior';
      prevBtn.disabled = offset === 0;
      prevBtn.onclick = () => {
        state.dupOffset = Math.max(0, offset - pageSize);
        renderDupResults(currentProject);
        list.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      pag.appendChild(prevBtn);

      const info = document.createElement('span');
      info.style.cssText = 'font-size:0.84rem;color:var(--text-muted);font-weight:600;';
      info.textContent = `Página ${currentPage} de ${totalPages} (${total} pares)`;
      pag.appendChild(info);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-ghost btn-sm';
      nextBtn.style.borderRadius = '9999px';
      nextBtn.textContent = 'Próximo →';
      nextBtn.disabled = offset + pageSize >= total;
      nextBtn.onclick = () => {
        state.dupOffset = offset + pageSize;
        renderDupResults(currentProject);
        list.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      pag.appendChild(nextBtn);

      list.appendChild(pag);
    }
  }

  function resolvePair(project, pair, action) {
    const key = `${pair.articleA.id}_${pair.articleB.id}`;
    state.dupResolved.add(key);

    const updates = [];
    if (action === 'a') {
      updates.push({ id: pair.articleB.id, is_duplicate: true, duplicate_score: pair.score, duplicate_of: pair.articleA.id, decision: 'exclude', exclusion_reason: 'Duplicata' });
    } else if (action === 'b') {
      updates.push({ id: pair.articleA.id, is_duplicate: true, duplicate_score: pair.score, duplicate_of: pair.articleB.id, decision: 'exclude', exclusion_reason: 'Duplicata' });
    } else if (action === 'both') {
      updates.push({ id: pair.articleA.id, is_duplicate: false }, { id: pair.articleB.id, is_duplicate: false });
    }

    if (updates.length) {
      Storage.bulkUpdateArticles(project.id, updates);
    }

    const updatedProj = Storage.getProject(project.id);
    updateProjectNavHeader(updatedProj);
    UI.toast(action === 'ignore' ? 'Par ignorado' : (action === 'both' ? 'Ambos mantidos como únicos' : '✓ Duplicata descartada com sucesso!'), 'success');
    renderDupResults(updatedProj);
  }

  async function autoResolvePendingPairs(project, pairsToResolve, label) {
    const currentProject = Storage.getProject(project.id) || project;
    const duplicateArticleIds = new Set((currentProject.articles || []).filter(a => a.is_duplicate).map(a => a.id));
    
    // Pick only active pending pairs
    const activePairs = pairsToResolve.filter(p =>
      !duplicateArticleIds.has(p.articleA.id) &&
      !duplicateArticleIds.has(p.articleB.id) &&
      !state.dupResolved.has(`${p.articleA.id}_${p.articleB.id}`)
    );

    if (!activePairs.length) {
      UI.toast('Todos os pares selecionados já foram resolvidos anteriormente.', 'info');
      return;
    }

    UI.toast(`⚡ Resolvendo ${activePairs.length} duplicatas (${label})…`, 'info');
    await new Promise(r => setTimeout(r, 40));

    const updates = [];
    const markedDups = new Set();

    activePairs.forEach(pair => {
      const key = `${pair.articleA.id}_${pair.articleB.id}`;
      state.dupResolved.add(key);

      // Keep the one with longer abstract or valid DOI
      const lenA = (pair.articleA.abstract || '').length + (pair.articleA.doi ? 200 : 0);
      const lenB = (pair.articleB.abstract || '').length + (pair.articleB.doi ? 200 : 0);
      const keep = lenB > lenA ? pair.articleB : pair.articleA;
      const discard = lenB > lenA ? pair.articleA : pair.articleB;

      if (!markedDups.has(discard.id) && !duplicateArticleIds.has(discard.id)) {
        updates.push({
          id: discard.id,
          is_duplicate: true,
          duplicate_score: pair.score,
          duplicate_of: keep.id,
          decision: 'exclude',
          exclusion_reason: 'Duplicata'
        });
        markedDups.add(discard.id);
      }
    });

    if (updates.length) {
      Storage.bulkUpdateArticles(project.id, updates);
    }

    const updatedProj = Storage.getProject(project.id);
    updateProjectNavHeader(updatedProj);
    UI.toast(`✓ +${updates.length} novas duplicatas resolvidas com sucesso!`, 'success');
    renderDupResults(updatedProj);
  }

  async function applyAutoResolverPro(project, opts) {
    const { filePref, matchingPairs } = opts;
    const currentProject = Storage.getProject(project.id) || project;
    const duplicateArticleIds = new Set((currentProject.articles || []).filter(a => a.is_duplicate).map(a => a.id));

    // Ensure we only process pairs that are still pending
    const activePairs = matchingPairs.filter(p =>
      !duplicateArticleIds.has(p.articleA.id) &&
      !duplicateArticleIds.has(p.articleB.id)
    );

    if (!activePairs.length) {
      UI.toast('Nenhuma nova duplicata pendente nesta faixa.', 'info');
      return;
    }

    const updates = [];
    const markedDups = new Set();
    const totalPairs = activePairs.length;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '99999';
    overlay.innerHTML = `
      <div class="modal-dialog" style="max-width:440px;text-align:center;padding:32px 24px;border-radius:24px;background:rgba(22,16,44,0.95);border:1px solid rgba(168,85,247,0.3);box-shadow:0 12px 40px rgba(0,0,0,0.6);backdrop-filter:blur(20px);">
        <div class="spinner" style="width:40px;height:40px;border-width:3.5px;border-top-color:var(--purple);margin:0 auto 16px;"></div>
        <h3 style="margin:0 0 6px;font-size:1.15rem;color:var(--text-primary);font-weight:800;">⚡ Resolvendo Duplicatas</h3>
        <p style="font-size:0.84rem;color:var(--text-secondary);margin:0 0 16px;" id="auto-res-msg">Processando ${totalPairs} novos pares identificados…</p>
        <div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:9999px;overflow:hidden;">
          <div id="auto-res-bar" style="width:5%;height:100%;background:linear-gradient(90deg,var(--purple),#6366f1);transition:width 0.15s ease;"></div>
        </div>
        <small style="display:block;margin-top:12px;color:var(--text-muted);font-size:0.75rem;">Aguarde alguns instantes, o navegador continuará responsivo.</small>
      </div>
    `;
    document.body.appendChild(overlay);
    await new Promise(r => setTimeout(r, 40));

    const bar = document.getElementById('auto-res-bar');
    const msg = document.getElementById('auto-res-msg');

    const batchSize = 1000;
    for (let i = 0; i < totalPairs; i++) {
      const pair = activePairs[i];
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
        const lenA = (pair.articleA.abstract || '').length + (pair.articleA.doi ? 200 : 0);
        const lenB = (pair.articleB.abstract || '').length + (pair.articleB.doi ? 200 : 0);
        if (lenB > lenA) {
          keepArticle = pair.articleB;
          deleteArticle = pair.articleA;
        }
      }

      if (!markedDups.has(deleteArticle.id) && !duplicateArticleIds.has(deleteArticle.id)) {
        updates.push({
          id: deleteArticle.id,
          is_duplicate: true,
          duplicate_score: pair.score,
          duplicate_of: keepArticle.id,
          decision: 'exclude',
          exclusion_reason: 'Duplicata'
        });
        markedDups.add(deleteArticle.id);
      }
      if (i % batchSize === 0 && i > 0) {
        const pct = Math.round((i / totalPairs) * 100);
        if (bar) bar.style.width = `${pct}%`;
        if (msg) msg.textContent = `Resolvendo: ${i} de ${totalPairs} (${pct}%)…`;
        await new Promise(r => setTimeout(r, 0));
      }
    }

    if (bar) bar.style.width = '100%';
    if (msg) msg.textContent = `Gravando ${updates.length} novas duplicatas no banco local…`;
    await new Promise(r => setTimeout(r, 40));

    if (updates.length) {
      Storage.bulkUpdateArticles(project.id, updates);
    }
    overlay.remove();

    const updatedProj = Storage.getProject(project.id);
    updateProjectNavHeader(updatedProj);
    UI.toast(`✓ +${updates.length} novas duplicatas resolvidas com sucesso!`, 'success');
    renderDupResults(updatedProj);
  }

  function confirmResetDuplicates(project) {
    const duplicatesCount = (project.articles || []).filter(a => a.is_duplicate).length;
    if (!duplicatesCount) {
      UI.toast('Não há duplicatas para desfazer neste projeto.', 'info');
      return;
    }

    UI.modal(
      '🔄 Desfazer Todas as Duplicatas?',
      `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <p style="font-size:0.86rem;color:var(--text-secondary);margin:0;line-height:1.45;">
            Esta ação irá reverter todas as <strong>${duplicatesCount} duplicatas</strong> descartadas neste projeto de volta para a condição de artigos ativos.
          </p>
          <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);padding:12px 14px;border-radius:12px;font-size:0.82rem;color:#fca5a5;">
            ⚠️ Todos os artigos voltarão a ficar disponíveis para triagem e você poderá executar novas detecções de similaridade a qualquer momento.
          </div>
        </div>
      `,
      [
        { label: 'Cancelar', style: 'btn-ghost', cb: () => {} },
        {
          label: `Sim, Restaurar ${duplicatesCount} Duplicatas`,
          style: 'btn-danger',
          cb: () => {
            const res = Storage.resetProjectDuplicates(project.id);
            state.dupResolved = new Set();
            state.dupPairs = [];
            const updated = Storage.getProject(project.id);
            updateProjectNavHeader(updated);
            UI.toast(`✓ ${(res && res.count) || duplicatesCount} artigos duplicados foram restaurados com sucesso!`, 'success');
            renderDedupTab(updated);
          }
        }
      ]
    );
  }

  function renderDupTab(project) {
    state.tab = 'dedup';
    renderProjectTab(project);
    updateTabActive();
  }

  // ─── ARTICLES TAB (FASE 2: LEITURA INTEGRAL & SELEÇÃO DEFINITIVA) ───
  function renderArticlesTab(project, isFinalTab = false) {
    const content = $('tab-content');
    if (!content) return;

    state.thematicViewMode = state.thematicViewMode || 'trays';

    if (isFinalTab) {
      state.filter.decision = 'final_selected';
    } else {
      if (state.filter.decision === 'final_selected' || !state.filter.decision) {
        state.filter.decision = 'include';
      }
    }
    if (!state.filter.category) {
      state.filter.category = 'all';
    }

    const allArticles = project.articles || [];
    // Only process included articles in Phase 2/3 (never iterate all 25k+ articles)
    let includedArticles = allArticles.filter(a => a.decision === 'include' && !a.is_duplicate);

    // Automatic Categorization (Zero-Prompt):
    // Automatically classify any included articles that don't have categories yet
    const uncatArticles = includedArticles.filter(a => !(a.categories && a.categories.length > 0));
    if (uncatArticles.length > 0) {
      const catResult = SemanticCategorizer.classifyArticles(uncatArticles, project);
      if (catResult && catResult.updates && catResult.updates.length > 0) {
        Storage.bulkUpdateArticles(project.id, catResult.updates);
        const newCats = Array.from(new Set([...(project.categories || []), ...catResult.categories])).filter(Boolean);
        Storage.updateProject(project.id, { categories: newCats });
        project = Storage.getProject(project.id);
        const refreshedAll = project.articles || [];
        includedArticles = refreshedAll.filter(a => a.decision === 'include' && !a.is_duplicate);
      }
    }

    const finalSelectedArticles = includedArticles.filter(a => a.final_selection);
    const pendingFinalArticles = includedArticles.filter(a => !a.final_selection);

    // Collect active categories strictly from included articles and project settings
    const projectCategories = Array.from(new Set([
      ...(project.categories || []),
      ...includedArticles.flatMap(a => a.categories || [])
    ])).filter(Boolean);

    const currentContextArticles = isFinalTab ? finalSelectedArticles : includedArticles;
    const uncatCount = currentContextArticles.filter(a => !(a.categories && a.categories.length > 0)).length;

    // Filter active categories for display: only show those that have at least 1 study in current context
    const activeCategoriesWithCount = projectCategories.map(cat => {
      const count = currentContextArticles.filter(a => (a.categories || []).includes(cat)).length;
      return { name: cat, count };
    }).filter(c => c.count > 0);

    content.innerHTML = `
      <div class="articles-tab" style="display:flex;flex-direction:column;gap:12px;">
        
        <!-- Unified Stage HUD (Liquid Glass Minimalist Control Panel) -->
        <div class="stage-hud-wrapper">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <span style="display:inline-flex;align-items:center;gap:6px;background:${isFinalTab ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)'};color:${isFinalTab ? '#fbbf24' : '#4ade80'};border:1px solid ${isFinalTab ? 'rgba(245,158,11,0.35)' : 'rgba(34,197,94,0.35)'};padding:3px 12px;border-radius:9999px;font-size:0.72rem;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">
                ${isFinalTab ? '⭐ Fase 3 · Síntese Definitiva' : '📋 Fase 2 · Elegibilidade PRISMA'}
              </span>
              <h2 style="margin:0;font-size:1.05rem;font-weight:800;color:var(--text-primary);letter-spacing:-0.01em;">
                ${isFinalTab ? `Seleção Final da Revisão (${finalSelectedArticles.length})` : `Elegibilidade & Leitura Integral (${includedArticles.length})`}
              </h2>
              <span style="font-size:0.78rem;color:var(--text-muted);">
                ${isFinalTab ? '· Estudos confirmados para meta-análise, síntese e redação' : '· Avalie o texto completo e confirme com ⭐ os estudos que entram na Seleção Final'}
              </span>
            </div>

            <!-- Quick Navigation Actions -->
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              ${isFinalTab ? `
                <button class="btn btn-sm btn-ghost" id="art-switch-to-incl-btn" style="border-radius:9999px;border:1px solid rgba(255,255,255,0.18);font-size:0.75rem;padding:5px 14px;color:var(--text-secondary);">
                  ← Ver Todos os Incluídos (${includedArticles.length})
                </button>
                <button class="btn btn-sm btn-ghost" id="art-go-prisma-btn" style="border-radius:9999px;border:1px solid rgba(168,85,247,0.35);font-size:0.75rem;padding:5px 14px;color:#c084fc;background:rgba(168,85,247,0.08);">
                  📐 Ver no PRISMA
                </button>
                <button class="btn btn-sm btn-primary" id="art-go-export-btn" style="border-radius:9999px;background:linear-gradient(135deg,#a855f7,#6366f1);border:none;font-size:0.75rem;font-weight:700;padding:5px 14px;color:#fff;box-shadow:0 2px 10px rgba(168,85,247,0.3);">
                  💾 Exportar Síntese
                </button>
              ` : `
                <button class="btn btn-sm btn-ghost" id="art-go-screen-btn" style="border-radius:9999px;border:1px solid rgba(255,255,255,0.15);font-size:0.75rem;padding:5px 14px;color:var(--text-secondary);">
                  🔍 Ir para Triagem
                </button>
                ${finalSelectedArticles.length > 0 ? `
                  <button class="btn btn-sm btn-primary" id="art-switch-to-final-btn" style="border-radius:9999px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#fff;font-weight:700;font-size:0.75rem;padding:5px 16px;box-shadow:0 2px 10px rgba(245,158,11,0.35);">
                    ⭐ Ver Seleção Final (${finalSelectedArticles.length}) →
                  </button>
                ` : ''}
              `}
            </div>
          </div>

          <!-- Compact Interactive Metrics Strip -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
            ${isFinalTab ? `
              <div class="stage-metric-pill active" style="background:rgba(245,158,11,0.15);border-color:#f59e0b;">
                <span>⭐</span>
                <span style="font-weight:800;color:#f59e0b;">${finalSelectedArticles.length}</span>
                <span style="color:#fff;">Estudos Definitivos Selecionados</span>
              </div>
              <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.04);border:1px solid rgba(168,85,247,0.25);border-radius:9999px;padding:4px 14px;font-size:0.76rem;">
                <span>🏷️</span>
                <span style="font-weight:800;color:#c084fc;">${activeCategoriesWithCount.length}</span>
                <span style="color:var(--text-muted);">Temas Representados</span>
              </div>
            ` : `
              <div class="stage-metric-pill ${state.filter.decision === 'include' ? 'active' : ''}" data-metric-decision="include" style="${state.filter.decision === 'include' ? 'background:rgba(34,197,94,0.18);border-color:#22c55e;' : ''}">
                <span>📋</span>
                <span style="font-weight:800;color:var(--green);">${includedArticles.length}</span>
                <span style="color:${state.filter.decision === 'include' ? '#fff' : 'var(--text-muted)'};">Todos Elegíveis</span>
              </div>
              <div class="stage-metric-pill ${state.filter.decision === 'pending_final' ? 'active' : ''}" data-metric-decision="pending_final" style="${state.filter.decision === 'pending_final' ? 'background:rgba(168,85,247,0.18);border-color:#a855f7;' : ''}">
                <span>⏳</span>
                <span style="font-weight:800;color:var(--text-primary);">${pendingFinalArticles.length}</span>
                <span style="color:${state.filter.decision === 'pending_final' ? '#fff' : 'var(--text-muted)'};">Aguardando Avaliação</span>
              </div>
              <div class="stage-metric-pill ${state.filter.decision === 'final_selected' ? 'active' : ''}" data-metric-decision="final_selected" style="${state.filter.decision === 'final_selected' ? 'background:rgba(245,158,11,0.18);border-color:#f59e0b;' : ''}">
                <span>⭐</span>
                <span style="font-weight:800;color:#f59e0b;">${finalSelectedArticles.length}</span>
                <span style="color:${state.filter.decision === 'final_selected' ? '#fff' : 'var(--text-muted)'};">Já na Seleção Final</span>
              </div>
              <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.04);border:1px solid rgba(168,85,247,0.25);border-radius:9999px;padding:4px 14px;font-size:0.76rem;">
                <span>🏷️</span>
                <span style="font-weight:800;color:#c084fc;">${activeCategoriesWithCount.length}</span>
                <span style="color:var(--text-muted);">Temas de Pesquisa</span>
              </div>
            `}
          </div>
        </div>

        <!-- Thematic Chips Rail (Single Horizontal Row, Smooth Scroll) -->
        <div class="thematic-chip-bar">
          <button type="button" class="thematic-chip-item ${state.filter.category === 'all' ? 'active' : ''}" data-chip-cat="all">
            🌟 Todos <span class="chip-counter">${currentContextArticles.length}</span>
          </button>
          ${activeCategoriesWithCount.map(c => `
            <button type="button" class="thematic-chip-item ${state.filter.category === c.name ? 'active' : ''}" data-chip-cat="${escapeHtml(c.name)}">
              🏷️ ${escapeHtml(c.name)} <span class="chip-counter">${c.count}</span>
            </button>
          `).join('')}
          ${uncatCount > 0 ? `
            <button type="button" class="thematic-chip-item ${state.filter.category === '__uncat__' ? 'active' : ''}" data-chip-cat="__uncat__">
              📂 Sem Tema <span class="chip-counter">${uncatCount}</span>
            </button>
          ` : ''}
          <button type="button" class="thematic-chip-item" id="art-chip-auto-cat-btn"
            style="background:linear-gradient(135deg,rgba(168,85,247,0.2),rgba(99,102,241,0.2));border:1px solid rgba(168,85,247,0.4);color:#d8b4fe;"
            title="Classificar estudos automaticamente por inteligência semântica e temas de pesquisa">
            ✨ ${activeCategoriesWithCount.length === 0 ? 'Auto-Categorizar' : 'Re-Categorizar'}
          </button>
          <button type="button" class="thematic-chip-item" id="art-chip-add-cat-btn"
            style="border-style:dashed;color:var(--text-muted);"
            title="Adicionar categoria temática manualmente">
            + Novo Tema
          </button>
        </div>

        <!-- Filter & View Controls Bar (Single Unified Liquid Glass Capsule) -->
        <div class="articles-filters" style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:rgba(22,14,44,0.7);border:1px solid rgba(168,85,247,0.2);border-radius:9999px;backdrop-filter:blur(16px);box-shadow:0 4px 20px rgba(0,0,0,0.25);flex-wrap:wrap;">
          
          <!-- View Switcher -->
          <div class="thematic-view-switcher" style="display:inline-flex;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:9999px;padding:2px;gap:2px;flex-shrink:0;">
            <button type="button" class="thematic-view-btn ${state.thematicViewMode !== 'list' ? 'active' : ''}" id="view-trays-btn"
              style="background:${state.thematicViewMode !== 'list' ? 'linear-gradient(135deg,rgba(168,85,247,0.35),rgba(99,102,241,0.35))' : 'transparent'};border:none;color:${state.thematicViewMode !== 'list' ? '#fff' : 'var(--text-muted)'};font-size:0.75rem;font-weight:700;padding:5px 12px;border-radius:9999px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">
              <span>🗂️</span> Temas
            </button>
            <button type="button" class="thematic-view-btn ${state.thematicViewMode === 'list' ? 'active' : ''}" id="view-list-btn"
              style="background:${state.thematicViewMode === 'list' ? 'linear-gradient(135deg,rgba(168,85,247,0.35),rgba(99,102,241,0.35))' : 'transparent'};border:none;color:${state.thematicViewMode === 'list' ? '#fff' : 'var(--text-muted)'};font-size:0.75rem;font-weight:700;padding:5px 12px;border-radius:9999px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">
              <span>📄</span> Lista
            </button>
          </div>

          <!-- Quick Search with Instant Debounce -->
          <div style="position:relative;flex:1 1 180px;min-width:140px;">
            <input id="art-search" class="input input-sm" style="width:100%;padding-left:30px;border-radius:9999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);font-size:0.78rem;color:#fff;height:32px;" placeholder="${isFinalTab ? 'Buscar nos estudos selecionados…' : 'Buscar nos estudos incluídos…'}" value="${escapeHtml(state.filter.search || '')}"/>
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:0.8rem;color:var(--text-muted);pointer-events:none;">🔍</span>
          </div>

          ${!isFinalTab ? `
            <!-- Status Filter (Only shown in Incluídos tab) -->
            <select id="art-decision-filter" class="input input-sm select" style="width:auto;min-width:140px;max-width:210px;border-radius:9999px;background:rgba(22,14,44,0.9);border:1px solid rgba(255,255,255,0.12);font-size:0.76rem;color:#e2e8f0;height:32px;flex-shrink:0;">
              <option value="include" ${state.filter.decision === 'include' ? 'selected' : ''}>📋 Todos Elegíveis (${includedArticles.length})</option>
              <option value="pending_final" ${state.filter.decision === 'pending_final' ? 'selected' : ''}>⏳ Aguardando Decisão (${pendingFinalArticles.length})</option>
              <option value="final_selected" ${state.filter.decision === 'final_selected' ? 'selected' : ''}>⭐ Confirmados na Seleção Final (${finalSelectedArticles.length})</option>
            </select>
          ` : ''}

          <!-- Sort (Auto-triggers on change) -->
          <select id="art-sort" class="input input-sm select" style="width:auto;min-width:120px;max-width:160px;border-radius:9999px;background:rgba(22,14,44,0.9);border:1px solid rgba(255,255,255,0.12);font-size:0.76rem;color:#e2e8f0;height:32px;flex-shrink:0;">
            <option value="relevance" ${(!state.artSort || state.artSort === 'relevance') ? 'selected' : ''}>Relevância</option>
            <option value="year-desc" ${state.artSort === 'year-desc' ? 'selected' : ''}>Ano (recente)</option>
            <option value="year-asc" ${state.artSort === 'year-asc' ? 'selected' : ''}>Ano (antigo)</option>
            <option value="title" ${state.artSort === 'title' ? 'selected' : ''}>Título A–Z</option>
          </select>

        </div>

        <div id="articles-list"></div>
        <div id="articles-pagination" class="pagination"></div>
      </div>
    `;

    // Bind event handlers
    $('art-go-screen-btn')?.addEventListener('click', () => {
      state.tab = 'screen';
      renderProjectTab(project);
      updateTabActive();
    });

    $('art-go-prisma-btn')?.addEventListener('click', () => {
      state.tab = 'prisma';
      renderProjectTab(project);
      updateTabActive();
    });

    $('art-go-export-btn')?.addEventListener('click', () => {
      state.tab = 'export';
      renderProjectTab(project);
      updateTabActive();
    });

    $('art-switch-to-final-btn')?.addEventListener('click', () => {
      state.tab = 'final';
      state.filter.decision = 'final_selected';
      state.filter.category = 'all';
      state.articleOffset = 0;
      renderProjectTab(project);
      updateTabActive();
    });

    $('art-switch-to-incl-btn')?.addEventListener('click', () => {
      state.tab = 'articles';
      state.filter.decision = 'include';
      state.filter.category = 'all';
      state.articleOffset = 0;
      renderProjectTab(project);
      updateTabActive();
    });

    $('art-chip-add-cat-btn')?.addEventListener('click', () => {
      showCategoryModal(project, null);
    });

    $('art-chip-auto-cat-btn')?.addEventListener('click', () => {
      autoCategorizeArticles(project);
    });

    $('art-prompt-auto-cat-btn')?.addEventListener('click', () => {
      autoCategorizeArticles(project);
    });

    $('view-trays-btn')?.addEventListener('click', () => {
      state.thematicViewMode = 'trays';
      renderArticlesTab(project, isFinalTab);
    });

    $('view-list-btn')?.addEventListener('click', () => {
      state.thematicViewMode = 'list';
      renderArticlesTab(project, isFinalTab);
    });

    // Metric pills click -> filter directly
    content.querySelectorAll('.stage-metric-pill[data-metric-decision]').forEach(pill => {
      pill.addEventListener('click', () => {
        state.filter.decision = pill.dataset.metricDecision;
        state.articleOffset = 0;
        const sel = $('art-decision-filter');
        if (sel) sel.value = state.filter.decision;
        renderArticlesList(Storage.getProject(state.projectId), isFinalTab);
        content.querySelectorAll('.stage-metric-pill[data-metric-decision]').forEach(p => {
          const isActive = p.dataset.metricDecision === state.filter.decision;
          p.style.background = isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
        });
      });
    });

    // Chips click binding
    content.querySelectorAll('.thematic-chip-item[data-chip-cat]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.filter.category = chip.dataset.chipCat;
        state.articleOffset = 0;
        renderArticlesTab(project, isFinalTab);
      });
    });

    // Debounced search on typing
    let searchDebounceTimer = null;
    $('art-search')?.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.filter.search = e.target.value.trim();
        state.articleOffset = 0;
        renderArticlesList(Storage.getProject(state.projectId), isFinalTab);
      }, 200);
    });
    $('art-search')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(searchDebounceTimer);
        state.filter.search = e.target.value.trim();
        state.articleOffset = 0;
        renderArticlesList(Storage.getProject(state.projectId), isFinalTab);
      }
    });

    // Decision dropdown change
    $('art-decision-filter')?.addEventListener('change', (e) => {
      state.filter.decision = e.target.value;
      state.articleOffset = 0;
      renderArticlesList(Storage.getProject(state.projectId), isFinalTab);
    });

    // Sort change
    $('art-sort')?.addEventListener('change', (e) => {
      state.artSort = e.target.value;
      renderArticlesList(Storage.getProject(state.projectId), isFinalTab);
    });

    renderArticlesList(project, isFinalTab);
  }

  function renderArticlesList(project, isFinalTab = false) {
    const list = $('articles-list');
    const pag = $('articles-pagination');
    if (!list) return;

    const allArticles = project.articles || [];

    // CRITICAL: In Phase 2 & 3, ONLY ever process articles with decision === 'include'
    // This strictly prevents ever iterating or dumping 25k+ articles and freezing the browser.
    let articles;
    if (isFinalTab || state.filter.decision === 'final_selected') {
      articles = allArticles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection);
    } else if (state.filter.decision === 'pending_final') {
      articles = allArticles.filter(a => a.decision === 'include' && !a.is_duplicate && !a.final_selection);
    } else {
      articles = allArticles.filter(a => a.decision === 'include' && !a.is_duplicate);
    }

    // Text search filter
    const q = (state.filter.search || '').toLowerCase();
    if (q) {
      articles = articles.filter(a =>
        (a.title || '').toLowerCase().includes(q) ||
        (a.abstract || '').toLowerCase().includes(q) ||
        (a.authors || []).some(auth => auth.toLowerCase().includes(q)) ||
        (a.categories || []).some(cat => cat.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (state.filter.category && state.filter.category !== 'all') {
      if (state.filter.category === '__uncat__') {
        articles = articles.filter(a => !(a.categories && a.categories.length > 0));
      } else {
        articles = articles.filter(a => (a.categories || []).includes(state.filter.category));
      }
    }

    // Sort
    const sort = state.artSort || $('art-sort')?.value || 'relevance';
    if (sort === 'relevance') articles.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    else if (sort === 'year-desc') articles.sort((a, b) => (b.year || '').localeCompare(a.year || ''));
    else if (sort === 'year-asc') articles.sort((a, b) => (a.year || '').localeCompare(b.year || ''));
    else if (sort === 'title') articles.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR'));

    if (!articles.length) {
      list.innerHTML = UI.emptyState(
        isFinalTab ? '⭐' : '📋',
        isFinalTab ? 'Nenhum estudo na Seleção Final ainda' : 'Nenhum estudo encontrado com os filtros atuais',
        isFinalTab
          ? 'Nenhum artigo foi marcado com <strong>Seleção Definitiva (⭐)</strong> ainda. Na aba <strong>Incluídos</strong>, clique na estrela do artigo para elegê-lo à síntese.'
          : 'Ajuste os filtros de busca ou categorize os artigos aprovados.'
      );
      if (pag) pag.innerHTML = '';
      return;
    }

    // ─── THEMATIC TRAYS VIEW (AGRUPADO POR TEMAS) ───────────
    if (state.thematicViewMode !== 'list') {
      if (pag) pag.innerHTML = '';
      list.innerHTML = '';

      // Only trays for categories that have matching articles in current filtered set
      const projectCategories = Array.from(new Set([
        ...(project.categories || []),
        ...articles.flatMap(a => a.categories || [])
      ])).filter(Boolean);

      const catsToShow = (state.filter.category && state.filter.category !== 'all' && state.filter.category !== '__uncat__')
        ? [state.filter.category]
        : projectCategories;

      let renderedTrays = 0;

      catsToShow.forEach(cat => {
        const catArticles = articles.filter(a => (a.categories || []).includes(cat));
        if (!catArticles.length) return;

        renderedTrays++;
        const finalCount = catArticles.filter(a => a.final_selection).length;
        const tray = document.createElement('div');
        tray.className = 'thematic-category-tray';
        tray.id = `tray-${escapeHtml(cat).replace(/\s+/g, '-').toLowerCase()}`;

        tray.innerHTML = `
          <div class="tray-header">
            <div class="tray-title-wrap">
              <span style="font-size:1.35rem;">🏷️</span>
              <span class="tray-title">${escapeHtml(cat)}</span>
              <span class="tray-badge-count">${catArticles.length} estudo${catArticles.length !== 1 ? 's' : ''}</span>
              <span class="tray-badge-final">⭐ ${finalCount} final</span>
            </div>
            <div class="tray-actions">
              ${!isFinalTab && finalCount < catArticles.length ? `
                <button type="button" class="btn btn-sm btn-ghost select-all-theme-btn" data-theme="${escapeHtml(cat)}" style="border-radius:9999px;font-size:0.75rem;font-weight:700;color:#f59e0b;border:1px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.06);" title="Selecionar todos os estudos deste tema para a síntese final">
                  ⭐ Selecionar Todos
                </button>
              ` : ''}
              <button type="button" class="btn btn-sm btn-ghost toggle-tray-btn" title="Expandir ou recolher este tema">
                <span class="tray-chevron" style="font-size:0.8rem;transition:transform 0.2s;">▼</span>
              </button>
            </div>
          </div>
          <div class="tray-body"></div>
        `;

        const trayBody = tray.querySelector('.tray-body');
        const INITIAL_LIMIT = 20;
        let renderedCount = 0;

        function appendCards(limit) {
          const slice = catArticles.slice(renderedCount, renderedCount + limit);
          slice.forEach(article => {
            const card = UI.renderArticleCard(article, project.keywords, {
              isIncludedTab: true,
              isFinalTab: isFinalTab,
              onInclude: () => makeDecision(project.id, article.id, 'include'),
              onExclude: () => showFullTextExcludeModal(project, article),
              onMaybe:   () => makeDecision(project.id, article.id, 'maybe'),
              onNote:    () => showNoteModal(project.id, article),
              onDelete:  () => {},
              onToggleFinalSelection: () => toggleFinalSelection(project, article),
              onCategories: () => showCategoryModal(project, article),
              onFullTextExclude: () => showFullTextExcludeModal(project, article)
            });
            trayBody.appendChild(card);
          });
          renderedCount += slice.length;

          const oldBtn = tray.querySelector('.expand-more-tray-btn');
          if (oldBtn) oldBtn.remove();

          if (renderedCount < catArticles.length) {
            const remaining = catArticles.length - renderedCount;
            const moreBtn = document.createElement('button');
            moreBtn.className = 'btn btn-sm btn-ghost expand-more-tray-btn';
            moreBtn.style.cssText = 'align-self:center;margin:12px auto 6px;border-radius:9999px;border:1px solid rgba(168,85,247,0.35);color:#c084fc;font-size:0.78rem;font-weight:700;padding:6px 18px;background:rgba(168,85,247,0.08);cursor:pointer;';
            moreBtn.textContent = `Mostrar mais estudos (+${Math.min(25, remaining)}) · ${renderedCount} de ${catArticles.length}`;
            moreBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              appendCards(25);
            });
            trayBody.appendChild(moreBtn);
          }
        }

        appendCards(INITIAL_LIMIT);

        // Header click toggles collapse
        const header = tray.querySelector('.tray-header');
        const chevron = tray.querySelector('.tray-chevron');
        header.addEventListener('click', (e) => {
          if (e.target.closest('.select-all-theme-btn')) return;
          const isCollapsed = trayBody.classList.toggle('collapsed');
          chevron.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        });

        // Select all button
        const selAllBtn = tray.querySelector('.select-all-theme-btn');
        if (selAllBtn) {
          selAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAllInTheme(project, cat);
          });
        }

        list.appendChild(tray);
      });

      // Tray for Uncategorized Articles
      if (state.filter.category === 'all' || state.filter.category === '__uncat__') {
        const uncatArticles = articles.filter(a => !(a.categories && a.categories.length > 0));
        if (uncatArticles.length > 0) {
          renderedTrays++;
          const finalCount = uncatArticles.filter(a => a.final_selection).length;
          const uncatTray = document.createElement('div');
          uncatTray.className = 'thematic-category-tray uncategorized';

          uncatTray.innerHTML = `
            <div class="tray-header" style="background:linear-gradient(90deg,rgba(255,255,255,0.06),transparent);">
              <div class="tray-title-wrap">
                <span style="font-size:1.35rem;">📂</span>
                <span class="tray-title">Geral / Aguardando Tema</span>
                <span class="tray-badge-count" style="background:rgba(255,255,255,0.08);color:var(--text-secondary);border-color:rgba(255,255,255,0.15);">${uncatArticles.length} estudos</span>
                <span class="tray-badge-final">⭐ ${finalCount} final</span>
              </div>
              <div class="tray-actions">
                <button type="button" class="btn btn-sm btn-ghost trigger-auto-cat-btn" style="border-radius:9999px;font-size:0.75rem;font-weight:700;color:#c084fc;border:1px solid rgba(168,85,247,0.4);background:rgba(168,85,247,0.08);" title="Auto-categorizar estudos analisando termos de títulos e resumos">
                  ✨ Auto-Categorizar
                </button>
                <button type="button" class="btn btn-sm btn-ghost toggle-tray-btn">
                  <span class="tray-chevron" style="font-size:0.8rem;transition:transform 0.2s;">▼</span>
                </button>
              </div>
            </div>
            <div class="tray-body">
              <div style="font-size:0.82rem;color:var(--text-muted);padding:8px 12px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.12);border-radius:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span>💡 Estes estudos foram aprovados na triagem, mas ainda não possuem temas atribuídos. Use a <strong>Auto-Categorização</strong> para organizá-los.</span>
              </div>
            </div>
          `;

          const uncatBody = uncatTray.querySelector('.tray-body');
          const INITIAL_LIMIT = 20;
          let renderedCount = 0;

          function appendUncatCards(limit) {
            const slice = uncatArticles.slice(renderedCount, renderedCount + limit);
            slice.forEach(article => {
              const card = UI.renderArticleCard(article, project.keywords, {
                isIncludedTab: true,
                isFinalTab: isFinalTab,
                onInclude: () => makeDecision(project.id, article.id, 'include'),
                onExclude: () => showFullTextExcludeModal(project, article),
                onMaybe:   () => makeDecision(project.id, article.id, 'maybe'),
                onNote:    () => showNoteModal(project.id, article),
                onDelete:  () => {},
                onToggleFinalSelection: () => toggleFinalSelection(project, article),
                onCategories: () => showCategoryModal(project, article),
                onFullTextExclude: () => showFullTextExcludeModal(project, article)
              });
              uncatBody.appendChild(card);
            });
            renderedCount += slice.length;

            const oldBtn = uncatTray.querySelector('.expand-more-tray-btn');
            if (oldBtn) oldBtn.remove();

            if (renderedCount < uncatArticles.length) {
              const remaining = uncatArticles.length - renderedCount;
              const moreBtn = document.createElement('button');
              moreBtn.className = 'btn btn-sm btn-ghost expand-more-tray-btn';
              moreBtn.style.cssText = 'align-self:center;margin:12px auto 6px;border-radius:9999px;border:1px solid rgba(255,255,255,0.25);color:var(--text-secondary);font-size:0.78rem;font-weight:700;padding:6px 18px;background:rgba(255,255,255,0.05);cursor:pointer;';
              moreBtn.textContent = `Mostrar mais estudos (+${Math.min(25, remaining)}) · ${renderedCount} de ${uncatArticles.length}`;
              moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                appendUncatCards(25);
              });
              uncatBody.appendChild(moreBtn);
            }
          }

          appendUncatCards(INITIAL_LIMIT);

          const header = uncatTray.querySelector('.tray-header');
          const chevron = uncatTray.querySelector('.tray-chevron');
          header.addEventListener('click', (e) => {
            if (e.target.closest('.trigger-auto-cat-btn')) return;
            const isCollapsed = uncatBody.classList.toggle('collapsed');
            chevron.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
          });

          uncatTray.querySelector('.trigger-auto-cat-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            autoCategorizeArticles(project);
          });

          list.appendChild(uncatTray);
        }
      }

      if (renderedTrays === 0) {
        list.innerHTML = UI.emptyState('🏷️', 'Nenhum artigo nesta categoria', 'Selecione outra categoria ou clique em "Todos".');
      }
      return;
    }

    // ─── SIMPLE LIST VIEW (LISTA SIMPLES CORRIDA) ─────────────
    const pageSize = state.articlePageSize || 20;
    const total = articles.length;
    const offset = Math.min(state.articleOffset || 0, Math.max(0, total - 1));
    const pageArticles = articles.slice(offset, offset + pageSize);

    list.innerHTML = '';
    const fragment = document.createDocumentFragment();
    pageArticles.forEach(article => {
      const card = UI.renderArticleCard(article, project.keywords, {
        isIncludedTab: true,
        isFinalTab: isFinalTab,
        onInclude: () => makeDecision(project.id, article.id, 'include'),
        onExclude: () => showFullTextExcludeModal(project, article),
        onMaybe:   () => makeDecision(project.id, article.id, 'maybe'),
        onNote:    () => showNoteModal(project.id, article),
        onDelete:  () => {},
        onToggleFinalSelection: () => toggleFinalSelection(project, article),
        onCategories: () => showCategoryModal(project, article),
        onFullTextExclude: () => showFullTextExcludeModal(project, article)
      });
      fragment.appendChild(card);
    });
    list.appendChild(fragment);

    // Pagination
    if (pag) {
      if (total <= pageSize) {
        pag.innerHTML = '';
      } else {
        pag.innerHTML = UI.renderPagination(total, offset, pageSize);
        pag.querySelectorAll('[data-offset]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.articleOffset = parseInt(btn.dataset.offset, 10);
            renderArticlesList(project, isFinalTab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
        });
      }
    }
  }

  function selectAllInTheme(project, categoryName) {
    const articles = (project.articles || []).filter(a =>
      a.decision === 'include' && !a.is_duplicate && (a.categories || []).includes(categoryName)
    );
    if (!articles.length) return;

    const updates = [];
    articles.forEach(a => {
      if (!a.final_selection) {
        updates.push({ id: a.id, final_selection: true, decision: 'include' });
        a.final_selection = true;
      }
    });

    if (updates.length) {
      Storage.bulkUpdateArticles(project.id, updates);
    }

    UI.toast(`⭐ Todos os ${articles.length} estudos de "${categoryName}" foram adicionados à Seleção Final!`, 'success');
    updateProjectNavHeader(Storage.getProject(project.id));
    renderArticlesTab(Storage.getProject(project.id), state.tab === 'final');
  }

  // ─── SEMANTIC CATEGORIZATION ENGINE & TAXONOMY ───────────
  const SemanticCategorizer = {
    TAXONOMIES: [
      {
        domain: 'violencia',
        categories: [
          {
            name: 'Violência Doméstica & Familiar',
            keywords: [
              'violencia domestica', 'violência doméstica', 'intrafamiliar', 'conjugal',
              'parceiro intimo', 'parceiro íntimo', 'familiar', 'violencia contra a mulher',
              'violência contra a mulher', 'feminicidio', 'feminicídio', 'abuso domestico',
              'abuso doméstico', 'abuso infantil', 'maus-tratos', 'domestic violence',
              'intimate partner violence', 'ipv', 'family violence', 'child abuse', 'spousal abuse'
            ]
          },
          {
            name: 'Violência Escolar & Bullying',
            keywords: [
              'violencia escolar', 'violência escolar', 'bullying', 'escola', 'escolar',
              'ambiente escolar', 'cyberbullying', 'assedio escolar', 'assédio escolar',
              'vitimizacao entre pares', 'vitimização entre pares', 'estudantes',
              'adolescentes na escola', 'school violence', 'peer victimization',
              'bullying victimization', 'school environment', 'school bullying'
            ]
          },
          {
            name: 'Violência Virtual & Redes Sociais',
            keywords: [
              'violencia virtual', 'violência virtual', 'cibernetica', 'cibernética',
              'cyberbullying', 'redes sociais', 'internet', 'online', 'midias sociais',
              'mídias sociais', 'assedio virtual', 'assédio virtual', 'ciberespaco',
              'ciberespaço', 'cyber violence', 'online harassment', 'cyber harassment',
              'social media violence', 'digital violence', 'cyberaggression'
            ]
          },
          {
            name: 'Linchamento & Violência Urbana',
            keywords: [
              'linchamento', 'linchamentos', 'violencia urbana', 'violência urbana',
              'comunitaria', 'comunitária', 'homicidio', 'homicídio', 'criminalidade',
              'violencia armada', 'violência armada', 'gangues', 'seguranca publica',
              'segurança pública', 'espaco publico', 'espaço público', 'lynching',
              'mob violence', 'urban violence', 'community violence', 'gun violence',
              'homicide', 'street crime', 'collective violence'
            ]
          },
          {
            name: 'Violência Sexual & de Gênero',
            keywords: [
              'violencia sexual', 'violência sexual', 'estupro', 'assedio sexual',
              'assédio sexual', 'abuso sexual', 'violencia de genero', 'violência de gênero',
              'lgbtfobia', 'homofobia', 'transfobia', 'sexual violence', 'sexual assault',
              'sexual abuse', 'gender-based violence', 'gbv', 'rape'
            ]
          },
          {
            name: 'Violência no Trabalho & Laboral',
            keywords: [
              'violencia no trabalho', 'violência no trabalho', 'assedio moral',
              'assédio moral', 'violencia institucional', 'violência institucional',
              'violencia laboral', 'violência laboral', 'ambiente corporativo',
              'ambiente de trabalho', 'workplace violence', 'institutional violence',
              'workplace harassment', 'mobbing'
            ]
          },
          {
            name: 'Saúde Mental & Impacto Psicológico',
            keywords: [
              'saude mental', 'saúde mental', 'psicologica', 'psicológica', 'trauma',
              'depressao', 'depressão', 'ansiedade', 'estresse pos-traumatico',
              'estresse pós-traumático', 'tept', 'suicidio', 'suicídio', 'sofrimento psiquico',
              'sofrimento psíquico', 'mental health', 'ptsd', 'depression', 'anxiety',
              'psychological trauma', 'psychological impact'
            ]
          },
          {
            name: 'Políticas Públicas & Intervenções',
            keywords: [
              'politicas publicas', 'políticas públicas', 'legislacao', 'legislação',
              'lei maria da penha', 'intervencao', 'intervenção', 'prevencao', 'prevenção',
              'acolhimento', 'servico social', 'serviço social', 'medidas protetivas',
              'public policy', 'intervention', 'prevention', 'protective measures', 'social support'
            ]
          }
        ]
      },
      {
        domain: 'saude',
        categories: [
          {
            name: 'Diagnóstico & Rastreamento Clínico',
            keywords: [
              'diagnostico', 'diagnóstico', 'triagem clinica', 'triagem clínica', 'sensibilidade',
              'especificidade', 'biomarcador', 'exame', 'diagnosis', 'screening', 'biomarker'
            ]
          },
          {
            name: 'Tratamento & Farmacoterapia',
            keywords: [
              'tratamento', 'terapia', 'medicamento', 'farmaco', 'fármaco', 'dosagem',
              'placebo', 'ensaio clinico', 'ensaio clínico', 'treatment', 'therapy', 'clinical trial'
            ]
          },
          {
            name: 'Epidemiologia & Fatores de Risco',
            keywords: [
              'epidemiologia', 'prevalencia', 'prevalência', 'incidencia', 'incidência',
              'fator de risco', 'fatores de risco', 'morbidade', 'mortalidade', 'epidemiology',
              'risk factors', 'prevalence'
            ]
          },
          {
            name: 'Qualidade de Vida & Reabilitação',
            keywords: [
              'qualidade de vida', 'reabilitacao', 'reabilitação', 'cuidados paliativos',
              'desfecho funcional', 'sobrevivencia', 'sobrevivência', 'quality of life', 'rehabilitation'
            ]
          }
        ]
      },
      {
        domain: 'educacao',
        categories: [
          {
            name: 'Metodologias Ativas & Práticas de Ensino',
            keywords: [
              'ensino', 'aprendizagem', 'pedagogia', 'didatica', 'didática', 'metodologia ativa',
              'sala de aula', 'teaching', 'learning', 'pedagogical practices'
            ]
          },
          {
            name: 'Tecnologias Educacionais & EAD',
            keywords: [
              'tecnologia educacional', 'ensino a distancia', 'ensino a distância', 'ead',
              'gamificacao', 'gamificação', 'plataforma digital', 'e-learning', 'digital learning'
            ]
          },
          {
            name: 'Inclusão Escolar & Acessibilidade',
            keywords: [
              'inclusao', 'inclusão', 'educacao especial', 'educação especial', 'acessibilidade',
              'necessidades especiais', 'inclusive education', 'special needs'
            ]
          }
        ]
      },
      {
        domain: 'tecnologia',
        categories: [
          {
            name: 'Inteligência Artificial & Machine Learning',
            keywords: [
              'inteligencia artificial', 'inteligência artificial', 'machine learning',
              'aprendizado de maquina', 'aprendizado de máquina', 'deep learning',
              'redes neurais', 'nlp', 'processamento de linguagem natural'
            ]
          },
          {
            name: 'Segurança & Privacidade Digital',
            keywords: [
              'seguranca', 'segurança', 'ciberseguranca', 'cibersegurança', 'privacidade',
              'criptografia', 'lgpd', 'vulnerabilidade', 'cybersecurity', 'data privacy'
            ]
          },
          {
            name: 'Experiência do Usuário & Interfaces (UX)',
            keywords: [
              'usabilidade', 'experiencia do usuario', 'experiência do usuário', 'ux', 'ui',
              'interface', 'acessibilidade digital', 'usability', 'user experience'
            ]
          }
        ]
      }
    ],

    normalize(txt) {
      if (!txt) return '';
      return String(txt)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    },

    classifyArticles(articles, project = null) {
      const allCats = [];
      this.TAXONOMIES.forEach(t => {
        t.categories.forEach(c => {
          allCats.push({
            name: c.name,
            keywords: c.keywords.map(k => this.normalize(k))
          });
        });
      });

      if (project && Array.isArray(project.categories)) {
        project.categories.forEach(catName => {
          if (!allCats.some(c => c.name.toLowerCase() === catName.toLowerCase())) {
            const normName = this.normalize(catName);
            const tokens = normName.split(/\s+/).filter(w => w.length > 3);
            allCats.push({
              name: catName,
              keywords: [normName, ...tokens]
            });
          }
        });
      }

      const updates = [];
      const matchedCategoriesSet = new Set();
      let categorizedCount = 0;

      articles.forEach(art => {
        const fullText = this.normalize(
          `${art.title || ''} ${art.abstract || ''} ${(art.keywords || []).join(' ')}`
        );
        const assigned = [];

        allCats.forEach(cat => {
          const matched = cat.keywords.some(kw => fullText.includes(kw));
          if (matched) {
            assigned.push(cat.name);
            matchedCategoriesSet.add(cat.name);
          }
        });

        // Preserve any custom manual categories the user may have explicitly added
        const manualCats = (art.categories || []).filter(c => !allCats.some(ac => ac.name === c));
        const finalCats = Array.from(new Set([...manualCats, ...assigned]));

        updates.push({
          id: art.id,
          categories: finalCats
        });
        art.categories = finalCats;
        if (assigned.length > 0) categorizedCount++;
      });

      // If absolutely no categories matched across any article, extract high-frequency terms
      if (matchedCategoriesSet.size === 0 && articles.length > 0) {
        const fallbackTheme = 'Estudos Temáticos da Revisão';
        matchedCategoriesSet.add(fallbackTheme);
        updates.forEach(u => {
          u.categories = [fallbackTheme];
          const a = articles.find(x => x.id === u.id);
          if (a) a.categories = [fallbackTheme];
        });
        categorizedCount = articles.length;
      }

      return {
        updates,
        categories: Array.from(matchedCategoriesSet),
        categorizedCount
      };
    }
  };

  async function autoCategorizeArticles(project) {
    const articles = project.articles || [];
    const included = articles.filter(a => a.decision === 'include' && !a.is_duplicate);

    if (!included.length) {
      UI.toast('Nenhum artigo incluído para categorizar.', 'info');
      return;
    }

    // ── Loading overlay ──────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '99999';
    overlay.innerHTML = `
      <div class="modal-dialog" style="max-width:440px;text-align:center;padding:32px 24px;border-radius:24px;
        background:rgba(22,16,44,0.95);border:1px solid rgba(168,85,247,0.3);
        box-shadow:0 12px 40px rgba(0,0,0,0.6);backdrop-filter:blur(20px);">
        <div class="spinner" style="width:40px;height:40px;border-width:3.5px;border-top-color:var(--purple);margin:0 auto 16px;"></div>
        <h3 style="margin:0 0 6px;font-size:1.15rem;color:var(--text-primary);font-weight:800;">🤖 Auto-Categorização</h3>
        <p style="font-size:0.84rem;color:var(--text-secondary);margin:0;" id="ai-cat-msg">
          Analisando títulos e resumos de ${included.length} estudos para identificar temas…
        </p>
      </div>
    `;
    document.body.appendChild(overlay);
    const setMsg = (m) => { const el = document.getElementById('ai-cat-msg'); if (el) el.textContent = m; };

    try {
      let catNames = [];
      let updates = [];
      let categorizedCount = 0;

      // Check if AI is configured and functional
      const hasAI = typeof AIAssistant !== 'undefined' && AIAssistant.isConfigured();

      if (hasAI) {
        setMsg('Consultando IA para refinamento temático dos estudos…');
        await new Promise(r => setTimeout(r, 40));

        try {
          const sampleSize = Math.min(50, included.length);
          const sample = included.slice(0, sampleSize);
          const titlesText = sample
            .map((a, i) => `${i + 1}. ${(a.title || 'Sem título').substring(0, 160)}`)
            .join('\n');

          const prompt =
`Você é um especialista em revisão sistemática científica.
Analise os títulos dos artigos abaixo e identifique de 4 a 7 categorias temáticas que emergem naturalmente desse corpus.
Para cada categoria, forneça de 6 a 10 palavras-chave (em português e inglês) para classificar os artigos.

Títulos:
${titlesText}

Responda APENAS com JSON válido:
{"categories":[{"name":"Nome da Categoria","keywords":["palavra1","word2"]}]}`;

          const aiResponse = await AIAssistant.callLLM({ prompt, temperature: 0.2, maxTokens: 1500 });
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.categories && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
              const aiCats = parsed.categories.filter(c => c.name && Array.isArray(c.keywords));
              if (aiCats.length > 0) {
                const kwRules = {};
                aiCats.forEach(c => {
                  kwRules[c.name] = c.keywords.map(k => SemanticCategorizer.normalize(k));
                });
                included.forEach(art => {
                  const txt = SemanticCategorizer.normalize(`${art.title || ''} ${art.abstract || ''} ${(art.keywords || []).join(' ')}`);
                  const assigned = [];
                  aiCats.forEach(c => {
                    if ((kwRules[c.name] || []).some(k => txt.includes(k))) {
                      assigned.push(c.name);
                    }
                  });
                  if (assigned.length > 0) categorizedCount++;
                  const finalCats = Array.from(new Set([...(art.categories || []), ...assigned]));
                  updates.push({ id: art.id, categories: finalCats });
                  art.categories = finalCats;
                });
                catNames = aiCats.map(c => c.name);
              }
            }
          }
        } catch (aiErr) {
          console.warn('[Gisa] AI call failed, falling back to SemanticCategorizer:', aiErr);
        }
      }

      // If AI was not configured or produced no categories, use built-in SemanticCategorizer
      if (!catNames.length || !updates.length) {
        setMsg('Aplicando ontologia semântica especializada nos estudos…');
        await new Promise(r => setTimeout(r, 40));

        const res = SemanticCategorizer.classifyArticles(included, project);
        catNames = res.categories;
        updates = res.updates;
        categorizedCount = res.categorizedCount;
      }

      // Save categories to project
      const allActiveCats = Array.from(new Set([
        ...(project.categories || []),
        ...catNames
      ])).filter(Boolean);

      Storage.updateProject(project.id, { categories: allActiveCats });
      if (updates.length) Storage.bulkUpdateArticles(project.id, updates);

      overlay.remove();
      UI.toast(
        `✨ ${catNames.length} temas identificados e ${categorizedCount} de ${included.length} artigos classificados!`,
        'success'
      );
      renderArticlesTab(Storage.getProject(project.id), state.tab === 'final');

    } catch (err) {
      overlay.remove();
      console.error('[Gisa] autoCategorize error:', err);
      UI.toast(`Erro na auto-categorização: ${err.message}`, 'error');
    }
  }

  function toggleFinalSelection(project, article) {
    const newVal = !article.final_selection;
    Storage.updateArticle(project.id, article.id, {
      final_selection: newVal,
      decision: 'include'
    });
    UI.toast(
      newVal ? '⭐ Estudo confirmado na Seleção Definitiva da revisão!' : 'Seleção definitiva desmarcada.',
      'success'
    );
    updateProjectNavHeader(Storage.getProject(project.id));
    renderArticlesTab(Storage.getProject(project.id), state.tab === 'final');
  }

  function selectAllInTheme(project, category) {
    const allArticles = project.articles || [];
    const catArticles = allArticles.filter(a =>
      a.decision === 'include' &&
      !a.is_duplicate &&
      (a.categories || []).includes(category) &&
      !a.final_selection
    );

    if (!catArticles.length) {
      UI.toast('Todos os estudos deste tema já estão na Seleção Final!', 'info');
      return;
    }

    const updates = catArticles.map(a => ({
      id: a.id,
      final_selection: true,
      decision: 'include'
    }));

    Storage.bulkUpdateArticles(project.id, updates);
    UI.toast(`⭐ ${catArticles.length} estudos do tema "${category}" adicionados à Seleção Final!`, 'success');
    updateProjectNavHeader(Storage.getProject(project.id));
    renderArticlesTab(Storage.getProject(project.id), state.tab === 'final');
  }

  function showCategoryModal(project, article) {
    const currentCats = new Set((article && article.categories) || []);
    let allProjectCats = Array.from(new Set([
      ...(project.categories || []),
      ...((project.articles || []).flatMap(a => a.categories || []))
    ])).filter(Boolean);

    function buildChipsHtml() {
      return allProjectCats.map(cat => {
        const isSelected = currentCats.has(cat);
        return `
          <button type="button" class="cat-pill-btn ${isSelected ? 'selected' : ''}" data-cat="${escapeHtml(cat)}" style="background:${isSelected ? 'linear-gradient(135deg,#a855f7,#6366f1)' : 'rgba(255,255,255,0.05)'};border:1px solid ${isSelected ? '#c084fc' : 'rgba(255,255,255,0.14)'};color:${isSelected ? '#fff' : 'var(--text-secondary)'};padding:6px 14px;border-radius:9999px;font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s;">
            ${isSelected ? '✓ ' : '+ '} ${escapeHtml(cat)}
          </button>
        `;
      }).join('');
    }

    const bodyHtml = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <p style="font-size:0.84rem;color:var(--text-secondary);margin:0;line-height:1.5;">
          ${article ? 'Atribua temas a este artigo para organizar a síntese da revisão por categorias temáticas (ex: <em>Violência no Trabalho</em>, <em>Violência Escolar</em>).' : 'Crie novos temas temáticos para organizar e filtrar os estudos na revisão.'}
        </p>

        ${article ? `
          <div style="background:var(--bg-card2);padding:12px;border-radius:14px;border:1px solid var(--border);">
            <strong style="font-size:0.88rem;color:var(--text-primary);display:block;margin-bottom:4px;">${escapeHtml(article.title)}</strong>
            <span style="font-size:0.75rem;color:var(--text-muted);">${article.authors?.slice(0,3).join('; ') || ''} ${article.year ? `(${article.year})` : ''}</span>
          </div>
        ` : ''}

        <div>
          <label style="font-size:0.76rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:8px;">
            ${article ? 'Clique nos temas para adicionar ou remover:' : 'Temas cadastrados no projeto:'}
          </label>
          <div id="cat-chips-container" style="display:flex;flex-wrap:wrap;gap:8px;">
            ${buildChipsHtml()}
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:4px;">
          <input id="cat-new-input" class="input input-sm" placeholder="Criar novo tema (ex: Violência Institucional)…" style="flex:1;" />
          <button id="cat-new-btn" class="btn btn-sm btn-secondary" style="border-radius:9999px;font-weight:700;">+ Adicionar</button>
        </div>
      </div>
    `;

    UI.modal('🏷️ Categorias Temáticas da Revisão', bodyHtml, [
      { label: 'Fechar', style: 'btn-ghost' },
      {
        label: 'Salvar Temas',
        style: 'btn-primary',
        cb: () => {
          if (article) {
            const finalCats = Array.from(currentCats);
            Storage.updateArticle(project.id, article.id, { categories: finalCats });
          }
          Storage.updateProject(project.id, { categories: allProjectCats });
          UI.toast('✓ Categorias temáticas salvas com sucesso!', 'success');
          renderArticlesTab(Storage.getProject(project.id), state.tab === 'final');
        }
      }
    ]);

    setTimeout(() => {
      const container = document.getElementById('cat-chips-container');
      const input = document.getElementById('cat-new-input');
      const addBtn = document.getElementById('cat-new-btn');

      function refreshChips() {
        if (container) {
          container.innerHTML = buildChipsHtml();
          bindClicks();
        }
      }

      function bindClicks() {
        container?.querySelectorAll('.cat-pill-btn').forEach(btn => {
          btn.onclick = () => {
            const cat = btn.dataset.cat;
            if (currentCats.has(cat)) currentCats.delete(cat);
            else currentCats.add(cat);
            refreshChips();
          };
        });
      }

      bindClicks();

      const addNewCat = () => {
        const val = input?.value?.trim();
        if (!val) return;
        if (!allProjectCats.includes(val)) allProjectCats.push(val);
        currentCats.add(val);
        input.value = '';
        refreshChips();
      };

      addBtn?.addEventListener('click', addNewCat);
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') addNewCat(); });
    }, 50);
  }

  function showFullTextExcludeModal(project, article) {
    const reasons = [
      'Texto completo não acessível / não recuperado',
      'Metodologia incompatível com os critérios de inclusão',
      'População de estudo divergente do protocolo',
      'Desfechos / variáveis de interesse não relatados',
      'Desenho de estudo não contemplado na revisão',
      'Publicação duplicada não identificada anteriormente',
      'Outro motivo de exclusão'
    ];

    const bodyHtml = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <p style="font-size:0.84rem;color:var(--text-secondary);margin:0;line-height:1.45;">
          Para manter o rigor do padrão científico internacional (PRISMA 2020), selecione a justificativa da exclusão deste artigo na fase de leitura integral:
        </p>

        <div style="background:var(--bg-card2);padding:12px;border-radius:12px;border:1px solid var(--border);">
          <strong style="font-size:0.86rem;color:var(--text-primary);display:block;margin-bottom:2px;">${escapeHtml(article.title)}</strong>
          <span style="font-size:0.75rem;color:var(--text-muted);">${article.authors?.slice(0,3).join('; ') || ''}</span>
        </div>

        <div>
          <label style="font-size:0.76rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:8px;">
            Motivo da Exclusão (PRISMA):
          </label>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${reasons.map((r, i) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-primary);cursor:pointer;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);">
                <input type="radio" name="ft-exclude-reason" value="${escapeHtml(r)}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--red);" />
                <span>${escapeHtml(r)}</span>
              </label>
            `).join('')}
          </div>
          <input id="ft-custom-reason" class="input input-sm" placeholder="Ou descreva outro motivo específico…" style="width:100%;margin-top:8px;display:none;" />
        </div>
      </div>
    `;

    UI.modal('✗ Excluir Estudo (Fase de Texto Completo)', bodyHtml, [
      { label: 'Cancelar', style: 'btn-ghost' },
      {
        label: 'Confirmar Exclusão',
        style: 'btn-danger',
        cb: () => {
          const selected = document.querySelector('input[name="ft-exclude-reason"]:checked')?.value || 'Critérios de inclusão não atendidos';
          const custom = document.getElementById('ft-custom-reason')?.value?.trim();
          const finalReason = (selected === 'Outro motivo de exclusão' && custom) ? custom : selected;

          Storage.updateArticle(project.id, article.id, {
            decision: 'exclude',
            exclusion_reason: finalReason,
            exclusion_stage: 'full_text',
            final_selection: false
          });

          UI.toast('✓ Artigo excluído e justificativa registrada para o PRISMA.', 'info');
          renderArticlesTab(Storage.getProject(project.id));
          updateProjectNavHeader(Storage.getProject(project.id));
        }
      }
    ]);

    setTimeout(() => {
      const customInput = document.getElementById('ft-custom-reason');
      document.querySelectorAll('input[name="ft-exclude-reason"]').forEach(r => {
        r.addEventListener('change', () => {
          if (customInput) customInput.style.display = r.value === 'Outro motivo de exclusão' ? 'block' : 'none';
        });
      });
    }, 40);
  }

  // ─── STATS TAB ────────────────────────────────────────
  function renderStatsTab(project) {
    const rawTotal = project.articles ? project.articles.length : (project.stats?.total || 0);
    const duplicatesTotal = project.articles ? project.articles.filter(a => a.is_duplicate).length : (project.stats?.duplicates || 0);
    const screenableTotal = project.articles ? project.articles.filter(a => !a.is_duplicate).length : Math.max(0, rawTotal - duplicatesTotal);

    const includedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate).length : (project.stats?.included || 0);
    const finalSelectedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true).length : (project.stats?.finalSelected || 0);
    const pendingFinalTotal = Math.max(0, includedTotal - finalSelectedTotal);

    const excludedTotal = project.articles ? project.articles.filter(a => a.decision === 'exclude' && !a.is_duplicate && a.exclusion_reason !== 'Duplicata').length : (project.stats?.excluded || 0);
    const maybeTotal = project.articles ? project.articles.filter(a => a.decision === 'maybe' && !a.is_duplicate).length : (project.stats?.maybe || 0);
    const pendingTotal = project.articles ? project.articles.filter(a => !a.decision && !a.is_duplicate).length : Math.max(0, screenableTotal - includedTotal - excludedTotal - maybeTotal);

    const triadosTotal = screenableTotal - pendingTotal;
    const totalRaw = rawTotal || 1;
    const pctEvaluated = screenableTotal > 0 ? Math.round((triadosTotal / screenableTotal) * 100) : 0;

    // Percentuais rigorosos
    const pctDup = ((duplicatesTotal / totalRaw) * 100).toFixed(1);
    const pctScreenable = ((screenableTotal / totalRaw) * 100).toFixed(1);
    const pctIncluded = screenableTotal > 0 ? ((includedTotal / screenableTotal) * 100).toFixed(1) : '0.0';
    const pctExcluded = screenableTotal > 0 ? ((excludedTotal / screenableTotal) * 100).toFixed(1) : '0.0';
    const pctMaybe = screenableTotal > 0 ? ((maybeTotal / screenableTotal) * 100).toFixed(1) : '0.0';
    const pctPending = screenableTotal > 0 ? ((pendingTotal / screenableTotal) * 100).toFixed(1) : '0.0';

    // Agrupamento EXCLUSIVO dos motivos reais de exclusão da triagem (desconsidera duplicatas)
    const excludedArticles = (project.articles || []).filter(a => a.decision === 'exclude' && !a.is_duplicate && a.exclusion_reason !== 'Duplicata');
    const exclusionReasonsMap = {};
    excludedArticles.forEach(a => {
      const r = (a.exclusion_reason || 'Outro / Não especificado').trim();
      exclusionReasonsMap[r] = (exclusionReasonsMap[r] || 0) + 1;
    });

    const reasonKeys = Object.keys(exclusionReasonsMap);
    const reasonColors = ['#ef4444', '#f97316', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];

    const totalExclusions = excludedArticles.length;
    const exclusionData = reasonKeys.map((reason, idx) => ({
      label: reason,
      value: exclusionReasonsMap[reason],
      color: reasonColors[idx % reasonColors.length]
    }));

    const content = $('tab-content');
    content.innerHTML = `
      <div class="stats-tab">
        
        <!-- Top Metric Cards (Fluxo PRISMA) -->
        <div class="stats-grid">
          <div class="stat-card total" title="Total bruto de referências importadas dos arquivos de busca">
            <div class="stat-num">${rawTotal}</div>
            <div class="stat-name">Total Importados</div>
          </div>
          <div class="stat-card dup" title="Duplicatas identificadas e removidas da triagem">
            <div class="stat-num">${duplicatesTotal} <small style="font-size:0.75rem;font-weight:600">(${pctDup}%)</small></div>
            <div class="stat-name">Duplicatas</div>
          </div>
          <div class="stat-card screenable" title="Base líquida de registros únicos para triagem">
            <div class="stat-num">${screenableTotal} <small style="font-size:0.75rem;font-weight:600">(${pctScreenable}%)</small></div>
            <div class="stat-name">Triagem (Únicos)</div>
          </div>
          <div class="stat-card pending" title="Artigos aguardando decisão de leitura do título/resumo">
            <div class="stat-num">${pendingTotal} <small style="font-size:0.75rem;font-weight:600">(${pctPending}%)</small></div>
            <div class="stat-name">Pendentes</div>
          </div>
          <div class="stat-card exclude" title="Artigos rejeitados na triagem por critérios de inelegibilidade">
            <div class="stat-num">${excludedTotal} <small style="font-size:0.75rem;font-weight:600">(${pctExcluded}%)</small></div>
            <div class="stat-name">Excluídos</div>
          </div>
          <div class="stat-card maybe" title="Artigos marcados com dúvida para reavaliação">
            <div class="stat-num">${maybeTotal} <small style="font-size:0.75rem;font-weight:600">(${pctMaybe}%)</small></div>
            <div class="stat-name">Talvez</div>
          </div>
          <div class="stat-card include" title="Artigos aprovados na triagem para leitura de texto integral (Fase 2)">
            <div class="stat-num">${includedTotal} <small style="font-size:0.75rem;font-weight:600">(${pctIncluded}%)</small></div>
            <div class="stat-name">Elegíveis (Fase 2)</div>
          </div>
          <div class="stat-card final" title="Estudos confirmados na seleção final para síntese e discussão (Fase 3)">
            <div class="stat-num">⭐ ${finalSelectedTotal}</div>
            <div class="stat-name">Seleção Final (Fase 3)</div>
          </div>
        </div>

        <!-- Section 1: Pie Charts -->
        <div class="stats-charts-row">
          
          <!-- Chart 1: Triagem Geral -->
          <div class="chart-card pie-chart-card">
            <div class="chart-header">
              <h3>🍕 Distribuição do Fluxo Geral (%)</h3>
              <span class="chart-subtitle">Visão integrada de todas as etapas da revisão</span>
            </div>
            <div class="pie-chart-body">
              <canvas id="decisions-pie-chart" width="220" height="220"></canvas>
              <div class="chart-legend-detailed">
                <div class="legend-row final" style="color:#fbbf24;font-weight:700;">
                  <span class="legend-color-dot" style="background:#fbbf24;box-shadow:0 0 8px rgba(251,191,36,0.6)"></span>
                  <span class="legend-label">⭐ Seleção Final:</span>
                  <strong class="legend-val" style="color:#fbbf24">${finalSelectedTotal}</strong>
                  <span class="legend-pct">(${((finalSelectedTotal / totalRaw) * 100).toFixed(1)}%)</span>
                </div>
                <div class="legend-row include">
                  <span class="legend-color-dot" style="background:#22c55e"></span>
                  <span class="legend-label">Elegíveis (Fase 2):</span>
                  <strong class="legend-val">${includedTotal}</strong>
                  <span class="legend-pct">(${((includedTotal / totalRaw) * 100).toFixed(1)}%)</span>
                </div>
                <div class="legend-row exclude">
                  <span class="legend-color-dot" style="background:#ef4444"></span>
                  <span class="legend-label">Excluídos na Triagem:</span>
                  <strong class="legend-val">${excludedTotal}</strong>
                  <span class="legend-pct">(${((excludedTotal / totalRaw) * 100).toFixed(1)}%)</span>
                </div>
                <div class="legend-row maybe">
                  <span class="legend-color-dot" style="background:#f59e0b"></span>
                  <span class="legend-label">Talvez:</span>
                  <strong class="legend-val">${maybeTotal}</strong>
                  <span class="legend-pct">(${((maybeTotal / totalRaw) * 100).toFixed(1)}%)</span>
                </div>
                <div class="legend-row dup">
                  <span class="legend-color-dot" style="background:#818cf8"></span>
                  <span class="legend-label">Duplicatas Removidas:</span>
                  <strong class="legend-val">${duplicatesTotal}</strong>
                  <span class="legend-pct">(${pctDup}%)</span>
                </div>
                <div class="legend-row pending">
                  <span class="legend-color-dot" style="background:#64748b"></span>
                  <span class="legend-label">Pendentes de Triagem:</span>
                  <strong class="legend-val">${pendingTotal}</strong>
                  <span class="legend-pct">(${((pendingTotal / totalRaw) * 100).toFixed(1)}%)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Chart 2: Motivos de Exclusão -->
          <div class="chart-card pie-chart-card">
            <div class="chart-header">
              <h3>🚫 Razões de Exclusão da Triagem (%)</h3>
              <span class="chart-subtitle">${totalExclusions > 0 ? `${totalExclusions} artigo(s) rejeitado(s) na triagem` : 'Critérios de exclusão avaliados'}</span>
            </div>
            <div class="pie-chart-body">
              <canvas id="reasons-pie-chart" width="220" height="220"></canvas>
              <div class="chart-legend-detailed">
                ${exclusionData.length > 0 ? exclusionData.map(d => {
                  const rPct = totalExclusions > 0 ? ((d.value / totalExclusions) * 100).toFixed(1) : '0.0';
                  return `
                    <div class="legend-row">
                      <span class="legend-color-dot" style="background:${d.color}"></span>
                      <span class="legend-label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}:</span>
                      <strong class="legend-val">${d.value}</strong>
                      <span class="legend-pct">(${rPct}%)</span>
                    </div>`;
                }).join('') : '<p class="muted" style="font-size:0.82rem;padding:24px 0;text-align:center;">Nenhum artigo excluído na triagem com justificativa ainda.</p>'}
              </div>
            </div>
          </div>

        </div>

        <!-- Section 2: Reconciliação PRISMA -->
        <div class="prisma-table-card">
          <div class="prisma-table-header">
            <div>
              <h3>📋 Reconciliação Numérica e Percentual (Padrão PRISMA 2020)</h3>
              <p class="muted">Tabela científica formatada com contagens e percentis para inclusão direta no artigo.</p>
            </div>
            <button class="btn btn-secondary btn-sm" id="copy-prisma-text-btn">📋 Copiar Resumo para Artigo</button>
          </div>

          <div class="table-responsive">
            <table class="prisma-summary-table">
              <thead>
                <tr>
                  <th>Etapa do Fluxo PRISMA 2020</th>
                  <th>Contagem (N)</th>
                  <th>Percentual (%)</th>
                  <th>Status na Revisão</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>1. Registros Identificados</strong> (Importação total de bases de dados)</td>
                  <td><strong>${rawTotal}</strong></td>
                  <td><strong>100.0%</strong></td>
                  <td><span class="badge badge-info">Base Bruta</span></td>
                </tr>
                <tr>
                  <td><strong>2. Registros Removidos como Duplicatas</strong></td>
                  <td>${duplicatesTotal}</td>
                  <td>${pctDup}%</td>
                  <td><span class="badge badge-purple">Descartados pré-triagem</span></td>
                </tr>
                <tr>
                  <td><strong>3. Registros Únicos para Triagem</strong> (Pool efetivo de triagem)</td>
                  <td><strong>${screenableTotal}</strong></td>
                  <td>${pctScreenable}%</td>
                  <td><span class="badge badge-info">Base Única</span></td>
                </tr>
                <tr>
                  <td><strong>4. Artigos Triados</strong> (Avaliação por título e resumo)</td>
                  <td>${triadosTotal}</td>
                  <td>${pctEvaluated}%</td>
                  <td><span class="badge badge-warning">${pctEvaluated === 100 ? 'Concluída' : 'Em Andamento'}</span></td>
                </tr>
                <tr>
                  <td><strong>5. Artigos Excluídos na Triagem</strong> (Critérios de inelegibilidade)</td>
                  <td>${excludedTotal}</td>
                  <td>${screenableTotal > 0 ? ((excludedTotal / screenableTotal) * 100).toFixed(1) : 0}%</td>
                  <td><span class="badge badge-danger">Excluídos</span></td>
                </tr>
                ${reasonKeys.map(r => {
                  const cnt = exclusionReasonsMap[r];
                  const p = totalExclusions > 0 ? ((cnt / totalExclusions) * 100).toFixed(1) : '0.0';
                  return `
                    <tr class="sub-row">
                      <td style="padding-left: 28px;">↳ Motivo: <em>${escapeHtml(r)}</em></td>
                      <td>${cnt}</td>
                      <td>${p}%</td>
                      <td><span class="sub-badge">Critério</span></td>
                    </tr>`;
                }).join('')}
                <tr>
                  <td><strong>6. Artigos Mantidos como "Talvez"</strong> (Dúvida / Em reavaliação)</td>
                  <td>${maybeTotal}</td>
                  <td>${screenableTotal > 0 ? ((maybeTotal / screenableTotal) * 100).toFixed(1) : 0}%</td>
                  <td><span class="badge badge-warning">Em Análise</span></td>
                </tr>
                <tr>
                  <td><strong>7. Artigos Elegíveis para Leitura Integral</strong> (Fase 2 - Incluídos)</td>
                  <td><strong>${includedTotal}</strong></td>
                  <td>${screenableTotal > 0 ? ((includedTotal / screenableTotal) * 100).toFixed(1) : 0}%</td>
                  <td><span class="badge badge-success">Elegíveis (Fase 2)</span></td>
                </tr>
                <tr class="highlight-row" style="background:linear-gradient(135deg,rgba(245,158,11,0.14),rgba(217,119,6,0.2));">
                  <td><strong>8. ⭐ Estudos Selecionados para Síntese Final</strong> (Fase 3 Definitiva)</td>
                  <td><strong style="color:#fbbf24;font-size:1.1rem;">${finalSelectedTotal}</strong></td>
                  <td><strong style="color:#fbbf24;">${includedTotal > 0 ? ((finalSelectedTotal / includedTotal) * 100).toFixed(1) : 0}% dos elegíveis</strong></td>
                  <td><span class="badge" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-weight:700;">Síntese Definitiva</span></td>
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

    // Render Pie Chart 1: Decisions / Flow Distribution
    const canvasDecisions = $('decisions-pie-chart');
    if (canvasDecisions) {
      UI.renderDonut(canvasDecisions, [
        { value: finalSelectedTotal, color: '#fbbf24', label: '⭐ Seleção Final' },
        { value: pendingFinalTotal, color: '#22c55e', label: '📋 Elegíveis (Fase 2)' },
        { value: excludedTotal, color: '#ef4444', label: '✗ Excluídos' },
        { value: maybeTotal, color: '#f59e0b', label: '? Talvez' },
        { value: duplicatesTotal, color: '#818cf8', label: '🔄 Duplicatas' },
        { value: pendingTotal, color: '#64748b', label: '⏳ Pendentes' },
      ], { isPie: false, centerLabel: 'Total Artigos' });
    }

    // Render Pie Chart 2: Screening Exclusion Reasons (Strictly excluding duplicates)
    const canvasReasons = $('reasons-pie-chart');
    if (canvasReasons) {
      if (exclusionData.length > 0) {
        UI.renderDonut(canvasReasons, exclusionData, { isPie: true, centerLabel: `${totalExclusions} Exclusão${totalExclusions > 1 ? 'ões' : ''}` });
      } else {
        UI.renderDonut(canvasReasons, [{ value: 1, color: '#334155', label: 'Sem exclusões' }], { isPie: true, centerLabel: '0 Exclusões' });
      }
    }

    // Copy PRISMA summary text to clipboard
    const copyBtn = $('copy-prisma-text-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        let text = `RESUMO DO FLUXO PRISMA 2020 (${project.name})\n`;
        text += `==================================================\n`;
        text += `1. Total de registros identificados nas buscas: ${rawTotal} (100.0%)\n`;
        text += `2. Registros removidos como duplicatas: ${duplicatesTotal} (${pctDup}%)\n`;
        text += `3. Registros únicos submetidos à triagem: ${screenableTotal} (${pctScreenable}%)\n`;
        text += `4. Artigos avaliados por título e resumo: ${triadosTotal} (${pctEvaluated}% dos únicos)\n`;
        text += `5. Artigos excluídos na triagem: ${excludedTotal}\n`;
        reasonKeys.forEach(r => {
          const cnt = exclusionReasonsMap[r];
          const p = totalExclusions > 0 ? ((cnt / totalExclusions) * 100).toFixed(1) : '0.0';
          text += `   ↳ Motivo "${r}": ${cnt} (${p}% das exclusões)\n`;
        });
        text += `6. Artigos mantidos em dúvida (Talvez): ${maybeTotal}\n`;
        text += `7. Artigos elegíveis para leitura integral (Fase 2): ${includedTotal}\n`;
        text += `8. Estudos selecionados para síntese final (Fase 3): ${finalSelectedTotal}\n`;
        text += `==================================================\n`;

        navigator.clipboard.writeText(text).then(() => {
          UI.toast('Resumo PRISMA copiado para a área de transferência!', 'success');
        }).catch(() => {
          UI.toast('Erro ao copiar texto', 'error');
        });
      };
    }

    // Year distribution chart
    const included = (project.articles || []).filter(a => a.decision === 'include' && !a.is_duplicate && a.year);
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
    const rawTotal = project.articles ? project.articles.length : (project.stats?.total || 0);
    const includedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate).length : (project.stats?.included || 0);
    const finalSelectedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true).length : 0;
    const maybeTotal = project.articles ? project.articles.filter(a => a.decision === 'maybe' && !a.is_duplicate).length : (project.stats?.maybe || 0);

    const content = $('tab-content');
    content.innerHTML = `
      <div class="export-tab">
        <h3>Exportar artigos</h3>
        <div class="export-options">
          <div class="export-card" id="export-final" style="border-color:rgba(245,158,11,0.5);background:linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.18));">
            <div class="export-icon">⭐</div>
            <h4>Seleção Final (Síntese)</h4>
            <p>${finalSelectedTotal} artigos confirmados para síntese final</p>
            <div class="export-format-group">
              <button class="export-format-btn" data-type="final" data-fmt="csv">.CSV</button>
              <button class="export-format-btn" data-type="final" data-fmt="ris">.RIS</button>
              <button class="export-format-btn" data-type="final" data-fmt="bib">.BIB</button>
            </div>
          </div>
          <div class="export-card" id="export-included">
            <div class="export-icon">✅</div>
            <h4>Artigos Elegíveis (Texto Integral)</h4>
            <p>${includedTotal} artigos aprovados na triagem</p>
            <div class="export-format-group">
              <button class="export-format-btn" data-type="include" data-fmt="csv">.CSV</button>
              <button class="export-format-btn" data-type="include" data-fmt="ris">.RIS</button>
              <button class="export-format-btn" data-type="include" data-fmt="bib">.BIB</button>
            </div>
          </div>
          <div class="export-card" id="export-maybe">
            <div class="export-icon">❓</div>
            <h4>Artigos "Talvez"</h4>
            <p>${maybeTotal} artigos para revisão</p>
            <div class="export-format-group">
              <button class="export-format-btn" data-type="maybe" data-fmt="csv">.CSV</button>
              <button class="export-format-btn" data-type="maybe" data-fmt="ris">.RIS</button>
              <button class="export-format-btn" data-type="maybe" data-fmt="bib">.BIB</button>
            </div>
          </div>
          <div class="export-card" id="export-all">
            <div class="export-icon">📄</div>
            <h4>Todos os Artigos</h4>
            <p>${rawTotal} artigos com todas as decisões</p>
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
    let articles = project.articles || [];
    if (type === 'final') articles = articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true);
    else if (type === 'include') articles = articles.filter(a => a.decision === 'include' && !a.is_duplicate);
    else if (type === 'maybe') articles = articles.filter(a => a.decision === 'maybe' && !a.is_duplicate);
    else if (type === 'exclude') articles = articles.filter(a => a.decision === 'exclude' && !a.is_duplicate);

    if (!articles.length) { UI.toast('Nenhum artigo para exportar nesta categoria', 'info'); return; }

    const headers = ['Título','Autores','Ano','Revista','DOI','Decisão','Seleção Final','Temas','Nota','Relevância (%)','Arquivo Fonte'];
    const rows = articles.map(a => {
      const authorsList = Array.isArray(a.authors) ? a.authors : [];
      return [
        `"${(a.title||'').replace(/"/g,'""')}"`,
        `"${authorsList.join('; ').replace(/"/g,'""')}"`,
        a.year || '',
        `"${(a.journal||'').replace(/"/g,'""')}"`,
        a.doi || '',
        a.decision || 'pendente',
        a.final_selection ? 'SIM' : 'NÃO',
        `"${(a.categories||[]).join('; ').replace(/"/g,'""')}"`,
        `"${(a.note||'').replace(/"/g,'""')}"`,
        a.relevance_score !== null && a.relevance_score !== undefined ? a.relevance_score : '',
        a.source_file || ''
      ].join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');  // BOM for Excel
    downloadFile(csv, `gisa_${type}_${project.name.replace(/\s+/g,'_')}.csv`, 'text/csv');
    UI.toast(`${articles.length} artigos exportados com sucesso!`, 'success');
  }

  function exportReport(project) {
    const rawTotal = project.articles ? project.articles.length : (project.stats?.total || 0);
    const duplicatesTotal = project.articles ? project.articles.filter(a => a.is_duplicate).length : (project.stats?.duplicates || 0);
    const screenableTotal = project.articles ? project.articles.filter(a => !a.is_duplicate).length : Math.max(0, rawTotal - duplicatesTotal);
    const includedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate).length : (project.stats?.included || 0);
    const finalSelectedTotal = project.articles ? project.articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true).length : 0;
    const excludedTotal = project.articles ? project.articles.filter(a => a.decision === 'exclude' && !a.is_duplicate).length : (project.stats?.excluded || 0);
    const maybeTotal = project.articles ? project.articles.filter(a => a.decision === 'maybe' && !a.is_duplicate).length : (project.stats?.maybe || 0);
    const pendingTotal = project.articles ? project.articles.filter(a => !a.decision && !a.is_duplicate).length : Math.max(0, screenableTotal - includedTotal - excludedTotal - maybeTotal);

    const date = new Date().toLocaleDateString('pt-BR');
    const finalArticles = (project.articles || []).filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true);
    const eligibleArticles = (project.articles || []).filter(a => a.decision === 'include' && !a.is_duplicate && !a.final_selection);

    const report = `RELATÓRIO DE REVISÃO SISTEMÁTICA — Gisa (Padrão PRISMA 2020)
Projeto: ${project.name}
Data: ${date}
${project.description ? `Descrição: ${project.description}\n` : ''}Palavras-chave: ${(project.keywords||[]).join(', ') || '—'}

══════════════════════════════════════════════════════
1. ESTATÍSTICAS DO FLUXO PRISMA
══════════════════════════════════════════════════════
Total de referências brutas importadas:  ${rawTotal} (100.0%)
Duplicatas identificadas e removidas:    ${duplicatesTotal} (${rawTotal ? ((duplicatesTotal/rawTotal)*100).toFixed(1) : 0}%)
Base líquida para triagem (únicos):      ${screenableTotal}
Artigos avaliados por título/resumo:    ${screenableTotal - pendingTotal} (${screenableTotal ? Math.round(((screenableTotal - pendingTotal)/screenableTotal)*100) : 0}%)
Artigos excluídos na triagem:            ${excludedTotal}
Artigos em dúvida (Talvez):              ${maybeTotal}
Artigos pendentes de triagem:            ${pendingTotal}
Artigos elegíveis para leitura integral: ${includedTotal}
⭐ Estudos na Seleção Final da Síntese:  ${finalSelectedTotal}

══════════════════════════════════════════════════════
2. ESTUDOS SELECIONADOS NA SÍNTESE FINAL (Fase 3: n = ${finalSelectedTotal})
══════════════════════════════════════════════════════
${finalArticles.length ? finalArticles.map((a, i) =>
  `${i+1}. ${a.title}\n   Autores: ${(a.authors||[]).slice(0,4).join('; ')} (${a.year || 's.d.'}). ${a.journal || ''}${a.doi ? ` · DOI: ${a.doi}` : ''}${a.categories && a.categories.length ? `\n   Temas: ${a.categories.join(', ')}` : ''}${a.note ? `\n   Nota: ${a.note}` : ''}`
).join('\n\n') : 'Nenhum estudo confirmado na Seleção Final ainda.'}

══════════════════════════════════════════════════════
3. ARTIGOS ELEGÍVEIS AGUARDANDO CONFIRMAÇÃO (Fase 2: n = ${eligibleArticles.length})
══════════════════════════════════════════════════════
${eligibleArticles.length ? eligibleArticles.map((a, i) =>
  `${i+1}. ${a.title}\n   Autores: ${(a.authors||[]).slice(0,3).join('; ')} (${a.year || 's.d.'}). ${a.journal || ''}`
).join('\n\n') : 'Todos os estudos elegíveis já foram confirmados na seleção final.'}

──────────────────────────────────────────────────────
Gerado automaticamente por Gisa · ${date}
`;
    downloadFile(report, `relatorio_prisma_${project.name.replace(/\s+/g,'_')}.txt`, 'text/plain');
    UI.toast('Relatório PRISMA exportado com sucesso!', 'success');
  }

  // ─── Export: RIS ───────────────────────────────────────
  function exportRIS(project, type) {
    let articles = project.articles || [];
    if (type === 'final') articles = articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true);
    else if (type === 'include') articles = articles.filter(a => a.decision === 'include' && !a.is_duplicate);
    else if (type === 'maybe') articles = articles.filter(a => a.decision === 'maybe' && !a.is_duplicate);
    else if (type === 'exclude') articles = articles.filter(a => a.decision === 'exclude' && !a.is_duplicate);
    if (!articles.length) { UI.toast('Nenhum artigo para exportar nesta categoria', 'info'); return; }

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
        ...(a.categories || []).map(cat => `KW  - ${cat}`),
        a.final_selection ? 'N1  - Gisa: Seleção Final (Síntese)' : (a.decision ? `N1  - Gisa: ${a.decision}` : ''),
        a.note ? `N2  - ${a.note}` : '',
        'ER  - ',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    downloadFile(ris, `gisa_${type}_${project.name.replace(/\s+/g,'_')}.ris`, 'application/x-research-info-systems');
    UI.toast(`${articles.length} artigos exportados em RIS!`, 'success');
  }

  // ─── Export: BibTeX ────────────────────────────────────
  function exportBibTeX(project, type) {
    let articles = project.articles || [];
    if (type === 'final') articles = articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection === true);
    else if (type === 'include') articles = articles.filter(a => a.decision === 'include' && !a.is_duplicate);
    else if (type === 'maybe') articles = articles.filter(a => a.decision === 'maybe' && !a.is_duplicate);
    else if (type === 'exclude') articles = articles.filter(a => a.decision === 'exclude' && !a.is_duplicate);
    if (!articles.length) { UI.toast('Nenhum artigo para exportar nesta categoria', 'info'); return; }

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
  function updateProjectNavHeader(p) {
    if (!p) return;
    const duplicatesTotal = p.articles ? p.articles.filter(a => a.is_duplicate).length : (p.stats?.duplicates || 0);
    const screenableTotal = p.articles ? p.articles.filter(a => !a.is_duplicate).length : Math.max(0, (p.stats?.total || 0) - duplicatesTotal);
    const includedTotal = p.articles ? p.articles.filter(a => a.decision === 'include' && !a.is_duplicate).length : (p.stats?.included || 0);
    const finalSelectedTotal = p.articles ? p.articles.filter(a => a.decision === 'include' && !a.is_duplicate && a.final_selection).length : 0;
    const triadosTotal = p.articles ? p.articles.filter(a => a.decision && !a.is_duplicate).length : Math.max(0, screenableTotal - (p.stats?.pending || 0));

    // Update mini progress text in navbar
    const miniText = document.querySelector('.progress-mini-text');
    if (miniText) {
      miniText.textContent = `${triadosTotal} / ${screenableTotal} triados`;
    }

    // Update top tab buttons in real-time
    const tabArticles = document.querySelector('.tab-btn[data-tab="articles"] .tab-label');
    if (tabArticles) {
      tabArticles.textContent = `Incluídos (${includedTotal})`;
    }

    const tabFinal = document.querySelector('.tab-btn[data-tab="final"] .tab-label');
    if (tabFinal) {
      tabFinal.textContent = `Selecionados (${finalSelectedTotal})`;
    }

    const tabScreen = document.querySelector('.tab-btn[data-tab="screen"] .tab-label');
    if (tabScreen) {
      tabScreen.textContent = `Triagem (${screenableTotal})`;
    }

    const tabDedup = document.querySelector('.tab-btn[data-tab="dedup"] .tab-label');
    if (tabDedup) {
      tabDedup.textContent = `Duplicatas${duplicatesTotal ? ` (${duplicatesTotal})` : ''}`;
    }

    // Update banner in Incluídos tab if open
    const inclBannerTitle = document.querySelector('.articles-tab div > div > span:nth-child(2)');
    if (inclBannerTitle && inclBannerTitle.textContent.includes('Artigos Incluídos')) {
      inclBannerTitle.textContent = `Artigos Incluídos (${includedTotal})`;
    }
  }

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

      // Instantly sync top navigation numbers (Incluídos, Triados, etc.)
      updateProjectNavHeader(p);

      // Update 3-Panel Workbench if active
      if (state.tab === 'screen' && state.screenMode === 'list') {
        renderGisaArticlesListOnly(p);

        // Update Facets Sidebar with correct CSS class selector
        const facetsSlot = $('gisa-facets-slot') || document.querySelector('.gisa-facet-sidebar') || document.querySelector('.facets-sidebar');
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
      } else if (state.tab === 'articles') {
        renderArticlesList(p);
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

  let isAppInitialized = false;

  // ─── Init ─────────────────────────────────────────────
  async function init() {
    if (isAppInitialized) return;
    isAppInitialized = true;

    // FIRST: Wait for IndexedDB to fully load settings & profile before anything
    await Storage.initAsync();

    let isLoggedIn = false;

    // Check for direct Google OAuth 2.0 Access Token in URL Hash
    const hash = window.location.hash.substring(1);
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      if (accessToken) {
        try {
          await handleGoogleAccessToken(accessToken);
          window.history.replaceState(null, null, window.location.pathname + window.location.search);
          isLoggedIn = true;
        } catch (err) {
          console.warn('Erro ao processar Google OAuth token:', err);
        }
      }
    }

    if (!isLoggedIn && typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
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

    // Check if we have an active profile with email (IndexedDB already loaded above)
    const existingProfile = Storage.getProfile();
    if (existingProfile && existingProfile.email && existingProfile.email.includes('@')) {
      isLoggedIn = true;
    }

    if (!isLoggedIn) {
      state.view = 'auth';
    } else {
      const currentHash = window.location.hash || '';
      const projMatch = currentHash.match(/#projeto-([0-9a-f-]+)(?:-([a-z0-9_-]+))?/i);
      if (projMatch) {
        state.view = 'project';
        state.projectId = projMatch[1];
        state.tab = projMatch[2] || 'screen';
      } else if (currentHash.startsWith('#novo-projeto')) {
        state.view = 'wizard';
        state.wizard = { step: 1, name: '', desc: '', keywords: [], files: [] };
      } else {
        state.view = 'home';
      }
    }

    render();
    window.__gisaInitiallyRendered = true;
    UI.updateUserProfileNavbarUI();
    UI.updateCloudStatusUI();

    // Browser History & Back button support (Chrome / Edge / Safari / Mobile Back)
    if (typeof history !== 'undefined') {
      if (!history.state) {
        let initialHash = '#home';
        if (state.view === 'auth') initialHash = '';
        else if (state.view === 'project' && state.projectId) initialHash = `#projeto-${state.projectId}-${state.tab || 'screen'}`;
        else if (state.view === 'wizard') initialHash = '#novo-projeto-etapa-1';
        history.replaceState({ view: state.view, projectId: state.projectId, tab: state.tab, wizardStep: 1 }, '', initialHash || window.location.pathname);
      }

      window.addEventListener('popstate', (e) => {
        // 1. If any modal is open, close it first
        const openModal = document.querySelector('.modal-overlay');
        if (openModal) {
          openModal.remove();
          return;
        }

        // 2. Navigate according to history state
        if (e.state && e.state.view) {
          if (e.state.view === 'wizard') {
            state.view = 'wizard';
            if (!state.wizard) state.wizard = { step: 1, name: '', desc: '', keywords: [], files: [] };
            state.wizard.step = e.state.wizardStep || 1;
            render();
          } else {
            navigate(e.state.view, { projectId: e.state.projectId, tab: e.state.tab }, false);
          }
        } else {
          // Fallback: If hitting back from wizard or project without previous state, return to home
          if (state.view === 'wizard' || state.view === 'project') {
            navigate('home', {}, false);
          }
        }
      });
    }

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
      if (!window.__gisaInitiallyRendered && state.view !== 'auth') {
        window.__gisaInitiallyRendered = true;
        render();
      }
      UI.updateCloudStatusUI();
      UI.updateUserProfileNavbarUI();
    });

    // Install / Download APK & Desktop App button
    const installBtn = $('install-app-btn');
    if (installBtn) {
      installBtn.onclick = () => UI.showInstallDownloadModal();
    }

    // User Profile navbar button
    const userProfileBtn = $('user-profile-btn');
    if (userProfileBtn) {
      userProfileBtn.onclick = () => {
        UI.showProfileModal(() => {
          UI.updateUserProfileNavbarUI();
        });
      };
    }
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
    const hotkeysBtn = $('hotkeys-btn');
    if (hotkeysBtn) {
      hotkeysBtn.onclick = () => UI.showHotkeysModal();
    }

    // ─── Universal Menu Modal Handler ───
    const menuBtn = $('mobile-menu-btn');
    if (menuBtn) {
      menuBtn.onclick = () => {
        UI.showAppMenuModal({
          onProfileUpdate: () => UI.updateUserProfileNavbarUI(),
          onToggleBlind: () => {
            state.blindMode = !state.blindMode;
            updateBlindModeUI();
            UI.toast(`Modo Cego: ${state.blindMode ? 'ATIVADO' : 'DESATIVADO'}`, state.blindMode ? 'info' : 'success');
            render();
          },
          onLogout: async () => {
            await logout();
          }
        });
      };
    }

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

  // ─── Logout / Sign Out ─────────────────────────────────
  async function logout() {
    Storage.saveProfile({
      name: 'Pesquisador(a)',
      email: '',
      avatar: '👩‍🔬',
      picture: '',
      institution: '',
      role: 'Pesquisador(a) Principal',
      bio: '',
      theme: 'dark'
    });
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
      try { await SupabaseSync.signOut(); } catch {}
    }
    state.view = 'auth';
    render();
    UI.updateUserProfileNavbarUI();
    UI.updateCloudStatusUI();
    UI.toast('Você saiu da sua conta com sucesso.', 'info');
  }

  return { init, navigate, render, logout };
})();

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
