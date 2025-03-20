import { useChat } from '@ai-sdk/react';
import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import ToolIndicator from './ToolIndicator';
import MermaidDiagram from './MermaidDiagram';
import type { Components } from 'react-markdown';

import './Chatbot.css';

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  output?: string;
  description?: string;
  status?: 'running' | 'completed' | 'error';
  displayName?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isToolInProgress?: boolean;
}

interface Model {
  id: string;
  name: string;
}

// Create a more permissive code component for ReactMarkdown
const CodeBlock: Components['code'] = (props) => {
  const { className, children } = props;
  const language = className ? className.replace('language-', '') : '';
  const content = String(children).trim();
  
  // Handle mermaid diagrams
  if (language === 'mermaid') {
    return <MermaidDiagram chart={content} />;
  }
  
  // Regular code blocks
  return (
    <pre className={className}>
      <code className={className}>{content}</code>
    </pre>
  );
};

// Create an interface for tool info with name instead of displayName
interface ToolInfo {
  id: string;
  description: string;
  name: string;
}

export default function Chatbot() {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverInfo, setServerInfo] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const storedModel = typeof window !== 'undefined' ? localStorage.getItem('selectedModel') : null;
    return storedModel || 'openai';
  });
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [toolOptions, setToolOptions] = useState<Record<string, ToolInfo>>({});
  const [activeToolCall, setActiveToolCall] = useState<{name: string, description?: string} | null>(null);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const isProcessingTool = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const { messages, input, setInput, handleSubmit, isLoading, error, reload } = useChat({
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
    },
    onToolCall: (event) => {
      isProcessingTool.current = true;
      
      // Get the tool name directly from the event
      const toolInfo = toolOptions[event.toolCall?.toolName];
      const toolName = toolInfo?.name || "AI Tool";
      
      // Set the active tool with its description if available
      setActiveToolCall({
        name: toolName,
        description: toolInfo?.description || "Using tool to retrieve information",
      });
    }
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Also scroll to bottom when loading state changes
  useEffect(() => {
    scrollToBottom();
  }, [isLoading]);

  // Set up mutation observer to detect content streaming and scroll as it comes in
  useEffect(() => {
    if (!chatContainerRef.current) return;

    // Create an observer that will watch for DOM changes
    const observer = new MutationObserver(() => {
      // Check if we should scroll (if user is near bottom already)
      const container = chatContainerRef.current!;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isNearBottom || isLoading) {
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
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading && isProcessingTool.current) {
      isProcessingTool.current = false;
      setActiveToolCall(null);
    }
  }, [isLoading]);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 1500;
    
    const checkServerHealth = async () => {
      try {
        const response = await fetch('/api/health');
        await response.json();
        
        setServerStatus('online');
        setServerInfo(`Server is online (as of ${new Date().toLocaleTimeString()})`);
        
        try {
          const modelsResponse = await fetch('/api/models');
          const modelsData = await modelsResponse.json();
          
          if (modelsData && Array.isArray(modelsData.models)) {
            setAvailableModels(modelsData.models);
            
            if (modelsData.models.length === 0) {
              setErrorDetails('No AI models are available. Please check your API keys.');
            }
            else if (modelsData.models.length > 0 && (!selectedModel || !modelsData.models.find((m: Model) => m.id === selectedModel))) {
              setSelectedModel(modelsData.models[0].id);
            }
          } else {
            setErrorDetails('Failed to retrieve model information from the server.');
          }
        } catch {
          setErrorDetails('Failed to fetch available AI models. Please try again later.');
        }
      } catch {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(checkServerHealth, retryDelay);
        } else {
          setServerStatus('offline');
          setServerInfo('Could not connect to the server after multiple attempts. Please check if the server is running.');
        }
      }
    };

    checkServerHealth();
    
    const intervalId = setInterval(() => {
      checkServerHealth();
    }, 30000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  useEffect(() => {
    if (messages.length > 0) {
      reload();
    }
  }, [selectedModel]);

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
    if(isLoading) {
      return;
    }
    
    e.preventDefault();
    setErrorDetails(null);
    setHistoryIndex(null); // Reset history index after sending a message
    
    try {
      await handleSubmit(e);
    } catch {
      // Error handled by onError callback
    }
  };
  
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModel(e.target.value);
  };

  const toggleToolExpansion = (messageIdx: number, toolIdx: number) => {
    const key = `${messageIdx}-${toolIdx}`;
    setExpandedTools(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Update localStorage when selected model changes
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedModel) {
      localStorage.setItem('selectedModel', selectedModel);
    }
  }, [selectedModel]);

  if (serverStatus === 'checking') {
    return (
      <div className="chatbot-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (serverStatus === 'offline') {
    return (
      <div className="chatbot-container">
        <div className="error-container">
          <h3>Server Connection Error</h3>
          <p>{serverInfo}</p>
          <button 
            onClick={() => setServerStatus('checking')}
            className="retry-button"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chatbot-container">
      {serverInfo && <div className="server-status">{serverInfo}</div>}
      
      <div className="model-selector">
        <label htmlFor="model-select">AI Model:</label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={handleModelChange}
          disabled={isLoading || availableModels.length === 0}
        >
          {availableModels.length === 0 && <option value="">No models available</option>}
          {availableModels.map(model => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
      
      <div className="chat-messages" ref={chatContainerRef}>
        {messages.map((message, index) => {
          const toolCalls = (message as ChatMessage).toolCalls || [];
          const isToolInProgress = (message as ChatMessage).isToolInProgress;
          
          if (message.role === 'assistant' && !message.content.trim() && isProcessingTool.current) {
            return null;
          }
          
          return (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-content">
                {message.content.trim() ? (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      code: CodeBlock,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : message.role === 'assistant' && toolCalls.length > 0 ? (
                  <div className="empty-message-placeholder">Processing response...</div>
                ) : null}
              </div>
              
              {isToolInProgress && (
                <div className="tool-in-progress">
                  <div className="tool-spinner"></div>
                  <span>Tool execution in progress...</span>
                </div>
              )}
              
              {toolCalls.map((toolCall, idx) => {
                const isExpanded = expandedTools[`${index}-${idx}`] !== false;
                const toolInfo = toolOptions[toolCall.name];
                
                return (
                  <div key={idx} className="tool-invocation">
                    <div 
                      className="tool-header"
                      onClick={() => toggleToolExpansion(index, idx)}
                    >
                      <div className="tool-name">
                        <span className="tool-icon">🔧</span>
                        {toolInfo ? 
                          <>Tool: <span className="tool-name-text">{toolInfo.name}</span></> : 
                          "AI Tool"
                        }
                        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
                      </div>
                      {toolInfo && (
                        <div className="tool-description">
                          {toolInfo.description}
                        </div>
                      )}
                    </div>
                    
                    {isExpanded && (
                      <>
                        <div className="tool-args">
                          <div className="tool-section-label">Arguments:</div>
                          <pre>{JSON.stringify(toolCall.args, null, 2)}</pre>
                        </div>
                        {toolCall.output && (
                          <div className="tool-response">
                            <div className="tool-section-label">Response:</div>
                            <div className="tool-response-content">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                                components={{
                                  code: CodeBlock,
                                }}
                              >
                                {toolCall.output}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              {activeToolCall ? (
                <div className="thinking-with-tool">
                  <ToolIndicator 
                    name={activeToolCall.name} 
                    isActive={true} 
                    description={activeToolCall.description}
                  />
                </div>
              ) : (
                <div className="thinking-animation">
                  <span className="thinking-text">Thinking</span>
                  <div className="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="message error">
            <div className="message-content">
              <p>Error: {error.message}</p>
              {errorDetails && errorDetails !== error.message && (
                <p className="error-details">Details: {errorDetails}</p>
              )}
              <button 
                onClick={handleRetry}
                className="retry-button"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input" onSubmit={handleManualSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything..."
          className="input-field"
        />
        <button 
          className="send-button"
          type="submit"
          disabled={isLoading}
        >
          Send
        </button>
      </form>
    </div>
  );
} 