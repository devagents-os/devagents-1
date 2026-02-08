/**
 * Debugging System - Error Recovery and Debugging Loop
 * 
 * Implements:
 * 1. Error parsing and categorization
 * 2. Debug mode with increased verbosity
 * 3. LLM-based fix hypothesis generator
 * 4. Test-fix-verify loop for iterative correction
 */

import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY ?? '',
});

// ============================================================
// ERROR TYPES AND CATEGORIES
// ============================================================

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

export interface ParsedError {
  /** Original error message */
  raw: string;
  /** Categorized error type */
  category: ErrorCategory;
  /** Severity level */
  severity: ErrorSeverity;
  /** Human-readable summary */
  summary: string;
  /** File where error occurred, if available */
  file?: string;
  /** Line number, if available */
  line?: number;
  /** Column number, if available */
  column?: number;
  /** Function/method name, if available */
  function?: string;
  /** Stack trace frames, if available */
  stackTrace?: StackFrame[];
  /** Error code (e.g., TS2345, ENOENT) */
  errorCode?: string;
  /** Related errors that may be connected */
  relatedErrors?: string[];
  /** Extracted variable/function names involved */
  involvedIdentifiers?: string[];
  /** Timestamp when error was parsed */
  timestamp: number;
}

export interface StackFrame {
  file: string;
  line: number;
  column?: number;
  function?: string;
  isInternal: boolean;
  code?: string;
}

export interface FixHypothesis {
  /** Unique identifier */
  id: string;
  /** Description of the fix */
  description: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Specific code changes to make */
  changes: CodeChange[];
  /** Why this fix should work */
  rationale: string;
  /** Potential risks of this fix */
  risks: string[];
  /** Commands to verify the fix */
  verificationSteps: string[];
  /** Priority for trying this fix */
  priority: number;
}

export interface CodeChange {
  file: string;
  type: 'replace' | 'insert' | 'delete' | 'modify';
  startLine?: number;
  endLine?: number;
  oldContent?: string;
  newContent?: string;
  description: string;
}

export interface DebugSession {
  id: string;
  startTime: number;
  errors: ParsedError[];
  hypotheses: FixHypothesis[];
  attempts: DebugAttempt[];
  status: 'active' | 'resolved' | 'abandoned' | 'blocked';
  resolution?: {
    hypothesis: FixHypothesis;
    changesApplied: CodeChange[];
    verificationPassed: boolean;
  };
}

export interface DebugAttempt {
  id: string;
  timestamp: number;
  hypothesisId: string;
  changesApplied: CodeChange[];
  testResults?: TestResult;
  buildResults?: BuildResult;
  outcome: 'success' | 'failure' | 'partial' | 'error';
  errorAfterFix?: ParsedError;
  notes: string;
}

export interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  errors: string[];
  output: string;
}

export interface BuildResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  output: string;
}

export interface DebugConfig {
  /** Enable verbose logging */
  verbose: boolean;
  /** Maximum fix attempts before giving up */
  maxAttempts: number;
  /** Minimum confidence to try a hypothesis */
  minConfidence: number;
  /** Enable LLM-based hypothesis generation */
  useLLM: boolean;
  /** Auto-apply fixes if confidence > threshold */
  autoApplyThreshold: number;
  /** Include full stack traces in analysis */
  includeStackTraces: boolean;
  /** Timeout for each debug attempt in ms */
  attemptTimeout: number;
}

const DEFAULT_CONFIG: DebugConfig = {
  verbose: false,
  maxAttempts: 5,
  minConfidence: 0.3,
  useLLM: true,
  autoApplyThreshold: 0.85,
  includeStackTraces: true,
  attemptTimeout: 30000,
};

// ============================================================
// ERROR PARSER
// ============================================================

export class ErrorParser {
  private patterns: Map<ErrorCategory, RegExp[]>;

  constructor() {
    this.patterns = new Map([
      ['syntax', [
        /SyntaxError:\s*(.+)/i,
        /Unexpected token/i,
        /Missing .+ before/i,
        /Unterminated string/i,
        /Invalid or unexpected token/i,
        /Expression expected/i,
        /Declaration or statement expected/i,
        /'}' expected/i,
        /';' expected/i,
      ]],
      ['type', [
        /TypeError:\s*(.+)/i,
        /TS\d{4}:/,
        /Type '.*' is not assignable/i,
        /Property '.*' does not exist on type/i,
        /Argument of type '.*' is not assignable/i,
        /Cannot find name '.*'/i,
        /Object is possibly 'undefined'/i,
        /Object is possibly 'null'/i,
        /'.*' is not a valid type/i,
      ]],
      ['runtime', [
        /ReferenceError:\s*(.+)/i,
        /RangeError:\s*(.+)/i,
        /Error: (.+)/,
        /Uncaught/i,
        /undefined is not a function/i,
        /Cannot read propert(y|ies) of (undefined|null)/i,
        /is not defined/i,
        /Maximum call stack/i,
      ]],
      ['import', [
        /Cannot find module/i,
        /Module not found/i,
        /Unable to resolve/i,
        /Import .* not found/i,
        /Could not resolve/i,
        /Cannot resolve module/i,
        /Failed to resolve import/i,
      ]],
      ['dependency', [
        /ERESOLVE/i,
        /peer dep/i,
        /npm ERR!/i,
        /yarn error/i,
        /pnpm ERR!/i,
        /Package .* not found/i,
        /Missing dependency/i,
        /version conflict/i,
      ]],
      ['permission', [
        /EACCES/i,
        /Permission denied/i,
        /EPERM/i,
        /access denied/i,
        /not permitted/i,
        /forbidden/i,
      ]],
      ['network', [
        /ENOTFOUND/i,
        /ECONNREFUSED/i,
        /ETIMEDOUT/i,
        /Network error/i,
        /fetch failed/i,
        /Connection refused/i,
        /getaddrinfo/i,
        /socket hang up/i,
      ]],
      ['resource', [
        /ENOENT/i,
        /EEXIST/i,
        /ENOSPC/i,
        /No such file/i,
        /File not found/i,
        /Directory not found/i,
        /out of memory/i,
        /ENOMEM/i,
      ]],
      ['configuration', [
        /Invalid configuration/i,
        /Config error/i,
        /Missing required field/i,
        /Invalid option/i,
        /Environment variable .* not set/i,
        /Configuration validation failed/i,
      ]],
      ['test_failure', [
        /Test failed/i,
        /FAIL\s/,
        /AssertionError/i,
        /Expected .* to/i,
        /expect\(received\)/i,
        /Received:/i,
        /Expected:/i,
        /toBe|toEqual|toMatch/i,
      ]],
      ['build_failure', [
        /Build failed/i,
        /Compilation failed/i,
        /ERROR in/i,
        /Failed to compile/i,
        /webpack.*error/i,
        /esbuild.*error/i,
        /tsc.*error/i,
      ]],
    ]);
  }

  /**
   * Parse an error string into a structured format
   */
  parse(errorString: string): ParsedError {
    const category = this.categorize(errorString);
    const severity = this.determineSeverity(category, errorString);
    const location = this.extractLocation(errorString);
    const stackTrace = this.parseStackTrace(errorString);
    const errorCode = this.extractErrorCode(errorString);
    const identifiers = this.extractIdentifiers(errorString);

    return {
      raw: errorString,
      category,
      severity,
      summary: this.generateSummary(errorString, category),
      file: location.file,
      line: location.line,
      column: location.column,
      function: location.function,
      stackTrace,
      errorCode,
      involvedIdentifiers: identifiers,
      timestamp: Date.now(),
    };
  }

  /**
   * Parse multiple errors from build/test output
   */
  parseMultiple(output: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = output.split('\n');
    let currentError = '';
    let inStackTrace = false;

    for (const line of lines) {
      // Detect start of new error
      if (this.isErrorStart(line)) {
        if (currentError) {
          errors.push(this.parse(currentError));
        }
        currentError = line;
        inStackTrace = false;
      } else if (currentError) {
        // Continue collecting error including stack trace
        if (line.trim().startsWith('at ') || inStackTrace) {
          inStackTrace = true;
          currentError += '\n' + line;
        } else if (line.trim() && !this.isErrorEnd(line)) {
          currentError += '\n' + line;
        }
      }
    }

    if (currentError) {
      errors.push(this.parse(currentError));
    }

    return this.deduplicateErrors(errors);
  }

  private categorize(error: string): ErrorCategory {
    for (const [category, patterns] of this.patterns) {
      for (const pattern of patterns) {
        if (pattern.test(error)) {
          return category;
        }
      }
    }
    return 'unknown';
  }

  private determineSeverity(category: ErrorCategory, error: string): ErrorSeverity {
    // Critical: prevents execution entirely
    if (category === 'syntax' || category === 'build_failure') {
      return 'critical';
    }
    // High: causes immediate failures
    if (category === 'type' || category === 'runtime' || category === 'import') {
      return 'high';
    }
    // Medium: causes issues but may be recoverable
    if (category === 'dependency' || category === 'configuration' || category === 'test_failure') {
      return 'medium';
    }
    // Low: warnings or non-blocking
    if (error.toLowerCase().includes('warning')) {
      return 'low';
    }
    return 'medium';
  }

  private extractLocation(error: string): {
    file?: string;
    line?: number;
    column?: number;
    function?: string;
  } {
    // Pattern: file.ts:10:5 or file.ts(10,5) or file.ts line 10
    const patterns = [
      /([^\s:()]+\.[jt]sx?):(\d+):(\d+)/,
      /([^\s:()]+\.[jt]sx?)\((\d+),(\d+)\)/,
      /([^\s:()]+\.[jt]sx?) line (\d+)/,
      /at\s+(\S+)\s+\(([^:]+):(\d+):(\d+)\)/,
      /at\s+([^:]+):(\d+):(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = error.match(pattern);
      if (match) {
        if (match.length === 5) {
          // at function (file:line:col)
          return {
            function: match[1],
            file: match[2],
            line: parseInt(match[3]),
            column: parseInt(match[4]),
          };
        } else if (match.length === 4) {
          return {
            file: match[1],
            line: parseInt(match[2]),
            column: parseInt(match[3]),
          };
        } else if (match.length === 3) {
          return {
            file: match[1],
            line: parseInt(match[2]),
          };
        }
      }
    }

    return {};
  }

  private parseStackTrace(error: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const lines = error.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('at ')) continue;

      // Parse: at functionName (file:line:col)
      const match1 = trimmed.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match1) {
        frames.push({
          function: match1[1],
          file: match1[2],
          line: parseInt(match1[3]),
          column: parseInt(match1[4]),
          isInternal: this.isInternalFrame(match1[2]),
        });
        continue;
      }

      // Parse: at file:line:col
      const match2 = trimmed.match(/at\s+(.+?):(\d+):(\d+)/);
      if (match2) {
        frames.push({
          file: match2[1],
          line: parseInt(match2[2]),
          column: parseInt(match2[3]),
          isInternal: this.isInternalFrame(match2[1]),
        });
      }
    }

    return frames;
  }

  private isInternalFrame(file: string): boolean {
    return file.includes('node_modules') || 
           file.includes('internal/') ||
           file.startsWith('node:');
  }

  private extractErrorCode(error: string): string | undefined {
    // TypeScript errors: TS2345
    const tsMatch = error.match(/TS(\d{4})/);
    if (tsMatch) return `TS${tsMatch[1]}`;

    // Node.js errors: ENOENT, EACCES, etc.
    const nodeMatch = error.match(/\b(E[A-Z]{2,})\b/);
    if (nodeMatch) return nodeMatch[1];

    // ESLint errors: no-unused-vars, etc.
    const eslintMatch = error.match(/\b([a-z-]+\/[a-z-]+|[a-z]+-[a-z-]+)\b/);
    if (eslintMatch) return eslintMatch[1];

    return undefined;
  }

  private extractIdentifiers(error: string): string[] {
    const identifiers: Set<string> = new Set();

    // Extract quoted identifiers
    const quoted = error.match(/'([^']+)'/g);
    if (quoted) {
      quoted.forEach(q => identifiers.add(q.replace(/'/g, '')));
    }

    // Extract variable-like names from common patterns
    const patterns = [
      /Cannot find name '(\w+)'/i,
      /Property '(\w+)' does not exist/i,
      /(\w+) is not defined/i,
      /Object '(\w+)' is possibly/i,
      /Type '(\w+)'/i,
    ];

    for (const pattern of patterns) {
      const match = error.match(pattern);
      if (match) {
        identifiers.add(match[1]);
      }
    }

    return Array.from(identifiers);
  }

  private generateSummary(error: string, category: ErrorCategory): string {
    // Extract the main error message
    const lines = error.split('\n');
    const firstLine = lines[0];

    // Clean up common prefixes
    const cleaned = firstLine
      .replace(/^(Error|TypeError|SyntaxError|ReferenceError|RangeError):\s*/i, '')
      .replace(/^error(\[\d+\])?:\s*/i, '')
      .replace(/^\s*at\s+/, '')
      .trim();

    // Truncate if too long
    if (cleaned.length > 150) {
      return cleaned.substring(0, 147) + '...';
    }

    return cleaned || `${category} error`;
  }

  private isErrorStart(line: string): boolean {
    return /^(Error|TypeError|SyntaxError|ReferenceError|RangeError|FAIL|ERROR|error(\[\d+\])?:)/i.test(line.trim());
  }

  private isErrorEnd(line: string): boolean {
    return line.trim() === '' || /^(PASS|Done|Finished)/i.test(line.trim());
  }

  private deduplicateErrors(errors: ParsedError[]): ParsedError[] {
    const seen = new Set<string>();
    return errors.filter(e => {
      const key = `${e.category}:${e.file}:${e.line}:${e.summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// ============================================================
// DEBUG MODE LOGGER
// ============================================================

export class DebugLogger {
  private enabled: boolean;
  private logs: Array<{ level: string; message: string; timestamp: number; data?: any }> = [];
  private maxLogs = 1000;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    const entry = { level, message, timestamp: Date.now(), data };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.enabled) {
      const prefix = `[DEBUG ${level.toUpperCase()}]`;
      if (data) {
        console.log(prefix, message, JSON.stringify(data, null, 2));
      } else {
        console.log(prefix, message);
      }
    }
  }

  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  getLogs(filter?: { level?: string; since?: number }): Array<{ level: string; message: string; timestamp: number; data?: any }> {
    let filtered = this.logs;
    if (filter?.level) {
      filtered = filtered.filter(l => l.level === filter.level);
    }
    if (filter?.since) {
      filtered = filtered.filter(l => l.timestamp >= filter.since);
    }
    return filtered;
  }

  clear(): void {
    this.logs = [];
  }

  formatLog(entry: { level: string; message: string; timestamp: number; data?: any }): string {
    const time = new Date(entry.timestamp).toISOString();
    const data = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : '';
    return `[${time}] [${entry.level.toUpperCase()}] ${entry.message}${data}`;
  }

  exportLogs(): string {
    return this.logs.map(l => this.formatLog(l)).join('\n\n');
  }
}

// ============================================================
// FIX HYPOTHESIS GENERATOR
// ============================================================

export class FixHypothesisGenerator {
  private logger: DebugLogger;
  private useLLM: boolean;

  constructor(logger: DebugLogger, useLLM: boolean = true) {
    this.logger = logger;
    this.useLLM = useLLM;
  }

  /**
   * Generate fix hypotheses for a parsed error
   */
  async generateHypotheses(
    error: ParsedError,
    codeContext?: { file: string; content: string }[]
  ): Promise<FixHypothesis[]> {
    this.logger.info('Generating fix hypotheses', { error: error.summary, category: error.category });

    // Start with rule-based hypotheses
    const ruleBasedHypotheses = this.generateRuleBasedHypotheses(error);
    
    // Add LLM-based hypotheses if enabled
    let llmHypotheses: FixHypothesis[] = [];
    if (this.useLLM) {
      try {
        llmHypotheses = await this.generateLLMHypotheses(error, codeContext);
      } catch (e) {
        this.logger.warn('LLM hypothesis generation failed', { error: e });
      }
    }

    // Combine and deduplicate
    const all = [...ruleBasedHypotheses, ...llmHypotheses];
    const deduplicated = this.deduplicateHypotheses(all);
    
    // Sort by confidence and priority
    deduplicated.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    this.logger.info(`Generated ${deduplicated.length} hypotheses`);
    return deduplicated;
  }

  private generateRuleBasedHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    switch (error.category) {
      case 'syntax':
        hypotheses.push(...this.syntaxErrorHypotheses(error));
        break;
      case 'type':
        hypotheses.push(...this.typeErrorHypotheses(error));
        break;
      case 'import':
        hypotheses.push(...this.importErrorHypotheses(error));
        break;
      case 'runtime':
        hypotheses.push(...this.runtimeErrorHypotheses(error));
        break;
      case 'dependency':
        hypotheses.push(...this.dependencyErrorHypotheses(error));
        break;
      case 'resource':
        hypotheses.push(...this.resourceErrorHypotheses(error));
        break;
      case 'test_failure':
        hypotheses.push(...this.testFailureHypotheses(error));
        break;
      case 'build_failure':
        hypotheses.push(...this.buildFailureHypotheses(error));
        break;
    }

    return hypotheses;
  }

  private syntaxErrorHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    if (error.raw.includes("'}' expected") || error.raw.includes('Unexpected end')) {
      hypotheses.push({
        id: `syntax-missing-brace-${Date.now()}`,
        description: 'Add missing closing brace',
        confidence: 0.7,
        changes: [{
          file: error.file || 'unknown',
          type: 'insert',
          startLine: error.line,
          newContent: '}',
          description: 'Insert closing brace',
        }],
        rationale: 'Error indicates missing closing brace',
        risks: ['May add brace in wrong location'],
        verificationSteps: ['Run TypeScript compiler', 'Check file syntax'],
        priority: 8,
      });
    }

    if (error.raw.includes("';' expected")) {
      hypotheses.push({
        id: `syntax-missing-semicolon-${Date.now()}`,
        description: 'Add missing semicolon',
        confidence: 0.8,
        changes: [{
          file: error.file || 'unknown',
          type: 'insert',
          startLine: error.line,
          newContent: ';',
          description: 'Insert semicolon',
        }],
        rationale: 'Error indicates missing semicolon',
        risks: ['Minimal risk'],
        verificationSteps: ['Run TypeScript compiler'],
        priority: 9,
      });
    }

    return hypotheses;
  }

  private typeErrorHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    if (error.raw.includes('possibly \'undefined\'') || error.raw.includes('possibly \'null\'')) {
      hypotheses.push({
        id: `type-null-check-${Date.now()}`,
        description: 'Add null/undefined check',
        confidence: 0.75,
        changes: [{
          file: error.file || 'unknown',
          type: 'modify',
          startLine: error.line,
          description: 'Add optional chaining or null check',
        }],
        rationale: 'Object may be null or undefined, needs guard',
        risks: ['May change behavior if null is expected'],
        verificationSteps: ['Run TypeScript compiler', 'Run tests'],
        priority: 7,
      });
    }

    if (error.raw.includes('Type') && error.raw.includes('is not assignable')) {
      const typeMatch = error.raw.match(/Type '(.+?)' is not assignable to type '(.+?)'/);
      if (typeMatch) {
        hypotheses.push({
          id: `type-cast-${Date.now()}`,
          description: `Fix type mismatch: ${typeMatch[1]} → ${typeMatch[2]}`,
          confidence: 0.6,
          changes: [{
            file: error.file || 'unknown',
            type: 'modify',
            startLine: error.line,
            description: `Convert ${typeMatch[1]} to ${typeMatch[2]}`,
          }],
          rationale: 'Types are incompatible, need conversion or type assertion',
          risks: ['Type assertion may hide real type issues'],
          verificationSteps: ['Run TypeScript compiler', 'Verify runtime behavior'],
          priority: 6,
        });
      }
    }

    if (error.raw.includes('Cannot find name')) {
      const nameMatch = error.raw.match(/Cannot find name '(\w+)'/);
      if (nameMatch) {
        hypotheses.push({
          id: `type-missing-import-${Date.now()}`,
          description: `Import or declare '${nameMatch[1]}'`,
          confidence: 0.7,
          changes: [{
            file: error.file || 'unknown',
            type: 'insert',
            startLine: 1,
            description: `Add import for ${nameMatch[1]}`,
          }],
          rationale: 'Identifier is used but not imported or declared',
          risks: ['May need to determine correct import source'],
          verificationSteps: ['Run TypeScript compiler'],
          priority: 7,
        });
      }
    }

    return hypotheses;
  }

  private importErrorHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    const moduleMatch = error.raw.match(/Cannot find module '(.+?)'/);
    if (moduleMatch) {
      const moduleName = moduleMatch[1];
      
      // Check if it's a relative import
      if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
        hypotheses.push({
          id: `import-fix-path-${Date.now()}`,
          description: `Fix import path for '${moduleName}'`,
          confidence: 0.6,
          changes: [{
            file: error.file || 'unknown',
            type: 'modify',
            startLine: error.line,
            description: `Correct the import path`,
          }],
          rationale: 'Import path is incorrect or file does not exist',
          risks: ['File may need to be created'],
          verificationSteps: ['Verify file exists', 'Run TypeScript compiler'],
          priority: 7,
        });
      } else {
        hypotheses.push({
          id: `import-install-${Date.now()}`,
          description: `Install missing package '${moduleName}'`,
          confidence: 0.8,
          changes: [],
          rationale: 'Package is not installed',
          risks: ['Package may have different name on npm'],
          verificationSteps: [`Run npm install ${moduleName}`],
          priority: 9,
        });
      }
    }

    return hypotheses;
  }

  private runtimeErrorHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    if (error.raw.includes('Cannot read') && (error.raw.includes('undefined') || error.raw.includes('null'))) {
      hypotheses.push({
        id: `runtime-null-guard-${Date.now()}`,
        description: 'Add null/undefined guard before property access',
        confidence: 0.7,
        changes: [{
          file: error.file || 'unknown',
          type: 'modify',
          startLine: error.line,
          description: 'Add optional chaining (?.) or null check',
        }],
        rationale: 'Accessing property on null/undefined value',
        risks: ['May hide deeper issues with data flow'],
        verificationSteps: ['Run application', 'Run tests'],
        priority: 8,
      });
    }

    if (error.raw.includes('is not a function')) {
      hypotheses.push({
        id: `runtime-not-function-${Date.now()}`,
        description: 'Verify function exists and is callable',
        confidence: 0.5,
        changes: [{
          file: error.file || 'unknown',
          type: 'modify',
          startLine: error.line,
          description: 'Check function reference and binding',
        }],
        rationale: 'Value being called is not a function',
        risks: ['May indicate incorrect import or binding'],
        verificationSteps: ['Debug value type', 'Check imports'],
        priority: 6,
      });
    }

    return hypotheses;
  }

  private dependencyErrorHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    hypotheses.push({
      id: `dep-clean-install-${Date.now()}`,
      description: 'Clean install dependencies',
      confidence: 0.7,
      changes: [],
      rationale: 'Dependency resolution may be corrupted',
      risks: ['May take time', 'May reveal version conflicts'],
      verificationSteps: ['rm -rf node_modules', 'rm package-lock.json', 'npm install'],
      priority: 8,
    });

    if (error.raw.includes('peer dep') || error.raw.includes('ERESOLVE')) {
      hypotheses.push({
        id: `dep-legacy-peer-${Date.now()}`,
        description: 'Install with legacy peer deps',
        confidence: 0.6,
        changes: [],
        rationale: 'Peer dependency conflict detected',
        risks: ['May cause runtime issues'],
        verificationSteps: ['npm install --legacy-peer-deps'],
        priority: 6,
      });
    }

    return hypotheses;
  }

  private resourceErrorHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    if (error.raw.includes('ENOENT') || error.raw.includes('No such file')) {
      const pathMatch = error.raw.match(/(?:ENOENT|No such file)[^']*'([^']+)'/);
      if (pathMatch) {
        hypotheses.push({
          id: `resource-create-${Date.now()}`,
          description: `Create missing file/directory: ${pathMatch[1]}`,
          confidence: 0.6,
          changes: [{
            file: pathMatch[1],
            type: 'insert',
            newContent: '',
            description: 'Create empty file',
          }],
          rationale: 'File or directory does not exist',
          risks: ['File may need specific content'],
          verificationSteps: ['Create file', 'Run operation again'],
          priority: 7,
        });
      }
    }

    return hypotheses;
  }

  private testFailureHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    hypotheses.push({
      id: `test-update-snapshot-${Date.now()}`,
      description: 'Update test snapshots if intentional',
      confidence: 0.4,
      changes: [],
      rationale: 'Test output may have changed intentionally',
      risks: ['May accept incorrect changes'],
      verificationSteps: ['npm test -- -u', 'Review snapshot changes'],
      priority: 4,
    });

    hypotheses.push({
      id: `test-fix-assertion-${Date.now()}`,
      description: 'Fix failing test assertion',
      confidence: 0.6,
      changes: [{
        file: error.file || 'unknown',
        type: 'modify',
        startLine: error.line,
        description: 'Update test expectation or fix tested code',
      }],
      rationale: 'Test assertion is failing',
      risks: ['May be masking real bug'],
      verificationSteps: ['Review expected vs actual', 'Run test'],
      priority: 7,
    });

    return hypotheses;
  }

  private buildFailureHypotheses(error: ParsedError): FixHypothesis[] {
    const hypotheses: FixHypothesis[] = [];

    hypotheses.push({
      id: `build-clean-${Date.now()}`,
      description: 'Clean build artifacts and rebuild',
      confidence: 0.5,
      changes: [],
      rationale: 'Build cache may be corrupted',
      risks: ['Will take longer to rebuild'],
      verificationSteps: ['rm -rf .next', 'rm -rf dist', 'npm run build'],
      priority: 6,
    });

    return hypotheses;
  }

  private async generateLLMHypotheses(
    error: ParsedError,
    codeContext?: { file: string; content: string }[]
  ): Promise<FixHypothesis[]> {
    const contextCode = codeContext?.slice(0, 3).map(c => 
      `File: ${c.file}\n\`\`\`\n${c.content.substring(0, 2000)}\n\`\`\``
    ).join('\n\n') || '';

    const prompt = `Analyze this error and suggest fixes:

ERROR:
Category: ${error.category}
Message: ${error.raw}
File: ${error.file || 'unknown'}
Line: ${error.line || 'unknown'}
${error.errorCode ? `Error Code: ${error.errorCode}` : ''}

${contextCode ? `CODE CONTEXT:\n${contextCode}` : ''}

Generate 1-3 specific fix hypotheses. For each, provide:
1. A clear description of the fix
2. Confidence score (0-1)
3. Specific code changes if applicable
4. Rationale
5. Risks
6. Verification steps

Respond with JSON:
{
  "hypotheses": [
    {
      "description": "...",
      "confidence": 0.8,
      "changes": [{"file": "...", "type": "modify", "description": "..."}],
      "rationale": "...",
      "risks": ["..."],
      "verificationSteps": ["..."]
    }
  ]
}`;

    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert debugging assistant. Analyze errors and provide precise, actionable fix hypotheses.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      return (parsed.hypotheses || []).map((h: any, i: number) => ({
        id: `llm-${Date.now()}-${i}`,
        description: h.description || 'LLM-suggested fix',
        confidence: Math.min(1, Math.max(0, h.confidence || 0.5)),
        changes: h.changes || [],
        rationale: h.rationale || '',
        risks: h.risks || [],
        verificationSteps: h.verificationSteps || [],
        priority: 5, // LLM hypotheses get medium priority
      }));
    } catch (e) {
      this.logger.error('LLM hypothesis generation failed', { error: e });
      return [];
    }
  }

  private deduplicateHypotheses(hypotheses: FixHypothesis[]): FixHypothesis[] {
    const seen = new Set<string>();
    return hypotheses.filter(h => {
      const key = h.description.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// ============================================================
// TEST-FIX-VERIFY LOOP
// ============================================================

export class DebugLoop {
  private parser: ErrorParser;
  private hypothesisGenerator: FixHypothesisGenerator;
  private logger: DebugLogger;
  private config: DebugConfig;
  private sessions: Map<string, DebugSession> = new Map();

  constructor(config: Partial<DebugConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new DebugLogger(this.config.verbose);
    this.parser = new ErrorParser();
    this.hypothesisGenerator = new FixHypothesisGenerator(this.logger, this.config.useLLM);
  }

  /**
   * Start a new debug session for an error
   */
  async startSession(
    errorOutput: string,
    codeContext?: { file: string; content: string }[]
  ): Promise<DebugSession> {
    const sessionId = `debug-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    this.logger.info('Starting debug session', { sessionId });

    // Parse errors
    const errors = this.parser.parseMultiple(errorOutput);
    this.logger.debug(`Parsed ${errors.length} errors`);

    // Generate hypotheses for the primary error
    const primaryError = errors[0];
    let hypotheses: FixHypothesis[] = [];
    
    if (primaryError) {
      hypotheses = await this.hypothesisGenerator.generateHypotheses(primaryError, codeContext);
    }

    const session: DebugSession = {
      id: sessionId,
      startTime: Date.now(),
      errors,
      hypotheses,
      attempts: [],
      status: errors.length > 0 ? 'active' : 'resolved',
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Execute a fix attempt
   */
  async attemptFix(
    sessionId: string,
    hypothesisId: string,
    applyChanges: (changes: CodeChange[]) => Promise<boolean>,
    runVerification: () => Promise<{ testResults?: TestResult; buildResults?: BuildResult; output: string }>
  ): Promise<DebugAttempt> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const hypothesis = session.hypotheses.find(h => h.id === hypothesisId);
    if (!hypothesis) {
      throw new Error(`Hypothesis ${hypothesisId} not found`);
    }

    this.logger.info('Attempting fix', { sessionId, hypothesisId, description: hypothesis.description });

    const attemptId = `attempt-${Date.now()}`;
    const attempt: DebugAttempt = {
      id: attemptId,
      timestamp: Date.now(),
      hypothesisId,
      changesApplied: [],
      outcome: 'failure',
      notes: '',
    };

    try {
      // Apply the changes
      if (hypothesis.changes.length > 0) {
        const applied = await applyChanges(hypothesis.changes);
        if (!applied) {
          attempt.notes = 'Failed to apply changes';
          session.attempts.push(attempt);
          return attempt;
        }
        attempt.changesApplied = hypothesis.changes;
      }

      // Run verification
      const verification = await runVerification();
      attempt.testResults = verification.testResults;
      attempt.buildResults = verification.buildResults;

      // Check if fix succeeded
      const testsPassed = !verification.testResults || verification.testResults.failed === 0;
      const buildPassed = !verification.buildResults || verification.buildResults.success;

      if (testsPassed && buildPassed) {
        attempt.outcome = 'success';
        attempt.notes = 'Fix verified successfully';
        session.status = 'resolved';
        session.resolution = {
          hypothesis,
          changesApplied: attempt.changesApplied,
          verificationPassed: true,
        };
      } else {
        attempt.outcome = 'failure';
        
        // Parse new errors
        const newErrors = this.parser.parseMultiple(verification.output);
        if (newErrors.length > 0) {
          attempt.errorAfterFix = newErrors[0];
          attempt.notes = `Fix introduced new error: ${newErrors[0].summary}`;
        } else {
          attempt.notes = 'Verification failed';
        }
      }
    } catch (e: any) {
      attempt.outcome = 'error';
      attempt.notes = `Exception during fix attempt: ${e.message}`;
      this.logger.error('Fix attempt failed', { error: e.message });
    }

    session.attempts.push(attempt);

    // Check if we should abandon
    if (session.attempts.length >= this.config.maxAttempts && session.status === 'active') {
      session.status = 'abandoned';
      this.logger.warn('Max attempts reached, abandoning session');
    }

    return attempt;
  }

  /**
   * Get next recommended hypothesis to try
   */
  getNextHypothesis(sessionId: string): FixHypothesis | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return null;
    }

    const triedIds = new Set(session.attempts.map(a => a.hypothesisId));
    const untried = session.hypotheses.filter(h => 
      !triedIds.has(h.id) && h.confidence >= this.config.minConfidence
    );

    return untried[0] || null;
  }

  /**
   * Run automated debug loop
   */
  async runAutomatedLoop(
    sessionId: string,
    applyChanges: (changes: CodeChange[]) => Promise<boolean>,
    runVerification: () => Promise<{ testResults?: TestResult; buildResults?: BuildResult; output: string }>,
    onProgress?: (attempt: DebugAttempt, remaining: number) => void
  ): Promise<DebugSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.logger.info('Starting automated debug loop', { sessionId });

    while (session.status === 'active') {
      const nextHypothesis = this.getNextHypothesis(sessionId);
      if (!nextHypothesis) {
        this.logger.info('No more hypotheses to try');
        session.status = 'blocked';
        break;
      }

      const attempt = await this.attemptFix(sessionId, nextHypothesis.id, applyChanges, runVerification);
      
      const remaining = session.hypotheses.length - session.attempts.length;
      onProgress?.(attempt, remaining);

      if (attempt.outcome === 'success') {
        break;
      }

      // If fix introduced new error, generate new hypotheses
      if (attempt.errorAfterFix) {
        const newHypotheses = await this.hypothesisGenerator.generateHypotheses(attempt.errorAfterFix);
        session.hypotheses.push(...newHypotheses);
        session.errors.push(attempt.errorAfterFix);
      }
    }

    return session;
  }

  /**
   * Get session status and summary
   */
  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): DebugSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Generate debug report
   */
  generateReport(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return 'Session not found';
    }

    const lines: string[] = [
      `# Debug Session Report`,
      `ID: ${session.id}`,
      `Status: ${session.status}`,
      `Duration: ${((Date.now() - session.startTime) / 1000).toFixed(1)}s`,
      '',
      `## Errors (${session.errors.length})`,
    ];

    for (const error of session.errors) {
      lines.push(`- [${error.severity}] ${error.category}: ${error.summary}`);
      if (error.file) lines.push(`  File: ${error.file}:${error.line || '?'}`);
    }

    lines.push('', `## Hypotheses Generated (${session.hypotheses.length})`);
    for (const h of session.hypotheses.slice(0, 5)) {
      lines.push(`- ${h.description} (confidence: ${(h.confidence * 100).toFixed(0)}%)`);
    }

    lines.push('', `## Fix Attempts (${session.attempts.length})`);
    for (const a of session.attempts) {
      const h = session.hypotheses.find(h => h.id === a.hypothesisId);
      lines.push(`- ${h?.description || 'Unknown'}: ${a.outcome}`);
      if (a.notes) lines.push(`  Note: ${a.notes}`);
    }

    if (session.resolution) {
      lines.push('', '## Resolution');
      lines.push(`Fix: ${session.resolution.hypothesis.description}`);
      lines.push(`Changes: ${session.resolution.changesApplied.length} file(s) modified`);
    }

    return lines.join('\n');
  }

  /**
   * Get the debug logger
   */
  getLogger(): DebugLogger {
    return this.logger;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger = new DebugLogger(this.config.verbose);
    this.hypothesisGenerator = new FixHypothesisGenerator(this.logger, this.config.useLLM);
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    this.sessions.clear();
  }
}

// ============================================================
// SINGLETON EXPORTS
// ============================================================

export const errorParser = new ErrorParser();
export const debugLogger = new DebugLogger(false);
export const debugLoop = new DebugLoop();

export default {
  ErrorParser,
  DebugLogger,
  FixHypothesisGenerator,
  DebugLoop,
  errorParser,
  debugLogger,
  debugLoop,
};
