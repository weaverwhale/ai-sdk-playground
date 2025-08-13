import { z } from 'zod';
import { initOpenator, ChatOpenAI } from 'openator';

const OPERATOR_MODEL_ID = 'gpt-4o';

type OperatorParams = {
  website: string;
  action: string;
};

const operator = {
  id: 'operator',
  name: 'Operator',
  description: 'Visit a website and perform an action.',
  inputSchema: z.object({
    website: z
      .string()
      .describe(
        'The website to visit. If not provided, the default is google.com. Should be a valid URL.',
      ),
    action: z.string().describe('The action to perform on the website.'),
  }),
  execute: async ({ website, action }: OperatorParams) => {
    console.log(`[Operator Tool] Request received. Visiting ${website} and performing "${action}"`);

    try {
      const llm = new ChatOpenAI({
        model: OPERATOR_MODEL_ID,
        apiKey: process.env.OPENAI_API_KEY || '',
      });

      const openator = initOpenator({
        llm,
        headless: false,
      });

      const result = await openator.start(website || 'https://google.com', action);
      console.log(`[Operator Tool] Result: ${JSON.stringify(result)}`);

      return result;
    } catch (error) {
      console.error('[Operator Tool] Error:', error);
      return `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`;
    }
  },
};

export { operator };
