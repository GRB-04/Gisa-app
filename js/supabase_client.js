/**
 * Gisa — Plataforma de Revisão Sistemática Inteligente
 * Supabase Hybrid Sync Client: Cloud Connection, Authentication, Bidirectional Delta Sync, and Offline Queue
 */

const SupabaseSync = (() => {
  const DEFAULT_URL = 'https://ekodkojejfvyzqixtpxn.supabase.co';
  const DEFAULT_ANON_KEY = 'sb_publishable_crq5bVK9hIotIztgZQVygA_Uj9km5lD';

  const SETTING_URL = 'supabase_url';
  const SETTING_ANON_KEY = 'supabase_anon_key';
  const SETTING_LAST_SYNC = 'supabase_last_sync';

  let client = null;
  let isSyncing = false;
  let syncListeners = [];

  /**
   * Helper to normalize Supabase URL
   */
  function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    let u = rawUrl.trim();
    // Fix common typos like supabasc.co
    u = u.replace(/supabasc\.co/gi, 'supabase.co');
    // Ensure https:// protocol
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u;
    }
    return u.replace(/\/+$/, '');
  }

  /**
   * Initialize or retrieve Supabase client instance
   */
  function getClient() {
    if (client) return client;

    const settings = Storage.getSettings();
    const url = normalizeUrl(settings[SETTING_URL] || DEFAULT_URL);
    const key = (settings[SETTING_ANON_KEY] || DEFAULT_ANON_KEY).trim();

    if (!url || !key || typeof window.supabase === 'undefined') {
      return null;
    }

    try {
      client = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
      return client;
    } catch (e) {
      console.warn('Falha ao inicializar cliente Supabase:', e);
      return null;
    }
  }

  /**
   * Save credentials and initialize client
   */
  function configure(url, anonKey) {
    const cleanUrl = normalizeUrl(url);
    const cleanKey = (anonKey || '').trim();
    Storage.saveSetting(SETTING_URL, cleanUrl);
    Storage.saveSetting(SETTING_ANON_KEY, cleanKey);
    client = null; // force re-instantiation
    return getClient();
  }

  /**
   * Get current configuration status
   */
  function isConfigured() {
    return !!getClient();
  }

  /**
   * Auth helpers
   */
  async function getSession() {
    const sb = getClient();
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getSession();
      return data?.session || null;
    } catch { return null; }
  }

  async function getUser() {
    const sb = getClient();
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getUser();
      return data?.user || null;
    } catch { return null; }
  }

  async function signIn(email, password) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase não configurado.');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    notifyStatus();
    return data;
  }

  async function signUp(email, password) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase não configurado.');
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    notifyStatus();
    return data;
  }

  async function signOut() {
    const sb = getClient();
    if (sb) {
      await sb.auth.signOut();
    }
    notifyStatus();
  }

  async function signInWithOAuth(provider = 'google') {
    const sb = getClient();
    if (!sb) throw new Error('Supabase não configurado.');
    const { data, error } = await sb.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;
    return data;
  }

  function onAuthStateChange(callback) {
    const sb = getClient();
    if (!sb || !sb.auth) return { data: { subscription: { unsubscribe: () => {} } } };
    try {
      return sb.auth.onAuthStateChange((event, session) => {
        notifyStatus();
        if (callback) callback(event, session);
      });
    } catch {
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
  }

  async function signInWithOtp(email) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase não configurado.');
    const { data, error } = await sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;
    return data;
  }

  async function updateUserMetadata(meta) {
    const sb = getClient();
    if (!sb) return null;
    try {
      const { data, error } = await sb.auth.updateUser({ data: meta });
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('Erro ao atualizar metadados do usuário:', e);
      return null;
    }
  }

  /**
   * Status change subscribers
   */
  function onSyncStatusChange(cb) {
    syncListeners.push(cb);
  }

  function notifyStatus(status = {}) {
    const info = {
      configured: isConfigured(),
      syncing: isSyncing,
      lastSync: Storage.getSettings()[SETTING_LAST_SYNC] || null,
      ...status
    };
    syncListeners.forEach(cb => {
      try { cb(info); } catch {}
    });
  }

  /**
   * Paginates through Supabase to retrieve ALL articles without the 1000 limit
   */
  async function fetchAllRemoteArticles(sb, projectId) {
    const all = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await sb
        .from('articles')
        .select('*')
        .eq('project_id', projectId)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.warn('Erro ao paginar artigos remotos do Supabase:', error);
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all;
  }

  /**
   * Bidirectional synchronization execution
   */
  async function syncAll(onProgress = null) {
    if (isSyncing) return { success: false, reason: 'Sincronização já em andamento' };
    const sb = getClient();
    if (!sb) return { success: false, reason: 'Supabase não conectado' };

    isSyncing = true;
    notifyStatus({ syncing: true });

    try {
      if (onProgress) onProgress('Verificando autenticação...');
      const session = await getSession();
      const userId = session?.user?.id || null;

      // ─── STEP 1: FLUSH OFFLINE MUTATION QUEUE (PUSH) ───
      if (onProgress) onProgress('Enviando alterações locais pendentes...');
      const queue = await Storage.getPendingSyncQueue();
      const resolvedQueueIds = [];

      for (const item of queue) {
        try {
          if (item.table === 'projects') {
            if (item.action === 'INSERT' || item.action === 'UPDATE') {
              const proj = Storage.getProject(item.record_id);
              if (proj) {
                await sb.from('projects').upsert({
                  id: proj.id,
                  name: proj.name,
                  description: proj.description || '',
                  keywords: proj.keywords || [],
                  exclude_keywords: proj.excludeKeywords || [],
                  review_type: proj.reviewType || 'systematic',
                  blind_mode: proj.blindMode || false,
                  stats: proj.stats,
                  updated_at: new Date().toISOString(),
                  ...(userId ? { user_id: userId } : {})
                });
              }
            } else if (item.action === 'DELETE') {
              await sb.from('projects').delete().eq('id', item.record_id);
            }
            resolvedQueueIds.push(item.id);
          } else if (item.table === 'articles') {
            if (item.action === 'UPDATE') {
              // Single article update
              const project = Storage.getProjects().find(p => (p.articles || []).some(a => a.id === item.record_id));
              if (project) {
                const art = project.articles.find(a => a.id === item.record_id);
                if (art) {
                  await sb.from('articles').upsert({
                    id: art.id,
                    project_id: project.id,
                    title: art.title,
                    abstract: art.abstract || '',
                    authors: art.authors || [],
                    year: art.year || '',
                    journal: art.journal || '',
                    doi: art.doi || '',
                    keywords: art.keywords || [],
                    decision: art.decision || null,
                    exclusion_reason: art.exclusion_reason || null,
                    note: art.note || '',
                    labels: art.labels || [],
                    is_duplicate: art.is_duplicate || false,
                    duplicate_score: art.duplicate_score || null,
                    updated_at: new Date().toISOString()
                  });
                }
              }
              resolvedQueueIds.push(item.id);
            } else if (item.action === 'BULK_INSERT' || item.action === 'BULK_UPDATE') {
              // Push pending articles of project in chunks of 500
              const project = Storage.getProject(item.record_id);
              if (project && project.articles && project.articles.length > 0) {
                const pendingArts = project.articles.filter(a => a.sync_status !== 'synced');
                const articlesToPush = pendingArts.length > 0 ? pendingArts : project.articles;
                const CHUNK_SIZE = 500;
                for (let c = 0; c < articlesToPush.length; c += CHUNK_SIZE) {
                  const chunk = articlesToPush.slice(c, c + CHUNK_SIZE).map(art => ({
                    id: art.id,
                    project_id: project.id,
                    title: art.title,
                    abstract: art.abstract || '',
                    authors: art.authors || [],
                    year: art.year || '',
                    journal: art.journal || '',
                    doi: art.doi || '',
                    keywords: art.keywords || [],
                    type: art.type || 'article',
                    volume: art.volume || '',
                    issue: art.issue || '',
                    pages: art.pages || '',
                    source_file: art.source_file || '',
                    decision: art.decision || null,
                    exclusion_reason: art.exclusion_reason || null,
                    note: art.note || '',
                    labels: art.labels || [],
                    is_duplicate: art.is_duplicate || false,
                    duplicate_score: art.duplicate_score || null,
                    duplicate_of: art.duplicate_of || null,
                    relevance_score: art.relevance_score || null,
                    imported_at: art.imported_at || new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  }));
                  try {
                    await sb.from('articles').upsert(chunk);
                  } catch (chunkErr) {
                    console.warn('Erro ao sincronizar chunk de artigos (dados locais preservados):', chunkErr);
                    break;
                  }
                }
              }
              resolvedQueueIds.push(item.id);
            } else if (item.action === 'DELETE') {
              await sb.from('articles').delete().eq('id', item.record_id);
              resolvedQueueIds.push(item.id);
            }
          } else if (item.table === 'labels') {
            if (item.action === 'INSERT' || item.action === 'UPDATE') {
              await sb.from('labels').upsert(item.payload);
            } else if (item.action === 'DELETE') {
              await sb.from('labels').delete().eq('id', item.record_id);
            }
            resolvedQueueIds.push(item.id);
          }
        } catch (itemErr) {
          console.warn('Erro ao processar item da fila de sync:', item, itemErr);
        }
      }

      if (resolvedQueueIds.length > 0) {
        await Storage.clearSyncQueue(resolvedQueueIds);
      }

      // ─── STEP 2: PULL REMOTE PROJECTS & ARTICLES (PULL) ───
      if (onProgress) onProgress('Baixando atualizações da nuvem...');
      const { data: remoteProjects, error: projErr } = await sb
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!projErr && Array.isArray(remoteProjects)) {
        for (const rp of remoteProjects) {
          const local = Storage.getProject(rp.id);
          
          // Fetch articles for this project with full pagination (bypass 1000 limit)
          const remoteArticles = await fetchAllRemoteArticles(sb, rp.id);

          const formattedArticles = (remoteArticles || []).map(ra => ({
            id: ra.id,
            title: ra.title,
            abstract: ra.abstract,
            authors: ra.authors || [],
            year: ra.year,
            journal: ra.journal,
            doi: ra.doi,
            keywords: ra.keywords || [],
            type: ra.type || 'article',
            source_file: ra.source_file || '',
            decision: ra.decision,
            exclusion_reason: ra.exclusion_reason,
            note: ra.note || '',
            labels: ra.labels || [],
            is_duplicate: ra.is_duplicate,
            duplicate_score: ra.duplicate_score,
            duplicate_of: ra.duplicate_of,
            relevance_score: ra.relevance_score,
            imported_at: ra.imported_at,
            sync_status: 'synced'
          }));

          // Fetch labels for this project
          const { data: remoteLabels } = await sb
            .from('labels')
            .select('*')
            .eq('project_id', rp.id);

          const projectData = {
            id: rp.id,
            name: rp.name,
            description: rp.description || '',
            keywords: rp.keywords || [],
            excludeKeywords: rp.exclude_keywords || [],
            reviewType: rp.review_type || 'systematic',
            blindMode: rp.blind_mode || false,
            created_at: rp.created_at,
            updated_at: rp.updated_at,
            articles: formattedArticles,
            labels: remoteLabels || [],
            stats: Storage.recalcStats(formattedArticles),
            sync_status: 'synced'
          };

          if (local) {
            // CRITICAL DEFENSE: Never wipe out local articles if local has more or equal articles!
            const localArticles = local.articles || [];
            const localCount = localArticles.length;
            const remoteCount = formattedArticles.length;

            if (localCount >= remoteCount && localCount > 0) {
              // Local is the authority: preserve all local articles, merging only remote decisions
              const remoteMap = new Map(formattedArticles.map(ra => [ra.id, ra]));
              localArticles.forEach(la => {
                const ra = remoteMap.get(la.id);
                if (ra) {
                  if (!la.decision && ra.decision) {
                    la.decision = ra.decision;
                    la.exclusion_reason = ra.exclusion_reason;
                  }
                  if (ra.note) la.note = ra.note;
                }
              });
              projectData.articles = localArticles;
              projectData.stats = Storage.recalcStats(localArticles);
            } else {
              // Remote has more articles: merge local articles into remote so none are lost
              const remoteMap = new Map(formattedArticles.map(ra => [ra.id, ra]));
              localArticles.forEach(la => {
                if (!remoteMap.has(la.id)) {
                  remoteMap.set(la.id, la);
                }
              });
              projectData.articles = Array.from(remoteMap.values());
              projectData.stats = Storage.recalcStats(projectData.articles);
            }

            Storage.updateProject(rp.id, { ...projectData, sync_status: 'synced' });
          } else {
            // Persist remote project directly preserving the original Cloud ID without queueing ghost mutations
            const fullProject = {
              ...projectData,
              sync_status: 'synced'
            };
            const currentProjs = Storage.getProjects();
            currentProjs.unshift(fullProject);
            await Storage.persistProjectToIDB(fullProject);
          }
        }
      }

      const syncTime = new Date().toISOString();
      Storage.saveSetting(SETTING_LAST_SYNC, syncTime);
      isSyncing = false;
      notifyStatus({ syncing: false, lastSync: syncTime, success: true });

      return { success: true, timestamp: syncTime };
    } catch (err) {
      console.error('Erro na sincronização híbrida com Supabase:', err);
      isSyncing = false;
      notifyStatus({ syncing: false, error: err.message });
      return { success: false, error: err.message };
    }
  }

  // Auto-sync listener on reconnection
  window.addEventListener('online', () => {
    if (isConfigured()) {
      console.log('Rede restabelecida. Disparando sincronização com Supabase...');
      syncAll();
    }
  });

  return {
    getClient,
    configure,
    isConfigured,
    getSession,
    getUser,
    signIn,
    signInWithOAuth,
    signInWithOtp,
    signUp,
    signOut,
    updateUserMetadata,
    syncAll,
    onSyncStatusChange,
    onAuthStateChange
  };
})();
