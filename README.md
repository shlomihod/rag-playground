# RAG Playground

An interactive visualization of how Retrieval-Augmented Generation (RAG) works. Type a query and watch in real-time as it gets embedded, compared against a knowledge base, and matched to the most relevant chunks — all running locally in the browser.

**[Live Demo](https://shlomihod.github.io/rag-playground/)**

## How It Works

1. A knowledge base of documents is pre-chunked and embedded using [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
2. Chunks are projected to 2D via PCA and displayed as a scatter plot
3. When you type a query, it's embedded in-browser using the same model (via [Transformers.js](https://huggingface.co/docs/transformers.js))
4. Cosine similarity finds the top-k most relevant chunks
5. The scatter plot highlights retrieved chunks, showing how semantic search navigates embedding space

The knowledge base includes articles on **Game of Thrones houses** and **human body systems** — two distinct topics that form visible clusters in the embedding space.

## Tech Stack

- **Frontend:** Vanilla JS + [D3.js](https://d3js.org/) for visualization + [Vite](https://vitejs.dev/)
- **In-browser embeddings:** [@huggingface/transformers](https://huggingface.co/docs/transformers.js) (all-MiniLM-L6-v2, quantized)
- **Preprocessing:** Python + [sentence-transformers](https://www.sbert.net/) + scikit-learn PCA

## Local Development

### Prerequisites

- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (for preprocessing only)

### Run the frontend

```bash
cd frontend
npm install
npm run dev
```

### Re-run preprocessing (optional)

```bash
cd preprocessing
uv run python preprocess.py
```

This regenerates `frontend/public/data/` (chunks, embeddings, PCA model).

## License

Knowledge base content is summarized from Wikipedia (CC BY-SA 3.0).
