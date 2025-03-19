import { Message } from 'ai';
import { getModelProviderById } from '../modelProviders';
import { streamText } from 'ai';
import { tools as toolsArray } from '../tools';

const DEFAULT_MODEL_ID = 'openai';

// Convert tools from array to object with tool names as keys
const toolsObject = toolsArray.reduce((acc, tool) => {
  acc[tool.name] = tool;
  return acc;
}, {} as Record<string, typeof toolsArray[0]>);

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
      maxTokens: 5000,
      tools: toolsObject,
      experimental_continueSteps: true,
      maxSteps: 10
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[API] Chat request error:', error);
    throw error;
  }
} 