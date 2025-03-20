import { useState, useEffect } from 'react';

interface Model {
  id: string;
  name: string;
}

interface ServerMonitoringResult {
  serverStatus: 'checking' | 'online' | 'offline';
  serverInfo: string | null;
  errorDetails: string | null;
  availableModels: Model[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  retryConnection: () => void;
}

export function useServerMonitoring(): ServerMonitoringResult {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverInfo, setServerInfo] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const storedModel = typeof window !== 'undefined' ? localStorage.getItem('selectedModel') : null;
    return storedModel || 'openai';
  });

  const checkServerHealth = async () => {
    try {
      const response = await fetch('/api/health');
      await response.json();
      
      setServerStatus('online');
      setServerInfo(`Server is online (as of ${new Date().toLocaleTimeString()})`);
      
      try {
        const modelsResponse = await fetch('/api/models');
        const modelsData = await modelsResponse.json();
        
        if (modelsData && Array.isArray(modelsData.models)) {
          setAvailableModels(modelsData.models);
          
          if (modelsData.models.length === 0) {
            setErrorDetails('No AI models are available. Please check your API keys.');
          }
          else if (modelsData.models.length > 0 && (!selectedModel || !modelsData.models.find((m: Model) => m.id === selectedModel))) {
            setSelectedModel(modelsData.models[0].id);
          }
        } else {
          setErrorDetails('Failed to retrieve model information from the server.');
        }
      } catch {
        setErrorDetails('Failed to fetch available AI models. Please try again later.');
      }
    } catch {
      setServerStatus('offline');
      setServerInfo('Could not connect to the server. Please check if the server is running.');
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
      } catch {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(doServerCheck, retryDelay);
        } else {
          setServerStatus('offline');
          setServerInfo('Could not connect to the server after multiple attempts. Please check if the server is running.');
        }
      }
    };

    doServerCheck();
    
    const intervalId = setInterval(() => {
      checkServerHealth();
    }, 30000);
    
    return () => clearInterval(intervalId);
  }, []);

  // Update localStorage when selected model changes
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedModel) {
      localStorage.setItem('selectedModel', selectedModel);
    }
  }, [selectedModel]);

  return {
    serverStatus,
    serverInfo,
    errorDetails,
    availableModels,
    selectedModel,
    setSelectedModel,
    retryConnection: () => setServerStatus('checking')
  };
}