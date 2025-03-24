import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface UseUserInfoResult {
  userId: string;
  isLoading: boolean;
}

/**
 * Hook for managing user identification
 * Retrieves user ID from localStorage or creates a new one if none exists
 */
export function useUserInfo(): UseUserInfoResult {
  const [userId, setUserId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Try to get existing userId from localStorage
    let storedUserId = localStorage.getItem('chat_user_id');

    // If no userId exists, create a new one and store it
    if (!storedUserId) {
      storedUserId = `user-${uuidv4()}`;
      localStorage.setItem('chat_user_id', storedUserId);
    }

    setUserId(storedUserId);
    setIsLoading(false);
    console.log('Using user ID:', storedUserId);
  }, []);

  return {
    userId,
    isLoading,
  };
}
