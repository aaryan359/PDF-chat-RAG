import { Worker } from "bullmq";
import { pdf } from "pdf-parse";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { readFile } from "node:fs/promises";
import { QdrantClient } from "@qdrant/js-client-rest";
import { configDotenv } from "dotenv";
import embeddingModel from "./embedding-model.js";

configDotenv();

const worker = new Worker(
	"fileupload",
	async (job) => {
		try {
			console.log("job", job.data);
			const data = JSON.parse(job.data);

			// Read and parse PDF
			console.log("Reading PDF file...");
			const buffer = await readFile(data.path);
			const pdfData = await pdf(buffer);
			console.log("PDF loaded successfully.");

			// Split text into chunks
			console.log("Splitting text into chunks =============================");
			const textSplitter = new CharacterTextSplitter({
				chunkSize: 1000,
				chunkOverlap: 100,
			});

			const chunks = await textSplitter.splitText(pdfData.text);
			console.log(`✅ Created ${chunks.length} chunks`);

			// Generate embeddings
			const documentEmbeddings = await embeddingModel({ docs: chunks });
			console.log("✅ All embeddings generated", documentEmbeddings.length);

			// Initialize Qdrant client
			const qdrant = new QdrantClient({
				url: process.env.QDRANT_URL,
			});

			const collectionName = "pdf-with-chat";

			// Ensure collection exists
			try {
				await qdrant.getCollection(collectionName);
				console.log("Collection already exists");
			} catch (error) {
				console.log("Creating new collection...");
				await qdrant.createCollection(collectionName, {
					vectors: {
						size: documentEmbeddings[0].length,
						distance: "Cosine",
					},
				});
				console.log("✅ Collection created");
			}

			// Prepare points for Qdrant
			const points = documentEmbeddings.map((vec, i) => ({
				id: i + 1,
				vector: vec,
				payload: {
					text: chunks[i],
					chunk_index: i,
					source: data.path,
				},
			}));

			// Upsert points into the collection
			await qdrant.upsert(collectionName, {
				wait: true,
				points: points,
			});

			console.log("All embeddings uploaded successfully to Qdrant");
			return { success: true, chunks: chunks.length };


		} catch (error) {
			console.error("Error in worker:", error.message);
			console.error(error.stack);
			throw error; 
		}
	},
	{
		connection: {
			host: "localhost",
			port: 6379,
		},
		concurrency: 10,
	}
);

worker.on("completed", (job) => {
	console.log(`Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
	console.error(`Job ${job.id} failed:`, err.message);
});

console.log("Worker started and waiting for jobs...");
