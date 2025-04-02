import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import MermaidDiagram from '../MermaidDiagram';
import SearchPlanDisplay from '../SearchPlanDisplay';
import GenerativeUIDisplay from '../GenerativeUIDisplay';
import type { Components } from 'react-markdown';
import { useChatbotMessages } from '../../hooks/useChatbotMessages';
import { useServerMonitoring } from '../../hooks/useServerMonitoring';
import {
  MessageProps,
  ToolCallsDisplayProps,
  ChatMessagesProps,
  ChatMessage,
} from '../../types/chatTypes';
import { useDeepSearch } from '../../hooks/useDeepSearch';
import { useUserInfo } from '../../hooks/useUserInfo';

import './index.css';

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

const Message = memo(
  ({ message, expandedTools, toolOptions, toggleToolExpansion, messageIndex }: MessageProps) => {
    const toolCalls = message.toolCalls || [];
    const isToolInProgress = message.isToolInProgress;
    const content = message.content.trim();

    // Check for pure JSX content
    const isGenerativeUI = content.startsWith('<') && content.endsWith('>');

    // Check for JSX in code blocks
    const jsxCodeBlockRegex = /```(?:jsx|tsx)?\s*\n((?:<.*?>[\s\S]*<\/.*?>)|(?:<.*?\/>\s*))\n```/g;
    const hasJsxCodeBlock = jsxCodeBlockRegex.test(content);

    // Extract JSX code from code blocks if present
    const extractJsxFromCodeBlock = (text: string) => {
      const matches: string[] = [];
      const regex = /```(?:jsx|tsx)?\s*\n((?:<.*?>[\s\S]*<\/.*?>)|(?:<.*?\/>\s*))\n```/g;
      let match;

      // Clone the content for ReactMarkdown rendering
      let markdownContent = text;

      while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
          matches.push(match[1]);

          // Replace JSX code blocks with placeholders in the markdown content
          markdownContent = markdownContent.replace(match[0], `[JSX Component ${matches.length}]`);
        }
      }

      return { matches, markdownContent };
    };

    const { matches: jsxSnippets, markdownContent } = hasJsxCodeBlock
      ? extractJsxFromCodeBlock(content)
      : { matches: [], markdownContent: content };

    // Skip empty assistant messages
    if (message.role === 'assistant' && !content && toolCalls.length === 0) {
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
        {content && (
          <div className="message-content">
            {isGenerativeUI ? (
              <GenerativeUIDisplay jsxString={content} />
            ) : hasJsxCodeBlock ? (
              <>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    code: CodeBlock,
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>

                {jsxSnippets.map((jsxString, index) => (
                  <div key={index} className="jsx-preview mt-4 mb-4">
                    <div className="jsx-preview-label mb-2 text-sm text-gray-500">JSX Preview:</div>
                    <GenerativeUIDisplay jsxString={jsxString} />
                  </div>
                ))}
              </>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  code: CodeBlock,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
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
                  {toolCall.output &&
                  toolCall.name === 'generativeUi' &&
                  toolCall.output.trim().startsWith('<') ? (
                    <div className="tool-output">
                      <div className="tool-section-label">Generated UI:</div>
                      <GenerativeUIDisplay jsxString={toolCall.output} />
                    </div>
                  ) : toolCall.output ? (
                    <div className="tool-output">
                      <div className="tool-section-label">Output:</div>
                      <pre>{toolCall.output}</pre>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  },
);

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
    isExecutingPlan,
  }: ChatMessagesProps) => {
    // Deduplicate messages before rendering
    // This specifically addresses the issue with duplicate messages after tool calls
    const deduplicatedMessages = useMemo(() => {
      const uniqueMessages: ChatMessage[] = [];
      const seenContent = new Set<string>();

      // Process messages in order, keeping track of what we've seen
      chatMessages.forEach((message) => {
        // Always include user messages
        if (message.role === 'user') {
          uniqueMessages.push(message);
          return;
        }

        // Always include messages with tool calls
        if (message.toolCalls && message.toolCalls.length > 0) {
          uniqueMessages.push(message);
          return;
        }

        // For assistant messages without tool calls, check for duplicates
        const content = message.content.trim();

        // If we've seen this exact content before, skip it
        if (seenContent.has(content)) {
          console.log('Skipping duplicate message:', content.substring(0, 30) + '...');
          return;
        }

        // Otherwise, add it to our tracking and to the output array
        seenContent.add(content);
        uniqueMessages.push(message);
      });

      return uniqueMessages;
    }, [chatMessages]);

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

        {deduplicatedMessages.map((message, index) => (
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
        {((isDeepSearchMode && (isExecutingPlan || (searchPlan && !searchPlan.summary))) ||
          status === 'submitted') &&
          !onFinalResponse && (
            <div className="message assistant">
              <div className="message-content">
                <div className="thinking-animation">
                  <span className="thinking-text">
                    {isDeepSearchMode && isExecutingPlan ? 'Executing search plan' : 'Thinking'}
                  </span>
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

  const { userId } = useUserInfo();

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
    isExecutingPlan,
  } = useChatbotMessages({
    selectedModel,
    isDeepSearchMode,
    userId,
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
          isExecutingPlan={isExecutingPlan}
        />

        {/* Display search plan if in deep search mode and plan exists */}
        {isDeepSearchMode && searchPlan && (
          <div className="message assistant search-plan-container">
            <SearchPlanDisplay plan={searchPlan} toolOptions={toolOptions} />
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
