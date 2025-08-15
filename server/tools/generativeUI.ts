import { z } from 'zod';
import { generateText, ModelMessage } from 'ai';
import { getModelProviderById } from '../modelProviders';
import { generativeUiToolPrompt } from '../prompts';

const UI_GENERATION_MODEL_ID = 'claude-3-7-sonnet';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
});

type GenerativeUiParams = {
  description: string;
  conversationHistory: ModelMessage[];
};

const generativeUi = {
  id: 'generativeUi',
  name: 'Generative UI',
  description:
    'Generates React JSX markup based on a description and conversation history, suitable for rendering dynamic UI elements. Uses Tailwind CSS for styling.', // Updated description
  inputSchema: z.object({
    description: z
      .string()
      .describe(
        'A detailed natural language description of the desired UI component, including data or context if applicable. Specify desired layout, elements, and styling instructions (Tailwind). This will be treated as the final user message.',
      ),
    conversationHistory: z
      .array(messageSchema) // Validate as an array of messages
      .describe('The history of the conversation leading up to this UI generation request.'),
  }),
  execute: async ({
    description,
    conversationHistory = [],
  }: GenerativeUiParams): Promise<string> => {
    console.log(`[GenerativeUI Tool] Request received.`);

    try {
      const modelProvider = getModelProviderById(UI_GENERATION_MODEL_ID);
      if (!modelProvider || !modelProvider.available) {
        throw new Error(
          `UI Generation model provider '${UI_GENERATION_MODEL_ID}' is not available or configured. Check API keys.`,
        );
      }
      const model = modelProvider.model;
      const messages: ModelMessage[] = [
        { role: 'system', content: generativeUiToolPrompt },
        ...conversationHistory,
        { role: 'user', content: description },
      ];

      const { text } = await generateText({
        model: model,
        messages: messages,
      });

      const generatedJsx = text.trim();

      if (!generatedJsx) {
        throw new Error('LLM did not return UI content.');
      }

      if (!generatedJsx.startsWith('<') || !generatedJsx.endsWith('>')) {
        console.warn(
          `[GenerativeUI Tool] Output doesn't look like JSX: ${generatedJsx.substring(0, 100)}...`,
        );
      }

      console.log(`[GenerativeUI Tool] Generated JSX: ${generatedJsx.substring(0, 100)}...`);
      return generatedJsx;
    } catch (error) {
      console.error('[GenerativeUI Tool] Error generating UI:', error);
      return `Error generating UI: ${
        error instanceof Error ? error.message : 'An unknown error occurred'
      }`;
    }
  },
};

export { generativeUi };
