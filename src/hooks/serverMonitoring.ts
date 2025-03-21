import { useState, useEffect } from 'react';
import { ServerMonitoringResult } from '../types/chatTypes';
import { useModels } from './useModels';

export function useServerMonitoring(): ServerMonitoringResult {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverInfo, setServerInfo] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const { availableModels, selectedModel, setSelectedModel, fetchModels, modelError } = useModels();

  // Update error details with model error if present
  useEffect(() => {
    if (modelError) {
      setErrorDetails(modelError);
    }
  }, [modelError]);

  const checkServerHealth = async () => {
    try {
      const response = await fetch('/api/health');
      await response.json();

      setServerStatus('online');
      setServerInfo(`Server is online (as of ${new Date().toLocaleTimeString()})`);
    } catch {
      setServerStatus('offline');
      setServerInfo('Could not connect to the server. Please check if the server is running.');
      setErrorDetails('Server connection failed.');
    }
  };

  // Initial server check and periodic polling
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 1500;

    const doServerCheck = async () => {
      try {
        await checkServerHealth();
        // Only fetch models once when server is confirmed online
        if (serverStatus !== 'online') {
          await fetchModels();
        }
      } catch {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(doServerCheck, retryDelay);
        } else {
          setServerStatus('offline');
          setServerInfo(
            'Could not connect to the server after multiple attempts. Please check if the server is running.',
          );
          setErrorDetails('Server connection failed after multiple attempts.');
        }
      }
    };

    doServerCheck();

    const intervalId = setInterval(() => {
      checkServerHealth(); // Only check health status in interval, not models
    }, 30000);

    return () => clearInterval(intervalId);
  }, [serverStatus, fetchModels]);

  const retryConnection = async () => {
    setServerStatus('checking');
    setErrorDetails(null);
    await checkServerHealth();
    if (serverStatus === 'online') {
      await fetchModels();
    }
  };

  return {
    serverStatus,
    serverInfo,
    errorDetails,
    availableModels,
    selectedModel,
    setSelectedModel,
    retryConnection,
  };
}
