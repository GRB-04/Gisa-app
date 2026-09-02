/**
 * Gisa — AI Research Pilot & Article Analyzer Module
 * Multi-Provider Real LLM Engine: Groq, Google Gemini, OpenAI, OpenRouter + Advanced Offline NLP
 */

const AIAssistant = (() => {

  const DEFAULT_MODELS = {
    groq: 'qwen/qwen3.8-27b',
    gemini: 'gemini-1.5-flash',
    openai: 'gpt-4o-mini',
    openrouter: 'meta-llama/llama-3.3-70b-instruct:free'
  };

  const PROVIDER_NAMES = {
    groq: 'Groq Cloud (Qwen 3.8 27B - Ultra Rápido)',
    gemini: 'Google Gemini (1.5 Flash - Grátis)',
    openai: 'OpenAI (ChatGPT GPT-4o-mini)',
    openrouter: 'OpenRouter (Modelos Abertos)'
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getAIConfig() {
    if (typeof Storage === 'undefined') return { provider: 'groq', apiKey: '', model: DEFAULT_MODELS.groq };
    const settings = Storage.getSettings() || {};
    const cfg = settings.ai_config || {};
    return {
      provider: cfg.provider || 'groq',
      apiKey: (cfg.apiKey || '').trim(),
      model: cfg.model || DEFAULT_MODELS[cfg.provider || 'groq'] || DEFAULT_MODELS.groq
    };
  }

  function saveAIConfig(config) {
    if (typeof Storage === 'undefined') return;
    const current = getAIConfig();
    const updated = {
      ...current,
      ...config,
      updated_at: new Date().toISOString()
    };
    Storage.saveSetting('ai_config', updated);
    return updated;
  }

  function isConfigured() {
    const cfg = getAIConfig();
    return Boolean(cfg.apiKey && cfg.apiKey.length > 5);
  }

  /**
   * Universal LLM API caller
   */
  async function callLLM({ prompt, systemPrompt = '', temperature = 0.2, maxTokens = 1500 }) {
    const cfg = getAIConfig();
    if (!cfg.apiKey) {
      throw new Error('Chave de API de IA não configurada. Configure sua chave Groq, Gemini ou OpenAI.');
    }

    const provider = cfg.provider || 'groq';
    const model = cfg.model || DEFAULT_MODELS[provider];

    // 1. GROQ API (OpenAI-compatible)
    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          temperature,
          max_tokens: maxTokens
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Erro Groq API HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    // 2. GOOGLE GEMINI API
    if (provider === 'gemini') {
      const geminiModel = model.includes('gemini') ? model : 'gemini-1.5-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
      
      const contents = [];
      if (systemPrompt) {
        contents.push({ role: 'user', parts: [{ text: `[INSTRUÇÕES DO SISTEMA]: ${systemPrompt}` }] });
        contents.push({ role: 'model', parts: [{ text: 'Entendido. Agirei estritamente de acordo com as instruções do sistema.' }] });
      }
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
          }
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Erro Gemini API HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // 3. OPENAI API
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          temperature,
          max_tokens: maxTokens
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Erro OpenAI API HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    // 4. OPENROUTER API
    if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
          'HTTP-Referer': 'https://gisa.app',
          'X-Title': 'Gisa Systematic Review'
        },
        body: JSON.stringify({
          model: model || 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          temperature,
          max_tokens: maxTokens
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Erro OpenRouter API HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    throw new Error(`Provedor de IA desconhecido: ${provider}`);
  }

  /**
   * Test connection to selected provider
   */
  async function testConnection(provider, apiKey, model = null) {
    const original = getAIConfig();
    saveAIConfig({ provider, apiKey, model: model || DEFAULT_MODELS[provider] });

    try {
      const response = await callLLM({
        prompt: 'Responda estritamente com a palavra "CONECTADO".',
        systemPrompt: 'Você é um validador de API.',
        temperature: 0,
        maxTokens: 10
      });

      if (response && response.length > 0) {
        return { ok: true, message: `Conexão bem-sucedida com ${PROVIDER_NAMES[provider] || provider}!` };
      }
      return { ok: false, error: 'A IA respondeu em branco.' };
    } catch (err) {
      saveAIConfig(original); // revert if test failed
      return { ok: false, error: err.message };
    }
  }

  /**
   * High quality offline heuristic PICO & Screening analysis
   */
  function analyzeOffline(article, projectKeywords = []) {
    const title = article.title || 'Sem título';
    const text = (article.abstract || title).toLowerCase();
    const origText = article.abstract || title;

    // Population (P)
    let population = "Amostra definida pelo escopo metodológico do estudo";
    const popMatches = origText.match(/(\d+[\d.,]*)\s*(participantes|sujeitos|pacientes|adolescentes|crianças|mulheres|homens|estudantes|jovens|participants|patients|subjects|women|men|children|adolescents|students)/i);
    if (popMatches) {
      population = `Coorte/Amostra de ${popMatches[0]}`;
    } else if (text.includes('adolescen') || text.includes('youth') || text.includes('jovens')) {
      population = "Adolescentes e população jovem em ambiente comunitário ou escolar";
    } else if (text.includes('female') || text.includes('mulher') || text.includes('women')) {
      population = "População feminina / mulheres";
    } else if (text.includes('patient') || text.includes('paciente') || text.includes('clinical')) {
      population = "Pacientes em atendimento clínico ou serviço de saúde";
    }

    // Intervention / Exposure (I)
    let intervention = projectKeywords && projectKeywords.length > 0
      ? `Investigação alinhada aos descritores: ${projectKeywords.slice(0, 3).join(', ')}`
      : "Fenômeno, intervenção ou exposição investigada no estudo";
    
    if (text.includes('suporte social') || text.includes('social support')) {
      intervention = "Redes de suporte social, apoio comunitário ou familiar";
    } else if (text.includes('violênc') || text.includes('violence') || text.includes('crime')) {
      intervention = "Exposição a situações de violência ou vitimização";
    } else if (text.includes('terapia') || text.includes('intervention') || text.includes('treatment')) {
      intervention = "Protocolo de intervenção terapêutica ou psicossocial";
    }

    // Comparator (C)
    const comparator = text.includes('control') || text.includes('randomized') || text.includes('cohort') || text.includes('placebo')
      ? "Grupo de controle / tratamento convencional ou coorte comparativa"
      : "Análise descritiva, transversal ou comparativa intragrupo";

    // Outcome (O)
    let outcome = "Desfechos primários de saúde, comportamento ou impacto psicossocial";
    if (text.includes('depress') || text.includes('ansied') || text.includes('mental')) {
      outcome = "Indicadores de saúde mental, bem-estar e sintomatologia";
    } else if (text.includes('mortalit') || text.includes('óbito') || text.includes('death')) {
      outcome = "Taxas de mortalidade e desfechos clínicos adversos";
    } else if (text.includes('prevalen') || text.includes('inciden')) {
      outcome = "Taxas de prevalência, incidência e fatores de risco";
    }

    // Verdict
    const score = article.relevance_score;
    let verdict = 'include';
    let reasoning = "O artigo aborda o tema central e descritores definidos para a revisão.";
    if (score !== null && score !== undefined && score < 20) {
      verdict = 'exclude';
      reasoning = "Baixa aderência temático-metodológica aos critérios de inclusão pré-definidos.";
    } else if (score !== null && score !== undefined && score < 50) {
      verdict = 'maybe';
      reasoning = "Relevância parcial aos objetivos da revisão. Recomenda-se leitura do texto completo para confirmação.";
    }

    // Key points
    const keyPoints = [];
    const sentences = origText.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 25);
    if (sentences.length > 0) keyPoints.push(`<strong>Objetivo:</strong> ${escapeHtml(sentences[0])}`);
    if (sentences.length > 1) keyPoints.push(`<strong>Metodologia:</strong> ${escapeHtml(sentences[1])}`);
    if (sentences.length > 2) keyPoints.push(`<strong>Conclusão:</strong> ${escapeHtml(sentences[sentences.length - 1])}`);
    if (!keyPoints.length) keyPoints.push("Análise realizada com base nos metadados cadastrados do artigo.");

    return {
      population,
      intervention,
      comparator,
      outcome,
      verdict,
      reasoning,
      keyPoints,
      isRealLLM: false
    };
  }

  /**
   * Intelligent PICO & Screening Analysis (Uses Real LLM when configured, fallback to heuristic)
   */
  async function analyzeArticle(article, projectKeywords = []) {
    if (!isConfigured()) {
      return analyzeOffline(article, projectKeywords);
    }

    const systemPrompt = `Você é o Gisa AI, um auditor sênior de revisões sistemáticas da literatura acadêmica (metodologia PRISMA 2020 e Cochrane).
Sua missão é analisar criticamente o artigo fornecido e extrair o framework PICO, um resumo executivo e uma recomendação de triagem.

Você DEVE responder EXCLUSIVAMENTE em formato JSON estrito, sem markdown ao redor, seguindo esta estrutura:
{
  "population": "Descrição detalhada da População/Amostra (idade, gênero, condições, tamanho N se citado)",
  "intervention": "Intervenção, Fenômeno ou Exposição investigada",
  "comparator": "Grupo comparador, controle ou grupo de referência",
  "outcome": "Desfechos primários mensurados",
  "verdict": "include" ou "exclude" ou "maybe",
  "reasoning": "Justificativa científica clara e objetiva para a decisão de triagem recomendada",
  "keyPoints": [
    "Objetivo principal do estudo",
    "Desenho metodológico e instrumentos utilizados",
    "Principais achados e conclusões dos autores"
  ]
}`;

    const prompt = `Palavras-chave e critérios da revisão sistemática:
${projectKeywords.length ? projectKeywords.join(', ') : 'Critérios gerais do estudo'}

Artigo a analisar:
Título: ${article.title}
Autores: ${(article.authors || []).join(', ')} (${article.year || 's/ano'})
Revista: ${article.journal || 'Não especificada'}
Resumo: ${article.abstract || 'Resumo não disponível. Avalie com base no título.'}`;

    try {
      const rawText = await callLLM({ prompt, systemPrompt, temperature: 0.1, maxTokens: 1200 });
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        population: parsed.population || "População não especificada",
        intervention: parsed.intervention || "Intervenção não especificada",
        comparator: parsed.comparator || "Não aplicável / Não especificado",
        outcome: parsed.outcome || "Desfechos não especificados",
        verdict: ['include', 'exclude', 'maybe'].includes(parsed.verdict) ? parsed.verdict : 'maybe',
        reasoning: parsed.reasoning || "Análise realizada com sucesso pela IA.",
        keyPoints: Array.isArray(parsed.keyPoints) && parsed.keyPoints.length ? parsed.keyPoints : ["Análise concluída."],
        isRealLLM: true,
        providerName: PROVIDER_NAMES[getAIConfig().provider] || 'IA'
      };
    } catch (err) {
      console.warn('Falha na resposta do LLM, utilizando análise heurística estruturada:', err);
      const fallback = analyzeOffline(article, projectKeywords);
      fallback.warning = `IA online temporariamente indisponível (${err.message}). Exibindo análise heurística do banco.`;
      return fallback;
    }
  }

  /**
   * Interactive Conversational Q&A with the Article
   */
  async function answerQuestion(article, question, chatHistory = []) {
    const q = (question || '').trim();
    if (!q) return '';

    const text = ((article.abstract || '') + ' ' + (article.title || '')).trim();

    if (!isConfigured()) {
      // Intelligent offline keyword intent matcher
      const qLower = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const tLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      let answer = '';
      if (qLower.includes('amostra') || qLower.includes('participante') || qLower.includes('quantos') || qLower.includes('sample') || qLower.includes('n=')) {
        const match = text.match(/(\d+[\d.,]*)\s*(participants|subjects|patients|women|children|adolescents|estudantes|jovens|mulheres|pacientes|casos|individuos)/i);
        answer = match 
          ? `📊 **Tamanho da Amostra Identificado**: O estudo reporta **${escapeHtml(match[0])}**.`
          : `📊 **Informação de Amostra**: O resumo não especifica o número exato de participantes. Recomenda-se consultar a seção de Método no texto completo.`;
      } else if (qLower.includes('metodologia') || qLower.includes('método') || qLower.includes('method') || qLower.includes('desenho')) {
        if (tLower.includes('systematic review') || tLower.includes('meta-analysis') || tLower.includes('revisao sistematica')) answer = `🔬 **Metodologia**: Trata-se de uma **Revisão Sistemática / Meta-análise** da literatura.`;
        else if (tLower.includes('randomized') || tLower.includes('rct') || tLower.includes('ensaio clinico')) answer = `🔬 **Metodologia**: Ensaio Clínico Randomizado (RCT).`;
        else if (tLower.includes('cohort') || tLower.includes('coorte')) answer = `🔬 **Metodologia**: Estudo de Coorte Longitudinal de acompanhamento.`;
        else if (tLower.includes('cross-sectional') || tLower.includes('transversal')) answer = `🔬 **Metodologia**: Estudo Observacional Transversal (Cross-sectional).`;
        else if (tLower.includes('qualitative') || tLower.includes('entrevista')) answer = `🔬 **Metodologia**: Pesquisa Qualitativa descritiva.`;
        else answer = `🔬 **Metodologia**: O estudo utiliza delineamento empírico com análise estatística descrita no resumo.`;
      } else if (qLower.includes('resultado') || qLower.includes('conclusao') || qLower.includes('achado') || qLower.includes('result')) {
        const sentences = text.split(/(?<=[.?!])\s+/);
        const lastSentence = sentences[sentences.length - 1] || sentences[0];
        answer = `💡 **Principais Achados / Conclusão**: "${escapeHtml(lastSentence)}"`;
      } else {
        const sentences = text.split(/(?<=[.?!])\s+/);
        const rel = sentences.find(s => {
          const sNorm = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return qLower.split(' ').some(w => w.length > 3 && sNorm.includes(w));
        }) || sentences[0] || text;
        answer = `🤖 **Gisa Pilot**: Com base no texto do artigo:\n\n*"${escapeHtml(rel)}"*`;
      }

      return answer + `\n\n<small style="color:var(--purple);display:block;margin-top:6px;">💡 <em>Dica: Conecte uma chave gratuita da Groq (Llama 3.3) ou Google Gemini na aba de configurações para respostas 100% conversacionais e profundas!</em></small>`;
    }

    // REAL LLM CALL
    const systemPrompt = `Você é o Gisa AI, assistente científico e metodológico de revisões sistemáticas.
Você está conversando com um pesquisador sobre o seguinte artigo científico:
Título: ${article.title}
Autores: ${(article.authors || []).join(', ')} (${article.year || 's/ano'})
Revista: ${article.journal || 'Não informada'}
DOI: ${article.doi || 'Não informado'}
Resumo: ${article.abstract || 'Resumo indisponível'}

INSTRUÇÕES:
- Responda de forma direta, acadêmica e precisa em português.
- Use estritamente as informações presentes no resumo e título do artigo.
- Se a informação não estiver no resumo, seja transparente e sugira conferir o artigo completo.
- Destaque números, p-values, dosagens e metodologias em negrito quando relevante.`;

    try {
      const response = await callLLM({
        prompt: `Pergunta do pesquisador: ${q}`,
        systemPrompt,
        temperature: 0.3,
        maxTokens: 800
      });
      return response;
    } catch (err) {
      return `❌ **Erro ao consultar IA**: ${err.message}. Verifique sua chave nas configurações.`;
    }
  }

  return {
    getAIConfig,
    saveAIConfig,
    isConfigured,
    testConnection,
    callLLM,
    analyzeArticle,
    answerQuestion,
    DEFAULT_MODELS,
    PROVIDER_NAMES,
    escapeHtml
  };
})();

