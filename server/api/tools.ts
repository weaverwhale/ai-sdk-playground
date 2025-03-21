import { tools } from '../tools';

// This function returns information about the available tools
export async function handleToolsRequest() {
  try {
    // Map the tools to a format that's safe to send to the client
    const toolInfo = Object.values(tools).map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
    }));

    return new Response(JSON.stringify({ tools: toolInfo }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[API] Tools request error:', error);
    throw error;
  }
}
