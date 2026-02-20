/**
 * Main orchestration: load data, init model, wire input → embed → project → search → render.
 */

import { init as initEmbedding, embed } from './embedding.js';
import { initProjection, projectTo2D } from './projection.js';
import { findTopK } from './similarity.js';
import { initScatter, updateQueryPoint, showConnections, clearConnections, resetScatter } from './scatter.js';
import {
  initPanel, setPipelineStep, renderResults,
  renderAugmentedPrompt, clearResults, renderHeatmaps,
} from './panel.js';
import { initGeneration } from './generation.js';

const DEBOUNCE_MS = 300;
const PAUSE_MS = 1000;
const TOP_K = 5;

let chunks, embeddings, pcaModel;
let debounceTimer = null;
let pauseTimer = null;
let lastQuery = '';

async function loadData() {
  const [chunksRes, embeddingsRes, pcaRes] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/chunks.json`).then(r => r.json()),
    fetch(`${import.meta.env.BASE_URL}data/embeddings.json`).then(r => r.json()),
    fetch(`${import.meta.env.BASE_URL}data/pca_model.json`).then(r => r.json()),
  ]);
  return { chunks: chunksRes, embeddings: embeddingsRes, pcaModel: pcaRes };
}

async function main() {
  const overlay = document.getElementById('loading-overlay');
  const statusEl = document.getElementById('loading-status');

  // Load preprocessed data
  statusEl.textContent = 'Loading document data...';
  const data = await loadData();
  chunks = data.chunks;
  embeddings = data.embeddings;
  pcaModel = data.pcaModel;

  // Init PCA projection
  initProjection(pcaModel);

  // Init scatter plot
  const scatterContainer = document.getElementById('scatter-plot');
  const { sourceColorMap } = initScatter(scatterContainer, embeddings, chunks);

  // Init panel & generation
  initPanel(chunks, sourceColorMap);
  initGeneration();
  clearResults();

  // Init embedding model (Web Worker)
  statusEl.textContent = 'Loading embedding model...';
  await initEmbedding((msg) => {
    statusEl.textContent = msg;
  });

  // Hide overlay
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 500);

  // Wire up query input
  const input = document.getElementById('query-input');
  const clearBtn = document.getElementById('clear-query-btn');
  input.addEventListener('input', () => {
    onQueryInput(input.value);
    clearBtn.classList.toggle('hidden', !input.value);
  });

  // Example chips
  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.textContent;
      onQueryInput(chip.textContent);
      clearBtn.classList.remove('hidden');
      // Simulate immediate pause (show connections right away)
      clearTimeout(pauseTimer);
      handlePause(chip.textContent);
    });
  });

  // Clear query button
  clearBtn.addEventListener('click', () => {
    input.value = '';
    lastQuery = '';
    clearBtn.classList.add('hidden');
    resetScatter();
    clearResults();
    document.getElementById('heatmap-section').classList.add('hidden');
    document.getElementById('heatmap-toggle').checked = false;
    input.focus();
  });

  // Heatmap toggle
  document.getElementById('heatmap-toggle').addEventListener('change', (e) => {
    const section = document.getElementById('heatmap-section');
    section.classList.toggle('hidden', !e.target.checked);
    // Re-render heatmaps with current state when toggling on
    if (e.target.checked && window._lastQueryState && window._lastTopK) {
      renderHeatmaps(window._lastQueryState.queryEmbedding, window._lastTopK, embeddings);
    }
  });

  // Escape to reset
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      lastQuery = '';
      clearBtn.classList.add('hidden');
      resetScatter();
      clearResults();
      document.getElementById('heatmap-section').classList.add('hidden');
      document.getElementById('heatmap-toggle').checked = false;
    }
  });

  input.focus();
}

function onQueryInput(text) {
  clearTimeout(debounceTimer);
  clearTimeout(pauseTimer);

  if (!text.trim()) {
    lastQuery = '';
    resetScatter();
    clearResults();
    return;
  }

  // On each keystroke within debounce: clear connections (just show drift)
  clearConnections();

  debounceTimer = setTimeout(() => processQuery(text), DEBOUNCE_MS);

  // After longer pause, show full connections
  pauseTimer = setTimeout(() => handlePause(text), PAUSE_MS);
}

async function processQuery(text) {
  if (text === lastQuery) return;
  lastQuery = text;

  // Pipeline: Query
  setPipelineStep('query');

  // Pipeline: Embed
  setPipelineStep('embed');
  const queryEmbedding = await embed(text);

  // Pipeline: Project
  setPipelineStep('project');
  const [qx, qy] = projectTo2D(queryEmbedding);

  // Update query point position (smooth drift)
  updateQueryPoint(qx, qy);

  // Store for pause handler
  window._lastQueryState = { queryEmbedding, qx, qy, text };
}

async function handlePause(text) {
  // Ensure latest query is processed first
  await processQuery(text);

  const state = window._lastQueryState;
  if (!state || state.text !== text) return;

  // Pipeline: Search
  setPipelineStep('search');
  const topK = findTopK(state.queryEmbedding, embeddings, TOP_K);
  window._lastTopK = topK;

  // Pipeline: Retrieve
  setPipelineStep('retrieve');
  showConnections(state.qx, state.qy, topK, embeddings);
  renderResults(topK);

  // Render comparative heatmaps if enabled
  if (document.getElementById('heatmap-toggle').checked) {
    renderHeatmaps(state.queryEmbedding, topK, embeddings);
  }

  // Pipeline: Augment
  setPipelineStep('augment');
  renderAugmentedPrompt(text, topK);
}

main().catch(console.error);
