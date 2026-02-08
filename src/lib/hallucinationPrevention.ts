/**
 * Hallucination Prevention Service
 * Provides grounding checks, verification, and confidence scoring to prevent
 * the agent from producing confidently wrong code or claims.
 * 
 * Key Features:
 * - File/function existence verification
 * - Syntax/compilation verification before presenting code
 * - Evidence-based confidence scoring
 * - Source citation tracking
 * - Verification prompts that challenge conclusions
 */

import { Project, ScriptTarget, ModuleKind } from 'ts-morph';
import { codeAnalyzer, CodeEntity } from './codeAnalysis';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface GroundingCheck {
  type: 'file_exists' | 'function_exists' | 'variable_exists' | 'type_exists' | 'import_valid' | 'api_valid';
  target: string;
  exists: boolean;
  actualLocation?: string;
  suggestions?: string[];
  confidence: number;
}

export interface SyntaxVerification {
  valid: boolean;
  errors: SyntaxError[];
  warnings: SyntaxWarning[];
  language: string;
  parseTime: number;
}

export interface SyntaxError {
  line: number;
  column: number;
  message: string;
  code?: string;
  severity: 'error' | 'fatal';
}

export interface SyntaxWarning {
  line: number;
  column: number;
  message: string;
  suggestion?: string;
}

export interface ConfidenceScore {
  overall: number; // 0-1
  breakdown: {
    syntaxValidity: number;
    groundingScore: number;
    evidenceStrength: number;
    consistencyScore: number;
  };
  flags: ConfidenceFlag[];
  recommendation: 'proceed' | 'review' | 'reject';
}

export interface ConfidenceFlag {
  type: 'low_confidence' | 'unverified_claim' | 'missing_evidence' | 'potential_hallucination' | 'stale_reference';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  context?: string;
}

export interface SourceCitation {
  type: 'file' | 'function' | 'documentation' | 'api' | 'memory' | 'inference';
  reference: string;
  confidence: number;
  lastVerified?: Date;
  content?: string;
}

export interface VerificationResult {
  verified: boolean;
  groundingChecks: GroundingCheck[];
  syntaxVerification?: SyntaxVerification;
  confidenceScore: ConfidenceScore;
  citations: SourceCitation[];
  challenges: VerificationChallenge[];
}

export interface VerificationChallenge {
  question: string;
  context: string;
  suggestedVerification: string;
  resolved: boolean;
  resolution?: string;
}

export interface CodebaseContext {
  files: Map<string, string>;
  entities: Map<string, CodeEntity>;
  imports: Map<string, string[]>;
  exports: Map<string, string[]>;
  lastUpdated: Date;
}

// ============================================================
// HALLUCINATION PREVENTION SERVICE
// ============================================================

export class HallucinationPreventionService {
  private project: Project;
  private codebaseContext: CodebaseContext;
  private verificationCache: Map<string, { result: GroundingCheck; timestamp: number }>;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ScriptTarget.ESNext,
        module: ModuleKind.ESNext,
        jsx: 4, // ReactJSX
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
      },
    });

    this.codebaseContext = {
      files: new Map(),
      entities: new Map(),
      imports: new Map(),
      exports: new Map(),
      lastUpdated: new Date(),
    };

    this.verificationCache = new Map();
  }

  // ============================================================
  // CODEBASE GROUNDING
  // ============================================================

  /**
   * Update the codebase context for grounding checks
   */
  async updateCodebaseContext(files: Array<{ path: string; content: string }>): Promise<void> {
    this.codebaseContext.files.clear();
    this.codebaseContext.entities.clear();
    this.codebaseContext.imports.clear();
    this.codebaseContext.exports.clear();

    for (const file of files) {
      this.codebaseContext.files.set(file.path, file.content);
      
      // Analyze file to extract entities
      try {
        const analysis = await codeAnalyzer.analyzeFile(file.path, file.content);
        for (const entity of analysis.entities) {
          this.codebaseContext.entities.set(`${file.path}:${entity.name}`, entity);
          // Also store by name alone for quick lookup
          this.codebaseContext.entities.set(entity.name, entity);
        }
        
        this.codebaseContext.imports.set(file.path, analysis.imports.map((i: any) => i.moduleSpecifier));
        this.codebaseContext.exports.set(file.path, analysis.exports.map((e: any) => e.name));
      } catch (error) {
        console.warn(`Failed to analyze file ${file.path}:`, error);
      }
    }

    this.codebaseContext.lastUpdated = new Date();
    this.verificationCache.clear();
  }

  /**
   * Check if a file exists in the codebase
   */
  verifyFileExists(filePath: string): GroundingCheck {
    const cacheKey = `file:${filePath}`;
    const cached = this.getCachedVerification(cacheKey);
    if (cached) return cached;

    const normalizedPath = this.normalizePath(filePath);
    const exists = this.codebaseContext.files.has(normalizedPath);
    
    let suggestions: string[] = [];
    if (!exists) {
      // Find similar file names
      suggestions = this.findSimilarFiles(filePath);
    }

    const result: GroundingCheck = {
      type: 'file_exists',
      target: filePath,
      exists,
      actualLocation: exists ? normalizedPath : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      confidence: exists ? 1.0 : 0.0,
    };

    this.setCachedVerification(cacheKey, result);
    return result;
  }

  /**
   * Check if a function exists in the codebase
   */
  verifyFunctionExists(functionName: string, expectedFile?: string): GroundingCheck {
    const cacheKey = `function:${functionName}:${expectedFile || ''}`;
    const cached = this.getCachedVerification(cacheKey);
    if (cached) return cached;

    let entity: CodeEntity | undefined;
    let actualLocation: string | undefined;

    if (expectedFile) {
      // Look in specific file
      entity = this.codebaseContext.entities.get(`${expectedFile}:${functionName}`);
      if (entity) actualLocation = expectedFile;
    } else {
      // Look globally
      entity = this.codebaseContext.entities.get(functionName);
      if (entity) actualLocation = entity.filePath;
    }

    const exists = !!entity && (entity.type === 'function' || entity.type === 'arrow-function' || entity.type === 'method');
    
    let suggestions: string[] = [];
    if (!exists) {
      suggestions = this.findSimilarEntities(functionName, 'function');
    }

    const result: GroundingCheck = {
      type: 'function_exists',
      target: functionName,
      exists,
      actualLocation,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      confidence: exists ? 1.0 : (suggestions.length > 0 ? 0.3 : 0.0),
    };

    this.setCachedVerification(cacheKey, result);
    return result;
  }

  /**
   * Check if a variable/constant exists in the codebase
   */
  verifyVariableExists(variableName: string, expectedFile?: string): GroundingCheck {
    const cacheKey = `variable:${variableName}:${expectedFile || ''}`;
    const cached = this.getCachedVerification(cacheKey);
    if (cached) return cached;

    let entity: CodeEntity | undefined;
    let actualLocation: string | undefined;

    if (expectedFile) {
      entity = this.codebaseContext.entities.get(`${expectedFile}:${variableName}`);
      if (entity) actualLocation = expectedFile;
    } else {
      entity = this.codebaseContext.entities.get(variableName);
      if (entity) actualLocation = entity.filePath;
    }

    const exists = !!entity && entity.type === 'variable';

    const result: GroundingCheck = {
      type: 'variable_exists',
      target: variableName,
      exists,
      actualLocation,
      suggestions: exists ? undefined : this.findSimilarEntities(variableName, 'variable'),
      confidence: exists ? 1.0 : 0.0,
    };

    this.setCachedVerification(cacheKey, result);
    return result;
  }

  /**
   * Check if a type/interface exists in the codebase
   */
  verifyTypeExists(typeName: string, expectedFile?: string): GroundingCheck {
    const cacheKey = `type:${typeName}:${expectedFile || ''}`;
    const cached = this.getCachedVerification(cacheKey);
    if (cached) return cached;

    let entity: CodeEntity | undefined;
    let actualLocation: string | undefined;

    if (expectedFile) {
      entity = this.codebaseContext.entities.get(`${expectedFile}:${typeName}`);
      if (entity) actualLocation = expectedFile;
    } else {
      entity = this.codebaseContext.entities.get(typeName);
      if (entity) actualLocation = entity.filePath;
    }

    const exists = !!entity && (entity.type === 'type' || entity.type === 'interface' || entity.type === 'class' || entity.type === 'enum');

    const result: GroundingCheck = {
      type: 'type_exists',
      target: typeName,
      exists,
      actualLocation,
      suggestions: exists ? undefined : this.findSimilarEntities(typeName, 'type'),
      confidence: exists ? 1.0 : 0.0,
    };

    this.setCachedVerification(cacheKey, result);
    return result;
  }

  /**
   * Verify an import statement is valid
   */
  verifyImportValid(importPath: string, fromFile: string): GroundingCheck {
    const cacheKey = `import:${importPath}:${fromFile}`;
    const cached = this.getCachedVerification(cacheKey);
    if (cached) return cached;

    let exists = false;
    let actualLocation: string | undefined;
    const suggestions: string[] = [];

    // Check if it's a relative import
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      const resolvedPath = this.resolveImportPath(importPath, fromFile);
      exists = this.codebaseContext.files.has(resolvedPath) ||
               this.codebaseContext.files.has(resolvedPath + '.ts') ||
               this.codebaseContext.files.has(resolvedPath + '.tsx') ||
               this.codebaseContext.files.has(resolvedPath + '/index.ts');
      if (exists) actualLocation = resolvedPath;
    } else {
      // External package - assume it exists but with lower confidence
      exists = true;
      actualLocation = `node_modules/${importPath}`;
    }

    const result: GroundingCheck = {
      type: 'import_valid',
      target: importPath,
      exists,
      actualLocation,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      confidence: importPath.startsWith('.') ? (exists ? 1.0 : 0.0) : 0.7, // External imports get lower confidence
    };

    this.setCachedVerification(cacheKey, result);
    return result;
  }

  // ============================================================
  // SYNTAX VERIFICATION
  // ============================================================

  /**
   * Verify code syntax before presenting it
   */
  verifySyntax(code: string, language: string, filePath?: string): SyntaxVerification {
    const startTime = Date.now();
    const errors: SyntaxError[] = [];
    const warnings: SyntaxWarning[] = [];

    if (language === 'typescript' || language === 'javascript' || 
        language === 'tsx' || language === 'jsx' ||
        filePath?.match(/\.(ts|tsx|js|jsx)$/)) {
      
      try {
        const sourceFile = this.project.createSourceFile(
          filePath || `temp_${Date.now()}.${language === 'typescript' || language === 'tsx' ? 'tsx' : 'jsx'}`,
          code,
          { overwrite: true }
        );

        // Get syntax diagnostics
        const syntaxDiagnostics = sourceFile.getPreEmitDiagnostics();
        
        for (const diagnostic of syntaxDiagnostics) {
          const lineAndChar = diagnostic.getLineNumber();
          const message = typeof diagnostic.getMessageText() === 'string' 
            ? diagnostic.getMessageText() as string
            : (diagnostic.getMessageText() as any).getMessageText?.() || 'Unknown error';

          if (diagnostic.getCategory() === 1) { // Error
            errors.push({
              line: lineAndChar || 1,
              column: 1,
              message,
              code: `TS${diagnostic.getCode()}`,
              severity: 'error',
            });
          } else if (diagnostic.getCategory() === 0) { // Warning
            warnings.push({
              line: lineAndChar || 1,
              column: 1,
              message,
            });
          }
        }

        // Clean up
        this.project.removeSourceFile(sourceFile);
      } catch (error) {
        errors.push({
          line: 1,
          column: 1,
          message: error instanceof Error ? error.message : 'Parse error',
          severity: 'fatal',
        });
      }
    } else if (language === 'json') {
      try {
        JSON.parse(code);
      } catch (e) {
        const jsonError = e as any;
        errors.push({
          line: 1,
          column: 1,
          message: jsonError.message || 'Invalid JSON',
          severity: 'error',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      language,
      parseTime: Date.now() - startTime,
    };
  }

  /**
   * Verify code compiles and integrates with existing codebase
   */
  async verifyCodeIntegration(
    code: string,
    targetFile: string,
    dependencies?: string[]
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // First verify syntax
    const syntaxResult = this.verifySyntax(code, 'typescript', targetFile);
    if (!syntaxResult.valid) {
      errors.push(...syntaxResult.errors.map(e => `Line ${e.line}: ${e.message}`));
    }
    warnings.push(...syntaxResult.warnings.map(w => `Line ${w.line}: ${w.message}`));

    // Extract and verify imports from the code
    const importMatches = code.matchAll(/import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      const importPath = match[1];
      const importCheck = this.verifyImportValid(importPath, targetFile);
      if (!importCheck.exists && importPath.startsWith('.')) {
        errors.push(`Invalid import: "${importPath}" - file not found`);
        if (importCheck.suggestions?.length) {
          warnings.push(`Did you mean: ${importCheck.suggestions.join(', ')}?`);
        }
      }
    }

    // Verify dependencies exist
    if (dependencies) {
      for (const dep of dependencies) {
        if (dep.includes(':')) {
          const [file, entity] = dep.split(':');
          const check = this.verifyFunctionExists(entity, file);
          if (!check.exists) {
            errors.push(`Missing dependency: ${entity} in ${file}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================================
  // CONFIDENCE SCORING
  // ============================================================

  /**
   * Calculate confidence score for generated content
   */
  calculateConfidence(
    content: string,
    context: {
      groundingChecks: GroundingCheck[];
      syntaxVerification?: SyntaxVerification;
      citations: SourceCitation[];
      claimsCount: number;
      verifiedClaimsCount: number;
    }
  ): ConfidenceScore {
    const flags: ConfidenceFlag[] = [];

    // Calculate syntax validity score
    let syntaxValidity = 1.0;
    if (context.syntaxVerification) {
      if (!context.syntaxVerification.valid) {
        syntaxValidity = 0.0;
        flags.push({
          type: 'low_confidence',
          message: `Code has ${context.syntaxVerification.errors.length} syntax errors`,
          severity: 'critical',
        });
      } else if (context.syntaxVerification.warnings.length > 0) {
        syntaxValidity = 0.8;
        flags.push({
          type: 'low_confidence',
          message: `Code has ${context.syntaxVerification.warnings.length} warnings`,
          severity: 'warning',
        });
      }
    }

    // Calculate grounding score
    let groundingScore = 1.0;
    const failedChecks = context.groundingChecks.filter(c => !c.exists);
    if (failedChecks.length > 0) {
      groundingScore = 1 - (failedChecks.length / Math.max(context.groundingChecks.length, 1));
      for (const check of failedChecks) {
        flags.push({
          type: 'potential_hallucination',
          message: `Referenced ${check.type.replace('_', ' ')} "${check.target}" not found`,
          severity: check.type === 'file_exists' || check.type === 'function_exists' ? 'critical' : 'warning',
          context: check.suggestions?.join(', '),
        });
      }
    }

    // Calculate evidence strength
    let evidenceStrength = 0.5; // Default medium confidence
    if (context.citations.length > 0) {
      const avgCitationConfidence = context.citations.reduce((sum, c) => sum + c.confidence, 0) / context.citations.length;
      evidenceStrength = avgCitationConfidence;
      
      const inferredCitations = context.citations.filter(c => c.type === 'inference');
      if (inferredCitations.length > context.citations.length / 2) {
        flags.push({
          type: 'missing_evidence',
          message: 'More than half of claims are based on inference rather than direct evidence',
          severity: 'warning',
        });
      }
    } else {
      flags.push({
        type: 'missing_evidence',
        message: 'No source citations provided',
        severity: 'warning',
      });
      evidenceStrength = 0.3;
    }

    // Calculate consistency score
    let consistencyScore = context.claimsCount > 0 
      ? context.verifiedClaimsCount / context.claimsCount 
      : 0.5;
    
    if (consistencyScore < 0.5) {
      flags.push({
        type: 'unverified_claim',
        message: `Only ${Math.round(consistencyScore * 100)}% of claims could be verified`,
        severity: 'warning',
      });
    }

    // Calculate overall score (weighted average)
    const overall = (
      syntaxValidity * 0.3 +
      groundingScore * 0.3 +
      evidenceStrength * 0.2 +
      consistencyScore * 0.2
    );

    // Determine recommendation
    let recommendation: 'proceed' | 'review' | 'reject';
    if (overall >= 0.8 && flags.filter(f => f.severity === 'critical').length === 0) {
      recommendation = 'proceed';
    } else if (overall >= 0.5 || flags.filter(f => f.severity === 'critical').length === 0) {
      recommendation = 'review';
    } else {
      recommendation = 'reject';
    }

    return {
      overall,
      breakdown: {
        syntaxValidity,
        groundingScore,
        evidenceStrength,
        consistencyScore,
      },
      flags,
      recommendation,
    };
  }

  // ============================================================
  // VERIFICATION CHALLENGES
  // ============================================================

  /**
   * Generate verification challenges for a claim or piece of code
   */
  generateVerificationChallenges(
    content: string,
    contentType: 'code' | 'claim' | 'plan'
  ): VerificationChallenge[] {
    const challenges: VerificationChallenge[] = [];

    if (contentType === 'code') {
      // Check for function references
      const functionCalls = content.match(/\b([a-zA-Z_]\w*)\s*\(/g) || [];
      const uniqueFunctions = [...new Set(functionCalls.map(f => f.replace(/\s*\($/, '')))];
      
      for (const func of uniqueFunctions) {
        if (!this.isBuiltIn(func)) {
          challenges.push({
            question: `Does the function "${func}" exist and have the expected signature?`,
            context: `Function call found in generated code`,
            suggestedVerification: `verifyFunctionExists("${func}")`,
            resolved: false,
          });
        }
      }

      // Check for import statements
      const imports = content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g) || [];
      for (const imp of imports) {
        const pathMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
        if (pathMatch && pathMatch[1].startsWith('.')) {
          challenges.push({
            question: `Does the import path "${pathMatch[1]}" resolve to an existing file?`,
            context: `Import statement in generated code`,
            suggestedVerification: `verifyImportValid("${pathMatch[1]}", targetFile)`,
            resolved: false,
          });
        }
      }

      // Check for type references
      const typeRefs = content.match(/:\s*([A-Z][a-zA-Z]*)\b/g) || [];
      const uniqueTypes = [...new Set(typeRefs.map(t => t.replace(/^:\s*/, '')))];
      
      for (const type of uniqueTypes) {
        if (!this.isBuiltInType(type)) {
          challenges.push({
            question: `Is the type "${type}" defined in the codebase?`,
            context: `Type reference in generated code`,
            suggestedVerification: `verifyTypeExists("${type}")`,
            resolved: false,
          });
        }
      }
    } else if (contentType === 'claim') {
      // Extract file references
      const fileRefs = content.match(/(?:in|from|at|file)\s+['"]?([a-zA-Z0-9_/.-]+\.[a-z]+)['"]?/gi) || [];
      for (const ref of fileRefs) {
        const filePath = ref.replace(/^(?:in|from|at|file)\s+['"]?/i, '').replace(/['"]?$/, '');
        challenges.push({
          question: `Does the file "${filePath}" exist?`,
          context: `File reference in claim`,
          suggestedVerification: `verifyFileExists("${filePath}")`,
          resolved: false,
        });
      }

      // Extract function/variable references  
      const codeRefs = content.match(/`([a-zA-Z_]\w*)`/g) || [];
      for (const ref of codeRefs) {
        const name = ref.replace(/`/g, '');
        challenges.push({
          question: `Does "${name}" exist in the codebase?`,
          context: `Code reference in claim`,
          suggestedVerification: `Check entities for "${name}"`,
          resolved: false,
        });
      }
    } else if (contentType === 'plan') {
      // Check for assumed dependencies
      const steps = content.split(/\d+\.\s*/);
      for (const step of steps) {
        if (step.match(/modify|edit|update|change/i)) {
          const fileMatch = step.match(/([a-zA-Z0-9_/.-]+\.[a-z]+)/);
          if (fileMatch) {
            challenges.push({
              question: `Can the file "${fileMatch[1]}" be found for modification?`,
              context: `Modification planned`,
              suggestedVerification: `verifyFileExists("${fileMatch[1]}")`,
              resolved: false,
            });
          }
        }
        if (step.match(/call|use|invoke/i)) {
          const funcMatch = step.match(/`([a-zA-Z_]\w*)`/);
          if (funcMatch) {
            challenges.push({
              question: `Is the function "${funcMatch[1]}" available?`,
              context: `Function usage planned`,
              suggestedVerification: `verifyFunctionExists("${funcMatch[1]}")`,
              resolved: false,
            });
          }
        }
      }
    }

    return challenges;
  }

  /**
   * Resolve verification challenges using actual codebase checks
   */
  resolveVerificationChallenges(challenges: VerificationChallenge[]): VerificationChallenge[] {
    return challenges.map(challenge => {
      if (challenge.resolved) return challenge;

      let resolved = false;
      let resolution: string | undefined;

      if (challenge.suggestedVerification.startsWith('verifyFileExists')) {
        const match = challenge.suggestedVerification.match(/"([^"]+)"/);
        if (match) {
          const check = this.verifyFileExists(match[1]);
          resolved = true;
          resolution = check.exists 
            ? `Verified: File exists at ${check.actualLocation}`
            : `Not found${check.suggestions?.length ? `. Similar: ${check.suggestions.join(', ')}` : ''}`;
        }
      } else if (challenge.suggestedVerification.startsWith('verifyFunctionExists')) {
        const match = challenge.suggestedVerification.match(/"([^"]+)"/);
        if (match) {
          const check = this.verifyFunctionExists(match[1]);
          resolved = true;
          resolution = check.exists
            ? `Verified: Function exists in ${check.actualLocation}`
            : `Not found${check.suggestions?.length ? `. Similar: ${check.suggestions.join(', ')}` : ''}`;
        }
      } else if (challenge.suggestedVerification.startsWith('verifyTypeExists')) {
        const match = challenge.suggestedVerification.match(/"([^"]+)"/);
        if (match) {
          const check = this.verifyTypeExists(match[1]);
          resolved = true;
          resolution = check.exists
            ? `Verified: Type exists in ${check.actualLocation}`
            : `Not found${check.suggestions?.length ? `. Similar: ${check.suggestions.join(', ')}` : ''}`;
        }
      } else if (challenge.suggestedVerification.startsWith('verifyImportValid')) {
        const matches = challenge.suggestedVerification.match(/"([^"]+)"/g);
        if (matches && matches.length >= 1) {
          const importPath = matches[0].replace(/"/g, '');
          const fromFile = matches[1]?.replace(/"/g, '') || 'unknown';
          const check = this.verifyImportValid(importPath, fromFile);
          resolved = true;
          resolution = check.exists
            ? `Verified: Import resolves to ${check.actualLocation}`
            : 'Import path not found';
        }
      }

      return { ...challenge, resolved, resolution };
    });
  }

  // ============================================================
  // FULL VERIFICATION PIPELINE
  // ============================================================

  /**
   * Perform full verification of generated content
   */
  async verify(
    content: string,
    options: {
      contentType: 'code' | 'claim' | 'plan';
      language?: string;
      targetFile?: string;
      autoResolve?: boolean;
    }
  ): Promise<VerificationResult> {
    const groundingChecks: GroundingCheck[] = [];
    const citations: SourceCitation[] = [];
    let claimsCount = 0;
    let verifiedClaimsCount = 0;

    // Generate and optionally resolve challenges
    let challenges = this.generateVerificationChallenges(content, options.contentType);
    if (options.autoResolve !== false) {
      challenges = this.resolveVerificationChallenges(challenges);
      
      // Convert resolved challenges to grounding checks
      for (const challenge of challenges) {
        claimsCount++;
        if (challenge.resolved) {
          const exists = challenge.resolution?.startsWith('Verified');
          if (exists) verifiedClaimsCount++;
          
          groundingChecks.push({
            type: challenge.suggestedVerification.includes('File') ? 'file_exists' :
                  challenge.suggestedVerification.includes('Function') ? 'function_exists' :
                  challenge.suggestedVerification.includes('Type') ? 'type_exists' : 'import_valid',
            target: challenge.question.match(/"([^"]+)"/)?.[1] || 'unknown',
            exists: exists || false,
            confidence: exists ? 1.0 : 0.0,
          });

          if (exists) {
            citations.push({
              type: 'file',
              reference: challenge.resolution || '',
              confidence: 1.0,
              lastVerified: new Date(),
            });
          }
        }
      }
    }

    // Verify syntax for code content
    let syntaxVerification: SyntaxVerification | undefined;
    if (options.contentType === 'code' && options.language) {
      syntaxVerification = this.verifySyntax(content, options.language, options.targetFile);
    }

    // Calculate confidence score
    const confidenceScore = this.calculateConfidence(content, {
      groundingChecks,
      syntaxVerification,
      citations,
      claimsCount,
      verifiedClaimsCount,
    });

    return {
      verified: confidenceScore.recommendation === 'proceed',
      groundingChecks,
      syntaxVerification,
      confidenceScore,
      citations,
      challenges,
    };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private normalizePath(filePath: string): string {
    // Remove leading ./ and normalize
    return filePath.replace(/^\.\//, '').replace(/\\/g, '/');
  }

  private resolveImportPath(importPath: string, fromFile: string): string {
    const fromDir = fromFile.split('/').slice(0, -1).join('/');
    const parts = [...fromDir.split('/'), ...importPath.split('/')];
    const resolved: string[] = [];
    
    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.' && part !== '') {
        resolved.push(part);
      }
    }
    
    return resolved.join('/');
  }

  private findSimilarFiles(filePath: string): string[] {
    const fileName = filePath.split('/').pop() || '';
    const suggestions: string[] = [];
    
    for (const existingPath of this.codebaseContext.files.keys()) {
      const existingName = existingPath.split('/').pop() || '';
      if (this.levenshteinDistance(fileName, existingName) <= 3) {
        suggestions.push(existingPath);
      }
    }
    
    return suggestions.slice(0, 3);
  }

  private findSimilarEntities(name: string, type: 'function' | 'variable' | 'type'): string[] {
    const suggestions: string[] = [];
    const targetTypes = type === 'function' 
      ? ['function', 'arrow-function', 'method']
      : type === 'type'
      ? ['type', 'interface', 'class', 'enum']
      : ['variable'];
    
    for (const [key, entity] of this.codebaseContext.entities) {
      if (!key.includes(':') && // Only check name-only keys
          targetTypes.includes(entity.type) &&
          this.levenshteinDistance(name.toLowerCase(), entity.name.toLowerCase()) <= 3) {
        suggestions.push(`${entity.name} (${entity.filePath}:${entity.startLine})`);
      }
    }
    
    return suggestions.slice(0, 3);
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }

  private isBuiltIn(name: string): boolean {
    const builtIns = new Set([
      'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
      'Date', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise',
      'Symbol', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI',
      'decodeURI', 'encodeURIComponent', 'decodeURIComponent', 'eval', 'require',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch',
      'alert', 'confirm', 'prompt', 'document', 'window', 'process', 'Buffer',
      'if', 'for', 'while', 'switch', 'try', 'catch', 'throw', 'return',
    ]);
    return builtIns.has(name);
  }

  private isBuiltInType(name: string): boolean {
    const builtInTypes = new Set([
      'string', 'number', 'boolean', 'object', 'any', 'unknown', 'never', 'void',
      'null', 'undefined', 'Array', 'Map', 'Set', 'Promise', 'Record', 'Partial',
      'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable',
      'Parameters', 'ReturnType', 'InstanceType', 'ThisType', 'Function', 'Date',
      'RegExp', 'Error', 'Symbol', 'BigInt', 'React', 'JSX', 'HTMLElement',
      'Event', 'MouseEvent', 'KeyboardEvent', 'Node', 'Element', 'Document',
    ]);
    return builtInTypes.has(name);
  }

  private getCachedVerification(key: string): GroundingCheck | null {
    const cached = this.verificationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }
    return null;
  }

  private setCachedVerification(key: string, result: GroundingCheck): void {
    this.verificationCache.set(key, { result, timestamp: Date.now() });
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    this.verificationCache.clear();
  }

  /**
   * Get codebase statistics
   */
  getCodebaseStats(): {
    fileCount: number;
    entityCount: number;
    lastUpdated: Date;
  } {
    return {
      fileCount: this.codebaseContext.files.size,
      entityCount: this.codebaseContext.entities.size,
      lastUpdated: this.codebaseContext.lastUpdated,
    };
  }
}

// Singleton instance
export const hallucinationPrevention = new HallucinationPreventionService();

// ============================================================
// EVIDENCE-BASED SCORING FOR PLANNING
// ============================================================

/**
 * Calculate evidence-based score for a planning step
 * Replaces random scoring with actual verification
 */
export async function calculateEvidenceBasedScore(
  step: string,
  context: {
    task: string;
    codebaseFiles?: Array<{ path: string; content: string }>;
    previousSteps?: string[];
  }
): Promise<{
  score: number;
  confidence: number;
  evidence: string[];
  warnings: string[];
}> {
  const evidence: string[] = [];
  const warnings: string[] = [];
  let score = 0.5; // Base score
  let evidenceCount = 0;
  let verifiedCount = 0;

  // Update codebase context if provided
  if (context.codebaseFiles) {
    await hallucinationPrevention.updateCodebaseContext(context.codebaseFiles);
  }

  // Check for file references in the step
  const fileRefs = step.match(/([a-zA-Z0-9_/.-]+\.[a-z]{2,4})/g) || [];
  for (const fileRef of fileRefs) {
    evidenceCount++;
    const check = hallucinationPrevention.verifyFileExists(fileRef);
    if (check.exists) {
      verifiedCount++;
      evidence.push(`File "${fileRef}" exists`);
      score += 0.1;
    } else {
      warnings.push(`File "${fileRef}" not found${check.suggestions?.length ? ` (similar: ${check.suggestions[0]})` : ''}`);
      score -= 0.1;
    }
  }

  // Check for function references
  const funcRefs = step.match(/`([a-zA-Z_]\w*)`/g) || [];
  for (const funcRef of funcRefs) {
    const funcName = funcRef.replace(/`/g, '');
    evidenceCount++;
    const check = hallucinationPrevention.verifyFunctionExists(funcName);
    if (check.exists) {
      verifiedCount++;
      evidence.push(`Function "${funcName}" exists in ${check.actualLocation}`);
      score += 0.1;
    } else {
      warnings.push(`Function "${funcName}" not found${check.suggestions?.length ? ` (similar: ${check.suggestions[0]})` : ''}`);
      score -= 0.05;
    }
  }

  // Check for task relevance
  const taskKeywords = context.task.toLowerCase().split(/\s+/);
  const stepKeywords = step.toLowerCase().split(/\s+/);
  const overlap = taskKeywords.filter(k => stepKeywords.includes(k)).length;
  const relevanceScore = overlap / Math.max(taskKeywords.length, 1);
  
  if (relevanceScore > 0.3) {
    evidence.push(`Step is relevant to task (${Math.round(relevanceScore * 100)}% keyword match)`);
    score += relevanceScore * 0.2;
  } else {
    warnings.push('Low relevance to original task');
  }

  // Check for logical sequence with previous steps
  if (context.previousSteps?.length) {
    const lastStep = context.previousSteps[context.previousSteps.length - 1];
    if (step.toLowerCase().includes('then') || step.toLowerCase().includes('after')) {
      evidence.push('Step follows logical sequence');
      score += 0.05;
    }
    
    // Check for dependency on previous steps
    const prevFuncs = lastStep.match(/`([a-zA-Z_]\w*)`/g)?.map(f => f.replace(/`/g, '')) || [];
    for (const func of prevFuncs) {
      if (step.includes(func)) {
        evidence.push(`Builds on previous step's work with "${func}"`);
        score += 0.1;
      }
    }
  }

  // Calculate confidence based on evidence
  const confidence = evidenceCount > 0 ? verifiedCount / evidenceCount : 0.5;

  // Normalize score to 0-1 range
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    confidence,
    evidence,
    warnings,
  };
}

// ============================================================
// EXPORTS
// ============================================================

export default hallucinationPrevention;
