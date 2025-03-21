import { useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for managing chat scrolling behavior
 * @param chatStatus Current status of the chat (for triggering scroll events)
 * @returns References and scroll handler functions
 */
export function useChatScroll(chatStatus: string) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Combined effect for both initial scroll and mutation observation
  useEffect(() => {
    // Initial scroll when status changes
    scrollToBottom();

    // Set up mutation observer to detect content streaming and scroll as it comes in
    if (!chatContainerRef.current) return;

    const observer = new MutationObserver(() => {
      const container = chatContainerRef.current!;
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;

      if (isNearBottom || chatStatus === 'submitted' || chatStatus === 'streaming') {
        scrollToBottom();
      }
    });

    observer.observe(chatContainerRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [chatStatus, scrollToBottom]);

  return { messagesEndRef, chatContainerRef, scrollToBottom };
}
