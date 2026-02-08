/**
 * Diff-Based Code Editor
 * 
 * Provides surgical, incremental code editing capabilities:
 * - Unified diff parsing and application
 * - AST-aware code modifications (insert function, modify class, etc.)
 * - Edit validation with syntax checking
 * - Multi-file atomic commits
 * - Line-range based editing
 */

import { Project, SourceFile, SyntaxKind, Node, FunctionDeclaration, ClassDeclaration, ts } from 'ts-morph';

// ============================================================
// TYPES
// ============================================================

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
  header?: string;
}

export interface DiffChange {
  type: 'context' | 'add' | 'remove';
  content: string;
  lineNumber?: number;
}

export interface UnifiedDiff {
  oldFile: string;
  newFile: string;
  hunks: DiffHunk[];
}

export interface EditOperation {
  type: 'insert' | 'delete' | 'replace' | 'insertAfter' | 'insertBefore';
  target: LineRange | EntityTarget;
  content?: string;
}

export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface EntityTarget {
  entityType: 'function' | 'class' | 'method' | 'import' | 'export' | 'variable' | 'interface' | 'type';
  entityName: string;
  memberName?: string; // For class members
}

export interface EditResult {
  success: boolean;
  content?: string;
  diff?: string;
  error?: string;
  validationErrors?: ValidationError[];
}

export interface ValidationError {
  type: 'syntax' | 'type' | 'semantic';
  message: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface MultiFileEdit {
  files: Array<{
    path: string;
    operations: EditOperation[];
  }>;
  commitMessage?: string;
}

export interface MultiFileEditResult {
  success: boolean;
  results: Map<string, EditResult>;
  errors?: string[];
  rollbackAvailable: boolean;
}

export interface ASTModification {
  type: 'insertFunction' | 'insertClass' | 'insertMethod' | 'insertImport' | 
        'modifyFunction' | 'modifyClass' | 'deleteEntity' | 'renameEntity' |
        'insertProperty' | 'insertParameter' | 'wrapInTryCatch';
  target?: string;
  code?: string;
  newName?: string;
  position?: 'before' | 'after' | 'start' | 'end';
  relativeTo?: string;
}

// ============================================================
// UNIFIED DIFF PARSER
// ============================================================

export class DiffParser {
  /**
   * Parse a unified diff string into structured format
   */
  static parse(diffText: string): UnifiedDiff[] {
    const diffs: UnifiedDiff[] = [];
    const lines = diffText.split('\n');
    
    let currentDiff: UnifiedDiff | null = null;
    let currentHunk: DiffHunk | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // File headers
      if (line.startsWith('--- ')) {
        if (currentDiff && currentHunk) {
          currentDiff.hunks.push(currentHunk);
        }
        if (currentDiff) {
          diffs.push(currentDiff);
        }
        currentDiff = {
          oldFile: line.slice(4).replace(/^[ab]\//, '').split('\t')[0],
          newFile: '',
          hunks: [],
        };
        currentHunk = null;
      } else if (line.startsWith('+++ ') && currentDiff) {
        currentDiff.newFile = line.slice(4).replace(/^[ab]\//, '').split('\t')[0];
      }
      // Hunk header: @@ -start,count +start,count @@
      else if (line.startsWith('@@')) {
        if (currentDiff && currentHunk) {
          currentDiff.hunks.push(currentHunk);
        }
        
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?/);
        if (match && currentDiff) {
          oldLineNum = parseInt(match[1], 10);
          newLineNum = parseInt(match[3], 10);
          currentHunk = {
            oldStart: oldLineNum,
            oldLines: parseInt(match[2] || '1', 10),
            newStart: newLineNum,
            newLines: parseInt(match[4] || '1', 10),
            changes: [],
            header: match[5]?.trim(),
          };
        }
      }
      // Diff content
      else if (currentHunk) {
        if (line.startsWith('+')) {
          currentHunk.changes.push({
            type: 'add',
            content: line.slice(1),
            lineNumber: newLineNum++,
          });
        } else if (line.startsWith('-')) {
          currentHunk.changes.push({
            type: 'remove',
            content: line.slice(1),
            lineNumber: oldLineNum++,
          });
        } else if (line.startsWith(' ') || line === '') {
          currentHunk.changes.push({
            type: 'context',
            content: line.startsWith(' ') ? line.slice(1) : line,
            lineNumber: oldLineNum,
          });
          oldLineNum++;
          newLineNum++;
        }
      }
    }
    
    // Push final hunk and diff
    if (currentDiff && currentHunk) {
      currentDiff.hunks.push(currentHunk);
    }
    if (currentDiff) {
      diffs.push(currentDiff);
    }
    
    return diffs;
  }
  
  /**
   * Generate a unified diff from two strings
   */
  static generate(oldContent: string, newContent: string, filePath: string = 'file'): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Use Myers diff algorithm (simplified LCS-based)
    const diff = this.computeDiff(oldLines, newLines);
    
    if (diff.length === 0) {
      return ''; // No changes
    }
    
    const output: string[] = [];
    output.push(`--- a/${filePath}`);
    output.push(`+++ b/${filePath}`);
    
    // Group changes into hunks
    const hunks = this.groupIntoHunks(diff, oldLines, newLines);
    
    for (const hunk of hunks) {
      output.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      output.push(...hunk.changes.map(c => {
        if (c.type === 'add') return `+${c.content}`;
        if (c.type === 'remove') return `-${c.content}`;
        return ` ${c.content}`;
      }));
    }
    
    return output.join('\n');
  }
  
  private static computeDiff(oldLines: string[], newLines: string[]): Array<{
    type: 'equal' | 'insert' | 'delete';
    oldIndex: number;
    newIndex: number;
    line: string;
  }> {
    // Build LCS table
    const m = oldLines.length;
    const n = newLines.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    // Backtrack to find diff
    const diff: Array<{ type: 'equal' | 'insert' | 'delete'; oldIndex: number; newIndex: number; line: string }> = [];
    let i = m, j = n;
    
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        diff.unshift({ type: 'equal', oldIndex: i - 1, newIndex: j - 1, line: oldLines[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({ type: 'insert', oldIndex: i, newIndex: j - 1, line: newLines[j - 1] });
        j--;
      } else if (i > 0) {
        diff.unshift({ type: 'delete', oldIndex: i - 1, newIndex: j, line: oldLines[i - 1] });
        i--;
      }
    }
    
    return diff;
  }
  
  private static groupIntoHunks(
    diff: Array<{ type: 'equal' | 'insert' | 'delete'; oldIndex: number; newIndex: number; line: string }>,
    oldLines: string[],
    newLines: string[]
  ): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const contextLines = 3;
    
    let hunkStart = -1;
    let currentHunk: DiffHunk | null = null;
    let lastChangeIndex = -1;
    
    for (let i = 0; i < diff.length; i++) {
      const entry = diff[i];
      
      if (entry.type !== 'equal') {
        if (currentHunk === null || i - lastChangeIndex > contextLines * 2) {
          // Start new hunk
          if (currentHunk) {
            // Add trailing context to previous hunk
            for (let c = lastChangeIndex + 1; c < Math.min(lastChangeIndex + contextLines + 1, diff.length); c++) {
              if (diff[c].type === 'equal') {
                currentHunk.changes.push({ type: 'context', content: diff[c].line });
                currentHunk.oldLines++;
                currentHunk.newLines++;
              }
            }
            hunks.push(currentHunk);
          }
          
          // Start new hunk with leading context
          const contextStart = Math.max(0, i - contextLines);
          currentHunk = {
            oldStart: diff[contextStart].oldIndex + 1,
            oldLines: 0,
            newStart: diff[contextStart].newIndex + 1,
            newLines: 0,
            changes: [],
          };
          
          // Add leading context
          for (let c = contextStart; c < i; c++) {
            if (diff[c].type === 'equal') {
              currentHunk.changes.push({ type: 'context', content: diff[c].line });
              currentHunk.oldLines++;
              currentHunk.newLines++;
            }
          }
        } else if (lastChangeIndex >= 0) {
          // Add intervening context
          for (let c = lastChangeIndex + 1; c < i; c++) {
            if (diff[c].type === 'equal' && currentHunk) {
              currentHunk.changes.push({ type: 'context', content: diff[c].line });
              currentHunk.oldLines++;
              currentHunk.newLines++;
            }
          }
        }
        
        // Add the change
        if (currentHunk) {
          if (entry.type === 'delete') {
            currentHunk.changes.push({ type: 'remove', content: entry.line });
            currentHunk.oldLines++;
          } else {
            currentHunk.changes.push({ type: 'add', content: entry.line });
            currentHunk.newLines++;
          }
        }
        
        lastChangeIndex = i;
      }
    }
    
    // Finish last hunk
    if (currentHunk) {
      for (let c = lastChangeIndex + 1; c < Math.min(lastChangeIndex + contextLines + 1, diff.length); c++) {
        if (diff[c].type === 'equal') {
          currentHunk.changes.push({ type: 'context', content: diff[c].line });
          currentHunk.oldLines++;
          currentHunk.newLines++;
        }
      }
      hunks.push(currentHunk);
    }
    
    return hunks;
  }
}

// ============================================================
// DIFF APPLIER
// ============================================================

export class DiffApplier {
  /**
   * Apply a parsed diff to content
   */
  static apply(content: string, diff: UnifiedDiff): EditResult {
    const lines = content.split('\n');
    
    // Apply hunks in reverse order to preserve line numbers
    const sortedHunks = [...diff.hunks].sort((a, b) => b.oldStart - a.oldStart);
    
    for (const hunk of sortedHunks) {
      const result = this.applyHunk(lines, hunk);
      if (!result.success) {
        return result;
      }
    }
    
    return {
      success: true,
      content: lines.join('\n'),
    };
  }
  
  /**
   * Apply multiple diffs to content
   */
  static applyMultiple(content: string, diffs: UnifiedDiff[]): EditResult {
    let currentContent = content;
    
    for (const diff of diffs) {
      const result = this.apply(currentContent, diff);
      if (!result.success) {
        return result;
      }
      currentContent = result.content!;
    }
    
    return {
      success: true,
      content: currentContent,
    };
  }
  
  private static applyHunk(lines: string[], hunk: DiffHunk): EditResult {
    const startIndex = hunk.oldStart - 1;
    
    // Verify context matches (with fuzzy matching for whitespace)
    let oldLineIndex = startIndex;
    for (const change of hunk.changes) {
      if (change.type === 'context' || change.type === 'remove') {
        const expectedLine = change.content;
        const actualLine = lines[oldLineIndex];
        
        if (actualLine === undefined) {
          return {
            success: false,
            error: `Hunk at line ${hunk.oldStart} extends beyond file end`,
          };
        }
        
        // Exact or fuzzy match
        if (actualLine !== expectedLine && actualLine.trim() !== expectedLine.trim()) {
          return {
            success: false,
            error: `Context mismatch at line ${oldLineIndex + 1}. Expected: "${expectedLine}", Found: "${actualLine}"`,
          };
        }
        oldLineIndex++;
      }
    }
    
    // Apply the hunk
    const newLines: string[] = [];
    for (const change of hunk.changes) {
      if (change.type === 'context' || change.type === 'add') {
        newLines.push(change.content);
      }
    }
    
    // Calculate how many lines to remove
    const removeCount = hunk.changes.filter(c => c.type === 'context' || c.type === 'remove').length;
    
    // Replace lines
    lines.splice(startIndex, removeCount, ...newLines);
    
    return { success: true };
  }
  
  /**
   * Apply a diff string directly
   */
  static applyDiffString(content: string, diffString: string): EditResult {
    const diffs = DiffParser.parse(diffString);
    if (diffs.length === 0) {
      return { success: false, error: 'No valid diffs found in input' };
    }
    return this.applyMultiple(content, diffs);
  }
}

// ============================================================
// AST-AWARE EDITOR
// ============================================================

export class ASTEditor {
  private project: Project;
  
  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
  }
  
  /**
   * Perform AST-aware modification
   */
  modify(content: string, filePath: string, modification: ASTModification): EditResult {
    const sourceFile = this.project.createSourceFile(filePath, content, { overwrite: true });
    
    try {
      switch (modification.type) {
        case 'insertFunction':
          return this.insertFunction(sourceFile, modification);
        case 'insertClass':
          return this.insertClass(sourceFile, modification);
        case 'insertMethod':
          return this.insertMethod(sourceFile, modification);
        case 'insertImport':
          return this.insertImport(sourceFile, modification);
        case 'modifyFunction':
          return this.modifyFunction(sourceFile, modification);
        case 'deleteEntity':
          return this.deleteEntity(sourceFile, modification);
        case 'renameEntity':
          return this.renameEntity(sourceFile, modification);
        case 'insertProperty':
          return this.insertProperty(sourceFile, modification);
        case 'wrapInTryCatch':
          return this.wrapInTryCatch(sourceFile, modification);
        default:
          return { success: false, error: `Unknown modification type: ${modification.type}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  
  private insertFunction(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.code) {
      return { success: false, error: 'Code is required for insertFunction' };
    }
    
    if (mod.position === 'end' || !mod.relativeTo) {
      sourceFile.addStatements(mod.code);
    } else if (mod.relativeTo) {
      const target = sourceFile.getFunction(mod.relativeTo) || 
                     sourceFile.getVariableDeclaration(mod.relativeTo);
      if (!target) {
        return { success: false, error: `Target "${mod.relativeTo}" not found` };
      }
      
      const index = target.getChildIndex();
      if (mod.position === 'before') {
        sourceFile.insertStatements(index, mod.code);
      } else {
        sourceFile.insertStatements(index + 1, mod.code);
      }
    } else {
      sourceFile.insertStatements(0, mod.code);
    }
    
    return { success: true, content: sourceFile.getFullText() };
  }
  
  private insertClass(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.code) {
      return { success: false, error: 'Code is required for insertClass' };
    }
    
    sourceFile.addStatements(mod.code);
    return { success: true, content: sourceFile.getFullText() };
  }
  
  private insertMethod(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.target || !mod.code) {
      return { success: false, error: 'Target class and code are required for insertMethod' };
    }
    
    const targetClass = sourceFile.getClass(mod.target);
    if (!targetClass) {
      return { success: false, error: `Class "${mod.target}" not found` };
    }
    
    targetClass.addMember(mod.code);
    return { success: true, content: sourceFile.getFullText() };
  }
  
  private insertImport(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.code) {
      return { success: false, error: 'Import code is required' };
    }
    
    // Parse the import statement to extract details
    const importMatch = mod.code.match(/import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/);
    
    if (importMatch) {
      const defaultImport = importMatch[1];
      const namedImports = importMatch[2]?.split(',').map(s => s.trim()).filter(Boolean);
      const moduleSpecifier = importMatch[3];
      
      sourceFile.addImportDeclaration({
        defaultImport,
        namedImports: namedImports?.map(n => ({ name: n })),
        moduleSpecifier,
      });
    } else {
      // Fallback: insert as raw text at the top
      const firstStatement = sourceFile.getStatements()[0];
      if (firstStatement) {
        sourceFile.insertStatements(0, mod.code);
      } else {
        sourceFile.addStatements(mod.code);
      }
    }
    
    return { success: true, content: sourceFile.getFullText() };
  }
  
  private modifyFunction(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.target) {
      return { success: false, error: 'Target function name is required' };
    }
    
    const func = sourceFile.getFunction(mod.target);
    if (!func) {
      // Try to find as arrow function variable
      const varDecl = sourceFile.getVariableDeclaration(mod.target);
      if (!varDecl) {
        return { success: false, error: `Function "${mod.target}" not found` };
      }
      
      if (mod.code) {
        varDecl.setInitializer(mod.code);
      }
      return { success: true, content: sourceFile.getFullText() };
    }
    
    if (mod.code) {
      // Replace entire function body
      func.setBodyText(mod.code);
    }
    
    return { success: true, content: sourceFile.getFullText() };
  }
  
  private deleteEntity(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.target) {
      return { success: false, error: 'Target entity name is required' };
    }
    
    const func = sourceFile.getFunction(mod.target);
    if (func) {
      func.remove();
      return { success: true, content: sourceFile.getFullText() };
    }
    
    const cls = sourceFile.getClass(mod.target);
    if (cls) {
      cls.remove();
      return { success: true, content: sourceFile.getFullText() };
    }
    
    const varDecl = sourceFile.getVariableDeclaration(mod.target);
    if (varDecl) {
      const statement = varDecl.getVariableStatement();
      if (statement) {
        statement.remove();
      }
      return { success: true, content: sourceFile.getFullText() };
    }
    
    const iface = sourceFile.getInterface(mod.target);
    if (iface) {
      iface.remove();
      return { success: true, content: sourceFile.getFullText() };
    }
    
    const typeAlias = sourceFile.getTypeAlias(mod.target);
    if (typeAlias) {
      typeAlias.remove();
      return { success: true, content: sourceFile.getFullText() };
    }
    
    return { success: false, error: `Entity "${mod.target}" not found` };
  }
  
  private renameEntity(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.target || !mod.newName) {
      return { success: false, error: 'Target and newName are required for rename' };
    }
    
    const func = sourceFile.getFunction(mod.target);
    if (func) {
      func.rename(mod.newName);
      return { success: true, content: sourceFile.getFullText() };
    }
    
    const cls = sourceFile.getClass(mod.target);
    if (cls) {
      cls.rename(mod.newName);
      return { success: true, content: sourceFile.getFullText() };
    }
    
    const varDecl = sourceFile.getVariableDeclaration(mod.target);
    if (varDecl) {
      varDecl.rename(mod.newName);
      return { success: true, content: sourceFile.getFullText() };
    }
    
    return { success: false, error: `Entity "${mod.target}" not found` };
  }
  
  private insertProperty(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.target || !mod.code) {
      return { success: false, error: 'Target class/interface and code are required' };
    }
    
    const cls = sourceFile.getClass(mod.target);
    if (cls) {
      cls.addMember(mod.code);
      return { success: true, content: sourceFile.getFullText() };
    }
    
    const iface = sourceFile.getInterface(mod.target);
    if (iface) {
      iface.addMember(mod.code);
      return { success: true, content: sourceFile.getFullText() };
    }
    
    return { success: false, error: `Class/Interface "${mod.target}" not found` };
  }
  
  private wrapInTryCatch(sourceFile: SourceFile, mod: ASTModification): EditResult {
    if (!mod.target) {
      return { success: false, error: 'Target function is required' };
    }
    
    const func = sourceFile.getFunction(mod.target);
    if (!func) {
      return { success: false, error: `Function "${mod.target}" not found` };
    }
    
    const body = func.getBody();
    if (!body || !Node.isBlock(body)) {
      return { success: false, error: 'Function has no block body' };
    }
    
    const bodyText = body.getStatements().map(s => s.getText()).join('\n');
    const wrappedBody = `try {\n${bodyText}\n} catch (error) {\nconsole.error('Error in ${mod.target}:', error);\nthrow error;\n}`;
    
    func.setBodyText(wrappedBody);
    return { success: true, content: sourceFile.getFullText() };
  }
  
  /**
   * Clear the project to free memory
   */
  clear(): void {
    this.project.getSourceFiles().forEach(sf => sf.delete());
  }
}

// ============================================================
// LINE-RANGE EDITOR
// ============================================================

export class LineRangeEditor {
  /**
   * Replace lines in a specific range
   */
  static replaceLines(content: string, startLine: number, endLine: number, newContent: string): EditResult {
    const lines = content.split('\n');
    
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
      return {
        success: false,
        error: `Invalid line range: ${startLine}-${endLine} (file has ${lines.length} lines)`,
      };
    }
    
    const newLines = newContent.split('\n');
    lines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
    
    return {
      success: true,
      content: lines.join('\n'),
    };
  }
  
  /**
   * Insert lines after a specific line
   */
  static insertAfter(content: string, line: number, newContent: string): EditResult {
    const lines = content.split('\n');
    
    if (line < 0 || line > lines.length) {
      return {
        success: false,
        error: `Invalid line number: ${line}`,
      };
    }
    
    const newLines = newContent.split('\n');
    lines.splice(line, 0, ...newLines);
    
    return {
      success: true,
      content: lines.join('\n'),
    };
  }
  
  /**
   * Insert lines before a specific line
   */
  static insertBefore(content: string, line: number, newContent: string): EditResult {
    const lines = content.split('\n');
    
    if (line < 1 || line > lines.length + 1) {
      return {
        success: false,
        error: `Invalid line number: ${line}`,
      };
    }
    
    const newLines = newContent.split('\n');
    lines.splice(line - 1, 0, ...newLines);
    
    return {
      success: true,
      content: lines.join('\n'),
    };
  }
  
  /**
   * Delete lines in a range
   */
  static deleteLines(content: string, startLine: number, endLine: number): EditResult {
    const lines = content.split('\n');
    
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
      return {
        success: false,
        error: `Invalid line range: ${startLine}-${endLine}`,
      };
    }
    
    lines.splice(startLine - 1, endLine - startLine + 1);
    
    return {
      success: true,
      content: lines.join('\n'),
    };
  }
}

// ============================================================
// EDIT VALIDATOR
// ============================================================

export class EditValidator {
  private project: Project;
  
  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
  }
  
  /**
   * Validate TypeScript/JavaScript code
   */
  validate(content: string, filePath: string): ValidationError[] {
    const errors: ValidationError[] = [];
    
    try {
      const sourceFile = this.project.createSourceFile(filePath, content, { overwrite: true });
      
      // Get syntax errors
        const diagnostics = sourceFile.getPreEmitDiagnostics();
        
        for (const diagnostic of diagnostics) {
          const messageText = diagnostic.getMessageText();
          const message = typeof messageText === 'string' 
            ? messageText 
            : ts.flattenDiagnosticMessageText(messageText as ts.DiagnosticMessageChain, '\n');
          errors.push({
            type: diagnostic.getCategory() === ts.DiagnosticCategory.Error ? 'syntax' : 'type',
            message,
            line: diagnostic.getLineNumber(),
            column: diagnostic.getStart(),
            code: `TS${diagnostic.getCode()}`,
          });
        }
    } catch (error: any) {
      errors.push({
        type: 'syntax',
        message: `Parse error: ${error.message}`,
      });
    }
    
    return errors;
  }
  
  /**
   * Check if code is syntactically valid
   */
  isSyntaxValid(content: string, filePath: string): boolean {
    const errors = this.validate(content, filePath);
    return errors.filter(e => e.type === 'syntax').length === 0;
  }
  
  /**
   * Validate an edit before applying
   */
  validateEdit(originalContent: string, editedContent: string, filePath: string): {
    valid: boolean;
    errors: ValidationError[];
    newErrors: ValidationError[];
  } {
    const originalErrors = this.validate(originalContent, filePath);
    const editedErrors = this.validate(editedContent, filePath);
    
    // Find new errors introduced by the edit
    const originalMessages = new Set(originalErrors.map(e => e.message));
    const newErrors = editedErrors.filter(e => !originalMessages.has(e.message));
    
    return {
      valid: newErrors.length === 0,
      errors: editedErrors,
      newErrors,
    };
  }
  
  clear(): void {
    this.project.getSourceFiles().forEach(sf => sf.delete());
  }
}

// ============================================================
// MULTI-FILE EDITOR
// ============================================================

export class MultiFileEditor {
  private backups: Map<string, string> = new Map();
  private astEditor: ASTEditor;
  private validator: EditValidator;
  
  constructor() {
    this.astEditor = new ASTEditor();
    this.validator = new EditValidator();
  }
  
  /**
   * Apply edits to multiple files atomically
   */
  async applyMultiFileEdit(
    files: Map<string, string>,
    edits: MultiFileEdit,
    validate: boolean = true
  ): Promise<MultiFileEditResult> {
    const results = new Map<string, EditResult>();
    const editedContents = new Map<string, string>();
    const errors: string[] = [];
    
    // Create backups
    this.backups.clear();
    for (const [path, content] of files) {
      this.backups.set(path, content);
    }
    
    // Apply edits to each file
    for (const fileEdit of edits.files) {
      const originalContent = files.get(fileEdit.path);
      if (originalContent === undefined) {
        errors.push(`File not found: ${fileEdit.path}`);
        continue;
      }
      
      let currentContent = originalContent;
      
      for (const operation of fileEdit.operations) {
        const result = this.applyOperation(currentContent, fileEdit.path, operation);
        if (!result.success) {
          results.set(fileEdit.path, result);
          errors.push(`${fileEdit.path}: ${result.error}`);
          break;
        }
        currentContent = result.content!;
      }
      
      // Validate if requested
      if (validate && currentContent !== originalContent) {
        const validation = this.validator.validateEdit(originalContent, currentContent, fileEdit.path);
        if (!validation.valid) {
          errors.push(`${fileEdit.path}: Validation failed - ${validation.newErrors.map(e => e.message).join(', ')}`);
          results.set(fileEdit.path, {
            success: false,
            error: 'Validation failed',
            validationErrors: validation.newErrors,
          });
          continue;
        }
      }
      
      editedContents.set(fileEdit.path, currentContent);
      results.set(fileEdit.path, {
        success: true,
        content: currentContent,
        diff: DiffParser.generate(originalContent, currentContent, fileEdit.path),
      });
    }
    
    return {
      success: errors.length === 0,
      results,
      errors: errors.length > 0 ? errors : undefined,
      rollbackAvailable: this.backups.size > 0,
    };
  }
  
  /**
   * Get the original contents for rollback
   */
  getBackups(): Map<string, string> {
    return new Map(this.backups);
  }
  
  /**
   * Clear backups
   */
  clearBackups(): void {
    this.backups.clear();
  }
  
  private applyOperation(content: string, filePath: string, operation: EditOperation): EditResult {
    if ('startLine' in operation.target) {
      // Line range operation
      const range = operation.target as LineRange;
      
      switch (operation.type) {
        case 'replace':
          return LineRangeEditor.replaceLines(content, range.startLine, range.endLine, operation.content || '');
        case 'delete':
          return LineRangeEditor.deleteLines(content, range.startLine, range.endLine);
        case 'insertAfter':
          return LineRangeEditor.insertAfter(content, range.endLine, operation.content || '');
        case 'insertBefore':
          return LineRangeEditor.insertBefore(content, range.startLine, operation.content || '');
        default:
          return { success: false, error: `Unknown operation type: ${operation.type}` };
      }
    } else {
      // Entity-based operation
      const target = operation.target as EntityTarget;
      
      const astMod: ASTModification = {
        type: this.mapEntityOperationToAST(operation.type, target.entityType),
        target: target.entityName,
        code: operation.content,
      };
      
      return this.astEditor.modify(content, filePath, astMod);
    }
  }
  
  private mapEntityOperationToAST(
    opType: EditOperation['type'],
    entityType: EntityTarget['entityType']
  ): ASTModification['type'] {
    if (opType === 'delete') return 'deleteEntity';
    if (opType === 'insert' || opType === 'insertAfter' || opType === 'insertBefore') {
      switch (entityType) {
        case 'function': return 'insertFunction';
        case 'class': return 'insertClass';
        case 'method': return 'insertMethod';
        case 'import': return 'insertImport';
        default: return 'insertFunction';
      }
    }
    if (opType === 'replace') {
      switch (entityType) {
        case 'function': return 'modifyFunction';
        default: return 'modifyFunction';
      }
    }
    return 'modifyFunction';
  }
}

// ============================================================
// MAIN DIFF EDITOR CLASS
// ============================================================

export class DiffEditor {
  private astEditor: ASTEditor;
  private validator: EditValidator;
  private multiFileEditor: MultiFileEditor;
  
  constructor() {
    this.astEditor = new ASTEditor();
    this.validator = new EditValidator();
    this.multiFileEditor = new MultiFileEditor();
  }
  
  // Diff operations
  parseDiff = DiffParser.parse;
  generateDiff = DiffParser.generate;
  applyDiff = DiffApplier.apply;
  applyDiffString = DiffApplier.applyDiffString;
  
  // Line operations
  replaceLines = LineRangeEditor.replaceLines;
  insertAfter = LineRangeEditor.insertAfter;
  insertBefore = LineRangeEditor.insertBefore;
  deleteLines = LineRangeEditor.deleteLines;
  
  /**
   * AST-aware modification
   */
  astModify(content: string, filePath: string, modification: ASTModification): EditResult {
    return this.astEditor.modify(content, filePath, modification);
  }
  
  /**
   * Validate code
   */
  validate(content: string, filePath: string): ValidationError[] {
    return this.validator.validate(content, filePath);
  }
  
  /**
   * Check syntax validity
   */
  isSyntaxValid(content: string, filePath: string): boolean {
    return this.validator.isSyntaxValid(content, filePath);
  }
  
  /**
   * Validate an edit
   */
  validateEdit(original: string, edited: string, filePath: string) {
    return this.validator.validateEdit(original, edited, filePath);
  }
  
  /**
   * Multi-file atomic edit
   */
  async multiFileEdit(files: Map<string, string>, edits: MultiFileEdit, validate: boolean = true) {
    return this.multiFileEditor.applyMultiFileEdit(files, edits, validate);
  }
  
  /**
   * Get backups for rollback
   */
  getBackups(): Map<string, string> {
    return this.multiFileEditor.getBackups();
  }
  
  /**
   * Edit a specific function
   */
  editFunction(content: string, filePath: string, functionName: string, newBody: string): EditResult {
    return this.astEditor.modify(content, filePath, {
      type: 'modifyFunction',
      target: functionName,
      code: newBody,
    });
  }
  
  /**
   * Add a new function
   */
  addFunction(content: string, filePath: string, functionCode: string, options?: {
    position?: 'before' | 'after' | 'start' | 'end';
    relativeTo?: string;
  }): EditResult {
    return this.astEditor.modify(content, filePath, {
      type: 'insertFunction',
      code: functionCode,
      position: options?.position,
      relativeTo: options?.relativeTo,
    });
  }
  
  /**
   * Add a new import
   */
  addImport(content: string, filePath: string, importStatement: string): EditResult {
    return this.astEditor.modify(content, filePath, {
      type: 'insertImport',
      code: importStatement,
    });
  }
  
  /**
   * Delete an entity
   */
  deleteEntity(content: string, filePath: string, entityName: string): EditResult {
    return this.astEditor.modify(content, filePath, {
      type: 'deleteEntity',
      target: entityName,
    });
  }
  
  /**
   * Rename an entity
   */
  renameEntity(content: string, filePath: string, oldName: string, newName: string): EditResult {
    return this.astEditor.modify(content, filePath, {
      type: 'renameEntity',
      target: oldName,
      newName,
    });
  }
  
  /**
   * Add a method to a class
   */
  addMethod(content: string, filePath: string, className: string, methodCode: string): EditResult {
    return this.astEditor.modify(content, filePath, {
      type: 'insertMethod',
      target: className,
      code: methodCode,
    });
  }
  
  /**
   * Wrap a function in try-catch
   */
  wrapInTryCatch(content: string, filePath: string, functionName: string): EditResult {
    return this.astEditor.modify(content, filePath, {
      type: 'wrapInTryCatch',
      target: functionName,
    });
  }
  
  /**
   * Clean up resources
   */
  clear(): void {
    this.astEditor.clear();
    this.validator.clear();
    this.multiFileEditor.clearBackups();
  }
}

// Singleton export
export const diffEditor = new DiffEditor();
