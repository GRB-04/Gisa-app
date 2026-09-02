/**
 * Gisa — Plataforma de Revisão Sistemática Inteligente
 * Storage Engine: High-Performance IndexedDB + Memory Cache + Supabase Sync Queue
 * 
 * Stores:
 *  - 'projects': Project/Collection metadata, configuration, blindMode, keywords
 *  - 'articles': Normalized article records with indexes on project_id, decision, doi, year, sync_status
 *  - 'labels': Project tags and color codes
 *  - 'settings': User profile and application preferences
 *  - 'sync_queue': Offline-first mutation log ready for Supabase synchronization
 */

const Storage = (() => {
  const DB_NAME = 'GisaDB';
  const DB_VERSION = 2;
  
  // Object Store Names
  const STORES = {
    PROJECTS: 'projects',
    ARTICLES: 'articles',
    LABELS: 'labels',
    SETTINGS: 'settings',
    SYNC_QUEUE: 'sync_queue'
  };

  const LEGACY_STORAGE_KEY = 'litscan_projects';
  const LEGACY_SETTINGS_KEY = 'litscan_settings';

  // L1 In-Memory Cache for 0ms synchronous UI rendering
  let memoryProjects = [];
  let memorySettings = {};
  let isHydrated = false;
  let dbInstance = null;
  const onHydratedCallbacks = [];

  /**
   * Open / Upgrade IndexedDB with specialized indexes
   */
  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve) => {
      if (!('indexedDB' in window)) {
        console.error('IndexedDB não suportado neste navegador.');
        return resolve(null);
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const oldVersion = e.oldVersion;

        // 1. Projects / Collections Store
        if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
          const pStore = db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
          pStore.createIndex('name', 'name', { unique: false });
          pStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // 2. Articles Store (High Volume)
        if (!db.objectStoreNames.contains(STORES.ARTICLES)) {
          const aStore = db.createObjectStore(STORES.ARTICLES, { keyPath: 'id' });
          aStore.createIndex('project_id', 'project_id', { unique: false });
          aStore.createIndex('decision', 'decision', { unique: false });
          aStore.createIndex('is_duplicate', 'is_duplicate', { unique: false });
          aStore.createIndex('doi', 'doi', { unique: false });
          aStore.createIndex('year', 'year', { unique: false });
          aStore.createIndex('sync_status', 'sync_status', { unique: false });
        } else if (oldVersion < 2) {
          const aStore = req.transaction.objectStore(STORES.ARTICLES);
          if (!aStore.indexNames.contains('project_id')) aStore.createIndex('project_id', 'project_id', { unique: false });
          if (!aStore.indexNames.contains('decision')) aStore.createIndex('decision', 'decision', { unique: false });
          if (!aStore.indexNames.contains('is_duplicate')) aStore.createIndex('is_duplicate', 'is_duplicate', { unique: false });
          if (!aStore.indexNames.contains('sync_status')) aStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // 3. Labels Store
        if (!db.objectStoreNames.contains(STORES.LABELS)) {
          const lStore = db.createObjectStore(STORES.LABELS, { keyPath: 'id' });
          lStore.createIndex('project_id', 'project_id', { unique: false });
        }

        // 4. Settings Store
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }

        // 5. Supabase Sync Queue Store
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const qStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
          qStore.createIndex('status', 'status', { unique: false });
          qStore.createIndex('created_at', 'created_at', { unique: false });
        }
      };

      req.onsuccess = () => {
        dbInstance = req.result;
        resolve(dbInstance);
      };

      req.onerror = () => {
        console.error('Falha ao abrir IndexedDB:', req.error);
        resolve(null);
      };
    });
  }

  /**
   * Helper: Execute transaction safely
   */
  async function runTx(storeNames, mode, callback) {
    const db = await openDB();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeNames, mode);
        const result = callback(tx);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => {
          console.error('Erro na transação IndexedDB:', tx.error);
          reject(tx.error);
        };
        tx.onabort = () => reject(new Error('Transação abortada'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate UUID v4
   */
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /**
   * Enqueue mutation for Supabase Sync
   */
  async function queueSyncMutation(table, action, recordId, payload) {
    try {
      await runTx([STORES.SYNC_QUEUE], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES.SYNC_QUEUE);
        store.add({
          table,
          action,
          record_id: recordId,
          payload,
          created_at: new Date().toISOString(),
          attempts: 0,
          status: 'pending'
        });
      });
    } catch (e) {
      console.warn('Não foi possível enfileirar sincronização:', e);
    }
  }

  /**
   * Recalculate project stats with clear separation between raw imports, duplicates, and screening pool
   */
  function recalcStats(articles = []) {
    const duplicates = articles.filter(a => a.is_duplicate).length;
    const total = articles.length;
    const screenable = Math.max(0, total - duplicates);
    return {
      total,
      screenable,
      included: articles.filter(a => a.decision === 'include').length,
      excluded: articles.filter(a => a.decision === 'exclude' && !a.is_duplicate).length,
      excludedDuplicates: duplicates,
      maybe: articles.filter(a => a.decision === 'maybe').length,
      pending: articles.filter(a => !a.decision && !a.is_duplicate).length,
      duplicates
    };
  }

  /**
   * Helper: Get current active logged-in user email
   */
  function getCurrentUserEmail() {
    const s = getSettings();
    if (s.user_profile && typeof s.user_profile === 'object' && s.user_profile.email) {
      return s.user_profile.email.trim().toLowerCase();
    }
    return '';
  }

  /**
   * Persist project and all its normalized articles into IndexedDB
   */
  async function persistProjectToIDB(project) {
    if (!project) return;
    try {
      await runTx([STORES.PROJECTS, STORES.ARTICLES, STORES.LABELS], 'readwrite', (tx) => {
        const pStore = tx.objectStore(STORES.PROJECTS);
        const aStore = tx.objectStore(STORES.ARTICLES);
        const lStore = tx.objectStore(STORES.LABELS);

        // 1. Put project header (omitting large articles array from header store for speed)
        const header = {
          id: project.id,
          owner_email: project.owner_email || getCurrentUserEmail(),
          name: project.name,
          description: project.description || '',
          keywords: project.keywords || [],
          excludeKeywords: project.excludeKeywords || [],
          reviewType: project.reviewType || 'systematic',
          blindMode: !!project.blindMode,
          created_at: project.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          stats: project.stats || recalcStats(project.articles || []),
          sync_status: project.sync_status || 'pending'
        };
        pStore.put(header);

        // 2. Put articles in batch
        if (Array.isArray(project.articles)) {
          project.articles.forEach(art => {
            aStore.put({
              ...art,
              project_id: project.id,
              sync_status: art.sync_status || 'pending',
              updated_at: art.updated_at || new Date().toISOString()
            });
          });
        }

        // 3. Put labels
        if (Array.isArray(project.labels)) {
          project.labels.forEach(lbl => {
            lStore.put({
              ...lbl,
              project_id: project.id
            });
          });
        }
      });
    } catch (err) {
      console.error('Falha ao persistir projeto no IndexedDB:', err);
    }
  }

  /**
   * Asynchronous Hydration from IndexedDB / Migration from LocalStorage
   */
  async function initAsync() {
    if (isHydrated) return memoryProjects;

    const db = await openDB();
    if (!db) {
      // Fallback to legacy localStorage
      try {
        memoryProjects = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
        memorySettings = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || '{}');
      } catch {
        memoryProjects = [];
        memorySettings = {};
      }
      isHydrated = true;
      return memoryProjects;
    }

    try {
      // 1. Load Settings
      await runTx([STORES.SETTINGS], 'readonly', (tx) => {
        const store = tx.objectStore(STORES.SETTINGS);
        const req = store.getAll();
        req.onsuccess = () => {
          (req.result || []).forEach(item => {
            memorySettings[item.key] = item.value;
          });
        };
      });

      // 2. Load Projects
      const projectsHeaders = await new Promise((resolve) => {
        const tx = db.transaction([STORES.PROJECTS], 'readonly');
        const req = tx.objectStore(STORES.PROJECTS).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      if (projectsHeaders.length > 0) {
        // Load articles & labels for each project
        const fullProjects = [];
        for (const p of projectsHeaders) {
          const articles = await new Promise((resolve) => {
            const tx = db.transaction([STORES.ARTICLES], 'readonly');
            const idx = tx.objectStore(STORES.ARTICLES).index('project_id');
            const req = idx.getAll(IDBKeyRange.only(p.id));
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          });

          const labels = await new Promise((resolve) => {
            const tx = db.transaction([STORES.LABELS], 'readonly');
            const idx = tx.objectStore(STORES.LABELS).index('project_id');
            const req = idx.getAll(IDBKeyRange.only(p.id));
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          });

          const calculatedStats = recalcStats(articles);
          // Self-healing: if IDB articles count is greater than p.stats.total (e.g. truncated by cloud sync)
          if (articles.length > (p.stats?.total || 0)) {
            p.stats = calculatedStats;
            try {
              const pTx = db.transaction([STORES.PROJECTS], 'readwrite');
              pTx.objectStore(STORES.PROJECTS).put({ ...p, stats: calculatedStats });
            } catch {}
          }

          fullProjects.push({
            ...p,
            owner_email: p.owner_email || '',
            articles,
            labels,
            stats: calculatedStats
          });
        }

        memoryProjects = fullProjects;
      } else {
        // Migration: check if legacy localStorage has data
        let legacyData = [];
        try {
          legacyData = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
        } catch { legacyData = []; }

        if (legacyData.length > 0) {
          console.log(`Migrando ${legacyData.length} projetos do LocalStorage para IndexedDB...`);
          memoryProjects = legacyData;
          for (const proj of legacyData) {
            await persistProjectToIDB(proj);
          }
          console.log('Migração para IndexedDB concluída com sucesso.');
        }
      }

      isHydrated = true;
      onHydratedCallbacks.forEach(cb => cb(memoryProjects));
      return memoryProjects;
    } catch (e) {
      console.error('Erro durante inicialização do Storage:', e);
      isHydrated = true;
      return memoryProjects;
    }
  }

  // Pre-trigger async hydration on script evaluation
  initAsync();

  // ─────────────────────────────────────────────────────
  // Synchronous L1 Read API (Instant UI rendering with User Isolation)
  // ─────────────────────────────────────────────────────

  function getProjects() {
    const activeEmail = getCurrentUserEmail();
    if (!activeEmail) {
      // Guest or unauthenticated state
      return memoryProjects.filter(p => !p.owner_email);
    }
    return memoryProjects.filter(p => {
      if (p.owner_email) {
        return p.owner_email.toLowerCase() === activeEmail;
      }
      // Auto-assign existing unassigned legacy project to current active user
      p.owner_email = activeEmail;
      persistProjectToIDB(p);
      return true;
    });
  }

  function getProject(id) {
    return memoryProjects.find(p => p.id === id) || null;
  }

  // ─────────────────────────────────────────────────────
  // High-Performance Write API (L1 Sync + L2 Async IDB)
  // ─────────────────────────────────────────────────────

  /**
   * Create a new project / collection (tagged with active owner_email)
   */
  function createProject(name, description = '', keywords = []) {
    const activeEmail = getCurrentUserEmail();
    const project = {
      id: uuid(),
      owner_email: activeEmail,
      name,
      description,
      keywords,
      excludeKeywords: [],
      reviewType: 'systematic',
      blindMode: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      articles: [],
      labels: [],
      stats: { total: 0, included: 0, excluded: 0, maybe: 0, pending: 0, duplicates: 0 },
      sync_status: 'pending'
    };

    memoryProjects.unshift(project);
    persistProjectToIDB(project);
    queueSyncMutation('projects', 'INSERT', project.id, project);

    return project;
  }

  /**
   * Update project metadata
   */
  function updateProject(id, updates) {
    const idx = memoryProjects.findIndex(p => p.id === id);
    if (idx === -1) return null;

    memoryProjects[idx] = {
      ...memoryProjects[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      sync_status: 'pending'
    };

    const updated = memoryProjects[idx];
    persistProjectToIDB(updated);
    queueSyncMutation('projects', 'UPDATE', id, updates);

    return updated;
  }

  /**
   * Delete project and all associated records from IDB
   */
  function deleteProject(id) {
    memoryProjects = memoryProjects.filter(p => p.id !== id);

    openDB().then(db => {
      if (!db) return;
      runTx([STORES.PROJECTS, STORES.ARTICLES, STORES.LABELS], 'readwrite', (tx) => {
        tx.objectStore(STORES.PROJECTS).delete(id);

        // Delete all articles belonging to project
        const aStore = tx.objectStore(STORES.ARTICLES);
        const aIndex = aStore.index('project_id');
        const aReq = aIndex.openKeyCursor(IDBKeyRange.only(id));
        aReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            aStore.delete(cursor.primaryKey);
            cursor.continue();
          }
        };

        // Delete all labels belonging to project
        const lStore = tx.objectStore(STORES.LABELS);
        const lIndex = lStore.index('project_id');
        const lReq = lIndex.openKeyCursor(IDBKeyRange.only(id));
        lReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            lStore.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      });
    });

    queueSyncMutation('projects', 'DELETE', id, { id });
  }

  /**
   * Batch add articles to a project with high throughput
   */
  function addArticles(projectId, newArticles) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return null;

    const existing = new Set((memoryProjects[pIdx].articles || []).map(a => a.id));
    const toAdd = newArticles
      .filter(a => !existing.has(a.id))
      .map(a => ({
        ...a,
        project_id: projectId,
        sync_status: 'pending',
        imported_at: a.imported_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

    if (!memoryProjects[pIdx].articles) memoryProjects[pIdx].articles = [];
    memoryProjects[pIdx].articles.push(...toAdd);
    memoryProjects[pIdx].stats = recalcStats(memoryProjects[pIdx].articles);
    memoryProjects[pIdx].updated_at = new Date().toISOString();

    // High performance batch insert in IndexedDB in a single atomic transaction
    openDB().then(db => {
      if (!db) return;
      runTx([STORES.ARTICLES, STORES.PROJECTS], 'readwrite', (tx) => {
        const aStore = tx.objectStore(STORES.ARTICLES);
        toAdd.forEach(art => aStore.put(art));
        
        // Update project header stats
        const pStore = tx.objectStore(STORES.PROJECTS);
        const pReq = pStore.get(projectId);
        pReq.onsuccess = () => {
          if (pReq.result) {
            pReq.result.stats = memoryProjects[pIdx].stats;
            pReq.result.updated_at = memoryProjects[pIdx].updated_at;
            pStore.put(pReq.result);
          }
        };
      });
    });

    // Log batch sync
    queueSyncMutation('articles', 'BULK_INSERT', projectId, { count: toAdd.length, ids: toAdd.map(a => a.id) });

    return memoryProjects[pIdx];
  }

  /**
   * Update single article decision, notes, or exclusion reasons
   */
  function updateArticle(projectId, articleId, updates) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return null;

    const aIdx = (memoryProjects[pIdx].articles || []).findIndex(a => a.id === articleId);
    if (aIdx === -1) return null;

    memoryProjects[pIdx].articles[aIdx] = {
      ...memoryProjects[pIdx].articles[aIdx],
      ...updates,
      sync_status: 'pending',
      updated_at: new Date().toISOString()
    };

    memoryProjects[pIdx].stats = recalcStats(memoryProjects[pIdx].articles);

    const updatedArt = memoryProjects[pIdx].articles[aIdx];

    // Async IDB persist
    openDB().then(db => {
      if (!db) return;
      runTx([STORES.ARTICLES, STORES.PROJECTS], 'readwrite', (tx) => {
        tx.objectStore(STORES.ARTICLES).put(updatedArt);
        const pStore = tx.objectStore(STORES.PROJECTS);
        const pReq = pStore.get(projectId);
        pReq.onsuccess = () => {
          if (pReq.result) {
            pReq.result.stats = memoryProjects[pIdx].stats;
            pStore.put(pReq.result);
          }
        };
      });
    });

    queueSyncMutation('articles', 'UPDATE', articleId, updates);
    return updatedArt;
  }

  /**
   * Bulk update articles (e.g. after automatic deduplication)
   */
  function bulkUpdateArticles(projectId, articlesUpdates) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return null;

    const updateMap = new Map(articlesUpdates.map(u => [u.id, u]));
    memoryProjects[pIdx].articles = (memoryProjects[pIdx].articles || []).map(a => {
      if (updateMap.has(a.id)) {
        return {
          ...a,
          ...updateMap.get(a.id),
          sync_status: 'pending',
          updated_at: new Date().toISOString()
        };
      }
      return a;
    });

    memoryProjects[pIdx].stats = recalcStats(memoryProjects[pIdx].articles);

    // Persist in IndexedDB
    openDB().then(db => {
      if (!db) return;
      runTx([STORES.ARTICLES, STORES.PROJECTS], 'readwrite', (tx) => {
        const aStore = tx.objectStore(STORES.ARTICLES);
        articlesUpdates.forEach(u => {
          const fullArt = memoryProjects[pIdx].articles.find(a => a.id === u.id);
          if (fullArt) aStore.put(fullArt);
        });
        const pStore = tx.objectStore(STORES.PROJECTS);
        const pReq = pStore.get(projectId);
        pReq.onsuccess = () => {
          if (pReq.result) {
            pReq.result.stats = memoryProjects[pIdx].stats;
            pStore.put(pReq.result);
          }
        };
      });
    });

    queueSyncMutation('articles', 'BULK_UPDATE', projectId, { count: articlesUpdates.length });
    return memoryProjects[pIdx];
  }

  /**
   * Delete single article
   */
  function deleteArticle(projectId, articleId) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return;

    memoryProjects[pIdx].articles = (memoryProjects[pIdx].articles || []).filter(a => a.id !== articleId);
    memoryProjects[pIdx].stats = recalcStats(memoryProjects[pIdx].articles);

    openDB().then(db => {
      if (!db) return;
      runTx([STORES.ARTICLES, STORES.PROJECTS], 'readwrite', (tx) => {
        tx.objectStore(STORES.ARTICLES).delete(articleId);
        const pStore = tx.objectStore(STORES.PROJECTS);
        const pReq = pStore.get(projectId);
        pReq.onsuccess = () => {
          if (pReq.result) {
            pReq.result.stats = memoryProjects[pIdx].stats;
            pStore.put(pReq.result);
          }
        };
      });
    });

    queueSyncMutation('articles', 'DELETE', articleId, { id: articleId });
  }

  /**
   * Delete all articles belonging to a specific imported source file
   */
  function deleteArticlesBySourceFile(projectId, sourceFileName) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return null;

    const removedArticles = (memoryProjects[pIdx].articles || []).filter(a => a.source_file === sourceFileName);
    const removedIds = removedArticles.map(a => a.id);

    memoryProjects[pIdx].articles = (memoryProjects[pIdx].articles || []).filter(a => a.source_file !== sourceFileName);
    memoryProjects[pIdx].stats = recalcStats(memoryProjects[pIdx].articles);
    memoryProjects[pIdx].updated_at = new Date().toISOString();

    openDB().then(db => {
      if (!db) return;
      runTx([STORES.ARTICLES, STORES.PROJECTS], 'readwrite', (tx) => {
        const aStore = tx.objectStore(STORES.ARTICLES);
        removedIds.forEach(id => aStore.delete(id));
        const pStore = tx.objectStore(STORES.PROJECTS);
        const pReq = pStore.get(projectId);
        pReq.onsuccess = () => {
          if (pReq.result) {
            pReq.result.stats = memoryProjects[pIdx].stats;
            pReq.result.updated_at = memoryProjects[pIdx].updated_at;
            pStore.put(pReq.result);
          }
        };
      });
    });

    queueSyncMutation('articles', 'BULK_DELETE', projectId, { count: removedIds.length, ids: removedIds, source_file: sourceFileName });
    return memoryProjects[pIdx];
  }

  // ─────────────────────────────────────────────────────
  // Label Management
  // ─────────────────────────────────────────────────────

  const LABEL_COLORS = [
    '#6366f1','#8b5cf6','#ec4899','#f43f5e','#ef4444',
    '#f97316','#eab308','#22c55e','#14b8a6','#06b6d4',
    '#3b82f6','#64748b'
  ];

  function createLabel(projectId, name, color = null) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return null;
    if (!memoryProjects[pIdx].labels) memoryProjects[pIdx].labels = [];

    const existingColors = memoryProjects[pIdx].labels.map(l => l.color);
    const autoColor = color || LABEL_COLORS.find(c => !existingColors.includes(c)) || LABEL_COLORS[0];

    const label = { id: uuid(), project_id: projectId, name: name.trim(), color: autoColor };
    memoryProjects[pIdx].labels.push(label);

    openDB().then(db => {
      if (!db) return;
      runTx([STORES.LABELS], 'readwrite', tx => tx.objectStore(STORES.LABELS).put(label));
    });

    queueSyncMutation('labels', 'INSERT', label.id, label);
    return label;
  }

  function updateLabel(projectId, labelId, updates) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1 || !memoryProjects[pIdx].labels) return null;

    const lIdx = memoryProjects[pIdx].labels.findIndex(l => l.id === labelId);
    if (lIdx === -1) return null;

    memoryProjects[pIdx].labels[lIdx] = { ...memoryProjects[pIdx].labels[lIdx], ...updates };
    const updated = memoryProjects[pIdx].labels[lIdx];

    openDB().then(db => {
      if (!db) return;
      runTx([STORES.LABELS], 'readwrite', tx => tx.objectStore(STORES.LABELS).put(updated));
    });

    queueSyncMutation('labels', 'UPDATE', labelId, updates);
    return updated;
  }

  function deleteLabel(projectId, labelId) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return;

    memoryProjects[pIdx].labels = (memoryProjects[pIdx].labels || []).filter(l => l.id !== labelId);
    
    // Track only articles that actually contained this label
    const affectedArticles = [];
    memoryProjects[pIdx].articles = (memoryProjects[pIdx].articles || []).map(a => {
      if (Array.isArray(a.labels) && a.labels.includes(labelId)) {
        const updatedArt = {
          ...a,
          labels: a.labels.filter(id => id !== labelId),
          updated_at: new Date().toISOString()
        };
        affectedArticles.push(updatedArt);
        return updatedArt;
      }
      return a;
    });

    openDB().then(db => {
      if (!db) return;
      runTx([STORES.LABELS, STORES.ARTICLES], 'readwrite', tx => {
        tx.objectStore(STORES.LABELS).delete(labelId);
        const aStore = tx.objectStore(STORES.ARTICLES);
        affectedArticles.forEach(art => aStore.put(art));
      });
    });

    queueSyncMutation('labels', 'DELETE', labelId, { id: labelId });
  }

  function toggleArticleLabel(projectId, articleId, labelId) {
    const pIdx = memoryProjects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return null;

    const aIdx = (memoryProjects[pIdx].articles || []).findIndex(a => a.id === articleId);
    if (aIdx === -1) return null;

    const current = memoryProjects[pIdx].articles[aIdx].labels || [];
    const newLabels = current.includes(labelId)
      ? current.filter(id => id !== labelId)
      : [...current, labelId];

    return updateArticle(projectId, articleId, { labels: newLabels });
  }

  // ─────────────────────────────────────────────────────
  // Settings & Sync Queue Helpers
  // ─────────────────────────────────────────────────────

  function getSettings() {
    return memorySettings;
  }

  function saveSetting(key, value) {
    memorySettings[key] = value;
    openDB().then(db => {
      if (!db) return;
      runTx([STORES.SETTINGS], 'readwrite', tx => {
        tx.objectStore(STORES.SETTINGS).put({ key, value, updated_at: new Date().toISOString() });
      });
    });
  }

  // ─── USER PROFILE MANAGEMENT ─────────────────────────
  const DEFAULT_PROFILE = {
    name: 'Pesquisador(a)',
    email: '',
    avatar: '👩‍🔬',
    institution: '',
    role: 'Pesquisador(a) Principal',
    bio: 'Revisão Sistemática e Análise Científica com Gisa.',
    theme: 'dark',
    updated_at: new Date().toISOString()
  };

  function getProfile() {
    const s = getSettings();
    if (s.user_profile && typeof s.user_profile === 'object') {
      return { ...DEFAULT_PROFILE, ...s.user_profile };
    }
    return { ...DEFAULT_PROFILE };
  }

  function saveProfile(profileData) {
    const current = getProfile();
    const updated = {
      ...current,
      ...profileData,
      updated_at: new Date().toISOString()
    };
    saveSetting('user_profile', updated);
    return updated;
  }

  function getUserStats() {
    const projects = getProjects();
    let totalArticles = 0;
    let included = 0;
    let excluded = 0;
    let maybe = 0;
    let duplicates = 0;
    let withPdf = 0;

    projects.forEach(p => {
      const arts = p.articles || [];
      totalArticles += arts.length;
      arts.forEach(a => {
        if (a.decision === 'include') included++;
        else if (a.decision === 'exclude') excluded++;
        else if (a.decision === 'maybe') maybe++;
        if (a.is_duplicate) duplicates++;
        if (a.has_pdf || a.pdf_data) withPdf++;
      });
    });

    return {
      totalProjects: projects.length,
      totalArticles,
      included,
      excluded,
      maybe,
      duplicates,
      withPdf
    };
  }

  // ─── ARTICLE PDF ATTACHMENT ──────────────────────────
  async function attachArticlePdf(projectId, articleId, pdfDataUrl, fileName) {
    return updateArticle(projectId, articleId, {
      has_pdf: true,
      pdf_data: pdfDataUrl,
      pdf_name: fileName || 'artigo.pdf'
    });
  }

  async function removeArticlePdf(projectId, articleId) {
    return updateArticle(projectId, articleId, {
      has_pdf: false,
      pdf_data: null,
      pdf_name: ''
    });
  }

  /**
   * Retrieve pending mutation log for Supabase hybrid synchronization
   */
  async function getPendingSyncQueue() {
    const db = await openDB();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  /**
   * Clear resolved mutations from sync queue
   */
  async function clearSyncQueue(ids = []) {
    const db = await openDB();
    if (!db || ids.length === 0) return;
    return runTx([STORES.SYNC_QUEUE], 'readwrite', (tx) => {
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      ids.forEach(id => store.delete(id));
    });
  }

  /**
   * Self-healing recovery: re-read all articles directly from IndexedDB articles store
   * In case memory or project header was truncated by a cloud sync
   */
  async function restoreProjectArticlesFromIDB(projectId) {
    const db = await openDB();
    if (!db) return { recovered: false, total: 0 };

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORES.ARTICLES, STORES.PROJECTS], 'readwrite');
        const aStore = tx.objectStore(STORES.ARTICLES);
        const pStore = tx.objectStore(STORES.PROJECTS);
        const idx = aStore.index('project_id');
        const req = idx.getAll(IDBKeyRange.only(projectId));

        req.onsuccess = () => {
          const idbArticles = req.result || [];
          const pIdx = memoryProjects.findIndex(p => p.id === projectId);
          if (pIdx !== -1) {
            const currentCount = (memoryProjects[pIdx].articles || []).length;
            if (idbArticles.length > currentCount) {
              console.log(`[Gisa Recovery] Restaurando ${idbArticles.length} artigos para o projeto ${projectId} (tinha ${currentCount})`);
              memoryProjects[pIdx].articles = idbArticles;
              memoryProjects[pIdx].stats = recalcStats(idbArticles);
              memoryProjects[pIdx].updated_at = new Date().toISOString();

              const pReq = pStore.get(projectId);
              pReq.onsuccess = () => {
                if (pReq.result) {
                  pReq.result.stats = memoryProjects[pIdx].stats;
                  pReq.result.updated_at = memoryProjects[pIdx].updated_at;
                  pStore.put(pReq.result);
                }
              };
              resolve({ recovered: true, total: idbArticles.length, previous: currentCount });
              return;
            }
          }
          resolve({ recovered: false, total: idbArticles.length });
        };

        req.onerror = () => {
          resolve({ recovered: false, error: req.error });
        };
      } catch (err) {
        resolve({ recovered: false, error: err });
      }
    });
  }

  /**
   * Auto-check all projects against IndexedDB and heal any truncated projects
   */
  async function checkAndRecoverAllProjects() {
    const db = await openDB();
    if (!db) return 0;
    let totalRecovered = 0;

    for (let i = 0; i < memoryProjects.length; i++) {
      const p = memoryProjects[i];
      try {
        const idbCount = await new Promise((resolve) => {
          const tx = db.transaction([STORES.ARTICLES], 'readonly');
          const idx = tx.objectStore(STORES.ARTICLES).index('project_id');
          const req = idx.count(IDBKeyRange.only(p.id));
          req.onsuccess = () => resolve(req.result || 0);
          req.onerror = () => resolve(0);
        });

        const currentCount = (p.articles || []).length;
        if (idbCount > currentCount) {
          console.log(`[Gisa Auto-Healing] Projeto "${p.name}" tem ${idbCount} artigos no IDB mas apenas ${currentCount} na memória. Recuperando...`);
          const res = await restoreProjectArticlesFromIDB(p.id);
          if (res && res.recovered) {
            totalRecovered += (res.total - currentCount);
          }
        }
      } catch (err) {
        console.warn('Erro ao verificar integridade do projeto:', p.id, err);
      }
    }
    return totalRecovered;
  }

  function onHydrated(callback) {
    if (isHydrated) callback(memoryProjects);
    else onHydratedCallbacks.push(callback);
  }

  return {
    uuid,
    initAsync,
    onHydrated,
    getProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    addArticles,
    updateArticle,
    bulkUpdateArticles,
    deleteArticle,
    deleteArticlesBySourceFile,
    createLabel,
    updateLabel,
    deleteLabel,
    toggleArticleLabel,
    getSettings,
    saveSetting,
    getProfile,
    saveProfile,
    getUserStats,
    attachArticlePdf,
    removeArticlePdf,
    recalcStats,
    persistProjectToIDB,
    getPendingSyncQueue,
    clearSyncQueue,
    restoreProjectArticlesFromIDB,
    checkAndRecoverAllProjects,
    LABEL_COLORS,
    STORES
  };
})();
