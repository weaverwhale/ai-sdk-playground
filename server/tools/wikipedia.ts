import { z } from 'zod';

// Define the parameter types to match the zod schema
type WikipediaParams = {
  query: string;
};

const wikipedia = {
  id: 'wikipedia',
  name: 'Wikipedia',
  description: 'Useful for getting quick summaries from Wikipedia',
  parameters: z.object({
    query: z.string().describe('The topic to search on Wikipedia'),
  }),
  execute: async ({ query }: WikipediaParams) => {
    console.log('Searching Wikipedia for:', query);
    try {
      const encodedQuery = encodeURIComponent(query.replace(/ /g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedQuery}`;
      const response = await fetch(url);
      const data = await response.json();
      return data.extract;
    } catch (error) {
      console.error('Error fetching from Wikipedia:', error);
      return 'Error: Could not fetch Wikipedia summary';
    }
  },
};

export { wikipedia }; 