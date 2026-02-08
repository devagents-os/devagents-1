/**
 * Context Window Management System
 * 
 * Implements intelligent context management for AI agent operations:
 * - Sliding window context management
 * - Hierarchical code summarization
 * - Relevance-based context selection
 * - Large file paging support
 */

import { generateEmbedding, cosineSimilarity } from './embeddings';
import { codeAnalyzer, CodeEntity, CodeAnalysisResult } from './codeAnalysis';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface ContextItem {
  id: string;
  type: 'code' | 'memory' | 'conversation' | 'task' | 'documentation' | 'summary';
  content: string;
  source: string;
  relevanceScore: number;
  tokenCount: number;
  timestamp: number;
  metadata?: {
    filePath?: string;
    lineRange?: [number, number];
    entityName?: string;
    entityType?: string;
    summarizedFrom?: string;
    compressionRatio?: number;
  };
}

export interface ContextWindow {
  items: ContextItem[];
  totalTokens: number;
  maxTokens: number;
  usedPercentage: number;
}

export interface FileSummary {
  filePath: string;
  fullContent: string;
  summary: string;
  entities: CodeEntity[];
  complexity: CodeAnalysisResult['complexity'];
  sections: FileSectionSummary[];
  tokenCount: number;
  summaryTokenCount: number;
}

export interface FileSectionSummary {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'import' | 'export' | 'other';
  startLine: number;
  endLine: number;
  content: string;
  summary: string;
  tokenCount: number;
  summaryTokenCount: number;
}

export interface PagedFile {
  filePath: string;
  totalLines: number;
  totalPages: number;
  pageSize: number;
  currentPage: number;
  pages: Map<number, string>;
  lineIndex: Map<number, number>; // line number -> page number
}

export interface ContextSelectionOptions {
  maxTokens: number;
  priorityWeights?: {
    recency: number;
    relevance: number;
    importance: number;
  };
  requiredItems?: string[]; // IDs of items that must be included
  excludeItems?: string[]; // IDs of items to exclude
  preferSummaries?: boolean; // Use summaries over full content when possible
}

// ============================================================
// TOKEN ESTIMATION
// ============================================================

/**
 * Estimate token count for text (roughly 4 chars per token for English/code)
 * More accurate than simple word count for code
 */
export function estimateTokenCount(text: string): number {
  // Account for code-specific tokens (operators, brackets, etc.)
  const codeTokens = text.match(/[{}()\[\];,.<>:?!@#$%^&*+=\-/\\|`~"']/g)?.length || 0;
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const chars = text.length;
  
  // Hybrid estimation: mix of char-based and word-based
  const charBasedEstimate = Math.ceil(chars / 4);
  const wordBasedEstimate = Math.ceil(words * 1.3);
  
  return Math.max(charBasedEstimate, wordBasedEstimate) + Math.ceil(codeTokens * 0.5);
}

/**
 * Truncate text to approximate token limit
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const currentTokens = estimateTokenCount(text);
  if (currentTokens <= maxTokens) return text;
  
  // Estimate characters needed
  const ratio = maxTokens / currentTokens;
  const targetChars = Math.floor(text.length * ratio * 0.95); // 5% buffer
  
  return text.substring(0, targetChars) + '\n... [truncated]';
}

// ============================================================
// HIERARCHICAL CODE SUMMARIZATION
// ============================================================

/**
 * Generate hierarchical summaries of code files
 */
export class CodeSummarizer {
  private summaryCache: Map<string, FileSummary> = new Map();
  
  /**
   * Create a hierarchical summary of a code file
   */
  async summarizeFile(filePath: string, content: string): Promise<FileSummary> {
    // Check cache
    const cacheKey = `${filePath}:${this.hashContent(content)}`;
    if (this.summaryCache.has(cacheKey)) {
      return this.summaryCache.get(cacheKey)!;
    }
    
    // Analyze the file
    codeAnalyzer.clear();
    codeAnalyzer.addFiles([{ path: filePath, content }]);
    const analysis = codeAnalyzer.analyzeFile(filePath);
    
    // Extract sections based on entities
    const sections = this.extractSections(content, analysis.entities);
    
    // Generate overall summary
    const summary = this.generateFileSummary(filePath, content, analysis, sections);
    
    const result: FileSummary = {
      filePath,
      fullContent: content,
      summary,
      entities: analysis.entities,
      complexity: analysis.complexity,
      sections,
      tokenCount: estimateTokenCount(content),
      summaryTokenCount: estimateTokenCount(summary),
    };
    
    this.summaryCache.set(cacheKey, result);
    return result;
  }
  
  /**
   * Extract logical sections from code
   */
  private extractSections(content: string, entities: CodeEntity[]): FileSectionSummary[] {
    const lines = content.split('\n');
    const sections: FileSectionSummary[] = [];
    
    // Extract import section
    const importLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^import\s|^const\s.*=\s*require|^from\s/)) {
        importLines.push(i);
      }
    }
    
    if (importLines.length > 0) {
      const startLine = importLines[0];
      const endLine = importLines[importLines.length - 1];
      const importContent = lines.slice(startLine, endLine + 1).join('\n');
      sections.push({
        name: 'imports',
        type: 'import',
        startLine: startLine + 1,
        endLine: endLine + 1,
        content: importContent,
        summary: `${importLines.length} import statements`,
        tokenCount: estimateTokenCount(importContent),
        summaryTokenCount: 5,
      });
    }
    
    // Create sections from entities
    for (const entity of entities) {
      if (entity.startLine && entity.endLine) {
        const entityContent = lines.slice(entity.startLine - 1, entity.endLine).join('\n');
        const entitySummary = this.summarizeEntity(entity, entityContent);
        
        sections.push({
          name: entity.name,
          type: entity.type as FileSectionSummary['type'],
          startLine: entity.startLine,
          endLine: entity.endLine,
          content: entityContent,
          summary: entitySummary,
          tokenCount: estimateTokenCount(entityContent),
          summaryTokenCount: estimateTokenCount(entitySummary),
        });
      }
    }
    
    // Sort by line number
    sections.sort((a, b) => a.startLine - b.startLine);
    
    return sections;
  }
  
  /**
   * Generate a summary for a code entity
   */
  private summarizeEntity(entity: CodeEntity, content: string): string {
    const lines = content.split('\n');
    
    switch (entity.type) {
      case 'function':
        const params = entity.parameters?.join(', ') || '';
        const returnType = entity.returnType || 'unknown';
        const complexity = entity.complexity ? ` (complexity: ${entity.complexity})` : '';
        return `function ${entity.name}(${params}): ${returnType}${complexity} - ${entity.calls?.length || 0} calls`;
        
      case 'class':
        const methods = entity.methods?.length || 0;
        const props = entity.properties?.length || 0;
        return `class ${entity.name} - ${methods} methods, ${props} properties`;
        
      case 'interface':
        return `interface ${entity.name} - type definition`;
        
      case 'type':
        return `type ${entity.name} - type alias`;
        
      case 'variable':
        return `const/let ${entity.name}`;
        
      default:
        return `${entity.type} ${entity.name}`;
    }
  }
  
  /**
   * Generate overall file summary
   */
  private generateFileSummary(
    filePath: string,
    content: string,
    analysis: CodeAnalysisResult,
    sections: FileSectionSummary[]
  ): string {
    const lines: string[] = [];
    
    // File header
    lines.push(`// File: ${filePath}`);
    lines.push(`// Lines: ${content.split('\n').length}, Complexity: ${analysis.complexity.cyclomaticComplexity}`);
    lines.push('');
    
    // Imports summary
    const importSection = sections.find(s => s.type === 'import');
    if (importSection) {
      lines.push(`// ${importSection.summary}`);
    }
    
    // Entity summaries
    const entitySections = sections.filter(s => s.type !== 'import');
    if (entitySections.length > 0) {
      lines.push('');
      lines.push('// Exports:');
      for (const section of entitySections) {
        if (section.content.includes('export')) {
          lines.push(`//   ${section.summary}`);
        }
      }
      
      const internal = entitySections.filter(s => !s.content.includes('export'));
      if (internal.length > 0) {
        lines.push('');
        lines.push('// Internal:');
        for (const section of internal.slice(0, 5)) { // Limit to top 5
          lines.push(`//   ${section.summary}`);
        }
        if (internal.length > 5) {
          lines.push(`//   ... and ${internal.length - 5} more`);
        }
      }
    }
    
    // Issues summary
    if (analysis.issues.length > 0) {
      lines.push('');
      lines.push(`// Issues: ${analysis.issues.length} (${analysis.issues.filter(i => i.type === 'error').length} errors)`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Get a compressed version of a file at a specific detail level
   * Level 1: Just the summary (minimal)
   * Level 2: Summary + entity signatures
   * Level 3: Summary + full function bodies for key functions
   * Level 4: Full content
   */
  getAtDetailLevel(summary: FileSummary, level: 1 | 2 | 3 | 4, keyEntities?: string[]): string {
    switch (level) {
      case 1:
        return summary.summary;
        
      case 2:
        const signatures: string[] = [summary.summary, ''];
        for (const section of summary.sections) {
          if (section.type !== 'import') {
            // Extract just the signature (first line or declaration)
            const firstLine = section.content.split('\n')[0];
            signatures.push(firstLine.includes('{') ? firstLine.replace('{', '{ ... }') : firstLine);
          }
        }
        return signatures.join('\n');
        
      case 3:
        const detailed: string[] = [summary.summary, ''];
        for (const section of summary.sections) {
          if (section.type === 'import') {
            detailed.push(`// ${section.summary}`);
          } else if (keyEntities?.includes(section.name)) {
            detailed.push(section.content);
          } else {
            detailed.push(`// ${section.summary}`);
          }
        }
        return detailed.join('\n\n');
        
      case 4:
      default:
        return summary.fullContent;
    }
  }
  
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  
  clearCache(): void {
    this.summaryCache.clear();
  }
}

// ============================================================
// LARGE FILE PAGING
// ============================================================

/**
 * Manage paging through large files
 */
export class FilePager {
  private pagedFiles: Map<string, PagedFile> = new Map();
  private defaultPageSize: number = 100; // lines per page
  
  /**
   * Load a file for paging
   */
  loadFile(filePath: string, content: string, pageSize?: number): PagedFile {
    const lines = content.split('\n');
    const actualPageSize = pageSize || this.defaultPageSize;
    const totalPages = Math.ceil(lines.length / actualPageSize);
    
    const pages = new Map<number, string>();
    const lineIndex = new Map<number, number>();
    
    for (let page = 0; page < totalPages; page++) {
      const startLine = page * actualPageSize;
      const endLine = Math.min(startLine + actualPageSize, lines.length);
      const pageContent = lines.slice(startLine, endLine).join('\n');
      pages.set(page, pageContent);
      
      // Build line index
      for (let line = startLine; line < endLine; line++) {
        lineIndex.set(line + 1, page); // 1-indexed lines
      }
    }
    
    const pagedFile: PagedFile = {
      filePath,
      totalLines: lines.length,
      totalPages,
      pageSize: actualPageSize,
      currentPage: 0,
      pages,
      lineIndex,
    };
    
    this.pagedFiles.set(filePath, pagedFile);
    return pagedFile;
  }
  
  /**
   * Get a specific page
   */
  getPage(filePath: string, pageNumber: number): string | null {
    const file = this.pagedFiles.get(filePath);
    if (!file) return null;
    
    const page = Math.max(0, Math.min(pageNumber, file.totalPages - 1));
    file.currentPage = page;
    return file.pages.get(page) || null;
  }
  
  /**
   * Get the page containing a specific line
   */
  getPageForLine(filePath: string, lineNumber: number): { page: number; content: string } | null {
    const file = this.pagedFiles.get(filePath);
    if (!file) return null;
    
    const page = file.lineIndex.get(lineNumber);
    if (page === undefined) return null;
    
    return {
      page,
      content: file.pages.get(page) || '',
    };
  }
  
  /**
   * Get a range of lines (may span multiple pages)
   */
  getLineRange(filePath: string, startLine: number, endLine: number): string | null {
    const file = this.pagedFiles.get(filePath);
    if (!file) return null;
    
    const startPage = file.lineIndex.get(startLine);
    const endPage = file.lineIndex.get(endLine);
    
    if (startPage === undefined || endPage === undefined) return null;
    
    // Collect content from all relevant pages
    const content: string[] = [];
    for (let page = startPage; page <= endPage; page++) {
      const pageContent = file.pages.get(page);
      if (pageContent) {
        const pageLines = pageContent.split('\n');
        const pageStartLine = page * file.pageSize + 1;
        
        for (let i = 0; i < pageLines.length; i++) {
          const lineNum = pageStartLine + i;
          if (lineNum >= startLine && lineNum <= endLine) {
            content.push(pageLines[i]);
          }
        }
      }
    }
    
    return content.join('\n');
  }
  
  /**
   * Get file info
   */
  getFileInfo(filePath: string): { totalLines: number; totalPages: number; currentPage: number } | null {
    const file = this.pagedFiles.get(filePath);
    if (!file) return null;
    
    return {
      totalLines: file.totalLines,
      totalPages: file.totalPages,
      currentPage: file.currentPage,
    };
  }
  
  /**
   * Unload a file
   */
  unloadFile(filePath: string): void {
    this.pagedFiles.delete(filePath);
  }
  
  /**
   * Clear all paged files
   */
  clear(): void {
    this.pagedFiles.clear();
  }
}

// ============================================================
// CONTEXT WINDOW MANAGER
// ============================================================

/**
 * Manages the context window with intelligent selection and prioritization
 */
export class ContextWindowManager {
  private items: Map<string, ContextItem> = new Map();
  private maxTokens: number;
  private summarizer: CodeSummarizer;
  private pager: FilePager;
  
  constructor(maxTokens: number = 8000) {
    this.maxTokens = maxTokens;
    this.summarizer = new CodeSummarizer();
    this.pager = new FilePager();
  }
  
  /**
   * Add an item to the context
   */
  addItem(item: Omit<ContextItem, 'id' | 'tokenCount'>): string {
    const id = this.generateId();
    const tokenCount = estimateTokenCount(item.content);
    
    const contextItem: ContextItem = {
      ...item,
      id,
      tokenCount,
    };
    
    this.items.set(id, contextItem);
    return id;
  }
  
  /**
   * Add a code file to the context with automatic summarization
   */
  async addCodeFile(
    filePath: string,
    content: string,
    relevanceScore: number = 0.5,
    preferSummary: boolean = true
  ): Promise<string> {
    const summary = await this.summarizer.summarizeFile(filePath, content);
    
    // Decide detail level based on file size and relevance
    let detailLevel: 1 | 2 | 3 | 4 = 4;
    if (preferSummary) {
      if (summary.tokenCount > 2000) {
        detailLevel = relevanceScore > 0.8 ? 3 : relevanceScore > 0.5 ? 2 : 1;
      } else if (summary.tokenCount > 500) {
        detailLevel = relevanceScore > 0.8 ? 4 : 3;
      }
    }
    
    const contentAtLevel = this.summarizer.getAtDetailLevel(summary, detailLevel);
    
    return this.addItem({
      type: 'code',
      content: contentAtLevel,
      source: filePath,
      relevanceScore,
      timestamp: Date.now(),
      metadata: {
        filePath,
        compressionRatio: detailLevel < 4 ? summary.tokenCount / estimateTokenCount(contentAtLevel) : 1,
        summarizedFrom: detailLevel < 4 ? 'full content' : undefined,
      },
    });
  }
  
  /**
   * Add a specific code entity (function, class, etc.)
   */
  async addCodeEntity(
    filePath: string,
    content: string,
    entityName: string,
    relevanceScore: number = 0.7
  ): Promise<string | null> {
    const summary = await this.summarizer.summarizeFile(filePath, content);
    const section = summary.sections.find(s => s.name === entityName);
    
    if (!section) return null;
    
    return this.addItem({
      type: 'code',
      content: section.content,
      source: `${filePath}:${section.startLine}-${section.endLine}`,
      relevanceScore,
      timestamp: Date.now(),
      metadata: {
        filePath,
        lineRange: [section.startLine, section.endLine],
        entityName: section.name,
        entityType: section.type,
      },
    });
  }
  
  /**
   * Add conversation context
   */
  addConversation(content: string, relevanceScore: number = 0.6): string {
    return this.addItem({
      type: 'conversation',
      content,
      source: 'conversation',
      relevanceScore,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Add memory item
   */
  addMemory(content: string, source: string, relevanceScore: number = 0.5): string {
    return this.addItem({
      type: 'memory',
      content,
      source,
      relevanceScore,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Add task context
   */
  addTask(content: string, relevanceScore: number = 0.8): string {
    return this.addItem({
      type: 'task',
      content,
      source: 'current_task',
      relevanceScore,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Remove an item
   */
  removeItem(id: string): boolean {
    return this.items.delete(id);
  }
  
  /**
   * Update relevance score for an item
   */
  updateRelevance(id: string, score: number): void {
    const item = this.items.get(id);
    if (item) {
      item.relevanceScore = Math.max(0, Math.min(1, score));
    }
  }
  
  /**
   * Build optimized context window based on selection options
   */
  buildContext(options: ContextSelectionOptions): ContextWindow {
    const weights = options.priorityWeights || {
      recency: 0.2,
      relevance: 0.6,
      importance: 0.2,
    };
    
    // Filter items
    let candidates = Array.from(this.items.values()).filter(item => {
      if (options.excludeItems?.includes(item.id)) return false;
      return true;
    });
    
    // Score each item
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    const scoredItems = candidates.map(item => {
      const age = now - item.timestamp;
      const recencyScore = Math.max(0, 1 - (age / maxAge));
      
      const score = 
        (recencyScore * weights.recency) +
        (item.relevanceScore * weights.relevance) +
        (this.getImportanceScore(item) * weights.importance);
      
      return { item, score };
    });
    
    // Sort by score
    scoredItems.sort((a, b) => b.score - a.score);
    
    // Select items that fit in token budget
    const selected: ContextItem[] = [];
    let totalTokens = 0;
    
    // First, add required items
    if (options.requiredItems) {
      for (const id of options.requiredItems) {
        const item = this.items.get(id);
        if (item && totalTokens + item.tokenCount <= options.maxTokens) {
          selected.push(item);
          totalTokens += item.tokenCount;
        }
      }
    }
    
    // Then add highest-scored items that fit
    for (const { item } of scoredItems) {
      if (selected.find(s => s.id === item.id)) continue; // Already added as required
      
      if (totalTokens + item.tokenCount <= options.maxTokens) {
        selected.push(item);
        totalTokens += item.tokenCount;
      } else if (options.preferSummaries && item.type === 'code') {
        // Try to add a compressed version
        const compressed = this.compressItem(item, options.maxTokens - totalTokens);
        if (compressed) {
          selected.push(compressed);
          totalTokens += compressed.tokenCount;
        }
      }
    }
    
    return {
      items: selected,
      totalTokens,
      maxTokens: options.maxTokens,
      usedPercentage: (totalTokens / options.maxTokens) * 100,
    };
  }
  
  /**
   * Build context string from window
   */
  buildContextString(window: ContextWindow): string {
    const sections: string[] = [];
    
    // Group by type
    const byType = new Map<string, ContextItem[]>();
    for (const item of window.items) {
      const items = byType.get(item.type) || [];
      items.push(item);
      byType.set(item.type, items);
    }
    
    // Build sections
    const typeOrder = ['task', 'code', 'memory', 'conversation', 'documentation', 'summary'];
    
    for (const type of typeOrder) {
      const items = byType.get(type);
      if (!items || items.length === 0) continue;
      
      sections.push(`=== ${type.toUpperCase()} CONTEXT ===`);
      for (const item of items) {
        sections.push(`[${item.source}]`);
        sections.push(item.content);
        sections.push('');
      }
    }
    
    return sections.join('\n');
  }
  
  /**
   * Get current context statistics
   */
  getStats(): {
    itemCount: number;
    totalTokens: number;
    byType: Record<string, { count: number; tokens: number }>;
  } {
    const byType: Record<string, { count: number; tokens: number }> = {};
    let totalTokens = 0;
    
    for (const item of this.items.values()) {
      totalTokens += item.tokenCount;
      
      if (!byType[item.type]) {
        byType[item.type] = { count: 0, tokens: 0 };
      }
      byType[item.type].count++;
      byType[item.type].tokens += item.tokenCount;
    }
    
    return {
      itemCount: this.items.size,
      totalTokens,
      byType,
    };
  }
  
  /**
   * Clear all context
   */
  clear(): void {
    this.items.clear();
    this.summarizer.clearCache();
    this.pager.clear();
  }
  
  /**
   * Clear old items based on age
   */
  clearOlderThan(maxAgeMs: number): number {
    const now = Date.now();
    let cleared = 0;
    
    for (const [id, item] of this.items) {
      if (now - item.timestamp > maxAgeMs) {
        this.items.delete(id);
        cleared++;
      }
    }
    
    return cleared;
  }
  
  /**
   * Get the file pager for large file operations
   */
  getFilePager(): FilePager {
    return this.pager;
  }
  
  /**
   * Get the code summarizer
   */
  getCodeSummarizer(): CodeSummarizer {
    return this.summarizer;
  }
  
  private getImportanceScore(item: ContextItem): number {
    // Higher importance for tasks and recent items
    const typeScores: Record<string, number> = {
      task: 0.9,
      code: 0.7,
      memory: 0.5,
      conversation: 0.6,
      documentation: 0.4,
      summary: 0.3,
    };
    
    return typeScores[item.type] || 0.5;
  }
  
  private compressItem(item: ContextItem, maxTokens: number): ContextItem | null {
    if (maxTokens < 50) return null; // Too small to be useful
    
    const compressed = truncateToTokens(item.content, maxTokens);
    const tokenCount = estimateTokenCount(compressed);
    
    if (tokenCount > maxTokens) return null;
    
    return {
      ...item,
      id: this.generateId(),
      content: compressed,
      tokenCount,
      metadata: {
        ...item.metadata,
        summarizedFrom: item.id,
        compressionRatio: item.tokenCount / tokenCount,
      },
    };
  }
  
  private generateId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================
// RELEVANCE-BASED CONTEXT SELECTION
// ============================================================

/**
 * Select context items based on semantic relevance to a query
 */
export class RelevanceSelector {
  private embeddingCache: Map<string, number[]> = new Map();
  
  /**
   * Score items by relevance to a query using embeddings
   */
  async scoreByRelevance(
    items: ContextItem[],
    query: string
  ): Promise<Array<{ item: ContextItem; score: number }>> {
    // Get query embedding
    const queryEmbedding = await this.getEmbedding(query);
    
    // Score each item
    const scored: Array<{ item: ContextItem; score: number }> = [];
    
    for (const item of items) {
      const itemEmbedding = await this.getEmbedding(item.content);
      const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);
      
      scored.push({
        item,
        score: similarity,
      });
    }
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    return scored;
  }
  
  /**
   * Select the most relevant items within a token budget
   */
  async selectRelevant(
    items: ContextItem[],
    query: string,
    maxTokens: number,
    minScore: number = 0.5
  ): Promise<ContextItem[]> {
    const scored = await this.scoreByRelevance(items, query);
    
    const selected: ContextItem[] = [];
    let totalTokens = 0;
    
    for (const { item, score } of scored) {
      if (score < minScore) break; // Stop if below threshold
      
      if (totalTokens + item.tokenCount <= maxTokens) {
        selected.push(item);
        totalTokens += item.tokenCount;
      }
    }
    
    return selected;
  }
  
  /**
   * Get or compute embedding for text
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const hash = this.hashText(text);
    
    if (this.embeddingCache.has(hash)) {
      return this.embeddingCache.get(hash)!;
    }
    
    try {
      const result = await generateEmbedding(text);
      this.embeddingCache.set(hash, result.embedding);
      return result.embedding;
    } catch (error) {
      console.error('Failed to get embedding:', error);
      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }
  
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 1000); i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  
  clearCache(): void {
    this.embeddingCache.clear();
  }
}

// ============================================================
// SLIDING WINDOW CONTEXT
// ============================================================

/**
 * Implements a sliding window for conversation/task context
 */
export class SlidingWindowContext {
  private window: Array<{ content: string; timestamp: number; tokens: number }> = [];
  private maxTokens: number;
  private overlapTokens: number;
  
  constructor(maxTokens: number = 4000, overlapTokens: number = 500) {
    this.maxTokens = maxTokens;
    this.overlapTokens = overlapTokens;
  }
  
  /**
   * Add content to the sliding window
   */
  add(content: string): void {
    const tokens = estimateTokenCount(content);
    
    this.window.push({
      content,
      timestamp: Date.now(),
      tokens,
    });
    
    // Trim window if over budget
    this.trimWindow();
  }
  
  /**
   * Get current window content
   */
  getContent(): string {
    return this.window.map(w => w.content).join('\n\n');
  }
  
  /**
   * Get window content with timestamps
   */
  getContentWithTimestamps(): Array<{ content: string; timestamp: number }> {
    return this.window.map(w => ({
      content: w.content,
      timestamp: w.timestamp,
    }));
  }
  
  /**
   * Get total tokens in window
   */
  getTotalTokens(): number {
    return this.window.reduce((sum, w) => sum + w.tokens, 0);
  }
  
  /**
   * Clear the window
   */
  clear(): void {
    this.window = [];
  }
  
  /**
   * Create a summary of trimmed content
   */
  private createTrimSummary(items: typeof this.window): string {
    const totalTokens = items.reduce((sum, i) => sum + i.tokens, 0);
    const contentPreview = items
      .map(i => i.content.substring(0, 100))
      .join(' ... ')
      .substring(0, 300);
    
    return `[Previous context: ${items.length} items, ~${totalTokens} tokens. Preview: ${contentPreview}...]`;
  }
  
  private trimWindow(): void {
    let totalTokens = this.getTotalTokens();
    
    while (totalTokens > this.maxTokens && this.window.length > 1) {
      // Remove oldest items but create a summary
      const removed = this.window.shift()!;
      totalTokens -= removed.tokens;
      
      // If we're removing significant content, add a summary
      if (removed.tokens > 100) {
        const summary = this.createTrimSummary([removed]);
        const summaryTokens = estimateTokenCount(summary);
        
        // Only add summary if it fits within overlap budget
        if (summaryTokens <= this.overlapTokens) {
          this.window.unshift({
            content: summary,
            timestamp: removed.timestamp,
            tokens: summaryTokens,
          });
          totalTokens += summaryTokens;
        }
      }
    }
  }
}

// ============================================================
// EXPORTS
// ============================================================

export const contextManager = new ContextWindowManager();
export const codeSummarizer = new CodeSummarizer();
export const filePager = new FilePager();
export const relevanceSelector = new RelevanceSelector();

export function createSlidingWindow(maxTokens?: number, overlapTokens?: number): SlidingWindowContext {
  return new SlidingWindowContext(maxTokens, overlapTokens);
}

export function createContextManager(maxTokens?: number): ContextWindowManager {
  return new ContextWindowManager(maxTokens);
}
