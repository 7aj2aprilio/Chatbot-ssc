require('dotenv').config();
const fs = require('fs');
const path = require('path');
const GeminiClient = require('./lib/gemini');
const RAGEngine = require('./lib/rag');
const DatasetManager = require('./lib/dataset');

async function evaluate() {
    console.log('=== MEMULAI EVALUASI MODEL RAG ===\n');

    // Load data
    const datasetManager = new DatasetManager();
    const allDocuments = datasetManager.getAllDocuments();
    console.log(`[INFO] Total dokumen (chunks) termuat: ${allDocuments.length}`);

    if (allDocuments.length === 0) {
        console.error('[ERROR] Tidak ada dokumen! Pastikan PDF sudah ada di data/uploads atau data/processed.');
        return;
    }

    const gemini = new GeminiClient();
    const ragEngine = new RAGEngine();

    if (!ragEngine.index || !ragEngine.index.vectors || ragEngine.index.vectors.length === 0) {
        console.log('[INFO] Index kosong, membangun index embedding...');
        await ragEngine.buildIndex(allDocuments, gemini);
        ragEngine.saveIndex();
    }

    // Load soal pengujian
    const evalFile = path.join(process.cwd(), 'eval_dataset.json');
    if (!fs.existsSync(evalFile)) {
        console.error('[ERROR] File eval_dataset.json tidak ditemukan!');
        return;
    }
    const testCases = JSON.parse(fs.readFileSync(evalFile, 'utf8'));
    console.log(`[INFO] Total pertanyaan pengujian: ${testCases.length}\n`);

    let totalRelevantRetrieved = 0;
    let totalRetrieved = 0;
    let questionsWithRelevantRetrieval = 0;
    let questionsWithCorrectAnswer = 0;

    for (let i = 0; i < testCases.length; i++) {
        const test = testCases[i];
        console.log(`-------------------------------------------------`);
        console.log(`Uji Ke-${i + 1}`);
        console.log(`Q: "${test.question}"`);

        // 1. Uji Retrieval
        const topK = 5;
        const contextItems = await ragEngine.retrieveContext(test.question, allDocuments, topK, gemini);
        totalRetrieved += contextItems.length;

        // Cek apakah dokumen yang diharapkan berhasil terambil
        let foundExpectedDoc = false;
        let relevantChunksCount = 0;

        for (const item of contextItems) {
            const filename = item.filename || '';
            // Cocokkan nama file dengan expected_document (tidak case sensitive)
            if (filename.toLowerCase().includes(test.expected_document.toLowerCase())) {
                foundExpectedDoc = true;
                relevantChunksCount++;
            }
        }

        totalRelevantRetrieved += relevantChunksCount;
        if (foundExpectedDoc) {
            questionsWithRelevantRetrieval++;
        }

        console.log(`[Retrieval] Dokumen Tepat Ditemukan: ${foundExpectedDoc ? '✅ Ya' : '❌ Tidak'}`);

        // 2. Uji Generative (Akurasi Jawaban menggunakan keyword matching)
        const contextBlock = ragEngine.buildContextBlock(contextItems);
        const behavior = { fallback_response: "Maaf, saya tidak menemukan jawabannya." };
        
        const aiResponse = await gemini.generateResponse(test.question, contextBlock, behavior);

        // Pencocokan Kata Kunci
        let keywordsFound = 0;
        const responseLower = aiResponse.toLowerCase();
        for (const kw of test.expected_keywords) {
            if (responseLower.includes(kw.toLowerCase())) {
                keywordsFound++;
            }
        }

        // Kita anggap "Benar" jika setidaknya 1 kata kunci penting ditemukan
        const answerIsCorrect = keywordsFound > 0; 
        if (answerIsCorrect) {
            questionsWithCorrectAnswer++;
        }

        // Tampilkan 100 karakter pertama agar tidak penuh
        const shortResponse = aiResponse.replace(/\n/g, ' ').substring(0, 100);
        console.log(`[Answer]    Jawaban AI: ${shortResponse}...`);
        console.log(`[Answer]    Mengandung Keyword: ${answerIsCorrect ? '✅ Ya' : '❌ Tidak'} (${keywordsFound}/${test.expected_keywords.length})`);
    }

    // --- KALKULASI METRIK AKHIR ---
    console.log('\n=================================================');
    console.log('🏆 HASIL EVALUASI MODEL RAG (METRIK MACHINE LEARNING)');
    console.log('=================================================');

    // 1. Retrieval Metrics
    const precision = totalRetrieved === 0 ? 0 : (totalRelevantRetrieved / totalRetrieved) * 100;
    const recall = testCases.length === 0 ? 0 : (questionsWithRelevantRetrieval / testCases.length) * 100;
    
    let f1Score = 0;
    if (precision + recall > 0) {
        f1Score = 2 * (precision * recall) / (precision + recall);
    }

    console.log(`1️⃣  METRIK PENCARIAN (RETRIEVAL)`);
    console.log(`   - Precision : ${precision.toFixed(2)}%  (Berapa % paragraf yg diambil benar-benar dari PDF target)`);
    console.log(`   - Recall    : ${recall.toFixed(2)}%  (Berapa % pertanyaan yg berhasil menemukan PDF target)`);
    console.log(`   - F1-Score  : ${f1Score.toFixed(2)}%  (Rata-rata harmonik Precision & Recall)`);

    // 2. Generation Metrics
    const accuracy = testCases.length === 0 ? 0 : (questionsWithCorrectAnswer / testCases.length) * 100;
    
    console.log(`\n2️⃣  METRIK JAWABAN (GENERATION)`);
    console.log(`   - Akurasi   : ${accuracy.toFixed(2)}%  (Berapa % jawaban akhir sesuai dengan konteks/kata kunci)`);
    console.log('=================================================\n');
}

evaluate().catch(console.error);
