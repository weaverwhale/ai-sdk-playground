import { useEffect, memo, useState } from 'react';
import { SearchPlan, PlanStep } from '../../types/chatTypes';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import './index.css';

interface SearchPlanDisplayProps {
  plan: SearchPlan;
  className?: string;
}

// Use memo to optimize rendering with custom comparison
const SearchPlanStepCard = memo(({ 
  step, 
  isExpanded, 
  toggleExpansion 
}: { 
  step: PlanStep, 
  isExpanded: boolean, 
  toggleExpansion: () => void 
}) => {
  // Debug logging for step status
  useEffect(() => {
    console.log(`Step ${step.id} rendered with status: ${step.status}`);
  }, [step.id, step.status]);

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
      <div className="step-header" onClick={toggleExpansion}>
        <span className="step-icon" style={{ color: statusStyles.color }}>
          {statusStyles.icon}
        </span>
        <h4 className="step-description">{step.description}</h4>
        <span className="step-status" style={{ color: statusStyles.color }}>{step.status}</span>
        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>
      
      {step.status === 'running' && (
        <div className="step-loading">
          <div className="loading-indicator"></div>
          <span>Processing...</span>
        </div>
      )}
      
      {isExpanded && step.output && (
        <div className="step-output">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
          >
            {step.output}
          </ReactMarkdown>
        </div>
      )}
      
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
    console.log(`Step ${nextProps.step.id} status changed from ${prevProps.step.status} to ${nextProps.step.status}, re-rendering`);
    return false; // re-render
  }
  
  // Re-render if output or error changed
  if (prevProps.step.output !== nextProps.step.output || prevProps.step.error !== nextProps.step.error) {
    console.log(`Step ${nextProps.step.id} output or error changed, re-rendering`);
    return false; // re-render
  }
  
  return true; // no re-render needed
});

// Add display name for debugging
SearchPlanStepCard.displayName = 'SearchPlanStepCard';

// Use memo for the main component as well with custom comparison
const SearchPlanDisplay = memo(({ plan, className = '' }: SearchPlanDisplayProps) => {
  // Use a local counter to force re-renders
  const [updateCounter, setUpdateCounter] = useState(0);
  
  // Track expanded steps
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  
  // State for whether the summary is expanded
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  
  // Helper function to toggle a step's expansion state
  const toggleStepExpansion = (stepId: string) => {
    setExpandedSteps(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };
  
  // Force a re-render every 2 seconds while there are running steps
  useEffect(() => {
    // Check if any steps are running
    const hasRunningSteps = plan.steps.some(step => 
      step.status === 'running' || step.status === 'pending'
    );
    
    if (hasRunningSteps) {
      const timerId = setInterval(() => {
        setUpdateCounter(prev => prev + 1);
        console.log('[SEARCH PLAN] Forcing re-render for running steps, counter:', updateCounter + 1);
      }, 2000);
      
      return () => clearInterval(timerId);
    }
  }, [plan.steps, updateCounter]);
  
  // Debug logging to see when the component rerenders
  useEffect(() => {
    console.log('[SEARCH PLAN] Plan rerendered with steps:', 
      plan.steps.map(s => ({id: s.id, status: s.status})));
    
    // Log the actual DOM elements to verify what's shown in the UI
    setTimeout(() => {
      const stepElements = document.querySelectorAll('.search-plan-step');
      console.log('[SEARCH PLAN] Current DOM step elements:', 
        Array.from(stepElements).map(el => ({
          id: el.getAttribute('data-step-id'),
          status: el.getAttribute('data-status')
        }))
      );
    }, 100);
  }, [plan, plan.steps, updateCounter]);
  
  // Additional debug effect to log when specific step statuses change
  useEffect(() => {
    const statuses = plan.steps.map(s => s.status).join(',');
    console.log('[SEARCH PLAN] Step statuses changed:', statuses);
  }, [plan.steps.map(s => s.status).join(',')]);

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
  
  console.log(`[SEARCH PLAN] Rendering with ${pendingSteps} pending, ${runningSteps} running, ${completedSteps} completed, ${errorSteps} error steps`);

  // Check if all steps are completed or have errors (to display the final summary)
  const isSearchComplete = pendingSteps === 0 && runningSteps === 0;

  return (
    <div className={`search-plan-container ${className}`}>
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
            Pending: {pendingSteps}, Running: {runningSteps}, Completed: {completedSteps}, Error: {errorSteps}
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
      console.log(`[SEARCH PLAN] Step ${i} status changed from ${prevProps.plan.steps[i].status} to ${nextProps.plan.steps[i].status}`);
      return false; // Re-render
    }
  }
  
  // Force re-render if output or error has changed
  for (let i = 0; i < prevProps.plan.steps.length; i++) {
    if (prevProps.plan.steps[i].output !== nextProps.plan.steps[i].output ||
        prevProps.plan.steps[i].error !== nextProps.plan.steps[i].error) {
      console.log(`[SEARCH PLAN] Step ${i} output or error changed`);
      return false; // Re-render
    }
  }
  
  // Default: don't re-render (return true) if nothing important changed
  console.log('[SEARCH PLAN] No important changes detected, skipping re-render');
  return true;
});

// Add display name for debugging
SearchPlanDisplay.displayName = 'SearchPlanDisplay';

export default SearchPlanDisplay; 