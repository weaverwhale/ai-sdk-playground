import { useEffect, memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { SearchPlan, PlanStep, ToolCall, ToolInfo } from '../../types/chatTypes';
import { ToolOutput } from '../ToolOutput';

import './index.css';

interface SearchPlanDisplayProps {
  plan: SearchPlan;
  className?: string;
  toolOptions: Record<string, ToolInfo>;
}

interface SearchPlanStepCardProps {
  step: PlanStep;
  isExpanded: boolean;
  toggleExpansion: () => void;
  toolOptions: Record<string, ToolInfo>;
}

// Use memo to optimize rendering with custom comparison
const SearchPlanStepCard = memo(
  ({ step, isExpanded, toggleExpansion, toolOptions }: SearchPlanStepCardProps) => {
    // Add state to track expanded tool calls
    const [expandedToolCalls, setExpandedToolCalls] = useState<Record<number, boolean>>({});

    // Toggle function for tool calls
    const toggleToolCall = (idx: number) => {
      setExpandedToolCalls((prev) => ({
        ...prev,
        [idx]: !prev[idx],
      }));
    };

    // Status indicator styling
    const getStatusStyles = () => {
      switch (step.status) {
        case 'pending':
          return { color: '#6d6e72', icon: '⏳' };
        case 'running':
          return { color: '#3498db', icon: '🔄' };
        case 'completed':
          return { color: '#2ecc71', icon: '✅' };
        case 'error':
          return { color: '#e74c3c', icon: '❌' };
        default:
          return { color: '#6d6e72', icon: '⏳' };
      }
    };

    const statusStyles = getStatusStyles();

    return (
      <div className="search-plan-step" data-status={step.status} data-step-id={step.id}>
        <div
          className="step-header"
          onClick={() => {
            if (step.status === 'completed') {
              toggleExpansion();
            }
          }}
        >
          <span className="step-icon" style={{ color: statusStyles.color }}>
            {statusStyles.icon}
          </span>
          <h4 className="step-description">{step.description}</h4>
          <span className="step-status" style={{ color: statusStyles.color }}>
            {step.status}
          </span>
          {step.status === 'completed' && (
            <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
          )}
        </div>

        {step.status === 'running' && (
          <div className="step-loading">
            <div className="loading-indicator"></div>
            <span>Processing...</span>
          </div>
        )}

        {isExpanded &&
          (step.toolCalls && step.toolCalls.length > 0 ? (
            <div className="step-output">
              <div className="step-tool-calls">
                <div className="tools-header">
                  <span className="tools-header-text">Tool Calls ({step.toolCalls.length})</span>
                </div>
                {step.toolCalls.map((toolCall: ToolCall, idx: number) => (
                  <div key={idx} className="tool-call-item">
                    <div
                      className={`tool-call-header ${expandedToolCalls[idx] ? 'expanded' : ''}`}
                      onClick={() => toggleToolCall(idx)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="tool-call-badge">
                        <span className="tool-icon">🔧</span>
                        Tool used:{' '}
                        <strong>{toolOptions[toolCall.name]?.name || toolCall.name}</strong>
                      </span>
                      <span className="toggle-icon">{expandedToolCalls[idx] ? '▼' : '▶'}</span>
                    </div>
                    {expandedToolCalls[idx] && (
                      <div className="tool-call-result">
                        {toolCall.output ? (
                          <ToolOutput output={toolCall.output} toolName={toolCall.name} />
                        ) : (
                          <p className="no-result">No result data available from this tool.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : step.output ? (
            <>
              {step.toolCalls && step.toolCalls.length > 0 && (
                <div className="output-separator">
                  <span className="output-header-text">Step Output</span>
                </div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {step.output}
              </ReactMarkdown>
            </>
          ) : null)}

        {isExpanded && step.error && (
          <div className="step-error">
            <p>Error: {step.error}</p>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Always re-render if expansion state changes
    if (prevProps.isExpanded !== nextProps.isExpanded) {
      return false; // re-render
    }

    // Always re-render if status has changed
    if (prevProps.step.status !== nextProps.step.status) {
      console.log(
        `Step ${nextProps.step.id} status changed from ${prevProps.step.status} to ${nextProps.step.status}, re-rendering`,
      );
      return false; // re-render
    }

    // Re-render if output or error changed
    if (
      prevProps.step.output !== nextProps.step.output ||
      prevProps.step.error !== nextProps.step.error
    ) {
      console.log(`Step ${nextProps.step.id} output or error changed, re-rendering`);
      return false; // re-render
    }

    return true; // no re-render needed
  },
);

// Use memo for the main component as well with custom comparison
const SearchPlanDisplay = memo(
  ({ plan, className = '', toolOptions }: SearchPlanDisplayProps) => {
    // Use a local counter to force re-renders
    const [updateCounter, setUpdateCounter] = useState(0);

    // Track expanded steps
    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

    // State for whether the summary is expanded
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);

    // Helper function to toggle a step's expansion state
    const toggleStepExpansion = (stepId: string) => {
      setExpandedSteps((prev) => ({
        ...prev,
        [stepId]: !prev[stepId],
      }));
    };

    // Force a re-render every 2 seconds while there are running steps
    useEffect(() => {
      // Check if any steps are running
      const hasRunningSteps = plan.steps.some(
        (step) => step.status === 'running' || step.status === 'pending',
      );

      if (hasRunningSteps) {
        const timerId = setInterval(() => {
          setUpdateCounter((prev) => prev + 1);
          console.log(
            '[SEARCH PLAN] Forcing re-render for running steps, counter:',
            updateCounter + 1,
          );
        }, 2000);

        return () => clearInterval(timerId);
      }
    }, [plan.steps, updateCounter]);

    if (!plan || !plan.steps || plan.steps.length === 0) {
      return null;
    }

    // Count steps by status
    const stepCounts = plan.steps.reduce((counts, step) => {
      counts[step.status] = (counts[step.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const totalSteps = plan.steps.length;
    const completedSteps = stepCounts.completed || 0;
    const runningSteps = stepCounts.running || 0;
    const pendingSteps = stepCounts.pending || 0;
    const errorSteps = stepCounts.error || 0;
    const progress = Math.round((completedSteps / totalSteps) * 100);

    console.log(
      `[SEARCH PLAN] Rendering with ${pendingSteps} pending, ${runningSteps} running, ${completedSteps} completed, ${errorSteps} error steps`,
    );

    // Check if all steps are completed or have errors (to display the final summary)
    const isSearchComplete = pendingSteps === 0 && runningSteps === 0;

    return (
      <div className={`${className}`}>
        <div className="search-plan-header">
          <h3>Deep Search Plan</h3>
          <div className="plan-meta">
            <span className="complexity">
              Complexity: <strong>{plan.complexity}</strong>
            </span>
            <span className="progress">
              Progress: <strong>{progress}%</strong> ({completedSteps}/{totalSteps})
            </span>
            <span className="status-counts">
              Pending: {pendingSteps}, Running: {runningSteps}, Completed: {completedSteps}, Error:{' '}
              {errorSteps}
            </span>
          </div>
        </div>

        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>

        {/* Display summary section if search is complete and summary exists */}
        {isSearchComplete && plan.summary && (
          <div className="search-plan-summary">
            <div
              className="summary-header"
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
            >
              <h4>Summary of Findings</h4>
              <span className="toggle-icon">{isSummaryExpanded ? '▼' : '▶'}</span>
            </div>

            {isSummaryExpanded && (
              <div className="summary-content">
                <p>{plan.summary}</p>
              </div>
            )}
          </div>
        )}

        <div className="search-plan-steps">
          {plan.steps.map((step) => (
            <SearchPlanStepCard
              key={`${step.id}-${step.status}-${updateCounter}`}
              step={step}
              isExpanded={!!expandedSteps[step.id]}
              toggleExpansion={() => toggleStepExpansion(step.id)}
              toolOptions={toolOptions}
            />
          ))}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Always re-render if plan reference has changed
    if (prevProps.plan !== nextProps.plan) {
      console.log('[SEARCH PLAN] Plan reference changed, forcing re-render');
      return false; // Re-render
    }

    // Re-render if steps length has changed
    if (prevProps.plan.steps.length !== nextProps.plan.steps.length) {
      console.log('[SEARCH PLAN] Steps length changed, forcing re-render');
      return false; // Re-render
    }

    // Always re-render if summary has changed
    if (prevProps.plan.summary !== nextProps.plan.summary) {
      console.log('[SEARCH PLAN] Summary changed, forcing re-render');
      return false; // Re-render
    }

    // Always re-render if any step status has changed - this is crucial
    for (let i = 0; i < prevProps.plan.steps.length; i++) {
      if (prevProps.plan.steps[i].status !== nextProps.plan.steps[i].status) {
        console.log(
          `[SEARCH PLAN] Step ${i} status changed from ${prevProps.plan.steps[i].status} to ${nextProps.plan.steps[i].status}`,
        );
        return false; // Re-render
      }
    }

    // Force re-render if output or error has changed
    for (let i = 0; i < prevProps.plan.steps.length; i++) {
      if (
        prevProps.plan.steps[i].output !== nextProps.plan.steps[i].output ||
        prevProps.plan.steps[i].error !== nextProps.plan.steps[i].error
      ) {
        console.log(`[SEARCH PLAN] Step ${i} output or error changed`);
        return false; // Re-render
      }
    }

    // Default: don't re-render (return true) if nothing important changed
    console.log('[SEARCH PLAN] No important changes detected, skipping re-render');
    return true;
  },
);

export default SearchPlanDisplay;
