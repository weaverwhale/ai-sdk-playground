import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { Request, Response } from 'express';

// Convert fs methods to promise-based
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

// Types for our architecture data
interface ArchitectureData {
  diagramCode: string;
  frontendComponents: string[];
  backendComponents: string[];
  apiEndpoints: string[];
}

// File extensions to analyze
const EXTENSIONS_TO_SCAN = ['.ts', '.tsx', '.js', '.jsx'];

// Paths to scan
const FRONTEND_DIRS = ['src'];
const BACKEND_DIRS = ['server'];

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
      } else if (fileStat.isFile() && EXTENSIONS_TO_SCAN.includes(path.extname(filePath))) {
        result.push(filePath);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }

  return result;
}

/**
 * Analyze frontend files to extract component information
 */
async function analyzeFrontend(files: string[]): Promise<string[]> {
  const components: Set<string> = new Set();
  const componentRegex = /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g;
  const hookRegex = /export\s+(?:default\s+)?(?:function|const)\s+(use\w+)/g;

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');

      // Extract component names
      let match;
      const componentMatches = content.matchAll(componentRegex);
      for (match of componentMatches) {
        if (match[1]) {
          const componentName = match[1];
          // Skip if it's a utility function, not a component
          if (!componentName.startsWith('use') && !componentName.startsWith('get')) {
            components.add(componentName);
          }
        }
      }

      // Extract hook names
      const hookMatches = content.matchAll(hookRegex);
      for (match of hookMatches) {
        if (match[1]) {
          components.add(`${match[1]} (Hook)`);
        }
      }
    } catch (error) {
      console.error(`Error reading file ${file}:`, error);
    }
  }

  // Add framework info
  return ['React Application (React 19, Vite)', ...Array.from(components).sort()];
}

/**
 * Analyze backend files to extract API endpoints and services
 */
async function analyzeBackend(files: string[]): Promise<{
  backendComponents: string[];
  apiEndpoints: string[];
}> {
  const components: Set<string> = new Set();
  const endpoints: Set<string> = new Set();

  // Improved regex to find Express route definitions with different declaration styles
  const routeRegex =
    /app\.(?:get|post|put|delete|patch|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const routeRegex2 =
    /router\.(?:get|post|put|delete|patch|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const routeRegex3 = /\.(get|post|put|delete|patch|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const exportRegex = /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g;

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');

      // Extract API endpoints using multiple regex patterns
      let match;

      // Match app.method() pattern
      const routeMatches = content.matchAll(routeRegex);
      for (match of routeMatches) {
        if (match[1]) {
          endpoints.add(`${match[1]} [${match[0].split('.')[1].toUpperCase()}]`);
        }
      }

      // Match router.method() pattern
      const routerMatches = content.matchAll(routeRegex2);
      for (match of routerMatches) {
        if (match[1]) {
          endpoints.add(`${match[1]} [${match[0].split('.')[1].toUpperCase()}]`);
        }
      }

      // Match generic .method() pattern
      const genericMatches = content.matchAll(routeRegex3);
      for (match of genericMatches) {
        if (match[1] && match[2]) {
          endpoints.add(`${match[2]} [${match[1].toUpperCase()}]`);
        }
      }

      // Extract service and utility names
      const exportMatches = content.matchAll(exportRegex);
      for (match of exportMatches) {
        if (match[1]) {
          // Filter out small utility functions
          const functionName = match[1];
          if (functionName.length > 3 && !functionName.startsWith('_')) {
            components.add(functionName);
          }
        }
      }

      // Check for common backend patterns
      if (content.includes('import express')) {
        components.add('Express Server');
      }
      if (content.includes('new Router()') || content.includes('express.Router()')) {
        components.add('Express Router');
      }
      if (content.includes('mongoose')) {
        components.add('Mongoose (MongoDB)');
      }
    } catch (error) {
      console.error(`Error reading file ${file}:`, error);
    }
  }

  return {
    backendComponents: ['Express Server (Node.js)', ...Array.from(components).sort()],
    apiEndpoints: Array.from(endpoints).sort(),
  };
}

/**
 * Generate a Mermaid diagram from the analyzed components
 */
function generateMermaidDiagram(
  frontendComponents: string[],
  backendComponents: string[],
  apiEndpoints: string[],
): string {
  // Clean component names to be mermaid-friendly
  const cleanName = (name: string): string => name.replace(/[^\w]/g, '').replace(/\s+/g, '');

  // Start with TB (top-bottom) layout for vertical orientation
  let diagram = `
  flowchart TB
    %% Use TB (top to bottom) layout for vertical orientation
    
    %% Define node styles to be more compact
    linkStyle default interpolate basis
    
    subgraph "Frontend"
      React["React App"]
  `;

  // Add frontend components - arrange them horizontally for better vertical layout
  const frontendCompsToShow = frontendComponents
    .filter((c) => !c.includes('React Application') && !c.includes('(Hook)'))
    .slice(0, 12); // Limit to top 12 components

  // Create rows for frontend components (was columns in horizontal layout)
  const ROW_SIZE = 4; // More components per row in vertical layout
  for (let i = 0; i < frontendCompsToShow.length; i++) {
    const component = frontendCompsToShow[i];
    const cleanedName = cleanName(component);
    const displayName = component.split(' (')[0].replace('Component', ''); // Shorter display names

    // Add the component node with a compact label
    diagram += `\n      ${cleanedName}["${displayName}"]`;

    // Connect all to React
    diagram += `\n      React --> ${cleanedName}`;

    // Connect components in the same row horizontally
    if (i % ROW_SIZE !== 0 && i > 0) {
      const prevCompName = cleanName(frontendCompsToShow[i - 1]);
      diagram += `\n      ${prevCompName} --- ${cleanedName}`;
    }
  }

  diagram += `\n    end\n`;

  // Add backend components below frontend
  diagram += `\n    subgraph "Backend"
      Server["Express Server"]
  `;

  // Limit backend components and arrange them more compactly
  const backendCompsToShow = backendComponents
    .filter((c) => !c.includes('Express Server'))
    .slice(0, 12); // Limit to top 12 components

  // Create rows for backend components (similar to frontend)
  for (let i = 0; i < backendCompsToShow.length; i++) {
    const component = backendCompsToShow[i];
    const cleanedName = cleanName(component);
    const displayName = component.split(' (')[0]; // Keep original names for backend components

    // Add the component node
    diagram += `\n      ${cleanedName}["${displayName}"]`;

    // Connect all to Server
    diagram += `\n      Server --> ${cleanedName}`;

    // Connect components in the same row horizontally
    if (i % ROW_SIZE !== 0 && i > 0) {
      const prevCompName = cleanName(backendCompsToShow[i - 1]);
      diagram += `\n      ${prevCompName} --- ${cleanedName}`;
    }
  }

  diagram += `\n    end\n`;

  // Add vertical flow between frontend and backend
  diagram += `\n    React --> Server\n`;

  // Add API endpoints subgraph below backend
  diagram += `\n    subgraph "API Endpoints"`;

  // Limit number of endpoints shown to prevent diagram from getting too large
  const endpointsToShow = apiEndpoints.slice(0, 10); // Show up to 10 endpoints

  // Add each endpoint as a node in a more horizontal arrangement for vertical diagram
  for (let i = 0; i < endpointsToShow.length; i++) {
    const endpoint = apiEndpoints[i];
    const endpointId = `Endpoint${i}`;
    const displayEndpoint = endpoint.replace('[', '<br/>['); // Add line break before method

    diagram += `\n      ${endpointId}["${displayEndpoint}"]`;

    // Connect all endpoints to Server
    diagram += `\n      Server --> ${endpointId}`;

    // Connect endpoints in rows horizontally
    if (i % ROW_SIZE !== 0 && i > 0) {
      diagram += `\n      Endpoint${i - 1} --- ${endpointId}`;
    }
  }

  // Show message if there are more endpoints
  if (apiEndpoints.length > endpointsToShow.length) {
    const moreCount = apiEndpoints.length - endpointsToShow.length;
    diagram += `\n      MoreEndpoints["+ ${moreCount} more endpoints"]`;

    // Connect to the last endpoint in a row
    const lastRowSize = endpointsToShow.length % ROW_SIZE || ROW_SIZE;
    const lastRowStart = endpointsToShow.length - lastRowSize;
    diagram += `\n      Endpoint${lastRowStart} --- MoreEndpoints`;
  }

  diagram += `\n    end\n`;

  // External models at the bottom
  diagram += `
    ExternalSvcs["External AI Services"]
    Server <--> ExternalSvcs
  `;

  // Add styling - more subtle colors for better readability
  diagram += `
    classDef frontend fill:#e6f7ff,stroke:#0099cc,stroke-width:1px
    classDef backend fill:#fff5e6,stroke:#ff9933,stroke-width:1px
    classDef external fill:#f5e6ff,stroke:#9966cc,stroke-width:1px
    classDef api fill:#f0f9e8,stroke:#66cc33,stroke-width:1px
    classDef endpoint fill:#e6ffec,stroke:#33cc66,stroke-width:1px
    
    class React frontend
  `;

  // Add component classes only if there are components
  const frontendClassNames = frontendCompsToShow.map((c) => cleanName(c.split(' (')[0]));
  if (frontendClassNames.length > 0) {
    diagram += `\n    class ${frontendClassNames.join(',')} frontend`;
  }

  diagram += `\n    class Server backend`;

  const backendClassNames = backendCompsToShow.map((c) => cleanName(c.split(' (')[0]));
  if (backendClassNames.length > 0) {
    diagram += `\n    class ${backendClassNames.join(',')} backend`;
  }

  // Add endpoint styling
  for (let i = 0; i < endpointsToShow.length; i++) {
    diagram += `\n    class Endpoint${i} endpoint`;
  }
  if (apiEndpoints.length > endpointsToShow.length) {
    diagram += `\n    class MoreEndpoints endpoint`;
  }

  diagram += `\n    class ExternalSvcs external`;

  return diagram;
}

/**
 * Handle the architecture API request
 */
export async function handleArchitectureRequest(req: Request, res: Response) {
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

    // Generate diagram
    const diagramCode = generateMermaidDiagram(frontendComponents, backendComponents, apiEndpoints);

    // Prepare and send the response
    const architectureData: ArchitectureData = {
      diagramCode,
      frontendComponents,
      backendComponents,
      apiEndpoints,
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
