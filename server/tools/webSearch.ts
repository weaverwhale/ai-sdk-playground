import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';

type WebSearchParameters = {
  prompt: string;
};

const webSearch = {
  id: 'webSearch',
  name: 'Web Search',
  description: 'Search the web for information',
  inputSchema: z.object({
    prompt: z.string().describe('The prompt to search the web for'),
  }),
  execute: async ({ prompt }: WebSearchParameters) => {
    // Use the webSearchPreview tool to search the web for information
    const { text } = await generateText({
      model: openai.responses('gpt-4o-mini'),
      prompt: prompt,
      tools: {
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: 'medium',
        }),
      },
    });

    return text;
  },
};

export { webSearch };
