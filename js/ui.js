/**
 * LitScan — UI Rendering Module
 * All dynamic DOM generation lives here
 */

const UI = (() => {

  /* ── Utilities ───────────────────────────────────────── */
  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    children.forEach(c => {
      if (c == null) return;
      e.append(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function fmt(n) { return (n || 0).toLocaleString('pt-BR'); }

  function decisionLabel(d) {
    if (d === 'include') return '<span class="badge badge-include">✓ Incluído</span>';
    if (d === 'exclude') return '<span class="badge badge-exclude">✗ Excluído</span>';
    if (d === 'maybe')   return '<span class="badge badge-maybe">? Talvez</span>';
    return '<span class="badge badge-pending">· Pendente</span>';
  }

  function scoreBar(score, label = '') {
    const color = score >= 85 ? '#ef4444' : score >= 60 ? '#f59e0b' : '#22c55e';
    return `
      <div class="score-bar-wrap">
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${score}%;background:${color}"></div>
        </div>
        <span class="score-label" style="color:${color}">${score}% ${label}</span>
      </div>`;
  }

  /* ── Toast notifications ─────────────────────────────── */
  function toast(msg, type = 'info', duration = 3000) {
    const wrap = document.getElementById('toast-container') || (() => {
      const d = el('div', { id: 'toast-container' });
      document.body.appendChild(d);
      return d;
    })();
    const t = el('div', { class: `toast toast-${type}` }, msg);
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-visible'));
    setTimeout(() => {
      t.classList.remove('toast-visible');
      setTimeout(() => t.remove(), 400);
    }, duration);
  }

  /* ── Modal ───────────────────────────────────────────── */
  function modal(title, bodyHtml, actions = []) {
    const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } });
    const box = el('div', { class: 'modal-box' });
    const header = el('div', { class: 'modal-header' },
      el('h3', { class: 'modal-title' }, title),
      el('button', { class: 'modal-close', 'aria-label': 'Fechar modal', onclick: () => overlay.remove() }, '×')
    );
    const body = el('div', { class: 'modal-body', html: bodyHtml });
    const footer = el('div', { class: 'modal-footer' });
    actions.forEach(({ label, style, cb }) => {
      const btn = el('button', { class: `btn ${style || 'btn-ghost'}`, onclick: () => { if (cb) cb(); overlay.remove(); } }, label);
      footer.appendChild(btn);
    });
    box.append(header, body, footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return overlay;
  }

  /* ── Project Card ────────────────────────────────────── */
  function renderProjectCard(project, onOpen, onDelete) {
    const pct = project.stats.total > 0
      ? Math.round(((project.stats.total - project.stats.pending) / project.stats.total) * 100)
      : 0;
    const date = new Date(project.created_at).toLocaleDateString('pt-BR');

    const card = el('div', { class: 'project-card', onclick: onOpen });
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-icon">📄</div>
        <div class="project-meta">
          <h3 class="project-name">${escapeHtml(project.name)}</h3>
          <span class="project-date">Criado em ${date}</span>
        </div>
        <button class="btn-icon danger delete-btn" title="Excluir projeto" aria-label="Excluir projeto ${escapeHtml(project.name)}">✕</button>
      </div>
      ${project.description ? `<p class="project-desc">${escapeHtml(project.description)}</p>` : ''}
      <div class="project-stats">
        <div class="stat-chip total"><span>${fmt(project.stats.total)}</span><small>artigos</small></div>
        <div class="stat-chip include"><span>${fmt(project.stats.included)}</span><small>incluídos</small></div>
        <div class="stat-chip exclude"><span>${fmt(project.stats.excluded)}</span><small>excluídos</small></div>
        <div class="stat-chip maybe"><span>${fmt(project.stats.maybe)}</span><small>talvez</small></div>
        <div class="stat-chip pending"><span>${fmt(project.stats.pending)}</span><small>pendentes</small></div>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-label">${pct}% triado</div>
    `;
    card.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); onDelete(); });
    return card;
  }

  /* ── Article Card ────────────────────────────────────── */
  function renderArticleCard(article, keywords, callbacks) {
    const { onInclude, onExclude, onMaybe, onNote, onDelete } = callbacks;
    const hasKw = keywords && (Array.isArray(keywords) ? keywords.length > 0 : ((keywords.include && keywords.include.length > 0) || (keywords.exclude && keywords.exclude.length > 0)));

    const titleHtml = hasKw
      ? Similarity.highlightKeywords(article.title, keywords)
      : escapeHtml(article.title || 'Sem título');
    const abstractHtml = hasKw
      ? Similarity.highlightKeywords((article.abstract || '').substring(0, 400), keywords)
      : escapeHtml((article.abstract || '').substring(0, 400));

    const card = el('div', {
      class: `article-card ${article.decision ? 'decided' : ''} decision-${article.decision || 'none'}`,
      id: `art-${article.id}`
    });

    const relevBadge = article.relevance_score !== null && article.relevance_score > 0
      ? `<span class="badge badge-relevance" title="Relevância ao tema">${article.relevance_score}% relev.</span>`
      : '';
    const dupBadge = article.is_duplicate
      ? `<span class="badge badge-dup" title="Possível duplicata (${article.duplicate_score}%)">Duplicata ${article.duplicate_score}%</span>`
      : '';
    const pdfBadge = (article.has_pdf || article.pdf_data)
      ? `<span class="badge badge-purple" title="Possui PDF anexado">📄 PDF</span>`
      : '';

    const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(article.title)}`;
    const doiUrl = article.doi ? `https://doi.org/${article.doi}` : scholarUrl;

    const abstractDisplay = abstractHtml
      ? `<p class="article-abstract">${abstractHtml}${(article.abstract||'').length > 400 ? '… <a href="#" class="view-more-btn" style="color:var(--purple);font-size:0.8rem;font-weight:600">Ler resumo completo</a>' : ''}</p>`
      : `<div style="margin:8px 0;padding:8px 12px;background:var(--bg-card2);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--text-muted);display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span>O arquivo não possui resumo.</span>
          <a href="${scholarUrl}" target="_blank" onclick="event.stopPropagation()" class="btn btn-sm btn-secondary" style="font-size:0.75rem">Abrir no Scholar</a>
        </div>`;

    const exReasonBadge = (article.decision === 'exclude' && article.exclusion_reason)
      ? `<span class="badge badge-exclude" title="Motivo: ${escapeHtml(article.exclusion_reason)}">Motivo: ${escapeHtml(article.exclusion_reason)}</span>`
      : '';

    card.innerHTML = `
      <div class="article-card-inner">
        <div class="article-card-top">
          <div class="article-badges">${relevBadge}${dupBadge}${pdfBadge}${decisionLabel(article.decision)}${exReasonBadge}</div>
          <span style="font-size:0.78rem;color:var(--text-muted)">${article.year ? `📅 ${escapeHtml(article.year)}` : ''}${article.journal ? ` · ${escapeHtml(article.journal)}` : ''}</span>
        </div>
        <h4 class="article-title" style="cursor:pointer" title="Clique para abrir detalhes">${titleHtml}</h4>
        <div class="article-meta">
          ${(article.authors || []).length ? `<span>Autores: ${escapeHtml(article.authors.slice(0,4).join('; '))}${article.authors.length > 4 ? ` +${article.authors.length-4}` : ''}</span>` : ''}
          ${article.doi ? `<span> · DOI: <a href="${doiUrl}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(article.doi)}</a></span>` : ''}
        </div>
        <div class="article-abstract-editorial">
          ${abstractDisplay}
        </div>
        ${article.note ? `<div class="article-note">Nota: ${escapeHtml(article.note)}</div>` : ''}
        <div class="article-footer" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
          <div class="article-actions-row">
            <button class="btn btn-sm btn-include ${article.decision === 'include' ? 'active' : ''}" data-action="include" title="Incluir" aria-pressed="${article.decision === 'include'}">Incluir</button>
            <button class="btn btn-sm btn-maybe ${article.decision === 'maybe' ? 'active' : ''}" data-action="maybe" title="Talvez" aria-pressed="${article.decision === 'maybe'}">Talvez</button>
            <button class="btn btn-sm btn-exclude ${article.decision === 'exclude' ? 'active' : ''}" data-action="exclude" title="Excluir" aria-pressed="${article.decision === 'exclude'}">Excluir</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm ai-analyze-btn" style="background:linear-gradient(135deg,var(--purple-dark),var(--violet));color:white;box-shadow:0 2px 10px var(--purple-glow)" title="Analisar com IA (PICO, Resumo e Chat)">Analisar com IA</button>
            <button class="btn btn-sm btn-ghost note-btn" title="Adicionar nota">Nota</button>
            <a href="${scholarUrl}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem;color:var(--purple);text-decoration:none;font-weight:600">Scholar ↗</a>
          </div>
        </div>
      </div>
    `;

    card.querySelector('[data-action="include"]').onclick = (e) => { e.stopPropagation(); onInclude(); };
    card.querySelector('[data-action="maybe"]').onclick = (e) => { e.stopPropagation(); onMaybe(); };
    card.querySelector('[data-action="exclude"]').onclick = (e) => { e.stopPropagation(); onExclude(); };
    card.querySelector('.note-btn').onclick = (e) => { e.stopPropagation(); onNote(); };
    card.querySelector('.ai-analyze-btn').onclick = (e) => { e.stopPropagation(); UI.showAIAnalysisModal(article); };

    // Click title or 'view-more-btn' to open detail modal
    const showDetail = (e) => {
      e.stopPropagation();
      modal(
        article.title,
        `<div style="display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:0.85rem;color:var(--text-muted);">
            <div><strong>Autores:</strong> ${escapeHtml((article.authors || []).join('; ')) || 'Não especificado'}</div>
            <div><strong>Ano:</strong> ${escapeHtml(article.year) || '—'} · <strong>Revista:</strong> ${escapeHtml(article.journal) || '—'}</div>
            ${article.doi ? `<div><strong>DOI:</strong> <a href="https://doi.org/${encodeURIComponent(article.doi)}" target="_blank">${escapeHtml(article.doi)}</a></div>` : ''}
            ${article.has_pdf || article.pdf_data ? `<div><strong>PDF Anexo:</strong> <span style="color:var(--purple);font-weight:600;">📄 ${escapeHtml(article.pdf_name || 'Documento disponível')}</span></div>` : ''}
          </div>
          <hr style="border:none;border-top:1px solid var(--border)"/>
          <div style="font-size:0.9rem;line-height:1.7;color:var(--text-primary)">
            <h4 style="margin-bottom:8px;font-size:0.95rem;color:var(--purple)">Resumo:</h4>
            ${article.abstract ? (hasKw ? Similarity.highlightKeywords(article.abstract, keywords) : escapeHtml(article.abstract)) : '<p class="muted">Nenhum resumo no arquivo importado.</p>'}
          </div>
          <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm modal-pdf-btn">📄 Ler PDF / Anexar</button>
            <button class="btn btn-primary btn-sm modal-ai-btn">Analisar com IA (Research Pilot)</button>
            <a href="${scholarUrl}" target="_blank" class="btn btn-ghost btn-sm">Abrir no Google Scholar ↗</a>
          </div>
        </div>`,
        [{ label: 'Fechar', style: 'btn-ghost' }]
      );
      setTimeout(() => {
        const modalAiBtn = document.querySelector('.modal-ai-btn');
        if (modalAiBtn) modalAiBtn.onclick = (e) => { e.stopPropagation(); UI.showAIAnalysisModal(article); };

        const modalPdfBtn = document.querySelector('.modal-pdf-btn');
        if (modalPdfBtn) modalPdfBtn.onclick = (e) => {
          e.stopPropagation();
          showPdfViewerModal(article, callbacks);
        };
      }, 30);
    };

    card.querySelector('.article-title').addEventListener('click', showDetail);
    const viewMore = card.querySelector('.view-more-btn');
    if (viewMore) viewMore.addEventListener('click', showDetail);

    card.querySelectorAll('a[target="_blank"]').forEach(a => {
      a.addEventListener('click', e => e.stopPropagation());
    });

    return card;
  }

  /* ── Duplicate Pair Card ─────────────────────────────── */
  function renderDupPair(pair, idx, callbacks) {
    const { onKeepA, onKeepB, onKeepBoth, onIgnore } = callbacks;
    const color = pair.score >= 85 ? 'high' : pair.score >= 70 ? 'medium' : 'low';

    const card = el('div', { class: `dup-pair dup-${color}`, id: `dup-${idx}` });
    card.innerHTML = `
      <div class="dup-header">
        <div class="dup-score-badge score-${color}">${pair.score}% similar</div>
        <span class="dup-method">${pair.method}</span>
        <div class="dup-actions">
          <button class="btn btn-sm btn-include" data-cb="a">Manter A</button>
          <button class="btn btn-sm btn-maybe" data-cb="both">Manter ambos</button>
          <button class="btn btn-sm btn-exclude" data-cb="b">Manter B</button>
          <button class="btn btn-sm btn-ghost" data-cb="ignore">Ignorar</button>
        </div>
      </div>
      <div class="dup-detail-bars">
        ${scoreBar(pair.details?.title || 0, 'título')}
        ${scoreBar(pair.details?.abstract || 0, 'resumo')}
        ${scoreBar(pair.details?.authors || 0, 'autores')}
      </div>
      <div class="dup-articles">
        <div class="dup-article dup-a">
          <div class="dup-label">Artigo A</div>
          <h5>${pair.highlights?.title?.length ? Similarity.highlightKeywords(pair.articleA.title, pair.highlights.title) : pair.articleA.title}</h5>
          <div class="dup-meta">
            ${pair.articleA.authors.slice(0,2).join('; ')} · ${pair.articleA.year} · ${pair.articleA.journal || '—'}
          </div>
          ${pair.articleA.doi ? `<div class="dup-doi">DOI: ${pair.articleA.doi}</div>` : ''}
          ${pair.articleA.abstract ? `<p class="article-abstract" style="margin-top:8px;font-size:0.78rem">${pair.highlights?.abstract?.length ? Similarity.highlightKeywords(pair.articleA.abstract.substring(0, 300), pair.highlights.abstract) : pair.articleA.abstract.substring(0, 300)}…</p>` : ''}
          <div class="dup-source">Fonte: ${pair.articleA.source_file}</div>
        </div>
        <div class="dup-article dup-b">
          <div class="dup-label">Artigo B</div>
          <h5>${pair.highlights?.title?.length ? Similarity.highlightKeywords(pair.articleB.title, pair.highlights.title) : pair.articleB.title}</h5>
          <div class="dup-meta">
            ${pair.articleB.authors.slice(0,2).join('; ')} · ${pair.articleB.year} · ${pair.articleB.journal || '—'}
          </div>
          ${pair.articleB.doi ? `<div class="dup-doi">DOI: ${pair.articleB.doi}</div>` : ''}
          ${pair.articleB.abstract ? `<p class="article-abstract" style="margin-top:8px;font-size:0.78rem">${pair.highlights?.abstract?.length ? Similarity.highlightKeywords(pair.articleB.abstract.substring(0, 300), pair.highlights.abstract) : pair.articleB.abstract.substring(0, 300)}…</p>` : ''}
          <div class="dup-source">Fonte: ${pair.articleB.source_file}</div>
        </div>
      </div>
    `;

    card.querySelector('[data-cb="a"]').onclick = onKeepA;
    card.querySelector('[data-cb="b"]').onclick = onKeepB;
    card.querySelector('[data-cb="both"]').onclick = onKeepBoth;
    card.querySelector('[data-cb="ignore"]').onclick = onIgnore;

    return card;
  }

  /* ── Donut & Pie Chart (com Interatividade e Porcentagem %) ─── */
  function renderDonut(canvas, data, options = {}) {
    // data = [{value, color, label}]
    const ctx = canvas.getContext('2d');
    
    // Scale for high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width || canvas.width || 220;
    const H = rect.height || canvas.height || 220;
    
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const cx = W / 2, cy = H / 2;
    const r = Math.min(cx, cy) - 15;
    const inner = options.isPie ? 0 : r * 0.55;
    const total = data.reduce((s, d) => s + d.value, 0);

    // Build slices metadata with angles
    let currentAngle = -Math.PI / 2;
    const slices = [];

    data.forEach(seg => {
      if (!seg.value) return;
      const sweep = (seg.value / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      const pct = total > 0 ? ((seg.value / total) * 100).toFixed(1) : 0;
      slices.push({
        ...seg,
        startAngle,
        endAngle,
        sweep,
        pct
      });
      currentAngle = endAngle;
    });

    let hoveredIndex = -1;

    function draw(hoverIdx = -1) {
      ctx.clearRect(0, 0, W, H);

      if (!total) {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        if (!options.isPie) {
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(cx, cy, inner, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '500 13px Inter, sans-serif';
        ctx.fillText('Sem dados', cx, cy);
        return;
      }

      // Draw segments
      slices.forEach((slice, idx) => {
        const isHovered = idx === hoverIdx;
        const radiusOffset = isHovered ? 6 : 0;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r + radiusOffset, slice.startAngle, slice.endAngle);
        ctx.closePath();
        ctx.fillStyle = slice.color;
        ctx.fill();

        // Slice stroke border for separation
        ctx.strokeStyle = '#0b1329';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      });

      // Donut hole
      if (!options.isPie) {
        ctx.beginPath();
        ctx.arc(cx, cy, inner, 0, Math.PI * 2);
        ctx.fillStyle = '#0b1329';
        ctx.fill();
      }

      // Center text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (hoverIdx >= 0 && slices[hoverIdx]) {
        const h = slices[hoverIdx];
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.fillText(`${h.pct}%`, cx, cy - 8);
        ctx.fillStyle = h.color;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillText(`${h.label} (${h.value})`, cx, cy + 12);
      } else {
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.fillText(total, cx, cy - 6);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 11px Inter, sans-serif';
        ctx.fillText(options.centerLabel || 'Total Artigos', cx, cy + 14);
      }
    }

    // Canvas Mouse interaction
    if (!canvas._hasDonutListeners) {
      canvas._hasDonutListeners = true;

      canvas.addEventListener('mousemove', e => {
        const bounds = canvas.getBoundingClientRect();
        const mx = e.clientX - bounds.left;
        const my = e.clientY - bounds.top;

        const dx = mx - cx;
        const dy = my - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > r + 8 || dist < (options.isPie ? 0 : inner - 5)) {
          if (hoveredIndex !== -1) {
            hoveredIndex = -1;
            draw(-1);
          }
          return;
        }

        let angle = Math.atan2(dy, dx);
        // Normalize angle to [-PI/2, 3*PI/2)
        if (angle < -Math.PI / 2) angle += Math.PI * 2;

        let foundIdx = -1;
        slices.forEach((slice, idx) => {
          if (angle >= slice.startAngle && angle < slice.endAngle) {
            foundIdx = idx;
          }
        });

        if (foundIdx !== hoveredIndex) {
          hoveredIndex = foundIdx;
          draw(hoveredIndex);
        }
      });

      canvas.addEventListener('mouseleave', () => {
        if (hoveredIndex !== -1) {
          hoveredIndex = -1;
          draw(-1);
        }
      });
    }

    draw(-1);
  }

  /* ── Empty State ─────────────────────────────────────── */
  function emptyState(icon, title, subtitle) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <h3>${title}</h3>
        <p>${subtitle}</p>
      </div>`;
  }

  /* ── Loading Spinner ─────────────────────────────────── */
  function loadingState(msg = 'Processando…') {
    return `<div class="loading-state"><div class="spinner"></div><p>${msg}</p></div>`;
  }

  /* ── Exclusion Reason Modal ─────────────────────────── */
  function showExclusionReasonModal(onSelectReason) {
    const reasons = [
      'População inadequada',
      'Intervenção inadequada',
      'Desenho de estudo inadequado',
      'Desfecho irrelevante',
      'Artigo narrativo / Revisão prévia',
      'Idioma não suportado',
      'Duplicata',
      'Sem texto completo disponível',
      'Outro motivo...'
    ];
    const optionsHtml = reasons.map(r => `
      <label class="reason-option" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;margin-bottom:8px;">
        <input type="radio" name="ex-reason" value="${r}"/>
        <span style="font-size:0.88rem;">${r}</span>
      </label>
    `).join('');

    modal(
      'Razão da Exclusão',
      `<p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:16px;">Selecione o motivo pelo qual este artigo está sendo excluído:</p>
       <div id="reasons-list">${optionsHtml}</div>
       <div id="custom-reason-wrap" style="display:none;margin-top:12px;">
         <input id="custom-reason-input" class="input input-sm" placeholder="Digite o motivo personalizado..."/>
       </div>`,
      [
        { label: 'Sem motivo específico', style: 'btn-ghost', cb: () => onSelectReason(null) },
        { label: 'Confirmar Exclusão', style: 'btn-danger', cb: () => {
          const selected = document.querySelector('input[name="ex-reason"]:checked')?.value;
          if (selected === 'Outro motivo...') {
            const custom = document.getElementById('custom-reason-input')?.value?.trim();
            onSelectReason(custom || 'Outro motivo');
          } else {
            onSelectReason(selected || null);
          }
        }}
      ]
    );

    setTimeout(() => {
      document.querySelectorAll('input[name="ex-reason"]').forEach(radio => {
        radio.onchange = () => {
          const customWrap = document.getElementById('custom-reason-wrap');
          if (customWrap) customWrap.style.display = radio.value === 'Outro motivo...' ? 'block' : 'none';
        };
      });
    }, 100);
  }


  /* ── Label Chips ─────────────────────────────────────── */
  function renderLabelChips(article, projectLabels) {
    if (!article.labels?.length || !projectLabels?.length) return '';
    return article.labels.map(lid => {
      const lbl = projectLabels.find(l => l.id === lid);
      if (!lbl) return '';
      return `<span class="label-chip" style="background:${lbl.color}22;color:${lbl.color};border-color:${lbl.color}55">${lbl.name}</span>`;
    }).join('');
  }

  /* ── Label Picker Dropdown ───────────────────────────── */
  function showLabelPicker(anchorEl, article, projectLabels, projectId, onUpdate) {
    // Close any existing picker
    document.querySelectorAll('.label-picker-dropdown').forEach(d => d.remove());

    if (!projectLabels?.length) {
      toast('Crie labels primeiro na aba de Triagem', 'info');
      return;
    }

    const dropdown = el('div', { class: 'label-picker-dropdown' });
    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${rect.left}px;`;

    const currentLabels = article.labels || [];
    dropdown.innerHTML = `
      <div class="label-picker-title">Aplicar label</div>
      ${projectLabels.map(lbl => `
        <div class="label-picker-item ${currentLabels.includes(lbl.id) ? 'checked' : ''}" data-lid="${lbl.id}">
          <span class="label-picker-dot" style="background:${lbl.color}"></span>
          <span>${lbl.name}</span>
          ${currentLabels.includes(lbl.id) ? '<span class="label-picker-check">✓</span>' : ''}
        </div>
      `).join('')}
    `;

    dropdown.querySelectorAll('.label-picker-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const updated = Storage.toggleArticleLabel(projectId, article.id, item.dataset.lid);
        dropdown.remove();
        if (onUpdate) onUpdate(updated);
      };
    });

    document.body.appendChild(dropdown);

    // Close on outside click
    const close = (e) => { if (!dropdown.contains(e.target) && e.target !== anchorEl) { dropdown.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 10);
  }

  /* ── Hotkeys Panel ───────────────────────────────────── */
  function renderHotkeysPanel() {
    const keys = [
      { key: 'I', desc: 'Incluir' },
      { key: 'E', desc: 'Excluir' },
      { key: 'M', desc: 'Talvez' },
      { key: 'N', desc: 'Nota' },
      { key: '→', desc: 'Próximo' },
      { key: '←', desc: 'Anterior' },
      { key: 'ESC', desc: 'Fechar' },
    ];
    return `
      <div class="hotkeys-panel">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-right:4px">Atalhos:</span>
        ${keys.map(k => `
          <div class="hotkey-item">
            <span class="hotkey-key">${k.key}</span>
            <span>${k.desc}</span>
          </div>
        `).join('')}
      </div>`;
  }

  /* ── Labels Manager ──────────────────────────────────── */
  function renderLabelsManager(project, onUpdate) {
    const labels = project.labels || [];
    let selectedColor = Storage.LABEL_COLORS[labels.length % Storage.LABEL_COLORS.length];

    const container = el('div', { class: 'labels-manager' });
    const render = () => {
      const proj = Storage.getProject(project.id);
      const currLabels = proj?.labels || [];

      container.innerHTML = `
        <div class="labels-manager-title">Gerenciar Labels</div>
        <div class="labels-list">
          ${currLabels.length === 0 ? '<span style="font-size:0.8rem;color:var(--text-muted)">Nenhuma label criada ainda.</span>' : ''}
          ${currLabels.map(l => `
            <div class="label-manage-item" style="background:${l.color}22;color:${l.color};border-color:${l.color}55">
              <span>${l.name}</span>
              <button class="label-delete-btn" data-lid="${l.id}" title="Excluir label">×</button>
            </div>
          `).join('')}
        </div>
        <div class="label-add-row">
          <input id="label-new-name" class="input input-sm" placeholder="Nome da label…" style="flex:1"/>
          <div class="label-color-picker" id="label-color-picker" style="padding:5px">
            ${Storage.LABEL_COLORS.map(c => `<div class="color-swatch ${c === selectedColor ? 'selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></div>`).join('')}
          </div>
          <button class="btn btn-sm btn-primary" id="label-create-btn">+ Criar</button>
        </div>
      `;

      // Color picker
      container.querySelectorAll('.color-swatch').forEach(sw => {
        sw.onclick = () => {
          selectedColor = sw.dataset.color;
          container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
        };
      });

      // Delete label
      container.querySelectorAll('.label-delete-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          Storage.deleteLabel(project.id, btn.dataset.lid);
          render();
          if (onUpdate) onUpdate();
        };
      });

      // Create label
      const createBtn = container.querySelector('#label-create-btn');
      const nameInput = container.querySelector('#label-new-name');
      const doCreate = () => {
        const name = nameInput?.value?.trim();
        if (!name) { toast('Informe o nome da label', 'error'); return; }
        const proj2 = Storage.getProject(project.id);
        if ((proj2.labels || []).some(l => l.name.toLowerCase() === name.toLowerCase())) {
          toast('Label já existe', 'error'); return;
        }
        Storage.createLabel(project.id, name, selectedColor);
        render();
        if (onUpdate) onUpdate();
      };
      createBtn.onclick = doCreate;
      nameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); });
    };

    render();
    return container;
  }

  /* ── PRISMA 2020 Flowchart Render ───────────────────── */
  function renderPRISMA(project) {
    const s = project.stats;
    const articles = project.articles || [];

    const excludedArticles = articles.filter(a => a.decision === 'exclude');
    const reasonsMap = {};
    excludedArticles.forEach(a => {
      const r = a.exclusion_reason || 'Sem motivo especificado';
      reasonsMap[r] = (reasonsMap[r] || 0) + 1;
    });

    const reasonsListHtml = Object.entries(reasonsMap)
      .map(([reason, count]) => `<li style="margin-bottom:4px">${reason}: <strong>${count}</strong></li>`)
      .join('');

    const recordsIdentified = s.total;
    const duplicatesRemoved = s.duplicates;
    const recordsScreened = s.total - s.duplicates;
    const recordsExcluded = s.excluded;
    const recordsIncluded = s.included;

    return `
      <div class="prisma-container" style="max-width:820px;margin:0 auto;padding:32px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-xl);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;">
          <div>
            <h2 style="font-size:1.4rem;font-weight:800;color:var(--text-primary)">Fluxograma PRISMA 2020</h2>
            <p class="muted" style="margin-top:2px">Diagrama de fluxo de triagem no padrão científico internacional</p>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="window.print()">Imprimir / Salvar PDF</button>
        </div>

        <div class="prisma-flow" style="display:flex;flex-direction:column;gap:20px;">

          <div class="prisma-phase" style="border-left:4px solid var(--purple);padding-left:16px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--purple);text-transform:uppercase;letter-spacing:0.05em">1. Identificação</span>
            <div class="prisma-box" style="margin-top:8px;padding:16px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md)">
              <strong>Registros identificados através de busca nas bases de dados (n = ${recordsIdentified})</strong>
            </div>
          </div>

          <div style="text-align:center;color:var(--purple);font-size:1.2rem;font-weight:bold">↓</div>

          <div class="prisma-phase" style="border-left:4px solid var(--amber);padding-left:16px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:0.05em">2. Remoção de Duplicatas</span>
            <div class="prisma-box" style="margin-top:8px;padding:16px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md)">
              <strong>Registros duplicados removidos (n = ${duplicatesRemoved})</strong>
            </div>
          </div>

          <div style="text-align:center;color:var(--amber);font-size:1.2rem;font-weight:bold">↓</div>

          <div class="prisma-phase" style="border-left:4px solid var(--cyan);padding-left:16px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.05em">3. Triagem</span>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 240px), 1fr));gap:16px;margin-top:8px;">
              <div class="prisma-box" style="padding:16px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md)">
                <strong>Registros triados por título e resumo (n = ${recordsScreened})</strong>
              </div>
              <div class="prisma-box" style="padding:16px;background:var(--red-bg);border:1px solid rgba(239,68,68,0.4);border-radius:var(--radius-md);color:var(--red)">
                <strong style="display:block;margin-bottom:8px">Registros excluídos (n = ${recordsExcluded})</strong>
                ${reasonsListHtml ? `<ul style="margin:0;font-size:0.8rem;padding-left:16px;line-height:1.6">${reasonsListHtml}</ul>` : '<span style="font-size:0.8rem;opacity:0.8">Nenhum artigo excluído ainda.</span>'}
              </div>
            </div>
          </div>

          <div style="text-align:center;color:var(--green);font-size:1.2rem;font-weight:bold">↓</div>

          <div class="prisma-phase" style="border-left:4px solid var(--green);padding-left:16px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:0.05em">4. Estudos Incluídos</span>
            <div class="prisma-box" style="margin-top:8px;padding:20px;background:var(--green-bg);border:1px solid rgba(34,197,94,0.4);border-radius:var(--radius-md);color:var(--green)">
              <h3 style="font-size:1.1rem;font-weight:800;margin-bottom:4px">Estudos incluídos na revisão sistemática (n = ${recordsIncluded})</h3>
              <p style="font-size:0.82rem;margin:0;opacity:0.9">Estudos elegíveis selecionados para síntese dos resultados.</p>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  /* ── AI Analysis & Research Pilot Modal ─────────────────── */
  function showAIAnalysisModal(article) {
    const analysis = AIAssistant.analyzeArticle(article);
    
    const picoHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 180px), 1fr));gap:10px;margin-bottom:16px;">
        <div style="padding:10px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);">
          <strong style="color:var(--purple);font-size:0.78rem;">P - População:</strong>
          <div style="font-size:0.82rem;color:var(--text-primary);margin-top:2px;">${analysis.population}</div>
        </div>
        <div style="padding:10px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);">
          <strong style="color:var(--cyan);font-size:0.78rem;">I - Intervenção / Foco:</strong>
          <div style="font-size:0.82rem;color:var(--text-primary);margin-top:2px;">${analysis.intervention}</div>
        </div>
        <div style="padding:10px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);">
          <strong style="color:var(--amber);font-size:0.78rem;">C - Comparador:</strong>
          <div style="font-size:0.82rem;color:var(--text-primary);margin-top:2px;">${analysis.comparator}</div>
        </div>
        <div style="padding:10px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);">
          <strong style="color:var(--green);font-size:0.78rem;">O - Desfecho (Outcome):</strong>
          <div style="font-size:0.82rem;color:var(--text-primary);margin-top:2px;">${analysis.outcome}</div>
        </div>
      </div>
    `;

    const verdictColor = analysis.verdict === 'include' ? 'var(--green)' : analysis.verdict === 'exclude' ? 'var(--red)' : 'var(--amber)';
    const verdictLabel = analysis.verdict === 'include' ? 'Recomendado para INCLUSÃO' : analysis.verdict === 'exclude' ? 'Recomendado para EXCLUSÃO' : 'Recomenda-se leitura estendida (TALVEZ)';

    modal(
      'LitScan Pilot — Análise de IA do Artigo',
      `<div style="display:flex;flex-direction:column;gap:14px;max-height:70vh;overflow-y:auto;padding-right:4px;">
        <div style="font-size:0.95rem;font-weight:700;line-height:1.4;color:var(--text-primary)">${article.title}</div>
        
        <!-- PICO Framework -->
        <h4 style="font-size:0.85rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Estrutura PICO Automática</h4>
        ${picoHtml}

        <!-- AI Decision Recommendation -->
        <div style="padding:12px 16px;background:rgba(99,102,241,0.08);border:1px solid ${verdictColor};border-radius:var(--radius-md);">
          <div style="font-size:0.85rem;font-weight:700;color:${verdictColor};margin-bottom:4px;">${verdictLabel}</div>
          <div style="font-size:0.82rem;color:var(--text-secondary);">${analysis.reasoning}</div>
        </div>

        <!-- Chat with Article -->
        <hr style="border:none;border-top:1px solid var(--border);margin:4px 0;"/>
        <h4 style="font-size:0.85rem;color:var(--purple);font-weight:700">Converse com este Artigo</h4>
        <div id="ai-chat-history" style="min-height:80px;max-height:160px;overflow-y:auto;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px;font-size:0.82rem;display:flex;flex-direction:column;gap:8px;">
          <div style="color:var(--text-muted)">Pergunte qualquer coisa (ex: "Qual foi a amostra?", "Qual a metodologia?")</div>
        </div>
        <div style="display:flex;gap:6px;">
          <input id="ai-chat-input" class="input input-sm" style="flex:1" placeholder="Digite sua pergunta..."/>
          <button id="ai-chat-send" class="btn btn-sm btn-primary">Perguntar</button>
        </div>
      </div>`,
      [{ label: 'Fechar', style: 'btn-ghost' }]
    );

    setTimeout(() => {
      const sendBtn = document.getElementById('ai-chat-send');
      const input = document.getElementById('ai-chat-input');
      const history = document.getElementById('ai-chat-history');

      const handleAsk = () => {
        const q = input?.value?.trim();
        if (!q) return;
        
        // Append user question
        const userMsg = document.createElement('div');
        userMsg.style.cssText = 'align-self:flex-end;background:var(--purple-glow);color:var(--purple);padding:6px 12px;border-radius:12px;max-width:85%;';
        userMsg.textContent = '👤 ' + q;
        history.appendChild(userMsg);
        input.value = '';

        // Get AI answer
        const ans = AIAssistant.answerQuestion(article, q);
        const aiMsg = document.createElement('div');
        aiMsg.style.cssText = 'align-self:flex-start;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text-primary);padding:8px 12px;border-radius:12px;max-width:90%;line-height:1.5;';
        aiMsg.innerHTML = ans;
        history.appendChild(aiMsg);
        history.scrollTop = history.scrollHeight;
      };

      sendBtn?.addEventListener('click', handleAsk);
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') handleAsk(); });
    }, 50);
  }

  /** Realce de palavras-chave no resumo (Verde para Inclusão, Vermelho para Exclusão) */
  function highlightKeywords(text, incKeywords = [], excKeywords = []) {
    if (!text) return '<em>Sem resumo cadastrado.</em>';
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Highlighting Exclusion terms (Red)
    if (excKeywords.length > 0) {
      const excPattern = excKeywords.map(k => k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean).join('|');
      if (excPattern) {
        const regexExc = new RegExp(`\\b(${excPattern})\\b`, 'gi');
        html = html.replace(regexExc, '<mark class="kw-highlight-exc">$1</mark>');
      }
    }

    // Highlighting Inclusion terms (Green)
    if (incKeywords.length > 0) {
      const incPattern = incKeywords.map(k => k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean).join('|');
      if (incPattern) {
        const regexInc = new RegExp(`\\b(${incPattern})\\b`, 'gi');
        html = html.replace(regexInc, '<mark class="kw-highlight-inc">$1</mark>');
      }
    }

    return html;
  }

  /** Renderiza o Painel Esquerdo de Filtros Facetados Gisa */
  function renderFacetSidebar(project, currentFilter = {}, onSelectFacet) {
    const articles = project.articles || [];
    const stats = project.stats || {};

    // 1. Decisões
    const decisions = [
      { key: 'all',       label: 'Todos os Artigos', count: articles.length,    dot: 'var(--text-muted)' },
      { key: 'include',  label: 'Incluídos',       count: stats.included || 0, dot: 'var(--green)' },
      { key: 'exclude',  label: 'Excluídos',       count: stats.excluded || 0, dot: 'var(--red)' },
      { key: 'maybe',    label: 'Talvez',           count: stats.maybe || 0,    dot: 'var(--amber)' },
      { key: 'pending',  label: 'Pendentes',        count: stats.pending || 0,  dot: 'var(--slate)' },
      { key: 'duplicate',label: 'Duplicatas',       count: stats.duplicates || 0, dot: 'var(--blue)' },
    ];

    // 2. Palavras de Inclusão com contagem de ocorrências
    const incKws = project.keywords || [];
    const incCounts = incKws.map(kw => {
      const count = articles.filter(a => {
        const txt = (a.title + ' ' + a.abstract).toLowerCase();
        return txt.includes(kw.toLowerCase());
      }).length;
      return { kw, count };
    });

    // 3. Anos de publicação ordenados
    const yearsMap = {};
    articles.forEach(a => {
      if (a.year) {
        yearsMap[a.year] = (yearsMap[a.year] || 0) + 1;
      }
    });
    const years = Object.keys(yearsMap).sort((a, b) => b - a).map(y => ({ year: y, count: yearsMap[y] }));

    const container = document.createElement('aside');
    container.className = 'rayyan-facet-sidebar';
    container.setAttribute('aria-label', 'Filtros Facetados');

    container.innerHTML = `
      <div class="facet-header">
        <span class="facet-header-title">Filtros Facetados</span>
      </div>

      <div class="facet-group">
        <div class="facet-group-title">Decisões de Triagem</div>
        ${decisions.map(d => `
          <button class="facet-item ${currentFilter.decision === d.key ? 'active' : ''}" data-facet-type="decision" data-val="${d.key}">
            <span class="facet-dot" style="background:${d.dot}"></span>
            <span class="facet-label">${d.label}</span>
            <span class="facet-count">${d.count}</span>
          </button>
        `).join('')}
      </div>

      ${incCounts.length > 0 ? `
        <div class="facet-group">
          <div class="facet-group-title">Inclusão</div>
          ${incCounts.map(i => `
            <button class="facet-item ${currentFilter.kw === i.kw ? 'active' : ''}" data-facet-type="inc_kw" data-val="${escapeHtml(i.kw)}">
              <span class="facet-dot" style="background:var(--green)"></span>
              <span class="facet-label">${escapeHtml(i.kw)}</span>
              <span class="facet-count">${i.count}</span>
            </button>
          `).join('')}
        </div>
      ` : ''}

      ${years.length > 0 ? `
        <div class="facet-group">
          <div class="facet-group-title">Ano de Publicação</div>
          ${years.slice(0, 8).map(y => `
            <button class="facet-item ${currentFilter.year === y.year ? 'active' : ''}" data-facet-type="year" data-val="${y.year}">
              <span class="facet-label">${y.year}</span>
              <span class="facet-count">${y.count}</span>
            </button>
          `).join('')}
        </div>
      ` : ''}
    `;

    container.querySelectorAll('.facet-item').forEach(btn => {
      btn.onclick = () => {
        const type = btn.dataset.facetType;
        const val = btn.dataset.val;
        if (onSelectFacet) onSelectFacet(type, val);
      };
    });

    return container;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }


  /** Renderiza o Painel Direito: Inspetor de Abstract Gisa */
  function renderAbstractInspector(article, projectKeywords = {}, blindMode = false, callbacks = {}) {
    const container = document.createElement('div');
    container.id = 'rayyan-inspector-slot';
    container.className = 'abstract-inspector-panel';

    if (!article) {
      container.innerHTML = `
        <div class="inspector-header">
          <h3>Leitor de Resumo</h3>
        </div>
        <div class="inspector-content" style="align-items:center;justify-content:center;color:var(--text-muted);text-align:center;padding:40px 20px;">
          <p>Selecione um artigo na lista ao lado para ler o resumo e tomar decisões de triagem.</p>
        </div>`;
      return container;
    }

    const incKws = projectKeywords.include || [];
    const excKws = projectKeywords.exclude || [];
    const highlightedAbstract = highlightKeywords(article.abstract, incKws, excKws);

    let decisionBadge = '';
    if (blindMode) {
      decisionBadge = '<span class="badge badge-purple">Modo Cego Ativo</span>';
    } else if (article.decision === 'include') {
      decisionBadge = '<span class="badge badge-include">Incluído</span>';
    } else if (article.decision === 'exclude') {
      decisionBadge = `<span class="badge badge-exclude">Excluído ${article.exclusion_reason ? `(${article.exclusion_reason})` : ''}</span>`;
    } else if (article.decision === 'maybe') {
      decisionBadge = '<span class="badge badge-maybe">Talvez</span>';
    } else {
      decisionBadge = '<span class="badge badge-pending">Pendente</span>';
    }

    const hasPdf = Boolean(article.has_pdf || article.pdf_data);

    container.innerHTML = `
      <div class="inspector-header" role="banner">
        <h3>Leitor de Resumo</h3>
        <div style="display:flex;gap:6px;align-items:center;">
          ${hasPdf ? '<span class="badge badge-purple" style="font-size:0.72rem;">📄 PDF Anexo</span>' : ''}
          ${decisionBadge}
        </div>
      </div>
      <div class="inspector-content">
        <h2 class="inspector-title">${escapeHtml(article.title)}</h2>

        <div class="inspector-meta-box">
          <div><strong>Autores:</strong> ${article.authors?.length ? escapeHtml(article.authors.join('; ')) : 'Não informado'}</div>
          <div><strong>Revista/Fonte:</strong> ${escapeHtml(article.journal || article.source_file || '—')} ${article.year ? `(${article.year})` : ''}</div>
          ${article.doi ? `<div><strong>DOI:</strong> <a href="https://doi.org/${article.doi}" target="_blank" rel="noopener">${article.doi} ↗</a></div>` : ''}
          ${hasPdf ? `<div><strong>Arquivo PDF:</strong> <span style="color:var(--purple);font-weight:600;">${escapeHtml(article.pdf_name || 'Documento PDF')}</span></div>` : ''}
          ${article.relevance_score !== undefined && article.relevance_score !== null ? `
            <div style="margin-top:4px;">
              <strong>Relevância IA:</strong>
              <div class="score-bar-track" style="margin-top:4px;height:8px;">
                <div class="score-bar-fill" style="width:${article.relevance_score}%;background:var(--purple);"></div>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="inspector-actions">
          <button class="btn btn-include" id="insp-btn-include">Incluir (I)</button>
          <button class="btn btn-exclude" id="insp-btn-exclude">Excluir (E)</button>
          <button class="btn btn-maybe"   id="insp-btn-maybe">Talvez (M)</button>
        </div>

        <!-- PDF Actions & AI Analysis -->
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          ${hasPdf ? `
            <button class="btn btn-sm btn-secondary" id="insp-btn-read-pdf" style="flex:1;background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:var(--purple);">
              📄 Ler PDF Completo
            </button>
          ` : ''}
          <button class="btn btn-sm btn-ghost" id="insp-btn-attach-pdf" style="flex:1;border:1px solid var(--border);">
            📎 ${hasPdf ? 'Trocar PDF' : 'Anexar PDF'}
          </button>
          <input type="file" id="insp-pdf-file-input" accept=".pdf" style="display:none;" />
        </div>

        <div style="margin-top:8px;">
          <button class="btn btn-ai-chat" id="insp-btn-ai-analysis" style="width:100%;">
            🤖 Analisar com IA (PICO & Chat)
          </button>
        </div>

        <div class="inspector-abstract-wrap">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">Resumo (Abstract)</span>
            <div class="highlighter-legend" style="display:flex;gap:8px;">
              <span class="hl-dot inc"></span><small style="font-size:0.7rem;color:var(--green)">Inclusão</small>
              <span class="hl-dot exc"></span><small style="font-size:0.7rem;color:var(--red)">Exclusão</small>
            </div>
          </div>
          <div class="inspector-abstract-text" id="inspector-abstract-body">
            ${highlightedAbstract || '<p style="color:var(--text-muted);font-style:italic">Resumo não disponível para este artigo.</p>'}
          </div>
        </div>
      </div>`;

    container.querySelector('#insp-btn-include')?.addEventListener('click', () => callbacks.onInclude && callbacks.onInclude());
    container.querySelector('#insp-btn-exclude')?.addEventListener('click', () => callbacks.onExclude && callbacks.onExclude());
    container.querySelector('#insp-btn-maybe')?.addEventListener('click', () => callbacks.onMaybe && callbacks.onMaybe());
    container.querySelector('#insp-btn-ai-analysis')?.addEventListener('click', () => showAIAnalysisModal(article));
    
    // PDF Actions
    container.querySelector('#insp-btn-read-pdf')?.addEventListener('click', () => {
      showPdfViewerModal(article, callbacks);
    });

    const attachBtn = container.querySelector('#insp-btn-attach-pdf');
    const attachInput = container.querySelector('#insp-pdf-file-input');
    if (attachBtn && attachInput) {
      attachBtn.addEventListener('click', () => attachInput.click());
      attachInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const dataUrl = evt.target.result;
            if (callbacks.onAttachPdf) {
              callbacks.onAttachPdf(file.name, dataUrl);
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }

    return container;
  }

  /** Exibe o Modal de Login, Cadastro e Sincronização em Nuvem */
  async function showSupabaseModal(onSuccess) {
    let currentUser = null;
    let isConfigured = false;

    if (typeof SupabaseSync !== 'undefined') {
      isConfigured = SupabaseSync.isConfigured();
      if (isConfigured) {
        try {
          currentUser = await SupabaseSync.getUser();
        } catch {}
      }
    }

    const storedSettings = Storage.getSettings();
    const currentUrl = storedSettings['supabase_url'] || '';
    const currentKey = storedSettings['supabase_anon_key'] || '';
    const lastSync = storedSettings['supabase_last_sync'] 
      ? new Date(storedSettings['supabase_last_sync']).toLocaleString('pt-BR') 
      : 'Nunca';

    let bodyHtml = '';

    if (currentUser) {
      // ─── USUÁRIO LOGADO ───
      const userMeta = currentUser.user_metadata || {};
      const displayName = userMeta.full_name || currentUser.email?.split('@')[0] || 'Pesquisador(a)';
      const avatar = userMeta.avatar || '👩‍🔬';

      bodyHtml = `
        <div class="auth-logged-modal" style="display:flex;flex-direction:column;gap:18px;">
          <div style="display:flex;align-items:center;gap:14px;background:var(--bg-card2);padding:18px;border-radius:var(--radius-lg);border:1px solid rgba(34,197,94,0.35);">
            <div style="font-size:2.2rem;background:var(--bg-elevated);width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--green);flex-shrink:0;">${avatar}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="color:var(--text-primary);font-size:1.05rem;">${escapeHtml(displayName)}</strong>
                <span style="font-size:0.72rem;background:var(--green-bg);color:var(--green);padding:2px 8px;border-radius:99px;font-weight:700;">Conectado</span>
              </div>
              <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">${escapeHtml(currentUser.email || '')}</div>
              <div style="font-size:0.74rem;color:var(--text-muted);margin-top:4px;">Última sincronização: <strong>${lastSync}</strong></div>
            </div>
          </div>

          <div style="background:var(--bg-card2);padding:14px 16px;border-radius:var(--radius-md);border:1px solid var(--border);">
            <div style="font-size:0.85rem;color:var(--text-primary);font-weight:700;margin-bottom:4px;">☁️ Armazenamento em Nuvem Ativo</div>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin:0;line-height:1.45;">
              Seus projetos, artigos importados e decisões de triagem estão salvos com segurança na sua conta e sincronizam automaticamente entre seu computador e celular.
            </p>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-sync-now" style="flex:1;min-width:180px;">
              🔄 Sincronizar Tudo Agora
            </button>
            <button class="btn btn-secondary" id="btn-open-profile-from-auth" style="min-width:120px;">
              👤 Meu Perfil
            </button>
            <button class="btn btn-danger" id="btn-logout" style="background:var(--red-bg);border-color:rgba(239,68,68,0.4);color:var(--red);padding:8px 14px;">
              🚪 Sair
            </button>
          </div>

          <details style="margin-top:6px;font-size:0.8rem;color:var(--text-muted);">
            <summary style="cursor:pointer;padding:4px 0;">⚙️ Configurações avançadas do servidor Supabase</summary>
            <div style="padding-top:10px;display:flex;flex-direction:column;gap:10px;">
              <div>
                <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:2px;">URL do Supabase:</label>
                <input id="sb-url-input" class="input" style="width:100%;font-size:0.8rem;" value="${escapeHtml(currentUrl)}"/>
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:2px;">Anon Key:</label>
                <input id="sb-key-input" type="password" class="input" style="width:100%;font-size:0.8rem;" value="${escapeHtml(currentKey)}"/>
              </div>
              <button class="btn btn-sm btn-secondary" id="btn-save-custom-keys">Salvar chaves personalizadas</button>
            </div>
          </details>
        </div>
      `;
    } else {
      // ─── USUÁRIO NÃO LOGADO (ABAS: ENTRAR / CRIAR CONTA) ───
      bodyHtml = `
        <div class="auth-modal" style="display:flex;flex-direction:column;gap:16px;">
          
          <div style="display:flex;gap:6px;background:var(--bg-card2);padding:4px;border-radius:var(--radius-md);border:1px solid var(--border);">
            <button id="tab-auth-login" class="btn btn-sm btn-primary" style="flex:1;border-radius:var(--radius-sm);font-weight:700;">
              🔑 Entrar
            </button>
            <button id="tab-auth-signup" class="btn btn-sm btn-ghost" style="flex:1;border-radius:var(--radius-sm);font-weight:700;">
              ✨ Criar Conta
            </button>
          </div>

          <div id="auth-tab-content">
            <!-- TAB 1: LOGIN -->
            <div id="auth-login-view" style="display:flex;flex-direction:column;gap:12px;">
              <p style="font-size:0.84rem;color:var(--text-secondary);margin:0;line-height:1.45;">
                Entre na sua conta para <strong>guardar e sincronizar seus projetos e triagens</strong> na nuvem automaticamente.
              </p>
              
              <div>
                <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Seu E-mail:</label>
                <input id="auth-login-email" type="email" class="input" placeholder="seu.email@pesquisa.br" style="width:100%;font-size:0.9rem;" />
              </div>

              <div>
                <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Sua Senha:</label>
                <input id="auth-login-password" type="password" class="input" placeholder="Digite sua senha" style="width:100%;font-size:0.9rem;" />
              </div>

              <div style="display:flex;gap:10px;margin-top:4px;">
                <button class="btn btn-primary" id="btn-do-login" style="width:100%;font-size:0.92rem;padding:11px 16px;">
                  ⚡ Entrar e Sincronizar
                </button>
              </div>

              <div style="text-align:center;margin-top:2px;">
                <button id="btn-magic-link" style="background:none;border:none;color:var(--purple);cursor:pointer;font-size:0.8rem;text-decoration:underline;">
                  Entrar sem senha (enviar link no e-mail)
                </button>
              </div>
            </div>

            <!-- TAB 2: SIGNUP (INICIALMENTE OCULTA) -->
            <div id="auth-signup-view" style="display:none;flex-direction:column;gap:12px;">
              <p style="font-size:0.84rem;color:var(--text-secondary);margin:0;line-height:1.45;">
                Crie sua conta gratuita em segundos para salvar suas pesquisas e acessar do computador ou celular.
              </p>
              
              <div>
                <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Seu Nome:</label>
                <input id="auth-signup-name" class="input" placeholder="Ex: Dra. Giselle Corrêa" style="width:100%;font-size:0.9rem;" />
              </div>

              <div>
                <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">E-mail:</label>
                <input id="auth-signup-email" type="email" class="input" placeholder="seu.email@pesquisa.br" style="width:100%;font-size:0.9rem;" />
              </div>

              <div>
                <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Crie uma Senha (mín. 6 caracteres):</label>
                <input id="auth-signup-password" type="password" class="input" placeholder="••••••••" style="width:100%;font-size:0.9rem;" />
              </div>

              <div style="margin-top:4px;">
                <button class="btn btn-primary" id="btn-do-signup" style="width:100%;font-size:0.92rem;padding:11px 16px;background:linear-gradient(135deg, var(--purple), var(--violet));">
                  ✨ Criar Conta Gratuita
                </button>
              </div>
            </div>
          </div>

          <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.2rem;">💡</span>
            <div style="font-size:0.78rem;color:var(--text-secondary);">
              <strong>Modo Local:</strong> O Gisa também funciona 100% offline no navegador mesmo sem login. Ao criar uma conta ou entrar, tudo é sincronizado com segurança na nuvem.
            </div>
          </div>

          <details style="margin-top:4px;font-size:0.78rem;color:var(--text-muted);">
            <summary style="cursor:pointer;padding:4px 0;">⚙️ Configurações avançadas de servidor Supabase</summary>
            <div style="padding-top:8px;display:flex;flex-direction:column;gap:8px;">
              <div>
                <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:2px;">URL do Supabase:</label>
                <input id="sb-url-input" class="input" style="width:100%;font-size:0.8rem;" value="${escapeHtml(currentUrl)}"/>
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:2px;">Anon Key:</label>
                <input id="sb-key-input" type="password" class="input" style="width:100%;font-size:0.8rem;" value="${escapeHtml(currentKey)}"/>
              </div>
              <button class="btn btn-sm btn-secondary" id="btn-save-custom-keys">Salvar chaves personalizadas</button>
            </div>
          </details>
        </div>
      `;
    }

    modal(
      currentUser ? '☁️ Minha Conta & Nuvem' : '☁️ Entrar / Criar Conta no Gisa',
      bodyHtml,
      [
        { label: 'Fechar', style: 'btn-ghost' }
      ]
    );

    setTimeout(() => {
      // Tab switcher
      const tabLogin = document.getElementById('tab-auth-login');
      const tabSignup = document.getElementById('tab-auth-signup');
      const loginView = document.getElementById('auth-login-view');
      const signupView = document.getElementById('auth-signup-view');

      if (tabLogin && tabSignup && loginView && signupView) {
        tabLogin.onclick = () => {
          tabLogin.className = 'btn btn-sm btn-primary';
          tabSignup.className = 'btn btn-sm btn-ghost';
          loginView.style.display = 'flex';
          signupView.style.display = 'none';
        };
        tabSignup.onclick = () => {
          tabSignup.className = 'btn btn-sm btn-primary';
          tabLogin.className = 'btn btn-sm btn-ghost';
          signupView.style.display = 'flex';
          loginView.style.display = 'none';
        };
      }

      // Login Action
      const btnDoLogin = document.getElementById('btn-do-login');
      if (btnDoLogin) {
        btnDoLogin.onclick = async () => {
          const email = document.getElementById('auth-login-email')?.value?.trim();
          const pass = document.getElementById('auth-login-password')?.value;
          if (!email || !pass) {
            toast('Preencha seu e-mail e senha.', 'error');
            return;
          }
          btnDoLogin.disabled = true;
          btnDoLogin.textContent = 'Entrando…';
          try {
            await SupabaseSync.signIn(email, pass);
            const user = await SupabaseSync.getUser();
            if (user) {
              const profile = Storage.getProfile();
              if (user.user_metadata?.full_name && !profile.name) {
                Storage.saveProfile({ ...profile, name: user.user_metadata.full_name, email: user.email });
              }
            }
            toast('Login realizado com sucesso! Sincronizando...', 'success');
            await SupabaseSync.syncAll();
            updateCloudStatusUI();
            updateUserProfileNavbarUI();
            document.querySelector('.modal-overlay')?.remove();
            if (onSuccess) onSuccess();
          } catch (err) {
            toast('Erro ao entrar: ' + (err.message || 'Credenciais inválidas'), 'error');
          } finally {
            btnDoLogin.disabled = false;
            btnDoLogin.textContent = '⚡ Entrar e Sincronizar';
          }
        };
      }

      // Sign Up Action
      const btnDoSignup = document.getElementById('btn-do-signup');
      if (btnDoSignup) {
        btnDoSignup.onclick = async () => {
          const name = document.getElementById('auth-signup-name')?.value?.trim() || 'Pesquisador(a)';
          const email = document.getElementById('auth-signup-email')?.value?.trim();
          const pass = document.getElementById('auth-signup-password')?.value;
          if (!email || !pass) {
            toast('Preencha e-mail e senha.', 'error');
            return;
          }
          if (pass.length < 6) {
            toast('A senha deve ter pelo menos 6 caracteres.', 'error');
            return;
          }
          btnDoSignup.disabled = true;
          btnDoSignup.textContent = 'Criando conta…';
          try {
            await SupabaseSync.signUp(email, pass);
            await SupabaseSync.updateUserMetadata({ full_name: name });
            const profile = Storage.getProfile();
            Storage.saveProfile({ ...profile, name, email });
            toast('Conta criada com sucesso! Sincronizando...', 'success');
            await SupabaseSync.syncAll();
            updateCloudStatusUI();
            updateUserProfileNavbarUI();
            document.querySelector('.modal-overlay')?.remove();
            if (onSuccess) onSuccess();
          } catch (err) {
            toast('Erro ao criar conta: ' + (err.message || 'Erro inesperado'), 'error');
          } finally {
            btnDoSignup.disabled = false;
            btnDoSignup.textContent = '✨ Criar Conta Gratuita';
          }
        };
      }

      // Magic Link Action
      const btnMagic = document.getElementById('btn-magic-link');
      if (btnMagic) {
        btnMagic.onclick = async () => {
          const email = document.getElementById('auth-login-email')?.value?.trim();
          if (!email) {
            toast('Digite seu e-mail acima para receber o link de acesso.', 'error');
            return;
          }
          try {
            await SupabaseSync.signInWithOtp(email);
            toast('Link de acesso enviado para o seu e-mail!', 'success');
          } catch (err) {
            toast('Erro ao enviar link: ' + err.message, 'error');
          }
        };
      }

      // Sync Now Action (when logged in)
      const btnSyncNow = document.getElementById('btn-sync-now');
      if (btnSyncNow) {
        btnSyncNow.onclick = async () => {
          btnSyncNow.disabled = true;
          btnSyncNow.textContent = 'Sincronizando…';
          try {
            const res = await SupabaseSync.syncAll();
            if (res.success) {
              toast('Sincronização concluída com sucesso!', 'success');
              updateCloudStatusUI();
              document.querySelector('.modal-overlay')?.remove();
              if (onSuccess) onSuccess();
            } else {
              toast('Erro na sincronização: ' + res.error, 'error');
            }
          } catch (e) {
            toast('Erro ao sincronizar: ' + e.message, 'error');
          } finally {
            btnSyncNow.disabled = false;
            btnSyncNow.textContent = '🔄 Sincronizar Tudo Agora';
          }
        };
      }

      // Profile shortcut from auth modal
      const btnProfileFromAuth = document.getElementById('btn-open-profile-from-auth');
      if (btnProfileFromAuth) {
        btnProfileFromAuth.onclick = () => {
          document.querySelector('.modal-overlay')?.remove();
          showProfileModal(() => updateUserProfileNavbarUI());
        };
      }

      // Logout Action
      const btnLogout = document.getElementById('btn-logout');
      if (btnLogout) {
        btnLogout.onclick = async () => {
          await SupabaseSync.signOut();
          sessionStorage.removeItem('gisa_guest_mode');
          toast('Você saiu da conta.', 'info');
          updateCloudStatusUI();
          document.querySelector('.modal-overlay')?.remove();
          if (typeof App !== 'undefined') App.navigate('auth');
          if (onSuccess) onSuccess();
        };
      }

      // Save custom keys
      const btnSaveKeys = document.getElementById('btn-save-custom-keys');
      if (btnSaveKeys) {
        btnSaveKeys.onclick = () => {
          const url = document.getElementById('sb-url-input')?.value?.trim();
          const key = document.getElementById('sb-key-input')?.value?.trim();
          if (url && key) {
            SupabaseSync.configure(url, key);
            toast('Chaves do Supabase atualizadas com sucesso!', 'success');
            updateCloudStatusUI();
          } else {
            toast('Preencha a URL e a chave Anon.', 'error');
          }
        };
      }
    }, 50);
  }

  /** Exibe o Modal de Atalhos de Teclado Gisa */
  function showHotkeysModal() {
    modal(
      '⌨️ Atalhos de Teclado Gisa',
      `<p style="font-size:0.86rem;color:var(--text-secondary);margin-bottom:12px">
        Use o teclado para acelerar a triagem dos artigos científicos no Gisa:
      </p>
      <div class="hotkeys-grid">
        <div class="hotkey-row"><span>Incluir Artigo</span><kbd>I</kbd> ou <kbd>1</kbd></div>
        <div class="hotkey-row"><span>Excluir Artigo</span><kbd>E</kbd> ou <kbd>2</kbd></div>
        <div class="hotkey-row"><span>Marcar como Talvez</span><kbd>M</kbd> ou <kbd>3</kbd></div>
        <div class="hotkey-row"><span>Resetar / Pendente</span><kbd>U</kbd> ou <kbd>0</kbd></div>
        <div class="hotkey-row"><span>Próximo Artigo</span><kbd>J</kbd> ou <kbd>↓</kbd></div>
        <div class="hotkey-row"><span>Artigo Anterior</span><kbd>K</kbd> ou <kbd>↑</kbd></div>
        <div class="hotkey-row"><span>Expandir Abstract</span><kbd>Espaço</kbd></div>
        <div class="hotkey-row"><span>Ver Atalhos</span><kbd>?</kbd></div>
      </div>`,
      [{ label: 'Entendi', style: 'btn-primary' }]
    );
  }

  async function updateCloudStatusUI() {
    const dot = document.getElementById('cloud-status-dot');
    const txt = document.getElementById('cloud-status-text');
    if (!dot || !txt) return;

    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
      try {
        const user = await SupabaseSync.getUser();
        if (user) {
          dot.style.background = '#22c55e';
          dot.title = `Conectado como ${user.email}`;
          const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Conectado';
          txt.textContent = name.length > 12 ? name.substring(0, 10) + '…' : name;
          return;
        }
      } catch {}
      dot.style.background = '#a855f7';
      dot.title = 'Nuvem pronta (Clique para entrar)';
      txt.textContent = 'Entrar';
    } else {
      dot.style.background = '#94a3b8';
      dot.title = 'Modo Local (IndexedDB)';
      txt.textContent = 'Nuvem';
    }
  }

  /* ── Systematic Auto Resolver Pro Modal (Gisa Pro) ── */
  function showAutoResolverModal(project, pairs, onConfirm) {
    const sourceFiles = Array.from(new Set(project.articles.map(a => a.source_file).filter(Boolean)));
    let currentThreshold = 97;
    let selectedFile = 'auto';

    function calculateImpact(thresh, filePref) {
      const matchingPairs = pairs.filter(p => p.score >= thresh);
      const toDelete = new Set();
      matchingPairs.forEach(p => {
        if (filePref !== 'auto') {
          if (p.articleA.source_file === filePref && p.articleB.source_file !== filePref) {
            toDelete.add(p.articleB.id);
          } else if (p.articleB.source_file === filePref && p.articleA.source_file !== filePref) {
            toDelete.add(p.articleA.id);
          } else {
            toDelete.add(p.articleB.id);
          }
        } else {
          const lenA = (p.articleA.abstract || '').length + (p.articleA.doi ? 200 : 0);
          const lenB = (p.articleB.abstract || '').length + (p.articleB.doi ? 200 : 0);
          if (lenB > lenA) toDelete.add(p.articleA.id);
          else toDelete.add(p.articleB.id);
        }
      });
      return { count: toDelete.size, matchingPairs };
    }

    const initialImpact = calculateImpact(97, 'auto');
    const fileOptionsHtml = [
      '<option value="auto">✨ Automático (Gisa AI: Mantém o registro com maior resumo e metadados)</option>',
      ...sourceFiles.map(f => `<option value="${escapeHtml(f)}">📁 Preferir arquivo: ${escapeHtml(f)}</option>`)
    ].join('');

    const bodyHtml = `
      <div class="auto-resolver-dialog" style="display:flex;flex-direction:column;gap:18px;">
        <div class="auto-resolver-banner" style="background:linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08));border:1px solid rgba(99,102,241,0.25);border-radius:var(--radius-lg);padding:14px 18px;display:flex;align-items:center;gap:12px;">
          <span style="font-size:1.8rem;">⚡</span>
          <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.4;">
            <strong style="color:var(--text-primary);display:block;margin-bottom:2px;">Systematic Auto Resolver (Gisa Pro)</strong>
            O Gisa manterá a melhor versão de cada artigo com base nos seus critérios selecionados e descartará as cópias de forma 100% auditável.
          </div>
        </div>

        <div class="resolver-section">
          <label style="font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:8px;">
            1. Versão preferencial para manter (Duplicate best version to keep):
          </label>
          <select id="ar-pref-file" class="input" style="width:100%;font-size:0.86rem;padding:10px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);">
            ${fileOptionsHtml}
          </select>
        </div>

        <div class="resolver-section">
          <label style="font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:10px;">
            2. Critérios de Correspondência (Duplicates resolving criteria):
          </label>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 130px), 1fr));gap:10px;">
            <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;font-size:0.82rem;">
              <input type="checkbox" id="crit-title" checked /> <span>Title (Título)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;font-size:0.82rem;">
              <input type="checkbox" id="crit-doi" checked /> <span>DOI (Identificador)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;font-size:0.82rem;">
              <input type="checkbox" id="crit-authors" checked /> <span>Authors (Autores)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;font-size:0.82rem;">
              <input type="checkbox" id="crit-journal" checked /> <span>Journal (Revista)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;font-size:0.82rem;">
              <input type="checkbox" id="crit-year" checked /> <span>Year (Ano)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;font-size:0.82rem;">
              <input type="checkbox" id="crit-pubtype" checked /> <span>Publication Type</span>
            </label>
          </div>
        </div>

        <div class="resolver-section" style="background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px 18px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div>
              <span style="font-size:0.88rem;font-weight:700;color:var(--text-primary);">Porcentagem Mínima de Similaridade (Articles Similarity %)</span>
              <p style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">Padrão Estrito = 97% | Padrão Abrangente = 65%</p>
            </div>
            <span id="ar-thresh-val" style="font-size:1.3rem;font-weight:800;color:var(--purple);background:var(--purple-glow);padding:4px 12px;border-radius:var(--radius-sm);border:1px solid rgba(99,102,241,0.3);">97%</span>
          </div>
          <div style="display:flex;gap:12px;align-items:center;">
            <input type="range" id="ar-thresh-slider" min="50" max="100" value="97" style="flex:1;cursor:pointer;" />
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm btn-ghost ar-preset-btn" data-val="97" style="padding:4px 8px;font-size:0.75rem;">97% (Estrito)</button>
              <button class="btn btn-sm btn-ghost ar-preset-btn" data-val="85" style="padding:4px 8px;font-size:0.75rem;">85%</button>
              <button class="btn btn-sm btn-ghost ar-preset-btn" data-val="65" style="padding:4px 8px;font-size:0.75rem;">65% (Amplo)</button>
            </div>
          </div>
        </div>

        <div class="resolver-section">
          <label style="font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:8px;">
            3. Configurações Avançadas (Auto-Resolver Settings):
          </label>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="display:flex;align-items:flex-start;gap:10px;font-size:0.84rem;color:var(--text-secondary);cursor:pointer;">
              <input type="checkbox" id="sett-norm" checked style="margin-top:3px;" />
              <div>
                <strong style="color:var(--text-primary);">Normalização Avançada de Texto (Text Normalization)</strong>
                <div style="font-size:0.75rem;color:var(--text-muted);">Remove acentos, hífens, pontuações, maiúsculas/minúsculas e tags HTML para evitar falsos negativos.</div>
              </div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:10px;font-size:0.84rem;color:var(--text-secondary);cursor:pointer;">
              <input type="checkbox" id="sett-protect" checked style="margin-top:3px;" />
              <div>
                <strong style="color:var(--text-primary);">Proteção de Customizações (Articles Customization Protection)</strong>
                <div style="font-size:0.75rem;color:var(--text-muted);">Se um artigo já recebeu notas ou decisões manuais da equipe, essa versão é preservada automaticamente.</div>
              </div>
            </label>
          </div>
        </div>

        <div id="ar-impact-box" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-lg);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:0.75rem;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:0.06em;">Impacto da Resolução</span>
            <div style="font-size:0.95rem;font-weight:700;color:var(--text-primary);margin-top:2px;">
              <span id="ar-impact-dups" style="color:var(--purple);font-size:1.2rem;font-weight:800;">${initialImpact.count}</span> duplicatas serão descartadas
            </div>
          </div>
          <div style="text-align:right;">
            <span style="font-size:0.75rem;color:var(--text-muted);">Artigos únicos restantes</span>
            <div id="ar-impact-unique" style="font-size:1.2rem;font-weight:800;color:var(--green);">${project.articles.length - initialImpact.count}</div>
          </div>
        </div>
      </div>
    `;

    const m = modal(
      '⚡ Systematic Auto Resolver — Configurações Avançadas',
      bodyHtml,
      [
        { label: 'Cancelar', style: 'btn-ghost', cb: () => {} },
        { 
          label: `⚡ Resolver ${initialImpact.count} Duplicatas Agora`, 
          style: 'btn-primary', 
          cb: () => {
            const finalImpact = calculateImpact(currentThreshold, selectedFile);
            onConfirm({
              threshold: currentThreshold,
              filePref: selectedFile,
              matchingPairs: finalImpact.matchingPairs
            });
          } 
        }
      ]
    );

    setTimeout(() => {
      const slider = document.getElementById('ar-thresh-slider');
      const displayVal = document.getElementById('ar-thresh-val');
      const prefSelect = document.getElementById('ar-pref-file');
      const dupsEl = document.getElementById('ar-impact-dups');
      const uniqueEl = document.getElementById('ar-impact-unique');
      const confirmBtn = m.querySelector('.modal-footer .btn-primary');

      function updateLivePreview() {
        const impact = calculateImpact(currentThreshold, selectedFile);
        if (dupsEl) dupsEl.textContent = impact.count;
        if (uniqueEl) uniqueEl.textContent = project.articles.length - impact.count;
        if (confirmBtn) confirmBtn.textContent = `⚡ Resolver ${impact.count} Duplicatas Agora`;
      }

      if (slider) {
        slider.oninput = () => {
          currentThreshold = parseInt(slider.value);
          if (displayVal) displayVal.textContent = currentThreshold + '%';
          updateLivePreview();
        };
      }

      document.querySelectorAll('.ar-preset-btn').forEach(btn => {
        btn.onclick = () => {
          const val = parseInt(btn.dataset.val);
          currentThreshold = val;
          if (slider) slider.value = val;
          if (displayVal) displayVal.textContent = val + '%';
          updateLivePreview();
        };
      });

      if (prefSelect) {
        prefSelect.onchange = () => {
          selectedFile = prefSelect.value;
          updateLivePreview();
        };
      }
    }, 50);
  }

  // ─── PDF VIEWER & READER MODAL ───────────────────────
  function showPdfViewerModal(article, callbacks = {}) {
    if (!article) return;
    const hasData = Boolean(article.pdf_data);
    const pdfSrc = article.pdf_data || '';

    const bodyHtml = `
      <div class="pdf-viewer-modal-content" style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-card2);padding:10px 16px;border-radius:var(--radius-md);border:1px solid var(--border);flex-wrap:wrap;gap:8px;">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">
            <strong style="color:var(--text-primary);font-size:0.88rem;">📄 ${escapeHtml(article.pdf_name || article.title || 'Artigo Científico')}</strong>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${hasData ? `
              <a href="${pdfSrc}" download="${escapeHtml(article.pdf_name || 'artigo.pdf')}" class="btn btn-sm btn-secondary" style="text-decoration:none;">
                ⬇️ Baixar PDF
              </a>
              <button class="btn btn-sm btn-ghost" id="pdf-modal-newtab-btn">↗ Abrir Nova Aba</button>
            ` : ''}
            <button class="btn btn-sm btn-ghost" id="pdf-modal-replace-btn">📎 ${hasData ? 'Trocar Arquivo' : 'Anexar PDF'}</button>
            <input type="file" id="pdf-modal-replace-input" accept=".pdf" style="display:none;" />
          </div>
        </div>

        ${hasData ? `
          <div class="pdf-frame-container" style="width:100%;height:68vh;min-height:440px;background:#130e20;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border);position:relative;">
            <iframe src="${pdfSrc}#toolbar=1" style="width:100%;height:100%;border:none;" title="Visualizador de PDF Gisa"></iframe>
          </div>
        ` : `
          <div style="text-align:center;padding:50px 20px;background:var(--bg-card2);border-radius:var(--radius-lg);border:1px dashed var(--border);">
            <div style="font-size:3rem;margin-bottom:12px;">📄</div>
            <h4 style="color:var(--text-primary);margin-bottom:6px;">Nenhum arquivo PDF anexado a este artigo</h4>
            <p style="color:var(--text-muted);font-size:0.85rem;max-width:440px;margin:0 auto 16px;">
              Faça o upload do artigo científico em PDF para ler o texto integral diretamente no Gisa e acelerar sua revisão sistemática.
            </p>
            <button class="btn btn-primary" id="pdf-modal-upload-empty-btn">📎 Selecionar Arquivo PDF</button>
            <input type="file" id="pdf-modal-upload-empty-input" accept=".pdf" style="display:none;" />
          </div>
        `}
      </div>
    `;

    const m = modal(
      `📄 Leitor de PDF — ${escapeHtml(article.title).substring(0, 45)}...`,
      bodyHtml,
      [
        { label: 'Fechar', style: 'btn-ghost' }
      ]
    );

    setTimeout(() => {
      const newTabBtn = document.getElementById('pdf-modal-newtab-btn');
      if (newTabBtn && hasData) {
        newTabBtn.onclick = () => {
          const win = window.open();
          if (win) {
            win.document.write(`<iframe src="${pdfSrc}" style="position:fixed;top:0;left:0;bottom:0;right:0;width:100%;height:100%;border:none;margin:0;padding:0;overflow:hidden;z-index:999999;"></iframe>`);
          }
        };
      }

      function handleFileAttach(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target.result;
          if (callbacks.onAttachPdf) {
            callbacks.onAttachPdf(file.name, dataUrl);
          }
          toast('PDF anexado ao artigo com sucesso!', 'success');
          article.pdf_data = dataUrl;
          article.pdf_name = file.name;
          article.has_pdf = true;
          m.remove();
          showPdfViewerModal(article, callbacks);
        };
        reader.readAsDataURL(file);
      }

      const replaceBtn = document.getElementById('pdf-modal-replace-btn');
      const replaceInput = document.getElementById('pdf-modal-replace-input');
      if (replaceBtn && replaceInput) {
        replaceBtn.onclick = () => replaceInput.click();
        replaceInput.onchange = (e) => handleFileAttach(e.target.files[0]);
      }

      const emptyBtn = document.getElementById('pdf-modal-upload-empty-btn');
      const emptyInput = document.getElementById('pdf-modal-upload-empty-input');
      if (emptyBtn && emptyInput) {
        emptyBtn.onclick = () => emptyInput.click();
        emptyInput.onchange = (e) => handleFileAttach(e.target.files[0]);
      }
    }, 50);
  }

  // ─── USER PROFILE MODAL ──────────────────────────────
  function showProfileModal(onProfileUpdated = null) {
    const profile = Storage.getProfile();
    const stats = Storage.getUserStats();
    const isCloud = typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured();

    // Build avatar display for modal header
    const photoUrl = profile.avatar && profile.avatar.startsWith('http') ? profile.avatar
      : (profile.picture && profile.picture.startsWith('http') ? profile.picture : null);
    const headerAvatarHtml = photoUrl
      ? `<img src="${photoUrl}" alt="Foto" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--purple);box-shadow:0 4px 14px var(--purple-glow);flex-shrink:0;">`
      : `<div style="font-size:1.5rem;font-weight:800;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:2px solid var(--purple);border-radius:50%;width:64px;height:64px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px var(--purple-glow);flex-shrink:0;color:#fff;">${(profile.name||'P').split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase()}</div>`;

    const bodyHtml = `
      <div class="user-profile-dialog" style="display:flex;flex-direction:column;gap:18px;">
        
        <!-- Header / Banner do Perfil -->
        <div style="background:linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.1));border:1px solid rgba(99,102,241,0.25);border-radius:var(--radius-lg);padding:16px 20px;display:flex;align-items:center;gap:16px;">
          ${headerAvatarHtml}
          <div style="flex:1;overflow:hidden;">
            <h3 style="color:var(--text-primary);margin:0 0 4px 0;font-size:1.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="prof-display-name">${escapeHtml(profile.name || 'Pesquisador(a)')}</h3>
            <div style="font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="badge ${isCloud ? 'badge-include' : 'badge-purple'}">${isCloud ? '☁️ Supabase Conectado' : '💾 Local-First (Offline)'}</span>
              <span>${escapeHtml(profile.role || 'Pesquisador(a) Principal')}</span>
            </div>
          </div>
        </div>

        <!-- Estatísticas do Pesquisador -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
          <div style="background:var(--bg-card2);padding:10px 8px;border-radius:var(--radius-md);border:1px solid var(--border);text-align:center;">
            <div style="font-size:1.25rem;font-weight:800;color:var(--purple);">${stats.totalProjects}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Projetos</div>
          </div>
          <div style="background:var(--bg-card2);padding:10px 8px;border-radius:var(--radius-md);border:1px solid var(--border);text-align:center;">
            <div style="font-size:1.25rem;font-weight:800;color:var(--text-primary);">${stats.totalArticles}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Artigos</div>
          </div>
          <div style="background:var(--bg-card2);padding:10px 8px;border-radius:var(--radius-md);border:1px solid var(--border);text-align:center;">
            <div style="font-size:1.25rem;font-weight:800;color:var(--green);">${stats.included}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Incluídos</div>
          </div>
        </div>

        <!-- Formulário de Edição -->
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 200px), 1fr));gap:12px;">
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Seu Nome:</label>
              <input id="prof-input-name" class="input" style="width:100%;font-size:0.88rem;" value="${escapeHtml(profile.name || '')}" placeholder="Ex: Dra. Giselle Corrêa" />
            </div>
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">E-mail:</label>
              <input id="prof-input-email" type="email" class="input" style="width:100%;font-size:0.88rem;" value="${escapeHtml(profile.email || '')}" placeholder="seu.email@pesquisa.br" readonly style="opacity:0.7;cursor:default;"/>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 200px), 1fr));gap:12px;">
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Instituição / Universidade:</label>
              <input id="prof-input-inst" class="input" style="width:100%;font-size:0.88rem;" value="${escapeHtml(profile.institution || '')}" placeholder="Ex: USP, UFRJ, Fiocruz, UnB" />
            </div>
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Função / Cargo Acadêmico:</label>
              <select id="prof-input-role" class="input" style="width:100%;font-size:0.88rem;padding:9px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);">
                <option value="Pesquisador(a) Principal" ${profile.role === 'Pesquisador(a) Principal' ? 'selected' : ''}>Pesquisador(a) Principal (PI)</option>
                <option value="Revisor(a) Sistemático(a)" ${profile.role === 'Revisor(a) Sistemático(a)' ? 'selected' : ''}>Revisor(a) Sistemático(a)</option>
                <option value="Pós-Graduando(a) (Mestrado/Doutorado)" ${profile.role?.includes('Pós-Graduando') ? 'selected' : ''}>Pós-Graduando(a) (Mestrado/Doutorado)</option>
                <option value="Estudante de Graduação / IC" ${profile.role?.includes('Graduação') ? 'selected' : ''}>Estudante de Graduação / IC</option>
                <option value="Orientador(a) / Docente" ${profile.role?.includes('Orientador') ? 'selected' : ''}>Orientador(a) / Docente</option>
              </select>
            </div>
          <div style="margin-top:8px;padding-top:14px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="font-size:0.8rem;color:var(--text-muted);">
              Sessão iniciada como <strong>${escapeHtml(profile.email || 'Usuário')}</strong>
            </div>
            <button type="button" id="prof-btn-logout" class="btn btn-sm" style="color:#ef4444;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.08);font-weight:600;padding:6px 14px;border-radius:var(--radius-md);cursor:pointer;transition:all 0.2s;">
              🚪 Sair da Conta
            </button>
          </div>
        </div>
      </div>
    `;

    modal(
      'Perfil do Pesquisador',
      bodyHtml,
      [
        { label: 'Fechar', style: 'btn-ghost' },
        {
          label: 'Salvar Perfil',
          style: 'btn-primary',
          cb: () => {
            const name = document.getElementById('prof-input-name')?.value?.trim() || 'Pesquisador(a)';
            const email = document.getElementById('prof-input-email')?.value?.trim() || profile.email || '';
            const institution = document.getElementById('prof-input-inst')?.value?.trim() || '';
            const role = document.getElementById('prof-input-role')?.value || 'Pesquisador(a) Principal';

            const updated = Storage.saveProfile({
              ...profile,
              name,
              email,
              institution,
              role
            });

            if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
              SupabaseSync.updateUserMetadata({ full_name: name, institution, role });
            }

            updateUserProfileNavbarUI();
            toast('Perfil salvo com sucesso!', 'success');
            if (onProfileUpdated) onProfileUpdated(updated);
          }
        }
      ]
    );

    setTimeout(() => {
      const nameInput = document.getElementById('prof-input-name');
      const displayName = document.getElementById('prof-display-name');
      if (nameInput && displayName) {
        nameInput.oninput = () => {
          displayName.textContent = nameInput.value.trim() || 'Pesquisador(a)';
        };
      }

      const logoutBtn = document.getElementById('prof-btn-logout');
      if (logoutBtn) {
        logoutBtn.onclick = async () => {
          document.querySelector('.modal-overlay')?.remove();
          if (typeof App !== 'undefined' && App.logout) {
            await App.logout();
          } else {
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
            updateUserProfileNavbarUI();
            toast('Você saiu da sua conta com sucesso.', 'info');
            if (typeof App !== 'undefined' && App.navigate) {
              App.navigate('auth');
            }
          }
        };
      }
    }, 50);
  }

  // ─── INSTALL & DOWNLOAD MODAL ─────────────────────────
  function showInstallDownloadModal() {
    const GITHUB_RELEASES_URL = 'https://github.com/GRB-04/Gisa-app/releases';

    const bodyHtml = `
      <div class="install-download-modal" style="display:flex;flex-direction:column;gap:18px;">
        
        <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.5;margin:0;">
          O <strong>Gisa</strong> foi desenvolvido para você utilizar onde quiser: no <strong>computador</strong> (aplicativo desktop instalado), no <strong>celular Android</strong> (arquivo APK nativo) ou direto no seu <strong>navegador web</strong>.
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 240px), 1fr));gap:14px;">
          
          <!-- Card 1: Instalar no Computador / Desktop -->
          <div style="background:var(--bg-card2);border:1px solid rgba(99,102,241,0.3);border-radius:var(--radius-lg);padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 4px 14px rgba(0,0,0,0.2);">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:2rem;">💻</span>
              <div>
                <strong style="color:var(--text-primary);font-size:0.98rem;display:block;">Instalar no Computador</strong>
                <span style="font-size:0.75rem;color:var(--purple);font-weight:600;">Windows, Mac e Linux (PWA)</span>
              </div>
            </div>
            
            <p style="font-size:0.82rem;color:var(--text-secondary);line-height:1.4;margin:0;">
              Execute o Gisa como um aplicativo nativo em sua própria janela, com atalhos de teclado e funcionamento 100% offline.
            </p>

            <button class="btn btn-primary" id="modal-pwa-install-btn" style="width:100%;margin-top:auto;background:linear-gradient(135deg, var(--purple), var(--violet));">
              ⚡ Instalar no Computador Agora
            </button>
            <small style="font-size:0.72rem;color:var(--text-muted);text-align:center;">
              (Ou clique no ícone ⊕ na barra de endereço do navegador)
            </small>
          </div>

          <!-- Card 2: Baixar APK para Celular Android -->
          <div style="background:var(--bg-card2);border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-lg);padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 4px 14px rgba(0,0,0,0.2);">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:2rem;">📱</span>
              <div>
                <strong style="color:var(--text-primary);font-size:0.98rem;display:block;">Baixar APK Android</strong>
                <span style="font-size:0.75rem;color:var(--green);font-weight:600;">Instalação direta no Celular</span>
              </div>
            </div>
            
            <p style="font-size:0.82rem;color:var(--text-secondary);line-height:1.4;margin:0;">
              Baixe o pacote <code>app-debug.apk</code> gerado automaticamente para instalar no seu smartphone ou tablet Android.
            </p>

            <a href="${GITHUB_RELEASES_URL}" target="_blank" rel="noopener" class="btn btn-secondary" style="width:100%;text-decoration:none;text-align:center;margin-top:auto;background:rgba(34,197,94,0.15);border-color:rgba(34,197,94,0.4);color:var(--green);">
              📥 Baixar APK no GitHub Releases ↗
            </a>
            <small style="font-size:0.72rem;color:var(--text-muted);text-align:center;">
              Versão mais recente compilada
            </small>
          </div>

        </div>

        <!-- Instruções Rápidas de Instalação do APK -->
        <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;">
          <strong style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">
            ℹ️ Como instalar no Android:
          </strong>
          <ol style="margin:0;padding-left:20px;font-size:0.8rem;color:var(--text-secondary);line-height:1.5;">
            <li>Clique no botão verde acima para abrir os <strong>Releases</strong>.</li>
            <li>Baixe o arquivo <strong><code>app-debug.apk</code></strong>.</li>
            <li>Abra o arquivo no celular e autorize "Instalar de Fontes Desconhecidas" caso seja solicitado.</li>
          </ol>
        </div>

      </div>
    `;

    modal(
      '📲 Baixar / Instalar o Aplicativo Gisa',
      bodyHtml,
      [
        { label: 'Fechar', style: 'btn-ghost' }
      ]
    );

    setTimeout(() => {
      const pwaBtn = document.getElementById('modal-pwa-install-btn');
      if (pwaBtn) {
        pwaBtn.onclick = async () => {
          if (window.__gisaDeferredInstallPrompt) {
            window.__gisaDeferredInstallPrompt.prompt();
            const { outcome } = await window.__gisaDeferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
              toast('Gisa instalado no computador!', 'success');
              window.__gisaDeferredInstallPrompt = null;
            }
          } else {
            toast('Para instalar no PC: clique no ícone de instalar na barra do navegador (Chrome/Edge)!', 'info');
          }
        };
      }
    }, 50);
  }

  function updateUserProfileNavbarUI() {
    const profile = Storage.getProfile();
    const avatarEl = document.getElementById('nav-user-avatar');
    const nameEl = document.getElementById('nav-user-name');

    if (!avatarEl || !nameEl) return;

    const hasEmail = profile.email && profile.email.includes('@');

    if (hasEmail) {
      // Check for a real photo URL (stored in avatar or picture field)
      const photoUrl = profile.avatar && profile.avatar.startsWith('http')
        ? profile.avatar
        : (profile.picture && profile.picture.startsWith('http') ? profile.picture : null);

      if (photoUrl) {
        avatarEl.innerHTML = `<img src="${photoUrl}" alt="Avatar" style="width:22px;height:22px;border-radius:50%;vertical-align:middle;object-fit:cover;display:inline-block;">`;
        avatarEl.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;';
      } else {
        // Initials circle for email login without photo
        const initials = (profile.name || 'P').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
        avatarEl.innerHTML = '';
        avatarEl.textContent = initials;
        avatarEl.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:0.68rem;font-weight:800;vertical-align:middle;flex-shrink:0;';
      }

      const firstName = (profile.name || 'Perfil').split(' ')[0];
      nameEl.textContent = firstName.length > 12 ? firstName.substring(0, 10) + '…' : firstName;
    } else {
      avatarEl.innerHTML = '';
      avatarEl.textContent = '';
      avatarEl.style.cssText = '';
      nameEl.textContent = 'Entrar';
    }
  }

  return {
    el, toast, modal, renderProjectCard, renderArticleCard, renderDupPair, renderDonut,
    emptyState, loadingState, scoreBar, decisionLabel, showExclusionReasonModal, renderPRISMA,
    renderLabelChips, showLabelPicker, renderHotkeysPanel, renderLabelsManager, showAIAnalysisModal,
    highlightKeywords, renderFacetSidebar, renderAbstractInspector, showHotkeysModal,
    showSupabaseModal, updateCloudStatusUI, showAutoResolverModal, showPdfViewerModal,
    showProfileModal, showInstallDownloadModal, updateUserProfileNavbarUI
  };
})();
