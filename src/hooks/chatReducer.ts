import { ChatState, ChatAction, ChatMessage, ToolCall } from '../types/chatTypes';

/**
 * A reducer function that handles all chat state updates
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'CLEAR_CONVERSATION':
      return {
        chatMessages: [],
        currentConversationTurn: 0,
        toolExecutionMsgMap: new Map(),
        searchPlan: undefined,
      };

    case 'SET_CHAT_MESSAGES':
      return {
        ...state,
        chatMessages: action.payload,
      };

    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          {
            role: 'user',
            content: action.payload,
            conversationTurn: state.currentConversationTurn,
          },
        ],
      };

    case 'ADD_ASSISTANT_MESSAGE': {
      // Check if we already have a non-tool message for this turn
      const existingMsgIndex = state.chatMessages.findIndex(
        (msg: ChatMessage) =>
          msg.role === 'assistant' &&
          !msg.toolCalls?.length &&
          !msg.isFinalResponse &&
          msg.conversationTurn === action.payload.conversationTurn,
      );

      if (existingMsgIndex !== -1) {
        // Update existing message
        const updatedMessages = [...state.chatMessages];
        updatedMessages[existingMsgIndex] = {
          ...updatedMessages[existingMsgIndex],
          content: action.payload.content,
        };
        return {
          ...state,
          chatMessages: updatedMessages,
        };
      }

      // Add new message
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          {
            role: 'assistant',
            content: action.payload.content,
            conversationTurn: action.payload.conversationTurn,
          },
        ],
      };
    }

    case 'UPDATE_ASSISTANT_MESSAGE': {
      // Find the target message to update
      const existingMsgIndex = state.chatMessages.findIndex(
        (msg: ChatMessage) =>
          msg.role === 'assistant' &&
          !msg.toolCalls?.length &&
          !msg.isFinalResponse &&
          msg.conversationTurn === action.payload.conversationTurn,
      );

      if (existingMsgIndex === -1) {
        // If no message found, do nothing
        return state;
      }

      // Update the message
      const updatedMessages = [...state.chatMessages];
      updatedMessages[existingMsgIndex] = {
        ...updatedMessages[existingMsgIndex],
        content: action.payload.content,
      };

      return {
        ...state,
        chatMessages: updatedMessages,
      };
    }

    case 'ADD_TOOL_CALL': {
      // Add the tool call message and store its index in the map
      const newMessages = [
        ...state.chatMessages,
        {
          role: 'assistant' as const,
          content: '',
          toolCalls: [action.payload.toolCall],
          isToolInProgress: true,
          conversationTurn: action.payload.conversationTurn,
        },
      ];

      // Create a new map with the updated tool call index
      const newMap = new Map(state.toolExecutionMsgMap);
      if (action.payload.toolCall.id) {
        newMap.set(
          action.payload.toolCall.id,
          newMessages.length - 1, // Index of the just-added message
        );
      }

      return {
        ...state,
        chatMessages: newMessages,
        toolExecutionMsgMap: newMap,
      };
    }

    case 'UPDATE_TOOL_CALL': {
      const msgIndex = state.toolExecutionMsgMap.get(action.payload.toolCallId);
      if (msgIndex === undefined) return state;

      const updatedMessages = [...state.chatMessages];
      const messageToUpdate = updatedMessages[msgIndex];

      if (!messageToUpdate.toolCalls?.length) return state;

      const updatedToolCalls = messageToUpdate.toolCalls.map((tc: ToolCall) => {
        if (tc.id === action.payload.toolCallId) {
          return {
            ...tc,
            status: action.payload.status,
            output: action.payload.output || tc.output,
          };
        }
        return tc;
      });

      updatedMessages[msgIndex] = {
        ...messageToUpdate,
        toolCalls: updatedToolCalls,
        isToolInProgress: false,
      };

      return {
        ...state,
        chatMessages: updatedMessages,
      };
    }

    case 'ADD_FINAL_RESPONSE':
      // Check if we already have a final response for this turn
      if (
        state.chatMessages.some(
          (msg: ChatMessage) =>
            msg.isFinalResponse && msg.conversationTurn === action.payload.conversationTurn,
        )
      ) {
        return state;
      }

      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          {
            role: 'assistant',
            content: action.payload.content,
            isFinalResponse: true,
            conversationTurn: action.payload.conversationTurn,
          },
        ],
      };

    case 'UPDATE_FINAL_RESPONSE':
      return {
        ...state,
        chatMessages: state.chatMessages.map((msg: ChatMessage) => {
          if (msg.isFinalResponse && msg.conversationTurn === action.payload.conversationTurn) {
            return {
              ...msg,
              content: action.payload.content,
            };
          }
          return msg;
        }),
      };

    case 'INCREMENT_CONVERSATION_TURN':
      return {
        ...state,
        currentConversationTurn: state.currentConversationTurn + 1,
      };

    // New actions for deep search mode
    case 'SET_SEARCH_PLAN':
      console.log('[CHAT REDUCER] Setting search plan:', action.plan);
      return {
        ...state,
        searchPlan: action.plan,
      };

    case 'UPDATE_PLAN_STEP': {
      if (!state.searchPlan) return state;

      console.log(
        `[CHAT REDUCER] Updating step ${action.payload.stepId} to ${action.payload.status}`,
      );

      // Create a completely new steps array for proper React re-rendering
      const updatedSteps = state.searchPlan.steps.map((step) => {
        if (step.id === action.payload.stepId) {
          console.log(
            `[CHAT REDUCER] Found step to update: ${step.id} from ${step.status} to ${action.payload.status}`,
          );
          // Create a new step object with updated properties
          return {
            ...step,
            status: action.payload.status,
            ...(action.payload.output && { output: action.payload.output }),
            ...(action.payload.error && { error: action.payload.error }),
          };
        }
        // Return the same step object for unchanged steps
        return { ...step }; // Deep copy each step to ensure new reference
      });

      // Create a completely new plan object
      const updatedPlan = {
        ...state.searchPlan,
        steps: updatedSteps,
      };

      // Create a completely new state object
      const newState = {
        ...state,
        searchPlan: updatedPlan,
      };

      console.log(
        `[CHAT REDUCER] Plan updated, returning new state with ${updatedSteps.length} steps`,
      );

      return newState;
    }

    case 'UPDATE_SEARCH_PLAN': {
      if (!state.searchPlan) return state;

      console.log(`[CHAT REDUCER] Updating entire search plan`);

      // Create a completely new state object with the updated plan
      const newState = {
        ...state,
        searchPlan: {
          ...action.plan,
        },
      };

      return newState;
    }

    case 'MARK_PLAN_STEPS_ERROR': {
      if (!state.searchPlan) return state;

      console.log(`[CHAT REDUCER] Marking all pending/running steps as error: ${action.error}`);

      // Create a new steps array with error status for all pending or running steps
      const updatedSteps = state.searchPlan.steps.map((step) => {
        if (step.status === 'pending' || step.status === 'running') {
          return {
            ...step,
            status: 'error' as const,
            error: action.error || 'Failed to complete step due to polling error',
          };
        }
        return { ...step }; // Deep copy for consistent referential equality
      });

      // Create a completely new plan object
      const updatedPlan = {
        ...state.searchPlan,
        steps: updatedSteps,
      };

      return {
        ...state,
        searchPlan: updatedPlan,
      };
    }

    case 'SET_IS_CREATING_PLAN': {
      return {
        ...state,
        isCreatingPlan: action.isCreatingPlan,
      };
    }

    default:
      return state;
  }
}
