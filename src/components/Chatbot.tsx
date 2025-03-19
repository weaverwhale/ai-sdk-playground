'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useState } from 'react';
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

export default function Chatbot() {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverInfo, setServerInfo] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Use the API endpoint being proxied by Vite
  const { messages, input, setInput, handleSubmit, isLoading, error, reload } = useChat({
    api: '/api/chat',
    maxSteps: 5, // Allow multiple tool calls in sequence
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
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              {message.content}
            </div>
            {/* Display tool calls when they exist */}
            {(message as ChatMessage).toolCalls?.map((toolCall, idx) => (
              <div key={idx} className="tool-invocation">
                <div className="tool-name">Tool: {toolCall.name}</div>
                <div className="tool-args">Arguments: {JSON.stringify(toolCall.args)}</div>
                {toolCall.output && (
                  <div className="tool-response">Response: {toolCall.output}</div>
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
          placeholder="Ask me about the weather..."
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