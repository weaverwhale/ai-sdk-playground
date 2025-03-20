// Types for chat messages and related components
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  output?: string;
  description?: string;
  status?: 'running' | 'completed' | 'error';
  displayName?: string;
  id?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isToolInProgress?: boolean;
  isFinalResponse?: boolean;
  conversationTurn?: number;
}

export interface ToolInfo {
  id: string;
  description: string;
  name: string;
}

// Match the shape expected by useChat's onToolCall callback
export interface ToolCallHandlerArg {
  toolCall: {
    toolName: string;
    args: unknown;
  };
}

export interface Model {
  id: string;
  name: string;
}

// Chat hook props and result types
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
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  reload: () => void;
  clearConversation: () => void;
}

// Server monitoring hook result type
export interface ServerMonitoringResult {
  serverStatus: 'checking' | 'online' | 'offline';
  serverInfo: string | null;
  errorDetails: string | null;
  availableModels: Model[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  retryConnection: () => void;
}

// Action types for our chat state reducer
export type ChatAction =
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'SET_CHAT_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_USER_MESSAGE'; payload: string }
  | { type: 'ADD_ASSISTANT_MESSAGE'; payload: { content: string; conversationTurn: number } }
  | { type: 'ADD_TOOL_CALL'; payload: { toolCall: ToolCall; conversationTurn: number } }
  | { type: 'UPDATE_TOOL_CALL'; payload: { toolCallId: string; status: 'completed' | 'error'; output?: string } }
  | { type: 'ADD_FINAL_RESPONSE'; payload: { content: string; conversationTurn: number } }
  | { type: 'UPDATE_FINAL_RESPONSE'; payload: { content: string; conversationTurn: number } }
  | { type: 'INCREMENT_CONVERSATION_TURN' };

// State for our chat reducer
export interface ChatState {
  chatMessages: ChatMessage[];
  currentConversationTurn: number;
  toolExecutionMsgMap: Map<string, number>;
}

// Component props types
export interface MessageProps {
  message: ChatMessage;
  expandedTools: Record<string, boolean>;
  toolOptions: Record<string, ToolInfo>;
  toggleToolExpansion: (messageIdx: number, toolIdx: number) => void;
  messageIndex: number;
}

export interface ToolCallsDisplayProps {
  toolCalls: ToolCall[];
  expandedTools: Record<string, boolean>;
  toolOptions: Record<string, ToolInfo>;
  toggleToolExpansion: (messageIdx: number, toolIdx: number) => void;
  messageIndex: number;
}

export interface ChatMessagesProps {
  chatMessages: ChatMessage[];
  status: string;
  error: Error | null | undefined;
  errorDetails: string | null | undefined;
  expandedTools: Record<string, boolean>;
  toolOptions: Record<string, ToolInfo>;
  toggleToolExpansion: (messageIdx: number, toolIdx: number) => void;
  onFinalResponse: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  handleRetry: (e: React.MouseEvent<HTMLButtonElement>) => void;
} 