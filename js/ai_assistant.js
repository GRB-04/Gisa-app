/**
 * LitScan — AI Research Pilot & Article Analyzer Module
 * Provides automated PICO extraction, executive summaries, decision recommendations, and interactive Q&A.
 */

const AIAssistant = (() => {

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Perform intelligent PICO & Executive analysis of an article
   */
  function analyzeArticle(article, projectKeywords = []) {
    const text = (article.abstract || article.title || '').toLowerCase();
    const origText = article.abstract || article.title || '';

    // Extract Population (P) dynamically
    let population = "População ou amostra definida pelo escopo e critérios do estudo";
    if (text.includes('female') || text.includes('mulher') || text.includes('girl') || text.includes('women') || text.includes('mulheres')) {
      population = "Mulheres / População feminina identificada no estudo";
    } else if (text.includes('male') || text.includes('boy') || text.includes('homem') || text.includes('homens')) {
      population = "Homens / População masculina identificada no estudo";
    } else if (text.includes('child') || text.includes('criança') || text.includes('pediatri') || text.includes('youth') || text.includes('jovens') || text.includes('adolescen')) {
      population = "Crianças, adolescentes ou população jovem";
    } else if (text.includes('patient') || text.includes('paciente') || text.includes('clinical') || text.includes('hospital')) {
      population = "Pacientes clínicos / Coorte em acompanhamento em serviço de saúde";
    } else if (text.includes('student') || text.includes('estudante') || text.includes('aluno')) {
      population = "Estudantes / Comunidade acadêmica e escolar";
    }

    // Extract Intervention / Topic (I) dynamically
    let intervention = projectKeywords && projectKeywords.length > 0
      ? `Investigação temática alinhada a: ${projectKeywords.slice(0, 3).join(', ')}`
      : "Fenômeno, intervenção ou exposição investigada no artigo";

    if (text.includes('substance') || text.includes('cannabis') || text.includes('drug') || text.includes('drogas')) {
      intervention = "Uso de substâncias e programas de prevenção/tratamento de adicção";
    } else if (text.includes('violenc') || text.includes('violênc') || text.includes('feminicid') || text.includes('crime')) {
      intervention = "Violência, segurança pública ou fatores de vitimização";
    } else if (text.includes('trauma') || text.includes('mental health') || text.includes('saúde mental') || text.includes('depress')) {
      intervention = "Saúde mental, bem-estar psicológico e suporte terapêutico";
    } else if (text.includes('policy') || text.includes('política') || text.includes('law') || text.includes('lei') || text.includes('direitos')) {
      intervention = "Políticas públicas, marco regulatório e proteção de direitos";
    } else if (text.includes('treatment') || text.includes('therapy') || text.includes('terapia') || text.includes('intervention')) {
      intervention = "Protocolo de intervenção ou tratamento estruturado";
    }

    // Extract Comparison (C)
    const comparator = text.includes('control') || text.includes('randomized') || text.includes('cohort') || text.includes('placebo')
      ? "Grupo de controle / tratamento convencional (TAU) ou coorte pareada"
      : "Comparação descritiva, transversal ou com população de referência";

    // Extract Outcome (O)
    let outcome = "Mensuração dos desfechos primários, taxas de eficácia e impacto";
    if (text.includes('mortalit') || text.includes('morte') || text.includes('suicid') || text.includes('óbito')) {
      outcome = "Mortalidade, sobrevida e eventos críticos";
    } else if (text.includes('prevalen') || text.includes('inciden') || text.includes('frequen')) {
      outcome = "Taxas de prevalência, incidência e fatores associados";
    } else if (text.includes('qualidade de vida') || text.includes('quality of life')) {
      outcome = "Melhoria da qualidade de vida e funcionalidade psicossocial";
    }

    // AI Verdict
    const score = article.relevance_score;
    let verdict = 'include';
    let reasoning = "O artigo aborda temas convergentes com o escopo e objetivos prioritários da revisão.";

    if (score !== null && score !== undefined && score < 20) {
      verdict = 'exclude';
      reasoning = "O estudo apresenta baixa aderência às palavras-chave e ao escopo da revisão.";
    } else if (score !== null && score !== undefined && score < 50) {
      verdict = 'maybe';
      reasoning = "O artigo apresenta relevância parcial. Recomenda-se leitura do texto completo para confirmar elegibilidade.";
    }

    // Executive Summary Points
    const keyPoints = [];
    if (origText.length > 50) {
      const sentences = origText.split(/(?<=[.?!])\s+/).filter(s => s.length > 20);
      if (sentences.length > 0) keyPoints.push(`<strong>Objetivo Principal:</strong> ${escapeHtml(sentences[0])}`);
      if (sentences.length > 1) keyPoints.push(`<strong>Metodologia/Amostra:</strong> ${escapeHtml(sentences[1])}`);
      if (sentences.length > 2) keyPoints.push(`<strong>Achados Chave:</strong> ${escapeHtml(sentences[sentences.length - 1])}`);
    } else {
      keyPoints.push("Artigo importado sem resumo estendido. A análise baseou-se nos metadados de título e publicação.");
    }

    return {
      population,
      intervention,
      comparator,
      outcome,
      verdict,
      reasoning,
      keyPoints
    };
  }

  /**
   * Answer user natural language question about an article (LitScan Pilot Q&A)
   */
  function answerQuestion(article, question) {
    const q = (question || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const text = ((article.abstract || '') + ' ' + (article.title || '')).trim();
    const lowerText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (!text) {
      return `🤖 **Gisa Pilot**: Este artigo não possui resumo disponível para responder a perguntas detalhadas.`;
    }

    if (q.includes('amostra') || q.includes('participante') || q.includes('quantos') || q.includes('sample') || q.includes('n=')) {
      const match = text.match(/(\d+[\d.,]*)\s*(participants|subjects|patients|women|children|adolescents|estudantes|jovens|mulheres|pacientes|casos|individuos)/i);
      if (match) {
        return `📊 **Tamanho da Amostra Identificado**: O estudo reporta **${escapeHtml(match[0])}**.`;
      }
      return `📊 **Informação de Amostra**: O resumo não especifica o número numérico exato de participantes. Recomenda-se conferir a seção de Metodologia no texto integral.`;
    }

    if (q.includes('metodologia') || q.includes('método') || q.includes('method') || q.includes('desenho') || q.includes('como foi feito')) {
      if (lowerText.includes('systematic review') || lowerText.includes('meta-analysis') || lowerText.includes('revisao sistematica')) return `🔬 **Metodologia**: Trata-se de uma **Revisão Sistemática / Meta-análise** da literatura.`;
      if (lowerText.includes('randomized') || lowerText.includes('rct') || lowerText.includes('ensaio clinico')) return `🔬 **Metodologia**: Ensaio Clínico Randomizado (RCT) com grupo controle.`;
      if (lowerText.includes('cohort') || lowerText.includes('coorte')) return `🔬 **Metodologia**: Estudo de Coorte Longitudinal de acompanhamento.`;
      if (lowerText.includes('cross-sectional') || lowerText.includes('transversal')) return `🔬 **Metodologia**: Estudo Observacional Transversal (Cross-sectional).`;
      if (lowerText.includes('qualitative') || lowerText.includes('interview') || lowerText.includes('entrevista')) return `🔬 **Metodologia**: Pesquisa Qualitativa (entrevistas / análise de conteúdo).`;
      return `🔬 **Metodologia**: O estudo utiliza delineamento empírico com análise de dados descrita no resumo.`;
    }

    if (q.includes('resultado') || q.includes('conclusao') || q.includes('achado') || q.includes('result') || q.includes('conclus')) {
      const sentences = text.split(/(?<=[.?!])\s+/);
      const lastSentence = sentences[sentences.length - 1] || sentences[0];
      return `💡 **Principais Achados / Conclusão**: "${escapeHtml(lastSentence)}"`;
    }

    if (q.includes('por que') || q.includes('relevan') || q.includes('incluir') || q.includes('score')) {
      return `🎯 **Relevância para a sua Revisão**: Este artigo possui score de relevância de **${article.relevance_score !== null && article.relevance_score !== undefined ? article.relevance_score : 'N/A'}%**.`;
    }

    // Default intelligent response using text excerpt
    const sentences = text.split(/(?<=[.?!])\s+/);
    const relevantSentence = sentences.find(s => {
      const sNorm = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return q.split(' ').some(w => w.length > 3 && sNorm.includes(w));
    }) || sentences[0] || text;

    return `🤖 **Gisa Pilot**: Com base no resumo deste artigo:\n\n*"${escapeHtml(relevantSentence)}"*`;
  }

  return { analyzeArticle, answerQuestion, escapeHtml };
})();
