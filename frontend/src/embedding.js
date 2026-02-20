/**
 * Main-thread wrapper for the embedding Web Worker.
 * Provides init() and embed(text) with Promise-based API.
 */

let worker;
let requestCounter = 0;
const pending = new Map();
let onStatus = null;

export function init(statusCallback) {
  onStatus = statusCallback;

  return new Promise((resolve, reject) => {
    worker = new Worker(new URL('./embedding.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e) => {
      const { type, embedding, requestId, message } = e.data;

      if (type === 'ready') {
        resolve();
      } else if (type === 'status') {
        if (onStatus) onStatus(message);
      } else if (type === 'embedding') {
        const cb = pending.get(requestId);
        if (cb) {
          cb.resolve(embedding);
          pending.delete(requestId);
        }
      } else if (type === 'error') {
        const cb = pending.get(requestId);
        if (cb) {
          cb.reject(new Error(message));
          pending.delete(requestId);
        }
      }
    };

    worker.onerror = (err) => {
      reject(err);
    };

    worker.postMessage({ type: 'init' });
  });
}

export function embed(text) {
  const requestId = ++requestCounter;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    worker.postMessage({ type: 'embed', text, requestId });
  });
}
