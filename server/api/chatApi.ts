import { Message } from 'ai';
import { getModelProviderById } from './modelProviders';

// Default model ID if not specified by client
const DEFAULT_MODEL_ID = 'openai';

// Handle chat request from the client
export async function handleChatRequest(body: { 
  messages: Message[]; 
  modelId?: string;
}) {
  try {
    // Get model ID from request or use default
    const modelId = body.modelId || DEFAULT_MODEL_ID;
    
    // Get the requested model provider
    const modelProvider = getModelProviderById(modelId);
    
    // Check if model provider is found and available
    if (!modelProvider) {
      throw new Error(`Model provider '${modelId}' not found`);
    }
    
    if (!modelProvider.available) {
      throw new Error(`Model provider '${modelId}' is not available. API key might be missing.`);
    }
    
    // Get model instance
    const model = modelProvider.getModel();
    
    // Generate response from the AI model
    const response = await model.generateText({
      messages: body.messages,
      maxTokens: 1500,
    });
    
    // Return the response as a streaming response
    const headers = new Headers();
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    
    return new Response(response.textStream, {
      headers,
      status: 200,
    });
  } catch (error) {
    console.error('[API] Chat request error:', error);
    throw error;
  }
} 