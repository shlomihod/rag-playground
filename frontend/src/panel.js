/**
 * Results panel: pipeline strip, retrieved chunks, augmented prompt, heatmaps, generation.
 */

import { highlightPoint } from './scatter.js';
import { generate, abort } from './generation.js';

const PIPELINE_STEPS = ['query', 'embed', 'project', 'search', 'retrieve', 'augment'];

let chunks = [];
let sourceColorMap = {};
let isGenerating = false;
let currentQuery = '';

export function initPanel(allChunks, colorMap) {
  chunks = allChunks;
  sourceColorMap = colorMap;

  // Augmented prompt toggle
  const toggle = document.getElementById('augmented-toggle');
  const prompt = document.getElementById('augmented-prompt');
  toggle.addEventListener('click', () => {
    const hidden = prompt.classList.toggle('hidden');
    toggle.textContent = hidden ? 'Augmented Prompt \u25b8' : 'Augmented Prompt \u25be';
  });

  // Wire generation button
  const generateBtn = document.getElementById('generate-btn');
  generateBtn.addEventListener('click', () => {
    if (isGenerating) {
      abort();
      setGeneratingState(false);
    } else {
      startGeneration();
    }
  });
}

/**
 * Light up pipeline steps progressively.
 */
export function setPipelineStep(activeStep) {
  const stepIdx = PIPELINE_STEPS.indexOf(activeStep);
  document.querySelectorAll('.pipeline-step').forEach(el => {
    const idx = PIPELINE_STEPS.indexOf(el.dataset.step);
    el.classList.remove('active', 'done');
    if (idx < stepIdx) el.classList.add('done');
    else if (idx === stepIdx) el.classList.add('active');
  });
}

export function resetPipeline() {
  document.querySelectorAll('.pipeline-step').forEach(el => {
    el.classList.remove('active', 'done');
  });
}

/**
 * Render retrieved chunk results.
 */
export function renderResults(topK) {
  const list = document.getElementById('results-list');
  const count = document.getElementById('results-count');

  if (!topK || topK.length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim); font-size: 0.85rem;">Type a query to search...</p>';
    count.textContent = '';
    return;
  }

  count.textContent = `(top ${topK.length})`;

  const chunkMap = new Map(chunks.map(c => [c.id, c]));

  list.innerHTML = topK.map((result, i) => {
    const chunk = chunkMap.get(result.id);
    const color = sourceColorMap[chunk?.source] || '#666';
    return `
      <div class="result-card" data-id="${result.id}">
        <div class="result-header">
          <span>
            <span class="result-rank">#${i + 1}</span>
            <span class="result-source" style="border-left: 3px solid ${color}; margin-left: 0.4rem;">
              ${chunk?.source.replace(/_/g, ' ')}
            </span>
          </span>
          <span class="result-score">${result.score.toFixed(4)}</span>
        </div>
        <div class="result-text">${escapeHtml(chunk?.text || '')}</div>
      </div>
    `;
  }).join('');

  // Hover interaction: highlight corresponding point on scatter
  list.querySelectorAll('.result-card').forEach(card => {
    const id = parseInt(card.dataset.id, 10);
    card.addEventListener('mouseenter', () => {
      card.classList.add('highlight');
      highlightPoint(id, true);
    });
    card.addEventListener('mouseleave', () => {
      card.classList.remove('highlight');
      highlightPoint(id, false);
    });
  });
}

/**
 * Show the augmented prompt and generation bar.
 */
export function renderAugmentedPrompt(query, topK) {
  const section = document.getElementById('augmented-section');
  const promptEl = document.getElementById('augmented-prompt');
  const genBar = document.getElementById('generation-bar');
  const genOutputs = document.getElementById('generation-outputs');

  if (!query || !topK || topK.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  genBar.classList.remove('hidden');

  // Cancel any in-flight generation and clear previous output
  abort();
  genOutputs.classList.add('hidden');
  document.getElementById('gen-no-rag').textContent = '';
  document.getElementById('gen-with-rag').textContent = '';
  setGeneratingState(false);

  currentQuery = query;

  const chunkMap = new Map(chunks.map(c => [c.id, c]));
  const context = topK.map((r, i) => {
    const chunk = chunkMap.get(r.id);
    return `[${i + 1}] (score: ${r.score.toFixed(3)}) ${chunk?.text}`;
  }).join('\n\n');

  promptEl.textContent =
`System: Answer the question based on the provided context. If the context doesn't contain relevant information, say so.

Context:
${context}

Question: ${query}

Answer:`;
}

/**
 * Clear results panel.
 */
export function clearResults() {
  document.getElementById('results-list').innerHTML =
    '<p style="color: var(--text-dim); font-size: 0.85rem;">Type a query to search...</p>';
  document.getElementById('results-count').textContent = '';
  document.getElementById('augmented-section').classList.add('hidden');
  document.getElementById('heatmap-list').innerHTML = '';
  resetPipeline();
}

/**
 * Render comparative embedding heatmaps: query + top-k chunks.
 * Uses shared min/max across all vectors for consistent color normalization.
 */
export function renderHeatmaps(queryEmbedding, topK, embeddings) {
  const container = document.getElementById('heatmap-list');
  container.innerHTML = '';

  const chunkMap = new Map(chunks.map(c => [c.id, c]));

  // Collect all vectors for shared normalization
  const vectors = [
    { label: 'Query', embedding: queryEmbedding, score: null, isQuery: true },
    ...topK.map((result, i) => {
      const chunk = chunkMap.get(result.id);
      const source = chunk?.source.replace(/_/g, ' ') || `chunk ${result.id}`;
      return {
        label: `#${i + 1} ${source}`,
        embedding: result.embedding,
        score: result.score,
        isQuery: false,
      };
    }),
  ];

  // Find shared min/max across all vectors
  let globalMin = Infinity, globalMax = -Infinity;
  for (const v of vectors) {
    for (const val of v.embedding) {
      if (val < globalMin) globalMin = val;
      if (val > globalMax) globalMax = val;
    }
  }
  const range = globalMax - globalMin || 1;

  for (const vec of vectors) {
    const row = document.createElement('div');
    row.className = 'heatmap-row';

    const label = document.createElement('span');
    label.className = 'heatmap-label';
    if (vec.isQuery) label.classList.add('heatmap-label-query');
    label.textContent = vec.label;
    label.title = vec.label;

    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 16;
    canvas.className = 'heatmap-canvas';
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < vec.embedding.length; i++) {
      const norm = (vec.embedding[i] - globalMin) / range;
      const r = Math.round(norm * 255);
      const g = Math.round(norm * 215);
      const b = Math.round((1 - norm) * 200);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(i, 0, 1, 16);
    }

    const score = document.createElement('span');
    score.className = 'heatmap-score';
    score.textContent = vec.score !== null ? vec.score.toFixed(3) : '';

    row.appendChild(label);
    row.appendChild(canvas);
    row.appendChild(score);
    container.appendChild(row);
  }
}

/**
 * Fire two parallel generations: one without context, one with RAG context.
 */
function startGeneration() {
  const promptEl = document.getElementById('augmented-prompt');
  const ragEl = document.getElementById('gen-with-rag');
  const noRagEl = document.getElementById('gen-no-rag');
  const outputsEl = document.getElementById('generation-outputs');
  const promptText = promptEl.textContent;

  if (!promptText || !currentQuery) return;

  ragEl.textContent = '';
  noRagEl.textContent = '';
  outputsEl.classList.remove('hidden');
  setGeneratingState(true);

  let doneCount = 0;
  const onOneDone = () => { if (++doneCount >= 2) setGeneratingState(false); };

  // With RAG context — the full augmented prompt (fires first)
  generate(
    [{ role: 'user', content: promptText.trim() }],
    {
      onToken(token) { ragEl.textContent += token; ragEl.scrollTop = ragEl.scrollHeight; },
      onDone: onOneDone,
      onError(err) { ragEl.textContent += `\n\nError: ${err.message}`; onOneDone(); },
    },
  );

  // Without context — just the raw question
  generate(
    [{ role: 'user', content: currentQuery }],
    {
      onToken(token) { noRagEl.textContent += token; noRagEl.scrollTop = noRagEl.scrollHeight; },
      onDone: onOneDone,
      onError(err) { noRagEl.textContent += `\n\nError: ${err.message}`; onOneDone(); },
    },
  );
}

function setGeneratingState(generating) {
  isGenerating = generating;
  const btn = document.getElementById('generate-btn');
  const apiKey = localStorage.getItem('openrouter_api_key');

  if (generating) {
    btn.textContent = 'Stop';
    btn.disabled = false;
    btn.classList.add('generating');
  } else {
    btn.textContent = 'Generate';
    btn.disabled = !apiKey;
    btn.classList.remove('generating');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
