import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { Request, Response } from 'express';

// Convert fs methods to promise-based
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Types for our architecture data
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

// File extensions to analyze (excluding .d.ts declaration files)
const EXTENSIONS_TO_SCAN = ['.ts', '.tsx', '.js', '.jsx'];

// Paths to scan
const FRONTEND_DIRS = ['src'];
const BACKEND_DIRS = ['server'];

/**
 * Get a clean filename without extension for display
 */
function getCleanFileName(filePath: string): string {
  const fileName = path.basename(filePath);
  const nameWithoutExt = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
  return nameWithoutExt;
}

/**
 * Recursively scan directories to get all relevant files
 */
async function scanDirectory(dir: string): Promise<string[]> {
  const result: string[] = [];

  try {
    const files = await readdir(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const fileStat = await stat(filePath);

      if (fileStat.isDirectory() && !file.startsWith('node_modules') && !file.startsWith('.')) {
        // Recursively scan subdirectories
        const subDirFiles = await scanDirectory(filePath);
        result.push(...subDirFiles);
      } else if (
        fileStat.isFile() &&
        EXTENSIONS_TO_SCAN.includes(path.extname(filePath)) &&
        !filePath.endsWith('.d.ts')
      ) {
        result.push(filePath);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }

  return result;
}

/**
 * Analyze frontend files to extract organized file structure
 */
async function analyzeFrontend(files: string[]): Promise<ComponentItem[]> {
  const organized: { [key: string]: Array<{ name: string; filePath: string }> } = {};

  for (const file of files) {
    const relativePath = file.replace(/^src\//, ''); // Remove src/ prefix
    const directory = path.dirname(relativePath);
    const fileName = getCleanFileName(file);

    // Better organization logic
    if (directory === '.') {
      // Root level files
      if (!organized['📄 Root Files']) {
        organized['📄 Root Files'] = [];
      }
      organized['📄 Root Files'].push({ name: fileName, filePath: file });
    } else if (directory.includes('/')) {
      // Nested directories like "components/Chatbot"
      const parts = directory.split('/');
      const mainDir = parts[0];
      const subDir = parts.slice(1).join('/');

      const displayName = `📁 ${mainDir}/${subDir}`;
      if (!organized[displayName]) {
        organized[displayName] = [];
      }

      // For index files, show the parent directory name instead
      if (fileName === 'index') {
        organized[displayName].push({ name: subDir, filePath: file });
      } else {
        organized[displayName].push({ name: fileName, filePath: file });
      }
    } else {
      // Single level directories
      const displayName = `📁 ${directory}`;
      if (!organized[displayName]) {
        organized[displayName] = [];
      }
      organized[displayName].push({ name: fileName, filePath: file });
    }
  }

  // Convert organized structure to flat list with file paths
  const result: ComponentItem[] = [];
  Object.entries(organized).forEach(([category, files]) => {
    result.push({ name: category, type: 'category' });
    files.forEach((file) => {
      result.push({ name: file.name, filePath: file.filePath, type: 'file' });
    });
  });

  return result;
}

/**
 * Analyze backend files to extract file structure and simple API endpoints
 */
async function analyzeBackend(files: string[]): Promise<{
  backendComponents: ComponentItem[];
  apiEndpoints: string[];
}> {
  const categories: { [key: string]: Array<{ name: string; filePath: string }> } = {
    '🖥️ Server Files': [],
    '🌐 API Routes': [],
    '🛠️ AI Tools': [],
    '⚙️ Configuration': [],
  };
  const apiEndpoints: string[] = [];

  for (const file of files) {
    const relativePath = file.replace(/^server\//, ''); // Remove server/ prefix
    const directory = path.dirname(relativePath);
    const fileName = getCleanFileName(file);

    // Extract simple API endpoints from file paths
    if (file.includes('/api/') && fileName !== 'index') {
      apiEndpoints.push(`/api/${fileName}`);
    }

    // Categorize files
    const lowerFile = fileName.toLowerCase();

    if (directory === 'api') {
      categories['🌐 API Routes'].push({ name: fileName, filePath: file });
    } else if (directory === 'tools') {
      categories['🛠️ AI Tools'].push({ name: fileName, filePath: file });
    } else if (lowerFile.includes('config') || lowerFile.includes('provider')) {
      categories['⚙️ Configuration'].push({ name: fileName, filePath: file });
    } else {
      categories['🖥️ Server Files'].push({ name: fileName, filePath: file });
    }
  }

  // Convert categorized structure to flat list with file paths
  const result: ComponentItem[] = [];
  Object.entries(categories).forEach(([category, files]) => {
    if (files.length > 0) {
      result.push({ name: category, type: 'category' });
      files.forEach((file) => {
        result.push({ name: file.name, filePath: file.filePath, type: 'file' });
      });
    }
  });

  return {
    backendComponents: result,
    apiEndpoints: apiEndpoints.sort(),
  };
}

/**
 * Generate a Mermaid diagram from the analyzed components
 */
function generateMermaidDiagram(
  _frontendComponents: string[],
  _backendComponents: string[],
  apiEndpoints: string[],
): string {
  // Create a clean, compact left-to-right layout
  const endpointCount = apiEndpoints.length;

  let diagram = `
  flowchart LR
    %% Clean, readable architecture overview
    
    %% Frontend Section
    subgraph "🎨 Frontend"
      direction TB
      UI["📱 React Components"]
      Hooks["🔗 Custom Hooks"]
      Assets["📁 Static Assets"]
    end
    
    %% Backend Section  
    subgraph "🖥️ Backend"
      direction TB
      API["🌐 API Routes"]
      Tools["🛠️ AI Tools"]
      Config["⚙️ Server Config"]
    end
    
    %% External Services
    External["🌍 External Services<br/>OpenAI • Anthropic • Google • LMStudio"]
    
    %% Main Data Flow
    UI -->|HTTP Requests| API
    API --> Tools
    Tools -->|API Calls| External
    Config -.-> API
    Hooks -.-> UI
    Assets -.-> UI
  `;

  // Add endpoint summary if we have endpoints
  if (endpointCount > 0) {
    diagram += `
    
    %% API Details
    APIInfo["📋 ${endpointCount} Endpoints"]
    API -.-> APIInfo
    `;
  }

  // Modern, clean styling
  diagram += `
    
    %% Clean modern styling
    classDef frontend fill:#e3f2fd,stroke:#1976d2,stroke-width:2px,color:#1a1a1a
    classDef backend fill:#fff3e0,stroke:#f57c00,stroke-width:2px,color:#1a1a1a
    classDef external fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#1a1a1a
    classDef info fill:#f1f8e9,stroke:#388e3c,stroke-width:2px,color:#1a1a1a
    
    class UI,Hooks,Assets frontend
    class API,Tools,Config backend
    class External external
    class APIInfo info
  `;

  return diagram;
}

/**
 * Handle the architecture API request
 */
export async function handleArchitectureRequest(_req: Request, res: Response) {
  try {
    console.log('[SERVER] Generating architecture data...');

    // Scan directories
    const frontendFiles: string[] = [];
    const backendFiles: string[] = [];

    for (const dir of FRONTEND_DIRS) {
      const files = await scanDirectory(dir);
      frontendFiles.push(...files);
    }

    for (const dir of BACKEND_DIRS) {
      const files = await scanDirectory(dir);
      backendFiles.push(...files);
    }

    console.log(
      `[SERVER] Found ${frontendFiles.length} frontend files and ${backendFiles.length} backend files`,
    );

    // Analyze files
    const frontendComponents = await analyzeFrontend(frontendFiles);
    const { backendComponents, apiEndpoints } = await analyzeBackend(backendFiles);

    // Generate diagram (passing empty arrays for now as diagram generation doesn't use the new structure yet)
    const diagramCode = generateMermaidDiagram([], [], apiEndpoints);

    // Prepare and send the response
    const architectureData: ArchitectureData = {
      diagramCode,
      frontendComponents,
      backendComponents,
      apiEndpoints,
      workspacePath: process.cwd(),
    };

    res.json(architectureData);
  } catch (error) {
    console.error('[SERVER] Error generating architecture data:', error);
    res.status(500).json({
      error: 'Failed to generate architecture data',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
