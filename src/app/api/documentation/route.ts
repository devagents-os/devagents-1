/**
 * Documentation Generation API
 * 
 * Provides REST endpoints for:
 * - Commit message generation from diffs
 * - Inline comment generation for complex code
 * - README/documentation updates
 * - Action explanation generation
 * - PR description generation
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  documentationGenerator,
  CommitMessageOptions,
  CommitMessage,
  InlineComment,
  ActionExplanation,
  DocumentationUpdate,
  PRDescription,
  CodeDocumentation,
  ComplexityThreshold,
} from '@/lib/documentationGenerator';

export const maxDuration = 60;

interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function respond<T>(data: T): NextResponse<APIResponse<T>> {
  return NextResponse.json({ success: true, data });
}

function error(message: string, status: number = 400): NextResponse<APIResponse> {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ============================================================
      // COMMIT MESSAGE GENERATION
      // ============================================================

      case 'generate-commit-message': {
        const { diff, options } = body as {
          diff: string;
          options?: CommitMessageOptions;
        };

        if (!diff) {
          return error('diff is required');
        }

        const result = await documentationGenerator.generateCommitMessage(diff, options);
        return respond<CommitMessage>(result);
      }

      case 'generate-commit-message-from-changes': {
        const { changes, options } = body as {
          changes: Array<{ path: string; oldContent: string; newContent: string }>;
          options?: CommitMessageOptions;
        };

        if (!changes || !Array.isArray(changes)) {
          return error('changes array is required');
        }

        const result = await documentationGenerator.generateCommitMessageFromChanges(changes, options);
        return respond<CommitMessage>(result);
      }

      // ============================================================
      // INLINE COMMENT GENERATION
      // ============================================================

      case 'generate-inline-comments': {
        const { filePath, content, thresholds } = body as {
          filePath: string;
          content: string;
          thresholds?: Partial<ComplexityThreshold>;
        };

        if (!filePath || !content) {
          return error('filePath and content are required');
        }

        const result = await documentationGenerator.generateInlineComments(filePath, content, thresholds);
        return respond<InlineComment[]>(result);
      }

      case 'generate-function-doc': {
        const { functionCode, functionName, context } = body as {
          functionCode: string;
          functionName: string;
          context?: string;
        };

        if (!functionCode || !functionName) {
          return error('functionCode and functionName are required');
        }

        const result = await documentationGenerator.generateFunctionDoc(functionCode, functionName, context);
        return respond<string>(result);
      }

      case 'generate-code-documentation': {
        const { code, entityType } = body as {
          code: string;
          entityType: 'function' | 'class' | 'interface' | 'type';
        };

        if (!code || !entityType) {
          return error('code and entityType are required');
        }

        const result = await documentationGenerator.generateCodeDocumentation(code, entityType);
        return respond<CodeDocumentation>(result);
      }

      // ============================================================
      // ACTION EXPLANATION
      // ============================================================

      case 'explain-action': {
        const { actionStr, context } = body as {
          actionStr: string;
          context?: {
            task?: string;
            previousActions?: string[];
            codeContext?: string;
            files?: string[];
          };
        };

        if (!actionStr) {
          return error('actionStr is required');
        }

        const result = await documentationGenerator.explainAction(actionStr, context);
        return respond<ActionExplanation>(result);
      }

      case 'explain-action-sequence': {
        const { actions, context } = body as {
          actions: string[];
          context?: {
            task?: string;
            codeContext?: string;
          };
        };

        if (!actions || !Array.isArray(actions)) {
          return error('actions array is required');
        }

        const result = await documentationGenerator.explainActionSequence(actions, context);
        return respond<{ summary: string; steps: ActionExplanation[] }>(result);
      }

      // ============================================================
      // DOCUMENTATION UPDATES
      // ============================================================

      case 'generate-doc-updates': {
        const { codeChanges, existingDocs } = body as {
          codeChanges: Array<{ path: string; oldContent: string; newContent: string }>;
          existingDocs: Array<{ path: string; content: string }>;
        };

        if (!codeChanges || !existingDocs) {
          return error('codeChanges and existingDocs are required');
        }

        const result = await documentationGenerator.generateDocUpdates(codeChanges, existingDocs);
        return respond<DocumentationUpdate[]>(result);
      }

      case 'update-readme': {
        const { readmeContent, codeChanges } = body as {
          readmeContent: string;
          codeChanges: Array<{ path: string; oldContent: string; newContent: string }>;
        };

        if (!readmeContent || !codeChanges) {
          return error('readmeContent and codeChanges are required');
        }

        const result = await documentationGenerator.updateReadme(readmeContent, codeChanges);
        return respond<{ updatedContent: string; changes: string[] }>(result);
      }

      // ============================================================
      // PR DESCRIPTION GENERATION
      // ============================================================

      case 'generate-pr-description': {
        const { changes, options } = body as {
          changes: Array<{ path: string; oldContent: string; newContent: string }>;
          options?: {
            title?: string;
            template?: string;
            includeChecklist?: boolean;
            reviewers?: string[];
          };
        };

        if (!changes || !Array.isArray(changes)) {
          return error('changes array is required');
        }

        const result = await documentationGenerator.generatePRDescription(changes, options);
        return respond<PRDescription>(result);
      }

      // ============================================================
      // BATCH OPERATIONS
      // ============================================================

      case 'generate-all': {
        // Generate commit message, PR description, and doc updates in one call
        const { changes, existingDocs, commitOptions, prOptions } = body as {
          changes: Array<{ path: string; oldContent: string; newContent: string }>;
          existingDocs?: Array<{ path: string; content: string }>;
          commitOptions?: CommitMessageOptions;
          prOptions?: {
            title?: string;
            template?: string;
            includeChecklist?: boolean;
            reviewers?: string[];
          };
        };

        if (!changes || !Array.isArray(changes)) {
          return error('changes array is required');
        }

        const [commitMessage, prDescription, docUpdates] = await Promise.all([
          documentationGenerator.generateCommitMessageFromChanges(changes, commitOptions),
          documentationGenerator.generatePRDescription(changes, prOptions),
          existingDocs 
            ? documentationGenerator.generateDocUpdates(changes, existingDocs)
            : Promise.resolve([]),
        ]);

        return respond<{
          commitMessage: CommitMessage;
          prDescription: PRDescription;
          docUpdates: DocumentationUpdate[];
        }>({
          commitMessage,
          prDescription,
          docUpdates,
        });
      }

      default:
        return error(`Unknown action: ${action}`);
    }
  } catch (err) {
    console.error('Documentation API error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  switch (action) {
    case 'health':
      return respond({ status: 'ok', service: 'documentation-generator' });

    case 'capabilities':
      return respond({
        capabilities: [
          'generate-commit-message',
          'generate-commit-message-from-changes',
          'generate-inline-comments',
          'generate-function-doc',
          'generate-code-documentation',
          'explain-action',
          'explain-action-sequence',
          'generate-doc-updates',
          'update-readme',
          'generate-pr-description',
          'generate-all',
        ],
        commitStyles: ['conventional', 'semantic', 'descriptive'],
        entityTypes: ['function', 'class', 'interface', 'type'],
      });

    default:
      return respond({
        message: 'Documentation Generation API',
        endpoints: {
          POST: {
            'generate-commit-message': 'Generate commit message from diff',
            'generate-commit-message-from-changes': 'Generate commit message from file changes',
            'generate-inline-comments': 'Generate inline comments for complex code',
            'generate-function-doc': 'Generate JSDoc for a function',
            'generate-code-documentation': 'Generate documentation for code entity',
            'explain-action': 'Explain a code action',
            'explain-action-sequence': 'Explain a sequence of actions',
            'generate-doc-updates': 'Generate documentation updates for code changes',
            'update-readme': 'Update README based on code changes',
            'generate-pr-description': 'Generate PR description',
            'generate-all': 'Generate commit, PR description, and doc updates in one call',
          },
          GET: {
            'health': 'Health check',
            'capabilities': 'List API capabilities',
          },
        },
      });
  }
}
