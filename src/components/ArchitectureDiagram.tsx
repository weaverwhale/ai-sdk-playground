import React, { useEffect, useState } from 'react';
import MermaidDiagram from './MermaidDiagram';
import './ArchitectureDiagram.css';

interface ComponentItem {
  name: string;
  filePath?: string;
  type: 'category' | 'file';
}

interface ArchitectureData {
  diagramCode: string;
  frontendComponents: ComponentItem[];
  backendComponents: ComponentItem[];
  apiEndpoints: string[];
  workspacePath: string;
}

type EditorType = 'vscode' | 'cursor' | 'code' | 'auto';

interface EditorOption {
  value: EditorType;
  label: string;
  scheme: string;
  icon: string;
}

const EDITOR_OPTIONS: EditorOption[] = [
  { value: 'auto', label: 'Auto-detect', scheme: '', icon: '🔄' },
  { value: 'vscode', label: 'VS Code', scheme: 'vscode://file', icon: '📘' },
  { value: 'cursor', label: 'Cursor', scheme: 'cursor://file', icon: '🖱️' },
  { value: 'code', label: 'Code (Alt)', scheme: 'code://file', icon: '💻' },
];

interface EditorContextMenu {
  show: boolean;
  x: number;
  y: number;
  filePath: string;
}

const ArchitectureDiagram: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [architectureData, setArchitectureData] = useState<ArchitectureData | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenu>({
    show: false,
    x: 0,
    y: 0,
    filePath: '',
  });

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editorContextMenu.show) {
        const target = event.target as Element;
        // Only close if clicking outside the context menu
        if (!target.closest('.editor-context-menu')) {
          console.log('🔥 Clicking outside context menu, closing');
          setEditorContextMenu((prev) => ({ ...prev, show: false }));
        }
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && editorContextMenu.show) {
        setEditorContextMenu((prev) => ({ ...prev, show: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [editorContextMenu.show]);

  // Function to show editor selection context menu
  const handleFileClick = (event: React.MouseEvent, filePath: string) => {
    console.log(`🔥 handleFileClick called for: ${filePath}`);
    event.preventDefault();
    event.stopPropagation();

    // Calculate position to keep menu on screen
    const menuWidth = 200;
    const menuHeight = 250; // Approximate height
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 10);

    const menuState = {
      show: true,
      x: Math.max(10, x),
      y: Math.max(10, y),
      filePath,
    };

    console.log(`🔥 Setting context menu state:`, menuState);
    setEditorContextMenu(menuState);
  };

  // Function to open file with specific editor
  const openFileWithEditor = (editorType: EditorType, filePath: string) => {
    console.log(`🔥 openFileWithEditor called with: ${editorType}, ${filePath}`);

    setEditorContextMenu((prev) => ({ ...prev, show: false }));

    console.log(`Attempting to open file: ${filePath} with editor: ${editorType}`);

    // Show immediate feedback to user
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #3b82f6;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 14px;
      max-width: 300px;
    `;

    // Create absolute path for the file
    const absolutePath = workspacePath ? `${workspacePath}/${filePath}` : filePath;
    console.log(`🔥 Using absolute path: ${absolutePath}`);

    if (editorType === 'auto') {
      // Try different URL schemes for auto-detect
      const editorAttempts = [
        { name: 'VS Code', url: `vscode://file${absolutePath}` },
        { name: 'Cursor', url: `cursor://file${absolutePath}` },
        { name: 'VS Code (alt)', url: `code://file${absolutePath}` },
      ];

      notification.innerHTML = `⏳ Trying to open ${filePath} in available editors...`;
      document.body.appendChild(notification);

      let attemptIndex = 0;
      const tryNextEditor = () => {
        if (attemptIndex >= editorAttempts.length) {
          // All attempts failed, copy to clipboard
          notification.innerHTML = `📋 Could not open editor automatically.<br><strong>File path copied to clipboard:</strong><br><code style="font-size:12px;word-break:break-all;">${absolutePath}</code>`;
          copyFilePathToClipboard(absolutePath, 'Auto-detect');
          setTimeout(() => document.body.removeChild(notification), 5000);
          return;
        }

        const attempt = editorAttempts[attemptIndex];
        console.log(`Trying ${attempt.name}: ${attempt.url}`);

        try {
          // Attempt to open the editor
          window.location.href = attempt.url;

          // Show success message
          notification.innerHTML = `✅ Attempted to open in ${attempt.name}`;
          setTimeout(() => document.body.removeChild(notification), 3000);
        } catch (error) {
          console.log(`Failed to open ${attempt.name}:`, error);
          attemptIndex++;
          setTimeout(tryNextEditor, 100);
        }
      };

      tryNextEditor();
    } else {
      // Use specific editor
      const selectedOption = EDITOR_OPTIONS.find((opt) => opt.value === editorType);
      if (selectedOption && selectedOption.scheme) {
        const url = `${selectedOption.scheme}${absolutePath}`;
        console.log(`Trying to open ${selectedOption.label}: ${url}`);

        notification.innerHTML = `⏳ Opening ${filePath} in ${selectedOption.label}...`;
        document.body.appendChild(notification);

        try {
          // Attempt to open the specific editor
          window.location.href = url;

          // Show success message
          notification.innerHTML = `✅ Attempted to open in ${selectedOption.label}`;
          setTimeout(() => document.body.removeChild(notification), 3000);
        } catch (error) {
          console.log(`Failed to open ${selectedOption.label}:`, error);
          notification.innerHTML = `📋 Could not open ${selectedOption.label}.<br><strong>File path copied to clipboard:</strong><br><code style="font-size:12px;word-break:break-all;">${absolutePath}</code>`;
          copyFilePathToClipboard(absolutePath, selectedOption.label);
          setTimeout(() => document.body.removeChild(notification), 5000);
        }
      }
    }
  };

  // Function to copy file path to clipboard with user feedback
  const copyFilePathToClipboard = (filePath: string, editorName: string) => {
    // Check if clipboard API is available
    if (navigator.clipboard && window.isSecureContext) {
      // Modern clipboard API
      navigator.clipboard
        .writeText(filePath)
        .then(() => {
          console.log('✅ Copied to clipboard successfully');
          alert(
            `📋 File path copied to clipboard:\n${filePath}\n\n${
              editorName === 'Copy Path'
                ? 'You can now paste this path in your editor.'
                : `Could not open ${editorName}. You can open it manually in your editor.`
            }`,
          );
        })
        .catch((error) => {
          console.error('❌ Failed to copy to clipboard:', error);
          // Fallback to legacy method
          fallbackCopyToClipboard(filePath, editorName);
        });
    } else {
      // Fallback for insecure contexts or older browsers
      fallbackCopyToClipboard(filePath, editorName);
    }
  };

  // Fallback clipboard method for older browsers or insecure contexts
  const fallbackCopyToClipboard = (filePath: string, editorName: string) => {
    try {
      // Create a temporary text area
      const textArea = document.createElement('textarea');
      textArea.value = filePath;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      // Try to copy using execCommand
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        console.log('✅ Fallback copy successful');
        alert(
          `📋 File path copied to clipboard:\n${filePath}\n\n${
            editorName === 'Copy Path'
              ? 'You can now paste this path in your editor.'
              : `Could not open ${editorName}. You can open it manually in your editor.`
          }`,
        );
      } else {
        throw new Error('execCommand failed');
      }
    } catch (error) {
      console.error('❌ All clipboard methods failed:', error);
      // Final fallback - just show the path
      alert(
        `📂 Please manually copy this file path:\n\n${filePath}\n\n${
          editorName === 'Copy Path'
            ? 'Use this path to open the file in your editor.'
            : `Could not open ${editorName}. Use this path to open the file manually.`
        }`,
      );
    }
  };

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
        setWorkspacePath(data.workspacePath);
        console.log('🔥 Workspace path from architecture:', data.workspacePath);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch architecture data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load architecture data');
        // Fallback to static diagram if API fails
        setArchitectureData({
          diagramCode: getStaticDiagramCode(),
          frontendComponents: [
            { name: 'CATEGORY:📄 Root Files', type: 'category' },
            { name: 'React Application', type: 'file', filePath: 'src/App.tsx' },
            { name: 'Main Entry', type: 'file', filePath: 'src/main.tsx' },
            { name: 'CATEGORY:📁 Components', type: 'category' },
            { name: 'Chatbot', type: 'file', filePath: 'src/components/Chatbot/index.tsx' },
            {
              name: 'ArchitectureDiagram',
              type: 'file',
              filePath: 'src/components/ArchitectureDiagram.tsx',
            },
            { name: 'CATEGORY:📁 Hooks', type: 'category' },
            {
              name: 'useChatbotMessages',
              type: 'file',
              filePath: 'src/hooks/useChatbotMessages.ts',
            },
          ],
          backendComponents: [
            { name: 'CATEGORY:🖥️ Server Files', type: 'category' },
            { name: 'server', type: 'file', filePath: 'server/server.ts' },
            { name: 'CATEGORY:🌐 API Routes', type: 'category' },
            { name: 'chat', type: 'file', filePath: 'server/api/chat.ts' },
            { name: 'architecture', type: 'file', filePath: 'server/api/architecture.ts' },
            { name: 'CATEGORY:🛠️ AI Tools', type: 'category' },
            { name: 'webSearch', type: 'file', filePath: 'server/tools/webSearch.ts' },
          ],
          apiEndpoints: [
            '/api/chat',
            '/api/tools',
            '/api/models',
            '/api/deep-search',
            '/api/execute-deep-search',
          ],
          workspacePath: '', // No workspace path in fallback
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
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading architecture data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="architecture-page">
      <div className="architecture-header">
        <h1>Application Architecture</h1>
        <p>This diagram shows the overall architecture of the AI SDK Playground application.</p>
      </div>

      <div className="architecture-diagram">
        {error && (
          <div className="error-message">
            {error}
            <p>Showing static diagram as fallback.</p>
          </div>
        )}

        <div className="mermaid-diagram">
          <MermaidDiagram chart={architectureData?.diagramCode || getStaticDiagramCode()} />
        </div>
      </div>

      <div className="architecture-explanation">
        <h2>Architecture Explanation</h2>

        <h3>Frontend</h3>
        <div className="component-hierarchy">
          {(() => {
            const organized: { [key: string]: ComponentItem[] } = {};
            let currentCategory = '';

            (architectureData?.frontendComponents || []).forEach((item) => {
              if (item.type === 'category') {
                currentCategory = item.name.startsWith('CATEGORY:')
                  ? item.name.replace('CATEGORY:', '')
                  : item.name;
                organized[currentCategory] = [];
              } else if (item.type === 'file' && currentCategory) {
                organized[currentCategory].push(item);
              }
            });

            return Object.entries(organized).map(([category, componentList]) => (
              <div key={category} className="category-section">
                <h4 className="category-name">{category}</h4>
                <ul className="component-list">
                  {componentList.map((component, index) => (
                    <li
                      key={`${category}-${index}`}
                      className={`component-item ${component.filePath ? 'clickable' : ''}`}
                      onClick={(e) => component.filePath && handleFileClick(e, component.filePath)}
                      title={
                        component.filePath
                          ? `Click to select editor for: ${component.filePath}`
                          : undefined
                      }
                    >
                      <strong>{component.name}</strong>
                      {component.filePath && (
                        <span className="file-path">{component.filePath}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ));
          })()}
        </div>

        <h3>Backend</h3>
        <div className="component-hierarchy">
          {(() => {
            const organized: { [key: string]: ComponentItem[] } = {};
            let currentCategory = '';

            (architectureData?.backendComponents || []).forEach((item) => {
              if (item.type === 'category') {
                currentCategory = item.name.startsWith('CATEGORY:')
                  ? item.name.replace('CATEGORY:', '')
                  : item.name;
                organized[currentCategory] = [];
              } else if (item.type === 'file' && currentCategory) {
                organized[currentCategory].push(item);
              }
            });

            return Object.entries(organized).map(([category, componentList]) => (
              <div key={category} className="category-section">
                <h4 className="category-name">{category}</h4>
                <ul className="component-list">
                  {componentList.map((component, index) => (
                    <li
                      key={`${category}-${index}`}
                      className={`component-item ${component.filePath ? 'clickable' : ''}`}
                      onClick={(e) => component.filePath && handleFileClick(e, component.filePath)}
                      title={
                        component.filePath
                          ? `Click to select editor for: ${component.filePath}`
                          : undefined
                      }
                    >
                      <strong>{component.name}</strong>
                      {component.filePath && (
                        <span className="file-path">{component.filePath}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ));
          })()}
        </div>

        <h3>API Endpoints</h3>
        <div className="api-hierarchy">
          <h4 className="category-name">🌐 Available Endpoints</h4>
          <ul className="component-list">
            {(architectureData?.apiEndpoints || []).map((endpoint, index) => (
              <li key={index} className="component-item">
                <strong>
                  <code>{endpoint}</code>
                </strong>
              </li>
            ))}
          </ul>
        </div>

        <h3>Data Flow</h3>
        <p>
          The frontend makes HTTP requests to the backend API endpoints. The backend communicates
          with external AI model providers, processes requests, and returns responses to the
          frontend. Chat memory is managed on the server side to maintain conversation context.
        </p>
      </div>

      {/* Editor Context Menu */}
      {editorContextMenu.show && (
        <div
          className="editor-context-menu"
          style={{
            position: 'fixed',
            left: editorContextMenu.x,
            top: editorContextMenu.y,
            zIndex: 1000,
          }}
        >
          <div className="context-menu-header">
            <strong>Open file:</strong>
            <small>{editorContextMenu.filePath}</small>
          </div>
          {EDITOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              className="context-menu-option"
              onClick={(e) => {
                console.log(`🔥 Button clicked for ${option.value}`);
                e.preventDefault();
                e.stopPropagation();
                openFileWithEditor(option.value, editorContextMenu.filePath);
              }}
            >
              <span className="editor-icon">{option.icon}</span>
              <span className="editor-label">{option.label}</span>
            </button>
          ))}
          <div className="context-menu-divider"></div>
          <button
            className="context-menu-option copy-path"
            onClick={(e) => {
              console.log(`🔥 Copy path button clicked`);
              e.preventDefault();
              e.stopPropagation();
              const absolutePath = workspacePath
                ? `${workspacePath}/${editorContextMenu.filePath}`
                : editorContextMenu.filePath;
              copyFilePathToClipboard(absolutePath, 'Copy Path');
              setEditorContextMenu((prev) => ({ ...prev, show: false }));
            }}
          >
            <span className="editor-icon">📋</span>
            <span className="editor-label">Copy Path</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ArchitectureDiagram;
