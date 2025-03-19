import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { tools } from '../tools';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Handle a chat request and return a stream of text.
 */
export async function handleChatRequest(messages: Message[]) {
  console.log('[API] Processing chat request with messages:', messages);
  
  // Add logging to check environment variables
  console.log('[API] OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('[API] OPENAI_API_KEY environment variable is not set!');
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  
  // Configure the OpenAI client with the API key from environment
  const model = openai('gpt-4o');
  
  return streamText({
    model,
    system: 'You are a helpful assistant. You can help with getting information about weather and location, and telling the current time.',
    messages,
    tools,
  });
} 