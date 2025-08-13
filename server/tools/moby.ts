import { z } from 'zod';
import dotenv from 'dotenv';
import { v4 as uuidV4 } from 'uuid';

dotenv.config();

const MOBY_TLD = 'http://willy.srv.whale3.io';
const MOBY_ENDPOINT = `${MOBY_TLD}/answer-nlq-question`;

// Define the parameter types to match the zod schema
type MobyParams = {
  question: string;
  shopId?: string;
  parentMessageId?: string;
};

const moby = {
  id: 'moby',
  name: 'Moby',
  description: "Useful for getting e-commerce analytics and insights from Triple Whale's AI, Moby.",
  inputSchema: z.object({
    question: z
      .string()
      .describe('Question to ask Triple Whale Moby')
      .default('What is triple whale?'),
    shopId: z
      .string()
      .optional()
      .describe('Shopify store URL')
      .default('madisonbraids.myshopify.com'),
    parentMessageId: z.string().optional().describe('Parent message ID for conversation context'),
  }),
  execute: async ({ question, shopId, parentMessageId }: MobyParams) => {
    console.log('[API] Executing moby tool with params:', question, shopId);

    try {
      const response = await fetch(MOBY_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          stream: false,
          shopId: shopId,
          conversationId: (parentMessageId || uuidV4()).toString(),
          source: 'chat',
          dialect: 'clickhouse',
          userId: 'test-user',
          additionalShopIds: [],
          question: question,
          query: question,
          generateInsights: true,
          isOutsideMainChat: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const lastMessageText = data.messages?.[data.messages.length - 1]?.text + ' ';

      return lastMessageText || 'No answer received from Moby. ';
    } catch (error) {
      console.error('Error querying Moby:', error);
      return 'Error: Could not fetch response from Triple Whale. ';
    }
  },
};

export { moby };
