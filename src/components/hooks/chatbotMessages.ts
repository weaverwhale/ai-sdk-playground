import { useState, useEffect, useRef, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  output?: string;
  description?: string;
  status?: 'running' | 'completed' | 'error';
  displayName?: string;
  id?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isToolInProgress?: boolean;
  isFinalResponse?: boolean;
  conversationTurn?: number;
}

// Match the exact shape expected by useChat's onToolCall callback
interface ToolCallHandlerArg {
  toolCall: {
    toolName: string;
    args: unknown;
  };
}

interface ToolInfo {
  id: string;
  description: string;
  name: string;
}

export interface UseChatbotMessagesProps {
  selectedModel: string;
}

export interface UseChatbotMessagesResult {
  chatMessages: ChatMessage[];
  input: string;
  setInput: (input: string) => void;
  status: string;
  error: Error | undefined | null;
  errorDetails?: string | null;
  expandedTools: Record<string, boolean>;
  toolOptions: Record<string, ToolInfo>;
  historyIndex: number | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleRetry: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  toggleToolExpansion: (messageIdx: number, toolIdx: number) => void;
  onFinalResponse: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  reload: () => void;
}

export function useChatbotMessages({ selectedModel }: UseChatbotMessagesProps): UseChatbotMessagesResult {
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [toolOptions, setToolOptions] = useState<Record<string, ToolInfo>>({});
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  
  const isProcessingTool = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastToolCallRef = useRef<ToolCall | null>(null);
  const hasAddedFinalResponseRef = useRef(false);
  const toolCallResponseRef = useRef("");
  const toolExecutionMsgMap = useRef<Map<string, number>>(new Map());
  const currentConversationTurn = useRef<number>(0);
  const previousMessagesLengthRef = useRef(0);
  const previousChatMessagesLengthRef = useRef(0);
  
  // Store previous model selection to detect changes
  const previousModelRef = useRef(selectedModel);
  
  // Track if we're in a model change reload cycle
  const isReloadingRef = useRef(false);

  const onFinalResponse = useMemo(() => chatMessages.some(msg => 
    msg.role === 'assistant' && 
    msg.isFinalResponse === true && 
    msg.conversationTurn === currentConversationTurn.current
  ), [chatMessages]);
  
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
    body: { modelId: selectedModel },
    onError: (error) => {
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
      if (lastToolCallRef.current) {
        lastToolCallRef.current.status = 'error';
        
        // Update the chatMessages with the error status
        setChatMessages(prevMessages => {
          const updatedMessages = [...prevMessages];
          const lastAssistantMsgIndex = updatedMessages.findIndex(msg => 
            msg.role === 'assistant' && msg.toolCalls?.some(tc => tc.name === lastToolCallRef.current?.name)
          );
          
          if (lastAssistantMsgIndex !== -1) {
            const lastAssistantMsg = updatedMessages[lastAssistantMsgIndex];
            const updatedToolCalls = lastAssistantMsg.toolCalls?.map(tc => {
              if (tc.name === lastToolCallRef.current?.name) {
                return { ...tc, status: 'error' as const };
              }
              return tc;
            });
            
            updatedMessages[lastAssistantMsgIndex] = {
              ...lastAssistantMsg,
              toolCalls: updatedToolCalls,
              isToolInProgress: false
            };
          }
          
          return updatedMessages;
        });
      }
    },
    onToolCall: ({ toolCall }: ToolCallHandlerArg) => {
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
      
      // Save the current tool call for reference
      lastToolCallRef.current = newToolCall;
      
      // Create or update an assistant message with the tool call
      setChatMessages(prevMessages => {
        // Create a new assistant message for this tool call
        const newToolCallMsg: ChatMessage = {
          role: 'assistant',
          content: '',
          toolCalls: [newToolCall],
          isToolInProgress: true,
          conversationTurn: currentConversationTurn.current
        };
        
        const newMessages = [...prevMessages, newToolCallMsg];
        // Store the message index for this tool call
        toolExecutionMsgMap.current.set(toolCallId, newMessages.length - 1);
        
        return newMessages;
      });
      
      // Update the identifier for the last tool call
      lastToolCallRef.current.id = toolCallId;
    }
  });
  
  // Custom reload function that prevents infinite loops
  const reload = () => {
    if (isReloadingRef.current) return;
    
    isReloadingRef.current = true;
    try {
      originalReload();
    } finally {
      setTimeout(() => {
        isReloadingRef.current = false;
      }, 0);
    }
  };

  // Add the final response as a separate message after tool calls
  useEffect(() => {
    // Skip if changes are due to model change
    if (isReloadingRef.current) return;
    
    const lastMsg = messages[messages.length - 1];
    
    // If we have a response after tool call completed and haven't added it yet
    if (lastMsg && 
        lastMsg.role === 'assistant' && 
        lastMsg.content && 
        !lastToolCallRef.current && 
        toolCallResponseRef.current && 
        !hasAddedFinalResponseRef.current) {
      
      // Add the final response as a new message
      setChatMessages(prev => {
        // Ensure we don't add the final response multiple times
        const existingFinalResponse = prev.find(msg => msg.isFinalResponse && 
                                           msg.conversationTurn === currentConversationTurn.current);
        
        if (existingFinalResponse) {
          // Update the content of the existing final response (for streaming)
          return prev.map(msg => {
            if (msg === existingFinalResponse) {
              return {
                ...msg,
                content: lastMsg.content
              };
            }
            return msg;
          });
        }
        
        // Create a new assistant message with just the content
        return [
          ...prev,
          {
            role: 'assistant',
            content: lastMsg.content,
            isFinalResponse: true,
            conversationTurn: currentConversationTurn.current
          }
        ];
      });
      
      // Only mark as added when loading is complete
      if (status === 'ready') {
        hasAddedFinalResponseRef.current = true;
        toolCallResponseRef.current = "";
      }
    }
  }, [messages, status]);

  // Handle regular assistant messages (non-tool responses)
  useEffect(() => {
    // Skip if changes are due to model change
    if (isReloadingRef.current) return;
    
    // Only process if there are messages
    if (messages.length === 0) return;
    
    const lastMsg = messages[messages.length - 1];
    
    // If we have a regular assistant message (not a tool response), add it
    if (lastMsg && 
        lastMsg.role === 'assistant' && 
        lastMsg.content && 
        !lastToolCallRef.current && 
        !toolCallResponseRef.current) {
      
      setChatMessages(prev => {
        // Look for an existing message to update (for streaming)
        const existingMsgIndex = prev.findIndex(msg => 
          msg.role === 'assistant' && 
          !msg.toolCalls?.length &&
          !msg.isFinalResponse &&
          msg.conversationTurn === currentConversationTurn.current
        );
        
        if (existingMsgIndex !== -1) {
          // Update existing message with new content (streaming)
          const updatedMessages = [...prev];
          updatedMessages[existingMsgIndex] = {
            ...updatedMessages[existingMsgIndex],
            content: lastMsg.content
          };
          return updatedMessages;
        }
        
        // If no existing message found, add a new one
        return [
          ...prev, 
          {
            role: 'assistant',
            content: lastMsg.content,
            conversationTurn: currentConversationTurn.current
          }
        ];
      });
    }
  }, [messages]);

  // Process user messages - separated to avoid loops
  useEffect(() => {
    // Skip if changes are due to model change
    if (isReloadingRef.current) return;
    
    // Only run when messages change and not just chatMessages
    if (
      messages.length === previousMessagesLengthRef.current &&
      chatMessages.length === previousChatMessagesLengthRef.current
    ) {
      return;
    }
    
    previousMessagesLengthRef.current = messages.length;
    previousChatMessagesLengthRef.current = chatMessages.length;
    
    if (messages.length === 0) {
      if (chatMessages.length > 0) {
        setChatMessages([]);
      }
      hasAddedFinalResponseRef.current = false;
      toolCallResponseRef.current = "";
      toolExecutionMsgMap.current.clear();
      currentConversationTurn.current = 0;
      return;
    }
    
    // Detect a new user message to increment conversation turn
    const userMessageCount = messages.filter(m => m.role === 'user').length;
    if (userMessageCount > currentConversationTurn.current) {
      currentConversationTurn.current = userMessageCount;
    }
    
    // Process only user messages to add them to our state
    const processingPromises: Promise<void>[] = [];
    
    messages.forEach((message) => {
      if (message.role === 'user') {
        // Check if we already have this user message
        const existingMessageIndex = chatMessages.findIndex(
          (m) => m.role === 'user' && m.content === message.content
        );
        
        if (existingMessageIndex === -1) {
          const promise = Promise.resolve().then(() => {
            setChatMessages(prev => {
              const newUserMsg: ChatMessage = {
                role: 'user',
                content: message.content,
                conversationTurn: currentConversationTurn.current
              };
              return [...prev, newUserMsg];
            });
          });
          processingPromises.push(promise);
        }
      }
    });
    
    // Wait for all user message processing to complete
    Promise.all(processingPromises).catch(console.error);
  }, [messages, chatMessages]);

  // Handle tool call outputs
  useEffect(() => {
    // Skip if changes are due to model change
    if (isReloadingRef.current) return;
    
    const handleToolCallOutput = (content: string) => {
      // Save the tool call output for later use
      toolCallResponseRef.current = content;
      
      // If we have a tool call in progress, update it with the output
      if (lastToolCallRef.current) {
        const toolCallId = lastToolCallRef.current.id;
        lastToolCallRef.current.output = "Tool response received.";
        lastToolCallRef.current.status = 'completed';
        
        // Update the chat message that contains this tool call
        setChatMessages(prevMessages => {
          // Find the message index from our map
          const msgIndex = toolCallId ? toolExecutionMsgMap.current.get(toolCallId) : undefined;
          
          if (msgIndex !== undefined && typeof msgIndex === 'number' && msgIndex < prevMessages.length) {
            const updatedMessages = [...prevMessages];
            const messageToUpdate = updatedMessages[msgIndex];
            
            if (messageToUpdate.toolCalls?.length) {
              const updatedToolCalls = messageToUpdate.toolCalls.map((tc: ToolCall) => {
                if (tc.name === lastToolCallRef.current?.name && 
                    JSON.stringify(tc.args) === JSON.stringify(lastToolCallRef.current?.args)) {
                  return { ...tc, output: "Tool response received.", status: 'completed' as const };
                }
                return tc;
              });
              
              updatedMessages[msgIndex] = {
                ...messageToUpdate,
                toolCalls: updatedToolCalls,
                isToolInProgress: false,
                content: ''
              };
            }
            
            return updatedMessages;
          }
          
          return prevMessages;
        });
        
        // Reset the tool call reference
        lastToolCallRef.current = null;
        
        // Immediately try to add a final response placeholder for streaming
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && !hasAddedFinalResponseRef.current) {
          setChatMessages(prev => {
            // Check if we already have a final response for this turn
            if (prev.some(msg => msg.isFinalResponse && msg.conversationTurn === currentConversationTurn.current)) {
              return prev;
            }
            
            // Add an empty placeholder for the final response
            return [
              ...prev,
              {
                role: 'assistant',
                content: '',  // Will be filled as content streams in
                isFinalResponse: true,
                conversationTurn: currentConversationTurn.current
              }
            ];
          });
        }
      }
    };

    // Check the last message for potential tool outputs
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && 
        lastMsg.role === 'assistant' && 
        lastMsg.content && 
        lastToolCallRef.current && 
        !lastToolCallRef.current.output && 
        !hasAddedFinalResponseRef.current) {
      handleToolCallOutput(lastMsg.content);
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Also scroll to bottom when loading state changes
  useEffect(() => {
    scrollToBottom();
  }, [status]);

  // Set up mutation observer to detect content streaming and scroll as it comes in
  useEffect(() => {
    if (!chatContainerRef.current) return;

    // Create an observer that will watch for DOM changes
    const observer = new MutationObserver(() => {
      // Check if we should scroll (if user is near bottom already)
      const container = chatContainerRef.current!;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isNearBottom || status === 'submitted' || status === 'streaming') {
        scrollToBottom();
      }
    });

    // Start observing the chat container
    observer.observe(chatContainerRef.current, {
      childList: true,  // Watch for changes to the direct children
      subtree: true,    // Watch for changes to all descendants
      characterData: true // Watch for changes to text content
    });

    return () => {
      observer.disconnect();
    };
  }, [status]);

  // Reset state after loading is complete
  useEffect(() => {
    if (status === 'ready' && isProcessingTool.current) {
      isProcessingTool.current = false;
    }
  }, [status]);

  // Fetch tool options (only once)
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

  // Handle model changes
  useEffect(() => {
    // Detect model change
    if (selectedModel !== previousModelRef.current) {
      previousModelRef.current = selectedModel;
      
      // Only reload if there are existing messages
      if (messages.length > 0) {
        // Reset state before reload
        setChatMessages([]);
        hasAddedFinalResponseRef.current = false;
        toolCallResponseRef.current = "";
        toolExecutionMsgMap.current.clear();
        
        // Reload with a small delay to allow state updates
        setTimeout(() => {
          reload();
        }, 0);
      }
    }
  }, [selectedModel, messages.length]);

  const handleRetry = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setErrorDetails(null);
    reload();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    if(status === 'submitted' || status === 'streaming') {
      return;
    }
    
    e.preventDefault();
    setErrorDetails(null);
    setHistoryIndex(null); // Reset history index after sending a message
    hasAddedFinalResponseRef.current = false;
    toolCallResponseRef.current = "";
    // Increment conversation turn on new message
    currentConversationTurn.current += 1;
    
    try {
      await handleSubmit(e);
    } catch {
      // Error handled by onError callback
    }
  };

  const toggleToolExpansion = (messageIdx: number, toolIdx: number) => {
    const key = `${messageIdx}-${toolIdx}`;
    setExpandedTools(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

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
    reload
  };
}