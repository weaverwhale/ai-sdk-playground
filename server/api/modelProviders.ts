import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { groq } from '@ai-sdk/groq';
import { deepseek } from '@ai-sdk/deepseek';
import { cerebras } from '@ai-sdk/cerebras';
import { google } from '@ai-sdk/google';
import type { Message } from 'ai';

// Interface for AI model with generateText method
export interface AIModel {
  generateText(params: {
    messages: Message[];
    maxTokens?: number;
  }): Promise<{
    textStream: ReadableStream;
  }>;
}

// Check and log missing API keys
const checkApiKey = (key: string | undefined, provider: string): boolean => {
  const exists = !!key;
  if (!exists) {
    console.warn(`[API] ${provider}_API_KEY is not set in environment variables`);
  }
  return exists;
};

// Define available models with their configurations
export interface ModelProvider {
  id: string;
  name: string;
  available: boolean;
  getModel: () => AIModel;
  defaultSystemPrompt: string;
}

export const modelProviders: ModelProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o)',
    available: checkApiKey(process.env.OPENAI_API_KEY, 'OPENAI'),
    getModel: () => openai('gpt-4o') as unknown as AIModel,
    defaultSystemPrompt: 'You are a helpful assistant. You can help with getting information about weather and location, and telling the current time.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude 3 Opus)',
    available: checkApiKey(process.env.ANTHROPIC_API_KEY, 'ANTHROPIC'),
    getModel: () => anthropic('claude-3-opus-20240229') as unknown as AIModel,
    defaultSystemPrompt: 'You are Claude, a helpful AI assistant by Anthropic. You can help with getting information about weather and location, and telling the current time.',
  },
  {
    id: 'groq',
    name: 'Groq (Llama 3)',
    available: checkApiKey(process.env.GROQ_API_KEY, 'GROQ'),
    getModel: () => groq('llama3-8b-8192') as unknown as AIModel,
    defaultSystemPrompt: 'You are a helpful AI assistant running on Groq. You can help with getting information about weather and location, and telling the current time.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (DeepSeek Coder)',
    available: checkApiKey(process.env.DEEPSEEK_API_KEY, 'DEEPSEEK'),
    getModel: () => deepseek('deepseek-coder') as unknown as AIModel,
    defaultSystemPrompt: 'You are a helpful AI assistant powered by DeepSeek. You can help with getting information about weather and location, and telling the current time.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras (Cerebras-GPT)',
    available: checkApiKey(process.env.CEREBRAS_API_KEY, 'CEREBRAS'),
    getModel: () => cerebras('cerebras-gpt-1.0-13B') as unknown as AIModel,
    defaultSystemPrompt: 'You are a helpful AI assistant powered by Cerebras. You can help with getting information about weather and location, and telling the current time.',
  },
  {
    id: 'gemini',
    name: 'Google (Gemini 2.0 Flash)',
    available: checkApiKey(process.env.GEMINI_API_KEY, 'GEMINI'),
    getModel: () => google('models/gemini-2.0-flash-exp') as unknown as AIModel,
    defaultSystemPrompt: 'You are a helpful AI assistant powered by Google Gemini. You can help with getting information about weather and location, and telling the current time.',
  },
];

// Helper function to get a model provider by ID
export function getModelProviderById(id: string): ModelProvider | undefined {
  return modelProviders.find(provider => provider.id === id);
}

// Get available model providers
export function getAvailableModelProviders(): ModelProvider[] {
  return modelProviders.filter(provider => provider.available);
}

// Log available models at startup
console.log('[API] Available models:', getAvailableModelProviders().map(p => p.name).join(', ')); 