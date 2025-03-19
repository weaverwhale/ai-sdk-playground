// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { handleChatRequest } from '../server/api/chatApi';
import { Readable } from 'stream';
import { getAvailableModelProviders } from './api/modelProviders';

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS to accept requests from the Vite dev server
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[SERVER] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Simple health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
  });
});

// Dedicated endpoint for available models
app.get('/api/models', (_req, res) => {
  try {
    const availableModels = getAvailableModelProviders();
    console.log('[SERVER] Available models:', availableModels.map(m => m.name).join(', '));
    
    res.json({ 
      models: availableModels.map(p => ({ id: p.id, name: p.name })),
      count: availableModels.length
    });
  } catch (error) {
    console.error('[SERVER] Error getting models:', error);
    res.status(500).json({ error: 'Failed to fetch available models' });
  }
});

// Helper function to convert Web ReadableStream to Node.js stream
function webToNodeStream(webStream: ReadableStream): Readable {
  const nodeStream = new Readable({ read: () => {} });
  const reader = webStream.getReader();
  
  function processStream() {
    reader.read().then(({ done, value }) => {
      if (done) {
        console.log('[SERVER] Stream complete');
        nodeStream.push(null); // End the stream
        return;
      }
      
      nodeStream.push(Buffer.from(value));
      processStream();
    }).catch(err => {
      console.error('[SERVER] Stream error:', err);
      nodeStream.destroy(err);
    });
  }
  
  processStream();
  
  nodeStream.on('error', (err) => {
    console.error('[SERVER] Stream error:', err);
  });
  
  return nodeStream;
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, modelId } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      console.error('[SERVER] Invalid messages format:', req.body);
      return res.status(400).json({ error: 'Invalid messages format' });
    }
    
    console.log('[SERVER] Processing chat request...');
    const response = await handleChatRequest({ messages, modelId });
    
    // Set response headers
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    
    // Pipe the response body if it exists
    if (response.body) {
      const nodeStream = webToNodeStream(response.body);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error('[SERVER] API error:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ 
      error: 'Failed to process request', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

app.listen(PORT, () => {
  console.log(`[SERVER] API server running at http://localhost:${PORT}`);
});

export default app; 