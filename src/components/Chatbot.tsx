'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './Chatbot.css';

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  output?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
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
  
  // Use the API endpoint being proxied by Vite
  const { messages, input, setInput, handleSubmit, isLoading, error, reload } = useChat({
    api: '/api/chat',
    maxSteps: 5, // Allow multiple tool calls in sequence
    body: { modelId: selectedModel }, // Pass the selected model ID to the API
    onError: (error) => {
      console.error('Chat error:', error);
      
      // Enhance error reporting
      let errorMessage = 'Unknown error occurred';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('Error stack:', error.stack);
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error);
      }
      
      setErrorDetails(errorMessage);
    }
  });

  // Add an effect to check API connectivity on load with retries
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 1500; // 1.5 seconds between retries
    
    const checkServerHealth = async () => {
      try {
        console.log('Checking server health...');
        const response = await fetch('/api/health');
        const data = await response.json();
        console.log('Server health check:', data);
        
        setServerStatus('online');
        setServerInfo(`Server is online (as of ${new Date().toLocaleTimeString()})`);
        
        // Fetch available models from a dedicated models endpoint
        try {
          console.log('Fetching available models...');
          const modelsResponse = await fetch('/api/models');
          const modelsData = await modelsResponse.json();
          console.log('Available models:', modelsData);
          
          if (modelsData && Array.isArray(modelsData.models)) {
            setAvailableModels(modelsData.models);
            
            // If no models are available, show error
            if (modelsData.models.length === 0) {
              setErrorDetails('No AI models are available. Please check your API keys.');
            }
            // If there are models and none is selected, select the first one
            else if (modelsData.models.length > 0 && (!selectedModel || !modelsData.models.find((m: Model) => m.id === selectedModel))) {
              setSelectedModel(modelsData.models[0].id);
            }
          } else {
            setErrorDetails('Failed to retrieve model information from the server.');
          }
        } catch (modelError) {
          console.error('Error fetching models:', modelError);
          setErrorDetails('Failed to fetch available AI models. Please try again later.');
        }
      } catch (error) {
        console.error('Server health check failed:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying in ${retryDelay}ms... (${retryCount}/${maxRetries})`);
          setTimeout(checkServerHealth, retryDelay);
        } else {
          setServerStatus('offline');
          setServerInfo('Could not connect to the server after multiple attempts. Please check if the server is running.');
        }
      }
    };

    checkServerHealth();
    
    // Set up interval to check server health periodically
    const intervalId = setInterval(() => {
      checkServerHealth();
    }, 30000); // Check every 30 seconds
    
    // Clean up interval
    return () => clearInterval(intervalId);
  }, []);
  
  // Reset the chat when model changes
  useEffect(() => {
    if (messages.length > 0) {
      reload();
    }
  }, [selectedModel]);

  const handleRetry = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setErrorDetails(null);
    reload();
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDetails(null);
    
    try {
      await handleSubmit(e);
    } catch (error) {
      console.error('Manual submit error:', error);
    }
  };
  
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModel(e.target.value);
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
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
            {(message as ChatMessage).toolCalls?.map((toolCall, idx) => (
              <div key={idx} className="tool-invocation">
                <div className="tool-name">Tool: {toolCall.name}</div>
                <div className="tool-args">Arguments: {JSON.stringify(toolCall.args)}</div>
                {toolCall.output && (
                  <div className="tool-response">
                    <div className="tool-response-label">Response:</div>
                    <div className="tool-response-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {toolCall.output}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">Thinking...</div>
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
          disabled={isLoading}
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