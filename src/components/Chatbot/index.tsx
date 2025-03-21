import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import MermaidDiagram from '../MermaidDiagram';
import SearchPlanDisplay from '../SearchPlanDisplay';
import type { Components } from 'react-markdown';
import { useChatbotMessages } from '../../hooks/useChatbotMessages';
import { useServerMonitoring } from '../../hooks/useServerMonitoring';
import { MessageProps, ToolCallsDisplayProps, ChatMessagesProps } from '../../types/chatTypes';
import { useDeepSearch } from '../../hooks/useDeepSearch';

import './index.css';

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

// Extracted Message component to improve readability
const Message = memo(
  ({ message, expandedTools, toolOptions, toggleToolExpansion, messageIndex }: MessageProps) => {
    const toolCalls = message.toolCalls || [];
    const isToolInProgress = message.isToolInProgress;

    // Skip empty assistant messages
    if (message.role === 'assistant' && !message.content.trim() && toolCalls.length === 0) {
      return null;
    }

    return (
      <div className={`message ${message.role}`}>
        {/* Display tool calls before the message content */}
        {toolCalls.length > 0 && (
          <ToolCallsDisplay
            toolCalls={toolCalls}
            expandedTools={expandedTools}
            toolOptions={toolOptions}
            toggleToolExpansion={toggleToolExpansion}
            messageIndex={messageIndex}
          />
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
  },
);

Message.displayName = 'Message';

// Extracted ToolCalls component
const ToolCallsDisplay = memo(
  ({
    toolCalls,
    expandedTools,
    toolOptions,
    toggleToolExpansion,
    messageIndex,
  }: ToolCallsDisplayProps) => {
    return (
      <div className="tool-calls-container">
        {toolCalls.map((toolCall, idx) => {
          const isExpanded = expandedTools[`${messageIndex}-${idx}`] === true;
          const toolInfo = toolOptions[toolCall.name];
          const displayName = toolCall.displayName || toolInfo?.name || toolCall.name || 'AI Tool';
          const description =
            toolCall.description || toolInfo?.description || 'Using tool to retrieve information';
          const status = toolCall.status || 'completed';

          return (
            <div
              key={`${messageIndex}-${idx}-${toolCall.id}`}
              className={`tool-invocation tool-status-${status}`}
            >
              <div className="tool-header" onClick={() => toggleToolExpansion(messageIndex, idx)}>
                <div className="tool-name">
                  <span className="tool-icon">
                    {status === 'running' ? '⏳' : status === 'completed' ? '✅' : '❌'}
                  </span>
                  <>
                    Calling<span className="tool-name-text">{displayName}</span>
                  </>
                  <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
                </div>
                <div className="tool-description">{description}</div>
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
                  {toolCall.output && (
                    <div className="tool-output">
                      <div className="tool-section-label">Output:</div>
                      <pre>{toolCall.output}</pre>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  },
);

ToolCallsDisplay.displayName = 'ToolCallsDisplay';

// Extracted ChatMessages component
const ChatMessages = memo(
  ({
    chatMessages,
    status,
    error,
    errorDetails,
    expandedTools,
    toolOptions,
    toggleToolExpansion,
    onFinalResponse,
    messagesEndRef,
    chatContainerRef,
    handleRetry,
    searchPlan,
    isDeepSearchMode,
    isCreatingPlan,
  }: ChatMessagesProps) => {
    return (
      <div className="chat-messages" ref={chatContainerRef}>
        {chatMessages.length === 0 && (
          <div className="message assistant empty-state">
            <div className="message-content">
              <div className="welcome-message">
                <h3>👋 Welcome to the Chat</h3>
                <p>Type a message below to get started!</p>
                <ul>
                  <li>Ask me questions about code or general topics</li>
                  <li>Request help with debugging or explaining concepts</li>
                  <li>I can help you build or improve your projects</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {chatMessages.map((message, index) => (
          <Message
            key={index}
            message={message}
            expandedTools={expandedTools}
            toolOptions={toolOptions}
            toggleToolExpansion={toggleToolExpansion}
            messageIndex={index}
          />
        ))}

        {/* Show loading indicator when creating plan in deep search mode */}
        {isDeepSearchMode && isCreatingPlan && !searchPlan && (
          <div className="message assistant">
            <div className="message-content">
              <div className="thinking-animation">
                <span className="thinking-text">Creating search plan</span>
                <div className="thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Only show thinking animation if we don't already have a streaming response */}
        {((isDeepSearchMode && searchPlan) || status === 'submitted') && !onFinalResponse && (
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
              {errorDetails && errorDetails !== error.message && (
                <p className="error-details">Details: {errorDetails}</p>
              )}
              <button onClick={handleRetry} className="retry-button">
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    );
  },
);

ChatMessages.displayName = 'ChatMessages';

const Chatbot: React.FC = () => {
  // Use server monitoring hook
  const {
    serverStatus,
    serverInfo,
    availableModels,
    selectedModel,
    setSelectedModel,
    retryConnection,
  } = useServerMonitoring();

  const { isDeepSearchMode, setIsDeepSearchMode } = useDeepSearch({
    orchestratorModel: selectedModel,
    workerModel: selectedModel,
  });

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
    clearConversation,
    searchPlan,
    isCreatingPlan,
  } = useChatbotMessages({
    selectedModel,
    isDeepSearchMode,
  });

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModel(e.target.value);
    clearConversation();
  };

  const toggleDeepSearchMode = () => {
    setIsDeepSearchMode(!isDeepSearchMode);
    clearConversation();
  };

  if (serverStatus === 'checking') {
    return (
      <div className={`chatbot-container ${isDeepSearchMode && searchPlan ? 'deep-search' : ''}`}>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (serverStatus === 'offline') {
    return (
      <div className={`chatbot-container ${isDeepSearchMode && searchPlan ? 'deep-search' : ''}`}>
        <div className="error-container">
          <h3>Server Connection Error</h3>
          <p>{serverInfo}</p>
          <button onClick={retryConnection} className="retry-button">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`chatbot-container ${isDeepSearchMode && searchPlan ? 'deep-search' : ''}`}>
      {serverInfo && <div className="server-status">{serverInfo}</div>}

      <div className="chat-controls">
        <div
          className={`model-selector ${
            status === 'submitted' || status === 'streaming' || availableModels.length === 0
              ? 'disabled'
              : ''
          }`}
        >
          <select
            id="model-select"
            value={selectedModel}
            onChange={handleModelChange}
            disabled={
              status === 'submitted' || status === 'streaming' || availableModels.length === 0
            }
            aria-label="Select AI model"
          >
            {availableModels.length === 0 && <option value="">No models available</option>}
            {availableModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="chatbot-options">
          <div
            className={`search-mode-toggle ${
              status === 'submitted' || status === 'streaming' ? 'disabled' : ''
            }`}
          >
            <label className="toggle-switch">
              <input
                type="checkbox"
                id="deep-search-toggle"
                checked={isDeepSearchMode}
                onChange={toggleDeepSearchMode}
                disabled={status === 'submitted' || status === 'streaming'}
              />
              <span className="toggle-slider"></span>
            </label>
            <label htmlFor="deep-search-toggle" className="toggle-label">
              Deep Search
            </label>
          </div>

          <button
            className="clear-button"
            onClick={clearConversation}
            disabled={status === 'submitted' || status === 'streaming' || chatMessages.length === 0}
          >
            Clear Chat
          </button>
        </div>
      </div>

      <div className={`messages-container ${isDeepSearchMode && searchPlan ? 'deep-search' : ''}`}>
        <ChatMessages
          chatMessages={chatMessages}
          status={status}
          error={error}
          errorDetails={chatErrorDetails}
          expandedTools={expandedTools}
          toolOptions={toolOptions}
          toggleToolExpansion={toggleToolExpansion}
          onFinalResponse={onFinalResponse}
          messagesEndRef={messagesEndRef}
          chatContainerRef={chatContainerRef}
          handleRetry={handleRetry}
          searchPlan={searchPlan}
          isDeepSearchMode={isDeepSearchMode}
          isCreatingPlan={isCreatingPlan}
        />

        {/* Display search plan if in deep search mode and plan exists */}
        {isDeepSearchMode && searchPlan && (
          <div className="message assistant search-plan-container">
            <SearchPlanDisplay plan={searchPlan} />
          </div>
        )}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isDeepSearchMode ? 'Ask a complex question...' : 'Ask me anything...'}
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
};

export default Chatbot;
