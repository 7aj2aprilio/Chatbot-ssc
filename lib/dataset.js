/**
 * Dataset Manager v2 — Kelola PDF datasets dan dokumen yang sudah diproses
 */

const fs = require('fs');
const path = require('path');
const PDFProcessor = require('./pdf-processor');

class DatasetManager {
    constructor() {
        this.uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
        this.processedDir = path.join(__dirname, '..', 'data', 'processed');
        this.pdfProcessor = new PDFProcessor();
        
        this._ensureDir(this.uploadsDir);
        this._ensureDir(this.processedDir);
        
        // In-memory cache
        this.datasets = new Map();
        this.loadProcessedDatasets();
    }

    _ensureDir(dir) {
        if (process.env.VERCEL) return;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Muat semua dataset yang sudah diproses dari disk
     */
    loadProcessedDatasets() {
        try {
            const files = fs.readdirSync(this.processedDir);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try {
                    const filePath = path.join(this.processedDir, file);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);
                    const datasetId = file.replace('.json', '');
                    this.datasets.set(datasetId, data);
                    console.log(`Loaded dataset: ${data.name} (${data.documents.length} chunks)`);
                } catch (error) {
                    console.error(`Error loading dataset ${file}:`, error.message);
                }
            }
            console.log(`Total datasets loaded: ${this.datasets.size}`);
        } catch (error) {
            console.error('Error loading processed datasets:', error.message);
        }
    }

    /**
     * Upload dan proses file PDF baru
     * @param {Object} file - Multer file object
     * @returns {Object} Hasil proses
     */
    async uploadPDF(file) {
        try {
            const originalName = file.originalname;
            const safeFileName = this._sanitizeFileName(originalName);
            const datasetId = safeFileName.replace('.pdf', '');

            // Simpan file asli ke uploads/
            const uploadPath = path.join(this.uploadsDir, safeFileName);
            fs.copyFileSync(file.path, uploadPath);

            // Proses PDF
            const result = await this.pdfProcessor.processFile(uploadPath);

            if (result.documents.length === 0) {
                return {
                    success: false,
                    message: result.warning || 'Tidak ada teks yang bisa diekstrak dari PDF',
                    datasetId
                };
            }

            // Simpan hasil proses
            const datasetData = {
                id: datasetId,
                name: originalName,
                filename: safeFileName,
                uploadedAt: new Date().toISOString(),
                numPages: result.numPages,
                totalChunks: result.totalChunks,
                totalChars: result.totalChars,
                metadata: result.metadata,
                documents: result.documents
            };

            const processedPath = path.join(this.processedDir, `${datasetId}.json`);
            fs.writeFileSync(processedPath, JSON.stringify(datasetData, null, 2));

            // Simpan ke cache
            this.datasets.set(datasetId, datasetData);

            // Hapus file temp dari multer
            if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }

            console.log(`Dataset uploaded: ${originalName} → ${result.totalChunks} chunks`);

            return {
                success: true,
                message: `PDF berhasil diproses: ${result.totalChunks} chunks dari ${result.numPages} halaman`,
                datasetId,
                stats: {
                    numPages: result.numPages,
                    totalChunks: result.totalChunks,
                    totalChars: result.totalChars
                }
            };
        } catch (error) {
            console.error('Error uploading PDF:', error.message);
            // Hapus file temp dari multer jika error
            if (file.path && fs.existsSync(file.path)) {
                try { fs.unlinkSync(file.path); } catch (e) {}
            }
            return {
                success: false,
                message: 'Gagal memproses PDF: ' + error.message
            };
        }
    }

    /**
     * Reprocess dataset yang sudah ada
     */
    async reprocessDataset(datasetId) {
        const dataset = this.datasets.get(datasetId);
        if (!dataset) {
            return { success: false, message: 'Dataset tidak ditemukan' };
        }

        const uploadPath = path.join(this.uploadsDir, dataset.filename);
        if (!fs.existsSync(uploadPath)) {
            return { success: false, message: 'File PDF asli tidak ditemukan' };
        }

        try {
            const result = await this.pdfProcessor.processFile(uploadPath);

            dataset.documents = result.documents;
            dataset.totalChunks = result.totalChunks;
            dataset.totalChars = result.totalChars;
            dataset.reprocessedAt = new Date().toISOString();

            const processedPath = path.join(this.processedDir, `${datasetId}.json`);
            fs.writeFileSync(processedPath, JSON.stringify(dataset, null, 2));

            this.datasets.set(datasetId, dataset);

            return {
                success: true,
                message: `Dataset berhasil diproses ulang: ${result.totalChunks} chunks`,
                stats: {
                    totalChunks: result.totalChunks,
                    totalChars: result.totalChars
                }
            };
        } catch (error) {
            return { success: false, message: 'Gagal reprocess: ' + error.message };
        }
    }

    /**
     * Hapus dataset
     */
    deleteDataset(datasetId) {
        const dataset = this.datasets.get(datasetId);
        if (!dataset) {
            return { success: false, message: 'Dataset tidak ditemukan' };
        }

        try {
            // Hapus file processed
            const processedPath = path.join(this.processedDir, `${datasetId}.json`);
            if (fs.existsSync(processedPath)) fs.unlinkSync(processedPath);

            // Hapus file upload
            const uploadPath = path.join(this.uploadsDir, dataset.filename);
            if (fs.existsSync(uploadPath)) fs.unlinkSync(uploadPath);

            // Hapus dari cache
            this.datasets.delete(datasetId);

            console.log(`Dataset deleted: ${dataset.name}`);
            return { success: true, message: `Dataset "${dataset.name}" berhasil dihapus` };
        } catch (error) {
            return { success: false, message: 'Gagal menghapus: ' + error.message };
        }
    }

    /**
     * Ambil semua dokumen dari semua dataset
     */
    getAllDocuments() {
        const allDocs = [];
        for (const [id, dataset] of this.datasets) {
            if (dataset.documents && Array.isArray(dataset.documents)) {
                for (const doc of dataset.documents) {
                    allDocs.push({
                        source: doc.source || `${dataset.name}/unknown`,
                        text: doc.text || '',
                        filename: doc.filename || dataset.filename || '',
                        page: doc.page || 0,
                        datasetId: id
                    });
                }
            }
        }
        return allDocs;
    }

    /**
     * Ambil dokumen dari satu dataset
     */
    getDatasetDocuments(datasetId) {
        const dataset = this.datasets.get(datasetId);
        if (!dataset || !dataset.documents) return [];
        return dataset.documents;
    }

    /**
     * List semua dataset
     */
    listDatasets() {
        return Array.from(this.datasets.values()).map(d => ({
            id: d.id,
            name: d.name,
            filename: d.filename,
            uploadedAt: d.uploadedAt,
            numPages: d.numPages,
            totalChunks: d.totalChunks,
            totalChars: d.totalChars
        }));
    }

    /**
     * Ambil detail satu dataset (tanpa documents untuk preview)
     */
    getDataset(datasetId) {
        const dataset = this.datasets.get(datasetId);
        if (!dataset) return null;
        return {
            id: dataset.id,
            name: dataset.name,
            filename: dataset.filename,
            uploadedAt: dataset.uploadedAt,
            numPages: dataset.numPages,
            totalChunks: dataset.totalChunks,
            totalChars: dataset.totalChars,
            metadata: dataset.metadata
        };
    }

    /**
     * Statistik keseluruhan
     */
    getStats() {
        let totalChunks = 0;
        let totalChars = 0;
        for (const dataset of this.datasets.values()) {
            totalChunks += dataset.totalChunks || 0;
            totalChars += dataset.totalChars || 0;
        }
        return {
            totalDatasets: this.datasets.size,
            totalChunks,
            totalChars
        };
    }

    /**
     * Sanitize nama file
     */
    _sanitizeFileName(name) {
        return name
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .toLowerCase();
    }
}

module.exports = DatasetManager;
