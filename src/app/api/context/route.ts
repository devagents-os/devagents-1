/**
 * Context Management API
 * 
 * Provides endpoints for managing context windows, code summarization,
 * file paging, and relevance-based context selection.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  contextManager,
  codeSummarizer,
  filePager,
  relevanceSelector,
  createSlidingWindow,
  createContextManager,
  estimateTokenCount,
  truncateToTokens,
  type ContextItem,
  type ContextWindow,
  type ContextSelectionOptions,
  type FileSummary,
} from '@/lib/contextManager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      // ============================================================
      // CONTEXT WINDOW OPERATIONS
      // ============================================================

      case 'add-item': {
        const { type, content, source, relevanceScore = 0.5 } = params;
        if (!type || !content || !source) {
          return NextResponse.json(
            { error: 'type, content, and source are required' },
            { status: 400 }
          );
        }

        const id = contextManager.addItem({
          type,
          content,
          source,
          relevanceScore,
          timestamp: Date.now(),
        });

        return NextResponse.json({
          success: true,
          id,
          tokenCount: estimateTokenCount(content),
        });
      }

      case 'add-code-file': {
        const { filePath, content, relevanceScore = 0.5, preferSummary = true } = params;
        if (!filePath || !content) {
          return NextResponse.json(
            { error: 'filePath and content are required' },
            { status: 400 }
          );
        }

        const id = await contextManager.addCodeFile(
          filePath,
          content,
          relevanceScore,
          preferSummary
        );

        return NextResponse.json({
          success: true,
          id,
        });
      }

      case 'add-code-entity': {
        const { filePath, content, entityName, relevanceScore = 0.7 } = params;
        if (!filePath || !content || !entityName) {
          return NextResponse.json(
            { error: 'filePath, content, and entityName are required' },
            { status: 400 }
          );
        }

        const id = await contextManager.addCodeEntity(
          filePath,
          content,
          entityName,
          relevanceScore
        );

        if (!id) {
          return NextResponse.json(
            { error: `Entity "${entityName}" not found in file` },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          id,
        });
      }

      case 'add-conversation': {
        const { content, relevanceScore = 0.6 } = params;
        if (!content) {
          return NextResponse.json(
            { error: 'content is required' },
            { status: 400 }
          );
        }

        const id = contextManager.addConversation(content, relevanceScore);
        return NextResponse.json({ success: true, id });
      }

      case 'add-memory': {
        const { content, source, relevanceScore = 0.5 } = params;
        if (!content || !source) {
          return NextResponse.json(
            { error: 'content and source are required' },
            { status: 400 }
          );
        }

        const id = contextManager.addMemory(content, source, relevanceScore);
        return NextResponse.json({ success: true, id });
      }

      case 'add-task': {
        const { content, relevanceScore = 0.8 } = params;
        if (!content) {
          return NextResponse.json(
            { error: 'content is required' },
            { status: 400 }
          );
        }

        const id = contextManager.addTask(content, relevanceScore);
        return NextResponse.json({ success: true, id });
      }

      case 'remove-item': {
        const { id } = params;
        if (!id) {
          return NextResponse.json(
            { error: 'id is required' },
            { status: 400 }
          );
        }

        const removed = contextManager.removeItem(id);
        return NextResponse.json({ success: removed });
      }

      case 'update-relevance': {
        const { id, score } = params;
        if (!id || typeof score !== 'number') {
          return NextResponse.json(
            { error: 'id and score are required' },
            { status: 400 }
          );
        }

        contextManager.updateRelevance(id, score);
        return NextResponse.json({ success: true });
      }

      case 'build-context': {
        const options: ContextSelectionOptions = {
          maxTokens: params.maxTokens || 8000,
          priorityWeights: params.priorityWeights,
          requiredItems: params.requiredItems,
          excludeItems: params.excludeItems,
          preferSummaries: params.preferSummaries,
        };

        const window = contextManager.buildContext(options);
        const contextString = params.asString
          ? contextManager.buildContextString(window)
          : undefined;

        return NextResponse.json({
          success: true,
          window: {
            items: window.items.map(item => ({
              id: item.id,
              type: item.type,
              source: item.source,
              tokenCount: item.tokenCount,
              relevanceScore: item.relevanceScore,
              content: params.includeContent ? item.content : undefined,
              metadata: item.metadata,
            })),
            totalTokens: window.totalTokens,
            maxTokens: window.maxTokens,
            usedPercentage: window.usedPercentage,
          },
          contextString,
        });
      }

      case 'get-stats': {
        const stats = contextManager.getStats();
        return NextResponse.json({ success: true, stats });
      }

      case 'clear-context': {
        contextManager.clear();
        return NextResponse.json({ success: true });
      }

      case 'clear-old': {
        const { maxAgeMs = 3600000 } = params; // Default 1 hour
        const cleared = contextManager.clearOlderThan(maxAgeMs);
        return NextResponse.json({ success: true, clearedCount: cleared });
      }

      // ============================================================
      // CODE SUMMARIZATION
      // ============================================================

      case 'summarize-file': {
        const { filePath, content } = params;
        if (!filePath || !content) {
          return NextResponse.json(
            { error: 'filePath and content are required' },
            { status: 400 }
          );
        }

        const summary = await codeSummarizer.summarizeFile(filePath, content);

        return NextResponse.json({
          success: true,
          summary: {
            filePath: summary.filePath,
            summary: summary.summary,
            tokenCount: summary.tokenCount,
            summaryTokenCount: summary.summaryTokenCount,
            compressionRatio: summary.tokenCount / summary.summaryTokenCount,
            sections: summary.sections.map(s => ({
              name: s.name,
              type: s.type,
              startLine: s.startLine,
              endLine: s.endLine,
              summary: s.summary,
              tokenCount: s.tokenCount,
              summaryTokenCount: s.summaryTokenCount,
            })),
            complexity: summary.complexity,
            entityCount: summary.entities.length,
          },
        });
      }

      case 'get-at-detail-level': {
        const { filePath, content, level = 2, keyEntities } = params;
        if (!filePath || !content) {
          return NextResponse.json(
            { error: 'filePath and content are required' },
            { status: 400 }
          );
        }

        const summary = await codeSummarizer.summarizeFile(filePath, content);
        const atLevel = codeSummarizer.getAtDetailLevel(
          summary,
          level as 1 | 2 | 3 | 4,
          keyEntities
        );

        return NextResponse.json({
          success: true,
          content: atLevel,
          tokenCount: estimateTokenCount(atLevel),
          level,
        });
      }

      // ============================================================
      // FILE PAGING
      // ============================================================

      case 'load-file': {
        const { filePath, content, pageSize = 100 } = params;
        if (!filePath || !content) {
          return NextResponse.json(
            { error: 'filePath and content are required' },
            { status: 400 }
          );
        }

        const pagedFile = filePager.loadFile(filePath, content, pageSize);

        return NextResponse.json({
          success: true,
          file: {
            filePath: pagedFile.filePath,
            totalLines: pagedFile.totalLines,
            totalPages: pagedFile.totalPages,
            pageSize: pagedFile.pageSize,
            currentPage: pagedFile.currentPage,
          },
        });
      }

      case 'get-page': {
        const { filePath, pageNumber = 0 } = params;
        if (!filePath) {
          return NextResponse.json(
            { error: 'filePath is required' },
            { status: 400 }
          );
        }

        const content = filePager.getPage(filePath, pageNumber);
        const info = filePager.getFileInfo(filePath);

        if (content === null) {
          return NextResponse.json(
            { error: 'File not loaded. Use load-file first.' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          content,
          page: pageNumber,
          totalPages: info?.totalPages,
          totalLines: info?.totalLines,
        });
      }

      case 'get-page-for-line': {
        const { filePath, lineNumber } = params;
        if (!filePath || typeof lineNumber !== 'number') {
          return NextResponse.json(
            { error: 'filePath and lineNumber are required' },
            { status: 400 }
          );
        }

        const result = filePager.getPageForLine(filePath, lineNumber);
        if (!result) {
          return NextResponse.json(
            { error: 'Line not found or file not loaded' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          ...result,
        });
      }

      case 'get-line-range': {
        const { filePath, startLine, endLine } = params;
        if (!filePath || typeof startLine !== 'number' || typeof endLine !== 'number') {
          return NextResponse.json(
            { error: 'filePath, startLine, and endLine are required' },
            { status: 400 }
          );
        }

        const content = filePager.getLineRange(filePath, startLine, endLine);
        if (content === null) {
          return NextResponse.json(
            { error: 'Lines not found or file not loaded' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          content,
          startLine,
          endLine,
        });
      }

      case 'get-file-info': {
        const { filePath } = params;
        if (!filePath) {
          return NextResponse.json(
            { error: 'filePath is required' },
            { status: 400 }
          );
        }

        const info = filePager.getFileInfo(filePath);
        if (!info) {
          return NextResponse.json(
            { error: 'File not loaded' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          ...info,
        });
      }

      case 'unload-file': {
        const { filePath } = params;
        if (!filePath) {
          return NextResponse.json(
            { error: 'filePath is required' },
            { status: 400 }
          );
        }

        filePager.unloadFile(filePath);
        return NextResponse.json({ success: true });
      }

      // ============================================================
      // RELEVANCE SELECTION
      // ============================================================

      case 'score-by-relevance': {
        const { query, items } = params;
        if (!query || !items || !Array.isArray(items)) {
          return NextResponse.json(
            { error: 'query and items array are required' },
            { status: 400 }
          );
        }

        const contextItems: ContextItem[] = items.map((item: any, index: number) => ({
          id: item.id || `item_${index}`,
          type: item.type || 'code',
          content: item.content,
          source: item.source || 'unknown',
          relevanceScore: item.relevanceScore || 0.5,
          tokenCount: estimateTokenCount(item.content),
          timestamp: item.timestamp || Date.now(),
        }));

        const scored = await relevanceSelector.scoreByRelevance(contextItems, query);

        return NextResponse.json({
          success: true,
          scored: scored.map(({ item, score }) => ({
            id: item.id,
            source: item.source,
            score,
            tokenCount: item.tokenCount,
          })),
        });
      }

      case 'select-relevant': {
        const { query, items, maxTokens = 4000, minScore = 0.5 } = params;
        if (!query || !items || !Array.isArray(items)) {
          return NextResponse.json(
            { error: 'query and items array are required' },
            { status: 400 }
          );
        }

        const contextItems: ContextItem[] = items.map((item: any, index: number) => ({
          id: item.id || `item_${index}`,
          type: item.type || 'code',
          content: item.content,
          source: item.source || 'unknown',
          relevanceScore: item.relevanceScore || 0.5,
          tokenCount: estimateTokenCount(item.content),
          timestamp: item.timestamp || Date.now(),
        }));

        const selected = await relevanceSelector.selectRelevant(
          contextItems,
          query,
          maxTokens,
          minScore
        );

        return NextResponse.json({
          success: true,
          selected: selected.map(item => ({
            id: item.id,
            type: item.type,
            source: item.source,
            tokenCount: item.tokenCount,
            content: params.includeContent ? item.content : undefined,
          })),
          totalTokens: selected.reduce((sum, item) => sum + item.tokenCount, 0),
        });
      }

      // ============================================================
      // SLIDING WINDOW
      // ============================================================

      case 'create-sliding-window': {
        const { maxTokens = 4000, overlapTokens = 500 } = params;
        // Note: Sliding windows are typically per-session, so we just return config
        return NextResponse.json({
          success: true,
          config: {
            maxTokens,
            overlapTokens,
          },
          message: 'Use client-side createSlidingWindow() for session-based windows',
        });
      }

      // ============================================================
      // TOKEN UTILITIES
      // ============================================================

      case 'estimate-tokens': {
        const { text } = params;
        if (!text) {
          return NextResponse.json(
            { error: 'text is required' },
            { status: 400 }
          );
        }

        const tokens = estimateTokenCount(text);
        return NextResponse.json({
          success: true,
          tokens,
          chars: text.length,
          words: text.split(/\s+/).filter((w: string) => w.length > 0).length,
        });
      }

      case 'truncate-to-tokens': {
        const { text, maxTokens } = params;
        if (!text || typeof maxTokens !== 'number') {
          return NextResponse.json(
            { error: 'text and maxTokens are required' },
            { status: 400 }
          );
        }

        const truncated = truncateToTokens(text, maxTokens);
        return NextResponse.json({
          success: true,
          content: truncated,
          originalTokens: estimateTokenCount(text),
          truncatedTokens: estimateTokenCount(truncated),
          wasTruncated: truncated !== text,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Context API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  switch (action) {
    case 'stats':
      return NextResponse.json({
        success: true,
        stats: contextManager.getStats(),
      });

    case 'help':
      return NextResponse.json({
        success: true,
        actions: {
          contextWindow: [
            'add-item',
            'add-code-file',
            'add-code-entity',
            'add-conversation',
            'add-memory',
            'add-task',
            'remove-item',
            'update-relevance',
            'build-context',
            'get-stats',
            'clear-context',
            'clear-old',
          ],
          summarization: [
            'summarize-file',
            'get-at-detail-level',
          ],
          paging: [
            'load-file',
            'get-page',
            'get-page-for-line',
            'get-line-range',
            'get-file-info',
            'unload-file',
          ],
          relevance: [
            'score-by-relevance',
            'select-relevant',
          ],
          utilities: [
            'estimate-tokens',
            'truncate-to-tokens',
            'create-sliding-window',
          ],
        },
      });

    default:
      return NextResponse.json({
        success: true,
        message: 'Context Management API',
        usage: 'POST with { action: "...", ...params } or GET ?action=stats|help',
      });
  }
}
