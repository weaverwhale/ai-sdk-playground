import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { z } from 'zod';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function getLocation() {
  return { lat: 37.7749, lon: -122.4194 };
}

function getWeather(lat: number, lon: number, unit: 'C' | 'F') {
  // This is a simple function - in a real app, you would call a weather API
  const value = unit === 'C' ? 25 : 77;
  return { value, description: 'Sunny' };
}

function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString();
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
    tools: {
      getLocation: {
        description: 'Get the location of the user',
        parameters: z.object({}),
        execute: async () => {
          console.log('[API] Executing getLocation tool');
          const { lat, lon } = getLocation();
          return `Your location is at latitude ${lat} and longitude ${lon}`;
        },
      },
      getWeather: {
        description: 'Get the weather for a location',
        parameters: z.object({
          lat: z.number().describe('The latitude of the location'),
          lon: z.number().describe('The longitude of the location'),
          unit: z
            .enum(['C', 'F'])
            .describe('The unit to display the temperature in'),
        }),
        execute: async ({ lat, lon, unit }) => {
          console.log(`[API] Executing getWeather tool with params: lat=${lat}, lon=${lon}, unit=${unit}`);
          const { value, description } = getWeather(lat, lon, unit);
          return `It is currently ${value}°${unit} and ${description}!`;
        },
      },
      getCurrentTime: {
        description: 'Get the current time',
        parameters: z.object({}),
        execute: async () => {
          console.log('[API] Executing getCurrentTime tool');
          const time = getCurrentTime();
          return `The current time is ${time}`;
        },
      },
    },
  });
} 