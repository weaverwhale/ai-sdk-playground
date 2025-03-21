import { generateObject, type LanguageModelV1, type Message } from 'ai';
import { z } from 'zod';
import { getModelProviderById, ModelProvider } from '../modelProviders';
import { handleChatRequest } from './chat';
import { defaultSystemPrompt } from '../prompt';

// Global store for search plans
// This needs to be exported so it can be used by the server
export const searchPlans = new Map<string, SearchPlan>();

// Define types for our deep search functionality
interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  output?: string;
  error?: string;
  toolCalls?: {
    name: string;
    output: string;
  }[];
}

export interface SearchPlan {
  query: string;
  steps: PlanStep[];
  complexity: 'low' | 'medium' | 'high';
  createdAt: string;
  conversationTurn?: number;
  summary?: string; // Summary of all findings after execution
}

// Define the type for the AI model
type AIModel = LanguageModelV1;

// Function to safely update the search plan in the global map
export function updateSearchPlan(planId: string, updatedPlan: SearchPlan): void {
  // Always create a deep copy before storing
  const planCopy = JSON.parse(JSON.stringify(updatedPlan));
  searchPlans.set(planId, planCopy);

  // Log the update to verify
  console.log(`[DEEP SEARCH] Updated plan ${planId} in global map`);
}

// Function to safely get a search plan from the global map
export function getSearchPlan(planId: string): SearchPlan | undefined {
  const plan = searchPlans.get(planId);
  if (!plan) return undefined;

  // Return a deep copy to prevent accidental mutations
  return JSON.parse(JSON.stringify(plan));
}

// Main handler for deep search requests
export async function handleDeepSearchRequest(body: {
  query: string;
  orchestratorModel?: string;
  workerModel?: string;
  executeAll?: boolean;
}) {
  try {
    const {
      query,
      orchestratorModel = 'gpt-4o-mini', // Default to standard model
      workerModel = 'gpt-4o-mini',
      executeAll = true, // By default, execute all steps
    } = body;

    // Validate input
    if (!query || typeof query !== 'string') {
      throw new Error('A valid query string is required.');
    }

    // Get model providers
    const orchestratorProvider = getModelProviderById(orchestratorModel);
    const workerProvider = getModelProviderById(workerModel);

    if (!orchestratorProvider || !workerProvider) {
      throw new Error(`One or more model providers not found.`);
    }

    if (!orchestratorProvider.available || !workerProvider.available) {
      throw new Error(`One or more model providers are not available. API keys might be missing.`);
    }

    // Use the orchestrator to create a search plan
    console.log(
      `[DEEP SEARCH] Creating search plan for query: "${query}" using orchestrator model: ${orchestratorProvider.model.modelId}`,
    );
    const plan = await createSearchPlan(query, orchestratorProvider.model);

    // Store the plan in the global map using the createdAt ID
    updateSearchPlan(plan.createdAt, plan);

    // Verify the plan was added successfully
    if (searchPlans.has(plan.createdAt)) {
      console.log(`[DEEP SEARCH] Successfully stored plan with ID: ${plan.createdAt}`);
    } else {
      console.error(`[DEEP SEARCH] Failed to store plan with ID: ${plan.createdAt}`);
    }

    // If executeAll is true, execute all steps in the plan
    if (executeAll) {
      console.log(
        `[DEEP SEARCH] Executing search plan with ${plan.steps.length} steps and ID: ${plan.createdAt}`,
      );

      // We need to use the SAME plan object that was created,
      // not create a new one during execution
      executeSearchPlan(plan, workerProvider)
        .then((updatedPlan) => {
          // Verify we're updating with the same ID
          if (updatedPlan.createdAt !== plan.createdAt) {
            console.error(
              `[DEEP SEARCH] Plan ID changed during execution! Original: ${plan.createdAt}, New: ${updatedPlan.createdAt}`,
            );
            // Force it back to the original ID
            updatedPlan.createdAt = plan.createdAt;
          }

          // Update the plan in the global map once execution is complete
          updateSearchPlan(updatedPlan.createdAt, updatedPlan);
          console.log(
            `[DEEP SEARCH] Plan execution complete for plan ID: ${updatedPlan.createdAt}`,
          );
        })
        .catch((err) => {
          console.error(
            `[DEEP SEARCH] Background execution error for plan ${plan.createdAt}:`,
            err,
          );
        });
    }

    return plan;
  } catch (error) {
    console.error('[DEEP SEARCH] Error:', error);
    throw error;
  }
}

// Function to create a search plan using the orchestrator model
async function createSearchPlan(query: string, orchestratorModel: AIModel): Promise<SearchPlan> {
  try {
    // Use the AI SDK to generate a structured plan object
    const { object: planObject } = await generateObject({
      model: orchestratorModel,
      schema: z.object({
        steps: z.array(
          z.object({
            description: z
              .string()
              .describe('A detailed description of what this step will accomplish'),
          }),
        ),
        complexity: z.enum(['low', 'medium', 'high']),
      }),
      system: `
      ${defaultSystemPrompt}
      **Instructions:**
      You are a strategic search planner that breaks down complex queries into a step-by-step plan.
      `,
      prompt: `Analyze this search query and create a detailed plan to answer it:
      "${query}"
      
      Break this down into sequential steps that would help thoroughly answer the query.
      Each step should be specific and actionable.`,
    });

    // Create a fixed identifier for this plan
    // Use a rounded timestamp to avoid millisecond differences
    const roundedTimestamp = Math.floor(Date.now() / 1000) * 1000;

    // Create a stable plan ID that won't change during execution
    const planId = `plan-${roundedTimestamp}`;

    console.log(`[DEEP SEARCH] Creating plan with stable ID: ${planId}`);

    // Format the plan with proper IDs and initial status
    const searchPlan: SearchPlan = {
      query,
      steps: planObject.steps.map((step, index) => ({
        id: `${planId}-step-${index}`,
        description: step.description,
        status: 'pending',
      })),
      complexity: planObject.complexity,
      createdAt: planId,
    };

    // Log the plan details to verify consistency
    console.log(`[DEEP SEARCH] Created new plan with ID ${searchPlan.createdAt}`);
    console.log(`[DEEP SEARCH] First step ID: ${searchPlan.steps[0].id}`);

    return searchPlan;
  } catch (error) {
    console.error('[DEEP SEARCH] Plan creation error:', error);
    throw new Error(
      `Failed to create search plan: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Function to execute each step in the search plan using the worker model
export async function executeSearchPlan(
  plan: SearchPlan,
  workerModelProvider: ModelProvider,
): Promise<SearchPlan> {
  try {
    // Make sure we have a valid plan ID before proceeding
    if (!plan.createdAt) {
      throw new Error('Invalid plan: missing createdAt timestamp');
    }

    console.log(
      `[DEEP SEARCH] Starting execution of plan with ID ${plan.createdAt} and ${plan.steps.length} steps`,
    );

    console.log(`[DEEP SEARCH] Found worker model provider: ${workerModelProvider.name}`);

    // Create a COPY of the plan to work with to avoid reference issues
    const workingPlan = JSON.parse(JSON.stringify(plan));

    // Verify the plan exists in the map before execution
    const existingPlan = searchPlans.get(workingPlan.createdAt);
    if (!existingPlan) {
      console.error(
        `[DEEP SEARCH] Plan with ID ${workingPlan.createdAt} not found in map before execution`,
      );
      // Store it now to make sure it exists
      updateSearchPlan(workingPlan.createdAt, workingPlan);
    } else {
      console.log(
        `[DEEP SEARCH] Verified plan ${workingPlan.createdAt} exists in map before execution`,
      );
    }

    // Log the initial plan step IDs to ensure we're working with the right IDs
    console.log(`[DEEP SEARCH] Plan ID being executed: ${workingPlan.createdAt}`);
    console.log(
      `[DEEP SEARCH] Initial step IDs: ${workingPlan.steps.map((s: PlanStep) => s.id).join(', ')}`,
    );

    // Execute each step sequentially
    for (let i = 0; i < workingPlan.steps.length; i++) {
      const step = workingPlan.steps[i];

      try {
        // Update step status to running
        step.status = 'running';
        console.log(
          `[DEEP SEARCH] Executing step ${i + 1}/${workingPlan.steps.length}: "${
            step.description
          }" - ID: ${step.id} - Status: ${step.status}`,
        );

        // Create a fresh copy of the working plan to avoid reference issues
        const updatedPlanCopy = JSON.parse(JSON.stringify(workingPlan));

        // Update the searchPlans map immediately using our safe update function
        updateSearchPlan(workingPlan.createdAt, updatedPlanCopy);

        // Verify update was successful by retrieving plan and checking status
        const currentPlan = getSearchPlan(workingPlan.createdAt);
        if (currentPlan) {
          const stepStatus = currentPlan.steps[i].status;
          console.log(`[DEEP SEARCH] Verified step "${step.id}" status is now: ${stepStatus}`);

          // If status doesn't match what we set, something is wrong with updates
          if (stepStatus !== 'running') {
            console.error(
              `[DEEP SEARCH] Status verification failed! Expected 'running' but got '${stepStatus}'`,
            );
          }
        } else {
          console.error(`[DEEP SEARCH] Plan not found after update! ID: ${workingPlan.createdAt}`);
        }

        // Worker: Execute the current step using handleChatRequest
        const result = await handleChatRequest({
          messages: [
            {
              role: 'user',
              content: `
              Execute this search step: "${step.description}"
              This is part of answering the overall query: "${workingPlan.query}"
              Focus on providing a thorough but concise explanation based on the specific step assigned.
              `,
            } as Message,
          ],
          modelId: workerModelProvider.id,
          stream: false,
        });

        // set the output to the result text
        step.output = result.text;

        // Add tool call information to step data if available
        // NOTE toolResults = toolCalls, we get it as toolResults here
        if ('toolResults' in result && result.toolResults.length > 0) {
          console.log(
            `[DEEP SEARCH] Tool results for step ${step.id} (${result.toolResults.length})`,
          );

          // Also create the new toolResults format
          step.toolCalls = result.toolResults.map((toolResult) => ({
            name: toolResult.toolName || 'unknown',
            output: toolResult.result || '',
          }));
        }

        // Update step with the result and change status to completed
        step.status = 'completed';
        console.log(
          `[DEEP SEARCH] Step completed: "${step.description}" - ID: ${step.id} - Status: ${step.status}`,
        );

        // Create another fresh copy after updating the step
        const completedPlanCopy = JSON.parse(JSON.stringify(workingPlan));

        // Update the plan in the global map using our safe update function
        updateSearchPlan(workingPlan.createdAt, completedPlanCopy);

        // Verify update was successful
        const updatedPlan = getSearchPlan(workingPlan.createdAt);
        if (updatedPlan) {
          const stepStatus = updatedPlan.steps[i].status;
          console.log(`[DEEP SEARCH] Verified step "${step.id}" status is now: ${stepStatus}`);

          // If status doesn't match what we set, something is wrong with updates
          if (stepStatus !== 'completed') {
            console.error(
              `[DEEP SEARCH] Status verification failed! Expected 'completed' but got '${stepStatus}'`,
            );
          }
        } else {
          console.error(
            `[DEEP SEARCH] Plan not found after completion update! ID: ${workingPlan.createdAt}`,
          );
        }
      } catch (err) {
        // Update step with error
        step.status = 'error';
        step.error = err instanceof Error ? err.message : String(err);
        console.error(
          `[DEEP SEARCH] Step error for "${step.description}": ${step.error} - Status: ${step.status}`,
        );

        // Create a fresh copy for the error update
        const errorPlanCopy = JSON.parse(JSON.stringify(workingPlan));

        // Update the plan in the global map
        updateSearchPlan(workingPlan.createdAt, errorPlanCopy);

        // Verify error update was successful
        const errorPlan = getSearchPlan(workingPlan.createdAt);
        if (errorPlan) {
          const stepStatus = errorPlan.steps[i].status;
          console.log(`[DEEP SEARCH] Verified step "${step.id}" error status is: ${stepStatus}`);
        }
      }
    }

    // Get the final plan from the map to ensure we return the latest version
    const finalPlan = getSearchPlan(workingPlan.createdAt);
    if (!finalPlan) {
      throw new Error('Plan not found after execution');
    }

    console.log(
      `[DEEP SEARCH] Plan execution completed with final statuses:`,
      finalPlan.steps.map((s: PlanStep) => ({ id: s.id, status: s.status })),
    );

    // Generate a summary of all findings after execution completes
    try {
      console.log(`[DEEP SEARCH] Generating summary for plan ${finalPlan.createdAt}`);

      // Collect all step outputs to include in summary generation
      const stepOutputs = finalPlan.steps
        .map((step) => ({
          description: step.description,
          status: step.status,
          output: step.output || '',
          error: step.error,
        }))
        .filter((step) => step.status === 'completed' || step.status === 'error');

      // Only generate a summary if we have at least one completed step
      if (stepOutputs.some((step) => step.status === 'completed')) {
        const { object: summaryResult } = await generateObject({
          model: workerModelProvider.model,
          schema: z.object({
            summary: z
              .string()
              .describe('A comprehensive summary of all the findings from the search steps'),
          }),
          system:
            'You are an expert at summarizing complex search findings into concise, actionable insights.',
          prompt: `Provide a comprehensive summary of the findings from this deep search:
          
          Original Query: "${finalPlan.query}"
          
          Step Results:
          ${stepOutputs
            .map(
              (step, i) =>
                `Step ${i + 1}: ${step.description}
            Status: ${step.status}
            ${step.status === 'completed' ? `Output: ${step.output}` : `Error: ${step.error}`}`,
            )
            .join('\n\n')}
          
          Create a well-structured summary that synthesizes the key findings from all steps, highlighting the most important insights that answer the original query.`,
        });

        console.log(
          `[DEEP SEARCH] Summary generated for plan ${finalPlan.createdAt}: ${finalPlan.summary}`,
        );

        // Update the plan with the generated summary
        finalPlan.summary = summaryResult.summary;

        // Update the plan in the global map with the summary
        updateSearchPlan(finalPlan.createdAt, finalPlan);

        console.log(`[DEEP SEARCH] Summary generated for plan ${finalPlan.createdAt}`);
      } else {
        console.log(
          `[DEEP SEARCH] No completed steps available to generate summary for plan ${finalPlan.createdAt}`,
        );
        finalPlan.summary =
          'Unable to generate summary as no search steps were completed successfully.';
        updateSearchPlan(finalPlan.createdAt, finalPlan);
      }
    } catch (summaryError) {
      console.error(`[DEEP SEARCH] Error generating summary:`, summaryError);
      finalPlan.summary = `Error generating summary: ${
        summaryError instanceof Error ? summaryError.message : String(summaryError)
      }`;
      updateSearchPlan(finalPlan.createdAt, finalPlan);
    }

    return finalPlan;
  } catch (error) {
    console.error('[DEEP SEARCH] Plan execution error:', error);
    throw new Error(
      `Failed to execute search plan: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
