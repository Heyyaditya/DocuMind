
from flask import Flask, render_template, request, jsonify
from sentence_transformers import SentenceTransformer
from werkzeug.utils import secure_filename

from pypdf import PdfReader
from docx import Document

import faiss
import numpy as np

app = Flask(__name__)

# Initialize embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

# Document storage
documents = []
index = None

# Supported file formats
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt"}


# Check file extension
def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


# Extract text from uploaded documents
def extract_text(file):

    filename = file.filename.lower()

    if filename.endswith(".pdf"):

        reader = PdfReader(file)

        text = "\n".join(
            page.extract_text() or ""
            for page in reader.pages
        )

    elif filename.endswith(".docx"):

        doc = Document(file)

        text = "\n".join(
            paragraph.text
            for paragraph in doc.paragraphs
        )

    elif filename.endswith(".txt"):

        text = file.read().decode("utf-8", errors="replace")

    else:
        return None

    return text


import re

def split_text(text, chunk_size=1000, overlap=200):

    # Split text into sentences
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    chunks = []
    current_chunk = ""

    for sentence in sentences:

        # Handle exceptionally long sentences without cutting words
        if len(sentence) > chunk_size:
            words = sentence.split()

            for word in words:
                if len(current_chunk) + len(word) + 1 <= chunk_size:
                    current_chunk += " " + word if current_chunk else word
                else:
                    if current_chunk:
                        chunks.append(current_chunk.strip())

                    current_chunk = word

            continue

        if len(current_chunk) + len(sentence) + 1 <= chunk_size:

            current_chunk += " " + sentence if current_chunk else sentence

        else:

            if current_chunk:
                chunks.append(current_chunk.strip())

            # Preserve some context from the previous chunk
            overlap_text = current_chunk[-overlap:] if current_chunk else ""

            # Start overlap at a word boundary
            overlap_text = overlap_text.lstrip()

            if " " in overlap_text:
                overlap_text = overlap_text.split(" ", 1)[1]

            current_chunk = (
                overlap_text + " " + sentence
                if overlap_text else sentence
            )

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks

# Build FAISS index
def build_index():

    global index

    if not documents:
        index = None
        return

    # Convert documents into embeddings
    texts = [doc["text"] for doc in documents]

    embeddings = model.encode(
        texts,
        convert_to_numpy=True
    ).astype("float32")

    # Create FAISS index
    index = faiss.IndexFlatL2(embeddings.shape[1])

    index.add(
        np.array(embeddings, dtype="float32")
    )


# Home page
@app.route("/")
def home():

    return render_template("index.html")


# Upload documents
@app.route("/upload", methods=["POST"])
def upload_files():

    global documents

    files = request.files.getlist("files")

    if not files or all(not file.filename for file in files):

        return jsonify({
            "error": "Please select files first."
        }), 400

    new_documents = []

    for file in files:

        if not file.filename:
            continue

        if not allowed_file(file.filename):

            return jsonify({
                "error": f"Unsupported file format: {file.filename}"
            }), 400

        filename = secure_filename(file.filename)

        try:

            text = extract_text(file)

            if not text or not text.strip():
                continue

            # Split extracted text
            chunks = split_text(text)

            for chunk in chunks:

                new_documents.append({
                    "text": chunk,
                    "source": filename
                })

        except Exception as e:

            return jsonify({
                "error": f"Could not process {filename}: {str(e)}"
            }), 400

    if not new_documents:

        return jsonify({
            "error": "No readable text found in uploaded files."
        }), 400

    # Store document chunks
    documents.extend(new_documents)

    # Extract text for embedding
    texts = [
        doc["text"]
        for doc in documents
    ]

    # Generate embeddings and build index
    build_index()

    return jsonify({
        "message": "Documents uploaded successfully!",
        "files_uploaded": len(files),
        "chunks_created": len(new_documents)
    })

def format_document_text(text):

    lines = text.splitlines()
    formatted = []

    for line in lines:

        line = line.strip()

        if not line:
            continue

        # Remove unnecessary spaces
        line = re.sub(r'\s+', ' ', line)

        # Main numbered headings: 1. Introduction
        if re.match(r'^\d+\.\s+[A-Z]', line):
            formatted.append({
                "type": "heading",
                "text": line
            })

        # Lettered headings: A. Methods
        elif re.match(r'^[A-Z]\.\s+', line):
            formatted.append({
                "type": "heading",
                "text": line
            })

        # Subheadings: 2.1 Capping
        elif re.match(r'^\d+\.\d+\s+', line):
            formatted.append({
                "type": "subheading",
                "text": line
            })

        # Bullet points
        elif re.match(r'^[•●▪\-]\s*', line):
            formatted.append({
                "type": "bullet",
                "text": re.sub(r'^[•●▪\-]\s*', '', line)
            })

        # Numbered procedures: 1. A suitable site...
        elif re.match(r'^\d+\.\s+', line):
            formatted.append({
                "type": "number",
                "text": line
            })

        # Normal paragraphs
        else:
            formatted.append({
                "type": "paragraph",
                "text": line
            })

    return formatted


# Search relevant documents
@app.route("/search", methods=["POST"])
def search_documents():

    if index is None:

        return jsonify({
            "error": "Please upload documents first."
        }), 400

    data = request.get_json(silent=True) or {}

    query = data.get("question", "").strip()

    if not query:

        return jsonify({
            "error": "Please enter a question."
        }), 400

    # Convert question into embedding
    query_embedding = model.encode([query])

    # Search top 3 relevant documents
    k = min(3, index.ntotal)

    distances, indices = index.search(
        np.array(query_embedding, dtype="float32"),
        k
    )

    retrieved_docs = []

    for idx in indices[0]:

        if idx == -1:
            continue

        retrieved_docs.append({
            "text": documents[idx]["text"],
            "source": documents[idx]["source"]
        })

    return jsonify({
        "question": query,
        "retrieved_documents": retrieved_docs
    })


if __name__ == "__main__":

    app.run(debug=True)
