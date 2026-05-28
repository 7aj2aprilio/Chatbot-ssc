/**
 * PDF Processor — Ekstraksi teks dari PDF dan chunking cerdas
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

class PDFProcessor {
    /**
     * Ekstrak teks dari buffer PDF
     * @param {Buffer} pdfBuffer - Buffer file PDF
     * @returns {Object} { text, numPages, metadata }
     */
    async extractText(pdfBuffer) {
        try {
            const data = await pdfParse(pdfBuffer);
            return {
                text: data.text || '',
                numPages: data.numpages || 0,
                metadata: {
                    title: data.info?.Title || '',
                    author: data.info?.Author || '',
                    subject: data.info?.Subject || '',
                    creator: data.info?.Creator || ''
                }
            };
        } catch (error) {
            console.error('Error parsing PDF:', error.message);
            throw new Error('Gagal membaca file PDF: ' + error.message);
        }
    }

    /**
     * Bersihkan teks hasil ekstraksi PDF
     */
    cleanText(text) {
        return text
            // Hapus karakter kontrol
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            // Normalize whitespace berlebih
            .replace(/[ \t]+/g, ' ')
            // Hapus baris kosong berlebih (lebih dari 2)
            .replace(/\n{3,}/g, '\n\n')
            // Hapus nomor halaman yang berdiri sendiri
            .replace(/^\s*\d+\s*$/gm, '')
            // Trim setiap baris
            .split('\n')
            .map(line => line.trim())
            .join('\n')
            .trim();
    }

    /**
     * Proses file PDF menjadi dokumen chunks dengan metadata
     * @param {string} filePath - Path ke file PDF
     * @returns {Object} { documents, numPages, metadata }
     */
    async processFile(filePath) {
        const fileName = path.basename(filePath);
        const pdfBuffer = fs.readFileSync(filePath);
        
        const { text: rawText, numPages, metadata } = await this.extractText(pdfBuffer);
        
        if (!rawText || rawText.trim().length === 0) {
            return {
                documents: [],
                numPages,
                metadata,
                warning: 'PDF tidak mengandung teks yang bisa diekstrak (mungkin berupa gambar/scan)'
            };
        }

        const cleanedText = this.cleanText(rawText);
        const documents = this.createDocuments(cleanedText, fileName, numPages);

        return {
            documents,
            numPages,
            metadata,
            totalChunks: documents.length,
            totalChars: cleanedText.length
        };
    }

    /**
     * Buat dokumen chunks dari teks yang sudah dibersihkan
     */
    createDocuments(text, fileName, numPages) {
        const documents = [];
        const chunkSize = 600;
        const overlap = 100;

        // Split per paragraf
        const paragraphs = text.split(/\n\s*\n/);
        let currentChunk = '';
        let chunkIndex = 0;

        // Estimasi halaman berdasarkan posisi karakter
        const charsPerPage = Math.max(text.length / Math.max(numPages, 1), 1);

        let charPosition = 0;

        for (const para of paragraphs) {
            const trimmedPara = para.trim();
            if (!trimmedPara || trimmedPara.length < 5) {
                charPosition += para.length + 2;
                continue;
            }

            if ((currentChunk + '\n\n' + trimmedPara).length > chunkSize && currentChunk.length > 0) {
                const estimatedPage = Math.min(Math.floor(charPosition / charsPerPage) + 1, numPages);
                
                documents.push({
                    source: `${fileName}/chunk-${chunkIndex}`,
                    text: currentChunk.trim(),
                    filename: fileName,
                    page: estimatedPage,
                    chunkIndex: chunkIndex
                });
                chunkIndex++;

                const overlapText = currentChunk.slice(-overlap);
                currentChunk = overlapText + '\n\n' + trimmedPara;
            } else {
                currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedPara : trimmedPara;
            }

            charPosition += para.length + 2;
        }

        // Chunk terakhir
        if (currentChunk.trim().length > 20) {
            const estimatedPage = Math.min(Math.floor(charPosition / charsPerPage) + 1, numPages);
            documents.push({
                source: `${fileName}/chunk-${chunkIndex}`,
                text: currentChunk.trim(),
                filename: fileName,
                page: estimatedPage,
                chunkIndex: chunkIndex
            });
        }

        // Fallback: jika tidak ada paragraf terdeteksi
        if (documents.length === 0 && text.length > 20) {
            let start = 0;
            while (start < text.length) {
                let end = Math.min(start + chunkSize, text.length);
                if (end < text.length) {
                    const lastBreak = text.lastIndexOf('\n', end);
                    if (lastBreak > start + 100) end = lastBreak;
                }
                const chunk = text.slice(start, end).trim();
                if (chunk.length > 20) {
                    const estimatedPage = Math.min(Math.floor(start / charsPerPage) + 1, numPages);
                    documents.push({
                        source: `${fileName}/chunk-${chunkIndex}`,
                        text: chunk,
                        filename: fileName,
                        page: estimatedPage,
                        chunkIndex: chunkIndex
                    });
                    chunkIndex++;
                }
                if (end >= text.length) break;
                start = Math.max(end - overlap, start + 1);
            }
        }

        return documents;
    }
}

module.exports = PDFProcessor;
