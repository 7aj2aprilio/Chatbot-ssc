/**
 * RAG Engine v3 — Dense Vector Embeddings with Cosine Similarity
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Utility: Cosine Similarity
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

class RAGEngine {
    constructor() {
        this.vectorsDir = path.join(__dirname, '..', 'data', 'vectors');
        this.index = { vectors: [] }; // array of { source, text, filename, page, vector }
        this.documents = [];
        this._ensureDir(this.vectorsDir);
        this.loadIndex();
    }

    _ensureDir(dir) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    // Hash sederhana untuk menghindari embedding teks yang sama persis
    _hashText(text) {
        return crypto.createHash('md5').update(text).digest('hex');
    }

    /**
     * Bangun index embeddings dari dokumen secara asinkron
     */
    async buildIndex(documents, geminiClient) {
        if (!documents || documents.length === 0) {
            this.index = { vectors: [] };
            this.documents = [];
            return this.index;
        }
        this.documents = documents;
        const cache = new Map();
        if (this.index && this.index.vectors) {
            for (const item of this.index.vectors) {
                if (item.text && item.vector) {
                    cache.set(this._hashText(item.text), item.vector);
                }
            }
        }
        const newVectors = [];
        console.log(`Mulai proses embedding untuk ${documents.length} dokumen...`);

        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const textHash = this._hashText(doc.text);

            let vector = cache.get(textHash);

            if (!vector) {
                try {
                    vector = await geminiClient.generateEmbedding(doc.text);
                    if (vector) {
                        await new Promise(r => setTimeout(r, 500));
                    }
                } catch (err) {
                    console.error(`Gagal meng-embed dokumen ke-${i + 1}`, err.message);
                }
            }

            if (vector) {
                newVectors.push({
                    source: doc.source,
                    text: doc.text,
                    filename: doc.filename || '',
                    page: doc.page || 0,
                    vector: vector
                });
            }

            if ((i + 1) % 10 === 0 || (i + 1) === documents.length) {
                console.log(`Embedding progress: ${i + 1}/${documents.length}`);
            }
        }

        this.index.vectors = newVectors;
        console.log(`Selesai embedding. Berhasil memproses ${newVectors.length}/${documents.length} dokumen.`);
        return this.index;
    }

    loadIndex() {
        try {
            const indexPath = path.join(this.vectorsDir, 'embeddings.json');
            if (fs.existsSync(indexPath)) {
                const data = fs.readFileSync(indexPath, 'utf8');
                this.index = JSON.parse(data);
                console.log(`Index embeddings termuat: ${this.index.vectors.length} vectors`);
            }
        } catch (error) {
            console.error('Error memuat index embeddings:', error.message);
        }
    }

    saveIndex() {
        try {
            const indexPath = path.join(this.vectorsDir, 'embeddings.json');
            fs.writeFileSync(indexPath, JSON.stringify(this.index, null, 2));
            console.log(`Index embeddings tersimpan: ${this.index.vectors.length} vectors`);
            return true;
        } catch (error) {
            console.error('Error menyimpan index embeddings:', error.message);
            return false;
        }
    }

    async retrieveContext(query, documents, topK = 5, geminiClient) {
        if (!query || !query.trim()) return [];

        // Cek jika index kosong
        if (!this.index || !this.index.vectors || this.index.vectors.length === 0) {
            console.log('Index kosong, mencoba memuat dari disk atau rebuild...');
            if (documents && documents.length > 0 && geminiClient) {
                await this.buildIndex(documents, geminiClient);
                this.saveIndex();
            } else {
                return [];
            }
        }

        // Dapatkan vektor dari pertanyaan pengguna
        const queryVector = await geminiClient.generateEmbedding(query);
        if (!queryVector) {
            console.error('Gagal mendapatkan vektor untuk query');
            return [];
        }

        // Kalkulasi cosine similarity untuk semua vektor di index
        const scored = this.index.vectors.map(item => {
            const score = cosineSimilarity(queryVector, item.vector);
            return {
                source: item.source,
                text: item.text,
                filename: item.filename || '',
                page: item.page || 0,
                score
            };
        });

        // Sortir dari tertinggi, filter berdasarkan minimum score, dan ambil top K
        const MIN_SCORE = parseFloat(process.env.RAG_MIN_SCORE || 0.55);

        const filtered = scored
            .sort((a, b) => b.score - a.score)
            .filter(item => item.score >= MIN_SCORE)
            .slice(0, topK);

        console.log(`RAG Retrieval: ${filtered.length}/${scored.length} dokumen lolos threshold (min: ${MIN_SCORE})`);

        return filtered;
    }

    buildContextBlock(contextItems) {
        if (!contextItems || !contextItems.length) return '';
        return contextItems
            .map((item, idx) => {
                const cleanText = item.text.replace(/\s+/g, ' ').trim();
                const sourceInfo = item.filename ? `${item.filename} (hal. ${item.page || '?'})` : item.source;
                return `[Konteks ${idx + 1}] Sumber: ${sourceInfo}\n${cleanText}`;
            })
            .join('\n\n');
    }

    clearIndex() {
        this.index = { vectors: [] };
        this.documents = [];
    }

    getStats() {
        return {
            totalVectors: this.index ? this.index.vectors.length : 0,
            isLoaded: !!(this.index && this.index.vectors.length > 0)
        };
    }
}

module.exports = RAGEngine;
