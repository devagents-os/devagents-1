/**
 * Documentation Generator Service
 * 
 * Provides comprehensive documentation generation capabilities:
 * - Commit message generation from diffs
 * - Inline comment generation for complex code
 * - README/documentation updates
 * - Action explanation generation
 * - PR description generation
 */

import Groq from 'groq-sdk';
import { DiffParser, UnifiedDiff, DiffHunk } from './diffEditor';
import { codeAnalyzer, CodeEntity, CodeAnalysisResult } from './codeAnalysis';

// ============================================================
// TYPES
// ============================================================

export interface CommitMessageOptions {
  style?: 'conventional' | 'semantic' | 'descriptive';
  maxLength?: number;
  includeBody?: boolean;
  includeFooter?: boolean;
  ticketPrefix?: string;
}

export interface CommitMessage {
  subject: string;
  body?: string;
  footer?: string;
  type?: string;
  scope?: string;
  breaking?: boolean;
  fullMessage: string;
}

export interface InlineComment {
  line: number;
  comment: string;
  type: 'explanation' | 'warning' | 'todo' | 'note';
  complexity?: number;
}

export interface CodeDocumentation {
  summary: string;
  description: string;
  params?: Array<{ name: string; type: string; description: string }>;
  returns?: { type: string; description: string };
  throws?: Array<{ type: string; description: string }>;
  examples?: string[];
  since?: string;
  deprecated?: string;
  see?: string[];
}

export interface ActionExplanation {
  action: string;
  rationale: string;
  impact: string;
  alternatives?: string[];
  risks?: string[];
  confidence: number;
}

export interface DocumentationUpdate {
  file: string;
  section: string;
  oldContent?: string;
  newContent: string;
  changeType: 'add' | 'modify' | 'remove';
  reason: string;
}

export interface PRDescription {
  title: string;
  summary: string;
  changes: string[];
  testing?: string;
  screenshots?: string[];
  checklist?: string[];
  reviewers?: string[];
  labels?: string[];
}

export interface ComplexityThreshold {
  cyclomaticComplexity: number;
  linesOfCode: number;
  nestedDepth: number;
  parameterCount: number;
}

// ============================================================
// COMMIT MESSAGE GENERATOR
// ============================================================

export class CommitMessageGenerator {
  private groq: Groq | null = null;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      this.groq = new Groq({ apiKey });
    }
  }

  /**
   * Generate a commit message from diff content
   */
  async generateFromDiff(
    diffContent: string,
    options: CommitMessageOptions = {}
  ): Promise<CommitMessage> {
    const {
      style = 'conventional',
      maxLength = 72,
      includeBody = true,
      includeFooter = false,
      ticketPrefix,
    } = options;

    const diffs = DiffParser.parse(diffContent);
    const analysis = this.analyzeDiffs(diffs);

    // Try LLM-based generation first
    if (this.groq) {
      try {
        return await this.generateWithLLM(analysis, options);
      } catch (error) {
        console.warn('LLM commit message generation failed, falling back to rule-based:', error);
      }
    }

    // Fallback to rule-based generation
    return this.generateRuleBased(analysis, options);
  }

  /**
   * Generate commit message from file changes
   */
  async generateFromChanges(
    changes: Array<{ path: string; oldContent: string; newContent: string }>,
    options: CommitMessageOptions = {}
  ): Promise<CommitMessage> {
    // Generate diffs for all changes
    const diffs: string[] = [];
    for (const change of changes) {
      const diff = DiffParser.generate(change.oldContent, change.newContent, change.path);
      if (diff) {
        diffs.push(diff);
      }
    }

    return this.generateFromDiff(diffs.join('\n'), options);
  }

  private analyzeDiffs(diffs: UnifiedDiff[]): DiffAnalysis {
    const analysis: DiffAnalysis = {
      filesChanged: diffs.length,
      totalAdditions: 0,
      totalDeletions: 0,
      fileTypes: new Set<string>(),
      changeTypes: new Set<string>(),
      affectedAreas: new Set<string>(),
      significantChanges: [],
    };

    for (const diff of diffs) {
      // Count additions and deletions
      for (const hunk of diff.hunks) {
        for (const change of hunk.changes) {
          if (change.type === 'add') analysis.totalAdditions++;
          if (change.type === 'remove') analysis.totalDeletions++;
        }
      }

      // Extract file extension
      const ext = diff.newFile.split('.').pop()?.toLowerCase() || '';
      analysis.fileTypes.add(ext);

      // Determine affected area from path
      const pathParts = diff.newFile.split('/');
      if (pathParts.length > 1) {
        analysis.affectedAreas.add(pathParts[0]);
        if (pathParts.length > 2) {
          analysis.affectedAreas.add(`${pathParts[0]}/${pathParts[1]}`);
        }
      }

      // Detect change types
      this.detectChangeTypes(diff, analysis);
    }

    return analysis;
  }

  private detectChangeTypes(diff: UnifiedDiff, analysis: DiffAnalysis): void {
    const filePath = diff.newFile.toLowerCase();
    const allChanges = diff.hunks.flatMap(h => h.changes);
    const addedLines = allChanges.filter(c => c.type === 'add').map(c => c.content);
    const removedLines = allChanges.filter(c => c.type === 'remove').map(c => c.content);

    // New file detection
    if (diff.oldFile === '/dev/null' || !removedLines.length) {
      analysis.changeTypes.add('new-file');
    }

    // Deletion detection
    if (diff.newFile === '/dev/null' || !addedLines.length) {
      analysis.changeTypes.add('delete-file');
    }

    // Feature detection
    const featurePatterns = [
      /export\s+(async\s+)?function/,
      /export\s+class/,
      /export\s+const\s+\w+\s*=/,
      /\.add(Route|Endpoint|Handler)/,
    ];
    if (addedLines.some(line => featurePatterns.some(p => p.test(line)))) {
      analysis.changeTypes.add('feature');
    }

    // Bug fix detection
    const fixPatterns = [
      /fix(ed)?/i,
      /bug/i,
      /error/i,
      /issue/i,
      /\?\./,  // Optional chaining (often a fix)
      /\?\?/,  // Nullish coalescing (often a fix)
      /catch\s*\(/,
    ];
    if (addedLines.some(line => fixPatterns.some(p => p.test(line)))) {
      analysis.changeTypes.add('fix');
    }

    // Refactor detection
    if (analysis.totalAdditions > 0 && analysis.totalDeletions > 0 &&
        Math.abs(analysis.totalAdditions - analysis.totalDeletions) < Math.max(analysis.totalAdditions, analysis.totalDeletions) * 0.3) {
      analysis.changeTypes.add('refactor');
    }

    // Test detection
    if (filePath.includes('test') || filePath.includes('spec')) {
      analysis.changeTypes.add('test');
    }

    // Documentation detection
    if (filePath.endsWith('.md') || filePath.includes('doc')) {
      analysis.changeTypes.add('docs');
    }

    // Style/formatting detection
    if (filePath.includes('eslint') || filePath.includes('prettier') || filePath.includes('style')) {
      analysis.changeTypes.add('style');
    }

    // Configuration detection
    if (filePath.includes('config') || filePath.endsWith('.json') || filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      analysis.changeTypes.add('chore');
    }

    // Extract significant changes
    const significantPatterns = [
      { pattern: /export\s+(?:async\s+)?function\s+(\w+)/, type: 'function' },
      { pattern: /export\s+class\s+(\w+)/, type: 'class' },
      { pattern: /export\s+interface\s+(\w+)/, type: 'interface' },
      { pattern: /export\s+type\s+(\w+)/, type: 'type' },
    ];

    for (const line of addedLines) {
      for (const { pattern, type } of significantPatterns) {
        const match = line.match(pattern);
        if (match) {
          analysis.significantChanges.push({
            type,
            name: match[1],
            file: diff.newFile,
          });
        }
      }
    }
  }

  private async generateWithLLM(
    analysis: DiffAnalysis,
    options: CommitMessageOptions
  ): Promise<CommitMessage> {
    const prompt = this.buildLLMPrompt(analysis, options);

    const completion = await this.groq!.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a senior software engineer writing commit messages. Generate clear, concise commit messages following ${options.style || 'conventional'} commit style.

Format for conventional commits: <type>(<scope>): <subject>
Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert

Rules:
- Subject line max ${options.maxLength || 72} characters
- Use imperative mood ("add" not "added")
- No period at end of subject
- Be specific about what changed
- Body should explain WHY, not just WHAT`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(content);
      return this.formatCommitMessage(parsed, options);
    } catch {
      // Parse as plain text if JSON fails
      return this.parseTextCommitMessage(content, options);
    }
  }

  private buildLLMPrompt(analysis: DiffAnalysis, options: CommitMessageOptions): string {
    const changeTypePriority = ['feat', 'fix', 'refactor', 'test', 'docs', 'style', 'chore'];
    const primaryType = changeTypePriority.find(t => 
      analysis.changeTypes.has(t) || 
      analysis.changeTypes.has(t === 'feat' ? 'feature' : t)
    ) || 'chore';

    let prompt = `Generate a commit message for the following changes:

Files Changed: ${analysis.filesChanged}
Lines Added: ${analysis.totalAdditions}
Lines Removed: ${analysis.totalDeletions}
File Types: ${Array.from(analysis.fileTypes).join(', ')}
Affected Areas: ${Array.from(analysis.affectedAreas).join(', ')}
Primary Change Type: ${primaryType}`;

    if (analysis.significantChanges.length > 0) {
      prompt += `\n\nSignificant Changes:`;
      for (const change of analysis.significantChanges.slice(0, 5)) {
        prompt += `\n- ${change.type}: ${change.name} in ${change.file}`;
      }
    }

    if (options.ticketPrefix) {
      prompt += `\n\nInclude ticket reference: ${options.ticketPrefix}`;
    }

    prompt += `\n\nRespond with JSON: {"type": "...", "scope": "...", "subject": "...", "body": "...", "breaking": false}`;

    return prompt;
  }

  private generateRuleBased(
    analysis: DiffAnalysis,
    options: CommitMessageOptions
  ): CommitMessage {
    // Determine commit type
    let type = 'chore';
    if (analysis.changeTypes.has('feature') || analysis.changeTypes.has('new-file')) {
      type = 'feat';
    } else if (analysis.changeTypes.has('fix')) {
      type = 'fix';
    } else if (analysis.changeTypes.has('refactor')) {
      type = 'refactor';
    } else if (analysis.changeTypes.has('test')) {
      type = 'test';
    } else if (analysis.changeTypes.has('docs')) {
      type = 'docs';
    } else if (analysis.changeTypes.has('style')) {
      type = 'style';
    }

    // Determine scope
    const scope = analysis.affectedAreas.size === 1
      ? Array.from(analysis.affectedAreas)[0].split('/').pop()
      : analysis.affectedAreas.size > 1
        ? 'multiple'
        : undefined;

    // Generate subject
    let subject: string;
    if (analysis.significantChanges.length > 0) {
      const primary = analysis.significantChanges[0];
      subject = `add ${primary.name} ${primary.type}`;
      if (analysis.significantChanges.length > 1) {
        subject += ` and ${analysis.significantChanges.length - 1} more`;
      }
    } else if (analysis.changeTypes.has('delete-file')) {
      subject = `remove ${analysis.filesChanged} file(s)`;
    } else {
      subject = `update ${Array.from(analysis.affectedAreas).join(', ') || 'files'}`;
    }

    // Ensure subject fits max length
    const maxSubjectLength = (options.maxLength || 72) - (scope ? scope.length + 4 : 0) - type.length - 2;
    if (subject.length > maxSubjectLength) {
      subject = subject.substring(0, maxSubjectLength - 3) + '...';
    }

    // Generate body
    let body: string | undefined;
    if (options.includeBody) {
      const bodyParts: string[] = [];
      bodyParts.push(`Changed ${analysis.filesChanged} file(s)`);
      bodyParts.push(`+${analysis.totalAdditions} -${analysis.totalDeletions} lines`);
      
      if (analysis.significantChanges.length > 0) {
        bodyParts.push('');
        bodyParts.push('Changes:');
        for (const change of analysis.significantChanges.slice(0, 5)) {
          bodyParts.push(`- ${change.type}: ${change.name}`);
        }
      }
      
      body = bodyParts.join('\n');
    }

    return this.formatCommitMessage({ type, scope, subject, body }, options);
  }

  private formatCommitMessage(
    parsed: { type?: string; scope?: string; subject?: string; body?: string; breaking?: boolean },
    options: CommitMessageOptions
  ): CommitMessage {
    const type = parsed.type || 'chore';
    const scope = parsed.scope;
    const subject = parsed.subject || 'update code';
    const body = options.includeBody ? parsed.body : undefined;
    const breaking = parsed.breaking || false;

    let fullMessage: string;
    if (options.style === 'conventional') {
      fullMessage = scope
        ? `${type}(${scope})${breaking ? '!' : ''}: ${subject}`
        : `${type}${breaking ? '!' : ''}: ${subject}`;
    } else if (options.style === 'semantic') {
      fullMessage = `${type.toUpperCase()}: ${subject}`;
    } else {
      fullMessage = subject.charAt(0).toUpperCase() + subject.slice(1);
    }

    if (body) {
      fullMessage += `\n\n${body}`;
    }

    if (options.ticketPrefix) {
      fullMessage += `\n\nRef: ${options.ticketPrefix}`;
    }

    return {
      subject: fullMessage.split('\n')[0],
      body,
      type,
      scope,
      breaking,
      fullMessage,
    };
  }

  private parseTextCommitMessage(text: string, options: CommitMessageOptions): CommitMessage {
    const lines = text.trim().split('\n');
    const subject = lines[0] || 'update code';
    const body = lines.slice(2).join('\n') || undefined;

    return {
      subject,
      body,
      fullMessage: text.trim(),
    };
  }
}

interface DiffAnalysis {
  filesChanged: number;
  totalAdditions: number;
  totalDeletions: number;
  fileTypes: Set<string>;
  changeTypes: Set<string>;
  affectedAreas: Set<string>;
  significantChanges: Array<{ type: string; name: string; file: string }>;
}

// ============================================================
// INLINE COMMENT GENERATOR
// ============================================================

export class InlineCommentGenerator {
  private groq: Groq | null = null;
  private defaultThresholds: ComplexityThreshold = {
    cyclomaticComplexity: 5,
    linesOfCode: 30,
    nestedDepth: 3,
    parameterCount: 4,
  };

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      this.groq = new Groq({ apiKey });
    }
  }

  /**
   * Generate inline comments for complex code sections
   */
  async generateForFile(
    filePath: string,
    content: string,
    thresholds: Partial<ComplexityThreshold> = {}
  ): Promise<InlineComment[]> {
    const mergedThresholds = { ...this.defaultThresholds, ...thresholds };
    
    // Analyze the file
    codeAnalyzer.clear();
    codeAnalyzer.addFiles([{ path: filePath, content }]);
    const analysis = codeAnalyzer.analyzeFile(filePath);

    // Find complex sections
    const complexSections = this.findComplexSections(analysis, content, mergedThresholds);

    // Generate comments for complex sections
    const comments: InlineComment[] = [];
    
    for (const section of complexSections) {
      const comment = await this.generateComment(section, content);
      if (comment) {
        comments.push(comment);
      }
    }

    return comments;
  }

  /**
   * Generate comment for a specific function
   */
  async generateForFunction(
    functionCode: string,
    functionName: string,
    context?: string
  ): Promise<string> {
    if (!this.groq) {
      return this.generateRuleBasedComment(functionCode, functionName);
    }

    try {
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are a code documentation expert. Generate clear, concise inline comments that explain complex logic. Focus on WHY, not WHAT. Use JSDoc format for function documentation.`,
          },
          {
            role: 'user',
            content: `Generate documentation for this function:\n\n${context ? `Context: ${context}\n\n` : ''}Function:\n${functionCode}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      return completion.choices[0]?.message?.content || this.generateRuleBasedComment(functionCode, functionName);
    } catch {
      return this.generateRuleBasedComment(functionCode, functionName);
    }
  }

  private findComplexSections(
    analysis: CodeAnalysisResult,
    content: string,
    thresholds: ComplexityThreshold
  ): ComplexSection[] {
    const sections: ComplexSection[] = [];
    const lines = content.split('\n');

    for (const entity of analysis.entities) {
      if (entity.type === 'function' || entity.type === 'method') {
        const isComplex = 
          (entity.complexity && entity.complexity > thresholds.cyclomaticComplexity) ||
          (entity.endLine && entity.endLine - entity.startLine > thresholds.linesOfCode) ||
          (entity.parameters && entity.parameters.length > thresholds.parameterCount);

        if (isComplex) {
          sections.push({
            entity,
            startLine: entity.startLine,
            endLine: entity.endLine || entity.startLine,
            code: lines.slice(entity.startLine - 1, entity.endLine || entity.startLine).join('\n'),
            complexity: entity.complexity,
          });
        }
      }
    }

    // Also find deeply nested blocks
    const nestedBlocks = this.findDeeplyNestedBlocks(content, thresholds.nestedDepth);
    for (const block of nestedBlocks) {
      if (!sections.some(s => s.startLine <= block.line && s.endLine >= block.line)) {
        sections.push({
          startLine: block.line,
          endLine: block.line,
          code: lines[block.line - 1],
          complexity: block.depth,
          isNestedBlock: true,
        });
      }
    }

    return sections;
  }

  private findDeeplyNestedBlocks(content: string, maxDepth: number): Array<{ line: number; depth: number }> {
    const lines = content.split('\n');
    const deepBlocks: Array<{ line: number; depth: number }> = [];
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const opens = (line.match(/[{(\[]/g) || []).length;
      const closes = (line.match(/[})\]]/g) || []).length;
      
      depth += opens - closes;
      
      if (depth > maxDepth) {
        deepBlocks.push({ line: i + 1, depth });
      }
    }

    return deepBlocks;
  }

  private async generateComment(section: ComplexSection, fullContent: string): Promise<InlineComment | null> {
    if (this.groq && section.entity) {
      try {
        const completion = await this.groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Generate a brief inline comment (1-2 sentences) explaining the purpose and complexity of this code. Focus on WHY it\'s complex and what it accomplishes.',
            },
            {
              role: 'user',
              content: `Code:\n${section.code}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 100,
        });

        const comment = completion.choices[0]?.message?.content?.trim() || '';
        if (comment) {
          return {
            line: section.startLine,
            comment,
            type: section.complexity && section.complexity > 10 ? 'warning' : 'explanation',
            complexity: section.complexity,
          };
        }
      } catch {
        // Fall through to rule-based
      }
    }

    // Rule-based comment generation
    if (section.entity) {
      const type = section.complexity && section.complexity > 10 ? 'warning' : 'explanation';
      let comment = '';

      if (section.complexity && section.complexity > 10) {
        comment = `High complexity (${section.complexity}). Consider refactoring into smaller functions.`;
      } else if (section.isNestedBlock) {
        comment = `Deeply nested block. Consider extracting to separate function for readability.`;
      } else if (section.entity.parameters && section.entity.parameters.length > 4) {
        comment = `Many parameters (${section.entity.parameters.length}). Consider using an options object.`;
      } else {
        comment = `Complex function handling ${section.entity.name} logic.`;
      }

      return {
        line: section.startLine,
        comment,
        type,
        complexity: section.complexity,
      };
    }

    return null;
  }

  private generateRuleBasedComment(code: string, name: string): string {
    const lines = code.split('\n');
    const params = code.match(/\(([^)]*)\)/)?.[1] || '';
    const isAsync = code.includes('async');
    const returns = code.includes('return ');

    let doc = '/**\n';
    doc += ` * ${name}\n`;
    
    if (isAsync) {
      doc += ' * @async\n';
    }

    if (params.trim()) {
      const paramList = params.split(',').map(p => p.trim()).filter(Boolean);
      for (const param of paramList) {
        const paramName = param.split(':')[0].trim().replace(/[?=].*/, '');
        if (paramName) {
          doc += ` * @param {*} ${paramName}\n`;
        }
      }
    }

    if (returns) {
      doc += ' * @returns {*}\n';
    }

    doc += ' */';
    return doc;
  }
}

interface ComplexSection {
  entity?: CodeEntity;
  startLine: number;
  endLine: number;
  code: string;
  complexity?: number;
  isNestedBlock?: boolean;
}

// ============================================================
// ACTION EXPLANATION GENERATOR
// ============================================================

export class ActionExplanationGenerator {
  private groq: Groq | null = null;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      this.groq = new Groq({ apiKey });
    }
  }

  /**
   * Generate explanation for a code action
   */
  async explainAction(
    action: string,
    context: {
      task?: string;
      previousActions?: string[];
      codeContext?: string;
      files?: string[];
    } = {}
  ): Promise<ActionExplanation> {
    if (this.groq) {
      try {
        return await this.explainWithLLM(action, context);
      } catch {
        // Fall through to rule-based
      }
    }

    return this.explainRuleBased(action, context);
  }

  /**
   * Generate explanation for a sequence of actions
   */
  async explainActionSequence(
    actions: string[],
    context: { task?: string; codeContext?: string } = {}
  ): Promise<{ summary: string; steps: ActionExplanation[] }> {
    const steps: ActionExplanation[] = [];
    
    for (let i = 0; i < actions.length; i++) {
      const explanation = await this.explainAction(actions[i], {
        ...context,
        previousActions: actions.slice(0, i),
      });
      steps.push(explanation);
    }

    const summary = this.summarizeActions(steps);

    return { summary, steps };
  }

  private async explainWithLLM(
    action: string,
    context: { task?: string; previousActions?: string[]; codeContext?: string; files?: string[] }
  ): Promise<ActionExplanation> {
    const prompt = `Explain this code action:
Action: ${action}
${context.task ? `Task: ${context.task}` : ''}
${context.previousActions?.length ? `Previous actions: ${context.previousActions.join(' → ')}` : ''}
${context.codeContext ? `Code context: ${context.codeContext.substring(0, 500)}...` : ''}

Respond with JSON:
{
  "rationale": "why this action is being taken",
  "impact": "what this action changes",
  "alternatives": ["alternative approaches"],
  "risks": ["potential risks"],
  "confidence": 0.0-1.0
}`;

    const completion = await this.groq!.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a code action explainer. Provide clear, technical explanations for code changes and actions. Be concise but thorough.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(content);
      return {
        action,
        rationale: parsed.rationale || 'Executing requested action',
        impact: parsed.impact || 'Code will be modified',
        alternatives: parsed.alternatives,
        risks: parsed.risks,
        confidence: parsed.confidence || 0.7,
      };
    } catch {
      return this.explainRuleBased(action, context);
    }
  }

  private explainRuleBased(
    action: string,
    context: { task?: string; previousActions?: string[]; codeContext?: string; files?: string[] }
  ): ActionExplanation {
    const actionLower = action.toLowerCase();
    
    // Pattern matching for common actions
    const patterns: Array<{
      match: RegExp;
      rationale: string;
      impact: string;
      risks?: string[];
    }> = [
      {
        match: /^(add|create|insert)/,
        rationale: 'Adding new code to implement functionality',
        impact: 'New code will be added to the codebase',
        risks: ['May introduce new dependencies', 'Could affect existing code'],
      },
      {
        match: /^(edit|modify|update|change)/,
        rationale: 'Modifying existing code to fix or enhance behavior',
        impact: 'Existing functionality will be changed',
        risks: ['May break dependent code', 'Could introduce regressions'],
      },
      {
        match: /^(delete|remove|drop)/,
        rationale: 'Removing code that is no longer needed',
        impact: 'Code will be permanently removed',
        risks: ['May break dependencies', 'Removal is typically irreversible'],
      },
      {
        match: /^(refactor|reorganize|restructure)/,
        rationale: 'Improving code structure without changing behavior',
        impact: 'Code organization will change but functionality remains the same',
        risks: ['May introduce subtle bugs', 'Could affect code coverage'],
      },
      {
        match: /^(fix|repair|correct)/,
        rationale: 'Correcting a bug or issue in the code',
        impact: 'Bug will be fixed and expected behavior restored',
        risks: ['Fix may not address root cause', 'Could introduce new issues'],
      },
      {
        match: /^(test|verify|check)/,
        rationale: 'Validating code behavior or adding tests',
        impact: 'Code quality and reliability will improve',
      },
    ];

    for (const { match, rationale, impact, risks } of patterns) {
      if (match.test(actionLower)) {
        return {
          action,
          rationale,
          impact,
          risks,
          confidence: 0.6,
        };
      }
    }

    return {
      action,
      rationale: 'Executing action as part of the current task',
      impact: 'Code or project state will be modified',
      confidence: 0.5,
    };
  }

  private summarizeActions(steps: ActionExplanation[]): string {
    if (steps.length === 0) return 'No actions performed.';
    if (steps.length === 1) return steps[0].rationale;

    const actionTypes = new Set(steps.map(s => s.action.split(/[:\s]/)[0].toLowerCase()));
    
    if (actionTypes.size === 1) {
      const type = Array.from(actionTypes)[0];
      return `Performed ${steps.length} ${type} operations to complete the task.`;
    }

    return `Completed ${steps.length} actions including ${Array.from(actionTypes).slice(0, 3).join(', ')} to achieve the goal.`;
  }
}

// ============================================================
// DOCUMENTATION UPDATER
// ============================================================

export class DocumentationUpdater {
  private groq: Groq | null = null;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      this.groq = new Groq({ apiKey });
    }
  }

  /**
   * Generate documentation updates based on code changes
   */
  async generateUpdates(
    codeChanges: Array<{ path: string; oldContent: string; newContent: string }>,
    existingDocs: Array<{ path: string; content: string }>
  ): Promise<DocumentationUpdate[]> {
    const updates: DocumentationUpdate[] = [];

    // Analyze code changes
    const changeAnalysis = this.analyzeCodeChanges(codeChanges);

    // For each existing doc file, determine if updates are needed
    for (const doc of existingDocs) {
      const docUpdates = await this.determineUpdates(doc, changeAnalysis);
      updates.push(...docUpdates);
    }

    // Check if new documentation files should be created
    const newDocs = await this.suggestNewDocs(changeAnalysis, existingDocs);
    updates.push(...newDocs);

    return updates;
  }

  /**
   * Update a README file based on code changes
   */
  async updateReadme(
    readmeContent: string,
    codeChanges: Array<{ path: string; oldContent: string; newContent: string }>
  ): Promise<{ updatedContent: string; changes: string[] }> {
    const changeAnalysis = this.analyzeCodeChanges(codeChanges);
    
    if (!this.groq) {
      return this.updateReadmeRuleBased(readmeContent, changeAnalysis);
    }

    try {
      const prompt = `Update this README based on the following code changes:

Code Changes Summary:
${JSON.stringify(changeAnalysis, null, 2)}

Current README:
${readmeContent}

Generate an updated README that incorporates the code changes. Keep the overall structure but update relevant sections. Return JSON:
{
  "updatedContent": "full updated readme",
  "changes": ["list of changes made"]
}`;

      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a technical writer updating documentation. Make minimal, targeted updates that reflect code changes. Preserve formatting and style.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      
      return {
        updatedContent: parsed.updatedContent || readmeContent,
        changes: parsed.changes || [],
      };
    } catch {
      return this.updateReadmeRuleBased(readmeContent, changeAnalysis);
    }
  }

  /**
   * Generate JSDoc/TSDoc for a code entity
   */
  async generateDocumentation(
    code: string,
    entityType: 'function' | 'class' | 'interface' | 'type'
  ): Promise<CodeDocumentation> {
    if (this.groq) {
      try {
        const completion = await this.groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Generate comprehensive documentation for code. Include summary, description, parameters, return values, and examples where appropriate.',
            },
            {
              role: 'user',
              content: `Generate documentation for this ${entityType}:\n\n${code}\n\nRespond with JSON: {"summary": "...", "description": "...", "params": [...], "returns": {...}, "examples": [...]}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 600,
          response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        
        return {
          summary: parsed.summary || 'No summary available',
          description: parsed.description || '',
          params: parsed.params,
          returns: parsed.returns,
          examples: parsed.examples,
        };
      } catch {
        // Fall through
      }
    }

    return this.generateDocumentationRuleBased(code, entityType);
  }

  private analyzeCodeChanges(
    changes: Array<{ path: string; oldContent: string; newContent: string }>
  ): CodeChangeAnalysis {
    const analysis: CodeChangeAnalysis = {
      filesChanged: changes.length,
      addedEntities: [],
      removedEntities: [],
      modifiedEntities: [],
      newExports: [],
      removedExports: [],
      breakingChanges: [],
    };

    for (const change of changes) {
      // Analyze each file change
      const oldExports = this.extractExports(change.oldContent);
      const newExports = this.extractExports(change.newContent);

      for (const exp of newExports) {
        if (!oldExports.includes(exp)) {
          analysis.newExports.push({ file: change.path, name: exp });
          analysis.addedEntities.push({ file: change.path, name: exp, type: 'export' });
        }
      }

      for (const exp of oldExports) {
        if (!newExports.includes(exp)) {
          analysis.removedExports.push({ file: change.path, name: exp });
          analysis.removedEntities.push({ file: change.path, name: exp, type: 'export' });
          analysis.breakingChanges.push(`Removed export: ${exp} from ${change.path}`);
        }
      }
    }

    return analysis;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const patterns = [
      /export\s+(?:async\s+)?function\s+(\w+)/g,
      /export\s+class\s+(\w+)/g,
      /export\s+interface\s+(\w+)/g,
      /export\s+type\s+(\w+)/g,
      /export\s+const\s+(\w+)/g,
      /export\s+{\s*([^}]+)\s*}/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const names = match[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop() || s.trim());
        exports.push(...names.filter(Boolean));
      }
    }

    return exports;
  }

  private async determineUpdates(
    doc: { path: string; content: string },
    changeAnalysis: CodeChangeAnalysis
  ): Promise<DocumentationUpdate[]> {
    const updates: DocumentationUpdate[] = [];
    const docLower = doc.path.toLowerCase();

    // Check if this is a changelog file
    if (docLower.includes('changelog') || docLower.includes('changes')) {
      const newEntry = this.generateChangelogEntry(changeAnalysis);
      if (newEntry) {
        updates.push({
          file: doc.path,
          section: 'Unreleased',
          newContent: newEntry,
          changeType: 'add',
          reason: 'Adding new changes to changelog',
        });
      }
    }

    // Check if this is an API documentation file
    if (docLower.includes('api') || docLower.includes('reference')) {
      for (const added of changeAnalysis.addedEntities) {
        updates.push({
          file: doc.path,
          section: 'API Reference',
          newContent: `### ${added.name}\n\nAdded in ${added.file}`,
          changeType: 'add',
          reason: `New export ${added.name} needs documentation`,
        });
      }

      for (const removed of changeAnalysis.removedEntities) {
        updates.push({
          file: doc.path,
          section: 'API Reference',
          oldContent: removed.name,
          newContent: '',
          changeType: 'remove',
          reason: `Export ${removed.name} was removed`,
        });
      }
    }

    return updates;
  }

  private async suggestNewDocs(
    changeAnalysis: CodeChangeAnalysis,
    existingDocs: Array<{ path: string; content: string }>
  ): Promise<DocumentationUpdate[]> {
    const suggestions: DocumentationUpdate[] = [];
    const hasChangelog = existingDocs.some(d => 
      d.path.toLowerCase().includes('changelog')
    );

    if (!hasChangelog && changeAnalysis.breakingChanges.length > 0) {
      suggestions.push({
        file: 'CHANGELOG.md',
        section: 'New File',
        newContent: this.generateChangelogTemplate(changeAnalysis),
        changeType: 'add',
        reason: 'Breaking changes detected, changelog recommended',
      });
    }

    return suggestions;
  }

  private generateChangelogEntry(analysis: CodeChangeAnalysis): string {
    const parts: string[] = [];

    if (analysis.addedEntities.length > 0) {
      parts.push('### Added');
      for (const entity of analysis.addedEntities) {
        parts.push(`- ${entity.name} (${entity.file})`);
      }
    }

    if (analysis.modifiedEntities.length > 0) {
      parts.push('### Changed');
      for (const entity of analysis.modifiedEntities) {
        parts.push(`- ${entity.name} (${entity.file})`);
      }
    }

    if (analysis.removedEntities.length > 0) {
      parts.push('### Removed');
      for (const entity of analysis.removedEntities) {
        parts.push(`- ${entity.name} (${entity.file})`);
      }
    }

    if (analysis.breakingChanges.length > 0) {
      parts.push('### Breaking Changes');
      for (const change of analysis.breakingChanges) {
        parts.push(`- ${change}`);
      }
    }

    return parts.join('\n');
  }

  private generateChangelogTemplate(analysis: CodeChangeAnalysis): string {
    const today = new Date().toISOString().split('T')[0];
    return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

${this.generateChangelogEntry(analysis)}

## [0.0.1] - ${today}

### Added
- Initial release
`;
  }

  private updateReadmeRuleBased(
    content: string,
    analysis: CodeChangeAnalysis
  ): { updatedContent: string; changes: string[] } {
    const changes: string[] = [];
    let updated = content;

    // Look for API or Features section to update
    if (analysis.addedEntities.length > 0) {
      const apiSection = /## (API|Features|Functions|Exports)[\s\S]*?(?=##|$)/i;
      const match = content.match(apiSection);
      
      if (match) {
        const newItems = analysis.addedEntities
          .map(e => `- \`${e.name}\` - Added in ${e.file}`)
          .join('\n');
        
        const updatedSection = match[0].trimEnd() + '\n' + newItems + '\n';
        updated = content.replace(apiSection, updatedSection);
        changes.push(`Added ${analysis.addedEntities.length} new items to documentation`);
      }
    }

    return { updatedContent: updated, changes };
  }

  private generateDocumentationRuleBased(
    code: string,
    entityType: string
  ): CodeDocumentation {
    const nameMatch = code.match(/(?:function|class|interface|type)\s+(\w+)/);
    const name = nameMatch?.[1] || 'Unknown';

    const params: Array<{ name: string; type: string; description: string }> = [];
    const paramsMatch = code.match(/\(([^)]*)\)/);
    if (paramsMatch) {
      const paramsList = paramsMatch[1].split(',').filter(Boolean);
      for (const param of paramsList) {
        const [pName, pType] = param.split(':').map(s => s.trim());
        if (pName) {
          params.push({
            name: pName.replace(/[?=].*/, ''),
            type: pType || 'any',
            description: '',
          });
        }
      }
    }

    return {
      summary: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${name}`,
      description: `Implements ${name} functionality.`,
      params: params.length > 0 ? params : undefined,
    };
  }
}

interface CodeChangeAnalysis {
  filesChanged: number;
  addedEntities: Array<{ file: string; name: string; type: string }>;
  removedEntities: Array<{ file: string; name: string; type: string }>;
  modifiedEntities: Array<{ file: string; name: string; type: string }>;
  newExports: Array<{ file: string; name: string }>;
  removedExports: Array<{ file: string; name: string }>;
  breakingChanges: string[];
}

// ============================================================
// PR DESCRIPTION GENERATOR
// ============================================================

export class PRDescriptionGenerator {
  private groq: Groq | null = null;
  private commitGenerator: CommitMessageGenerator;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      this.groq = new Groq({ apiKey });
    }
    this.commitGenerator = new CommitMessageGenerator();
  }

  /**
   * Generate a PR description from changes
   */
  async generate(
    changes: Array<{ path: string; oldContent: string; newContent: string }>,
    options: {
      title?: string;
      template?: string;
      includeChecklist?: boolean;
      reviewers?: string[];
    } = {}
  ): Promise<PRDescription> {
    // Generate diffs
    const diffs: string[] = [];
    for (const change of changes) {
      const diff = DiffParser.generate(change.oldContent, change.newContent, change.path);
      if (diff) {
        diffs.push(diff);
      }
    }
    const fullDiff = diffs.join('\n');

    // Get commit message for title
    const commitMsg = await this.commitGenerator.generateFromDiff(fullDiff, { style: 'conventional' });

    if (this.groq) {
      try {
        return await this.generateWithLLM(changes, fullDiff, commitMsg, options);
      } catch {
        // Fall through
      }
    }

    return this.generateRuleBased(changes, fullDiff, commitMsg, options);
  }

  private async generateWithLLM(
    changes: Array<{ path: string; oldContent: string; newContent: string }>,
    diff: string,
    commitMsg: CommitMessage,
    options: {
      title?: string;
      template?: string;
      includeChecklist?: boolean;
      reviewers?: string[];
    }
  ): Promise<PRDescription> {
    const prompt = `Generate a PR description for these changes:

Diff Summary:
- Files changed: ${changes.length}
- Commit: ${commitMsg.subject}

Changed files: ${changes.map(c => c.path).join(', ')}

Respond with JSON:
{
  "title": "PR title",
  "summary": "Brief summary of changes",
  "changes": ["List of specific changes"],
  "testing": "How to test these changes",
  "checklist": ["Checklist items"],
  "labels": ["suggested labels"]
}`;

    const completion = await this.groq!.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'Generate clear, professional PR descriptions. Be specific about changes and testing requirements.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      title: options.title || parsed.title || commitMsg.subject,
      summary: parsed.summary || '',
      changes: parsed.changes || [],
      testing: parsed.testing,
      checklist: options.includeChecklist ? (parsed.checklist || this.getDefaultChecklist()) : undefined,
      reviewers: options.reviewers,
      labels: parsed.labels,
    };
  }

  private generateRuleBased(
    changes: Array<{ path: string; oldContent: string; newContent: string }>,
    diff: string,
    commitMsg: CommitMessage,
    options: {
      title?: string;
      template?: string;
      includeChecklist?: boolean;
      reviewers?: string[];
    }
  ): PRDescription {
    const changeList = changes.map(c => {
      const ext = c.path.split('.').pop();
      const isNew = !c.oldContent.trim();
      const isDelete = !c.newContent.trim();
      
      if (isNew) return `Added \`${c.path}\``;
      if (isDelete) return `Removed \`${c.path}\``;
      return `Modified \`${c.path}\``;
    });

    return {
      title: options.title || commitMsg.subject,
      summary: commitMsg.body || `This PR includes changes to ${changes.length} file(s).`,
      changes: changeList,
      testing: 'Please review the changes and run relevant tests.',
      checklist: options.includeChecklist ? this.getDefaultChecklist() : undefined,
      reviewers: options.reviewers,
      labels: this.suggestLabels(changes, commitMsg),
    };
  }

  private getDefaultChecklist(): string[] {
    return [
      'Code follows project style guidelines',
      'Tests have been added/updated',
      'Documentation has been updated',
      'No new warnings introduced',
      'Self-review completed',
    ];
  }

  private suggestLabels(
    changes: Array<{ path: string; oldContent: string; newContent: string }>,
    commitMsg: CommitMessage
  ): string[] {
    const labels: string[] = [];

    if (commitMsg.type) {
      labels.push(commitMsg.type);
    }

    if (commitMsg.breaking) {
      labels.push('breaking-change');
    }

    const fileTypes = new Set(changes.map(c => c.path.split('.').pop()));
    if (fileTypes.has('test') || fileTypes.has('spec')) {
      labels.push('tests');
    }
    if (fileTypes.has('md')) {
      labels.push('documentation');
    }

    return labels;
  }
}

// ============================================================
// MAIN DOCUMENTATION GENERATOR CLASS
// ============================================================

export class DocumentationGenerator {
  public commitMessageGenerator: CommitMessageGenerator;
  public inlineCommentGenerator: InlineCommentGenerator;
  public actionExplanationGenerator: ActionExplanationGenerator;
  public documentationUpdater: DocumentationUpdater;
  public prDescriptionGenerator: PRDescriptionGenerator;

  constructor() {
    this.commitMessageGenerator = new CommitMessageGenerator();
    this.inlineCommentGenerator = new InlineCommentGenerator();
    this.actionExplanationGenerator = new ActionExplanationGenerator();
    this.documentationUpdater = new DocumentationUpdater();
    this.prDescriptionGenerator = new PRDescriptionGenerator();
  }

  /**
   * Generate commit message from diff
   */
  async generateCommitMessage(
    diffContent: string,
    options?: CommitMessageOptions
  ): Promise<CommitMessage> {
    return this.commitMessageGenerator.generateFromDiff(diffContent, options);
  }

  /**
   * Generate commit message from file changes
   */
  async generateCommitMessageFromChanges(
    changes: Array<{ path: string; oldContent: string; newContent: string }>,
    options?: CommitMessageOptions
  ): Promise<CommitMessage> {
    return this.commitMessageGenerator.generateFromChanges(changes, options);
  }

  /**
   * Generate inline comments for complex code
   */
  async generateInlineComments(
    filePath: string,
    content: string,
    thresholds?: Partial<ComplexityThreshold>
  ): Promise<InlineComment[]> {
    return this.inlineCommentGenerator.generateForFile(filePath, content, thresholds);
  }

  /**
   * Generate documentation for a function
   */
  async generateFunctionDoc(
    functionCode: string,
    functionName: string,
    context?: string
  ): Promise<string> {
    return this.inlineCommentGenerator.generateForFunction(functionCode, functionName, context);
  }

  /**
   * Explain a code action
   */
  async explainAction(
    action: string,
    context?: { task?: string; previousActions?: string[]; codeContext?: string; files?: string[] }
  ): Promise<ActionExplanation> {
    return this.actionExplanationGenerator.explainAction(action, context);
  }

  /**
   * Explain a sequence of actions
   */
  async explainActionSequence(
    actions: string[],
    context?: { task?: string; codeContext?: string }
  ): Promise<{ summary: string; steps: ActionExplanation[] }> {
    return this.actionExplanationGenerator.explainActionSequence(actions, context);
  }

  /**
   * Generate documentation updates
   */
  async generateDocUpdates(
    codeChanges: Array<{ path: string; oldContent: string; newContent: string }>,
    existingDocs: Array<{ path: string; content: string }>
  ): Promise<DocumentationUpdate[]> {
    return this.documentationUpdater.generateUpdates(codeChanges, existingDocs);
  }

  /**
   * Update README based on code changes
   */
  async updateReadme(
    readmeContent: string,
    codeChanges: Array<{ path: string; oldContent: string; newContent: string }>
  ): Promise<{ updatedContent: string; changes: string[] }> {
    return this.documentationUpdater.updateReadme(readmeContent, codeChanges);
  }

  /**
   * Generate code documentation (JSDoc/TSDoc)
   */
  async generateCodeDocumentation(
    code: string,
    entityType: 'function' | 'class' | 'interface' | 'type'
  ): Promise<CodeDocumentation> {
    return this.documentationUpdater.generateDocumentation(code, entityType);
  }

  /**
   * Generate PR description
   */
  async generatePRDescription(
    changes: Array<{ path: string; oldContent: string; newContent: string }>,
    options?: {
      title?: string;
      template?: string;
      includeChecklist?: boolean;
      reviewers?: string[];
    }
  ): Promise<PRDescription> {
    return this.prDescriptionGenerator.generate(changes, options);
  }
}

// Singleton export
export const documentationGenerator = new DocumentationGenerator();
