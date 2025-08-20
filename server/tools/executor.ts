import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, normalize } from 'path';
import { executorSystemPrompt } from '../prompts';

const execAsync = promisify(exec);

type ExecutorParameters = {
  request: string;
  workingDirectory?: string;
  timeout?: number;
};

// Security: Allowed command prefixes for safety
const ALLOWED_COMMANDS = [
  'ls',
  'dir',
  'pwd',
  'echo',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'sort',
  'uniq',
  'date',
  'whoami',
  'which',
  'whereis',
  'type',
  'file',
  'stat',
  'du',
  'df',
  'free',
  'ps',
  'top',
  'history',
  'env',
  'printenv',
  'curl',
  'wget',
  'ping',
  'nslookup',
  'uname',
  'uptime',
  'hostname',
  'id',
  'groups',
  'w',
  'who',
  'last',
  'finger',
  'node',
  'npm',
  'yarn',
  'git',
  'docker',
  'python',
  'python3',
  'pip',
  'pip3',
  'java',
  'javac',
  'mvn',
  'gradle',
  'make',
  'gcc',
  'g++',
  'clang',
  'terraform',
  'kubectl',
  'helm',
  'aws',
  'gcloud',
  'azure',
];

// Security: Dangerous patterns to block
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /del\s+\/[sq]/i,
  /format\s+/i,
  /fdisk/i,
  /mkfs/i,
  /shutdown/i,
  /reboot/i,
  /halt/i,
  /poweroff/i,
  /passwd/i,
  /sudo\s+passwd/i,
  /usermod/i,
  /userdel/i,
  /chmod\s+777/i,
  /chown\s+root/i,
  />\s*\/dev\/null/i,
  />\s*\/dev\/zero/i,
  /\/etc\/passwd/i,
  /\/etc\/shadow/i,
  /\/etc\/sudoers/i,
  /curl.*\|\s*sh/i,
  /wget.*\|\s*sh/i,
  /bash.*<.*\(/i,
];

const validateCommand = (command: string): { isValid: boolean; reason?: string } => {
  const trimmedCommand = command.trim();

  if (!trimmedCommand) {
    return { isValid: false, reason: 'Empty command' };
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      return { isValid: false, reason: 'Command contains potentially dangerous operations' };
    }
  }

  // Split command on operators to handle chaining (&&, ||, ;, |)
  const commandParts = trimmedCommand
    .split(/[;&|]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  for (const part of commandParts) {
    // Skip empty parts or just whitespace
    if (!part || !part.trim()) continue;

    // Extract the base command (first word) from each part
    const baseCommand = part.split(/\s+/)[0].toLowerCase();

    // Check if the base command is in the allowed list
    const isAllowed = ALLOWED_COMMANDS.some(
      (allowed) =>
        baseCommand === allowed ||
        baseCommand.endsWith(`/${allowed}`) ||
        baseCommand.endsWith(`\\${allowed}`),
    );

    if (!isAllowed) {
      return {
        isValid: false,
        reason: `Command '${baseCommand}' is not in the allowed commands list`,
      };
    }
  }

  return { isValid: true };
};

const logExecution = (command: string, success: boolean, output: string, error?: string) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    command: command.substring(0, 200), // Truncate long commands
    success,
    outputLength: output.length,
    error: error?.substring(0, 500), // Truncate long errors
  };
  console.log('[Executor Tool]', JSON.stringify(logEntry));
};

const executor = {
  id: 'executor',
  name: 'Executor',
  description:
    'Execute safe system commands based on requests. Only allows whitelisted commands for security.',
  inputSchema: z.object({
    request: z.string().describe('The request to create a safe system command for'),
    workingDirectory: z
      .string()
      .optional()
      .describe('Working directory for command execution (optional)'),
    timeout: z
      .number()
      .optional()
      .describe('Timeout in milliseconds (default: 30000, max: 120000)'),
  }),
  execute: async ({ request, workingDirectory, timeout = 30000 }: ExecutorParameters) => {
    try {
      // Validate timeout
      const maxTimeout = 120000; // 2 minutes
      const safeTimeout = Math.min(Math.max(timeout, 1000), maxTimeout);

      // Generate the command using AI
      const { text: generatedCommand } = await generateText({
        model: openai('gpt-4o-mini'),
        messages: [
          {
            role: 'system',
            content: executorSystemPrompt,
          },
          {
            role: 'user',
            content: request,
          },
        ],
      });

      const command = generatedCommand.trim();

      // Validate the generated command
      const validation = validateCommand(command);
      if (!validation.isValid) {
        const errorMsg = `Command validation failed: ${validation.reason}\nGenerated command: ${command}`;
        logExecution(command, false, '', errorMsg);
        return `❌ Security Error: ${validation.reason}`;
      }

      // Prepare execution options
      const execOptions = {
        timeout: safeTimeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
        encoding: 'utf8' as const,
        cwd: undefined as string | undefined,
      };

      // Set working directory if provided
      if (workingDirectory) {
        try {
          const normalizedPath = normalize(resolve(workingDirectory));
          execOptions.cwd = normalizedPath;
        } catch {
          const errorMsg = `Invalid working directory: ${workingDirectory}`;
          logExecution(command, false, '', errorMsg);
          return `❌ Path Error: ${errorMsg}`;
        }
      }

      // Execute the command
      const startTime = Date.now();
      const result = await execAsync(command, execOptions);
      const executionTime = Date.now() - startTime;

      // Prepare output
      const stdout = result.stdout || '';
      const stderr = result.stderr || '';

      let output = '';
      if (stdout) output += `📤 Output:\n${stdout}`;
      if (stderr) output += `⚠️ Warnings:\n${stderr}`;
      if (!stdout && !stderr) output = '✅ Command executed successfully (no output)';

      output += `\n⏱️ Execution time: ${executionTime}ms`;

      logExecution(command, true, (stdout || '') + (stderr || ''));
      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      let userFriendlyError = '';

      if (errorMessage.includes('ENOENT')) {
        userFriendlyError = 'Command not found or invalid path';
      } else if (errorMessage.includes('EACCES')) {
        userFriendlyError = 'Permission denied';
      } else if (errorMessage.includes('timeout')) {
        userFriendlyError = 'Command timed out';
      } else if (errorMessage.includes('maxBuffer')) {
        userFriendlyError = 'Output too large';
      } else {
        userFriendlyError = errorMessage;
      }

      logExecution('unknown', false, '', errorMessage);
      console.error('[Executor Tool] Execution Error:', error);
      return `❌ Execution Error: ${userFriendlyError}`;
    }
  },
};

export { executor };
