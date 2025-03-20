import type { LanguageModelV1 } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { groq } from '@ai-sdk/groq';
import { deepseek } from '@ai-sdk/deepseek';
import { cerebras } from '@ai-sdk/cerebras';
import { google } from '@ai-sdk/google';
// import { createVertex } from '@ai-sdk/google-vertex';
import { defaultSystemPrompt } from './prompt';

// const vertex = createVertex({
//   project: 'shofifi',
//   location: 'us-east5',
// })

export interface ModelProvider {
  id: string;
  name: string;
  available: boolean;
  model: LanguageModelV1;
  defaultSystemPrompt: string;
}

const checkApiKey = (key: string | undefined, provider: string): boolean => {
  const exists = !!key;
  if (!exists) {
    console.warn(`[API] ${provider}_API_KEY is not set in environment variables`);
  }
  return exists;
};

export const modelProviders: ModelProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o Mini)',
    available: checkApiKey(process.env.OPENAI_API_KEY, 'OPENAI'),
    model: openai('gpt-4o-mini'),
    defaultSystemPrompt
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude 3.5 Sonnet)',
    available: checkApiKey(process.env.ANTHROPIC_API_KEY, 'ANTHROPIC'),
    model: anthropic('claude-3-5-sonnet-latest'),
    defaultSystemPrompt
  },
  {
    id: 'groq',
    name: 'Groq (Llama 3)',
    available: checkApiKey(process.env.GROQ_API_KEY, 'GROQ'),
    model: groq('llama3-8b-8192'),
    defaultSystemPrompt
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (DeepSeek Chat)',
    available: checkApiKey(process.env.DEEPSEEK_API_KEY, 'DEEPSEEK'),
    model: deepseek('deepseek-chat'),
    defaultSystemPrompt: 'You are a helpful AI assistant powered by DeepSeek. You can help with getting information about weather and location, and telling the current time.',
  },
  {
    id: 'cerebras',
    name: 'Llama 3.3 70B (Cerebras)',
    available: checkApiKey(process.env.CEREBRAS_API_KEY, 'CEREBRAS'),
    model: cerebras('llama-3.3-70b'),
    defaultSystemPrompt
  },
  {
    id: 'gemini',
    name: 'Google (Gemini 2.0 Flash)',
    available: checkApiKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY, 'GEMINI'),
    model: google('gemini-2.0-flash'),
    defaultSystemPrompt
  },
  // {
  //   id: 'gemini-vertex',
  //   name: 'Google (Gemini 2.0 Flash Vertex)',
  //   available: true,
  //   model: vertex('gemini-2.0-flash-001'),
  //   defaultSystemPrompt
  // }
];

export function getModelProviderById(id: string): ModelProvider | undefined {
  return modelProviders.find(provider => provider.id === id);
}

export function getAvailableModelProviders(): ModelProvider[] {
  return modelProviders.filter(provider => provider.available);
}