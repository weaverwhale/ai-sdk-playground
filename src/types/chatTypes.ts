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

export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'error';

export interface PlanStepToolResult {
  toolName: string;
  result: string;
}

export interface PlanStep {
  id: string;
  description: string;
  status: PlanStepStatus;
  output?: string;
  error?: string;
  toolCalls?: ToolCall[];
}

export interface SearchPlan {
  createdAt: string;
  query: string;
  complexity: 'low' | 'medium' | 'high';
  steps: PlanStep[];
  conversationTurn?: number;
  summary?: string;
}

// Chat hook props and result types
export interface UseChatbotMessagesProps {
  selectedModel: string;
  isDeepSearchMode?: boolean;
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
  clearConversation: () => void;
  searchPlan?: SearchPlan;
  isDeepSearchMode: boolean;
  isCreatingPlan: boolean;
}

// Server monitoring hook result type
export interface ServerMonitoringResult {
  serverStatus: 'checking' | 'online' | 'offline';
  serverInfo: string | null;
  errorDetails: string | null;
  availableModels: Model[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  retryConnection: () => Promise<void>;
}

// Action types for our chat state reducer
export type ChatAction =
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'SET_CHAT_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_USER_MESSAGE'; payload: string }
  | { type: 'ADD_ASSISTANT_MESSAGE'; payload: { content: string; conversationTurn: number } }
  | { type: 'UPDATE_ASSISTANT_MESSAGE'; payload: { content: string; conversationTurn: number } }
  | { type: 'ADD_TOOL_CALL'; payload: { toolCall: ToolCall; conversationTurn: number } }
  | {
      type: 'UPDATE_TOOL_CALL';
      payload: { toolCallId: string; status: 'completed' | 'error'; output?: string };
    }
  | { type: 'ADD_FINAL_RESPONSE'; payload: { content: string; conversationTurn: number } }
  | { type: 'UPDATE_FINAL_RESPONSE'; payload: { content: string; conversationTurn: number } }
  | { type: 'INCREMENT_CONVERSATION_TURN' }
  | { type: 'SET_SEARCH_PLAN'; plan: SearchPlan; conversationTurn: number }
  | {
      type: 'UPDATE_PLAN_STEP';
      payload: {
        stepId: string;
        status: PlanStepStatus;
        output?: string;
        error?: string;
        toolCalls?: ToolCall[];
      };
    }
  | { type: 'UPDATE_SEARCH_PLAN'; plan: SearchPlan; conversationTurn: number }
  | { type: 'MARK_PLAN_STEPS_ERROR'; error: string; conversationTurn: number }
  | { type: 'SET_IS_CREATING_PLAN'; isCreatingPlan: boolean };

// State for our chat reducer
export interface ChatState {
  chatMessages: ChatMessage[];
  currentConversationTurn: number;
  toolExecutionMsgMap: Map<string, number>;
  searchPlan?: SearchPlan;
  isCreatingPlan?: boolean;
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
  searchPlan?: SearchPlan;
  isDeepSearchMode: boolean;
  isCreatingPlan: boolean;
}

export interface SearchPlanProps {
  plan: SearchPlan;
}

export interface SearchPlanStepProps {
  step: PlanStep;
}
