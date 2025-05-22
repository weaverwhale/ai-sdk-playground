// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import path from 'path';
import { handleChatRequest } from '../server/api/chat';
import { handleToolsRequest } from '../server/api/tools';
import {
  handleDeepSearchRequest,
  getSearchPlan,
  searchPlans,
  executeSearchPlan,
} from '../server/api/deepSearch';
import { handleArchitectureRequest } from '../server/api/architecture';
import { Readable } from 'stream';
import { getAvailableModelProviders, getModelProviderById } from './modelProviders';

const app = express();
const PORT = process.env.PORT || 1753;

// Configure CORS to accept requests from the Vite dev server
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  }),
);

app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use((req, res, next) => {
  console.log(`[SERVER] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// architecture data
app.get('/api/architecture', async (req, res) => {
  try {
    await handleArchitectureRequest(req, res);
  } catch (error) {
    console.error('[SERVER] Architecture API error:', error);
    res.status(500).json({
      error: 'Failed to generate architecture data',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// models
app.get('/api/models', (_req, res) => {
  try {
    const availableModels = getAvailableModelProviders();
    console.log('[SERVER] Available models:', availableModels.map((m) => m.name).join(', '));

    res.json({
      models: availableModels.map((p) => ({ id: p.id, name: p.name })),
      count: availableModels.length,
    });
  } catch (error) {
    console.error('[SERVER] Error getting models:', error);
    res.status(500).json({ error: 'Failed to fetch available models' });
  }
});

// tools information
app.get('/api/tools', async (_req, res) => {
  try {
    console.log('[SERVER] Getting tools information...');
    const response = await handleToolsRequest();

    // Set response headers
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    // Get the response body
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[SERVER] Error getting tools info:', error);
    res.status(500).json({ error: 'Failed to fetch tools information' });
  }
});

// deep search
app.post('/api/deep-search', async (req, res) => {
  try {
    const { query, orchestratorModel, workerModel, executeAll } = req.body;

    if (!query || typeof query !== 'string') {
      console.error('[SERVER] Invalid deep search query:', req.body);
      return res.status(400).json({ error: 'A valid query string is required' });
    }

    console.log(`[SERVER] Processing deep search request for query: "${query}"`);
    const result = await handleDeepSearchRequest({
      query,
      orchestratorModel,
      workerModel,
      executeAll,
    });

    res.json(result);
  } catch (error) {
    console.error(
      '[SERVER] Deep search API error:',
      error instanceof Error ? error.message : String(error),
    );
    res.status(500).json({
      error: 'Failed to process deep search request',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// execute a previously created deep search plan
app.post('/api/execute-deep-search', async (req, res) => {
  try {
    const { planId, orchestratorModel } = req.body;

    if (!planId || typeof planId !== 'string') {
      console.error('[SERVER] Execute deep search API - Missing or invalid planId:', planId);
      return res.status(400).json({ error: 'A valid plan ID is required' });
    }

    console.log(`[SERVER] Execute deep search API - Executing plan with ID: ${planId}`);

    // Get the plan from the global map
    const plan = getSearchPlan(planId);

    if (!plan) {
      console.error(`[SERVER] Execute deep search API - Plan not found with ID: ${planId}`);
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Get all available model providers
    const availableProviders = getAvailableModelProviders();

    if (availableProviders.length === 0) {
      console.error(
        '[SERVER] Execute deep search API - No model providers available. Please check your API keys in .env file',
      );
      return res.status(500).json({
        error: 'No model providers available',
        details: 'Please add API keys for at least one model provider in the .env file',
      });
    }

    const orchestratorProvider = getModelProviderById(orchestratorModel) || availableProviders[0];
    console.log(
      `[SERVER] Execute deep search API - Using model provider: ${orchestratorProvider.name}`,
    );

    // Execute the plan in the background
    // We don't await this because it can take a long time and we want to return quickly
    executeSearchPlan(plan, orchestratorProvider)
      .then((updatedPlan) => {
        console.log(`[SERVER] Plan execution complete for plan ID: ${updatedPlan.createdAt}`);
      })
      .catch((err) => {
        console.error(`[SERVER] Background execution error for plan ${plan.createdAt}:`, err);
      });

    // Immediately return success response
    res.json({
      message: 'Plan execution started',
      planId: plan.createdAt,
      modelProvider: orchestratorProvider.name,
    });
  } catch (error) {
    console.error('[SERVER] Execute deep search API error:', error);
    res.status(500).json({
      error: 'Failed to execute search plan',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// get current status of a deep search plan
app.post('/api/deep-search-status', async (req, res) => {
  try {
    const { planId } = req.body;

    if (!planId || typeof planId !== 'string') {
      console.error('[SERVER] Deep search status API - Missing or invalid planId:', planId);
      return res.status(400).json({ error: 'A valid plan ID is required' });
    }

    console.log(`[SERVER] Deep search status API - Retrieving plan with ID: ${planId}`);

    const allPlans = Array.from(searchPlans.keys());

    // Try to get the plan directly first
    let plan = getSearchPlan(planId);

    // If plan doesn't exist, try to find a matching one
    if (!plan && allPlans.length > 0) {
      console.log(
        `[SERVER] Client requested plan ${planId} but it doesn't exist directly. Looking for matches.`,
      );

      // First try: Direct substring match (in case of truncation)
      const matchByPrefix = allPlans.find((id) => id.startsWith(planId) || planId.startsWith(id));
      if (matchByPrefix) {
        console.log(`[SERVER] Found prefix match: ${matchByPrefix} for request: ${planId}`);
        plan = getSearchPlan(matchByPrefix);
      }

      // Second try: If the requested ID contains 'plan-', try to find a match by numeric part
      if (!plan && planId.includes('plan-')) {
        const requestedNumber = planId.split('plan-')[1];
        const matchByNumber = allPlans.find((id) => id.includes(requestedNumber));
        if (matchByNumber) {
          console.log(`[SERVER] Found numeric match: ${matchByNumber} for request: ${planId}`);
          plan = getSearchPlan(matchByNumber);
        }
      }

      // Third try: For timestamp based IDs, try to match nearest timestamp
      if (!plan) {
        // Only try this for what looks like a timestamp-based ID
        const isTimestampBased = /\d{10,}/.test(planId) || planId.includes('plan-');

        if (isTimestampBased) {
          let closestMatch: string | null = null;
          let closestDistance = Infinity;

          // Extract a number to compare with
          const extractNumber = (id: string): number => {
            const match = id.match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
          };

          const targetNumber = extractNumber(planId);

          // Find the closest matching plan ID by numeric distance
          for (const existingId of allPlans) {
            const existingNumber = extractNumber(existingId);
            const distance = Math.abs(existingNumber - targetNumber);

            if (distance < closestDistance) {
              closestDistance = distance;
              closestMatch = existingId;
            }
          }

          if (closestMatch && closestDistance < 100000) {
            // Accept matches within reasonable tolerance
            console.log(
              `[SERVER] Found closest timestamp match: ${closestMatch} (distance: ${closestDistance}) for request: ${planId}`,
            );
            plan = getSearchPlan(closestMatch);
          }
        }
      }
    }

    // Check if plan exists
    if (!plan) {
      console.error(`[SERVER] Deep search status API - Plan not found with ID: ${planId}`);
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Log detailed information about the plan steps
    console.log(`[SERVER] Deep search status API - Plan ${planId}`);

    // Verify each step has correct data
    plan.steps.forEach((step, index) => {
      if (!step.status) {
        console.error(`[SERVER] Step ${index} has missing status - fixing to 'pending'`);
        step.status = 'pending';
      }
    });

    // Send the full plan data (getSearchPlan already returns a deep copy)
    console.log(`[SERVER] Sending plan with ID: ${planId} and ${plan.steps.length} steps`);

    // Log the actual statuses of steps before sending
    const statusSummary = plan.steps.reduce((counts, step) => {
      counts[step.status] = (counts[step.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    console.log(
      `[SERVER] Plan status summary: ${Object.entries(statusSummary)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ')}`,
    );

    res.json(plan);
  } catch (error) {
    console.error('[SERVER] Deep search status API error:', error);
    res.status(500).json({
      error: 'Failed to get plan status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

function webToNodeStream(webStream: ReadableStream): Readable {
  const nodeStream = new Readable({ read: () => {} });
  const reader = webStream.getReader();

  function processStream() {
    reader
      .read()
      .then(({ done, value }) => {
        if (done) {
          console.log('[SERVER] Stream complete');
          nodeStream.push(null); // End the stream
          return;
        }

        nodeStream.push(Buffer.from(value));
        processStream();
      })
      .catch((err) => {
        console.error('[SERVER] Stream error:', err);
        nodeStream.destroy(err);
      });
  }

  processStream();

  nodeStream.on('error', (err) => {
    console.error('[SERVER] Stream error:', err);
  });

  return nodeStream;
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, modelId, stream, userId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      console.error('[SERVER] Invalid messages format:', req.body);
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    console.log('[SERVER] Processing chat request...');
    const response = await handleChatRequest({
      messages,
      modelId,
      stream,
      userId: userId && userId.trim() ? userId : 'anonymous', // Ensure userId is never empty
    });

    // Check if response is a Response object (has headers and body)
    if ('headers' in response && 'body' in response) {
      // Set response headers
      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }

      // Pipe the response body if it exists
      if (response.body) {
        const nodeStream = webToNodeStream(response.body);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } else {
      // Handle the GenerateTextResult case
      res.json(response);
    }
  } catch (error) {
    console.error('[SERVER] API error:', error instanceof Error ? error.message : String(error));
    res.status(500).json({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`[SERVER] API server running at http://localhost:${PORT}`);
});

export default app;
