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
        toolExecutionMsgMap: new Map()
      };

    case 'SET_CHAT_MESSAGES':
      return {
        ...state,
        chatMessages: action.payload
      };

    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          {
            role: 'user',
            content: action.payload,
            conversationTurn: state.currentConversationTurn
          }
        ]
      };

    case 'ADD_ASSISTANT_MESSAGE': {
      // Check if we already have a non-tool message for this turn
      const existingMsgIndex = state.chatMessages.findIndex((msg: ChatMessage) => 
        msg.role === 'assistant' && 
        !msg.toolCalls?.length &&
        !msg.isFinalResponse &&
        msg.conversationTurn === action.payload.conversationTurn
      );
      
      if (existingMsgIndex !== -1) {
        // Update existing message
        const updatedMessages = [...state.chatMessages];
        updatedMessages[existingMsgIndex] = {
          ...updatedMessages[existingMsgIndex],
          content: action.payload.content
        };
        return {
          ...state,
          chatMessages: updatedMessages
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
            conversationTurn: action.payload.conversationTurn
          }
        ]
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
          conversationTurn: action.payload.conversationTurn
        }
      ];
      
      // Create a new map with the updated tool call index
      const newMap = new Map(state.toolExecutionMsgMap);
      if (action.payload.toolCall.id) {
        newMap.set(
          action.payload.toolCall.id,
          newMessages.length - 1 // Index of the just-added message
        );
      }
      
      return {
        ...state,
        chatMessages: newMessages,
        toolExecutionMsgMap: newMap
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
            output: action.payload.output || tc.output
          };
        }
        return tc;
      });
      
      updatedMessages[msgIndex] = {
        ...messageToUpdate,
        toolCalls: updatedToolCalls,
        isToolInProgress: false
      };
      
      return {
        ...state,
        chatMessages: updatedMessages
      };
    }

    case 'ADD_FINAL_RESPONSE':
      // Check if we already have a final response for this turn
      if (state.chatMessages.some((msg: ChatMessage) => 
          msg.isFinalResponse && 
          msg.conversationTurn === action.payload.conversationTurn)) {
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
            conversationTurn: action.payload.conversationTurn
          }
        ]
      };

    case 'UPDATE_FINAL_RESPONSE':
      return {
        ...state,
        chatMessages: state.chatMessages.map((msg: ChatMessage) => {
          if (msg.isFinalResponse && 
              msg.conversationTurn === action.payload.conversationTurn) {
            return {
              ...msg,
              content: action.payload.content
            };
          }
          return msg;
        })
      };

    case 'INCREMENT_CONVERSATION_TURN':
      return {
        ...state,
        currentConversationTurn: state.currentConversationTurn + 1
      };

    default:
      return state;
  }
} 