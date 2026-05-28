/**
 * RAG Engine v2 — TF-IDF + BM25 Scoring
 * Vectoring 100% lokal (tanpa API call), sangat cepat
 */

const fs = require('fs');
const path = require('path');

// 200+ Stopwords Bahasa Indonesia
const STOPWORDS_ID = new Set([
    'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'atau', 'pada', 'adalah',
    'ini', 'itu', 'dalam', 'juga', 'karena', 'agar', 'sebagai', 'saat', 'oleh', 'akan',
    'bisa', 'dapat', 'sudah', 'belum', 'kami', 'kamu', 'anda', 'saya', 'aku', 'kita',
    'mereka', 'apa', 'siapa', 'kapan', 'dimana', 'bagaimana', 'kenapa', 'jika', 'kalau',
    'tidak', 'bukan', 'tak', 'tanpa', 'hanya', 'saja', 'pun', 'lah', 'kah', 'tah',
    'nya', 'punya', 'milik', 'ada', 'tiada', 'ialah', 'yakni', 'yaitu', 'bahwa',
    'tentang', 'seperti', 'antara', 'sebelum', 'sesudah', 'setelah', 'ketika', 'selama',
    'hingga', 'sampai', 'sejak', 'lalu', 'kemudian', 'maka', 'lagi', 'masih', 'tetap',
    'selalu', 'sering', 'pernah', 'sedang', 'telah', 'baru', 'lebih', 'kurang', 'sangat',
    'amat', 'sekali', 'begitu', 'demikian', 'agak', 'cukup', 'terlalu', 'paling',
    'semua', 'seluruh', 'setiap', 'masing', 'para', 'berbagai', 'beberapa', 'suatu',
    'satu', 'dua', 'tiga', 'empat', 'lima', 'banyak', 'sedikit', 'segala',
    'tersebut', 'hal', 'cara', 'pihak', 'bagian', 'bentuk', 'proses', 'jenis',
    'oleh', 'demi', 'guna', 'bagi', 'kepada', 'terhadap', 'atas', 'bawah',
    'melalui', 'lewat', 'via', 'antar', 'antara', 'beserta', 'serta', 'maupun',
    'melainkan', 'namun', 'tetapi', 'tapi', 'walaupun', 'meskipun', 'biarpun',
    'padahal', 'sedangkan', 'sementara', 'adapun', 'bahkan', 'justru', 'malah',
    'sebaliknya', 'lagipula', 'apalagi', 'ditambah', 'selain', 'kecuali',
    'misalnya', 'contohnya', 'yakni', 'yaitu', 'artinya', 'maksudnya',
    'secara', 'sendiri', 'sama', 'saling', 'mau', 'ingin', 'hendak', 'perlu', 'harus',
    'wajib', 'boleh', 'mampu', 'sanggup', 'sempat', 'berhasil', 'gagal',
    'mulai', 'selesai', 'akhir', 'awal', 'terus', 'kembali', 'ulang',
    'sini', 'situ', 'sana', 'mana', 'begini', 'begitu', 'berapa',
    'mengapa', 'bilamana', 'apakah', 'apabila', 'bila', 'manakala',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'if', 'or', 'while', 'this', 'that',
    'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them', 'we', 'you'
]);

class RAGEngine {
    constructor() {
        this.vectorsDir = path.join(__dirname, '..', 'data', 'vectors');
        this.index = null; // cached in-memory index
        this.documents = []; // cached documents
        this._ensureDir(this.vectorsDir);
    }

    _ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Tokenisasi teks: lowercase, hapus tanda baca, filter stopwords
     */
    tokenize(text) {
        if (!text) return [];
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(token => token.length > 1 && !STOPWORDS_ID.has(token));
    }

    /**
     * Smart chunking: paragraph-aware, adaptive size
     */
    splitIntoChunks(text, chunkSize = 600, overlap = 100) {
        if (!text) return [];
        const normalized = text.replace(/\r/g, '').trim();
        if (!normalized) return [];

        // Coba split per paragraf dulu
        const paragraphs = normalized.split(/\n\s*\n/);
        const chunks = [];
        let currentChunk = '';

        for (const para of paragraphs) {
            const trimmedPara = para.trim();
            if (!trimmedPara) continue;

            if ((currentChunk + '\n\n' + trimmedPara).length > chunkSize && currentChunk.length > 0) {
                if (currentChunk.length > 30) {
                    chunks.push(currentChunk.trim());
                }
                // Overlap: ambil bagian akhir chunk sebelumnya
                const overlapText = currentChunk.slice(-overlap);
                currentChunk = overlapText + '\n\n' + trimmedPara;
            } else {
                currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedPara : trimmedPara;
            }
        }

        if (currentChunk.trim().length > 30) {
            chunks.push(currentChunk.trim());
        }

        // Jika tidak ada paragraf terdeteksi, fallback ke fixed-size chunking
        if (chunks.length === 0 && normalized.length > 30) {
            let start = 0;
            while (start < normalized.length) {
                let end = Math.min(start + chunkSize, normalized.length);
                if (end < normalized.length) {
                    const lastBreak = normalized.lastIndexOf('\n', end);
                    if (lastBreak > start + 100) end = lastBreak;
                }
                const chunk = normalized.slice(start, end).trim();
                if (chunk.length > 30) chunks.push(chunk);
                if (end >= normalized.length) break;
                start = Math.max(end - overlap, start + 1);
            }
        }

        return chunks;
    }

    /**
     * Bangun TF map dari array token
     */
    buildTfMap(tokens) {
        const tf = new Map();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) || 0) + 1);
        }
        return tf;
    }

    /**
     * Bangun index TF-IDF dari dokumen
     */
    buildIndex(documents) {
        if (!documents || documents.length === 0) {
            this.index = { idf: {}, vectors: [] };
            this.documents = [];
            return this.index;
        }

        this.documents = documents;
        const tokenizedDocs = documents.map(doc => this.tokenize(doc.text));
        
        // Hitung Document Frequency
        const docFreq = {};
        tokenizedDocs.forEach(tokens => {
            const uniqueTokens = new Set(tokens);
            uniqueTokens.forEach(token => {
                docFreq[token] = (docFreq[token] || 0) + 1;
            });
        });

        // Hitung IDF
        const totalDocs = Math.max(documents.length, 1);
        const idf = {};
        for (const [token, freq] of Object.entries(docFreq)) {
            idf[token] = Math.log((totalDocs - freq + 0.5) / (freq + 0.5) + 1);
        }

        // Hitung average document length untuk BM25
        const avgDocLen = tokenizedDocs.reduce((sum, tokens) => sum + tokens.length, 0) / totalDocs;

        // Bangun vector untuk setiap dokumen
        const vectors = tokenizedDocs.map((tokens, idx) => {
            const tf = this.buildTfMap(tokens);
            const vector = {};
            
            tf.forEach((count, token) => {
                const idfVal = idf[token] || 0;
                // BM25 scoring: k1=1.5, b=0.75
                const k1 = 1.5;
                const b = 0.75;
                const tfNorm = (count * (k1 + 1)) / (count + k1 * (1 - b + b * (tokens.length / avgDocLen)));
                vector[token] = tfNorm * idfVal;
            });

            return {
                source: documents[idx].source,
                text: documents[idx].text,
                filename: documents[idx].filename || '',
                page: documents[idx].page || 0,
                vector,
                docLen: tokens.length
            };
        });

        this.index = { idf, vectors, avgDocLen };
        return this.index;
    }

    /**
     * Simpan index ke disk (JSON)
     */
    saveIndex() {
        try {
            const indexPath = path.join(this.vectorsDir, 'index.json');
            // Simpan index tanpa vector maps (terlalu besar), simpan metadata saja
            const saveData = {
                idf: this.index.idf,
                avgDocLen: this.index.avgDocLen,
                vectorCount: this.index.vectors.length,
                savedAt: new Date().toISOString()
            };
            fs.writeFileSync(indexPath, JSON.stringify(saveData, null, 2));
            console.log(`Index tersimpan: ${this.index.vectors.length} vectors`);
            return true;
        } catch (error) {
            console.error('Error menyimpan index:', error.message);
            return false;
        }
    }

    /**
     * Cari top-K dokumen yang paling relevan dengan query
     */
    retrieveContext(query, documents, topK = 5) {
        // Rebuild index jika dokumen berubah
        if (!this.index || !this.index.vectors || this.index.vectors.length === 0) {
            if (!documents || documents.length === 0) return [];
            this.buildIndex(documents);
        }

        const queryTokens = this.tokenize(query);
        if (!queryTokens.length) return [];

        const idf = this.index.idf;
        const avgDocLen = this.index.avgDocLen || 1;

        // Hitung BM25 score untuk setiap dokumen
        const scored = this.index.vectors.map(item => {
            let score = 0;
            const k1 = 1.5;
            const b = 0.75;

            for (const token of queryTokens) {
                const idfVal = idf[token] || 0;
                const docWeight = item.vector[token] || 0;
                score += docWeight; // sudah BM25-weighted
            }

            return {
                source: item.source,
                text: item.text,
                filename: item.filename || '',
                page: item.page || 0,
                score
            };
        });

        // Filter dan sort
        return scored
            .filter(item => item.score > 0.1)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    /**
     * Bangun blok konteks untuk prompt AI
     */
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

    /**
     * Reset index
     */
    clearIndex() {
        this.index = null;
        this.documents = [];
    }

    /**
     * Statistik index
     */
    getStats() {
        return {
            totalVectors: this.index ? this.index.vectors.length : 0,
            totalTerms: this.index ? Object.keys(this.index.idf).length : 0,
            isLoaded: !!this.index
        };
    }
}

module.exports = RAGEngine;
