require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const GeminiClient = require('./lib/gemini');
const RAGEngine = require('./lib/rag');
const DatasetManager = require('./lib/dataset');

// ─── Inisialisasi ───────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;

const gemini = new GeminiClient();
const ragEngine = new RAGEngine();
const datasetManager = new DatasetManager();

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'ssc-telkom-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 jam
    }
}));

// Multer untuk upload PDF
const uploadsDir = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
    dest: path.join(__dirname, 'data', 'temp'),
    limits: { fileSize: 50 * 1024 * 1024 }, // Max 50MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Hanya file PDF yang diperbolehkan'));
        }
    }
});

// Buat folder temp jika belum ada
const tempDir = path.join(__dirname, 'data', 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// ─── Config Files ───────────────────────────────────────────────
const knowledgeFile = path.join(__dirname, 'knowledge.json');
const behaviorFile = path.join(__dirname, 'config', 'behavior.json');

function loadKnowledge() {
    try {
        if (!fs.existsSync(knowledgeFile)) return { responses: {} };
        const data = fs.readFileSync(knowledgeFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading knowledge:', error.message);
        return { responses: {} };
    }
}

function saveKnowledge(data) {
    try {
        fs.writeFileSync(knowledgeFile, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving knowledge:', error.message);
        return false;
    }
}

function loadBehavior() {
    try {
        if (!fs.existsSync(behaviorFile)) return null;
        return JSON.parse(fs.readFileSync(behaviorFile, 'utf8'));
    } catch (error) {
        console.error('Error loading behavior:', error.message);
        return null;
    }
}

function saveBehavior(obj) {
    try {
        fs.mkdirSync(path.dirname(behaviorFile), { recursive: true });
        fs.writeFileSync(behaviorFile, JSON.stringify(obj, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving behavior:', error.message);
        return false;
    }
}

// ─── Auth Middleware ─────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized: silakan login terlebih dahulu', success: false });
}

// ─── Build Index saat startup ───────────────────────────────────
function buildRAGIndex() {
    const allDocuments = datasetManager.getAllDocuments();
    if (allDocuments.length > 0) {
        ragEngine.buildIndex(allDocuments);
        ragEngine.saveIndex();
        console.log(`RAG Index dibangun: ${allDocuments.length} dokumen`);
    } else {
        console.log('Tidak ada dokumen untuk di-index');
    }
}

// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── Chat API (Public) ──────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ reply: 'Pesan tidak boleh kosong', sources: [], source_type: 'error' });
        }

        const userMessage = message.trim();

        // Step 1: Cek FAQ keyword
        const knowledge = loadKnowledge();
        const keyword = userMessage.toLowerCase().trim();

        if (knowledge.responses && knowledge.responses[keyword]) {
            return res.json({
                reply: knowledge.responses[keyword],
                sources: [],
                source_type: 'faq'
            });
        }

        // Step 2: RAG Search
        const allDocuments = datasetManager.getAllDocuments();
        
        if (allDocuments.length === 0) {
            const behavior = loadBehavior();
            return res.json({
                reply: behavior?.fallback_response || 'Mohon maaf, belum ada dataset yang dimuat. Silakan hubungi admin.',
                sources: [],
                source_type: 'no_data'
            });
        }

        // Pastikan index sudah dibangun
        if (!ragEngine.index || ragEngine.index.vectors.length === 0) {
            ragEngine.buildIndex(allDocuments);
        }

        const topK = Number(process.env.RAG_TOP_K || 5);
        const contextItems = ragEngine.retrieveContext(userMessage, allDocuments, topK);

        console.log(`RAG: "${userMessage.substring(0, 50)}..." → ${contextItems.length} konteks ditemukan`);

        // Step 3: Generate via Gemini
        const contextBlock = ragEngine.buildContextBlock(contextItems);
        const behavior = loadBehavior();
        const aiResponse = await gemini.generateResponse(userMessage, contextBlock, behavior);

        if (!aiResponse) {
            return res.json({
                reply: behavior?.fallback_response || 'Maaf, terjadi kesalahan. Silakan coba lagi.',
                sources: [],
                source_type: 'error'
            });
        }

        // Build sources info
        const sources = contextItems.map(item => ({
            filename: item.filename || '',
            page: item.page || 0,
            chunk_preview: item.text.substring(0, 150) + (item.text.length > 150 ? '...' : ''),
            download_url: item.filename ? `/api/files/${encodeURIComponent(item.filename)}` : null,
            score: Math.round(item.score * 100) / 100
        }));

        // Deduplicate sources by filename
        const uniqueSources = [];
        const seenFiles = new Set();
        for (const src of sources) {
            if (src.filename && !seenFiles.has(src.filename)) {
                seenFiles.add(src.filename);
                uniqueSources.push(src);
            } else if (!src.filename) {
                uniqueSources.push(src);
            }
        }

        res.json({
            reply: aiResponse,
            sources: uniqueSources,
            source_type: 'rag'
        });

    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({
            reply: 'Maaf, terjadi kesalahan internal. Silakan coba lagi.',
            sources: [],
            source_type: 'error'
        });
    }
});

// ─── File Download (Public) ─────────────────────────────────────
app.get('/api/files/:filename', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const filePath = path.join(__dirname, 'data', 'uploads', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File tidak ditemukan' });
        }

        // Security: pastikan path tidak keluar dari uploads
        const resolvedPath = path.resolve(filePath);
        const uploadsPath = path.resolve(path.join(__dirname, 'data', 'uploads'));
        if (!resolvedPath.startsWith(uploadsPath)) {
            return res.status(403).json({ message: 'Akses ditolak' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.sendFile(resolvedPath);
    } catch (error) {
        res.status(500).json({ message: 'Error: ' + error.message });
    }
});

// ─── Auth API ───────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'admin';

    if (username === adminUser && password === adminPass) {
        req.session.isAdmin = true;
        res.json({ success: true, message: 'Login berhasil' });
    } else {
        res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logout berhasil' });
});

app.get('/api/auth/check', (req, res) => {
    res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ─── Dataset API (Protected) ───────────────────────────────────
app.get('/api/datasets', requireAuth, (req, res) => {
    res.json({
        datasets: datasetManager.listDatasets(),
        totalDocuments: datasetManager.getAllDocuments().length
    });
});

app.post('/api/datasets/upload', requireAuth, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File PDF tidak ditemukan' });
        }

        const result = await datasetManager.uploadPDF(req.file);
        
        if (result.success) {
            // Rebuild RAG index
            buildRAGIndex();
        }

        res.json(result);
    } catch (error) {
        console.error('Upload error:', error.message);
        res.status(500).json({ success: false, message: 'Error upload: ' + error.message });
    }
});

app.delete('/api/datasets/:id', requireAuth, (req, res) => {
    const result = datasetManager.deleteDataset(req.params.id);
    if (result.success) {
        buildRAGIndex();
    }
    res.json(result);
});

app.get('/api/datasets/:id/documents', requireAuth, (req, res) => {
    const docs = datasetManager.getDatasetDocuments(req.params.id);
    const dataset = datasetManager.getDataset(req.params.id);
    if (!dataset) {
        return res.status(404).json({ message: 'Dataset tidak ditemukan' });
    }
    res.json({ dataset, documents: docs });
});

app.post('/api/datasets/:id/reprocess', requireAuth, async (req, res) => {
    const result = await datasetManager.reprocessDataset(req.params.id);
    if (result.success) {
        buildRAGIndex();
    }
    res.json(result);
});

// ─── Knowledge API (Protected) ─────────────────────────────────
app.get('/api/knowledge', requireAuth, (req, res) => {
    res.json(loadKnowledge());
});

app.post('/api/knowledge', requireAuth, (req, res) => {
    try {
        const { keyword, response } = req.body;
        if (!keyword || !response) {
            return res.status(400).json({ success: false, message: 'Keyword dan response harus diisi' });
        }
        const knowledge = loadKnowledge();
        knowledge.responses[keyword.toLowerCase().trim()] = response;
        if (saveKnowledge(knowledge)) {
            res.json({ success: true, message: 'Keyword berhasil disimpan' });
        } else {
            res.status(500).json({ success: false, message: 'Gagal menyimpan keyword' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/knowledge/:keyword', requireAuth, (req, res) => {
    try {
        const keyword = decodeURIComponent(req.params.keyword).toLowerCase();
        const knowledge = loadKnowledge();
        if (knowledge.responses[keyword]) {
            delete knowledge.responses[keyword];
            if (saveKnowledge(knowledge)) {
                res.json({ success: true, message: 'Keyword berhasil dihapus' });
            } else {
                res.status(500).json({ success: false, message: 'Gagal menghapus keyword' });
            }
        } else {
            res.status(404).json({ success: false, message: 'Keyword tidak ditemukan' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─── Behavior API (Protected) ──────────────────────────────────
app.get('/api/behavior', requireAuth, (req, res) => {
    const behavior = loadBehavior();
    if (!behavior) return res.status(404).json({ message: 'Behavior config tidak ditemukan' });
    res.json(behavior);
});

app.post('/api/behavior', requireAuth, (req, res) => {
    const obj = req.body;
    if (!obj || typeof obj !== 'object') {
        return res.status(400).json({ success: false, message: 'Data behavior tidak valid' });
    }
    if (saveBehavior(obj)) {
        res.json({ success: true, message: 'Behavior berhasil disimpan' });
    } else {
        res.status(500).json({ success: false, message: 'Gagal menyimpan behavior' });
    }
});

// ─── Stats API (Protected) ─────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
    const dsStats = datasetManager.getStats();
    const ragStats = ragEngine.getStats();
    res.json({
        datasets: dsStats,
        rag: ragStats,
        gemini: {
            model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
            configured: !!process.env.GEMINI_API_KEY
        }
    });
});

// ─── Start Server ───────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  🤖 SSC Telkom University Surabaya — RAG Chatbot');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  🌐 Server     : http://localhost:${PORT}`);
    console.log(`  💬 Chat       : http://localhost:${PORT}`);
    console.log(`  ⚙️  Admin      : http://localhost:${PORT}/admin.html`);
    console.log(`  📊 Datasets   : ${datasetManager.listDatasets().length} loaded`);
    console.log(`  🤖 AI Model   : ${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // Build RAG index saat startup
    buildRAGIndex();
});
