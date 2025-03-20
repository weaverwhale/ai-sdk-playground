import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import MermaidDiagram from './MermaidDiagram';
import type { Components } from 'react-markdown';
import { useChatbotMessages } from './hooks/chatbotMessages';
import { useServerMonitoring } from './hooks/serverMonitoring';

import './Chatbot.css';

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

export default function Chatbot() {
  // Use server monitoring hook
  const {
    serverStatus,
    serverInfo,
    availableModels,
    selectedModel,
    setSelectedModel,
    retryConnection
  } = useServerMonitoring();

  // Use chatbot messages hook
  const {
    chatMessages,
    input,
    setInput,
    status,
    error,
    errorDetails: chatErrorDetails,
    expandedTools,
    toolOptions,
    handleSubmit,
    handleRetry,
    handleKeyDown,
    toggleToolExpansion,
    onFinalResponse,
    messagesEndRef,
    chatContainerRef,
    clearConversation
  } = useChatbotMessages({ selectedModel });

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
            onClick={retryConnection}
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
      
      <div className="chat-controls">
        <div className="model-selector">
          <select
            id="model-select"
            value={selectedModel}
            onChange={handleModelChange}
            disabled={(status === 'submitted' || status === 'streaming') || availableModels.length === 0}
          >
            {availableModels.length === 0 && <option value="">No models available</option>}
            {availableModels.map(model => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
        <button 
          className="clear-button"
          onClick={clearConversation}
          disabled={status === 'submitted' || status === 'streaming' || chatMessages.length === 0}
        >
          Clear Conversation
        </button>
      </div>
      
      <div className="chat-messages" ref={chatContainerRef}>
        {chatMessages.map((message, index) => {
          const toolCalls = message.toolCalls || [];
          const isToolInProgress = message.isToolInProgress;
          
          // Skip empty assistant messages
          if (message.role === 'assistant' && !message.content.trim() && toolCalls.length === 0) {
            return null;
          }
          
          return (
            <div key={index} className={`message ${message.role}`}>
              {/* Display tool calls before the message content */}
              {toolCalls.length > 0 && (
                <div className="tool-calls-container">
                  {toolCalls.map((toolCall, idx) => {
                    const isExpanded = expandedTools[`${index}-${idx}`] === true;
                    const toolInfo = toolOptions[toolCall.name];
                    const displayName = toolCall.displayName || toolInfo?.name || toolCall.name || "AI Tool";
                    const description = toolCall.description || toolInfo?.description || "Using tool to retrieve information";
                    const status = toolCall.status || 'completed';
                    
                    return (
                      <div key={idx} className={`tool-invocation tool-status-${status}`}>
                        <div 
                          className="tool-header"
                          onClick={() => toggleToolExpansion(index, idx)}
                        >
                          <div className="tool-name">
                            <span className="tool-icon">
                              {status === 'running' ? '⏳' : status === 'completed' ? '✅' : '❌'}
                            </span>
                            <>Calling<span className="tool-name-text">{displayName}</span></>
                            <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
                          </div>
                          <div className="tool-description">
                            {description}
                          </div>
                          {status === 'running' && (
                            <div className="tool-status-indicator">
                              <div className="tool-spinner"></div>
                              <span>Running...</span>
                            </div>
                          )}
                          {status === 'error' && (
                            <div className="tool-status-indicator tool-error">
                              <span>Error occurred</span>
                            </div>
                          )}
                        </div>
                        
                        {isExpanded && (
                          <>
                            <div className="tool-args">
                              <div className="tool-section-label">Arguments:</div>
                              <pre>{JSON.stringify(toolCall.args, null, 2)}</pre>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Display message content after tool calls */}
              {message.content.trim() && (
                <div className="message-content">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      code: CodeBlock,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
              
              {/* Show tool in progress indicator only if no individual tool cards are visible */}
              {isToolInProgress && toolCalls.length === 0 && (
                <div className="tool-in-progress">
                  <div className="tool-spinner"></div>
                  <span>Tool execution in progress...</span>
                </div>
              )}
            </div>
          );
        })}
        
        {/* Only show thinking animation if we don't already have a streaming response */}
        {(status === 'submitted') && !onFinalResponse && (
          <div className="message assistant">
            <div className="message-content">
              <div className="thinking-animation">
                <span className="thinking-text">Thinking</span>
                <div className="thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="message error">
            <div className="message-content">
              <p>Error: {error.message}</p>
              {chatErrorDetails && chatErrorDetails !== error.message && (
                <p className="error-details">Details: {chatErrorDetails}</p>
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
      
      <form className="chat-input" onSubmit={handleSubmit}>
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
          disabled={status === 'submitted' || status === 'streaming'}
        >
          Send
        </button>
      </form>
    </div>
  );
}