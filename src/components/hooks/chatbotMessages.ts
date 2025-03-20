import { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import { useChat } from '@ai-sdk/react';
import { 
  ToolCall, 
  ToolInfo, 
  ToolCallHandlerArg,
  UseChatbotMessagesProps,
  UseChatbotMessagesResult,
  ChatAction,
  ChatState
} from '../types/chatTypes';

// A function that will handle the chat state reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'CLEAR_CONVERSATION':
      return {
        chatMessages: [],
        currentConversationTurn: 0,
        toolExecutionMsgMap: new Map()
      };

    case 'SET_CHAT_MESSAGES':
      return {
        ...state,
        chatMessages: action.payload
      };

    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          {
            role: 'user',
            content: action.payload,
            conversationTurn: state.currentConversationTurn
          }
        ]
      };

    case 'ADD_ASSISTANT_MESSAGE': {
      // Check if we already have a non-tool message for this turn
      const existingMsgIndex = state.chatMessages.findIndex(msg => 
        msg.role === 'assistant' && 
        !msg.toolCalls?.length &&
        !msg.isFinalResponse &&
        msg.conversationTurn === action.payload.conversationTurn
      );
      
      if (existingMsgIndex !== -1) {
        // Update existing message
        const updatedMessages = [...state.chatMessages];
        updatedMessages[existingMsgIndex] = {
          ...updatedMessages[existingMsgIndex],
          content: action.payload.content
        };
        return {
          ...state,
          chatMessages: updatedMessages
        };
      }
      
      // Add new message
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages, 
          {
            role: 'assistant',
            content: action.payload.content,
            conversationTurn: action.payload.conversationTurn
          }
        ]
      };
    }

    case 'ADD_TOOL_CALL': {
      // Add the tool call message and store its index in the map
      const newMessages = [
        ...state.chatMessages,
        {
          role: 'assistant' as const,
          content: '',
          toolCalls: [action.payload.toolCall],
          isToolInProgress: true,
          conversationTurn: action.payload.conversationTurn
        }
      ];
      
      // Create a new map with the updated tool call index
      const newMap = new Map(state.toolExecutionMsgMap);
      if (action.payload.toolCall.id) {
        newMap.set(
          action.payload.toolCall.id,
          newMessages.length - 1 // Index of the just-added message
        );
      }
      
      return {
        ...state,
        chatMessages: newMessages,
        toolExecutionMsgMap: newMap
      };
    }

    case 'UPDATE_TOOL_CALL': {
      const msgIndex = state.toolExecutionMsgMap.get(action.payload.toolCallId);
      if (msgIndex === undefined) return state;
      
      const updatedMessages = [...state.chatMessages];
      const messageToUpdate = updatedMessages[msgIndex];
      
      if (!messageToUpdate.toolCalls?.length) return state;
      
      const updatedToolCalls = messageToUpdate.toolCalls.map(tc => {
        if (tc.id === action.payload.toolCallId) {
          return { 
            ...tc, 
            status: action.payload.status,
            output: action.payload.output || tc.output
          };
        }
        return tc;
      });
      
      updatedMessages[msgIndex] = {
        ...messageToUpdate,
        toolCalls: updatedToolCalls,
        isToolInProgress: false
      };
      
      return {
        ...state,
        chatMessages: updatedMessages
      };
    }

    case 'ADD_FINAL_RESPONSE':
      // Check if we already have a final response for this turn
      if (state.chatMessages.some(msg => 
          msg.isFinalResponse && 
          msg.conversationTurn === action.payload.conversationTurn)) {
        return state;
      }
      
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          {
            role: 'assistant',
            content: action.payload.content,
            isFinalResponse: true,
            conversationTurn: action.payload.conversationTurn
          }
        ]
      };

    case 'UPDATE_FINAL_RESPONSE':
      return {
        ...state,
        chatMessages: state.chatMessages.map(msg => {
          if (msg.isFinalResponse && 
              msg.conversationTurn === action.payload.conversationTurn) {
            return {
              ...msg,
              content: action.payload.content
            };
          }
          return msg;
        })
      };

    case 'INCREMENT_CONVERSATION_TURN':
      return {
        ...state,
        currentConversationTurn: state.currentConversationTurn + 1
      };

    default:
      return state;
  }
}

// Custom hook for tool options
function useToolOptions() {
  const [toolOptions, setToolOptions] = useState<Record<string, ToolInfo>>({});

  useEffect(() => {
    const fetchToolOptions = async () => {
      try {
        const response = await fetch('/api/tools');
        const data = await response.json();
        
        if (data && Array.isArray(data.tools)) {
          const options: Record<string, ToolInfo> = {};
          data.tools.forEach((tool: ToolInfo) => {
            options[tool.id] = {
              id: tool.id,
              description: tool.description || 'No description available',
              name: tool.name || tool.id
            };
          });
          
          setToolOptions(options);
        }
      } catch {
        // Silently fail
      }
    };
    
    fetchToolOptions();
  }, []);

  return toolOptions;
}

// Custom hook for chat scrolling
function useChatScroll(chatStatus: string) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Scroll to bottom when loading state changes
  useEffect(() => {
    scrollToBottom();
  }, [chatStatus, scrollToBottom]);

  // Set up mutation observer to detect content streaming and scroll as it comes in
  useEffect(() => {
    if (!chatContainerRef.current) return;

    const observer = new MutationObserver(() => {
      const container = chatContainerRef.current!;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isNearBottom || chatStatus === 'submitted' || chatStatus === 'streaming') {
        scrollToBottom();
      }
    });

    observer.observe(chatContainerRef.current, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => {
      observer.disconnect();
    };
  }, [chatStatus, scrollToBottom]);

  return { messagesEndRef, chatContainerRef, scrollToBottom };
}

export function useChatbotMessages({ selectedModel }: UseChatbotMessagesProps): UseChatbotMessagesResult {
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
    toolExecutionMsgMap: new Map()
  });
  
  // Extract values from state
  const { chatMessages } = chatState;
  
  // Refs
  const isProcessingTool = useRef(false);
  const lastToolCallRef = useRef<ToolCall | null>(null);
  const hasAddedFinalResponseRef = useRef(false);
  const toolCallResponseRef = useRef("");
  const previousModelRef = useRef(selectedModel);
  const isReloadingRef = useRef(false);
  const previousMessagesLengthRef = useRef(0);
  const previousMessagesStringRef = useRef("");
  
  // Function to reset internal state
  const resetInternalState = useCallback(() => {
    isProcessingTool.current = false;
    lastToolCallRef.current = null;
    hasAddedFinalResponseRef.current = false;
    toolCallResponseRef.current = "";
    dispatch({ type: 'CLEAR_CONVERSATION' });
  }, []);
  
  // Tool call handler - must be defined before useChat
  const handleToolCall = useCallback(({ toolCall }: ToolCallHandlerArg) => {
    isProcessingTool.current = true;
    hasAddedFinalResponseRef.current = false;
    toolCallResponseRef.current = "";
    
    // Get the tool information
    const toolInfo = toolOptions[toolCall?.toolName || ''] || {
      name: toolCall?.toolName || 'AI Tool',
      description: 'Using tool to retrieve information',
      id: toolCall?.toolName || ''
    };
    
    // Create a tool call object
    const newToolCall: ToolCall = {
      name: toolCall?.toolName || '',
      args: toolCall?.args as Record<string, unknown> || {},
      status: 'running',
      description: toolInfo.description,
      displayName: toolInfo.name
    };
    
    // Generate a unique ID for this tool call
    const toolCallId = `${Date.now()}-${toolCall?.toolName || 'tool'}-${Math.random().toString(36).substr(2, 5)}`;
    newToolCall.id = toolCallId;
    
    // Save the current tool call for reference
    lastToolCallRef.current = newToolCall;
    
    // Add the tool call message - the reducer will handle storing the index
    dispatch({ 
      type: 'ADD_TOOL_CALL', 
      payload: { 
        toolCall: newToolCall, 
        conversationTurn: chatState.currentConversationTurn 
      } 
    });
  }, [toolOptions, chatState.currentConversationTurn]);
  
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
          status: 'error'
        }
      });
      lastToolCallRef.current = null;
    }
  }, []);
  
  // Create a new instance of the useChat hook for each conversation
  const { 
    messages, 
    input, 
    setInput, 
    handleSubmit, 
    status, 
    error, 
    reload: originalReload 
  } = useChat({
    api: '/api/chat',
    maxSteps: 5,
    id: conversationId,
    body: { modelId: selectedModel },
    onError: handleChatError,
    onToolCall: handleToolCall
  });
  
  // Custom reload function that prevents infinite loops
  const reload = useCallback(() => {
    if (isReloadingRef.current) return;
    
    isReloadingRef.current = true;
    try {
      originalReload();
    } finally {
      setTimeout(() => {
        isReloadingRef.current = false;
      }, 100);
    }
  }, [originalReload]);
  
  // Detect final response
  const onFinalResponse = useMemo(() => chatMessages.some(msg => 
    msg.role === 'assistant' && 
    msg.isFinalResponse === true && 
    msg.conversationTurn === chatState.currentConversationTurn
  ), [chatMessages, chatState.currentConversationTurn]);
  
  // Chat scrolling
  const { messagesEndRef, chatContainerRef } = useChatScroll(status);
  
  // Main effect to convert AI SDK messages to our chat state format
  useEffect(() => {
    // Skip if messages empty or if reloading
    if (messages.length === 0 || isReloadingRef.current) return;
    
    // Check if messages have actually changed to prevent infinite loops
    const messagesString = JSON.stringify(messages);
    if (
      previousMessagesLengthRef.current === messages.length && 
      previousMessagesStringRef.current === messagesString
    ) {
      return; // Skip if messages haven't changed
    }
    
    // Update refs with current values
    previousMessagesLengthRef.current = messages.length;
    previousMessagesStringRef.current = messagesString;
    
    const lastMsg = messages[messages.length - 1];
    
    // Process messages from useChat
    if (messages.length > 0) {
      // Process user messages
      messages.forEach(message => {
        if (message.role === 'user') {
          // Check if we already have this user message
          const existingMessageIndex = chatMessages.findIndex(
            (m) => m.role === 'user' && m.content === message.content
          );
          
          if (existingMessageIndex === -1) {
            dispatch({
              type: 'ADD_USER_MESSAGE',
              payload: message.content
            });
          }
        }
      });
      
      // Process tool responses
      if (lastMsg && 
          lastMsg.role === 'assistant' && 
          lastMsg.content && 
          lastToolCallRef.current && 
          !lastToolCallRef.current.output) {
        
        // Save the tool call output for later use
        toolCallResponseRef.current = lastMsg.content;
        
        // Update the tool call with output
        if (lastToolCallRef.current.id) {
          // Update the tool status
          dispatch({
            type: 'UPDATE_TOOL_CALL',
            payload: {
              toolCallId: lastToolCallRef.current.id,
              status: 'completed',
              output: "Tool response received."
            }
          });
          
          // Add placeholder for final response if not already added
          if (!hasAddedFinalResponseRef.current) {
            dispatch({
              type: 'ADD_FINAL_RESPONSE',
              payload: {
                content: '',
                conversationTurn: chatState.currentConversationTurn
              }
            });
          }
          
          // Reset the tool call reference
          lastToolCallRef.current = null;
        }
      }
      
      // Process regular assistant messages (non-tool responses)
      if (lastMsg && 
          lastMsg.role === 'assistant' && 
          lastMsg.content && 
          !lastToolCallRef.current && 
          !toolCallResponseRef.current) {
        
        dispatch({
          type: 'ADD_ASSISTANT_MESSAGE',
          payload: {
            content: lastMsg.content,
            conversationTurn: chatState.currentConversationTurn
          }
        });
      }
      
      // Add the final response after tool calls complete
      if (lastMsg && 
          lastMsg.role === 'assistant' && 
          lastMsg.content && 
          !lastToolCallRef.current && 
          toolCallResponseRef.current && 
          !hasAddedFinalResponseRef.current) {
        
        // Update the content of existing final response (for streaming)
        dispatch({
          type: 'UPDATE_FINAL_RESPONSE',
          payload: {
            content: lastMsg.content,
            conversationTurn: chatState.currentConversationTurn
          }
        });
        
        // Only mark as added when loading is complete
        if (status === 'ready') {
          hasAddedFinalResponseRef.current = true;
          toolCallResponseRef.current = "";
        }
      }
    } else if (chatMessages.length > 0) {
      // If useChat has no messages but we do, clear our messages
      dispatch({ type: 'CLEAR_CONVERSATION' });
    }
  }, [messages, status, chatState.currentConversationTurn, dispatch]);
  
  // Reset state after loading is complete
  useEffect(() => {
    if (status === 'ready' && isProcessingTool.current) {
      isProcessingTool.current = false;
    }
    
    // When the status changes to ready, ensure all tool calls are properly marked as complete
    if (status === 'ready') {
      let hasRunningTools = false;
      
      // Check for any tools that are still marked as running
      chatMessages.forEach(message => {
        if (message.toolCalls && message.toolCalls.length > 0) {
          message.toolCalls.forEach(toolCall => {
            if (toolCall.status === 'running' && toolCall.id) {
              hasRunningTools = true;
              
              // Update the tool status to completed
              dispatch({
                type: 'UPDATE_TOOL_CALL',
                payload: {
                  toolCallId: toolCall.id,
                  status: 'completed',
                  output: toolCall.output || "Tool completed."
                }
              });
            }
          });
        }
      });
      
      // If we found running tools, log this for debugging
      if (hasRunningTools) {
        console.log('Fixed tools that were still in running state when chat became ready');
      }
    }
  }, [status, chatMessages, dispatch]);
  
  // Handle model changes
  useEffect(() => {
    // Skip if reloading
    if (isReloadingRef.current) return;
    
    // Detect model change
    if (selectedModel !== previousModelRef.current) {
      previousModelRef.current = selectedModel;
      
      // Only reset if there are existing messages
      if (messages.length > 0) {
        // Create a new conversation with the new model
        setConversationId(Date.now().toString());
        
        // Reset UI state
        dispatch({ type: 'CLEAR_CONVERSATION' });
        setInput('');
        setErrorDetails(null);
        setHistoryIndex(null);
        
        // Reset all refs
        resetInternalState();
      }
    }
  }, [selectedModel, messages.length, resetInternalState]);
  
  // Event handlers with useCallback
  const handleRetry = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setErrorDetails(null);
    reload();
  }, [reload]);
  
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    // Get all user messages for history navigation
    const userMessages = messages.filter(msg => msg.role === 'user');
    
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
        setTimeout(() => {
          inputElement.selectionStart = inputElement.selectionEnd = inputElement.value.length;
        }, 0);
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
  }, [historyIndex, messages, setInput]);
  
  const handleManualSubmit = useCallback(async (e: React.FormEvent) => {
    if(status === 'submitted' || status === 'streaming') {
      return;
    }
    
    e.preventDefault();
    setErrorDetails(null);
    setHistoryIndex(null); // Reset history index after sending a message
    hasAddedFinalResponseRef.current = false;
    toolCallResponseRef.current = "";
    
    // Increment conversation turn safely through dispatch instead of direct mutation
    dispatch({ 
      type: 'INCREMENT_CONVERSATION_TURN' 
    });
    
    try {
      await handleSubmit(e);
    } catch {
      // Error handled by onError callback
    }
  }, [handleSubmit, status]);
  
  const toggleToolExpansion = useCallback((messageIdx: number, toolIdx: number) => {
    const key = `${messageIdx}-${toolIdx}`;
    setExpandedTools(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);
  
  const clearConversation = useCallback(() => {
    // Create a new conversation ID to completely reset the useChat hook
    setConversationId(Date.now().toString());
    
    // Reset all UI state
    dispatch({ type: 'CLEAR_CONVERSATION' });
    setInput('');
    setErrorDetails(null);
    setHistoryIndex(null);
    
    // Reset all refs
    resetInternalState();
  }, [resetInternalState]);

  return {
    chatMessages,
    input,
    setInput,
    status,
    error,
    errorDetails,
    expandedTools,
    toolOptions,
    historyIndex,
    handleSubmit: handleManualSubmit,
    handleRetry,
    handleKeyDown,
    toggleToolExpansion,
    onFinalResponse,
    messagesEndRef,
    chatContainerRef,
    reload,
    clearConversation
  };
}