import { generateText, streamText, type Message } from 'ai';
import { getModelProviderById } from '../modelProviders';
import { tools, geminiTools } from '../tools';
import { ChatMessage, storeChatToMemory, searchChatMemory } from '../chatMemory';

const DEFAULT_MODEL_ID = 'openai';

// Define an interface for ChatRequest to include userId
interface ChatRequest {
  messages: Message[];
  modelId?: string;
  stream?: boolean;
  userId?: string; // Add userId to track conversation history
}

// Also define a strongly typed interface for Memory results
interface MemoryResult {
  id: string;
  userId: string;
  content: string;
  source: string;
  timestamp: string;
  similarity: number;
}

export async function handleChatRequest(body: ChatRequest) {
  try {
    const isStream = body.stream !== false;
    const modelId = body.modelId || DEFAULT_MODEL_ID;
    const userId = body.userId && body.userId.trim() ? body.userId : 'anonymous';
    const modelProvider = getModelProviderById(modelId);

    if (!modelProvider) {
      throw new Error(`Model provider '${modelId}' not found`);
    }

    if (!modelProvider.available) {
      throw new Error(`Model provider '${modelId}' is not available. API key might be missing.`);
    }

    const model = modelProvider.model;

    // If we have a non-anonymous userId, search for relevant memories
    let memoryContext = '';
    if (userId !== 'anonymous' && body.messages.length > 0) {
      try {
        // Get the latest user message to use as query
        const lastUserMessage = [...body.messages]
          .reverse()
          .find((m: Message) => m.role === 'user');

        if (lastUserMessage) {
          console.log(
            `[API] Searching memory for user ${userId} with query: ${lastUserMessage.content.substring(
              0,
              50,
            )}...`,
          );

          // Search for relevant memories
          const memories = (await searchChatMemory(
            userId,
            lastUserMessage.content,
            5,
          )) as MemoryResult[];

          if (memories && memories.length > 0) {
            console.log(`[API] Found ${memories.length} initial memories before filtering`);

            // Filter out memories that are the exact same as the most recent message
            // Only filter out the exact same content as the current message to avoid over-filtering
            const filteredMemories = memories.filter((memory) => {
              // Extract content from memory string (format: "role: content")
              const contentParts = memory.content.split(': ');
              if (contentParts.length < 2) return true;

              const memoryContent = contentParts.slice(1).join(': ');

              // Log the memory content being compared
              console.log(
                `[API] Comparing memory: "${memoryContent.substring(
                  0,
                  30,
                )}..." with message: "${lastUserMessage.content.substring(0, 30)}..."`,
              );

              // Only filter out exact matches to the most recent message
              // This helps prevent echoing back only the most recent message
              return lastUserMessage.content.trim() !== memoryContent.trim();
            });

            if (filteredMemories.length > 0) {
              memoryContext =
                '\n\nRelevant information from previous conversations:\n' +
                filteredMemories.map((m: MemoryResult) => `- ${m.content}`).join('\n');

              console.log(
                `[API] Using ${filteredMemories.length} memories for context after filtering`,
              );
              console.log(`[API] Memory context:\n${memoryContext}`);
            } else {
              console.log(`[API] No relevant memories found after filtering for user ${userId}`);
            }
          } else {
            console.log(`[API] No relevant memories found for user ${userId}`);
          }
        }
      } catch (memoryError) {
        console.error('[API] Error searching memory:', memoryError);
      }
    }

    // Add the system message to the beginning of the messages array
    const systemPrompt = modelProvider.defaultSystemPrompt + (memoryContext ? memoryContext : '');
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt } as Message,
      ...body.messages,
    ];

    const computedTools = modelId === 'gemini' ? geminiTools : tools;

    // Process the request with the model
    let result;
    if (isStream) {
      result = streamText({
        model,
        tools: computedTools,
        messages: messagesWithSystem,
        maxTokens: 5000,
        experimental_continueSteps: true,
        maxSteps: 10,
      });

      // Store the conversation in memory in the background
      if (userId !== 'anonymous') {
        // Convert Message[] to ChatMessage[] as required by storeChatToMemory
        const chatMessages = body.messages.map((msg) => ({
          role:
            msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
              ? msg.role
              : 'system',
          content: msg.content || '',
          ...(msg.id ? { id: msg.id } : {}),
        })) as ChatMessage[];

        storeChatToMemory(userId, chatMessages).catch((err: Error) =>
          console.error('[API] Error storing chat to memory:', err),
        );
      }

      return result.toDataStreamResponse();
    } else {
      result = await generateText({
        model,
        tools: computedTools,
        messages: messagesWithSystem,
      });

      // Store the conversation in memory in the background
      if (userId !== 'anonymous') {
        // Convert Message[] to ChatMessage[] as required by storeChatToMemory
        const chatMessages = body.messages.map((msg) => ({
          role:
            msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
              ? msg.role
              : 'system',
          content: msg.content || '',

          ...(msg.id ? { id: msg.id } : {}),
        })) as ChatMessage[];

        storeChatToMemory(userId, chatMessages).catch((err: Error) =>
          console.error('[API] Error storing chat to memory:', err),
        );
      }

      return result;
    }
  } catch (error) {
    console.error('[API] Chat request error:', error);
    throw error;
  }
}
