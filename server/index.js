import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Queue } from 'bullmq';
import { QdrantClient } from "@qdrant/js-client-rest";
import { Groq } from 'groq-sdk';
import { configDotenv } from "dotenv";
import embeddingModel from "./embedding-model.js";

configDotenv();

const app = express();

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Initialize Qdrant
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL
});

const queue = new Queue('fileupload', {
  connection: {
    host: 'localhost',
    port: 6379
  }
});

app.use(express.json());
app.use(cors());

// Create uploads directory if it doesn't exist
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Add file filter for PDFs
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'all good' });
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log("File uploaded successfully:", req.file);

    await queue.add('file-ready', JSON.stringify({
      filename: req.file.filename,
      destination: req.file.destination,
      path: req.file.path
    }));

    return res.json({
      message: "uploaded and enqueued",
      file: {
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: 'File upload failed' });
  }
});

// RAG Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log("User query:", query);

    // Step 1: Generate embedding for the user query
    console.log("Generating query embedding...");
    const queryEmbedding = await embeddingModel({ docs: [query] });
    
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error("Failed to generate query embedding");
    }

    // Step 2: Search for similar chunks in Qdrant
    console.log("Searching in Qdrant...");
    const searchResults = await qdrant.search("pdf-with-chat", {
      vector: queryEmbedding[0],
      limit: 5, // Get top 5 most relevant chunks
      with_payload: true,
    });

    console.log(`Found ${searchResults.length} relevant chunks`);

    // Check if we found any relevant context
    if (searchResults.length === 0) {
      return res.json({
        answer: "I couldn't find any relevant information in the uploaded PDF to answer your question. Please make sure you've uploaded a PDF document first.",
        sources: []
      });
    }

    // Step 3: Extract context from search results
    const context = searchResults
      .map((result, idx) => `[Chunk ${idx + 1}] ${result.payload.text}`)
      .join("\n\n");

    console.log("Context retrieved, length:", context.length);

    // Step 4: Create the system prompt with context
    const systemPrompt = `You are a helpful AI assistant that answers questions based STRICTLY on the provided PDF document context. 

CRITICAL RULES:
1. ONLY use information from the context below to answer questions
2. If the answer is not in the context, say "I cannot find this information in the provided document"
3. DO NOT use your general knowledge or make up information
4. Quote relevant parts from the context when answering
5. If the context is insufficient, ask for clarification or state what information is missing
6. Be concise and accurate

CONTEXT FROM PDF DOCUMENT:
${context}

Remember: Your answer must be based ONLY on the context above. If you cannot answer from the context, clearly state that.`;

    // Step 5: Generate response using Groq
    console.log("Generating AI response...");
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: query
        }
      ],
      model: "llama-3.3-70b-versatile", // Better model for RAG tasks
      temperature: 0.3, // Lower temperature for more factual responses
      max_tokens: 2048,
      top_p: 0.9,
      stream: false, // Set to false for cleaner response handling
    });

    const answer = chatCompletion.choices[0]?.message?.content || "No response generated";

    console.log("Response generated successfully");

    // Step 6: Return the answer with sources
    return res.json({
      answer: answer,
      sources: searchResults.map((result, idx) => ({
        chunk_index: idx + 1,
        text: result.payload.text.substring(0, 200) + "...", // Preview
        score: result.score,
        source: result.payload.source
      }))
    });

  } catch (error) {
    console.error("Chat error:", error);
    return res.status(500).json({ 
      error: 'Failed to process chat request',
      details: error.message 
    });
  }
});



// Streaming chat endpoint (optional)
app.post('/chat/stream', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Generate embedding and search
    const queryEmbedding = await embeddingModel({ docs: [query] });
    const searchResults = await qdrant.search("pdf-with-chat", {
      vector: queryEmbedding[0],
      limit: 5,
      with_payload: true,
    });

    if (searchResults.length === 0) {
      res.write(`data: ${JSON.stringify({ done: true, answer: "No relevant context found." })}\n\n`);
      return res.end();
    }

    const context = searchResults
      .map((result, idx) => `[Chunk ${idx + 1}] ${result.payload.text}`)
      .join("\n\n");

    const systemPrompt = `You are a helpful AI assistant that answers questions based STRICTLY on the provided PDF document context. 

CRITICAL RULES:
1. ONLY use information from the context below to answer questions
2. If the answer is not in the context, say "I cannot find this information in the provided document"
3. DO NOT use your general knowledge or make up information
4. Quote relevant parts from the context when answering
5. Be concise and accurate

CONTEXT FROM PDF DOCUMENT:
${context}`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 2048,
      stream: true,
    });

    for await (const chunk of chatCompletion) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error("Stream chat error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});




// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size is too large. Max size is 10MB' });
    }
  }
  return res.status(500).json({ error: error.message });
});




// Cleanup old files on startup (files older than 1 hour)
async function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(uploadDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtimeMs;
      
      // Delete files older than 1 hour
      if (fileAge > oneHour) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`🗑️ Deleted old file: ${file}`);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`✅ Cleaned up ${deletedCount} old file(s)`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Manual cleanup endpoint (admin use)
app.delete('/cleanup/files', async (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      fs.unlinkSync(filePath);
      deletedCount++;
    }
    
    return res.json({ 
      message: 'Cleanup completed',
      filesDeleted: deletedCount 
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
});




// Run cleanup on startup
cleanupOldFiles();



// Schedule cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

app.listen(5000, () => {
  console.log('====================================');
  console.log("Server is running on localhost:5000");
  console.log('====================================');
});