'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './Chatbot.css';
import ToolIndicator from './ToolIndicator';

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  output?: string;
  description?: string;
  status?: 'running' | 'completed' | 'error';
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

export default function Chatbot() {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverInfo, setServerInfo] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('openai');
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [toolDescriptions, setToolDescriptions] = useState<Record<string, string>>({});
  const [activeToolCall, setActiveToolCall] = useState<{name: string, description?: string} | null>(null);
  const isProcessingTool = useRef(false);
  
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
      
      try {
        let toolName = "Unknown Tool";
        
        if (event.toolCall && typeof event.toolCall === 'object') {
          if ('name' in event.toolCall) {
            toolName = (event.toolCall as {name: string}).name;
          }
          else if ('args' in event.toolCall && event.toolCall.args) {
            if ('function' in (event.toolCall.args as Record<string, unknown>)) {
              toolName = (event.toolCall.args as {function: string}).function;
            }
            else if (typeof event.toolCall.args === 'object') {
              const keys = Object.keys(event.toolCall.args as object);
              if (keys.length > 0) {
                toolName = keys[0];
              }
            }
          }
        }
        
        setActiveToolCall({
          name: toolName,
          description: toolDescriptions[toolName] || "Using tool to retrieve information"
        });
      } catch {
        setActiveToolCall({
          name: "Using AI Tools",
          description: "Processing your request with specialized tools"
        });
      }
    }
  });

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
    const fetchToolDescriptions = async () => {
      try {
        const response = await fetch('/api/tools');
        const data = await response.json();
        
        if (data && Array.isArray(data.tools)) {
          const descriptions: Record<string, string> = {};
          data.tools.forEach((tool: { name: string; description: string }) => {
            descriptions[tool.name] = tool.description || 'No description available';
          });
          setToolDescriptions(descriptions);
        }
      } catch {
        // Silently fail
      }
    };
    
    fetchToolDescriptions();
  }, []);

  const handleRetry = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setErrorDetails(null);
    reload();
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    if(isLoading) {
      return;
    }
    
    e.preventDefault();
    setErrorDetails(null);
    
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
      
      <div className="chat-messages">
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
                
                return (
                  <div key={idx} className="tool-invocation">
                    <div 
                      className="tool-header"
                      onClick={() => toggleToolExpansion(index, idx)}
                    >
                      <div className="tool-name">
                        <span className="tool-icon">🔧</span>
                        Tool: {toolCall.name}
                        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
                      </div>
                      <div className="tool-description">
                        {toolDescriptions[toolCall.name] || ''}
                      </div>
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
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
                    toolName={activeToolCall.name} 
                    isActive={true} 
                    description={activeToolCall.description}
                  />
                </div>
              ) : (
                "Thinking..."
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
      </div>
      <form className="chat-input" onSubmit={handleManualSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
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