require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

class GeminiClient {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        
        if (!this.apiKey) {
            console.error('GEMINI_API_KEY tidak ditemukan di .env');
        }
        
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }

    /**
     * Generate respons AI berdasarkan pesan user, konteks RAG, dan behavior config
     */
    async generateResponse(message, contextBlock, behavior) {
        try {
            if (!behavior) {
                behavior = {
                    system_instructions: 'Jawab berdasarkan konteks yang diberikan.',
                    fallback_response: 'Mohon maaf, informasi tersebut belum tersedia.',
                    max_sentences: 5,
                    language: 'id'
                };
            }

            // Jika tidak ada konteks yang relevan, kembalikan fallback
            if (!contextBlock || contextBlock.trim().length === 0) {
                return behavior.fallback_response || 'Mohon maaf, informasi tersebut belum tersedia.';
            }

            // Bangun system instruction
            const systemParts = [];
            if (behavior.system_instructions) systemParts.push(behavior.system_instructions);
            systemParts.push(`Jawab hanya menggunakan konteks berikut. Jika konteks tidak memadai, jawab: "${behavior.fallback_response}"`);
            systemParts.push(`Jawab maksimal ${behavior.max_sentences || 5} kalimat. Bahasa: ${behavior.language || 'id'}.`);
            if (behavior.reply_style) systemParts.push(`Gaya jawaban: ${behavior.reply_style}`);
            
            const systemInstruction = systemParts.join('\n');
            const userMessage = `Konteks:\n${contextBlock}\n\nPertanyaan:\n${message}`;

            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: userMessage,
                config: {
                    systemInstruction: systemInstruction,
                    maxOutputTokens: 2048,
                    temperature: 0.3,
                }
            });

            return response.text || behavior.fallback_response;
        } catch (error) {
            console.error('Gemini API Error:', error.message);
            
            // Handle Rate Limit / Quota Exceeded (429)
            if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
                return "Maaf, sistem AI sedang mengalami antrean penuh atau limit penggunaan tercapai (Quota Exceeded). Silakan coba lagi dalam beberapa menit, atau hubungi admin untuk memperbarui API Key.";
            }
            
            return "Maaf, terjadi kesalahan pada server AI. Silakan coba lagi nanti.";
        }
    }

    /**
     * Generate embedding vector untuk teks menggunakan gemini-embedding-2
     */
    async generateEmbedding(text) {
        try {
            const response = await this.ai.models.embedContent({
                model: 'gemini-embedding-2',
                contents: text,
            });
            
            // Mengambil nilai vektor
            if (response.embeddings && response.embeddings.length > 0) {
                return response.embeddings[0].values;
            }
            return null;
        } catch (error) {
            console.error('Gemini Embedding Error:', error.message);
            return null;
        }
    }

    /**
     * Test koneksi ke Gemini API
     */
    async testConnection() {
        try {
            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: 'Jawab dengan satu kata: "OK"',
                config: {
                    maxOutputTokens: 10,
                    temperature: 0,
                }
            });
            return { success: true, response: response.text };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = GeminiClient;
