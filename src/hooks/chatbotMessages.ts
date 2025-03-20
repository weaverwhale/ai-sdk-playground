import { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import { useChat } from '@ai-sdk/react';
import { 
  ToolCall, 
  ToolCallHandlerArg,
  UseChatbotMessagesProps,
  UseChatbotMessagesResult,
  ChatMessage
} from '../types/chatTypes';
import { chatReducer } from './chatReducer';
import { useToolOptions } from './useToolOptions';
import { useChatScroll } from './useChatScroll';

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
            (m: ChatMessage) => m.role === 'user' && m.content === message.content
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
  }, [messages, status, chatState.currentConversationTurn, dispatch, chatMessages]);
  
  // Reset state after loading is complete
  useEffect(() => {
    if (status === 'ready' && isProcessingTool.current) {
      isProcessingTool.current = false;
    }
    
    // When the status changes to ready, ensure all tool calls are properly marked as complete
    if (status === 'ready') {
      let hasRunningTools = false;
      
      // Check for any tools that are still marked as running
      chatMessages.forEach((message: ChatMessage) => {
        if (message.toolCalls && message.toolCalls.length > 0) {
          message.toolCalls.forEach((toolCall: ToolCall) => {
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