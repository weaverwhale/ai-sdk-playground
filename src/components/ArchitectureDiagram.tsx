import React, { useEffect, useState } from 'react';
import MermaidDiagram from './MermaidDiagram';
import './ArchitectureDiagram.css';

interface ArchitectureData {
  diagramCode: string;
  frontendComponents: string[];
  backendComponents: string[];
  apiEndpoints: string[];
}

const ArchitectureDiagram: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [architectureData, setArchitectureData] = useState<ArchitectureData | null>(null);

  // Fetch architecture data
  useEffect(() => {
    const fetchArchitectureData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/architecture');

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setArchitectureData(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch architecture data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load architecture data');
        // Fallback to static diagram if API fails
        setArchitectureData({
          diagramCode: getStaticDiagramCode(),
          frontendComponents: [
            'React Application (React 19, Vite)',
            'UI Components (Chat, Search Plan, Diagrams)',
            'Custom Hooks',
          ],
          backendComponents: [
            'Express Server (Node.js)',
            'API Endpoints (chat, tools, deep search)',
            'Model Providers Integration',
            'Tools and Utilities',
            'Chat Memory Storage',
          ],
          apiEndpoints: [
            '/api/chat',
            '/api/tools',
            '/api/models',
            '/api/deep-search',
            '/api/execute-deep-search',
          ],
        });
      } finally {
        setLoading(false);
      }
    };

    fetchArchitectureData();
  }, []);

  // Fallback static diagram code
  const getStaticDiagramCode = () => `
    flowchart TB
    %% Top to bottom layout
    
    subgraph "Frontend"
      React["React App"]
      Chatbot["Chatbot"]
      SearchPlan["SearchPlan"]
      MermaidD["MermaidDiagram"]
      
      React --> Chatbot
      React --> SearchPlan
      React --> MermaidD
    end
    
    subgraph "Backend"
      Server["Express Server"]
      API["API Endpoints"]
      Tools["Tools"]
      Models["Model Providers"]
      
      Server --> API
      Server --> Models
      API --> Tools
    end
    
    React <-->|HTTP Requests| API
    
    ExternalSvcs["External AI Services"]
    Server <--> ExternalSvcs
    
    classDef frontend fill:#e6f7ff,stroke:#0099cc,stroke-width:1px
    classDef backend fill:#fff5e6,stroke:#ff9933,stroke-width:1px
    classDef external fill:#f5e6ff,stroke:#9966cc,stroke-width:1px
    
    class React,Chatbot,SearchPlan,MermaidD frontend
    class Server,API,Tools,Models backend
    class ExternalSvcs external
  `;

  if (loading) {
    return (
      <div className="architecture-page">
        <h1>Application Architecture</h1>
        <div className="loading-indicator">Loading architecture data...</div>
      </div>
    );
  }

  return (
    <div className="architecture-page">
      <h1>Application Architecture</h1>
      <p>This diagram shows the overall architecture of the AI SDK Playground application.</p>

      {error && (
        <div className="error-message">
          {error}
          <p>Showing static diagram as fallback.</p>
        </div>
      )}

      <div className="architecture-diagram">
        <div className="mermaid-diagram">
          <MermaidDiagram chart={architectureData?.diagramCode || getStaticDiagramCode()} />
        </div>
      </div>

      <div className="architecture-explanation">
        <h2>Architecture Explanation</h2>

        <h3>Frontend</h3>
        <ul>
          {architectureData?.frontendComponents?.map((component, index) => (
            <li key={`frontend-${index}`}>
              <strong>{component}</strong>
            </li>
          ))}
        </ul>

        <h3>Backend</h3>
        <ul>
          {architectureData?.backendComponents?.map((component, index) => (
            <li key={`backend-${index}`}>
              <strong>{component}</strong>
            </li>
          ))}
        </ul>

        <h3>API Endpoints</h3>
        <ul>
          {architectureData?.apiEndpoints?.map((endpoint, index) => (
            <li key={`api-${index}`}>
              <code>{endpoint}</code>
            </li>
          ))}
        </ul>

        <h3>Data Flow</h3>
        <p>
          The frontend makes HTTP requests to the backend API endpoints. The backend communicates
          with external AI model providers, processes requests, and returns responses to the
          frontend. Chat memory is managed on the server side to maintain conversation context.
        </p>
      </div>
    </div>
  );
};

export default ArchitectureDiagram;
