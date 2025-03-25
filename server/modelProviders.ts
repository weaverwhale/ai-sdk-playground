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
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini (OpenAI)',
    available: checkApiKey(process.env.OPENAI_API_KEY, 'OPENAI'),
    model: openai('gpt-4o-mini'),
    defaultSystemPrompt,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o (OpenAI)',
    available: checkApiKey(process.env.OPENAI_API_KEY, 'OPENAI'),
    model: openai('gpt-4o'),
    defaultSystemPrompt,
  },
  // {
  //   id: 'o3-mini',
  //   name: 'o3 Mini (OpenAI)',
  //   available: checkApiKey(process.env.OPENAI_API_KEY, 'OPENAI'),
  //   model: openai('o3-mini'),
  //   defaultSystemPrompt
  // },
  {
    id: 'gpt-4.5-preview',
    name: 'GPT-4.5 Preview (OpenAI)',
    available: checkApiKey(process.env.OPENAI_API_KEY, 'OPENAI'),
    model: openai('gpt-4.5-preview'),
    defaultSystemPrompt,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet (Anthropic)',
    available: checkApiKey(process.env.ANTHROPIC_API_KEY, 'ANTHROPIC'),
    model: anthropic('claude-3-5-sonnet-latest'),
    defaultSystemPrompt,
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet (Anthropic)',
    available: checkApiKey(process.env.ANTHROPIC_API_KEY, 'ANTHROPIC'),
    model: anthropic('claude-3-7-sonnet-latest'),
    defaultSystemPrompt,
  },
  {
    id: 'groq-llama-3-8b-8192',
    name: 'Llama 3.8B (Groq)',
    available: checkApiKey(process.env.GROQ_API_KEY, 'GROQ'),
    model: groq('llama3-8b-8192'),
    defaultSystemPrompt,
  },
  {
    id: 'groq-qwen-2.5-32b',
    name: 'Qwen 2.5 32B (Groq)',
    available: checkApiKey(process.env.GROQ_API_KEY, 'GROQ'),
    model: groq('qwen-2.5-32b'),
    defaultSystemPrompt,
  },
  // {
  //   id: 'groq-qwen-32b-instruct',
  //   name: 'Qwen 32B (Groq)',
  //   available: checkApiKey(process.env.GROQ_API_KEY, 'GROQ'),
  //   model: groq('qwen-32b-instruct'),
  //   defaultSystemPrompt
  // },
  {
    id: 'groq-gemma-2-9b-it',
    name: 'Gemma 2 9B (Groq)',
    available: checkApiKey(process.env.GROQ_API_KEY, 'GROQ'),
    model: groq('gemma2-9b-it'),
    defaultSystemPrompt,
  },
  // {
  //   id: 'deepseek-r1-distill-llama-70b',
  //   name: 'R1 Distill Llama 70B (DeepSeek)',
  //   available: checkApiKey(process.env.DEEPSEEK_API_KEY, 'DEEPSEEK'),
  //   model: deepseek('r1-distill-llama-70b'),
  //   defaultSystemPrompt
  // },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat (DeepSeek)',
    available: checkApiKey(process.env.DEEPSEEK_API_KEY, 'DEEPSEEK'),
    model: deepseek('deepseek-chat'),
    defaultSystemPrompt:
      'You are a helpful AI assistant powered by DeepSeek. You can help with getting information about weather and location, and telling the current time.',
  },
  {
    id: 'cerebras-llama-3-3-70b',
    name: 'Llama 3.3 70B (Cerebras)',
    available: checkApiKey(process.env.CEREBRAS_API_KEY, 'CEREBRAS'),
    model: cerebras('llama-3.3-70b'),
    defaultSystemPrompt,
  },
  {
    id: 'gemini-flash',
    name: 'Gemini 2.0 Flash (Google)',
    available: checkApiKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY, 'GEMINI'),
    model: google('gemini-2.0-flash'),
    defaultSystemPrompt,
  },
  // {
  //   id: 'gemini-vertex',
  //   name: 'Gemini 2.0 Flash Vertex (Google)',
  //   available: true,
  //   model: vertex('gemini-2.0-flash-001'),
  //   defaultSystemPrompt
  // }
];

export function getModelProviderById(id: string): ModelProvider | undefined {
  return modelProviders.find((provider) => provider.id === id);
}

export function getAvailableModelProviders(): ModelProvider[] {
  return modelProviders.filter((provider) => provider.available);
}
