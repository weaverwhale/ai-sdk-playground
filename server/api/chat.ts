import { generateText, streamText, type UIMessage, convertToModelMessages, stepCountIs } from 'ai';
import { getModelProviderById } from '../modelProviders';
import { tools, geminiTools } from '../tools';
import { ChatMessage, storeChatToMemory, searchChatMemory } from '../chatMemory';

const DEFAULT_MODEL_ID = 'gpt-4.1-mini';

// Define an interface for ChatRequest to include userId
interface ChatRequest {
  messages: UIMessage[];
  modelId?: string;
  stream?: boolean;
  userId?: string; // Add userId to track conversation history
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

    // Get the messages with system prompt - this is the core functionality
    // The memory context is optional and shouldn't break the main chat flow
    let messagesWithSystem = [];

    try {
      // Main path: Try to include memory if userId is provided
      if (userId !== 'anonymous' && body.messages.length > 0) {
        try {
          // Get the latest user message to use as query
          const lastUserMessage = [...body.messages]
            .reverse()
            .find((m: UIMessage) => m.role === 'user');

          const lastUserContent = lastUserMessage
            ? lastUserMessage.parts
                ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                ?.map((part) => part.text)
                ?.join('') || ''
            : '';

          if (lastUserMessage && lastUserContent) {
            console.log(
              `[API] Searching memory for user ${userId} with query: ${lastUserContent.substring(
                0,
                50,
              )}...`,
            );

            try {
              // Search for relevant memories with a try-catch wrapping the entire operation
              let memories;
              try {
                // Call the memory search function with a string return type
                // This should help handle potential parsing errors in the function
                const memorySearchResult = await searchChatMemory(userId, lastUserContent, 5);

                // Defensive parsing for memory search results
                if (typeof memorySearchResult === 'string') {
                  try {
                    // Try to parse if it's a string
                    memories = JSON.parse(memorySearchResult);
                  } catch {
                    // Continue without memories
                  }
                } else if (Array.isArray(memorySearchResult)) {
                  // Already an array, use directly
                  memories = memorySearchResult;
                } else if (memorySearchResult && typeof memorySearchResult === 'object') {
                  // Check if it's an object with a results property
                  if (Array.isArray(memorySearchResult.results)) {
                    memories = memorySearchResult.results;
                  } else {
                    memories = [];
                  }
                } else {
                  memories = [];
                }
              } catch {
                // Ensure we have a valid (empty) array even on error
                memories = [];
              }

              // Safety check on memories - ensure it's always an array for safety
              memories = Array.isArray(memories) ? memories : [];

              if (memories.length > 0) {
                try {
                  // Get previous exchanges to avoid duplication
                  const recentExchanges = new Set<string>();

                  // Add the last exchanges to the set to avoid repeating recent content
                  for (
                    let i = body.messages.length - 1, count = 0;
                    i >= 0 && count < 6;
                    i--, count++
                  ) {
                    const msg = body.messages[i];
                    const msgContent =
                      msg.parts
                        ?.filter(
                          (part): part is { type: 'text'; text: string } => part.type === 'text',
                        )
                        ?.map((part) => part.text)
                        ?.join('') || '';

                    if (msg && msgContent) {
                      recentExchanges.add(msgContent.trim());
                    }
                  }

                  // Filter out memories that match any recent messages
                  // Additional safety: Skip any memories that don't have expected properties
                  const filteredMemories = memories.filter((memory) => {
                    try {
                      // Safely extract content from memory string (format: "role: content")
                      if (!memory) {
                        return false;
                      }

                      // Verify this is an object with a content property
                      if (typeof memory !== 'object' || !memory.content) {
                        return false;
                      }

                      // Ensure content is a string
                      if (typeof memory.content !== 'string') {
                        return false;
                      }

                      const contentParts = memory.content.split(': ');
                      // If we can't properly split the content, skip this memory
                      if (contentParts.length < 2) {
                        return false;
                      }

                      const memoryRole = contentParts[0];
                      const memoryContent = contentParts.slice(1).join(': ').trim();

                      // Skip empty content
                      if (!memoryContent) {
                        return false;
                      }

                      // Check if this memory content matches any recent exchange
                      for (const recentContent of recentExchanges) {
                        // Skip if recentContent is invalid
                        if (!recentContent) continue;

                        if (memoryContent === recentContent) {
                          return false;
                        }
                      }

                      // Don't include assistant memories after a tool call in response to a new question
                      // This prevents showing the previous tool response as part of the new response
                      if (
                        memoryRole === 'assistant' &&
                        (memoryContent.includes('✅') || memoryContent.includes('Calling'))
                      ) {
                        return false;
                      }

                      return true;
                    } catch (error) {
                      console.error('[API] Error filtering memory:', error);
                      // When in doubt, skip the memory to avoid problems
                      return false;
                    }
                  });

                  if (filteredMemories.length > 0) {
                    console.log(
                      `[Memory] Found ${filteredMemories.length} memories for user ${userId}`,
                    );

                    try {
                      // Generate memory context string safely with better error reporting
                      const memoryItems = [];
                      for (const memory of filteredMemories) {
                        try {
                          if (memory && memory.content) {
                            memoryItems.push(`- ${memory.content}`);
                          }
                        } catch (memItemErr) {
                          console.error('[API] Error processing memory item:', memItemErr);
                          // Skip problematic items
                        }
                      }

                      // Only add context if we have valid items
                      if (memoryItems.length > 0) {
                        memoryContext =
                          '\n\nRelevant information from previous conversations:\n' +
                          memoryItems.join('\n');
                      }
                    } catch {
                      memoryContext = ''; // Reset on error
                    }
                  }
                } catch {
                  // Continue without memories
                }
              }
            } catch {
              // Continue without memories
            }
          }
        } catch {
          // Continue without memories
        }
      }
    } catch {
      memoryContext = '';
    }

    // Always add the system message to the beginning of the messages array
    // This part should never fail
    try {
      const systemPrompt =
        modelProvider.defaultSystemPrompt +
        (memoryContext || '') +
        (modelId.includes('qwen') ? '\n\n/no_think' : '');

      messagesWithSystem = [
        {
          role: 'system',
          id: `system-${Date.now()}`,
          parts: [{ type: 'text', text: systemPrompt }],
        } as UIMessage,
        ...body.messages,
      ];
    } catch (systemError) {
      console.error('[API] Error adding system prompt:', systemError);
      // Fallback to just the messages without system prompt in case of error
      messagesWithSystem = [...body.messages];
    }

    // Select appropriate tools based on model
    const computedTools = modelId.includes('gemini') ? geminiTools : tools;

    // Process the request with the model
    let result;
    if (isStream) {
      try {
        result = streamText({
          model,
          tools: computedTools,
          messages: convertToModelMessages(messagesWithSystem),
          maxOutputTokens: 5000,
          stopWhen: stepCountIs(10),
        });

        console.log('[API] StreamText result created successfully');
      } catch (streamError) {
        console.error(`[API] Stream error with model ${modelId}:`, streamError);
        throw streamError;
      }

      // Store the conversation in memory in the background - failures here are non-critical
      if (userId !== 'anonymous') {
        try {
          // Convert Message[] to ChatMessage[] as required by storeChatToMemory
          const chatMessages = body.messages.map((msg) => ({
            role:
              msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
                ? msg.role
                : 'system',
            content:
              msg.parts
                ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                ?.map((part) => part.text)
                ?.join('') || '',
            ...(msg.id ? { id: msg.id } : {}),
          })) as ChatMessage[];

          // Use a promise with a timeout to prevent long-running memory operations
          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Memory storage timed out')), 5000);
          });

          // Race the storage against the timeout
          Promise.race([storeChatToMemory(userId, chatMessages), timeoutPromise]).catch(
            (err: Error) => {
              console.error('[API] Error storing chat to memory:', err);
            },
          );
        } catch (err) {
          console.error('[API] Error preparing chat for memory storage:', err);
        }
      }

      return result.toUIMessageStreamResponse();
    } else {
      try {
        result = await generateText({
          model,
          tools: computedTools,
          messages: convertToModelMessages(messagesWithSystem),
          stopWhen: stepCountIs(10),
        });
      } catch (generateError) {
        console.error(`[API] Generate text error with model ${modelId}:`, generateError);
        throw generateError;
      }

      // Store the conversation in memory in the background - failures here are non-critical
      if (userId !== 'anonymous') {
        try {
          // Convert Message[] to ChatMessage[] as required by storeChatToMemory
          const chatMessages = body.messages.map((msg) => ({
            role:
              msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
                ? msg.role
                : 'system',
            content:
              msg.parts
                ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                ?.map((part) => part.text)
                ?.join('') || '',
            ...(msg.id ? { id: msg.id } : {}),
          })) as ChatMessage[];

          // Use a promise with a timeout to prevent long-running memory operations
          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Memory storage timed out')), 5000);
          });

          // Race the storage against the timeout
          Promise.race([storeChatToMemory(userId, chatMessages), timeoutPromise]).catch(
            (err: Error) => {
              console.error('[API] Error storing chat to memory:', err);
            },
          );
        } catch (err) {
          console.error('[API] Error preparing chat for memory storage:', err);
        }
      }

      return result;
    }
  } catch (error) {
    console.error('[API] Chat request error:', error);
    throw error;
  }
}
