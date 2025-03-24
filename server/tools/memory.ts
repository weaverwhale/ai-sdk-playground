import { z } from 'zod';
import { pipeline } from '@xenova/transformers';
import { LocalStorage } from 'node-localstorage';
import fs from 'fs';
import path from 'path';
import hnswlib from 'hnswlib-node';
import crypto from 'crypto';

// Define the data directory
const DATA_DIR = path.join(process.cwd(), 'memory');
const VECTOR_DIR = path.join(DATA_DIR, 'vectors');
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const METADATA_PATH = path.join(DATA_DIR, 'metadata.json');
const VECTOR_DIM = 384; // Dimension for the MiniLM model

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(VECTOR_DIR)) {
  fs.mkdirSync(VECTOR_DIR, { recursive: true });
}
if (!fs.existsSync(CONTENT_DIR)) {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
}

// Initialize local storage
const localStorage = new LocalStorage(CONTENT_DIR);

// Initialize vector index
let vectorIndex: InstanceType<typeof hnswlib.HierarchicalNSW>;
const indexPath = path.join(VECTOR_DIR, 'memory_index.bin');

// HNSW has different method names than what was originally used
function initVectorIndex() {
  if (fs.existsSync(indexPath)) {
    // Load existing index
    vectorIndex = new hnswlib.HierarchicalNSW('l2', VECTOR_DIM);
    // @ts-ignore - Method missing in type definitions
    vectorIndex.readIndex(indexPath);
    console.log('[MEMORY] Loaded existing vector index');
  } else {
    // Create new index
    vectorIndex = new hnswlib.HierarchicalNSW('l2', VECTOR_DIM);
    vectorIndex.initIndex(10000); // Max elements
    console.log('[MEMORY] Created new vector index');
  }
}

// Load or create metadata
let metadata: {
  count: number;
  userMemories: Record<string, string[]>;
} = { count: 0, userMemories: {} };

function loadMetadata() {
  if (fs.existsSync(METADATA_PATH)) {
    try {
      const data = fs.readFileSync(METADATA_PATH, 'utf8');
      metadata = JSON.parse(data);
      console.log('[MEMORY] Loaded metadata, memory count:', metadata.count);
    } catch (error) {
      console.error('[MEMORY] Error loading metadata:', error);
      metadata = { count: 0, userMemories: {} };
    }
  } else {
    console.log('[MEMORY] No metadata found, starting fresh');
  }
}

function saveMetadata() {
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf8');
}

// Define interfaces for memory data
interface MemoryData {
  id: string;
  userId: string;
  content: string;
  source: string;
  timestamp: string;
  updatedAt?: string;
  similarity?: number;
}

// Initialize embedding model
// Define a generic type to represent the embedder
type Embedder = {
  (
    text: string,
    options: { pooling: 'none' | 'mean' | 'cls' | undefined; normalize: boolean },
  ): Promise<{ data?: unknown }>;
};
let embedder: Embedder | null = null;

async function getEmbedder() {
  if (!embedder) {
    console.log('[MEMORY] Initializing embedding model...');
    try {
      // Using a smaller, faster model for embeddings
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('[MEMORY] Embedding model initialized');
    } catch (error) {
      console.error('[MEMORY] Error initializing embedding model:', error);
      return null;
    }
  }
  return embedder;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const model = await getEmbedder();
  if (!model) {
    throw new Error('Embedding model not initialized');
  }

  // @ts-ignore - Type definitions don't match runtime behavior
  const result = await model(text, { pooling: 'mean', normalize: true });

  // Convert Float32Array to regular array for compatibility
  // @ts-ignore - Type definitions don't match runtime behavior
  if (result && result.data) {
    // @ts-ignore - Type definitions don't match runtime behavior
    return Array.from(result.data);
  }

  throw new Error('Failed to generate embedding');
}

// Save memory to local storage and vector store
async function saveMemory(
  userId: string,
  content: string,
  source: string = 'chat',
): Promise<string> {
  try {
    // Generate a unique ID for this memory
    const memoryId = crypto.randomUUID();

    // Generate embedding
    const embedding = await generateEmbedding(content);

    // Save content and metadata to localStorage
    const memoryData = {
      id: memoryId,
      userId,
      content,
      source,
      timestamp: new Date().toISOString(),
    };

    localStorage.setItem(memoryId, JSON.stringify(memoryData));

    // Add to vector index
    // @ts-ignore - Types don't match, but it works at runtime
    vectorIndex.addPoint(embedding, metadata.count);

    // Update metadata
    if (!metadata.userMemories[userId]) {
      metadata.userMemories[userId] = [];
    }
    metadata.userMemories[userId].push(memoryId);
    metadata.count++;
    saveMetadata();

    // Save the vector index periodically
    if (metadata.count % 10 === 0) {
      // @ts-ignore - Method missing in type definitions
      vectorIndex.writeIndex(indexPath);
    }

    console.log(`[MEMORY] Saved memory ${memoryId} for user ${userId}`);
    return memoryId;
  } catch (error) {
    console.error('[MEMORY] Error saving memory:', error);
    throw error;
  }
}

// Search for memories
async function searchMemories(
  userId: string,
  query: string,
  limit: number = 5,
): Promise<MemoryData[]> {
  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Search for similar embeddings
    // @ts-ignore - Types don't match, but it works at runtime
    const searchResults = vectorIndex.searchKnn(queryEmbedding, limit * 2);

    // Fetch actual memory data
    const results = await Promise.all(
      searchResults.neighbors.map(async (idx: number) => {
        // Find memory ID by index
        const memoryId = findMemoryIdByIndex(userId, idx);
        if (!memoryId) return null;

        // Get memory content
        const memoryJson = localStorage.getItem(memoryId);
        if (!memoryJson) return null;

        try {
          const memory = JSON.parse(memoryJson);
          return {
            ...memory,
            similarity: 1 - searchResults.distances[searchResults.neighbors.indexOf(idx)],
          };
        } catch (e) {
          console.error(`[MEMORY] Error parsing memory ${memoryId}:`, e);
          return null;
        }
      }),
    );

    // Filter null results, limit to user's memories, and sort by similarity
    return results
      .filter((result): result is MemoryData => result !== null && result.userId === userId)
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, limit);
  } catch (error) {
    console.error('[MEMORY] Error searching memories:', error);
    return [];
  }
}

// Helper function to find memory ID by index
function findMemoryIdByIndex(userId: string, index: number): string | null {
  if (!metadata.userMemories[userId]) {
    return null;
  }

  // This is not efficient but works for this example
  // For a production system, we'd need a bidirectional mapping
  const userMemories = metadata.userMemories[userId];
  if (index < userMemories.length) {
    return userMemories[index];
  }

  return null;
}

// Memory update function
async function updateMemory(memoryId: string, newContent: string): Promise<boolean> {
  try {
    // Get the existing memory
    const memoryJson = localStorage.getItem(memoryId);
    if (!memoryJson) {
      console.error(`[MEMORY] Memory ${memoryId} not found`);
      return false;
    }

    const memory = JSON.parse(memoryJson);

    // Update the content and generate new embedding
    memory.content = newContent;
    memory.updatedAt = new Date().toISOString();

    // Save updated memory
    localStorage.setItem(memoryId, JSON.stringify(memory));

    // Generate new embedding and update the vector store
    // This is simplified - in a real implementation, we'd need to track indices better
    const newEmbedding = await generateEmbedding(newContent);

    // Find the index for this memory ID
    const index = metadata.userMemories[memory.userId].indexOf(memoryId);
    if (index !== -1) {
      // Update the vector at the same position
      // @ts-ignore - Method missing in type definitions
      vectorIndex.markDelete(index);
      // @ts-ignore - Types don't match, but it works at runtime
      vectorIndex.addPoint(newEmbedding, index);
      // @ts-ignore - Method missing in type definitions
      vectorIndex.writeIndex(indexPath);
    }

    console.log(`[MEMORY] Updated memory ${memoryId}`);
    return true;
  } catch (error) {
    console.error('[MEMORY] Error updating memory:', error);
    return false;
  }
}

// Initialize on startup
try {
  initVectorIndex();
  loadMetadata();
} catch (error) {
  console.error('[MEMORY] Error during initialization:', error);
}

// Define the parameter types to match the zod schema
type MemoryParams = {
  operation: 'store' | 'search' | 'update';
  userId: string;
  content: string;
  memoryId?: string;
  limit?: number;
};

const memory = {
  id: 'memory',
  name: 'Memory',
  description: 'Store and search user conversation history and memories using vector embeddings',
  parameters: z.object({
    operation: z
      .enum(['store', 'search', 'update'])
      .describe(
        'Operation to perform: store a new memory, search for memories, or update existing memory',
      ),
    userId: z.string().describe('Unique identifier for the user'),
    content: z.string().describe('Content to store or query to search for'),
    memoryId: z
      .string()
      .optional()
      .describe('Memory ID to update (required only for update operation)'),
    limit: z
      .number()
      .optional()
      .describe('Maximum number of results to return when searching (default: 5)'),
  }),
  execute: async ({ operation, userId, content, memoryId, limit = 5 }: MemoryParams) => {
    console.log(`[MEMORY] Executing memory tool with operation: ${operation}`);

    try {
      let id: string;
      let searchResults: MemoryData[];
      let updated: boolean;

      switch (operation) {
        case 'store':
          id = await saveMemory(userId, content);
          return JSON.stringify({ success: true, memoryId: id });

        case 'search':
          searchResults = await searchMemories(userId, content, limit);
          return JSON.stringify({
            success: true,
            results: searchResults,
            count: searchResults.length,
          });

        case 'update':
          if (!memoryId) {
            return JSON.stringify({
              success: false,
              error: 'Memory ID is required for update operation',
            });
          }
          updated = await updateMemory(memoryId, content);
          return JSON.stringify({
            success: updated,
            message: updated ? 'Memory updated successfully' : 'Failed to update memory',
          });

        default:
          return JSON.stringify({
            success: false,
            error: `Unknown operation: ${operation}`,
          });
      }
    } catch (error) {
      console.error('[MEMORY] Error executing memory tool:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

export { memory };
