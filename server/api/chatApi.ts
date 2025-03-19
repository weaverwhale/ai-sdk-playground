import { Message } from 'ai';
import { getModelProviderById } from '../modelProviders';

const DEFAULT_MODEL_ID = 'openai';

export async function handleChatRequest(body: { 
  messages: Message[]; 
  modelId?: string;
}) {
  try {
    const modelId = body.modelId || DEFAULT_MODEL_ID;
    const modelProvider = getModelProviderById(modelId);
    
    if (!modelProvider) {
      throw new Error(`Model provider '${modelId}' not found`);
    }
    
    if (!modelProvider.available) {
      throw new Error(`Model provider '${modelId}' is not available. API key might be missing.`);
    }
    
    const model = modelProvider.getModel();
    const response = await model.generateText({
      messages: body.messages,
      maxTokens: 1500,
    });
    
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