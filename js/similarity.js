/**
 * LitScan — Similarity & Deduplication Module
 * Uses Jaccard similarity on normalized tokens + DOI matching + author/year
 */

const Similarity = (() => {

  // Portuguese + English stopwords
  const STOPWORDS = new Set([
    'a','ao','aos','as','até','com','como','da','das','de','dela','delas','dele','deles',
    'depois','do','dos','e','ela','elas','ele','eles','em','entre','era','essa','essas',
    'esse','esses','esta','estas','este','estes','eu','foi','foram','há','isso','isto',
    'já','lhe','lhes','mais','mas','me','mesmo','meu','meus','minha','minhas','muito',
    'na','nas','nem','no','nos','não','nós','num','numa','o','os','ou','para','pela',
    'pelas','pelo','pelos','por','qual','quando','que','quem','se','sem','ser','seu',
    'seus','si','sobre','sua','suas','são','também','te','tem','tendo','ter','tinha',
    'tipo','toda','todas','todo','todos','tu','tua','tuas','teu','teus','um','uma',
    'uns','umas','você','vocês','à','às','é','the','a','an','and','or','but','in','on',
    'at','to','for','of','with','by','from','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','can','could','may','might',
    'shall','should','this','that','these','those','it','its','which','who','whom',
    'study','studies','research','paper','article','review','analysis','effect','effects',
    'association','risk','between','results','methods','conclusion','objective','background'
  ]);

  /** Tokenize and normalize text into a word set */
  function tokenize(text) {
    if (!text) return new Set();
    return new Set(
      text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w))
    );
  }

  /** Jaccard similarity between two sets */
  function jaccard(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  /** Levenshtein distance for short strings (DOI, year) */
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1]
          : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      }
    }
    return dp[m][n];
  }

  /** Normalize DOI for comparison */
  function normDOI(doi) {
    return (doi || '').toLowerCase().trim()
      .replace(/^https?:\/\/doi\.org\//i, '')
      .replace(/\s/g, '');
  }

  /** Compare two articles and return similarity score 0-100 */
  function compareArticles(a, b) {
    const titleA = tokenize(a.title), titleB = tokenize(b.title);
    const titleSim = jaccard(titleA, titleB);
    const absA = tokenize(a.abstract), absB = tokenize(b.abstract);
    const absSim = absA.size > 0 && absB.size > 0 ? jaccard(absA, absB) : 0;
    const yearMatch = a.year && b.year && String(a.year).trim() === String(b.year).trim() ? 1 : 0;
    const authA = tokenize((a.authors || []).join(' ')), authB = tokenize((b.authors || []).join(' '));
    const authSim = jaccard(authA, authB);

    const doiA = normDOI(a.doi), doiB = normDOI(b.doi);
    const isDoiMatch = !!(doiA && doiB && doiA === doiB);

    const score = isDoiMatch ? 100 : Math.round(
      (titleSim * 0.60 + absSim * 0.25 + yearMatch * 0.10 + authSim * 0.05) * 100
    );

    const commonTitleWords = [...titleA].filter(w => titleB.has(w));
    const commonAbsWords = [...absA].filter(w => absB.has(w)).slice(0, 10);

    let method = '';
    if (isDoiMatch) method = 'DOI idêntico';
    else if (titleSim > 0.9) method = 'Títulos quase idênticos';
    else if (titleSim > 0.7) method = 'Títulos muito similares';
    else if (absSim > 0.7) method = 'Resumos muito similares';
    else method = 'Similaridade parcial';

    return {
      score,
      method,
      details: {
        title: Math.round(titleSim * 100),
        abstract: Math.round(absSim * 100),
        year: yearMatch * 100,
        authors: Math.round(authSim * 100)
      },
      highlights: {
        title: commonTitleWords,
        abstract: commonAbsWords
      }
    };
  }


  /**
   * High-Performance Optimized findDuplicates
   * 1. Pre-tokenizes all articles once in O(N)
   * 2. Uses DOI hash map for instant O(1) DOI matches
   * 3. Uses inverted index on title tokens for candidate pruning
   * 4. Evaluates Jaccard similarity in milliseconds (< 50ms for 2,000 articles)
   */
  function findDuplicates(articles, minScore = 55) {
    if (!articles || articles.length < 2) return [];

    const n = articles.length;
    const pre = new Array(n);
    const doiMap = new Map();
    const tokenIndex = new Map();

    // 1. Pre-process articles in O(N)
    for (let i = 0; i < n; i++) {
      const a = articles[i];
      const titleTokens = tokenize(a.title);
      const absTokens = tokenize(a.abstract);
      const authTokens = tokenize((a.authors || []).join(' '));
      const doi = normDOI(a.doi);
      const year = a.year ? String(a.year).trim() : '';

      pre[i] = {
        article: a,
        titleTokens,
        absTokens,
        authTokens,
        doi,
        year
      };

      if (doi) {
        if (!doiMap.has(doi)) doiMap.set(doi, []);
        doiMap.get(doi).push(i);
      }

      // Index significant title tokens
      for (const t of titleTokens) {
        if (t.length >= 3) {
          if (!tokenIndex.has(t)) tokenIndex.set(t, []);
          tokenIndex.get(t).push(i);
        }
      }
    }

    const pairsMap = new Map();

    // Helper to evaluate a candidate pair (i, j)
    function evaluatePair(i, j) {
      if (i >= j) return;
      const key = `${i}_${j}`;
      if (pairsMap.has(key)) return;

      const pA = pre[i], pB = pre[j];
      const a = pA.article, b = pB.article;

      // 1. DOI Match (instant 100%)
      const isDoiMatch = !!(pA.doi && pB.doi && pA.doi === pB.doi);
      
      const titleSim = jaccard(pA.titleTokens, pB.titleTokens);
      const absSim = pA.absTokens.size > 0 && pB.absTokens.size > 0 ? jaccard(pA.absTokens, pB.absTokens) : 0;
      const yearMatch = pA.year && pB.year && pA.year === pB.year ? 1 : 0;
      const authSim = jaccard(pA.authTokens, pB.authTokens);

      const score = isDoiMatch ? 100 : Math.round(
        (titleSim * 0.60 + absSim * 0.25 + yearMatch * 0.10 + authSim * 0.05) * 100
      );

      if (score >= minScore) {
        let method = '';
        if (isDoiMatch) method = 'DOI idêntico';
        else if (titleSim > 0.9) method = 'Títulos quase idênticos';
        else if (titleSim > 0.7) method = 'Títulos muito similares';
        else if (absSim > 0.7) method = 'Resumos muito similares';
        else method = 'Similaridade parcial';

        const commonTitleWords = [...pA.titleTokens].filter(w => pB.titleTokens.has(w));
        const commonAbsWords = [...pA.absTokens].filter(w => pB.absTokens.has(w)).slice(0, 10);

        pairsMap.set(key, {
          articleA: a,
          articleB: b,
          score,
          method,
          details: {
            title: Math.round(titleSim * 100),
            abstract: Math.round(absSim * 100),
            year: yearMatch * 100,
            authors: Math.round(authSim * 100)
          },
          highlights: {
            title: commonTitleWords,
            abstract: commonAbsWords
          }
        });
      }
    }

    // Pass 1: DOI duplicates
    for (const indices of doiMap.values()) {
      if (indices.length > 1) {
        for (let x = 0; x < indices.length; x++) {
          for (let y = x + 1; y < indices.length; y++) {
            evaluatePair(indices[x], indices[y]);
          }
        }
      }
    }

    // Pass 2: Token-candidate pairs
    for (const indices of tokenIndex.values()) {
      if (indices.length > 1 && indices.length < 300) {
        for (let x = 0; x < indices.length; x++) {
          for (let y = x + 1; y < indices.length; y++) {
            evaluatePair(indices[x], indices[y]);
          }
        }
      }
    }

    // Fallback: If total pairs are small, full scan for high safety
    if (n <= 500) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          evaluatePair(i, j);
        }
      }
    }

    const pairs = Array.from(pairsMap.values());
    return pairs.sort((a, b) => b.score - a.score);
  }

  /**
   * Async Non-Blocking findDuplicates with Progress Reporting
   * Yields to the browser every few milliseconds to keep UI 100% responsive even with 40,000+ articles.
   */
  async function findDuplicatesAsync(articles, minScore = 55, onProgress = null) {
    if (!articles || articles.length < 2) return [];

    const n = articles.length;
    const pre = new Array(n);
    const doiMap = new Map();
    const tokenIndex = new Map();

    // 1. Pre-process articles in non-blocking batches
    for (let i = 0; i < n; i++) {
      const a = articles[i];
      const titleTokens = tokenize(a.title);
      const absTokens = tokenize(a.abstract);
      const authTokens = tokenize((a.authors || []).join(' '));
      const doi = normDOI(a.doi);
      const year = a.year ? String(a.year).trim() : '';

      pre[i] = {
        article: a,
        titleTokens,
        absTokens,
        authTokens,
        doi,
        year
      };

      if (doi) {
        if (!doiMap.has(doi)) doiMap.set(doi, []);
        doiMap.get(doi).push(i);
      }

      for (const t of titleTokens) {
        if (t.length >= 4) {
          if (!tokenIndex.has(t)) tokenIndex.set(t, []);
          tokenIndex.get(t).push(i);
        }
      }

      if (i % 2000 === 0 && i > 0) {
        if (onProgress) onProgress({ phase: 'index', current: i, total: n, pct: Math.round((i / n) * 35) });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    if (onProgress) onProgress({ phase: 'index', current: n, total: n, pct: 35 });

    const pairsMap = new Map();

    function evaluatePair(i, j) {
      if (i >= j) return;
      const key = `${i}_${j}`;
      if (pairsMap.has(key)) return;

      const pA = pre[i], pB = pre[j];
      const a = pA.article, b = pB.article;

      const isDoiMatch = !!(pA.doi && pB.doi && pA.doi === pB.doi);
      const titleSim = jaccard(pA.titleTokens, pB.titleTokens);
      const absSim = pA.absTokens.size > 0 && pB.absTokens.size > 0 ? jaccard(pA.absTokens, pB.absTokens) : 0;
      const yearMatch = pA.year && pB.year && pA.year === pB.year ? 1 : 0;
      const authSim = jaccard(pA.authTokens, pB.authTokens);

      const score = isDoiMatch ? 100 : Math.round(
        (titleSim * 0.60 + absSim * 0.25 + yearMatch * 0.10 + authSim * 0.05) * 100
      );

      if (score >= minScore) {
        let method = '';
        if (isDoiMatch) method = 'DOI idêntico';
        else if (titleSim > 0.9) method = 'Títulos quase idênticos';
        else if (titleSim > 0.7) method = 'Títulos muito similares';
        else if (absSim > 0.7) method = 'Resumos muito similares';
        else method = 'Similaridade parcial';

        const commonTitleWords = [...pA.titleTokens].filter(w => pB.titleTokens.has(w));
        const commonAbsWords = [...pA.absTokens].filter(w => pB.absTokens.has(w)).slice(0, 10);

        pairsMap.set(key, {
          articleA: a,
          articleB: b,
          score,
          method,
          details: {
            title: Math.round(titleSim * 100),
            abstract: Math.round(absSim * 100),
            year: yearMatch * 100,
            authors: Math.round(authSim * 100)
          },
          highlights: {
            title: commonTitleWords,
            abstract: commonAbsWords
          }
        });
      }
    }

    // Pass 1: Instant DOI duplicates
    for (const indices of doiMap.values()) {
      if (indices.length > 1) {
        for (let x = 0; x < indices.length; x++) {
          for (let y = x + 1; y < indices.length; y++) {
            evaluatePair(indices[x], indices[y]);
          }
        }
      }
    }

    // Pass 2: Token-candidate pairs with non-blocking slicing
    const tokenLists = Array.from(tokenIndex.values());
    const totalTokens = tokenLists.length;
    let lastYield = Date.now();

    for (let tIdx = 0; tIdx < totalTokens; tIdx++) {
      const indices = tokenLists[tIdx];
      // Skip over-represented tokens to prevent combinatorial explosions (> 100 occurrences)
      if (indices.length > 1 && indices.length <= 100) {
        for (let x = 0; x < indices.length; x++) {
          for (let y = x + 1; y < indices.length; y++) {
            evaluatePair(indices[x], indices[y]);
          }
        }
      }

      if (Date.now() - lastYield > 35) {
        const pct = 35 + Math.round((tIdx / totalTokens) * 65);
        if (onProgress) onProgress({ phase: 'compare', current: tIdx, total: totalTokens, pct: Math.min(99, pct) });
        await new Promise(r => setTimeout(r, 0));
        lastYield = Date.now();
      }
    }

    // Fallback: If small set (<= 500), full scan for high safety
    if (n <= 500) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          evaluatePair(i, j);
        }
      }
    }

    if (onProgress) onProgress({ phase: 'done', current: totalTokens, total: totalTokens, pct: 100 });

    const pairs = Array.from(pairsMap.values());
    return pairs.sort((a, b) => b.score - a.score);
  }


  /**
   * Mark duplicates in articles array
   * For each group, the first article is original, rest are duplicates
   * Returns updated articles with is_duplicate, duplicate_score, duplicate_of
   */
  function markDuplicates(articles, pairs, autoThreshold = 85) {
    const updated = articles.map(a => ({ ...a }));
    const idxMap = new Map(updated.map((a, i) => [a.id, i]));
    const markedAsDup = new Set();

    for (const pair of pairs) {
      if (pair.score < autoThreshold) continue;
      const idA = pair.articleA.id, idB = pair.articleB.id;
      // Keep A, mark B as duplicate (if not already marked as original of something)
      if (!markedAsDup.has(idA)) {
        const bIdx = idxMap.get(idB);
        if (bIdx !== undefined && !markedAsDup.has(idB)) {
          updated[bIdx].is_duplicate = true;
          updated[bIdx].duplicate_score = pair.score;
          updated[bIdx].duplicate_of = idA;
          markedAsDup.add(idB);
        }
      }
    }

    return updated;
  }

  /** Build fuzzy accent-insensitive and stem-aware Regex for keyword matching */
  function buildFuzzyRegex(kw) {
    if (!kw || !kw.trim()) return null;
    const cleanKw = kw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Derived root stem for cross-language matching (e.g., "educação"/"education" -> "educa")
    let stem = cleanKw;
    if (cleanKw.startsWith('educa')) {
      stem = 'educa';
    } else if (cleanKw.startsWith('violen')) {
      stem = 'violen';
    } else if (cleanKw.startsWith('feminicid')) {
      stem = 'feminicid';
    } else if (cleanKw.length >= 5) {
      // Remove common Portuguese and English suffixes
      const stripped = cleanKw.replace(/(ção|cao|ções|coes|tion|tional|cional|tivo|ativa|ativo|ation|ment)$/i, '');
      stem = stripped.length >= 4 ? stripped : cleanKw.substring(0, 4);
    }

    const mapChar = (ch) => {
      if (/[aáàãâ]/.test(ch)) return '[aáàãâAÁÀÃÂ]';
      if (/[eéèê]/.test(ch)) return '[eéèêEÉÈÊ]';
      if (/[iíìî]/.test(ch)) return '[iíìîIÍÌÎ]';
      if (/[oóòõô]/.test(ch)) return '[oóòõôOÓÒÕÔ]';
      if (/[uúùû]/.test(ch)) return '[uúùûUÚÙÛ]';
      if (/[cç]/.test(ch)) return '[cçCÇ]';
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const isWordChar = '[a-zA-Z0-9\\u00C0-\\u024F_-]';
    if (stem.length >= 4) {
      const stemPattern = [...stem].map(mapChar).join('');
      return new RegExp(`(?<!${isWordChar})(${isWordChar}*${stemPattern}${isWordChar}*)(?!${isWordChar})`, 'gi');
    } else {
      const fullPattern = [...cleanKw].map(mapChar).join('');
      return new RegExp(`(?<!${isWordChar})(${fullPattern})(?!${isWordChar})`, 'gi');
    }
  }

  const BILINGUAL_MAP = {
    'violencia': ['violence', 'violent'],
    'violência': ['violence', 'violent'],
    'feminicidio': ['femicide', 'feminicide', 'homicide'],
    'feminicídio': ['femicide', 'feminicide', 'homicide'],
    'juventude': ['youth', 'juvenile', 'young'],
    'criança': ['child', 'children', 'childhood', 'pediatric'],
    'crianca': ['child', 'children', 'childhood', 'pediatric'],
    'adolescente': ['adolescent', 'adolescents', 'teenager', 'teenagers'],
    'adolescentes': ['adolescent', 'adolescents', 'teenager', 'teenagers'],
    'saude': ['health', 'healthcare'],
    'saúde': ['health', 'healthcare'],
    'mulher': ['woman', 'women', 'female', 'females'],
    'mulheres': ['woman', 'women', 'female', 'females'],
    'educacao': ['education', 'educational'],
    'educação': ['education', 'educational'],
    'brasil': ['brazil', 'brazilian'],
    'mental': ['mental', 'psychiatric', 'psychological']
  };

  function getBilingualSynonyms(term) {
    if (!term) return [];
    const clean = term.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const direct = BILINGUAL_MAP[term.toLowerCase().trim()] || BILINGUAL_MAP[clean] || [];
    return direct;
  }

  /**
   * Score article relevance against keywords
   * Returns 0-100
   */
  function relevanceScore(article, keywords) {
    if (!keywords || keywords.length === 0) return null;
    const fullText = [article.title, article.abstract, ...(article.keywords || [])].join(' ');
    let score = 0;
    let found = 0;

    for (const kw of keywords) {
      const syns = getBilingualSynonyms(kw);
      const allKws = [kw, ...syns];

      let kwMatch = false;
      let titleMatch = false;

      for (const k of allKws) {
        const re = buildFuzzyRegex(k);
        if (!re) continue;

        // Reset lastIndex before each test since the regex is global (stateful)
        re.lastIndex = 0;
        if (article.title && re.test(article.title)) {
          titleMatch = true;
          kwMatch = true;
        }
        re.lastIndex = 0;
        if (fullText && re.test(fullText)) {
          kwMatch = true;
        }
      }

      if (kwMatch) {
        found++;
        if (titleMatch) score += 2;
        else score += 1;
      }
    }

    if (found === keywords.length && keywords.length > 0) score += keywords.length;
    const max = keywords.length * 3;
    return Math.min(100, Math.round((score / max) * 100));
  }

  /**
   * Highlight keyword occurrences safely in text without HTML tag collisions
   */
  function highlightKeywords(text, incKeywords = [], excKeywords = []) {
    if (!text) return '';
    let incList = [];
    let excList = [];

    if (Array.isArray(incKeywords)) {
      incList = incKeywords;
    } else if (typeof incKeywords === 'object' && incKeywords !== null) {
      excList = incKeywords.exclude || [];
      incList = incKeywords.include || [];
    }
    if (Array.isArray(excKeywords) && excKeywords.length > 0) {
      excList = excKeywords;
    }

    // Escape raw text first
    let escaped = escapeHtml(text);

    // Build unique patterns with placeholder token mapping to avoid recursive corruption
    const tokens = [];
    const saveToken = (html) => {
      const ph = `___GISA_HL_${tokens.length}___`;
      tokens.push({ ph, html });
      return ph;
    };

    // 1. Process exclusion keywords (Red)
    for (const kw of excList) {
      const re = buildFuzzyRegex(kw);
      if (!re) continue;
      escaped = escaped.replace(re, (m, g1) => saveToken(`<mark class="kw-exclude">${g1 || m}</mark>`));
    }

    // 2. Process inclusion keywords (Green)
    for (const kw of incList) {
      const re = buildFuzzyRegex(kw);
      if (!re) continue;
      escaped = escaped.replace(re, (m, g1) => saveToken(`<mark class="kw-include">${g1 || m}</mark>`));
    }

    // 3. Restore all tokenized markers
    for (const { ph, html } of tokens) {
      escaped = escaped.replace(ph, html);
    }

    return escaped;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { compareArticles, findDuplicates, findDuplicatesAsync, markDuplicates, relevanceScore, highlightKeywords, getBilingualSynonyms, tokenize, jaccard };
})();

