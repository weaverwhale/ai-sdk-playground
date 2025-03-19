import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with configuration
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'monospace'
});

interface MermaidDiagramProps {
  chart: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
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
        mermaid.run({
          nodes: [diagramDiv]
        }).catch(error => {
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

export default MermaidDiagram; 