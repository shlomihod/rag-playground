"""
Preprocessing pipeline for RAG Visualization Demo.
Chunks documents, embeds with all-MiniLM-L6-v2, fits PCA, exports JSON.
"""

import json
import os
import re
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from sklearn.decomposition import PCA

DOCS_DIR = Path(__file__).parent / "docs"
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100
PCA_COMPONENTS = 2


def load_documents():
    """Load all markdown/text files from docs directory."""
    docs = []
    for path in sorted(DOCS_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        docs.append({"source": path.stem, "text": text})
    for path in sorted(DOCS_DIR.glob("*.txt")):
        text = path.read_text(encoding="utf-8")
        docs.append({"source": path.stem, "text": text})
    print(f"Loaded {len(docs)} documents")
    return docs


def get_category(source):
    """Classify document source into a display category."""
    if source.startswith("olympics_") or source.startswith("winter_olympics_"):
        return "olympics"
    return "nfl"


def chunk_documents(docs):
    """Split documents into chunks using RecursiveCharacterTextSplitter."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
        keep_separator="end",
    )

    chunks = []
    chunk_id = 0
    for doc in docs:
        # Collapse newlines to spaces to merge headings into paragraphs
        text = re.sub(r'\n+', ' ', doc["text"])
        text = re.sub(r' +', ' ', text).strip()
        splits = splitter.split_text(text)
        for text in splits:
            chunks.append({
                "id": chunk_id,
                "text": text.strip(),
                "source": doc["source"],
                "category": get_category(doc["source"]),
            })
            chunk_id += 1

    print(f"Created {len(chunks)} chunks from {len(docs)} documents")
    return chunks


def embed_chunks(chunks, model):
    """Embed all chunks using the sentence transformer model."""
    texts = [c["text"] for c in chunks]
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    print(f"Embedded {len(chunks)} chunks → shape {embeddings.shape}")
    return embeddings


def fit_pca(embeddings):
    """Fit PCA to reduce embeddings to 2D, return model params and projected coords."""
    pca = PCA(n_components=PCA_COMPONENTS)
    coords_2d = pca.fit_transform(embeddings)
    print(f"PCA explained variance: {pca.explained_variance_ratio_.sum():.2%}")
    return pca, coords_2d


def export_json(chunks, embeddings, coords_2d, pca):
    """Export all data as JSON files for the frontend."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # chunks.json
    chunks_out = [{"id": c["id"], "text": c["text"], "source": c["source"], "category": c["category"]} for c in chunks]
    with open(OUTPUT_DIR / "chunks.json", "w") as f:
        json.dump(chunks_out, f, indent=2)

    # embeddings.json — full 384d embeddings + 2D coords
    embeddings_out = []
    for i, chunk in enumerate(chunks):
        embeddings_out.append({
            "id": chunk["id"],
            "embedding": embeddings[i].tolist(),
            "x": float(coords_2d[i, 0]),
            "y": float(coords_2d[i, 1]),
        })
    with open(OUTPUT_DIR / "embeddings.json", "w") as f:
        json.dump(embeddings_out, f)

    # pca_model.json — mean vector + principal components
    pca_model = {
        "mean": pca.mean_.tolist(),
        "components": pca.components_.tolist(),
    }
    with open(OUTPUT_DIR / "pca_model.json", "w") as f:
        json.dump(pca_model, f)

    print(f"Exported JSON to {OUTPUT_DIR}")


def plot_validation(chunks, coords_2d):
    """Quick matplotlib scatter plot for validation."""
    sources = list({c["source"] for c in chunks})
    color_map = {s: i for i, s in enumerate(sources)}
    colors = [color_map[c["source"]] for c in chunks]

    fig, ax = plt.subplots(figsize=(10, 8))
    scatter = ax.scatter(
        coords_2d[:, 0], coords_2d[:, 1],
        c=colors, cmap="tab10", alpha=0.7, s=60, edgecolors="white", linewidths=0.5,
    )

    # Add legend
    handles = [
        plt.Line2D([0], [0], marker="o", color="w",
                    markerfacecolor=plt.cm.tab10(color_map[s] / max(len(sources) - 1, 1)),
                    markersize=8, label=s.replace("_", " "))
        for s in sources
    ]
    ax.legend(handles=handles, loc="upper right", fontsize=8)

    # Annotate a few points
    for i in range(0, len(chunks), max(1, len(chunks) // 15)):
        ax.annotate(
            chunks[i]["text"][:30] + "...",
            (coords_2d[i, 0], coords_2d[i, 1]),
            fontsize=5, alpha=0.6,
        )

    ax.set_title("Document Chunks in PCA Space (2D)", fontsize=14)
    ax.set_xlabel("PC1")
    ax.set_ylabel("PC2")
    ax.set_facecolor("#0a0a1a")
    fig.patch.set_facecolor("#0a0a1a")
    ax.tick_params(colors="white")
    ax.xaxis.label.set_color("white")
    ax.yaxis.label.set_color("white")
    ax.title.set_color("white")
    for spine in ax.spines.values():
        spine.set_color("white")

    plot_path = Path(__file__).parent / "validation_plot.png"
    fig.savefig(plot_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    print(f"Saved validation plot to {plot_path}")
    plt.close()


def main():
    print("=" * 60)
    print("RAG Visualization Demo — Preprocessing Pipeline")
    print("=" * 60)

    docs = load_documents()
    chunks = chunk_documents(docs)

    print(f"\nLoading model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)

    embeddings = embed_chunks(chunks, model)
    pca, coords_2d = fit_pca(embeddings)
    export_json(chunks, embeddings, coords_2d, pca)
    plot_validation(chunks, coords_2d)

    print("\nDone! Next: cd ../frontend && npm run dev")


if __name__ == "__main__":
    main()
