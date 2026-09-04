# Registro Consolidado do Projeto Gisa — Sessões de Engenharia & Design

---

## 📅 Sessão 2: 03 de Setembro de 2026
**Status:** Validado com Sucesso (`http://localhost:3000`)  
**Usuários de Referência:** Gabriel & Giselle (pesquisadora de inspiração do Gisa)

---

### 1. Contexto & Alinhamento com a Giselle (WhatsApp)
* **Aprovação do Fluxo Metodológico:** A Giselle aprovou 100% o fluxo enviado via PDF (`FLUXO.pdf`):
  * **Passo 1:** Importação de 43.626 artigos brutos.
  * **Passo 2:** Deduplicação inteligente de 16.570 artigos repetidos.
  * **Passo 3:** Triagem de 27.058 artigos únicos por leitura de resumo.
  * **Passo 4:** Aba **`✅ Incluídos (0)`** começando zerada, recebendo apenas os artigos aprovados.
* **Solicitação Adicional da Giselle:**
  > *"mas na aba do artigos [agora Incluídos] pode ter os botões de inclusão tbm? pq eu vou ler o resumo e selecionar e depois abrir o arquivo pra ler inteiro e selecionar de fato"*
  * **Solução:** Adicionados botões de decisão logo no topo de cada cartão na aba `Incluídos`, permitindo reavaliação imediata durante a leitura integral do texto.

---

### 2. Implementações Realizadas Nesta Sessão

#### ⚡ 2.1. Reatividade em Tempo Real da Aba `Incluídos (X)`
* **Problema Identificado:** Ao marcar artigos como incluídos na Triagem, o número no banner interno subia para 3, mas o botão da aba no topo mantinha `Incluídos (0)` e a barra de progresso ficava em `0 / 6779 triados` até que a página fosse recarregada.
* **Solução Implementada:**
  * Criada a função `updateProjectNavHeader(project)` em `js/app.js`.
  * Integrada no hook `makeDecision`.
  * **Resultado:** O botão `Incluídos (X)` e o contador de triados (`X / Total`) atualizam instantaneamente a cada clique, sem recarregar a página e sem risco de perda de dados.

#### 🎯 2.2. Botões de Ação Imediata nos Cartões de Artigo
* **Implementação em `js/ui.js` (`renderArticleCard`):**
  * Inseridos botões em pílula Apple Liquid Glass diretamente no cabeçalho superior do cartão (`.article-card-top-actions`):
    * `[ ✓ Incluído ]` (verde translúcido, ativo quando incluído)
    * `[ ? Talvez ]` (âmbar suave)
    * `[ ✗ Excluir ]` (vermelho com abertura do modal de motivo de exclusão)
  * Facilita a leitura integral: a pesquisadora não precisa rolar o resumo inteiro até o rodapé para alterar a decisão do estudo.
  * Se excluído da aba `Incluídos`, o artigo sai da lista suavemente e o contador do topo decresce em tempo real.

#### 🧼 2.3. Redesign Minimalista do "Systematic Auto Resolver"
* **Problema Anterior:** Interface com muitas caixas pretas pesadas, termos mistos em inglês e excesso de checkboxes técnicos (`Title (Título)`, `Publication Type`, etc.).
* **Nova Interface Apple Liquid Glass (100% Clean):**
  * **Título em Português Claro:** `⚡ Resolução Automática de Duplicatas`.
  * **Slider de Similaridade em Vidro Fosco:** Barra com pílulas de clique rápido: `97% (Estrito)`, `85% (Moderado)` e `65% (Amplo)`.
  * **Campos Comparados em Chips Redondos:** Pílulas sutis indicando `✓ Título`, `✓ DOI`, `✓ Autores`, `✓ Revista` e `✓ Ano`.
  * **Critério de Preservação:** Menu limpo priorizando manter o registro mais completo (maior resumo + metadados DOI).
  * **Card de Impacto Verde Suave:** Exibe em tempo real o total de duplicatas que serão descartadas e o total de artigos únicos que restarão.

#### 🚀 2.4. Resolução de Performance & Fim dos Travamentos (43.626 Artigos)
* **Deduplicação Assíncrona Fatiada (`Similarity.findDuplicatesAsync`):** O cálculo agora roda em fatias temporais liberando a interface a cada 35ms, com barra de progresso percentual contínua.
* **Filtro de Frequência de Tokens:** Palavras que aparecem mais de 100 vezes são ignoradas como chaves de agrupamento para evitar milhões de comparações inúteis.
* **Paginação de Duplicatas:** Renderização em lotes de 20 em 20 pares com botões `← Anterior` / `Próximo →`, eliminando o gargalo de criar milhares de nós DOM de uma vez.
* **Splash Loader Inicial no `index.html`:** Adicionado indicador elegante com spinner para nunca mais ocorrer tela preta durante a leitura inicial do IndexedDB.

#### 📦 2.5. Suporte Completo à Importação de Pasta ZIP (.zip) e Pastas do Computador
* **Demanda:** Pesquisadores frequentemente exportam buscas de bases de dados (PubMed, Scopus, Web of Science, Embase, Cochrane) compactadas em arquivos `.zip` ou possuem pastas com dezenas de PDFs e arquivos de citação.
* **Implementações:**
  * **Integração do `JSZip`:** Extração assíncrona no navegador sem envio a servidores externos (100% Local-First e offline).
  * **Extração Inteligente e Cruzada:**
    * Lê e processa múltiplos arquivos de citação (`.ris`, `.bib`, `.csv`, `.nbib`, `.txt`, `.json`, `.xml`, `.ciw`) contidos dentro do mesmo `.zip`.
    * Lê PDFs dentro do `.zip` e tenta vinculá-los automaticamente aos artigos correspondentes por título/nome de arquivo.
    * Suporta estruturas de pastas e subpastas aninhadas dentro do `.zip`.
  * **Arrastar e Soltar Pastas Reais (HTML5 `webkitGetAsEntry`):** Se o usuário arrastar uma pasta inteira diretamente do Windows Explorer para a área de upload, o sistema varre todos os arquivos internos recursivamente.
  * **Botão Dedicado:** Adicionado botão `[ 📦 Pasta ZIP (.zip) ]` e `[ 📁 Selecionar Pasta ]` na aba de Importação.

---

### 3. Matriz de Arquivos Sincronizados

| Arquivo Principal | Espelho Raiz | Pacote Web (`www/`) | Descrição da Mudança |
| :--- | :--- | :--- | :--- |
| `js/app.js` | `C:\Gisa-app-main\js\app.js` | `www/js/app.js` | `updateProjectNavHeader`, reatividade do topo e paginação |
| `js/ui.js` | `C:\Gisa-app-main\js\ui.js` | `www/js/ui.js` | Pílulas de topo no card e redesign clean do Auto Resolver |
| `js/similarity.js` | `C:\Gisa-app-main\js\similarity.js` | `www/js/similarity.js` | Algoritmo assíncrono `findDuplicatesAsync` |
| `css/style.css` | `C:\Gisa-app-main\css\style.css` | `www/css/style.css` | Estilos de pílula `.article-card-top-actions` e layout sem cortes |
| `index.html` | `C:\Gisa-app-main\index.html` | `www/index.html` | Splash loader anti-tela preta durante boot |

---

## 📅 Sessão 1: 02 de Setembro de 2026
* Implementação do Design System Apple iOS 26 Liquid Glass.
* Ajustes de margens nas barras de rolagem para evitar vazamento nas bordas circulares.
* Correção da iluminação roxa cortada no card selecionado.
* Integração da IA Groq silenciosa em segundo plano.
