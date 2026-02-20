/**
 * Web Worker for running embedding model inference off the main thread.
 * Uses @huggingface/transformers v3 (Xenova/all-MiniLM-L6-v2).
 */

import { pipeline } from '@huggingface/transformers';

let embedder = null;

async function init() {
  postMessage({ type: 'status', message: 'Loading embedding model...' });

  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'fp32',
    progress_callback: (progress) => {
      if (progress.status === 'progress') {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        postMessage({ type: 'status', message: `Downloading model... ${pct}%` });
      }
    },
  });

  postMessage({ type: 'ready' });
}

async function embed(text, requestId) {
  if (!embedder) {
    postMessage({ type: 'error', message: 'Model not loaded yet', requestId });
    return;
  }

  const output = await embedder(text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data);

  postMessage({ type: 'embedding', embedding, requestId });
}

onmessage = async (e) => {
  const { type, text, requestId } = e.data;
  if (type === 'init') {
    await init();
  } else if (type === 'embed') {
    await embed(text, requestId);
  }
};
