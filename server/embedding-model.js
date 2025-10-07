import { GoogleGenAI } from "@google/genai";
import { configDotenv } from "dotenv";
configDotenv();

export default async function embeddingModel({ docs }) {
    if (!Array.isArray(docs)) {
        throw new Error("docs must be an array of strings");
    }

    const ai = new GoogleGenAI({
        apiKey: process.env.GoogleAPIKEY
    });

    console.log("Start making embeddings ==========");

    // Ensure everything is a string
    const cleanedDocs = docs.map((d) => String(d));

    try {
        const response = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: cleanedDocs
        });

        console.log("Embedding response received");

        // Extract the actual vector values from the response
        // Google's response structure: response.embeddings[i].values
        const embeddings = response.embeddings.map(emb => emb.values);

        console.log(`✅ Generated ${embeddings.length} embeddings`);
        console.log(`Embedding dimension: ${embeddings[0].length}`);

        return embeddings;

    } catch (error) {
        console.error(" Error generating embeddings:", error.message);
        throw error;
    }
}