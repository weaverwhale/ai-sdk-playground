import { useState, useEffect } from 'react';
import { ToolInfo } from '../types/chatTypes';

/**
 * Custom hook to fetch available tools from the server
 * @returns A record of tool options mapped by tool ID
 */
export function useToolOptions() {
  const [toolOptions, setToolOptions] = useState<Record<string, ToolInfo>>({});

  useEffect(() => {
    const fetchToolOptions = async () => {
      try {
        const response = await fetch('/api/tools');
        const data = await response.json();

        if (data && Array.isArray(data.tools)) {
          const options: Record<string, ToolInfo> = {};
          data.tools.forEach((tool: ToolInfo) => {
            options[tool.id] = {
              id: tool.id,
              description: tool.description || 'No description available',
              name: tool.name || tool.id,
            };
          });

          setToolOptions(options);
        }
      } catch {
        // Silently fail
      }
    };

    fetchToolOptions();
  }, []);

  return toolOptions;
}
