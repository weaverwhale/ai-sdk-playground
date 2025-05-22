import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  ToolCall,
  ToolCallHandlerArg,
  UseChatbotMessagesProps,
  UseChatbotMessagesResult,
  ChatMessage,
} from '../types/chatTypes';
import { chatReducer } from './chatReducer';
import { useToolOptions } from './useToolOptions';
import { useChatScroll } from './useChatScroll';
import { useDeepSearch } from './useDeepSearch';

export function useChatbotMessages({
  selectedModel,
  isDeepSearchMode = false,
  userId,
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
        conversationTurn: chatState.currentConversationTurn,
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
            conversationTurn: plan.conversationTurn || chatState.currentConversationTurn,
          },
        });

        hasAddedFinalResponseRef.current = true;

        dispatch({
          type: 'UPDATE_FINAL_RESPONSE',
          payload: {
            content: plan.summary,
            conversationTurn: chatState.currentConversationTurn,
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
  const handleToolCall = useCallback(
    ({ toolCall }: ToolCallHandlerArg) => {
      isProcessingTool.current = true;
      hasAddedFinalResponseRef.current = false;

      // We need to create a references to 'messages' that will be available in different scopes,
      // so we access the messages from the chatMessages state.
      let currentStreamContent = '';

      // Use the chatMessages array to find current content
      // Find the most recent assistant message in the current conversation turn
      const currentAssistantMsg = chatMessages.find(
        (m: ChatMessage) =>
          m.role === 'assistant' &&
          !m.toolCalls?.length &&
          m.conversationTurn === chatState.currentConversationTurn,
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
        name: toolCall?.toolName || '',
        args: (toolCall?.args as Record<string, unknown>) || {},
        status: 'running',
        description: toolInfo.description,
        displayName: toolInfo.name,
        id: `${Date.now()}-${toolCall?.toolName || 'tool'}-${Math.random()
          .toString(36)
          .substr(2, 5)}`,
      };

      // First, if we have any streamed content, make sure it's displayed
      if (currentStreamContent) {
        const existingMessage = chatMessages.find(
          (m: ChatMessage) =>
            m.role === 'assistant' &&
            !m.isFinalResponse &&
            !m.toolCalls?.length &&
            m.conversationTurn === chatState.currentConversationTurn,
        );

        if (!existingMessage) {
          // Add the pre-tool content as a message
          dispatch({
            type: 'ADD_ASSISTANT_MESSAGE',
            payload: {
              content: currentStreamContent,
              conversationTurn: chatState.currentConversationTurn,
            },
          });
        }
      }

      // Add the tool call message - the reducer will handle storing the index
      dispatch({
        type: 'ADD_TOOL_CALL',
        payload: {
          toolCall: newToolCall,
          conversationTurn: chatState.currentConversationTurn,
        },
      });

      // Save the current tool call for reference
      lastToolCallRef.current = newToolCall;
    },
    [toolOptions, chatState.currentConversationTurn, chatMessages, dispatch],
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
  const { messages, input, setInput, handleSubmit, status, error } = useChat({
    api: '/api/chat',
    maxSteps: 5,
    id: conversationId,
    body: {
      modelId: selectedModel,
      userId,
    },
    onError: handleChatError,
    onToolCall: handleToolCall,
  });

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
        // Check if we already have this user message
        const existingMessageIndex = chatMessages.findIndex(
          (m: ChatMessage) => m.role === 'user' && m.content === message.content,
        );

        if (existingMessageIndex === -1) {
          dispatch({
            type: 'ADD_USER_MESSAGE',
            payload: message.content,
          });
        }
      }
    });

    // Process different assistant response scenarios
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
      // Check for pending tool call
      if (lastToolCallRef.current && !lastToolCallRef.current.output) {
        // Case 1: Processing tool response
        toolCallResponseRef.current = lastMsg.content;

        // Extract tool results from message parts if available
        let toolOutput = 'Tool response received.';

        // Check if the message has parts with tool invocations that have results
        if (lastMsg.parts && Array.isArray(lastMsg.parts)) {
          for (const part of lastMsg.parts) {
            if (
              part.type === 'tool-invocation' &&
              part.toolInvocation?.state === 'result' &&
              part.toolInvocation?.toolName === lastToolCallRef.current?.name
            ) {
              const toolResult = part.toolInvocation.result;
              if (toolResult) {
                // If the result is an object, stringify it; otherwise use as-is
                toolOutput =
                  typeof toolResult === 'object' ? JSON.stringify(toolResult) : String(toolResult);
                break;
              }
            }
          }
        }

        // Update the tool call with actual output
        if (lastToolCallRef.current.id) {
          dispatch({
            type: 'UPDATE_TOOL_CALL',
            payload: {
              toolCallId: lastToolCallRef.current.id,
              status: 'completed',
              output: toolOutput,
            },
          });

          // Add placeholder for final response if not already added
          if (!hasAddedFinalResponseRef.current) {
            // Create or update the assistant message with pre-tool content and final content
            const combinedContent = lastMsg.content;

            dispatch({
              type: 'ADD_FINAL_RESPONSE',
              payload: {
                content: combinedContent,
                conversationTurn: chatState.currentConversationTurn,
              },
            });
          }

          lastToolCallRef.current = null;
        }
      } else if (
        !lastToolCallRef.current &&
        !toolCallResponseRef.current &&
        status === 'streaming'
      ) {
        // Case 2: Regular assistant message (non-tool response) during streaming
        // Check if we have an existing message for this turn
        const existingMessage = chatMessages.find(
          (m: ChatMessage) =>
            m.role === 'assistant' &&
            !m.isFinalResponse &&
            !m.toolCalls?.length &&
            m.conversationTurn === chatState.currentConversationTurn,
        );

        if (existingMessage) {
          // Update existing message
          dispatch({
            type: 'UPDATE_ASSISTANT_MESSAGE',
            payload: {
              content: lastMsg.content,
              conversationTurn: chatState.currentConversationTurn,
            },
          });
        } else {
          // Create new message
          dispatch({
            type: 'ADD_ASSISTANT_MESSAGE',
            payload: {
              content: lastMsg.content,
              conversationTurn: chatState.currentConversationTurn,
            },
          });
        }
      } else if (!lastToolCallRef.current && !toolCallResponseRef.current && status === 'ready') {
        // Case 2.5: Regular assistant message (non-tool response) when complete

        // Check if we already have a very similar assistant message to avoid duplicates
        // Only look for exact content matches within the current conversation turn
        const existingExactMatch = chatMessages.find(
          (m: ChatMessage) =>
            m.role === 'assistant' &&
            m.content === lastMsg.content &&
            m.conversationTurn === chatState.currentConversationTurn,
        );

        if (!existingExactMatch) {
          // Check if we have any assistant messages for this turn that we should update
          // rather than creating a new one
          const existingAssistantMessage = chatMessages.find(
            (m: ChatMessage) =>
              m.role === 'assistant' &&
              !m.isFinalResponse &&
              !m.toolCalls?.length &&
              m.conversationTurn === chatState.currentConversationTurn,
          );

          if (existingAssistantMessage) {
            // Update existing message instead of creating a new one
            dispatch({
              type: 'UPDATE_ASSISTANT_MESSAGE',
              payload: {
                content: lastMsg.content,
                conversationTurn: chatState.currentConversationTurn,
              },
            });
          } else {
            // No existing message found, create a new one
            dispatch({
              type: 'ADD_ASSISTANT_MESSAGE',
              payload: {
                content: lastMsg.content,
                conversationTurn: chatState.currentConversationTurn,
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
            content: lastMsg.content,
            conversationTurn: chatState.currentConversationTurn,
          },
        });

        // Only mark as added when loading is complete
        if (status === 'ready') {
          hasAddedFinalResponseRef.current = true;
          toolCallResponseRef.current = '';
        }
      }
    }
  }, [messages, status, chatState.currentConversationTurn, chatMessages]);

  // Status and tool call cleanup effect
  useEffect(() => {
    // Reset processing flag when done
    if (status === 'ready' && isProcessingTool.current) {
      isProcessingTool.current = false;
    }

    // Fix any tool calls stuck in running state when chat becomes ready
    if (status === 'ready') {
      chatMessages.forEach((message: ChatMessage) => {
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
  }, [status, chatMessages, dispatch]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            setInput(userMessages[userMessages.length - 1].content);
          }
          // If already navigating, go to previous message if available
          else if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setInput(userMessages[newIndex].content);
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
          setInput(userMessages[newIndex].content);
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
              conversationTurn: chatState.currentConversationTurn,
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
        await handleSubmit(e);
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
      chatState.currentConversationTurn,
      handleSubmit,
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
