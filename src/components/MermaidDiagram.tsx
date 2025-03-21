import React, { useEffect, useRef, memo } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with configuration
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'monospace',
});

interface MermaidDiagramProps {
  chart: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevChartRef = useRef<string>('');

  useEffect(() => {
    // Skip if chart hasn't changed
    if (chart === prevChartRef.current) return;

    prevChartRef.current = chart;

    if (containerRef.current) {
      // Clear previous diagram
      containerRef.current.innerHTML = '';

      // Create a div for the diagram
      const diagramDiv = document.createElement('div');
      diagramDiv.className = 'mermaid';
      diagramDiv.textContent = chart;

      // Add it to the container
      containerRef.current.appendChild(diagramDiv);

      // Render the diagram
      try {
        mermaid
          .run({
            nodes: [diagramDiv],
          })
          .catch((error) => {
            console.error('Mermaid rendering error:', error);
            if (containerRef.current) {
              containerRef.current.innerHTML = `<div class="mermaid-error">Error rendering diagram: ${error.message}</div>`;
            }
          });
      } catch (error) {
        console.error('Mermaid error:', error);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div class="mermaid-error">Error rendering diagram</div>`;
        }
      }
    }
  }, [chart]);

  return (
    <div className="mermaid-diagram-wrapper">
      <div ref={containerRef} className="mermaid-diagram"></div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default memo(MermaidDiagram);
