import { z } from 'zod';

// Define the parameter types to match the zod schema
type WikipediaParams = {
  query: string;
};

const wikipedia = {
  id: 'wikipedia',
  name: 'Wikipedia',
  description: 'Useful for getting quick summaries from Wikipedia',
  inputSchema: z.object({
    query: z.string().describe('The topic to search on Wikipedia'),
  }),
  execute: async ({ query }: WikipediaParams) => {
    console.log('Searching Wikipedia for:', query);
    try {
      const encodedQuery = encodeURIComponent(query.replace(/ /g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedQuery}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Wikipedia API returned ${response.status}`);
      }

      const data = await response.json();
      console.log('Wikipedia data:', JSON.stringify(data));

      // Return a string result immediately
      const result = data.extract || 'No summary found';
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching from Wikipedia:', error);
      // Return error message immediately
      return `Error: Could not fetch Wikipedia summary - ${errorMessage}`;
    }
  },
};

export { wikipedia };
