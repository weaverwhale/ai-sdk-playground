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
            .find((m: Message) => m.role === 'user');

          if (lastUserMessage && lastUserMessage.content) {
            console.log(
              `[API] Searching memory for user ${userId} with query: ${lastUserMessage.content.substring(
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
                const memorySearchResult = await searchChatMemory(
                  userId,
                  lastUserMessage.content,
                  5,
                );

                console.log(`[API] Memory search result type: ${typeof memorySearchResult}`);

                // Defensive parsing for memory search results
                if (typeof memorySearchResult === 'string') {
                  try {
                    // Try to parse if it's a string
                    memories = JSON.parse(memorySearchResult);
                    console.log(`[API] Parsed memory search results from string`);
                  } catch (parseErr) {
                    console.error('[API] Failed to parse memory search results:', parseErr);
                    memories = [];
                  }
                } else if (Array.isArray(memorySearchResult)) {
                  // Already an array, use directly
                  memories = memorySearchResult;
                  console.log(`[API] Memory search returned array directly`);
                } else if (memorySearchResult && typeof memorySearchResult === 'object') {
                  // Check if it's an object with a results property
                  if (Array.isArray(memorySearchResult.results)) {
                    memories = memorySearchResult.results;
                    console.log(`[API] Extracted results array from memory search object`);
                  } else {
                    console.log(
                      `[API] Memory search returned object without results array`,
                      memorySearchResult,
                    );
                    memories = [];
                  }
                } else {
                  console.log(
                    `[API] Memory search returned unexpected result type:`,
                    memorySearchResult,
                  );
                  memories = [];
                }
              } catch (memoryCriticalError) {
                console.error('[API] Critical error in memory search:', memoryCriticalError);
                // Ensure we have a valid (empty) array even on error
                memories = [];
              }

              // Safety check on memories - ensure it's always an array for safety
              memories = Array.isArray(memories) ? memories : [];

              // Log memory count after normalization
              console.log(`[API] Processing ${memories.length} memories after normalization`);

              if (memories.length > 0) {
                console.log(`[API] Found ${memories.length} initial memories before filtering`);

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
                    if (msg && msg.content) {
                      recentExchanges.add(msg.content.trim());
                    }
                  }

                  console.log(
                    `[API] Identified ${recentExchanges.size} recent exchanges to avoid repeating`,
                  );

                  // Filter out memories that match any recent messages
                  // Additional safety: Skip any memories that don't have expected properties
                  const filteredMemories = memories.filter((memory) => {
                    try {
                      // Safely extract content from memory string (format: "role: content")
                      if (!memory) {
                        console.log('[API] Skipping null or undefined memory item');
                        return false;
                      }

                      // Verify this is an object with a content property
                      if (typeof memory !== 'object' || !memory.content) {
                        console.log(
                          '[API] Skipping memory without content property:',
                          typeof memory === 'object' ? JSON.stringify(memory) : String(memory),
                        );
                        return false;
                      }

                      // Ensure content is a string
                      if (typeof memory.content !== 'string') {
                        console.log('[API] Memory has non-string content:', typeof memory.content);
                        return false;
                      }

                      const contentParts = memory.content.split(': ');
                      // If we can't properly split the content, skip this memory
                      if (contentParts.length < 2) {
                        console.log('[API] Memory has invalid format, skipping:', memory.content);
                        return false;
                      }

                      const memoryRole = contentParts[0];
                      const memoryContent = contentParts.slice(1).join(': ').trim();

                      // Skip empty content
                      if (!memoryContent) {
                        console.log('[API] Memory has empty content, skipping');
                        return false;
                      }

                      // Check if this memory content matches any recent exchange
                      for (const recentContent of recentExchanges) {
                        // Skip if recentContent is invalid
                        if (!recentContent) continue;

                        if (memoryContent === recentContent) {
                          console.log(
                            `[API] Filtering out memory that matches recent exchange: ${memoryContent.substring(
                              0,
                              30,
                            )}...`,
                          );
                          return false;
                        }
                      }

                      // Don't include assistant memories after a tool call in response to a new question
                      // This prevents showing the previous tool response as part of the new response
                      if (
                        memoryRole === 'assistant' &&
                        (memoryContent.includes('✅') || memoryContent.includes('Calling'))
                      ) {
                        console.log(
                          `[API] Filtering out tool response memory: ${memoryContent.substring(
                            0,
                            30,
                          )}...`,
                        );
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
                        console.log(
                          `[API] Using ${memoryItems.length} memories for context after filtering`,
                        );
                        console.log(`[API] Memory context:\n${memoryContext}`);
                      } else {
                        console.log(`[API] No valid memory items found after filtering`);
                      }
                    } catch (formatError) {
                      console.error('[API] Error formatting memory context:', formatError);
                      memoryContext = ''; // Reset on error
                    }
                  } else {
                    console.log(
                      `[API] No relevant memories found after filtering for user ${userId}`,
                    );
                  }
                } catch (filterError) {
                  console.error('[API] Error in memory filtering process:', filterError);
                  // Continue without memory context
                }
              } else {
                console.log(`[API] No relevant memories found for user ${userId}`);
              }
            } catch (searchError) {
              console.error('[API] Error searching memories:', searchError);
              // Continue without memory context
            }
          }
        } catch (memoryError) {
          console.error('[API] Error in memory processing:', memoryError);
          // Continue without memories
        }
      }
    } catch (contextError) {
      console.error('[API] Critical error in memory context generation:', contextError);
      // If we fail completely, continue with empty memory context
      memoryContext = '';
    }

    // Always add the system message to the beginning of the messages array
    // This part should never fail
    try {
      const systemPrompt = modelProvider.defaultSystemPrompt + (memoryContext || '');
      messagesWithSystem = [{ role: 'system', content: systemPrompt } as Message, ...body.messages];
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
          messages: messagesWithSystem,
          maxTokens: 5000,
          experimental_continueSteps: true,
          maxSteps: 10,
        });
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
            content: msg.content || '',
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

      return result.toDataStreamResponse();
    } else {
      try {
        result = await generateText({
          model,
          tools: computedTools,
          messages: messagesWithSystem,
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
            content: msg.content || '',
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
