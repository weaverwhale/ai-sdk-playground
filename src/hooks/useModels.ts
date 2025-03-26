import { useState, useEffect, useCallback, useMemo } from 'react';
import { Model } from '../types/chatTypes';

interface UseModelsResult {
  availableModels: Model[];
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  fetchModels: () => Promise<void>;
  modelError: string | null;
}

export function useModels(): UseModelsResult {
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);

  // Use useMemo for initial model selection from localStorage
  const initialModel = useMemo(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('selectedModel') || 'openai'
      : 'openai';
  }, []);

  const [selectedModel, setSelectedModel] = useState<string>(initialModel);

  // Update localStorage when selected model changes
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem('selectedModel', selectedModel);
    }
  }, [selectedModel]);

  const fetchModels = useCallback(async () => {
    try {
      const modelsResponse = await fetch('/api/models');
      const modelsData = await modelsResponse.json();

      if (modelsData && Array.isArray(modelsData.models)) {
        setAvailableModels(modelsData.models);

        if (modelsData.models.length === 0) {
          setModelError('No AI models are available. Please check your API keys.');
        } else if (
          modelsData.models.length > 0 &&
          (!selectedModel || !modelsData.models.find((m: Model) => m.id === selectedModel))
        ) {
          setSelectedModel(modelsData.models[0].id);
          setModelError(null);
        } else {
          setModelError(null);
        }
      } else {
        setModelError('Failed to retrieve model information from the server.');
      }
    } catch {
      setModelError('Failed to fetch available AI models. Please try again later.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    availableModels,
    selectedModel,
    setSelectedModel,
    fetchModels,
    modelError,
  };
}
