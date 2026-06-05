require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function checkModels() {
    try {
        console.log("Checking models...");
        const embed = await ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: 'test'
        });
        console.log('gemini-embedding-2 works', embed.embeddings[0].values.slice(0,3));
    } catch (e) {
        console.error(e);
    }
}
checkModels();
