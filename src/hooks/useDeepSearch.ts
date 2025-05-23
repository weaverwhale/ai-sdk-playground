import { useState, useCallback, useEffect, useRef } from 'react';
import { SearchPlan, PlanStepStatus, ToolCall } from '../types/chatTypes';

interface UseDeepSearchProps {
  orchestratorModel?: string;
  workerModel?: string;
  onPlanCreated?: (plan: SearchPlan) => void;
  onStepUpdate?: (
    stepId: string,
    status: PlanStepStatus,
    output?: string,
    error?: string,
    toolCalls?: ToolCall[],
  ) => void;
  onPlanCompleted?: (plan: SearchPlan) => void; // Callback for when plan is completed with summary
  pollingInterval?: number; // Polling interval in milliseconds
}

interface UseDeepSearchResult {
  isDeepSearchMode: boolean;
  setIsDeepSearchMode: (isDeepSearchMode: boolean) => void;
  createDeepSearchPlan: (query: string) => Promise<SearchPlan | null>;
  executeDeepSearchPlan: (plan: SearchPlan) => Promise<void>;
  isCreatingPlan: boolean;
  isExecutingPlan: boolean;
  error: Error | null;
  stopPolling: () => void;
}

/**
 * A hook that uses the deep search API endpoint
 */
export function useDeepSearch({
  orchestratorModel = 'gpt-4o-mini',
  workerModel = 'gpt-4o-mini',
  onPlanCreated,
  onStepUpdate,
  onPlanCompleted,
  pollingInterval = 500,
}: UseDeepSearchProps): UseDeepSearchResult {
  const [isDeepSearchMode, setIsDeepSearchModeState] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('isDeepSearchMode') === 'true' : false,
  );
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for polling
  const activePlanRef = useRef<SearchPlan | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Add error tracking for polling
  const pollErrorCountRef = useRef(0);
  const MAX_POLL_ERRORS = 5; // Maximum number of consecutive polling errors before giving up

  // Function to stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    isPollingRef.current = false;
    activePlanRef.current = null;
    pollErrorCountRef.current = 0; // Reset error count when stopping
  }, []);

  // Function to set deep search mode and clear everything when toggled
  const setIsDeepSearchMode = useCallback(
    (newMode: boolean) => {
      // If we're turning off deep search or changing the mode, stop any ongoing operations
      if (!newMode || newMode !== isDeepSearchMode) {
        // Stop any ongoing polling
        stopPolling();

        // Reset all states
        setIsCreatingPlan(false);
        setIsExecutingPlan(false);
        setError(null);

        // Clear any active plans
        if (activePlanRef.current) {
          console.log('[DEEP SEARCH] Clearing active plan');

          // If there's an active plan with pending or running steps, mark them as errors with cancellation message
          if (activePlanRef.current.steps) {
            activePlanRef.current.steps.forEach((step) => {
              if (step.status === 'pending' || step.status === 'running') {
                onStepUpdate?.(
                  step.id,
                  'error',
                  undefined,
                  'Operation cancelled: Deep search mode toggled',
                  step.toolCalls,
                );
              }
            });
          }

          // Clear the active plan reference
          activePlanRef.current = null;
        }
      }

      // Set the new mode state
      setIsDeepSearchModeState(newMode);
    },
    [isDeepSearchMode, stopPolling, onStepUpdate],
  );

  // Update localStorage when selected model changes
  useEffect(() => {
    localStorage.setItem('isDeepSearchMode', isDeepSearchMode.toString());
  }, [isDeepSearchMode]);

  // Function to check plan status
  const checkPlanStatus = useCallback(async () => {
    if (!activePlanRef.current || !isPollingRef.current) return;

    try {
      // Get the plan ID to poll for updates
      const planId = activePlanRef.current.createdAt;
      console.log(`[DEEP SEARCH] Checking status for plan ID: ${planId}`);

      // Call API to get updated plan status
      const response = await fetch(`/api/deep-search-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        console.warn(
          `[DEEP SEARCH] Failed to get plan status update: ${response.status} ${response.statusText}`,
        );

        // Stop polling on HTTP errors (e.g., 404 Not Found, 500 Server Error)
        if (response.status === 404 || response.status >= 500) {
          console.error(`[DEEP SEARCH] Stopping polling due to HTTP error: ${response.status}`);
          stopPolling();
          setIsExecutingPlan(false);

          // Notify the UI about the error
          activePlanRef.current.steps.forEach((step) => {
            if (step.status === 'pending' || step.status === 'running') {
              onStepUpdate?.(
                step.id,
                'error',
                undefined,
                `Server error: ${response.statusText}`,
                step.toolCalls,
              );
            }
          });
        }

        // Return early to prevent further processing
        return;
      }

      // Parse the response with additional error handling
      let updatedPlan: SearchPlan;
      try {
        const planData = await response.json();
        console.log('[DEEP SEARCH] Raw plan data received:', JSON.stringify(planData));
        updatedPlan = planData;
      } catch (parseError) {
        console.error('[DEEP SEARCH] Error parsing plan data:', parseError);
        throw new Error('Failed to parse plan data from server');
      }

      // Reset error counter on successful poll
      pollErrorCountRef.current = 0;

      // Log the received plan with detailed step info
      console.log(
        '[DEEP SEARCH] Received plan update with steps:',
        updatedPlan?.steps?.map((s) => ({
          id: s.id,
          status: s.status,
          hasOutput: !!s.output,
          hasError: !!s.error,
        })),
      );

      // Compare steps and update any that have changed
      if (updatedPlan && updatedPlan.steps) {
        let allCompleted = true;

        // Force creation of a completely new plan object to ensure reactivity
        const newPlan: SearchPlan = {
          ...updatedPlan,
          // Preserve the conversation turn from the current plan
          conversationTurn: activePlanRef.current.conversationTurn,
          // Create a completely new steps array to ensure reference changes
          steps: updatedPlan.steps.map((step, index) => {
            const newStep = { ...step };

            // Check if the step is still pending or running
            if (newStep.status === 'pending' || newStep.status === 'running') {
              allCompleted = false;
            }

            // Log individual step status
            console.log(
              `[DEEP SEARCH] Processing step ${index}: ${newStep.id} with status: ${newStep.status}`,
            );

            return newStep;
          }),
        };

        // Always force notifications for each step to ensure UI updates
        console.log('[DEEP SEARCH] Forcing step updates to ensure UI is current');

        // Update the active plan reference with the new plan
        activePlanRef.current = newPlan;

        // Notify for each step individually
        newPlan.steps.forEach((step) => {
          onStepUpdate?.(step.id, step.status, step.output, step.error, step.toolCalls);

          // Log tool call information if available
          if (step.toolCalls && step.toolCalls.length > 0) {
            console.log(
              `[DEEP SEARCH] Step ${step.id} has ${step.toolCalls.length} tool call(s)`,
              step.toolCalls,
            );
          }
        });

        // Check if the plan has a summary and all steps are complete
        if (allCompleted && newPlan.summary) {
          console.log('[DEEP SEARCH] Search plan complete with summary:', newPlan.summary);

          // Stop polling as we're done
          stopPolling();
          setIsExecutingPlan(false);

          // Call the onPlanCompleted callback with the completed plan
          onPlanCompleted?.(newPlan);
        } else if (allCompleted && !newPlan.summary) {
          // All steps complete but no summary yet - keep polling briefly
          console.log('[DEEP SEARCH] All steps complete but waiting for summary');
        } else {
          // Continue polling - search still in progress
          console.log('[DEEP SEARCH] Search still in progress, continuing to poll');
        }
      } else {
        console.error('[DEEP SEARCH] Received invalid plan data:', updatedPlan);
        throw new Error('Received invalid plan data from server');
      }

      // on plan completion, push final message to chat
      if (updatedPlan.summary) {
        console.log('[DEEP SEARCH] Search plan complete with summary:', updatedPlan.summary);
        stopPolling();
        setIsExecutingPlan(false);
        onPlanCompleted?.(updatedPlan);
      }
    } catch (err) {
      console.error('[DEEP SEARCH] Error checking plan status:', err);

      // Error handling will be done in the startPolling function
      // We re-throw the error to be caught by the error handler there
      throw err;
    }
  }, [onStepUpdate, onPlanCompleted, stopPolling]);

  // Start polling for updates with exponential backoff on errors
  const startPolling = useCallback(
    (plan: SearchPlan) => {
      // Stop any existing polling
      stopPolling();

      // Set the active plan
      activePlanRef.current = plan;
      isPollingRef.current = true;
      pollErrorCountRef.current = 0; // Reset error count when starting

      // Function to determine polling interval with exponential backoff
      const getPollingInterval = () => {
        // Base polling interval plus exponential backoff on errors
        // Each error doubles the polling interval up to a maximum
        return Math.min(
          pollingInterval * Math.pow(2, pollErrorCountRef.current),
          10000, // Maximum 10-second polling interval
        );
      };

      // Start polling with the initial interval
      const startPollingWithInterval = () => {
        const currentInterval = getPollingInterval();
        console.log(`[DEEP SEARCH] Starting polling with interval: ${currentInterval}ms`);

        pollingRef.current = setInterval(() => {
          // Check if we've exceeded the maximum error count
          if (pollErrorCountRef.current >= MAX_POLL_ERRORS) {
            console.error(
              `[DEEP SEARCH] Exceeded maximum poll errors (${MAX_POLL_ERRORS}), stopping polling`,
            );

            // Notify the UI about the error
            if (activePlanRef.current) {
              activePlanRef.current.steps.forEach((step) => {
                if (step.status === 'pending' || step.status === 'running') {
                  onStepUpdate?.(
                    step.id,
                    'error',
                    undefined,
                    `Polling stopped: Too many failed attempts to check status`,
                    step.toolCalls,
                  );
                }
              });
            }

            stopPolling();
            setIsExecutingPlan(false);
            return;
          }

          // Execute the actual status check
          checkPlanStatus().catch((err: Error) => {
            pollErrorCountRef.current += 1;
            console.error(
              `[DEEP SEARCH] Poll error ${pollErrorCountRef.current}/${MAX_POLL_ERRORS}: ${err.message}`,
            );

            // If we haven't exceeded the maximum, adjust polling interval
            if (pollErrorCountRef.current < MAX_POLL_ERRORS) {
              // Clear current interval and restart with new interval
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
              }

              // Restart polling with adjusted interval
              startPollingWithInterval();
            }
          });
        }, currentInterval);
      };

      // Start the initial polling
      startPollingWithInterval();
    },
    [checkPlanStatus, pollingInterval, stopPolling, onStepUpdate],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Function to make deep search API calls
  const callDeepSearchAPI = useCallback(
    async (query: string, executeAll: boolean = false): Promise<SearchPlan | null> => {
      try {
        const response = await fetch('/api/deep-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            orchestratorModel,
            workerModel,
            executeAll,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || errorData.error || 'Failed to execute deep search');
        }

        return await response.json();
      } catch (err) {
        console.error('Deep search API error:', err);
        throw err;
      }
    },
    [orchestratorModel, workerModel],
  );

  // Create a search plan without executing it
  const createDeepSearchPlan = useCallback(
    async (query: string): Promise<SearchPlan | null> => {
      if (!isDeepSearchMode) {
        setError(new Error('Deep search mode is not enabled'));
        return null;
      }

      setIsCreatingPlan(true);
      setError(null);

      try {
        // Call API to create plan (but don't execute it yet)
        const plan = await callDeepSearchAPI(query, false);

        // Notify parent component
        if (plan) {
          onPlanCreated?.(plan);
        }

        return plan;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      } finally {
        setIsCreatingPlan(false);
      }
    },
    [isDeepSearchMode, callDeepSearchAPI, onPlanCreated],
  );

  // Execute each step in the search plan
  const executeDeepSearchPlan = useCallback(
    async (plan: SearchPlan): Promise<void> => {
      if (!isDeepSearchMode) {
        setError(new Error('Deep search mode is not enabled'));
        return;
      }

      setIsExecutingPlan(true);
      setError(null);

      try {
        // Store the exact plan ID we're going to use for execution and polling
        // This ensures we're using the same ID throughout the process
        const planId = plan.createdAt;
        console.log(`[DEEP SEARCH] Executing plan with ID: ${planId}`);
        console.log(`[DEEP SEARCH] Plan step IDs: ${plan.steps.map((s) => s.id).join(', ')}`);

        // Make a deep copy of the plan to ensure we're not modifying the original
        const planCopy = JSON.parse(JSON.stringify(plan));

        // Ensure the plan copy has the same ID
        planCopy.createdAt = planId;

        // Set all steps to running before making the API call
        // This ensures the UI shows the running state immediately
        const runningSteps = planCopy.steps.map(
          (step: { id: string; description: string; status: PlanStepStatus }) => ({
            ...step,
            status: 'running' as PlanStepStatus,
          }),
        );

        // Create a new plan with all steps set to running
        const planWithRunningSteps = {
          ...planCopy,
          steps: runningSteps,
        };

        // Log the plan ID we're about to start polling with
        console.log(
          `[DEEP SEARCH] Starting polling with plan ID: ${planWithRunningSteps.createdAt}`,
        );

        // Update the UI with all steps as running
        runningSteps.forEach((step: { id: string; status: PlanStepStatus }) => {
          console.log(`[DEEP SEARCH] Setting step "${step.id}" to running`);
          onStepUpdate?.(step.id, 'running');
        });

        // Start polling for updates immediately with the running steps
        startPolling(planWithRunningSteps);

        // Execute the plan on the server
        console.log(`[DEEP SEARCH] Calling server to execute plan with ID: ${planId}`);

        // Call the dedicated execution endpoint
        const executeResponse = await fetch(
          `/api/execute-deep-search?planId=${encodeURIComponent(planId)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              planId,
              orchestratorModel,
              workerModel,
            }),
          },
        );

        if (!executeResponse.ok) {
          const errorData = await executeResponse.json();
          const errorMessage = errorData.error || executeResponse.statusText;
          const errorDetails = errorData.details || '';

          // Provide more helpful error messages for specific error cases
          let userFriendlyError = `Failed to execute search plan: ${errorMessage}`;

          if (errorMessage.includes('No model providers available')) {
            userFriendlyError =
              'No API keys configured. Please add API keys for at least one model provider in the .env file to use deep search.';
            console.error('[DEEP SEARCH] API key configuration error:', errorDetails);
          } else if (executeResponse.status === 404) {
            userFriendlyError =
              'The search plan was not found on the server. Please try creating a new plan.';
          } else if (executeResponse.status >= 500) {
            userFriendlyError =
              'Server error while executing the search plan. Please try again later.';
            console.error('[DEEP SEARCH] Server error details:', errorDetails);
          }

          throw new Error(userFriendlyError);
        }

        const executeResult = await executeResponse.json();
        console.log(
          `[DEEP SEARCH] Plan execution started on server: ${executeResult.message} using ${executeResult.modelProvider}`,
        );

        // Continue with API call to ensure we get the latest plan data
        console.log(`[DEEP SEARCH] Fetching latest plan data from the server`);
        const updatedPlan: SearchPlan | null = await callDeepSearchAPI(planCopy.query, false);

        // Verify we got back a plan with the same ID
        if (updatedPlan) {
          if (updatedPlan.createdAt !== planId) {
            console.warn(
              `[DEEP SEARCH] Server returned plan with different ID! Original: ${planId}, New: ${updatedPlan.createdAt}`,
            );
            // Force the correct ID to ensure consistency
            updatedPlan.createdAt = planId;
          }

          // Add the conversation turn to the updated plan
          updatedPlan.conversationTurn = planCopy.conversationTurn;

          // Log that we're continuing to poll with the original plan ID
          console.log(
            `[DEEP SEARCH] Plan execution initiated on server. Continuing to poll with ID: ${planId}`,
          );
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);

        // Mark all pending/running steps as errored
        plan.steps.forEach((step) => {
          if (step.status === 'pending' || step.status === 'running') {
            onStepUpdate?.(
              step.id,
              'error',
              undefined,
              `Failed to execute step: ${error instanceof Error ? error.message : String(error)}`,
              step.toolCalls,
            );
          }
        });
        setIsExecutingPlan(false);
        stopPolling();
      }
    },
    [
      isDeepSearchMode,
      startPolling,
      orchestratorModel,
      workerModel,
      callDeepSearchAPI,
      onStepUpdate,
      stopPolling,
    ],
  );

  return {
    isDeepSearchMode,
    setIsDeepSearchMode,
    createDeepSearchPlan,
    executeDeepSearchPlan,
    isCreatingPlan,
    isExecutingPlan,
    error,
    stopPolling,
  };
}
