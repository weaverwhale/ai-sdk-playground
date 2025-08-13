import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage, ChatOnToolCallCallback } from 'ai';
import {
  ToolCall,
  UseChatbotMessagesProps,
  UseChatbotMessagesResult,
  ChatMessage,
} from '../types/chatTypes';
import { chatReducer } from './chatReducer';
import { useToolOptions } from './useToolOptions';
import { useChatScroll } from './useChatScroll';
import { useDeepSearch } from './useDeepSearch';

// Helper to extract text content from AI SDK UIMessage
function extractTextContent(message: UIMessage): string {
  if (!message.parts || !Array.isArray(message.parts)) {
    return '';
  }
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export function useChatbotMessages({
  selectedModel,
  isDeepSearchMode = false,
}: UseChatbotMessagesProps): UseChatbotMessagesResult {
  // Use our custom hooks
  const toolOptions = useToolOptions();

  // State management
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string>(Date.now().toString());

  // Use reducer for chat messages state
  const [chatState, dispatch] = useReducer(chatReducer, {
    chatMessages: [],
    currentConversationTurn: 0,
    toolExecutionMsgMap: new Map(),
  });

  // Extract values from state
  const { chatMessages } = chatState;

  // Create a ref to hold the current chat state for accessing in callbacks
  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;

  // Set up deep search hook
  const {
    createDeepSearchPlan,
    executeDeepSearchPlan,
    isCreatingPlan,
    isExecutingPlan,
    error: deepSearchError,
  } = useDeepSearch({
    orchestratorModel: selectedModel,
    workerModel: selectedModel,
    onPlanCreated: (plan) => {
      console.log('[DEEP SEARCH] Plan created, updating UI:', plan);
      dispatch({
        type: 'SET_SEARCH_PLAN',
        plan: plan,
        conversationTurn: chatStateRef.current.currentConversationTurn,
      });
    },
    onStepUpdate: (stepId, status, output, error, toolCalls) => {
      console.log(`[DEEP SEARCH] Step update: ${stepId} -> ${status}`);
      dispatch({
        type: 'UPDATE_PLAN_STEP',
        payload: {
          stepId,
          status,
          output,
          error,
          toolCalls,
        },
      });
    },
    onPlanCompleted: (plan) => {
      console.log('[DEEP SEARCH] Plan completed with summary:', plan.summary);
      if (plan.summary) {
        dispatch({
          type: 'ADD_ASSISTANT_MESSAGE',
          payload: {
            content: plan.summary,
            conversationTurn: plan.conversationTurn || chatStateRef.current.currentConversationTurn,
          },
        });

        hasAddedFinalResponseRef.current = true;

        dispatch({
          type: 'UPDATE_FINAL_RESPONSE',
          payload: {
            content: plan.summary,
            conversationTurn: chatStateRef.current.currentConversationTurn,
          },
        });
      }
    },
  });

  // Refs
  const isProcessingTool = useRef(false);
  const lastToolCallRef = useRef<ToolCall | null>(null);
  const hasAddedFinalResponseRef = useRef(false);
  const toolCallResponseRef = useRef('');
  const previousModelRef = useRef(selectedModel);
  const isReloadingRef = useRef(false);
  const messagesStateRef = useRef({
    length: 0,
    stringified: '',
  });

  // Function to reset internal state
  const resetInternalState = useCallback(() => {
    isProcessingTool.current = false;
    lastToolCallRef.current = null;
    hasAddedFinalResponseRef.current = false;
    toolCallResponseRef.current = '';
    dispatch({ type: 'CLEAR_CONVERSATION' });
  }, []);

  // Tool call handler - must be defined before useChat
  const handleToolCall: ChatOnToolCallCallback = useCallback(
    async ({ toolCall }) => {
      isProcessingTool.current = true;
      hasAddedFinalResponseRef.current = false;

      // We need to create a references to 'messages' that will be available in different scopes,
      // so we access the messages from the chatMessages state.
      let currentStreamContent = '';

      // Use the chatMessages array to find current content
      // Find the most recent assistant message in the current conversation turn
      const currentAssistantMsg = chatStateRef.current.chatMessages.find(
        (m: ChatMessage) =>
          m.role === 'assistant' &&
          !m.toolCalls?.length &&
          m.conversationTurn === chatStateRef.current.currentConversationTurn,
      );

      if (currentAssistantMsg) {
        currentStreamContent = currentAssistantMsg.content;
      }

      toolCallResponseRef.current = currentStreamContent;

      // Get the tool information
      const toolInfo = toolOptions[toolCall?.toolName || ''] || {
        name: toolCall?.toolName || 'AI Tool',
        description: 'Using tool to retrieve information',
        id: toolCall?.toolName || '',
      };

      // Create a tool call object
      const newToolCall: ToolCall = {
        name: toolInfo.name || toolCall?.toolName || '',
        input: toolCall?.input || {},
        status: 'running',
        description: toolInfo.description,
        displayName: toolInfo.name,
        id: `${Date.now()}-${toolCall?.toolName || 'tool'}-${Math.random()
          .toString(36)
          .substr(2, 5)}`,
      };

      // First, if we have any streamed content, make sure it's displayed
      if (currentStreamContent) {
        const existingMessage = chatStateRef.current.chatMessages.find(
          (m: ChatMessage) =>
            m.role === 'assistant' &&
            !m.isFinalResponse &&
            !m.toolCalls?.length &&
            m.conversationTurn === chatStateRef.current.currentConversationTurn,
        );

        if (!existingMessage) {
          // Add the pre-tool content as a message
          dispatch({
            type: 'ADD_ASSISTANT_MESSAGE',
            payload: {
              content: currentStreamContent,
              conversationTurn: chatStateRef.current.currentConversationTurn,
            },
          });
        }
      }

      // Add the tool call message - the reducer will handle storing the index
      dispatch({
        type: 'ADD_TOOL_CALL',
        payload: {
          toolCall: newToolCall,
          conversationTurn: chatStateRef.current.currentConversationTurn,
        },
      });

      // Save the current tool call for reference
      lastToolCallRef.current = newToolCall;
    },
    [toolOptions, dispatch],
  );

  // Error handler for chat - must be defined before useChat
  const handleChatError = useCallback((error: unknown) => {
    let errorMessage = 'Unknown error occurred';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    }

    setErrorDetails(errorMessage);
    isProcessingTool.current = false;

    // If there was an active tool call, mark it as errored
    if (lastToolCallRef.current && lastToolCallRef.current.id) {
      dispatch({
        type: 'UPDATE_TOOL_CALL',
        payload: {
          toolCallId: lastToolCallRef.current.id,
          status: 'error',
        },
      });
      lastToolCallRef.current = null;
    }
  }, []);

  // Create a new instance of the useChat hook for each conversation
  const chatResult = useChat({
    id: conversationId,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: {
        modelId: selectedModel,
      },
    }),
    onError: handleChatError,
    onToolCall: handleToolCall,
  });

  // Extract values from useChat result
  const { messages, status, error, sendMessage } = chatResult;

  // Manual input state management for AI SDK v5
  const [input, setInput] = useState('');

  // Chat scrolling
  const { messagesEndRef, chatContainerRef } = useChatScroll(status);

  // Main effect for processing messages and tool calls
  useEffect(() => {
    // Skip if messages empty or if reloading
    if (messages.length === 0 || isReloadingRef.current) return;

    // Check if messages have actually changed to prevent infinite loops
    const messagesString = JSON.stringify(messages);
    if (
      messagesStateRef.current.length === messages.length &&
      messagesStateRef.current.stringified === messagesString
    ) {
      return; // Skip if messages haven't changed
    }

    // Update refs with current values
    messagesStateRef.current = {
      length: messages.length,
      stringified: messagesString,
    };

    const lastMsg = messages[messages.length - 1];

    // Process user messages
    messages.forEach((message) => {
      if (message.role === 'user') {
        const messageContent = extractTextContent(message);
        // Check if we already have this user message
        const existingMessageIndex = chatStateRef.current.chatMessages.findIndex(
          (m: ChatMessage) => m.role === 'user' && m.content === messageContent,
        );

        if (existingMessageIndex === -1) {
          dispatch({
            type: 'ADD_USER_MESSAGE',
            payload: messageContent,
          });
        }
      }
    });

    // Process different assistant response scenarios
    const lastMsgContent =
      lastMsg && lastMsg.role === 'assistant' ? extractTextContent(lastMsg) : '';

    if (lastMsg && lastMsg.role === 'assistant') {
      // Check for pending tool call
      if (lastToolCallRef.current && !lastToolCallRef.current.output) {
        // Case 1: Processing tool response
        toolCallResponseRef.current = lastMsgContent;

        // Extract tool results from message parts if available
        let toolOutput = 'Tool response received.';

        // Extract actual tool results from AI SDK message parts
        if (lastMsg.parts && Array.isArray(lastMsg.parts)) {
          const toolParts = lastMsg.parts.filter(
            (part) => part.type?.startsWith('tool-') || part.type === 'tool-result',
          );

          if (toolParts.length > 0) {
            const toolResults = toolParts.map((part) => {
              // Check for tool-result parts
              if (part.type === 'tool-result' && 'result' in part && part.result !== undefined) {
                const result =
                  typeof part.result === 'string' ? part.result : JSON.stringify(part.result);

                return result;
              }

              // Check for tool UI parts with output available
              if (
                part.type &&
                part.type.startsWith('tool-') &&
                'state' in part &&
                part.state === 'output-available' &&
                'output' in part &&
                part.output !== undefined
              ) {
                const output =
                  typeof part.output === 'string' ? part.output : JSON.stringify(part.output);

                return output;
              }

              // If this is a tool part but not yet output-available, don't process yet
              if (
                part.type &&
                part.type.startsWith('tool-') &&
                'state' in part &&
                part.state === 'input-available'
              ) {
                return null; // Return null to indicate we should wait
              }

              return 'Tool executed successfully';
            });

            // Filter out null values (tools still processing) and join
            const validResults = toolResults.filter((result) => result !== null);

            if (validResults.length > 0) {
              toolOutput = validResults.join('\n');
            }
            // Don't update toolOutput if tools are still processing
          }
        }

        // Also check all messages for tool result parts to ensure we catch them
        messages.forEach((message) => {
          if (message.parts) {
            message.parts.forEach((part) => {
              // Check for tool-result parts
              if (
                part.type === 'tool-result' &&
                'toolCallId' in part &&
                lastToolCallRef.current?.id === part.toolCallId
              ) {
                const extractedOutput =
                  'result' in part
                    ? typeof part.result === 'string'
                      ? part.result
                      : JSON.stringify(part.result)
                    : 'Tool execution completed';
                if (extractedOutput !== 'Tool execution completed') {
                  toolOutput = extractedOutput;
                }
              }

              // Check for tool UI parts with output available
              if (
                part.type &&
                part.type.startsWith('tool-') &&
                'state' in part &&
                part.state === 'output-available' &&
                'toolCallId' in part &&
                lastToolCallRef.current?.id === part.toolCallId
              ) {
                const extractedOutput =
                  'output' in part && part.output !== undefined
                    ? typeof part.output === 'string'
                      ? part.output
                      : JSON.stringify(part.output)
                    : 'Tool execution completed';
                if (extractedOutput !== 'Tool execution completed') {
                  toolOutput = extractedOutput;
                }
              }
            });
          }
        });

        // Update the tool call with actual output
        if (lastToolCallRef.current.id) {
          // Update when we have actual results (don't wait for status to be ready)
          if (
            toolOutput !== 'Tool response received.' &&
            toolOutput !== 'Tool executed successfully'
          ) {
            dispatch({
              type: 'UPDATE_TOOL_CALL',
              payload: {
                toolCallId: lastToolCallRef.current.id,
                status: 'completed',
                output: toolOutput,
              },
            });
          }

          // Check if this message also has text content (summary)
          if (lastMsgContent && lastMsgContent.trim().length > 0) {
            // Don't add as final response yet if still streaming - let it continue
            if (status === 'streaming') {
              // Update existing streaming response or create new one
              const existingMessage = chatStateRef.current.chatMessages.find(
                (m: ChatMessage) =>
                  m.role === 'assistant' &&
                  !m.isFinalResponse &&
                  !m.toolCalls?.length &&
                  m.conversationTurn === chatStateRef.current.currentConversationTurn,
              );

              if (existingMessage) {
                dispatch({
                  type: 'UPDATE_ASSISTANT_MESSAGE',
                  payload: {
                    content: lastMsgContent,
                    conversationTurn: chatStateRef.current.currentConversationTurn,
                  },
                });
              } else {
                dispatch({
                  type: 'ADD_ASSISTANT_MESSAGE',
                  payload: {
                    content: lastMsgContent,
                    conversationTurn: chatStateRef.current.currentConversationTurn,
                  },
                });
              }
            } else if (status === 'ready') {
              // Now mark as final response when streaming is complete
              dispatch({
                type: 'ADD_FINAL_RESPONSE',
                payload: {
                  content: lastMsgContent,
                  conversationTurn: chatStateRef.current.currentConversationTurn,
                },
              });
              hasAddedFinalResponseRef.current = true;
              toolCallResponseRef.current = '';
              lastToolCallRef.current = null;
            }
          }
        }
      } else if (
        !lastToolCallRef.current &&
        !toolCallResponseRef.current &&
        status === 'streaming' &&
        lastMsgContent
      ) {
        // Case 2: Regular assistant message (non-tool response) during streaming
        // Check if we have an existing message for this turn
        const existingMessage = chatStateRef.current.chatMessages.find(
          (m: ChatMessage) =>
            m.role === 'assistant' &&
            !m.isFinalResponse &&
            !m.toolCalls?.length &&
            m.conversationTurn === chatStateRef.current.currentConversationTurn,
        );

        if (existingMessage) {
          // Update existing message
          dispatch({
            type: 'UPDATE_ASSISTANT_MESSAGE',
            payload: {
              content: lastMsgContent,
              conversationTurn: chatStateRef.current.currentConversationTurn,
            },
          });
        } else {
          // Create new message
          dispatch({
            type: 'ADD_ASSISTANT_MESSAGE',
            payload: {
              content: lastMsgContent,
              conversationTurn: chatStateRef.current.currentConversationTurn,
            },
          });
        }
      } else if (
        !lastToolCallRef.current &&
        !toolCallResponseRef.current &&
        status === 'ready' &&
        lastMsgContent
      ) {
        // Case 2.5: Regular assistant message (non-tool response) when complete

        // Check if we already have a very similar assistant message to avoid duplicates
        // Only look for exact content matches within the current conversation turn
        const existingExactMatch = chatStateRef.current.chatMessages.find(
          (m: ChatMessage) =>
            m.role === 'assistant' &&
            m.content === lastMsgContent &&
            m.conversationTurn === chatStateRef.current.currentConversationTurn,
        );

        if (!existingExactMatch) {
          // Check if we have any assistant messages for this turn that we should update
          // rather than creating a new one
          const existingAssistantMessage = chatStateRef.current.chatMessages.find(
            (m: ChatMessage) =>
              m.role === 'assistant' &&
              !m.isFinalResponse &&
              !m.toolCalls?.length &&
              m.conversationTurn === chatStateRef.current.currentConversationTurn,
          );

          if (existingAssistantMessage) {
            // Update existing message instead of creating a new one
            dispatch({
              type: 'UPDATE_ASSISTANT_MESSAGE',
              payload: {
                content: lastMsgContent,
                conversationTurn: chatStateRef.current.currentConversationTurn,
              },
            });
          } else {
            // No existing message found, create a new one
            dispatch({
              type: 'ADD_ASSISTANT_MESSAGE',
              payload: {
                content: lastMsgContent,
                conversationTurn: chatStateRef.current.currentConversationTurn,
              },
            });
          }
        }
      } else if (
        !lastToolCallRef.current &&
        toolCallResponseRef.current &&
        !hasAddedFinalResponseRef.current
      ) {
        // Case 3: Final response after tool calls
        dispatch({
          type: 'UPDATE_FINAL_RESPONSE',
          payload: {
            content: lastMsgContent,
            conversationTurn: chatStateRef.current.currentConversationTurn,
          },
        });

        // Only mark as added when loading is complete
        if (status === 'ready') {
          hasAddedFinalResponseRef.current = true;
          toolCallResponseRef.current = '';
          lastToolCallRef.current = null; // Clear tool call ref after final response
        }
      } else if (
        lastToolCallRef.current &&
        toolCallResponseRef.current &&
        !hasAddedFinalResponseRef.current &&
        lastMsgContent &&
        lastMsgContent.trim().length > 0
      ) {
        // Case 3b: Final response with tool call still active but we have summary content
        dispatch({
          type: 'UPDATE_FINAL_RESPONSE',
          payload: {
            content: lastMsgContent,
            conversationTurn: chatStateRef.current.currentConversationTurn,
          },
        });

        // Mark as complete and clear refs
        if (status === 'ready') {
          hasAddedFinalResponseRef.current = true;
          toolCallResponseRef.current = '';
          lastToolCallRef.current = null;
        }
      }
    }
  }, [messages, status]);

  // Status and tool call cleanup effect
  useEffect(() => {
    // Reset processing flag when done
    if (status === 'ready' && isProcessingTool.current) {
      isProcessingTool.current = false;
    }

    // Fix any tool calls stuck in running state when chat becomes ready
    if (status === 'ready') {
      chatStateRef.current.chatMessages.forEach((message: ChatMessage) => {
        if (message.toolCalls && message.toolCalls.length > 0) {
          message.toolCalls.forEach((toolCall: ToolCall) => {
            if (toolCall.status === 'running' && toolCall.id) {
              dispatch({
                type: 'UPDATE_TOOL_CALL',
                payload: {
                  toolCallId: toolCall.id,
                  status: 'completed',
                  output: toolCall.output || 'Tool completed.',
                },
              });
            }
          });
        }
      });
    }
  }, [status, dispatch]);

  // Handle model changes
  useEffect(() => {
    if (isReloadingRef.current || selectedModel === previousModelRef.current) return;

    previousModelRef.current = selectedModel;

    // Only reset if there are existing messages
    if (messages.length > 0) {
      // Create a new conversation with the new model
      setConversationId(Date.now().toString());

      // Reset UI state and refs
      resetInternalState();
      setInput('');
      setErrorDetails(null);
      setHistoryIndex(null);
    }
  }, [selectedModel, messages.length, resetInternalState]);

  // Event handlers with useCallback
  const handleRetry = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setErrorDetails(null);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Get all user messages for history navigation
      const userMessages = messages.filter((msg) => msg.role === 'user');

      // Handle up arrow key press
      if (event.key === 'ArrowUp') {
        if (userMessages.length > 0) {
          // If not already navigating history, start with the most recent message
          if (historyIndex === null) {
            setHistoryIndex(userMessages.length - 1);
            setInput(extractTextContent(userMessages[userMessages.length - 1]));
          }
          // If already navigating, go to previous message if available
          else if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setInput(extractTextContent(userMessages[newIndex]));
          }

          // Place cursor at the end of input
          const inputElement = event.target as HTMLInputElement;
          inputElement.selectionStart = inputElement.selectionEnd = inputElement.value.length;
        }
      }

      // Handle down arrow key press - navigate forward in history
      else if (event.key === 'ArrowDown' && historyIndex !== null) {
        if (historyIndex < userMessages.length - 1) {
          // Move to more recent message
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setInput(extractTextContent(userMessages[newIndex]));
        } else {
          // Reached the end of history, clear the input
          setHistoryIndex(null);
          setInput('');
        }
      }

      // Reset history index when the user types
      else if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        setHistoryIndex(null);
      }
    },
    [historyIndex, messages, setInput],
  );

  // Modified to handle deep search if enabled
  const handleManualSubmit = useCallback(
    async (e: React.FormEvent) => {
      if (status === 'submitted' || status === 'streaming' || isCreatingPlan || isExecutingPlan) {
        return;
      }

      e.preventDefault();
      setErrorDetails(null);
      setHistoryIndex(null); // Reset history index after sending a message

      const query = input.trim();

      // Check if deep search mode is enabled
      if (isDeepSearchMode && query) {
        // First add the user message
        dispatch({
          type: 'ADD_USER_MESSAGE',
          payload: query,
        });

        // Increment conversation turn
        dispatch({
          type: 'INCREMENT_CONVERSATION_TURN',
        });

        // Clear any existing search plan when a new question is asked
        dispatch({
          type: 'CLEAR_SEARCH_PLAN',
        });

        // Reset the final response flag for the new question
        hasAddedFinalResponseRef.current = false;

        try {
          // Clear input immediately after submitting
          setInput('');

          // Create a deep search plan with the orchestrator
          const plan = await createDeepSearchPlan(query);

          if (plan) {
            // Store the current conversation turn in the plan for reference
            const planWithTurn = {
              ...plan,
              conversationTurn: chatStateRef.current.currentConversationTurn,
            };

            // Execute the plan with workers
            await executeDeepSearchPlan(planWithTurn);
          }
        } catch (err) {
          console.error('Deep search error:', err);
          const errorMsg = err instanceof Error ? err.message : String(err);
          setErrorDetails(errorMsg);
        }

        return;
      }

      // Regular chat mode
      hasAddedFinalResponseRef.current = false;
      toolCallResponseRef.current = '';

      // Increment conversation turn safely through dispatch instead of direct mutation
      dispatch({
        type: 'INCREMENT_CONVERSATION_TURN',
      });

      try {
        // AI SDK v5 - use sendMessage with proper UIMessage format
        sendMessage({
          role: 'user',
          parts: [{ type: 'text', text: input }],
        });
        setInput(''); // Clear input after sending
      } catch {
        // Error handled by onError callback
      }
    },
    [
      status,
      isCreatingPlan,
      isExecutingPlan,
      input,
      isDeepSearchMode,
      setInput,
      createDeepSearchPlan,
      executeDeepSearchPlan,
      sendMessage,
      dispatch,
    ],
  );

  const toggleToolExpansion = useCallback((messageIdx: number, toolIdx: number) => {
    const key = `${messageIdx}-${toolIdx}`;
    setExpandedTools((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const clearConversation = useCallback(() => {
    // Create a new conversation ID to completely reset the useChat hook
    setConversationId(Date.now().toString());

    // Reset all UI state and refs
    resetInternalState();
    setInput('');
    setErrorDetails(null);
    setHistoryIndex(null);
  }, [resetInternalState, setInput]);

  // Combine errors
  const combinedErrorDetails = deepSearchError
    ? deepSearchError.message || String(deepSearchError)
    : errorDetails;

  return {
    chatMessages,
    input,
    setInput,
    status,
    error,
    errorDetails: combinedErrorDetails,
    expandedTools,
    toolOptions,
    historyIndex,
    handleSubmit: handleManualSubmit,
    handleRetry,
    handleKeyDown,
    toggleToolExpansion,
    onFinalResponse: hasAddedFinalResponseRef.current,
    messagesEndRef,
    chatContainerRef,
    clearConversation,
    searchPlan: chatState.searchPlan,
    isDeepSearchMode,
    isCreatingPlan,
    isExecutingPlan,
  };
}
