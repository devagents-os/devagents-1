export interface ComputerState {
  activeApp: 'terminal' | 'browser' | 'editor' | 'files' | 'todo' | 'chat' | 'process' | 'persona' | null;
  browserUrl: string;
  browserTitle: string;
  terminalCwd: string;
  terminalLastOutput: string;
  terminalLastCommand: string;
  editorActiveFile: string | null;
  editorContent: string;
  filesCurrentDir: string;
  visibleElements: string[];
}

export interface TaskContext {
  task: string;
  subtasks: string[];
  currentSubtaskIndex: number;
  attempts: number;
  maxAttempts: number;
  startTime: number;
  lastActionTime: number;
  actionHistory: ActionHistoryItem[];
  computerState: ComputerState;
  errors: string[];
  learnings: string[];
  /** Debug session ID if debugging is active */
  debugSessionId?: string;
  /** Whether debug mode is enabled */
  debugMode?: boolean;
  /** Parsed errors with detailed categorization */
  parsedErrors?: ParsedError[];
  /** Current fix hypotheses being tested */
  activeHypotheses?: FixHypothesis[];
  /** Retry strategy state */
  retryStrategy?: RetryStrategy;
}

/** Parsed error with detailed categorization */
export interface ParsedError {
  raw: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  summary: string;
  file?: string;
  line?: number;
  column?: number;
  errorCode?: string;
  involvedIdentifiers?: string[];
  timestamp: number;
}

export type ErrorCategory = 
  | 'syntax'
  | 'type'
  | 'runtime'
  | 'import'
  | 'dependency'
  | 'permission'
  | 'network'
  | 'resource'
  | 'logic'
  | 'configuration'
  | 'test_failure'
  | 'build_failure'
  | 'unknown';

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Fix hypothesis for debugging */
export interface FixHypothesis {
  id: string;
  description: string;
  confidence: number;
  rationale: string;
  verificationSteps: string[];
  priority: number;
  attempted?: boolean;
  outcome?: 'success' | 'failure' | 'partial';
}

/** Intelligent retry strategy */
export interface RetryStrategy {
  type: 'exponential_backoff' | 'hypothesis_driven' | 'fallback_chain' | 'adaptive';
  currentPhase: number;
  maxPhases: number;
  consecutiveFailures: number;
  lastSuccessfulAction?: string;
  backoffMs: number;
  hypothesisQueue: string[];
  fallbackActions: string[];
}

export interface ActionHistoryItem {
  action: string;
  target?: string;
  result: 'success' | 'failure' | 'partial';
  output?: string;
  timestamp: number;
  duration: number;
}

export interface ThinkingResult {
  phase: 'observe' | 'reflect' | 'plan' | 'act' | 'verify';
  thought: string;
  confidence: number;
  action?: ComputerAction;
  plan?: string[];
  shouldRetry?: boolean;
  isComplete?: boolean;
}

export interface ComputerAction {
  type: 'TERMINAL' | 'BROWSER' | 'EDITOR' | 'FILES' | 'SWITCH_APP' | 'WAIT' | 'DONE';
  subAction: string;
  target?: string;
  content?: string;
  waitMs?: number;
}

export const COMPUTER_SKILLS = {
  terminal: {
    name: 'Terminal Operations',
    actions: {
      RUN_COMMAND: {
        description: 'Execute a shell command',
        format: 'TERMINAL:RUN_COMMAND:<command>',
        examples: ['ls -la', 'npm install', 'git status', 'cat package.json'],
      },
      CHANGE_DIR: {
        description: 'Change current directory',
        format: 'TERMINAL:CHANGE_DIR:<path>',
        examples: ['cd src', 'cd ..', 'cd /home/user/project'],
      },
      CREATE_FILE: {
        description: 'Create a new file with content',
        format: 'TERMINAL:CREATE_FILE:<filename>:<content>',
        examples: ['echo "content" > file.txt', 'touch newfile.js'],
      },
      READ_FILE: {
        description: 'Read file contents',
        format: 'TERMINAL:READ_FILE:<filename>',
        examples: ['cat file.txt', 'head -20 large.log'],
      },
      SEARCH: {
        description: 'Search for text in files',
        format: 'TERMINAL:SEARCH:<pattern>',
        examples: ['grep -r "pattern" .', 'find . -name "*.js"'],
      },
    },
  },
  browser: {
    name: 'Browser Operations',
    actions: {
      NAVIGATE: {
        description: 'Navigate to a URL',
        format: 'BROWSER:NAVIGATE:<url>',
        examples: ['https://google.com', 'https://github.com'],
      },
      SEARCH: {
        description: 'Search on Google',
        format: 'BROWSER:SEARCH:<query>',
        examples: ['React tutorials', 'Node.js documentation'],
      },
      SCROLL: {
        description: 'Scroll the page',
        format: 'BROWSER:SCROLL:<direction>',
        examples: ['down', 'up'],
      },
      BACK: {
        description: 'Go back in browser history',
        format: 'BROWSER:BACK',
        examples: [],
      },
      REFRESH: {
        description: 'Refresh the current page',
        format: 'BROWSER:REFRESH',
        examples: [],
      },
    },
  },
  editor: {
    name: 'Editor Operations',
    actions: {
      OPEN_FILE: {
        description: 'Open a file in editor',
        format: 'EDITOR:OPEN_FILE:<filepath>',
        examples: ['src/app.js', 'package.json'],
      },
      WRITE: {
        description: 'Write content at cursor',
        format: 'EDITOR:WRITE:<content>',
        examples: ['function hello() {}', 'const x = 5;'],
      },
      SAVE: {
        description: 'Save the current file',
        format: 'EDITOR:SAVE',
        examples: [],
      },
      FIND: {
        description: 'Find text in file',
        format: 'EDITOR:FIND:<text>',
        examples: ['TODO', 'function'],
      },
      REPLACE: {
        description: 'Find and replace text',
        format: 'EDITOR:REPLACE:<find>:<replace>',
        examples: ['oldName:newName'],
      },
      // Diff-based editing operations (surgical edits)
      REPLACE_LINES: {
        description: 'Replace specific lines (surgical edit)',
        format: 'EDITOR:REPLACE_LINES:<startLine>:<endLine>:<newContent>',
        examples: ['10:15:function newCode() { return true; }'],
      },
      INSERT_AFTER: {
        description: 'Insert content after a specific line',
        format: 'EDITOR:INSERT_AFTER:<line>:<content>',
        examples: ['5:// New comment added here'],
      },
      INSERT_BEFORE: {
        description: 'Insert content before a specific line',
        format: 'EDITOR:INSERT_BEFORE:<line>:<content>',
        examples: ['1:import { useState } from "react";'],
      },
      DELETE_LINES: {
        description: 'Delete lines in a range',
        format: 'EDITOR:DELETE_LINES:<startLine>:<endLine>',
        examples: ['10:15'],
      },
      APPLY_DIFF: {
        description: 'Apply a unified diff to the current file',
        format: 'EDITOR:APPLY_DIFF:<diffString>',
        examples: ['--- a/file.ts\\n+++ b/file.ts\\n@@ -1,3 +1,4 @@\\n import x;\\n+import y;'],
      },
      ADD_IMPORT: {
        description: 'Add an import statement at the top of the file',
        format: 'EDITOR:ADD_IMPORT:<importStatement>',
        examples: ['import { useState } from "react";'],
      },
      ADD_FUNCTION: {
        description: 'Add a new function to the file',
        format: 'EDITOR:ADD_FUNCTION:<functionCode>',
        examples: ['export function myFunc() { return 42; }'],
      },
      EDIT_FUNCTION: {
        description: 'Edit an existing function body',
        format: 'EDITOR:EDIT_FUNCTION:<functionName>:<newBody>',
        examples: ['handleClick:console.log("clicked"); return true;'],
      },
      DELETE_ENTITY: {
        description: 'Delete a function, class, or variable by name',
        format: 'EDITOR:DELETE_ENTITY:<entityName>',
        examples: ['oldFunction', 'deprecatedClass'],
      },
      RENAME_ENTITY: {
        description: 'Rename a function, class, or variable',
        format: 'EDITOR:RENAME_ENTITY:<oldName>:<newName>',
        examples: ['oldName:newName'],
      },
      GO_TO_LINE: {
        description: 'Go to a specific line number',
        format: 'EDITOR:GO_TO_LINE:<lineNumber>',
        examples: ['42', '100'],
      },
    },
  },
  system: {
    name: 'System Operations',
    actions: {
      SWITCH_APP: {
        description: 'Switch to different application',
        format: 'SWITCH_APP:<app>',
        examples: ['terminal', 'browser', 'editor', 'files'],
      },
      WAIT: {
        description: 'Wait for operation to complete',
        format: 'WAIT:<milliseconds>',
        examples: ['1000', '2000'],
      },
      DONE: {
        description: 'Mark task as complete',
        format: 'DONE',
        examples: [],
      },
    },
  },
};

export function parseAction(actionString: string): ComputerAction {
  const parts = actionString.split(':');
  const type = parts[0].toUpperCase();
  
  switch (type) {
    case 'TERMINAL':
      return {
        type: 'TERMINAL',
        subAction: parts[1] || 'RUN_COMMAND',
        content: parts.slice(2).join(':'),
      };
    case 'BROWSER':
      return {
        type: 'BROWSER',
        subAction: parts[1] || 'NAVIGATE',
        target: parts[2],
        content: parts.slice(2).join(':'),
      };
    case 'EDITOR':
      return {
        type: 'EDITOR',
        subAction: parts[1] || 'OPEN_FILE',
        target: parts[2],
        content: parts.slice(3).join(':'),
      };
    case 'FILES':
      return {
        type: 'FILES',
        subAction: parts[1] || 'LIST',
        target: parts[2],
      };
    case 'SWITCH_APP':
      return {
        type: 'SWITCH_APP',
        subAction: 'SWITCH',
        target: parts[1],
      };
    case 'WAIT':
      return {
        type: 'WAIT',
        subAction: 'WAIT',
        waitMs: parseInt(parts[1]) || 1000,
      };
    case 'DONE':
      return {
        type: 'DONE',
        subAction: 'COMPLETE',
      };
    default:
      return {
        type: 'TERMINAL',
        subAction: 'RUN_COMMAND',
        content: actionString,
      };
  }
}

export function formatAction(action: ComputerAction): string {
  switch (action.type) {
    case 'TERMINAL':
      return `TERMINAL:${action.subAction}:${action.content || ''}`;
    case 'BROWSER':
      return `BROWSER:${action.subAction}:${action.target || action.content || ''}`;
    case 'EDITOR':
      return `EDITOR:${action.subAction}:${action.target || ''}${action.content ? ':' + action.content : ''}`;
    case 'FILES':
      return `FILES:${action.subAction}:${action.target || ''}`;
    case 'SWITCH_APP':
      return `SWITCH_APP:${action.target}`;
    case 'WAIT':
      return `WAIT:${action.waitMs}`;
    case 'DONE':
      return 'DONE';
    default:
      return 'DONE';
  }
}

export function createInitialContext(task: string, enableDebugMode: boolean = false): TaskContext {
  return {
    task,
    subtasks: [],
    currentSubtaskIndex: 0,
    attempts: 0,
    maxAttempts: 20,
    startTime: Date.now(),
    lastActionTime: Date.now(),
    actionHistory: [],
    computerState: {
      activeApp: null,
      browserUrl: '',
      browserTitle: '',
      terminalCwd: '~',
      terminalLastOutput: '',
      terminalLastCommand: '',
      editorActiveFile: null,
      editorContent: '',
      filesCurrentDir: '~',
      visibleElements: [],
    },
    errors: [],
    learnings: [],
    debugMode: enableDebugMode,
    parsedErrors: [],
    activeHypotheses: [],
    retryStrategy: createDefaultRetryStrategy(),
  };
}

/** Create default intelligent retry strategy */
export function createDefaultRetryStrategy(): RetryStrategy {
  return {
    type: 'adaptive',
    currentPhase: 0,
    maxPhases: 5,
    consecutiveFailures: 0,
    backoffMs: 1000,
    hypothesisQueue: [],
    fallbackActions: [],
  };
}

/**
 * Enhanced shouldContinue with intelligent retry logic
 * Returns true if task should continue, false if it should stop
 */
export function shouldContinue(context: TaskContext): boolean {
  const strategy = context.retryStrategy || createDefaultRetryStrategy();
  
  // Check if we've exceeded max phases (smarter than just attempts)
  if (strategy.currentPhase >= strategy.maxPhases) {
    return false;
  }
  
  // Check total time elapsed (10 minutes with debug mode, 5 without)
  const maxTime = context.debugMode ? 10 * 60 * 1000 : 5 * 60 * 1000;
  const elapsed = Date.now() - context.startTime;
  if (elapsed > maxTime) {
    return false;
  }
  
  // Detect repetitive failure loops (same action failing 3+ times)
  const recentActions = context.actionHistory.slice(-5);
  const repeatCount = recentActions.filter(a => 
    a.action === recentActions[0]?.action && a.result === 'failure'
  ).length;
  if (repeatCount >= 3) {
    // But if we have hypotheses to try, continue
    if (context.activeHypotheses && context.activeHypotheses.some(h => !h.attempted)) {
      return true;
    }
    return false;
  }
  
  // If we have critical errors without hypotheses, consider stopping
  const criticalErrors = context.parsedErrors?.filter(e => e.severity === 'critical') || [];
  if (criticalErrors.length > 2 && (!context.activeHypotheses || context.activeHypotheses.length === 0)) {
    return false;
  }
  
  return true;
}

/**
 * Enhanced failure analysis with root cause detection and hypothesis generation
 */
export function analyzeFailure(context: TaskContext): EnhancedFailureAnalysis {
  const analysis: EnhancedFailureAnalysis = {
    reason: 'Unknown failure',
    suggestion: 'Review the task and try breaking it into smaller steps',
    category: 'unknown',
    severity: 'medium',
    rootCause: null,
    hypotheses: [],
    suggestedActions: [],
    debugInfo: {
      errorCount: context.errors.length,
      failedAttempts: context.actionHistory.filter(a => a.result === 'failure').length,
      lastSuccessfulAction: context.actionHistory.filter(a => a.result === 'success').pop()?.action,
    },
  };

  // Parse all errors for categorization
  const parsedErrors = context.errors.map(e => parseError(e));
  context.parsedErrors = parsedErrors;

  // Find the primary error (most severe or most recent)
  const primaryError = parsedErrors.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  })[0];

  if (primaryError) {
    analysis.category = primaryError.category;
    analysis.severity = primaryError.severity;
    analysis.reason = primaryError.summary;
    
    // Root cause analysis based on error category
    const rootCauseResult = analyzeRootCause(primaryError, context);
    analysis.rootCause = rootCauseResult.rootCause;
    analysis.suggestion = rootCauseResult.suggestion;
    
    // Generate fix hypotheses
    analysis.hypotheses = generateFixHypotheses(primaryError, context);
    analysis.suggestedActions = generateSuggestedActions(primaryError, context);
  } else {
    // Analyze action history for patterns
    const lastActions = context.actionHistory.slice(-5);
    const failurePattern = detectFailurePattern(lastActions);
    
    if (failurePattern) {
      analysis.reason = failurePattern.reason;
      analysis.suggestion = failurePattern.suggestion;
      analysis.hypotheses = failurePattern.hypotheses;
    }
  }

  // Update retry strategy based on analysis
  if (context.retryStrategy) {
    updateRetryStrategy(context, analysis);
  }

  return analysis;
}

export interface EnhancedFailureAnalysis {
  reason: string;
  suggestion: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  rootCause: string | null;
  hypotheses: FixHypothesis[];
  suggestedActions: string[];
  debugInfo: {
    errorCount: number;
    failedAttempts: number;
    lastSuccessfulAction?: string;
  };
}

/**
 * Parse an error string into structured format
 */
export function parseError(errorString: string): ParsedError {
  const patterns: Array<{ category: ErrorCategory; patterns: RegExp[] }> = [
    {
      category: 'syntax',
      patterns: [
        /SyntaxError:\s*(.+)/i,
        /Unexpected token/i,
        /Missing .+ before/i,
        /Unterminated string/i,
        /Expression expected/i,
        /'}' expected/i,
        /';' expected/i,
      ],
    },
    {
      category: 'type',
      patterns: [
        /TypeError:\s*(.+)/i,
        /TS\d{4}:/,
        /Type '.*' is not assignable/i,
        /Property '.*' does not exist on type/i,
        /Cannot find name '.*'/i,
        /Object is possibly 'undefined'/i,
      ],
    },
    {
      category: 'runtime',
      patterns: [
        /ReferenceError:\s*(.+)/i,
        /RangeError:\s*(.+)/i,
        /Cannot read propert(y|ies) of (undefined|null)/i,
        /is not defined/i,
        /is not a function/i,
        /Maximum call stack/i,
      ],
    },
    {
      category: 'import',
      patterns: [
        /Cannot find module/i,
        /Module not found/i,
        /Unable to resolve/i,
        /Could not resolve/i,
        /Failed to resolve import/i,
      ],
    },
    {
      category: 'dependency',
      patterns: [
        /ERESOLVE/i,
        /peer dep/i,
        /npm ERR!/i,
        /Package .* not found/i,
        /version conflict/i,
      ],
    },
    {
      category: 'permission',
      patterns: [
        /EACCES/i,
        /Permission denied/i,
        /EPERM/i,
        /access denied/i,
      ],
    },
    {
      category: 'network',
      patterns: [
        /ENOTFOUND/i,
        /ECONNREFUSED/i,
        /ETIMEDOUT/i,
        /Network error/i,
        /fetch failed/i,
      ],
    },
    {
      category: 'resource',
      patterns: [
        /ENOENT/i,
        /No such file/i,
        /File not found/i,
        /Directory not found/i,
      ],
    },
    {
      category: 'test_failure',
      patterns: [
        /Test failed/i,
        /FAIL\s/,
        /AssertionError/i,
        /Expected .* to/i,
      ],
    },
    {
      category: 'build_failure',
      patterns: [
        /Build failed/i,
        /Compilation failed/i,
        /ERROR in/i,
        /Failed to compile/i,
      ],
    },
  ];

  let category: ErrorCategory = 'unknown';
  let severity: ErrorSeverity = 'medium';

  // Categorize the error
  for (const { category: cat, patterns: pats } of patterns) {
    for (const pattern of pats) {
      if (pattern.test(errorString)) {
        category = cat;
        break;
      }
    }
    if (category !== 'unknown') break;
  }

  // Determine severity
  if (category === 'syntax' || category === 'build_failure') {
    severity = 'critical';
  } else if (category === 'type' || category === 'runtime' || category === 'import') {
    severity = 'high';
  } else if (category === 'dependency' || category === 'test_failure') {
    severity = 'medium';
  } else if (errorString.toLowerCase().includes('warning')) {
    severity = 'low';
  }

  // Extract file location
  const locationMatch = errorString.match(/([^\s:()]+\.[jt]sx?):(\d+):?(\d+)?/);
  
  // Extract error code
  const errorCodeMatch = errorString.match(/TS(\d{4})|E([A-Z]{2,})/);
  
  // Extract identifiers
  const identifiers: string[] = [];
  const quotedMatches = errorString.match(/'([^']+)'/g);
  if (quotedMatches) {
    quotedMatches.forEach(q => identifiers.push(q.replace(/'/g, '')));
  }

  // Generate summary
  const firstLine = errorString.split('\n')[0];
  const summary = firstLine
    .replace(/^(Error|TypeError|SyntaxError|ReferenceError):\s*/i, '')
    .substring(0, 150);

  return {
    raw: errorString,
    category,
    severity,
    summary: summary || `${category} error`,
    file: locationMatch?.[1],
    line: locationMatch?.[2] ? parseInt(locationMatch[2]) : undefined,
    column: locationMatch?.[3] ? parseInt(locationMatch[3]) : undefined,
    errorCode: errorCodeMatch?.[0],
    involvedIdentifiers: identifiers,
    timestamp: Date.now(),
  };
}

/**
 * Analyze root cause of an error
 */
function analyzeRootCause(error: ParsedError, context: TaskContext): { rootCause: string | null; suggestion: string } {
  switch (error.category) {
    case 'syntax':
      return {
        rootCause: `Syntax error in ${error.file || 'unknown file'}${error.line ? ` at line ${error.line}` : ''}`,
        suggestion: `Check for missing brackets, semicolons, or typos near ${error.line ? `line ${error.line}` : 'the error location'}. Common causes: unclosed strings, missing commas in objects/arrays, or incorrect JSX syntax.`,
      };
      
    case 'type':
      return {
        rootCause: `Type mismatch${error.involvedIdentifiers?.length ? ` involving: ${error.involvedIdentifiers.join(', ')}` : ''}`,
        suggestion: `Verify the expected types match the actual values. Consider using type assertions, optional chaining (?.), or null checks.`,
      };
      
    case 'runtime':
      return {
        rootCause: `Runtime error - accessing undefined/null value${error.involvedIdentifiers?.length ? ` in: ${error.involvedIdentifiers.join(', ')}` : ''}`,
        suggestion: `Add null/undefined checks before accessing properties. Use optional chaining (?.) or ensure the variable is initialized.`,
      };
      
    case 'import':
      const lastCommand = context.computerState.terminalLastCommand;
      const possibleModule = error.involvedIdentifiers?.[0];
      return {
        rootCause: `Cannot resolve module: ${possibleModule || 'unknown'}`,
        suggestion: possibleModule?.startsWith('.') 
          ? `Check if the file exists at the specified path. Verify the relative path is correct from the importing file.`
          : `Run 'npm install ${possibleModule}' or check if the package name is spelled correctly.`,
      };
      
    case 'dependency':
      return {
        rootCause: 'Dependency resolution conflict or missing package',
        suggestion: `Try 'rm -rf node_modules && npm install'. If peer dependency conflicts, try 'npm install --legacy-peer-deps'.`,
      };
      
    case 'permission':
      return {
        rootCause: `Permission denied for file/directory operation`,
        suggestion: `Check file permissions with 'ls -la'. Try running with appropriate permissions or choose a different location.`,
      };
      
    case 'network':
      return {
        rootCause: 'Network connectivity issue or service unavailable',
        suggestion: `Verify network connection. Check if the target service is running. Try again with increased timeout.`,
      };
      
    case 'resource':
      return {
        rootCause: `Resource not found: ${error.involvedIdentifiers?.[0] || 'unknown'}`,
        suggestion: `Verify the file/directory exists. Check for typos in the path. Use 'ls' or 'find' to locate the resource.`,
      };
      
    case 'test_failure':
      return {
        rootCause: 'Test assertion failed - expected vs actual mismatch',
        suggestion: `Review the test expectations. Check if the code behavior changed intentionally. Update test or fix the code.`,
      };
      
    case 'build_failure':
      return {
        rootCause: 'Build process failed due to code errors',
        suggestion: `Fix all compilation errors first. Run 'npm run build' to see all errors. Address them from top to bottom.`,
      };
      
    default:
      return {
        rootCause: null,
        suggestion: 'Review the error message and check related code sections.',
      };
  }
}

/**
 * Generate fix hypotheses for an error
 */
function generateFixHypotheses(error: ParsedError, context: TaskContext): FixHypothesis[] {
  const hypotheses: FixHypothesis[] = [];
  const timestamp = Date.now();

  switch (error.category) {
    case 'syntax':
      if (error.raw.includes("'}' expected") || error.raw.includes('Unexpected end')) {
        hypotheses.push({
          id: `syntax-brace-${timestamp}`,
          description: 'Add missing closing brace',
          confidence: 0.7,
          rationale: 'Error indicates unclosed block',
          verificationSteps: ['Run build/typecheck', 'Verify file syntax'],
          priority: 8,
        });
      }
      if (error.raw.includes("';' expected")) {
        hypotheses.push({
          id: `syntax-semicolon-${timestamp}`,
          description: 'Add missing semicolon',
          confidence: 0.8,
          rationale: 'Parser expecting semicolon',
          verificationSteps: ['Run build/typecheck'],
          priority: 9,
        });
      }
      break;

    case 'type':
      if (error.raw.includes('possibly \'undefined\'') || error.raw.includes('possibly \'null\'')) {
        hypotheses.push({
          id: `type-nullcheck-${timestamp}`,
          description: 'Add null/undefined check or optional chaining',
          confidence: 0.75,
          rationale: 'Object may be null/undefined at runtime',
          verificationSteps: ['Run typecheck', 'Run tests'],
          priority: 7,
        });
      }
      if (error.raw.includes('is not assignable')) {
        hypotheses.push({
          id: `type-conversion-${timestamp}`,
          description: 'Fix type mismatch with conversion or assertion',
          confidence: 0.6,
          rationale: 'Types are incompatible',
          verificationSteps: ['Run typecheck', 'Verify runtime behavior'],
          priority: 6,
        });
      }
      break;

    case 'import':
      const moduleName = error.involvedIdentifiers?.[0];
      if (moduleName && !moduleName.startsWith('.')) {
        hypotheses.push({
          id: `import-install-${timestamp}`,
          description: `Install missing package: npm install ${moduleName}`,
          confidence: 0.8,
          rationale: 'Module not found in node_modules',
          verificationSteps: [`npm install ${moduleName}`, 'Run build'],
          priority: 9,
        });
      } else {
        hypotheses.push({
          id: `import-path-${timestamp}`,
          description: 'Fix import path or create missing file',
          confidence: 0.6,
          rationale: 'Relative import path incorrect or file missing',
          verificationSteps: ['Verify file exists', 'Fix import path', 'Run build'],
          priority: 7,
        });
      }
      break;

    case 'runtime':
      hypotheses.push({
        id: `runtime-guard-${timestamp}`,
        description: 'Add defensive null/undefined guard',
        confidence: 0.7,
        rationale: 'Accessing property on null/undefined',
        verificationSteps: ['Add optional chaining', 'Run tests'],
        priority: 8,
      });
      break;

    case 'dependency':
      hypotheses.push({
        id: `dep-clean-${timestamp}`,
        description: 'Clean install: rm -rf node_modules && npm install',
        confidence: 0.7,
        rationale: 'Dependency cache may be corrupted',
        verificationSteps: ['rm -rf node_modules', 'rm package-lock.json', 'npm install'],
        priority: 8,
      });
      hypotheses.push({
        id: `dep-legacy-${timestamp}`,
        description: 'Try npm install --legacy-peer-deps',
        confidence: 0.5,
        rationale: 'Peer dependency conflict',
        verificationSteps: ['npm install --legacy-peer-deps'],
        priority: 5,
      });
      break;

    case 'test_failure':
      hypotheses.push({
        id: `test-fix-${timestamp}`,
        description: 'Update test expectation or fix implementation',
        confidence: 0.6,
        rationale: 'Expected vs actual mismatch',
        verificationSteps: ['Review test', 'Run test again'],
        priority: 7,
      });
      break;

    case 'build_failure':
      hypotheses.push({
        id: `build-clean-${timestamp}`,
        description: 'Clean build: rm -rf .next dist && npm run build',
        confidence: 0.5,
        rationale: 'Build cache may be stale',
        verificationSteps: ['rm -rf .next', 'npm run build'],
        priority: 6,
      });
      break;
  }

  // Sort by priority and confidence
  hypotheses.sort((a, b) => {
    const priorityDiff = b.priority - a.priority;
    return priorityDiff !== 0 ? priorityDiff : b.confidence - a.confidence;
  });

  return hypotheses;
}

/**
 * Generate suggested actions based on error analysis
 */
function generateSuggestedActions(error: ParsedError, context: TaskContext): string[] {
  const actions: string[] = [];

  // Always start with understanding the error
  actions.push(`Read error location: ${error.file || 'Check terminal output for file'}${error.line ? `:${error.line}` : ''}`);

  switch (error.category) {
    case 'syntax':
    case 'type':
      actions.push('EDITOR:OPEN_FILE:' + (error.file || context.computerState.editorActiveFile || ''));
      if (error.line) {
        actions.push(`EDITOR:GO_TO_LINE:${error.line}`);
      }
      break;

    case 'import':
      if (error.involvedIdentifiers?.[0] && !error.involvedIdentifiers[0].startsWith('.')) {
        actions.push(`TERMINAL:RUN_COMMAND:npm install ${error.involvedIdentifiers[0]}`);
      } else {
        actions.push('TERMINAL:RUN_COMMAND:ls -la ' + (error.file?.split('/').slice(0, -1).join('/') || '.'));
      }
      break;

    case 'dependency':
      actions.push('TERMINAL:RUN_COMMAND:rm -rf node_modules');
      actions.push('TERMINAL:RUN_COMMAND:npm install');
      break;

    case 'permission':
      actions.push('TERMINAL:RUN_COMMAND:ls -la ' + (error.file || '.'));
      break;

    case 'resource':
      actions.push('TERMINAL:RUN_COMMAND:find . -name "' + (error.involvedIdentifiers?.[0] || '*') + '"');
      break;

    case 'test_failure':
      actions.push('TERMINAL:RUN_COMMAND:npm test -- --verbose');
      break;

    case 'build_failure':
      actions.push('TERMINAL:RUN_COMMAND:npm run build 2>&1 | head -50');
      break;
  }

  return actions;
}

/**
 * Detect failure patterns in action history
 */
function detectFailurePattern(actions: ActionHistoryItem[]): { reason: string; suggestion: string; hypotheses: FixHypothesis[] } | null {
  if (actions.length === 0) return null;

  const failures = actions.filter(a => a.result === 'failure');
  const successes = actions.filter(a => a.result === 'success');

  // All recent actions failed
  if (failures.length === actions.length) {
    return {
      reason: 'Multiple consecutive failures detected',
      suggestion: 'Consider a different approach. The current strategy is not working.',
      hypotheses: [{
        id: `pattern-alt-approach-${Date.now()}`,
        description: 'Try alternative approach',
        confidence: 0.5,
        rationale: 'Current approach has consistently failed',
        verificationSteps: ['Analyze task requirements', 'Try different strategy'],
        priority: 7,
      }],
    };
  }

  // Same action repeated and failing
  const actionCounts = new Map<string, number>();
  for (const action of failures) {
    const count = (actionCounts.get(action.action) || 0) + 1;
    actionCounts.set(action.action, count);
  }
  
  for (const [action, count] of actionCounts) {
    if (count >= 2) {
      return {
        reason: `Action "${action}" has failed ${count} times`,
        suggestion: `Stop repeating this action. Analyze why it fails and try an alternative.`,
        hypotheses: [{
          id: `pattern-stop-repeat-${Date.now()}`,
          description: `Stop repeating: ${action}`,
          confidence: 0.8,
          rationale: 'Repeated failures indicate fundamental issue',
          verificationSteps: ['Analyze error output', 'Try alternative action'],
          priority: 9,
        }],
      };
    }
  }

  // Had success then failure - regression
  if (successes.length > 0 && failures.length > 0) {
    const lastSuccess = actions.filter(a => a.result === 'success').pop();
    return {
      reason: 'Regression detected - had success then failures',
      suggestion: `Last successful action was: ${lastSuccess?.action}. Review what changed since then.`,
      hypotheses: [{
        id: `pattern-regression-${Date.now()}`,
        description: 'Revert to last known good state',
        confidence: 0.6,
        rationale: 'Something broke after last success',
        verificationSteps: ['Review changes since last success', 'Consider reverting'],
        priority: 7,
      }],
    };
  }

  return null;
}

/**
 * Update retry strategy based on failure analysis
 */
function updateRetryStrategy(context: TaskContext, analysis: EnhancedFailureAnalysis): void {
  const strategy = context.retryStrategy!;
  
  // Increment consecutive failures
  strategy.consecutiveFailures++;
  
  // Update last successful action if we have one
  const lastSuccess = context.actionHistory.filter(a => a.result === 'success').pop();
  if (lastSuccess) {
    strategy.lastSuccessfulAction = lastSuccess.action;
  }
  
  // Adjust strategy type based on severity
  if (analysis.severity === 'critical') {
    // For critical errors, switch to hypothesis-driven approach
    strategy.type = 'hypothesis_driven';
    strategy.hypothesisQueue = analysis.hypotheses.map(h => h.id);
  } else if (strategy.consecutiveFailures >= 3) {
    // Multiple failures - try fallback chain
    strategy.type = 'fallback_chain';
    strategy.fallbackActions = analysis.suggestedActions;
  } else {
    // Use exponential backoff for transient issues
    strategy.type = 'exponential_backoff';
    strategy.backoffMs = Math.min(strategy.backoffMs * 2, 10000);
  }
  
  // Advance phase if we've exhausted hypotheses
  if (analysis.hypotheses.every(h => h.attempted)) {
    strategy.currentPhase++;
    strategy.consecutiveFailures = 0;
    strategy.hypothesisQueue = [];
  }
}

/**
 * Get next action based on retry strategy
 */
export function getNextRetryAction(context: TaskContext): string | null {
  const strategy = context.retryStrategy;
  if (!strategy) return null;

  switch (strategy.type) {
    case 'hypothesis_driven':
      // Try next untested hypothesis
      const nextHypothesisId = strategy.hypothesisQueue.shift();
      if (nextHypothesisId) {
        const hypothesis = context.activeHypotheses?.find(h => h.id === nextHypothesisId);
        if (hypothesis && !hypothesis.attempted) {
          hypothesis.attempted = true;
          return hypothesis.verificationSteps[0] || null;
        }
      }
      break;

    case 'fallback_chain':
      // Try next fallback action
      return strategy.fallbackActions.shift() || null;

    case 'exponential_backoff':
      // Wait, then retry last action
      return `WAIT:${strategy.backoffMs}`;

    case 'adaptive':
      // Choose strategy based on context
      if (context.parsedErrors?.some(e => e.severity === 'critical')) {
        strategy.type = 'hypothesis_driven';
        return getNextRetryAction(context);
      }
      break;
  }

  return null;
}

/**
 * Enable debug mode for a context
 */
export function enableDebugMode(context: TaskContext): void {
  context.debugMode = true;
  // Increase max attempts in debug mode
  context.maxAttempts = Math.max(context.maxAttempts, 30);
  // Initialize debug session ID
  context.debugSessionId = `debug-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Disable debug mode
 */
export function disableDebugMode(context: TaskContext): void {
  context.debugMode = false;
  context.maxAttempts = 20;
}

/**
 * Get debug summary for context
 */
export function getDebugSummary(context: TaskContext): {
  sessionId?: string;
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  hypothesesTried: number;
  hypothesesRemaining: number;
  retryPhase: number;
  lastSuccessfulAction?: string;
} {
  const errorsByCategory: Record<ErrorCategory, number> = {
    syntax: 0, type: 0, runtime: 0, import: 0, dependency: 0,
    permission: 0, network: 0, resource: 0, logic: 0,
    configuration: 0, test_failure: 0, build_failure: 0, unknown: 0,
  };

  for (const error of context.parsedErrors || []) {
    errorsByCategory[error.category]++;
  }

  const hypothesesTried = context.activeHypotheses?.filter(h => h.attempted).length || 0;
  const hypothesesRemaining = (context.activeHypotheses?.length || 0) - hypothesesTried;

  return {
    sessionId: context.debugSessionId,
    totalErrors: context.errors.length,
    errorsByCategory,
    hypothesesTried,
    hypothesesRemaining,
    retryPhase: context.retryStrategy?.currentPhase || 0,
    lastSuccessfulAction: context.retryStrategy?.lastSuccessfulAction,
  };
}

export function selectBestApp(task: string, context: TaskContext): 'terminal' | 'browser' | 'editor' {
  const taskLower = task.toLowerCase();
  
  if (taskLower.includes('search') || taskLower.includes('browse') || 
      taskLower.includes('website') || taskLower.includes('google') ||
      taskLower.includes('look up') || taskLower.includes('find online')) {
    return 'browser';
  }
  
  if (taskLower.includes('edit') || taskLower.includes('write code') ||
      taskLower.includes('modify') || taskLower.includes('create file') ||
      taskLower.includes('update file')) {
    return 'editor';
  }
  
  if (taskLower.includes('run') || taskLower.includes('execute') ||
      taskLower.includes('install') || taskLower.includes('npm') ||
      taskLower.includes('git') || taskLower.includes('command') ||
      taskLower.includes('terminal') || taskLower.includes('shell')) {
    return 'terminal';
  }
  
  return 'terminal';
}

export function getAvailableActions(state: ComputerState): string[] {
  const actions: string[] = [];
  
  switch (state.activeApp) {
    case 'terminal':
      actions.push(
        'TERMINAL:RUN_COMMAND:<command>',
        'TERMINAL:CHANGE_DIR:<path>',
        'TERMINAL:READ_FILE:<file>',
        'TERMINAL:SEARCH:<pattern>',
      );
      break;
    case 'browser':
      actions.push(
        'BROWSER:NAVIGATE:<url>',
        'BROWSER:SEARCH:<query>',
        'BROWSER:SCROLL:down',
        'BROWSER:SCROLL:up',
        'BROWSER:BACK',
        'BROWSER:REFRESH',
      );
      break;
    case 'editor':
      // Basic operations
      actions.push(
        'EDITOR:OPEN_FILE:<path>',
        'EDITOR:WRITE:<content>',
        'EDITOR:SAVE',
        'EDITOR:FIND:<text>',
        'EDITOR:REPLACE:<old>:<new>',
        'EDITOR:GO_TO_LINE:<lineNumber>',
      );
      // Surgical editing operations (diff-based)
      actions.push(
        'EDITOR:REPLACE_LINES:<startLine>:<endLine>:<newContent>',
        'EDITOR:INSERT_AFTER:<line>:<content>',
        'EDITOR:INSERT_BEFORE:<line>:<content>',
        'EDITOR:DELETE_LINES:<startLine>:<endLine>',
        'EDITOR:APPLY_DIFF:<diffString>',
        'EDITOR:ADD_IMPORT:<importStatement>',
        'EDITOR:ADD_FUNCTION:<functionCode>',
        'EDITOR:EDIT_FUNCTION:<functionName>:<newBody>',
        'EDITOR:DELETE_ENTITY:<entityName>',
        'EDITOR:RENAME_ENTITY:<oldName>:<newName>',
      );
      break;
  }
  
  actions.push('SWITCH_APP:terminal', 'SWITCH_APP:browser', 'SWITCH_APP:editor', 'DONE');
  
  return actions;
}
