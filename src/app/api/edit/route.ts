/**
 * API Endpoint for Advanced Diff-Based Editing
 * 
 * Provides comprehensive code editing capabilities:
 * - Unified diff parsing and application
 * - AST-aware modifications (insert/modify functions, classes, etc.)
 * - Line-range based surgical edits
 * - Edit validation with syntax checking
 * - Multi-file atomic commits with rollback support
 */

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { 
  DiffParser, 
  DiffApplier, 
  ASTEditor, 
  LineRangeEditor, 
  EditValidator,
  MultiFileEditor,
  DiffEditor,
  diffEditor,
  type EditOperation,
  type ASTModification,
  type MultiFileEdit,
  type EditResult,
  type ValidationError,
} from '@/lib/diffEditor';
import { getWorkspaceManager } from '@/lib/workspaceManager';

const DEFAULT_ROOT = process.cwd();

// Get the effective workspace root
async function getWorkspaceRoot(): Promise<string> {
  try {
    const manager = await getWorkspaceManager();
    const activeWorkspace = manager.getActiveWorkspace();
    if (activeWorkspace) {
      return activeWorkspace.path;
    }
  } catch (e) {
    console.error('Failed to get workspace manager:', e);
  }
  return DEFAULT_ROOT;
}

// Security: Validate path is within workspace
function validatePath(fullPath: string, root: string): boolean {
  const normalizedFull = path.normalize(fullPath);
  const normalizedRoot = path.normalize(root);
  return normalizedFull.startsWith(normalizedRoot);
}

// Read file content safely
async function readFile(filePath: string): Promise<{ content: string; error?: string }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { content };
  } catch (error: any) {
    return { content: '', error: error.message };
  }
}

// Write file with backup
async function writeFileWithBackup(
  filePath: string, 
  content: string, 
  relativePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create backup via workspace manager
    const workspaceManager = await getWorkspaceManager();
    const activeWorkspace = workspaceManager.getActiveWorkspace();
    if (activeWorkspace) {
      try {
        await workspaceManager.saveFileVersion(relativePath, 'Auto-backup before edit');
      } catch {
        // File might not exist yet, that's OK
      }
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    const ROOT = await getWorkspaceRoot();

    switch (action) {
      // ============================================================
      // UNIFIED DIFF OPERATIONS
      // ============================================================
      
      case 'apply-diff': {
        // Apply a unified diff to a file
        const { path: targetPath, diff: diffString } = body;
        
        if (!targetPath || !diffString) {
          return NextResponse.json({ 
            error: 'path and diff are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ 
            error: 'Access denied: path traversal detected' 
          }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        // Parse and apply diff
        const result = diffEditor.applyDiffString(content, diffString);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 409 });
        }

        // Validate before writing (if it's a TypeScript/JavaScript file)
        if (targetPath.match(/\.(ts|tsx|js|jsx)$/)) {
          const validation = diffEditor.validateEdit(content, result.content!, targetPath);
          if (!validation.valid) {
            return NextResponse.json({
              success: false,
              error: 'Validation failed',
              validationErrors: validation.newErrors,
            }, { status: 422 });
          }
        }

        // Write the file
        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
        });
      }

      case 'generate-diff': {
        // Generate a diff between current file and new content
        const { path: targetPath, newContent } = body;
        
        if (!targetPath || newContent === undefined) {
          return NextResponse.json({ 
            error: 'path and newContent are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ 
            error: 'Access denied' 
          }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        const oldContent = readError ? '' : content;
        
        const diff = DiffParser.generate(oldContent, newContent, targetPath);
        
        return NextResponse.json({
          success: true,
          diff,
          hasChanges: diff.length > 0,
        });
      }

      case 'parse-diff': {
        // Parse a unified diff string
        const { diff: diffString } = body;
        
        if (!diffString) {
          return NextResponse.json({ 
            error: 'diff is required' 
          }, { status: 400 });
        }

        const parsed = DiffParser.parse(diffString);
        
        return NextResponse.json({
          success: true,
          diffs: parsed,
        });
      }

      // ============================================================
      // LINE-RANGE OPERATIONS
      // ============================================================

      case 'replace-lines': {
        // Replace specific lines in a file
        const { path: targetPath, startLine, endLine, content: newContent } = body;
        
        if (!targetPath || !startLine || !endLine || newContent === undefined) {
          return NextResponse.json({ 
            error: 'path, startLine, endLine, and content are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = LineRangeEditor.replaceLines(content, startLine, endLine, newContent);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        // Validate if TypeScript/JavaScript
        if (targetPath.match(/\.(ts|tsx|js|jsx)$/)) {
          const validation = diffEditor.validateEdit(content, result.content!, targetPath);
          if (!validation.valid) {
            return NextResponse.json({
              success: false,
              error: 'Validation failed',
              validationErrors: validation.newErrors,
            }, { status: 422 });
          }
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'insert-after': {
        const { path: targetPath, line, content: newContent } = body;
        
        if (!targetPath || !line || newContent === undefined) {
          return NextResponse.json({ 
            error: 'path, line, and content are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = LineRangeEditor.insertAfter(content, line, newContent);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'insert-before': {
        const { path: targetPath, line, content: newContent } = body;
        
        if (!targetPath || !line || newContent === undefined) {
          return NextResponse.json({ 
            error: 'path, line, and content are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = LineRangeEditor.insertBefore(content, line, newContent);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'delete-lines': {
        const { path: targetPath, startLine, endLine } = body;
        
        if (!targetPath || !startLine || !endLine) {
          return NextResponse.json({ 
            error: 'path, startLine, and endLine are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = LineRangeEditor.deleteLines(content, startLine, endLine);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      // ============================================================
      // AST-AWARE OPERATIONS
      // ============================================================

      case 'ast-modify': {
        // Perform AST-aware modification
        const { path: targetPath, modification } = body;
        
        if (!targetPath || !modification) {
          return NextResponse.json({ 
            error: 'path and modification are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = diffEditor.astModify(content, targetPath, modification as ASTModification);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        // Validate the result
        const validation = diffEditor.validateEdit(content, result.content!, targetPath);
        if (!validation.valid) {
          return NextResponse.json({
            success: false,
            error: 'AST modification introduced syntax errors',
            validationErrors: validation.newErrors,
          }, { status: 422 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'add-function': {
        const { path: targetPath, functionCode, position, relativeTo } = body;
        
        if (!targetPath || !functionCode) {
          return NextResponse.json({ 
            error: 'path and functionCode are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = diffEditor.addFunction(content, targetPath, functionCode, {
          position,
          relativeTo,
        });
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'edit-function': {
        const { path: targetPath, functionName, newBody } = body;
        
        if (!targetPath || !functionName || !newBody) {
          return NextResponse.json({ 
            error: 'path, functionName, and newBody are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = diffEditor.editFunction(content, targetPath, functionName, newBody);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'add-import': {
        const { path: targetPath, importStatement } = body;
        
        if (!targetPath || !importStatement) {
          return NextResponse.json({ 
            error: 'path and importStatement are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = diffEditor.addImport(content, targetPath, importStatement);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'delete-entity': {
        const { path: targetPath, entityName } = body;
        
        if (!targetPath || !entityName) {
          return NextResponse.json({ 
            error: 'path and entityName are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = diffEditor.deleteEntity(content, targetPath, entityName);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'rename-entity': {
        const { path: targetPath, oldName, newName } = body;
        
        if (!targetPath || !oldName || !newName) {
          return NextResponse.json({ 
            error: 'path, oldName, and newName are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = diffEditor.renameEntity(content, targetPath, oldName, newName);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      case 'add-method': {
        const { path: targetPath, className, methodCode } = body;
        
        if (!targetPath || !className || !methodCode) {
          return NextResponse.json({ 
            error: 'path, className, and methodCode are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        const result = diffEditor.addMethod(content, targetPath, className, methodCode);
        
        if (!result.success) {
          return NextResponse.json({ 
            success: false, 
            error: result.error 
          }, { status: 400 });
        }

        const writeResult = await writeFileWithBackup(fullPath, result.content!, targetPath);
        if (!writeResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: writeResult.error 
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          content: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
        });
      }

      // ============================================================
      // VALIDATION OPERATIONS
      // ============================================================

      case 'validate': {
        // Validate code syntax
        const { path: targetPath, content: contentToValidate } = body;
        
        if (!targetPath) {
          return NextResponse.json({ 
            error: 'path is required' 
          }, { status: 400 });
        }

        let content = contentToValidate;
        if (content === undefined) {
          const fullPath = path.join(ROOT, targetPath);
          if (!validatePath(fullPath, ROOT)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
          }
          const { content: fileContent, error: readError } = await readFile(fullPath);
          if (readError) {
            return NextResponse.json({ error: readError }, { status: 404 });
          }
          content = fileContent;
        }

        const errors = diffEditor.validate(content, targetPath);
        
        return NextResponse.json({
          success: true,
          valid: errors.length === 0,
          errors,
        });
      }

      case 'preview-edit': {
        // Preview an edit without applying it
        const { path: targetPath, edit } = body;
        
        if (!targetPath || !edit) {
          return NextResponse.json({ 
            error: 'path and edit are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        let result: EditResult;
        
        // Determine edit type and apply
        if (edit.diff) {
          result = diffEditor.applyDiffString(content, edit.diff);
        } else if (edit.modification) {
          result = diffEditor.astModify(content, targetPath, edit.modification);
        } else if (edit.lineRange) {
          result = LineRangeEditor.replaceLines(
            content, 
            edit.lineRange.startLine, 
            edit.lineRange.endLine, 
            edit.content || ''
          );
        } else {
          return NextResponse.json({ 
            error: 'Invalid edit format' 
          }, { status: 400 });
        }

        if (!result.success) {
          return NextResponse.json({
            success: false,
            error: result.error,
          }, { status: 400 });
        }

        // Validate the preview
        const validation = diffEditor.validateEdit(content, result.content!, targetPath);
        
        return NextResponse.json({
          success: true,
          preview: result.content,
          diff: DiffParser.generate(content, result.content!, targetPath),
          validation: {
            valid: validation.valid,
            errors: validation.errors,
            newErrors: validation.newErrors,
          },
        });
      }

      // ============================================================
      // MULTI-FILE OPERATIONS
      // ============================================================

      case 'multi-file-edit': {
        // Apply edits to multiple files atomically
        const { edits, validate: shouldValidate = true } = body;
        
        if (!edits || !edits.files || !Array.isArray(edits.files)) {
          return NextResponse.json({ 
            error: 'edits.files array is required' 
          }, { status: 400 });
        }

        const multiEdit: MultiFileEdit = edits;
        
        // Read all files
        const files = new Map<string, string>();
        const readErrors: string[] = [];
        
        for (const fileEdit of multiEdit.files) {
          const fullPath = path.join(ROOT, fileEdit.path);
          if (!validatePath(fullPath, ROOT)) {
            readErrors.push(`Access denied: ${fileEdit.path}`);
            continue;
          }
          
          const { content, error } = await readFile(fullPath);
          if (error) {
            readErrors.push(`${fileEdit.path}: ${error}`);
            continue;
          }
          files.set(fileEdit.path, content);
        }
        
        if (readErrors.length > 0) {
          return NextResponse.json({
            success: false,
            errors: readErrors,
          }, { status: 400 });
        }

        // Apply edits
        const result = await diffEditor.multiFileEdit(files, multiEdit, shouldValidate);
        
        if (!result.success) {
          return NextResponse.json({
            success: false,
            errors: result.errors,
            results: Object.fromEntries(result.results),
          }, { status: 400 });
        }

        // Write all files
        const writeErrors: string[] = [];
        for (const [filePath, editResult] of result.results) {
          if (editResult.success && editResult.content) {
            const fullPath = path.join(ROOT, filePath);
            const writeResult = await writeFileWithBackup(fullPath, editResult.content, filePath);
            if (!writeResult.success) {
              writeErrors.push(`${filePath}: ${writeResult.error}`);
            }
          }
        }

        if (writeErrors.length > 0) {
          return NextResponse.json({
            success: false,
            errors: writeErrors,
            partialSuccess: true,
          }, { status: 500 });
        }

        // Build response with diffs
        const resultsWithDiffs: Record<string, { success: boolean; diff?: string; error?: string }> = {};
        for (const [filePath, editResult] of result.results) {
          resultsWithDiffs[filePath] = {
            success: editResult.success,
            diff: editResult.diff,
            error: editResult.error,
          };
        }

        return NextResponse.json({
          success: true,
          results: resultsWithDiffs,
          commitMessage: multiEdit.commitMessage,
        });
      }

      // ============================================================
      // UTILITY OPERATIONS
      // ============================================================

      case 'find-entity': {
        // Find an entity (function, class, etc.) in a file and return its location
        const { path: targetPath, entityName, entityType } = body;
        
        if (!targetPath || !entityName) {
          return NextResponse.json({ 
            error: 'path and entityName are required' 
          }, { status: 400 });
        }

        const fullPath = path.join(ROOT, targetPath);
        if (!validatePath(fullPath, ROOT)) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { content, error: readError } = await readFile(fullPath);
        if (readError) {
          return NextResponse.json({ error: readError }, { status: 404 });
        }

        // Use AST to find entity
        const { Project, ts } = await import('ts-morph');
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(targetPath, content);
        
        let entity: { startLine: number; endLine: number; text: string } | null = null;
        
        const func = sourceFile.getFunction(entityName);
        if (func) {
          entity = {
            startLine: func.getStartLineNumber(),
            endLine: func.getEndLineNumber(),
            text: func.getText(),
          };
        }
        
        if (!entity) {
          const cls = sourceFile.getClass(entityName);
          if (cls) {
            entity = {
              startLine: cls.getStartLineNumber(),
              endLine: cls.getEndLineNumber(),
              text: cls.getText(),
            };
          }
        }
        
        if (!entity) {
          const varDecl = sourceFile.getVariableDeclaration(entityName);
          if (varDecl) {
            entity = {
              startLine: varDecl.getStartLineNumber(),
              endLine: varDecl.getEndLineNumber(),
              text: varDecl.getText(),
            };
          }
        }
        
        if (!entity) {
          const iface = sourceFile.getInterface(entityName);
          if (iface) {
            entity = {
              startLine: iface.getStartLineNumber(),
              endLine: iface.getEndLineNumber(),
              text: iface.getText(),
            };
          }
        }
        
        if (!entity) {
          return NextResponse.json({
            success: false,
            error: `Entity "${entityName}" not found`,
          }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          entity,
        });
      }

      default:
        return NextResponse.json({ 
          error: `Unknown action: ${action}` 
        }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Edit API error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}

export async function GET() {
  // Return available editing capabilities
  return NextResponse.json({
    name: 'Advanced Edit API',
    version: '1.0.0',
    description: 'Comprehensive code editing with diff support, AST-aware modifications, and multi-file atomic commits',
    actions: {
      // Diff operations
      'apply-diff': {
        description: 'Apply a unified diff to a file',
        params: ['path', 'diff'],
      },
      'generate-diff': {
        description: 'Generate a diff between current file and new content',
        params: ['path', 'newContent'],
      },
      'parse-diff': {
        description: 'Parse a unified diff string into structured format',
        params: ['diff'],
      },
      
      // Line operations
      'replace-lines': {
        description: 'Replace specific lines in a file',
        params: ['path', 'startLine', 'endLine', 'content'],
      },
      'insert-after': {
        description: 'Insert content after a specific line',
        params: ['path', 'line', 'content'],
      },
      'insert-before': {
        description: 'Insert content before a specific line',
        params: ['path', 'line', 'content'],
      },
      'delete-lines': {
        description: 'Delete lines in a range',
        params: ['path', 'startLine', 'endLine'],
      },
      
      // AST operations
      'ast-modify': {
        description: 'Perform AST-aware modification',
        params: ['path', 'modification'],
        modificationTypes: [
          'insertFunction', 'insertClass', 'insertMethod', 'insertImport',
          'modifyFunction', 'modifyClass', 'deleteEntity', 'renameEntity',
          'insertProperty', 'insertParameter', 'wrapInTryCatch',
        ],
      },
      'add-function': {
        description: 'Add a new function to a file',
        params: ['path', 'functionCode', 'position?', 'relativeTo?'],
      },
      'edit-function': {
        description: 'Edit an existing function body',
        params: ['path', 'functionName', 'newBody'],
      },
      'add-import': {
        description: 'Add an import statement',
        params: ['path', 'importStatement'],
      },
      'delete-entity': {
        description: 'Delete a function, class, or variable',
        params: ['path', 'entityName'],
      },
      'rename-entity': {
        description: 'Rename a function, class, or variable',
        params: ['path', 'oldName', 'newName'],
      },
      'add-method': {
        description: 'Add a method to a class',
        params: ['path', 'className', 'methodCode'],
      },
      
      // Validation
      'validate': {
        description: 'Validate code syntax',
        params: ['path', 'content?'],
      },
      'preview-edit': {
        description: 'Preview an edit without applying it',
        params: ['path', 'edit'],
      },
      
      // Multi-file
      'multi-file-edit': {
        description: 'Apply edits to multiple files atomically',
        params: ['edits', 'validate?'],
      },
      
      // Utilities
      'find-entity': {
        description: 'Find an entity and return its location',
        params: ['path', 'entityName', 'entityType?'],
      },
    },
    examples: {
      'apply-diff': {
        action: 'apply-diff',
        path: 'src/example.ts',
        diff: '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,3 +1,4 @@\n import x from "y";\n+import z from "w";\n \n function foo() {}',
      },
      'replace-lines': {
        action: 'replace-lines',
        path: 'src/example.ts',
        startLine: 10,
        endLine: 15,
        content: 'function newCode() {\n  return true;\n}',
      },
      'add-function': {
        action: 'add-function',
        path: 'src/example.ts',
        functionCode: 'export function myNewFunction(x: number): number {\n  return x * 2;\n}',
        position: 'end',
      },
      'multi-file-edit': {
        action: 'multi-file-edit',
        edits: {
          files: [
            {
              path: 'src/a.ts',
              operations: [
                { type: 'insert', target: { entityType: 'import', entityName: '' }, content: "import { x } from './b'" },
              ],
            },
            {
              path: 'src/b.ts',
              operations: [
                { type: 'insert', target: { entityType: 'function', entityName: '' }, content: 'export function x() {}' },
              ],
            },
          ],
          commitMessage: 'Add cross-file dependency',
        },
        validate: true,
      },
    },
  });
}
