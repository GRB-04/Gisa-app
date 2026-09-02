/**
 * LitScan — Parsers Module
 * Supports: RIS, BibTeX (.bib), CSV, NBIB (PubMed), plain text
 */

const Parsers = (() => {

  /** Generate a short hash id from content */
  function hashId(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return Math.abs(h).toString(36) + '_' + Date.now().toString(36);
  }

  /** Decode LaTeX accent codes (common in BibTeX) */
  function decodeLaTeX(str) {
    if (!str) return '';
    return str
      .replace(/\\['`^~"c=d.bHkrtuv]\{?\\?([a-zA-Z])\}?/g, (m, c) => {
        if (m.includes("'")) return { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', Y: 'Ý', c: 'ç', C: 'Ç' }[c] || c;
        if (m.includes('`')) return { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' }[c] || c;
        if (m.includes('^')) return { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' }[c] || c;
        if (m.includes('~')) return { a: 'ã', o: 'õ', n: 'ñ', A: 'Ã', O: 'Õ', N: 'Ñ' }[c] || c;
        if (m.includes('"')) return { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' }[c] || c;
        if (m.includes('c')) return c === 'c' ? 'ç' : c === 'C' ? 'Ç' : c;
        return c;
      })
      .replace(/[\{\}]/g, '')
      .replace(/\\/g, '');
  }

  /** Normalize text for comparison */
  function clean(str) {
    return decodeLaTeX(str || '').trim().replace(/\s+/g, ' ');
  }

  /** Create a standard article object */
  function makeArticle(fields = {}, sourceFile = '') {
    const title = clean(fields.title || 'Sem título');
    const existingId = fields.id && typeof fields.id === 'string' && fields.id.trim() ? fields.id.trim() : null;
    return {
      id: existingId || hashId(title + (fields.doi || '') + (fields.year || '') + Math.random().toString(36)),
      title,
      abstract: clean(fields.abstract || ''),
      authors: Array.isArray(fields.authors) ? fields.authors : (fields.authors ? [fields.authors] : []),
      year: clean(String(fields.year || '')),
      journal: clean(fields.journal || ''),
      doi: clean(fields.doi || '').replace(/^https?:\/\/doi\.org\//i, ''),
      keywords: Array.isArray(fields.keywords) ? fields.keywords : [],
      type: clean(fields.type || 'article'),
      volume: clean(String(fields.volume || '')),
      issue: clean(String(fields.issue || '')),
      pages: clean(String(fields.pages || '')),
      source_file: fields.source_file || sourceFile,
      decision: fields.decision !== undefined ? fields.decision : null,
      exclusion_reason: fields.exclusion_reason !== undefined ? fields.exclusion_reason : null,
      note: fields.note || '',
      labels: Array.isArray(fields.labels) ? fields.labels : [],
      is_duplicate: Boolean(fields.is_duplicate),
      duplicate_score: fields.duplicate_score !== undefined ? fields.duplicate_score : null,
      duplicate_of: fields.duplicate_of || null,
      relevance_score: fields.relevance_score !== undefined ? fields.relevance_score : null,
      has_pdf: Boolean(fields.has_pdf || fields.pdf_data),
      pdf_name: fields.pdf_name || '',
      pdf_data: fields.pdf_data || null,
      imported_at: fields.imported_at || new Date().toISOString()
    };
  }

  // ─────────────────────────────────────────────
  // RIS Parser
  // ─────────────────────────────────────────────
  function parseRIS(content, fileName) {
    const articles = [];
    const records = content.split(/\nER\s*-?\s*|\r\nER\s*-?\s*/g);

    for (const record of records) {
      if (!record.trim()) continue;
      const lines = record.split(/\r?\n/);
      const fields = {};
      const authors = [];
      const keywords = [];

      for (const line of lines) {
        const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s*(.*)/);
        if (!m) continue;
        const [, tag, val] = m;
        const v = val.trim();

        switch (tag) {
          case 'TI': case 'T1': case 'CT': case 'BT':
            if (!fields.title) fields.title = v; break;
          case 'AB': case 'N2':
            fields.abstract = (fields.abstract || '') + v + ' '; break;
          case 'AU': case 'A1': case 'A2': case 'A3':
            if (v) authors.push(v); break;
          case 'PY': case 'Y1': case 'DA':
            if (!fields.year) {
              const yMatch = v.match(/\b(19\d\d|20\d\d)\b/);
              fields.year = yMatch ? yMatch[1] : v.split('/')[0].replace(/\D/g, '');
            }
            break;
          case 'JO': case 'JF': case 'T2': case 'J2':
            if (!fields.journal) fields.journal = v; break;
          case 'DO': case 'M3':
            if (!fields.doi && v.match(/10\./)) fields.doi = v; break;
          case 'KW': case 'DE':
            if (v) keywords.push(v); break;
          case 'TY':
            fields.type = v; break;
          case 'VL': fields.volume = v; break;
          case 'IS': fields.issue = v; break;
          case 'SP': fields.pages = v; break;
          case 'EP': fields.pages = (fields.pages ? fields.pages + '-' : '') + v; break;
        }
      }

      if (fields.title || authors.length) {
        articles.push(makeArticle({ ...fields, authors, keywords }, fileName));
      }
    }
    return articles;
  }

  // ─────────────────────────────────────────────
  // BibTeX Parser
  // ─────────────────────────────────────────────
  function parseBibTeX(content, fileName) {
    const articles = [];
    // Split on @ entries
    const entries = content.split(/@(?=[a-zA-Z]+\s*\{)/g).slice(1);

    for (const entry of entries) {
      const typeMatch = entry.match(/^([a-zA-Z]+)\s*\{([^,]+),/);
      if (!typeMatch) continue;

      const fields = { type: typeMatch[1] };
      const authors = [];
      const keywords = [];

      // Extract all key = {value}, key = "value" or key = 1234 pairs
      const fieldRe = /([a-zA-Z_]+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|([0-9a-zA-Z_-]+))/g;
      let m;
      while ((m = fieldRe.exec(entry)) !== null) {
        const key = m[1].toLowerCase();
        const rawVal = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] || ''));
        const val = rawVal.replace(/[{}]/g, '').trim();

        switch (key) {
          case 'title': fields.title = val; break;
          case 'abstract': fields.abstract = val; break;
          case 'author':
            val.split(/\s+and\s+/i).forEach(a => authors.push(a.trim())); break;
          case 'year': fields.year = val; break;
          case 'journal': case 'booktitle': case 'publisher':
            if (!fields.journal) fields.journal = val; break;
          case 'doi': fields.doi = val; break;
          case 'keywords':
            val.split(/[;,]/).map(k => k.trim()).filter(Boolean).forEach(k => keywords.push(k)); break;
          case 'volume': fields.volume = val; break;
          case 'number': fields.issue = val; break;
          case 'pages': fields.pages = val; break;
        }
      }

      if (fields.title) {
        articles.push(makeArticle({ ...fields, authors, keywords }, fileName));
      }
    }
    return articles;
  }

  // ─────────────────────────────────────────────
  // NBIB / PubMed Parser
  // ─────────────────────────────────────────────
  function parseNBIB(content, fileName) {
    const articles = [];
    const records = content.split(/\n\n(?=PMID-)/g);

    for (const record of records) {
      if (!record.trim()) continue;
      const lines = record.split(/\r?\n/);
      const fields = {};
      const authors = [];
      const keywords = [];

      for (const line of lines) {
        const m = line.match(/^([A-Z]{2,6})\s*-\s+(.*)/);
        if (!m) continue;
        const [, tag, val] = m;
        const v = val.trim();

        switch (tag) {
          case 'TI': fields.title = (fields.title || '') + v + ' '; break;
          case 'AB': fields.abstract = (fields.abstract || '') + v + ' '; break;
          case 'FAU': case 'AU': if (v) authors.push(v); break;
          case 'DP': fields.year = v.split(' ')[0].substring(0, 4); break;
          case 'JT': case 'TA': if (!fields.journal) fields.journal = v; break;
          case 'LID': case 'AID':
            if (!fields.doi && v.match(/10\./)) fields.doi = v.split(' ')[0]; break;
          case 'MH': case 'OT': if (v) keywords.push(v); break;
          case 'VI': fields.volume = v; break;
          case 'IP': fields.issue = v; break;
          case 'PG': fields.pages = v; break;
        }
      }

      if (fields.title || authors.length) {
        articles.push(makeArticle({ ...fields, authors, keywords }, fileName));
      }
    }
    return articles;
  }

  // ─────────────────────────────────────────────
  // CSV Parser
  // ─────────────────────────────────────────────
  function parseCSV(content, fileName) {
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    // Parse CSV respecting quoted fields
    function parseLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim()); current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    }

    const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
    const articles = [];

    // Column mapping
    const colMap = {
      title: ['title', 'titulo', 'tit', 'name'],
      abstract: ['abstract', 'resumo', 'abs', 'summary'],
      authors: ['authors', 'author', 'autores', 'autor'],
      year: ['year', 'ano', 'pub_year', 'publication_year', 'date'],
      journal: ['journal', 'revista', 'source', 'fonte', 'publication'],
      doi: ['doi', 'identifier'],
      keywords: ['keywords', 'palavras_chave', 'tags', 'mesh'],
    };

    function findCol(key) {
      for (const alias of colMap[key]) {
        const idx = headers.findIndex(h => h.includes(alias));
        if (idx !== -1) return idx;
      }
      return -1;
    }

    const titleIdx = findCol('title');
    const abstractIdx = findCol('abstract');
    const authorsIdx = findCol('authors');
    const yearIdx = findCol('year');
    const journalIdx = findCol('journal');
    const doiIdx = findCol('doi');
    const kwIdx = findCol('keywords');

    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      if (cols.every(c => !c)) continue;

      const title = titleIdx !== -1 ? cols[titleIdx] : '';
      if (!title && titleIdx !== -1) continue;

      const kwRaw = kwIdx !== -1 ? cols[kwIdx] : '';
      const keywords = kwRaw ? kwRaw.split(/[;|]/).map(k => k.trim()).filter(Boolean) : [];
      const authorsRaw = authorsIdx !== -1 ? cols[authorsIdx] : '';
      const authors = authorsRaw ? authorsRaw.split(/[;|]/).map(a => a.trim()).filter(Boolean) : [];

      articles.push(makeArticle({
        title: title || `Artigo linha ${i}`,
        abstract: abstractIdx !== -1 ? cols[abstractIdx] : '',
        authors,
        year: yearIdx !== -1 ? cols[yearIdx] : '',
        journal: journalIdx !== -1 ? cols[journalIdx] : '',
        doi: doiIdx !== -1 ? cols[doiIdx] : '',
        keywords
      }, fileName));
    }
    return articles;
  }

  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // PDF Metadata & Text Extraction via PDF.js & Heuristics
  // ─────────────────────────────────────────────
  async function parsePDF(file) {
    try {
      const buffer = await file.arrayBuffer();
      let extractedTitle = '';
      let extractedAbstract = '';
      let extractedAuthors = [];
      let extractedDoi = '';
      let extractedYear = '';
      let extractedKeywords = [];
      let allExtractedText = '';

      // 1. Try high-fidelity text extraction via PDF.js if available
      if (typeof window !== 'undefined' && window.pdfjsLib) {
        try {
          const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) });
          const pdfDoc = await loadingTask.promise;
          const maxPages = Math.min(pdfDoc.numPages, 3);
          const pageLines = [];

          for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            let currentLine = '';
            let lastY = null;

            for (const item of textContent.items) {
              const y = Math.round(item.transform[5]);
              if (lastY !== null && Math.abs(y - lastY) > 4) {
                if (currentLine.trim()) pageLines.push(currentLine.trim());
                currentLine = '';
              }
              currentLine += (currentLine ? ' ' : '') + item.str;
              lastY = y;
            }
            if (currentLine.trim()) pageLines.push(currentLine.trim());
          }

          allExtractedText = pageLines.join('\n');

          // Extract DOI from PDF text
          const doiMatch = allExtractedText.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
          if (doiMatch) {
            extractedDoi = doiMatch[0].replace(/[;,.)]+$/, '');
          }

          // Extract Year
          const yearMatch = allExtractedText.match(/\b(19\d{2}|20\d{2})\b/);
          if (yearMatch) {
            extractedYear = yearMatch[1];
          }

          // Extract Abstract
          const absRegex = /(?:abstract|resumo|resumen)[:\s\n]+([\s\S]{80,1800}?)(?=\n\s*(?:keywords|palavras-chave|tags|introdução|introduction|1\.)|\n\n\n)/i;
          const absMatch = allExtractedText.match(absRegex);
          if (absMatch) {
            extractedAbstract = absMatch[1].replace(/\s+/g, ' ').trim();
          }

          // Extract Title: take candidate line from first 8 lines that has good length and isn't header/journal info
          for (let i = 0; i < Math.min(pageLines.length, 10); i++) {
            const line = pageLines[i];
            if (line.length > 15 && line.length < 240 && 
                !/^(https?|doi|vol|volume|issue|issn|isbn|page|journal|revista|original|article|artigo)/i.test(line)) {
              extractedTitle = line;
              break;
            }
          }

          // Extract Keywords
          const kwRegex = /(?:keywords|palavras-chave|tags)[:\s\n]+([\s\S]{5,300}?)(?=\n\s*(?:introduction|introdução|1\.)|\n\n)/i;
          const kwMatch = allExtractedText.match(kwRegex);
          if (kwMatch) {
            kwMatch[1].split(/[,;•\n]/).map(k => k.trim()).filter(k => k.length > 2 && k.length < 50).forEach(k => extractedKeywords.push(k));
          }
        } catch (pdfErr) {
          console.warn('Falha no PDF.js, aplicando fallback heurístico:', pdfErr);
        }
      }

      // 2. Fallback byte-level extraction if PDF.js was unavailable or incomplete
      const bytes = new Uint8Array(buffer);
      let rawText = '';
      const sliceSize = Math.min(bytes.length, 196608);
      for (let i = 0; i < sliceSize; i++) {
        const c = bytes[i];
        if (c >= 32 && c <= 126) rawText += String.fromCharCode(c);
        else if (c === 10 || c === 13) rawText += '\n';
      }

      if (!extractedDoi) {
        const doiMatch = rawText.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
        if (doiMatch) extractedDoi = doiMatch[0].replace(/[;,.)]+$/, '');
      }

      if (!extractedTitle) {
        const metaTitleMatch = rawText.match(/\/Title\s*\(([^)]+)\)/);
        if (metaTitleMatch && metaTitleMatch[1].trim().length > 5) {
          extractedTitle = metaTitleMatch[1].replace(/\\([()\\])/g, '$1').trim();
        }
      }

      if (!extractedTitle || extractedTitle.toLowerCase().includes('untitled') || extractedTitle.toLowerCase().includes('microsoft word')) {
        extractedTitle = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim();
      }

      if (!extractedAbstract) {
        const absMatch = rawText.match(/(?:abstract|resumo)[:\s\n]+([\s\S]{100,1600}?)(?=\n\s*(?:keywords|palavras-chave|introduction|introdução|1\.)|\n\n)/i);
        if (absMatch) {
          extractedAbstract = absMatch[1].replace(/\s+/g, ' ').trim();
        }
      }

      const metaAuthMatch = rawText.match(/\/Author\s*\(([^)]+)\)/);
      if (metaAuthMatch && metaAuthMatch[1].trim().length > 2) {
        extractedAuthors.push(metaAuthMatch[1].replace(/\\([()\\])/g, '$1').trim());
      }

      if (!extractedYear) {
        const yearMatch = rawText.match(/(?:19|20)\d{2}/);
        if (yearMatch) extractedYear = yearMatch[0];
      }

      // 3. Generate Data URL for local reading/previewing
      let pdfDataUrl = null;
      if (file.size <= 35 * 1024 * 1024) {
        try {
          pdfDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          });
        } catch {}
      }

      return [makeArticle({
        title: extractedTitle,
        abstract: extractedAbstract || 'Documento científico em PDF importado diretamente. Você pode ler o texto integral no leitor de PDF integrado.',
        authors: extractedAuthors,
        year: extractedYear,
        doi: extractedDoi,
        keywords: extractedKeywords,
        journal: 'Documento Científico (PDF)',
        type: 'pdf',
        has_pdf: true,
        pdf_name: file.name,
        pdf_data: pdfDataUrl
      }, file.name)];
    } catch (e) {
      console.warn('Erro ao processar PDF:', e);
      return [makeArticle({
        title: file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
        abstract: 'Arquivo PDF carregado no projeto.',
        journal: 'Documento Científico (PDF)',
        type: 'pdf',
        has_pdf: true,
        pdf_name: file.name
      }, file.name)];
    }
  }

  // ─────────────────────────────────────────────
  // JSON / Gisa Backup Parser
  // ─────────────────────────────────────────────
  function parseJSON(content, fileName) {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        return data.map(item => makeArticle(item, fileName));
      } else if (data && Array.isArray(data.articles)) {
        return data.articles.map(item => makeArticle(item, fileName));
      }
      return [];
    } catch {
      return [];
    }
  }

  // ─────────────────────────────────────────────
  // Main parse dispatcher
  // ─────────────────────────────────────────────
  async function parseFile(file) {
    const name = file.name.toLowerCase();
    const ext = name.split('.').pop();

    if (ext === 'pdf') {
      return parsePDF(file);
    }

    const content = await file.text();

    if (ext === 'ris') return parseRIS(content, file.name);
    if (ext === 'bib') return parseBibTeX(content, file.name);
    if (ext === 'nbib' || name.includes('pubmed')) return parseNBIB(content, file.name);
    if (ext === 'csv') return parseCSV(content, file.name);
    if (ext === 'json') return parseJSON(content, file.name);

    if (ext === 'txt') {
      // Try to detect format
      if (content.includes('TY  -') || content.match(/^[A-Z]{2}\s+-/m)) return parseRIS(content, file.name);
      if (content.includes('@article') || content.includes('@Article')) return parseBibTeX(content, file.name);
      if (content.match(/^PMID-/m)) return parseNBIB(content, file.name);
      return parseCSV(content, file.name);
    }

    // fallback heuristics
    if (content.includes('TY  -')) return parseRIS(content, file.name);
    if (content.includes('@article')) return parseBibTeX(content, file.name);
    if (content.match(/^PMID-/m)) return parseNBIB(content, file.name);
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) return parseJSON(content, file.name);
    return parseCSV(content, file.name);
  }

  async function parseFiles(files) {
    const all = [];
    for (const f of files) {
      try {
        const arts = await parseFile(f);
        all.push(...arts);
      } catch (e) {
        console.warn(`Erro ao processar ${f.name}:`, e);
      }
    }
    return all;
  }

  return { parseFiles, parseFile, parseRIS, parseBibTeX, parseNBIB, parseCSV, parsePDF, parseJSON };
})();
