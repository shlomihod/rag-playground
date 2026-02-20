/**
 * OpenRouter LLM generation with streaming support.
 * Fully client-side — API key stored in localStorage, sent only to OpenRouter.
 */

const STORAGE_KEY = 'openrouter_api_key';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const activeControllers = new Set();

export function initGeneration() {
  const keyInput = document.getElementById('api-key-input');
  const modelInput = document.getElementById('model-input');
  const generateBtn = document.getElementById('generate-btn');
  const clearBtn = document.getElementById('clear-key-btn');
  const hint = document.getElementById('generation-hint');

  // Load saved key
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    keyInput.value = saved;
    generateBtn.disabled = false;
    hint.classList.add('hidden');
    clearBtn.classList.remove('hidden');
  }

  // Key input changes
  keyInput.addEventListener('input', () => {
    const key = keyInput.value.trim();
    if (key) {
      saveKey(key);
      generateBtn.disabled = false;
      hint.classList.add('hidden');
      clearBtn.classList.remove('hidden');
    } else {
      clearKey();
      generateBtn.disabled = true;
      hint.classList.remove('hidden');
      clearBtn.classList.add('hidden');
    }
  });

  // Clear key button
  clearBtn.addEventListener('click', () => {
    keyInput.value = '';
    clearKey();
    generateBtn.disabled = true;
    hint.classList.remove('hidden');
    clearBtn.classList.add('hidden');
  });

  // Persist model choice
  const savedModel = localStorage.getItem('openrouter_model');
  if (savedModel) modelInput.value = savedModel;
  modelInput.addEventListener('change', () => {
    localStorage.setItem('openrouter_model', modelInput.value.trim());
  });
}

function saveKey(key) {
  localStorage.setItem(STORAGE_KEY, key);
}

function clearKey() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Stream a chat completion from OpenRouter.
 * @param {Array} messages - OpenAI-format messages array
 * @param {function} onToken - Called with each text chunk
 * @param {function} onDone - Called when stream ends
 * @param {function} onError - Called on error
 */
export async function generate(messages, { onToken, onDone, onError }) {
  const apiKey = localStorage.getItem(STORAGE_KEY);
  if (!apiKey) {
    onError?.(new Error('No API key set'));
    return;
  }

  const model = document.getElementById('model-input')?.value.trim() || 'openai/gpt-4o-mini';

  const controller = new AbortController();
  activeControllers.add(controller);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${body}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onDone?.();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onToken(content);
        } catch {
          // skip malformed JSON lines
        }
      }
    }

    onDone?.();
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone?.();
    } else {
      onError?.(err);
    }
  } finally {
    activeControllers.delete(controller);
  }
}

export function abort() {
  for (const c of activeControllers) c.abort();
  activeControllers.clear();
}
