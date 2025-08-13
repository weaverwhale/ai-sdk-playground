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
  const fileStructure: Map<string, string[]> = new Map();
  const componentRegex = /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g;
  const hookRegex = /export\s+(?:default\s+)?(?:function|const)\s+(use\w+)/g;

  // First pass: group files by directory
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const relativePath = file.replace(/^src\//, ''); // Remove src/ prefix
      const directory = path.dirname(relativePath);
      const fileComponents: string[] = [];

      // Extract component names
      let match;
      const componentMatches = content.matchAll(componentRegex);
      for (match of componentMatches) {
        if (match[1]) {
          const componentName = match[1];
          // Skip if it's a utility function, not a component
          if (!componentName.startsWith('use') && !componentName.startsWith('get')) {
            components.add(componentName);
            fileComponents.push(componentName);
          }
        }
      }

      // Extract hook names
      const hookMatches = content.matchAll(hookRegex);
      for (match of hookMatches) {
        if (match[1]) {
          components.add(`${match[1]} (Hook)`);
          fileComponents.push(`${match[1]} (Hook)`);
        }
      }

      // Add to file structure map if components were found
      if (fileComponents.length > 0) {
        if (!fileStructure.has(directory)) {
          fileStructure.set(directory, []);
        }
        fileStructure.get(directory)?.push(...fileComponents);
      }
    } catch (error) {
      console.error(`Error reading file ${file}:`, error);
    }
  }

  // Convert file structure to strings
  const result: string[] = ['React Application (React 19, Vite)'];

  // Add components directly without directory entries
  fileStructure.forEach((components, directory) => {
    components.forEach((comp) => {
      if (directory === '.') {
        result.push(`Root:${comp}`);
      } else {
        result.push(`${directory}:${comp}`);
      }
    });
  });

  return result;
}

/**
 * Analyze backend files to extract API endpoints and services
 */
async function analyzeBackend(files: string[]): Promise<{
  backendComponents: string[];
  apiEndpoints: string[];
}> {
  const components: Set<string> = new Set();
  const endpointsMap = new Map<string, Set<string>>(); // Map path to set of methods
  const allEndpoints: string[] = []; // Collect all endpoints for post-processing

  // Improved regex to find Express route definitions with different declaration styles
  const routeRegex =
    /app\.(?:get|post|put|delete|patch|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const routeRegex2 =
    /router\.(?:get|post|put|delete|patch|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const routeRegex3 = /\.(get|post|put|delete|patch|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const exportRegex = /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g;

  // Track if we've already found Express components
  let hasExpressServer = false;
  let hasExpressRouter = false;

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');

      // Extract API endpoints using multiple regex patterns
      let match;

      // Match app.method() pattern
      const routeMatches = content.matchAll(routeRegex);
      for (match of routeMatches) {
        if (match[1]) {
          const method = match[0].split('.')[1].toUpperCase();
          const path = match[1];

          // Add to all endpoints for post-processing
          allEndpoints.push(`${path} [${method}]`);

          // Initialize set for this path if needed
          if (!endpointsMap.has(path)) {
            endpointsMap.set(path, new Set());
          }

          // Add method to this path's set
          endpointsMap.get(path)?.add(method);
        }
      }

      // Match router.method() pattern
      const routerMatches = content.matchAll(routeRegex2);
      for (match of routerMatches) {
        if (match[1]) {
          const method = match[0].split('.')[1].toUpperCase();
          const path = match[1];

          // Add to all endpoints for post-processing
          allEndpoints.push(`${path} [${method}]`);

          if (!endpointsMap.has(path)) {
            endpointsMap.set(path, new Set());
          }

          endpointsMap.get(path)?.add(method);
        }
      }

      // Match generic .method() pattern
      const genericMatches = content.matchAll(routeRegex3);
      for (match of genericMatches) {
        if (match[1] && match[2]) {
          const method = match[1].toUpperCase();
          const path = match[2];

          // Add to all endpoints for post-processing
          allEndpoints.push(`${path} [${method}]`);

          if (!endpointsMap.has(path)) {
            endpointsMap.set(path, new Set());
          }

          endpointsMap.get(path)?.add(method);
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

      // Check for common backend patterns - avoid duplicates
      if (content.includes('import express') && !hasExpressServer) {
        components.add('Express Server (Node.js)');
        hasExpressServer = true;
      }
      if (
        (content.includes('new Router()') || content.includes('express.Router()')) &&
        !hasExpressRouter
      ) {
        components.add('Express Router');
        hasExpressRouter = true;
      }
      if (content.includes('mongoose')) {
        components.add('Mongoose (MongoDB)');
      }
    } catch (error) {
      console.error(`Error reading file ${file}:`, error);
    }
  }

  // Post-process endpoints to deduplicate
  const cleanedEndpoints: string[] = [];
  const processedPaths = new Set<string>();

  // First pass: create simple endpoints from the endpointsMap
  endpointsMap.forEach((methods, path) => {
    // Skip if not an API path
    if (!path.startsWith('/') && !path.toLowerCase().includes('api')) {
      return;
    }

    // Filter out HTTP headers
    if (path.includes('-') && !path.startsWith('/') && path.split(' ')[0].includes('-')) {
      return;
    }

    // Mark this path as processed
    processedPaths.add(path);

    // Add each method for this path
    methods.forEach((method) => {
      cleanedEndpoints.push(`${path} [${method}]`);
    });
  });

  // Second pass: check for any complex endpoints that might have been missed
  // like those with patterns '/API/TOOLS' that could be different from '/api/tools'
  for (const endpoint of allEndpoints) {
    // Extract path from the endpoint
    const parts = endpoint.split(' [');
    if (parts.length < 2) continue;

    const path = parts[0];

    // Skip if already processed
    if (processedPaths.has(path)) {
      continue;
    }

    // Skip if not an API path
    if (!path.startsWith('/') && !path.toLowerCase().includes('api')) {
      continue;
    }

    // Skip HTTP headers
    if (path.includes('-') && !path.startsWith('/') && path.split(' ')[0].includes('-')) {
      continue;
    }

    // Mark as processed and add
    processedPaths.add(path);
    cleanedEndpoints.push(endpoint);
  }

  // Final pass: deduplicate by normalizing paths and removing ones with embedded paths in method
  const finalEndpoints: string[] = [];
  const normalizedPaths = new Map<string, string>();

  // First normalize paths (case insensitive comparison)
  for (const endpoint of cleanedEndpoints) {
    const parts = endpoint.split(' [');
    if (parts.length < 2) continue;

    const path = parts[0];
    // We don't need to use method here, just extract path

    // Normalize path (lowercase)
    const normalizedPath = path.toLowerCase();

    // Store original to normalized mapping
    if (!normalizedPaths.has(normalizedPath)) {
      normalizedPaths.set(normalizedPath, path);
    }
  }

  // Then add endpoints with clean methods
  for (const endpoint of cleanedEndpoints) {
    const parts = endpoint.split(' [');
    if (parts.length < 2) continue;

    const path = parts[0];
    const methodPart = parts[1];

    // Skip if method contains a path like GET('/API/TOOLS'
    if (methodPart.includes('/')) {
      continue;
    }

    // Use normalized path version
    const normalizedPath = path.toLowerCase();
    const canonicalPath = normalizedPaths.get(normalizedPath) || path;

    finalEndpoints.push(`${canonicalPath} [${methodPart}`);
  }

  // Prepare the final list of backend components
  const backendComponentsList = Array.from(components).sort();

  // Get unique backend components, ensuring we only have one Express Server entry
  const uniqueBackendComponents = ['Express Server (Node.js)'];

  // Add the rest of components, excluding any additional Express Server entries
  for (const component of backendComponentsList) {
    if (component !== 'Express Server' && component !== 'Express Server (Node.js)') {
      uniqueBackendComponents.push(component);
    }
  }

  return {
    backendComponents: uniqueBackendComponents,
    apiEndpoints: finalEndpoints.sort(),
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
  // Start with TB (top-bottom) layout for vertical orientation
  let diagram = `
  flowchart TB
    %% Use TB (top to bottom) layout for vertical orientation
    
    %% Define node styles to be more compact
    linkStyle default interpolate basis
    
    subgraph Frontend
      React[React App]
  `;

  // Parse the frontend components to extract directory structure
  const directories: Map<string, string[]> = new Map();

  frontendComponents.forEach((item) => {
    if (item.startsWith('React Application')) {
      // Skip the React Application header
      return;
    } else if (item.includes(':')) {
      // This is a component entry: directory:componentName
      const parts = item.split(':');
      const dirName = parts[0];
      const component = parts[1];

      // Initialize directory if it doesn't exist
      if (!directories.has(dirName)) {
        directories.set(dirName, []);
      }

      directories.get(dirName)?.push(component);
    }
  });

  // Create directory nodes
  let dirCount = 0;
  directories.forEach((components, dirName) => {
    const dirId = `Dir${dirCount}`;
    // Simplify directory names to avoid special characters
    const displayName = dirName === 'Root' ? 'RootDir' : dirName.replace(/[^\w]/g, '');
    diagram += `\n      ${dirId}[${displayName}]`;
    diagram += `\n      React --- ${dirId}`;

    // Add up to 5 components per directory for clarity
    const compsToShow = components.slice(0, 5);
    compsToShow.forEach((comp, idx) => {
      // Simplify component names to avoid special characters
      const compName = comp.split(' (')[0];
      const cleanedName = `Comp${dirCount}${idx}`;
      const displayName = compName.replace(/[^\w]/g, '');

      diagram += `\n      ${cleanedName}[${displayName}]`;
      diagram += `\n      ${dirId} --- ${cleanedName}`;
    });

    // Show count if there are more components
    if (components.length > compsToShow.length) {
      const moreCount = components.length - compsToShow.length;
      const moreId = `More${dirCount}`;
      diagram += `\n      ${moreId}[${moreCount} more]`;
      diagram += `\n      ${dirId} --- ${moreId}`;
    }

    dirCount++;
  });

  diagram += `\n    end\n`;

  // Add backend components below frontend
  diagram += `\n    subgraph Backend
      Server[Express Server]
  `;

  // Limit backend components and arrange them more compactly
  const backendCompsToShow = backendComponents
    .filter((c) => !c.includes('Express Server'))
    .slice(0, 12); // Limit to top 12 components

  // Create rows for backend components (similar to frontend)
  const ROW_SIZE = 4;
  for (let i = 0; i < backendCompsToShow.length; i++) {
    const component = backendCompsToShow[i];
    const cleanedName = `Backend${i}`;
    // Simplify component names to avoid special characters
    const displayName = component.split(' (')[0].replace(/[^\w]/g, '');

    // Add the component node
    diagram += `\n      ${cleanedName}[${displayName}]`;

    // Connect all to Server
    diagram += `\n      Server --- ${cleanedName}`;

    // Connect components in the same row horizontally
    if (i % ROW_SIZE !== 0 && i > 0) {
      const prevCompName = `Backend${i - 1}`;
      diagram += `\n      ${prevCompName} --- ${cleanedName}`;
    }
  }

  diagram += `\n    end\n`;

  // Add vertical flow between frontend and backend
  diagram += `\n    React --- Server\n`;

  // Add API endpoints subgraph below backend
  diagram += `\n    subgraph API`;

  // Show a simplified version of API endpoints
  // Limit number of endpoints to avoid diagram getting too large
  const endpointsToShow = apiEndpoints.slice(0, 8);

  // Add each endpoint as a simplified node
  for (let i = 0; i < endpointsToShow.length; i++) {
    const endpoint = apiEndpoints[i];
    const endpointId = `API${i}`;

    // Extract just the path part in a very simple way
    let displayText = `Endpoint${i}`;

    try {
      // First look for API path patterns like /api/something
      const pathMatch = endpoint.match(/\/[a-zA-Z0-9/_-]+/);
      if (pathMatch && pathMatch[0]) {
        // Found a path pattern, replace slashes with a dash
        const pathWithDashes = pathMatch[0].replace(/\//g, '∕');
        displayText = pathWithDashes;

        // Limit length
        if (displayText.length > 15) {
          displayText = displayText.substring(0, 12) + '...';
        }
      } else {
        // Fallback: just take alphanumeric with dashes for slashes
        const simplified = endpoint
          .replace(/\[.*?\]/g, '') // Remove anything in square brackets
          .trim();

        // Try to preserve some structure by replacing slashes
        const withDashes = simplified.replace(/\//g, '∕');

        // Remove any other special characters
        const cleaned = withDashes.replace(/[^a-zA-Z0-9∕-]/g, '');

        if (cleaned.length > 0) {
          displayText = cleaned.substring(0, 15); // Take only first 15 chars
        }
      }
    } catch {
      // Keep the default if there's any error
    }

    // Create endpoint label that's guaranteed to be Mermaid safe
    diagram += `\n      ${endpointId}[${displayText}]`;
    diagram += `\n      Server --- ${endpointId}`;
  }

  // Show count if there are more endpoints
  if (apiEndpoints.length > endpointsToShow.length) {
    const moreCount = apiEndpoints.length - endpointsToShow.length;
    diagram += `\n      MoreAPI[${moreCount} more]`;
    diagram += `\n      Server --- MoreAPI`;
  }

  diagram += `\n    end\n`;

  // External models at the bottom
  diagram += `
    ExternalSvcs[ExternalAIServices]
    Server --- ExternalSvcs
  `;

  // Add styling - more subtle colors for better readability
  diagram += `
    classDef frontend fill:#e6f7ff,stroke:#0099cc,stroke-width:1px
    classDef directory fill:#ccf2ff,stroke:#0099cc,stroke-width:1px
    classDef component fill:#e6f7ff,stroke:#0099cc,stroke-width:1px
    classDef backend fill:#fff5e6,stroke:#ff9933,stroke-width:1px
    classDef external fill:#f5e6ff,stroke:#9966cc,stroke-width:1px
    classDef api fill:#f0f9e8,stroke:#66cc33,stroke-width:1px
    classDef endpoint fill:#e6ffec,stroke:#33cc66,stroke-width:1px
    
    class React frontend
  `;

  // Add directory classes
  for (let i = 0; i < dirCount; i++) {
    diagram += `\n    class Dir${i} directory`;
  }

  // Add component styling for frontend components
  directories.forEach((comps, dir) => {
    const dirIndex = Array.from(directories.keys()).indexOf(dir);
    const compsToShow = comps.slice(0, 5);
    for (let i = 0; i < compsToShow.length; i++) {
      diagram += `\n    class Comp${dirIndex}${i} component`;
    }
  });

  diagram += `\n    class Server backend`;

  // Add backend component styling
  for (let i = 0; i < backendCompsToShow.length; i++) {
    diagram += `\n    class Backend${i} backend`;
  }

  // Add endpoint styling
  for (let i = 0; i < endpointsToShow.length; i++) {
    diagram += `\n    class API${i} endpoint`;
  }
  if (apiEndpoints.length > endpointsToShow.length) {
    diagram += `\n    class MoreAPI endpoint`;
  }

  diagram += `\n    class ExternalSvcs external`;

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
