import { Message } from 'ai';
import { getModelProviderById } from '../modelProviders';
import { streamText } from 'ai';

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
    
    const model = modelProvider.model;
    
    // Add the system message to the beginning of the messages array
    const messagesWithSystem = [
      { role: 'system', content: modelProvider.defaultSystemPrompt } as Message,
      ...body.messages
    ];
    
    const result = streamText({
      model,
      messages: messagesWithSystem,
      maxTokens: 1500,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[API] Chat request error:', error);
    throw error;
  }
} 