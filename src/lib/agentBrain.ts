import { agentMemory, skillManager, createUserMemory, summarizeForStorage, knowledgeGraph } from './agentMemory';
import { CodeExecutor, TestRunner } from './codeExecution';
import { GitHubIntegration } from './github';
import { hierarchicalPlanner } from './hierarchicalPlanning';
import { supabaseAdmin } from './supabase';
import { codeAnalyzer, CodeEntity, CodeAnalysisResult } from './codeAnalysis';
import { getDockerManager, DockerWorkspace, DockerExecResult } from './dockerManager';
import { getWorkspaceManager, WorkspaceConfig } from './workspaceManager';
import { 
  diffEditor, 
  DiffParser, 
  LineRangeEditor,
  type ASTModification,
  type EditResult,
  type MultiFileEdit,
  type ValidationError 
} from './diffEditor';
import {
  ContextWindowManager,
  CodeSummarizer,
  FilePager,
  RelevanceSelector,
  SlidingWindowContext,
  createContextManager,
  createSlidingWindow,
  estimateTokenCount,
  truncateToTokens,
  type ContextItem,
  type ContextWindow,
  type ContextSelectionOptions,
  type FileSummary,
} from './contextManager';
import {
  hallucinationPrevention,
  HallucinationPreventionService,
  type VerificationResult,
  type ConfidenceScore,
  type GroundingCheck,
  type SyntaxVerification,
  type VerificationChallenge,
} from './hallucinationPrevention';
import {
  documentationGenerator,
  DocumentationGenerator,
  type CommitMessage,
  type CommitMessageOptions,
  type InlineComment,
  type ActionExplanation,
  type DocumentationUpdate,
  type PRDescription,
  type CodeDocumentation,
  type ComplexityThreshold,
} from './documentationGenerator';
import {
  debugLoop,
  debugLogger,
  errorParser,
  DebugLoop,
  DebugLogger,
  ErrorParser,
  type ParsedError,
  type FixHypothesis,
  type DebugSession,
  type DebugAttempt,
  type DebugConfig,
  type CodeChange,
  type TestResult,
  type BuildResult,
} from './debuggingSystem';
import {
  GitWorkflowManager,
  GitHubWorkflowIntegration,
  getGitWorkflowManager,
  createGitHubWorkflowIntegration,
  type GitCloneOptions,
  type GitCommitOptions,
  type GitPushOptions,
  type GitMergeOptions,
  type GitRebaseOptions,
  type GitStatus,
  type MergeConflict,
  type ConflictResolution,
  type CIWorkflowRun,
  type PRReview,
  type PRReviewComment,
} from './gitWorkflow';
import {
  EnhancedTestRunner,
  TestGenerator,
  TestOutputParser,
  TDDWorkflow,
  createTestRunner,
  type TestFramework,
  type ParsedTestResult,
  type ParsedTestFailure,
  type GeneratedTest,
  type CoverageReport,
  type TDDSession,
  type TDDStep,
} from './testingSystem';
import { Octokit } from 'octokit';

export interface AgentContext {
  userId: string;
  task: string;
  previousActions: string[];
  codeContext?: {
    files?: Array<{ path: string; content: string }>;
    focusedFile?: string;
    focusedFunction?: string;
  };
  screenState?: {
    activeApp: string | null;
    browserUrl: string;
    visibleWindows: string[];
  };
}

export interface LearnedInsight {
  type: 'pattern' | 'solution' | 'error_fix' | 'optimization' | 'fact' | 'concept';
  content: string;
  importance: number;
  entities?: string[];
  relations?: Array<{ target: string; type: string }>;
}

// Task classification using semantic analysis
export type TaskType = 
  | 'code_writing'
  | 'code_debugging'
  | 'code_refactoring'
  | 'code_review'
  | 'github_operation'
  | 'research'
  | 'memory_retrieval'
  | 'general';

interface TaskClassification {
  type: TaskType;
  confidence: number;
  relevantEntities: string[];
  suggestedApproach: string;
}

export class AgentBrain {
  private userId: string;
  private userMemory: ReturnType<typeof createUserMemory>;
  private codeExecutor: CodeExecutor;
  private testRunner: TestRunner;
  private github: GitHubIntegration;
  
  // Context management
  private contextManager: ContextWindowManager;
  private slidingWindow: SlidingWindowContext;
  private relevanceSelector: RelevanceSelector;
  private codeSummarizer: CodeSummarizer;
  private filePager: FilePager;
  
  // Git workflow management
  private gitWorkflow: GitWorkflowManager;
  private githubWorkflow: GitHubWorkflowIntegration | null = null;

  // Enhanced testing system
  private enhancedTestRunner: EnhancedTestRunner;
  
  constructor(userId: string) {
    this.userId = userId;
    this.userMemory = createUserMemory(userId);
    this.codeExecutor = new CodeExecutor(userId);
    this.testRunner = new TestRunner(userId);
    this.github = new GitHubIntegration(userId);
    
    // Initialize context management with configurable token limits
    this.contextManager = createContextManager(8000); // 8K token window by default
    this.slidingWindow = createSlidingWindow(4000, 500); // 4K tokens with 500 overlap
    this.relevanceSelector = new RelevanceSelector();
    this.codeSummarizer = new CodeSummarizer();
    this.filePager = new FilePager();
    
    // Initialize git workflow manager
    this.gitWorkflow = getGitWorkflowManager();

    // Initialize enhanced testing system
    this.enhancedTestRunner = createTestRunner(userId);
  }
  
  async think(context: AgentContext): Promise<{
    relevantMemories: string[];
    relevantSkills: string[];
    relevantKnowledgeNodes: any[];
    userPreferences: Record<string, unknown>;
    suggestedApproach: string;
    hierarchicalPlan?: string[];
    taskClassification: TaskClassification;
    codeAnalysis?: {
      entities: CodeEntity[];
      complexity: CodeAnalysisResult['complexity'];
      issues: CodeAnalysisResult['issues'];
    };
  }> {
    // Semantic task classification (replaces simple keyword matching)
    const taskClassification = this.classifyTask(context.task);
    
    // Analyze code context if provided
    let codeAnalysis: { entities: CodeEntity[]; complexity: CodeAnalysisResult['complexity']; issues: CodeAnalysisResult['issues'] } | undefined;
    if (context.codeContext?.files) {
      codeAnalyzer.clearCache();
      
      const analysisResults: CodeAnalysisResult[] = [];
      for (const file of context.codeContext.files) {
        const result = await codeAnalyzer.analyzeFile(file.path, file.content);
        analysisResults.push(result);
      }
      
      // Aggregate analysis results
      codeAnalysis = {
        entities: analysisResults.flatMap(r => r.entities),
        complexity: {
          cyclomaticComplexity: analysisResults.reduce((sum, r) => sum + r.complexity.cyclomaticComplexity, 0),
          linesOfCode: analysisResults.reduce((sum, r) => sum + r.complexity.linesOfCode, 0),
          functionCount: analysisResults.reduce((sum, r) => sum + r.complexity.functionCount, 0),
          classCount: analysisResults.reduce((sum, r) => sum + r.complexity.classCount, 0),
        },
        issues: analysisResults.flatMap(r => r.issues),
      };
      
      // Get dependency graph
      const depGraph = codeAnalyzer.getDependencyGraph();
      
      // Find entities related to the task by name matching
      const taskLower = context.task.toLowerCase();
      const taskEntities = codeAnalysis.entities.filter(e => 
        e.name.toLowerCase().includes(taskLower) || 
        taskLower.includes(e.name.toLowerCase())
      );
      taskClassification.relevantEntities = taskEntities.map(e => `${e.name} (${e.type}) at ${e.filePath}:${e.startLine}`);
    }
    
    const [universalMemories, userMemories, skills, preferences, graphNodes] = await Promise.all([
      agentMemory.searchUniversalMemory(context.task, 5),
      this.userMemory.searchMemories(context.task, 5),
      skillManager.searchSkills(context.task),
      this.userMemory.getAllPreferences(),
      knowledgeGraph.searchGraph(context.task),
    ]);
    
    const relevantMemories = [
      ...universalMemories.map(m => `[Universal] ${m.content}`),
      ...userMemories.map(m => `[User] ${m.content}`),
    ];
    
    const relevantSkills = [
      ...skills.map(s => `${s.skill_name}: ${s.description} (used ${s.usage_count}x, ${Math.round((s.success_rate || 0) * 100)}% success)`),
    ];

    // Expand context using Knowledge Graph
    const relevantKnowledgeNodes = [];
    for (const node of graphNodes) {
      const related = await knowledgeGraph.getRelatedNodes(node.id);
      relevantKnowledgeNodes.push({
        ...node,
        related: related.map(r => ({ type: r.relation, name: r.node.name }))
      });
    }
    
    // Use Hierarchical Planning (Tree of Thoughts) for complex tasks
    let hierarchicalPlan: string[] | undefined;
    const taskWords = context.task.toLowerCase().split(' ');
    if (context.task.length > 20 || taskWords.length > 4) {
      const taskContext = await this.getContextForTask(context.task, false);
      hierarchicalPlan = await hierarchicalPlanner.plan(context.task, {}, taskContext);
    }
    
    return {
      relevantMemories,
      relevantSkills,
      relevantKnowledgeNodes,
      userPreferences: preferences,
      suggestedApproach: taskClassification.suggestedApproach,
      hierarchicalPlan,
      taskClassification,
      codeAnalysis,
    };
  }

  /**
   * Semantic task classification using pattern matching and heuristics
   * Replaces simple keyword matching with more intelligent classification
   */
  private classifyTask(task: string): TaskClassification {
    const taskLower = task.toLowerCase();
    
    // Pattern-based classification with confidence scores
    const patterns: Array<{ type: TaskType; patterns: RegExp[]; approach: string }> = [
      {
        type: 'code_debugging',
        patterns: [
          /\b(fix|debug|error|bug|issue|crash|broken|not working|fails?|exception)\b/i,
          /\b(trace|stack|traceback|undefined|null|NaN)\b/i,
          /why (is|does|doesn't|isn't)/i,
        ],
        approach: 'Analyze error messages and stack traces. Use code analysis to trace the bug through call paths. Identify root cause before fixing.',
      },
      {
        type: 'code_refactoring',
        patterns: [
          /\b(refactor|clean|improve|optimize|restructure|reorganize|simplify)\b/i,
          /\b(performance|memory|speed|efficiency)\b/i,
          /make (it |this )?(better|faster|cleaner|more readable)/i,
        ],
        approach: 'Analyze code structure and dependencies. Identify code smells and anti-patterns. Plan incremental changes that preserve behavior.',
      },
      {
        type: 'code_review',
        patterns: [
          /\b(review|check|audit|analyze|examine|inspect|assess)\b/i,
          /\b(security|vulnerability|best practice|quality)\b/i,
          /what('s| is) wrong with/i,
        ],
        approach: 'Perform static analysis. Check for security vulnerabilities, code smells, and adherence to best practices. Provide actionable feedback.',
      },
      {
        type: 'code_writing',
        patterns: [
          /\b(write|create|implement|add|build|develop|make|generate)\b/i,
          /\b(function|class|component|module|api|endpoint|feature)\b/i,
          /\b(code|program|script|app|application)\b/i,
        ],
        approach: 'Understand requirements. Analyze existing code structure. Write code following project conventions and best practices.',
      },
      {
        type: 'github_operation',
        patterns: [
          /\b(github|git|repo|repository|branch|commit|push|pull|merge|pr|pull request)\b/i,
          /\b(clone|fork|release|deploy)\b/i,
        ],
        approach: 'Use GitHub integration. Check connection status first. Follow git workflow best practices.',
      },
      {
        type: 'research',
        patterns: [
          /\b(search|find|look for|browse|research|investigate)\b/i,
          /\b(documentation|docs|api|reference|example|tutorial)\b/i,
          /how (do|can|to|does)/i,
        ],
        approach: 'Search documentation and code examples. Gather relevant information before implementation.',
      },
      {
        type: 'memory_retrieval',
        patterns: [
          /\b(remember|recall|history|previous|last time|before)\b/i,
          /what (did|was|were)/i,
        ],
        approach: 'Search memories and past interactions for relevant context.',
      },
    ];

    let bestMatch: { type: TaskType; confidence: number; approach: string } = {
      type: 'general',
      confidence: 0.3,
      approach: 'Analyze the task and execute step by step.',
    };

    for (const { type, patterns: typePatterns, approach } of patterns) {
      let matchCount = 0;
      for (const pattern of typePatterns) {
        if (pattern.test(taskLower)) {
          matchCount++;
        }
      }
      
      if (matchCount > 0) {
        const confidence = Math.min(0.9, 0.4 + (matchCount * 0.2));
        if (confidence > bestMatch.confidence) {
          bestMatch = { type, confidence, approach };
        }
      }
    }

    return {
      type: bestMatch.type,
      confidence: bestMatch.confidence,
      relevantEntities: [],
      suggestedApproach: bestMatch.approach,
    };
  }
  
  async learn(insights: LearnedInsight[]): Promise<void> {
    for (const insight of insights) {
      const summary = summarizeForStorage(insight.content, 500);
      await agentMemory.addUniversalMemory(insight.type, summary, insight.importance);
      
      // Add to Knowledge Graph
      const nodeId = await knowledgeGraph.addNode(
        insight.entities?.[0] || insight.content.substring(0, 50),
        insight.type,
        insight.content,
        { importance: insight.importance, entities: insight.entities }
      );
      
      if (nodeId && insight.relations) {
        for (const rel of insight.relations) {
          const targetNode = await knowledgeGraph.findNodeByName(rel.target);
          if (targetNode) {
            await knowledgeGraph.addEdge(nodeId, targetNode.id, rel.type);
          }
        }
      }
    }
  }
  
  async learnFromTask(task: string, actions: string[], outcome: 'success' | 'failure', notes?: string): Promise<void> {
    const content = `Task: ${task}\nActions: ${actions.join(' → ')}\nOutcome: ${outcome}${notes ? `\nNotes: ${notes}` : ''}`;
    
    await this.userMemory.addMemory(
      'task_history',
      content,
      { task, actions, outcome },
      outcome === 'success' ? 0.7 : 0.5
    );

    // Add task to Knowledge Graph
    const taskId = await knowledgeGraph.addNode(task, 'task', content, { outcome, actions });
    
    if (outcome === 'success' && actions.length > 2) {
      // Auto-patch skill set (Continuous Learning 2.0)
      const patternName = `Skill: ${task.split(' ').slice(0, 3).join(' ')}`;
      await supabaseAdmin.from('skill_patterns').insert({
        pattern_name: patternName,
        pattern_description: `Generated from successful task: ${task}`,
        successful_action_sequence: actions,
        trigger_condition: task,
        usage_count: 1,
        success_rate: 1.0
      });

      const patternContent = `Successful pattern for "${task}": ${actions.join(' → ')}`;
      await agentMemory.addUniversalMemory('pattern', patternContent, 0.6);

      // Add solution to Knowledge Graph and link to task
      const solutionId = await knowledgeGraph.addNode(patternName, 'solution', patternContent, { actions });
      if (taskId && solutionId) {
        await knowledgeGraph.addEdge(taskId, solutionId, 'solved_by');
      }
    }
  }
  
  async learnNewSkill(
    name: string,
    category: 'coding' | 'research' | 'communication' | 'analysis' | 'automation' | 'integration',
    description: string,
    examples: string[],
    bestPractices: string[]
  ): Promise<void> {
    await skillManager.learnSkill(name, category, description, {
      examples,
      bestPractices,
      learnedAt: new Date().toISOString(),
    });
  }
  
  async monitorAndFixGitHubBuilds(owner: string, repo: string): Promise<{ fixed: boolean; message: string }> {
    await this.github.initialize();
    if (!this.github.isConnected()) {
      return { fixed: false, message: 'GitHub not connected' };
    }
    
    const result = await this.github.monitorAndFixBuilds(owner, repo);
    
    if (result.message.includes('Found failing build')) {
      await this.recordSkillUsage('github_cicd_monitoring', true);
      // Logic for autonomous fix would go here - for now we return the findings
    }
    
    return result;
  }
  
  async executeCode(language: string, code: string): Promise<{ success: boolean; output: string; error?: string }> {
    const result = await this.codeExecutor.execute(language, code);
    
    if (result.success) {
      await this.recordSkillUsage('code_execution', true);
    } else {
      await agentMemory.addUniversalMemory(
        'error_fix',
        `Error in ${language}: ${result.error}\nCode snippet: ${code.substring(0, 200)}`,
        0.4
      );
    }
    
    return result;
  }
  
  async runTests(language: string, code: string, testCode: string): Promise<{
    passed: number;
    failed: number;
    total: number;
    output: string;
  }> {
    const result = await this.testRunner.runTests(language, code, testCode);
    
    await this.recordSkillUsage('testing', result.failed === 0);
    
    return {
      passed: result.passed,
      failed: result.failed,
      total: result.total_tests,
      output: result.output || '',
    };
  }
  
  async connectGitHub(token: string): Promise<boolean> {
    const success = await this.github.initialize(token);
    if (success) {
      await this.recordSkillUsage('github_integration', true);
    }
    return success;
  }
  
  async getGitHubRepos(): Promise<Array<{ name: string; full_name: string; description: string | null }>> {
    await this.github.initialize();
    if (!this.github.isConnected()) return [];
    
    const repos = await this.github.listRepositories();
    return repos.map(r => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
    }));
  }
  
  async createPR(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string
  ): Promise<{ success: boolean; prUrl?: string }> {
    await this.github.initialize();
    if (!this.github.isConnected()) {
      return { success: false };
    }
    
    const pr = await this.github.createPullRequest(owner, repo, title, head, base, body);
    if (pr) {
      await this.recordSkillUsage('pr_creation', true);
      return { success: true, prUrl: pr.html_url };
    }
    
    return { success: false };
  }
  
  async rememberUserPreference(key: string, value: unknown, context?: string): Promise<void> {
    await this.userMemory.setPreference(key, value, context);
  }
  
  async recallUserPreference(key: string): Promise<unknown | null> {
    return this.userMemory.getPreference(key);
  }
  
  async getContextForTask(task: string, includeRecursive: boolean = true): Promise<string> {
    const thinking = await this.think({ userId: this.userId, task, previousActions: [] });
    
    let context = '';
    
    if (thinking.relevantMemories.length > 0) {
      context += `\nRelevant memories:\n${thinking.relevantMemories.slice(0, 3).join('\n')}`;
    }
    
    if (thinking.relevantSkills.length > 0) {
      context += `\nRelevant skills:\n${thinking.relevantSkills.slice(0, 3).join('\n')}`;
    }
    
    if (Object.keys(thinking.userPreferences).length > 0) {
      context += `\nUser preferences: ${JSON.stringify(thinking.userPreferences)}`;
    }
    
    context += `\nSuggested approach: ${thinking.suggestedApproach}`;
    
    if (includeRecursive && thinking.hierarchicalPlan) {
      context += `\nHierarchical Plan (ToT):\n${thinking.hierarchicalPlan.join(' → ')}`;
    }
    
    return context;
  }
  
  async getMostUsedSkills(): Promise<Array<{ name: string; uses: number; successRate: number }>> {
    const skills = await skillManager.getMostUsedSkills(10);
    return skills.map(s => ({
      name: s.skill_name,
      uses: s.usage_count || 0,
      successRate: s.success_rate || 0,
    }));
  }
  
  async getAgentStats(): Promise<{
    totalSkills: number;
    totalMemories: number;
    topSkills: string[];
    recentLearnings: string[];
  }> {
    const [skills, memories] = await Promise.all([
      skillManager.getAllSkills(),
      agentMemory.getRecentMemories(5),
    ]);
    
    const sortedSkills = [...skills].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    
    return {
      totalSkills: skills.length,
      totalMemories: memories.length,
      topSkills: sortedSkills.slice(0, 5).map(s => s.skill_name),
      recentLearnings: memories.map(m => m.content.substring(0, 100)),
    };
  }

  /**
   * Record skill usage for learning
   */
  private async recordSkillUsage(skillName: string, success: boolean): Promise<void> {
    await skillManager.useSkill(skillName, success);
  }

  // ============================================================
  // WORKSPACE & DOCKER METHODS
  // ============================================================

  /**
   * Mount a local project directory as the active workspace
   */
  async mountWorkspace(projectPath: string, name?: string): Promise<WorkspaceConfig | null> {
    try {
      const manager = await getWorkspaceManager();
      const workspace = await manager.mountLocalProject(projectPath, name);
      await manager.setActiveWorkspace(workspace.id);
      await this.recordSkillUsage('workspace_mount', true);
      return workspace;
    } catch (error) {
      console.error('Failed to mount workspace:', error);
      await this.recordSkillUsage('workspace_mount', false);
      return null;
    }
  }

  /**
   * Clone a git repository and set it as active workspace
   */
  async cloneAndMountRepo(gitUrl: string, name?: string, branch?: string): Promise<WorkspaceConfig | null> {
    try {
      const manager = await getWorkspaceManager();
      const workspace = await manager.cloneRepository(gitUrl, name, branch);
      await manager.setActiveWorkspace(workspace.id);
      await this.recordSkillUsage('workspace_clone', true);
      return workspace;
    } catch (error) {
      console.error('Failed to clone repository:', error);
      await this.recordSkillUsage('workspace_clone', false);
      return null;
    }
  }

  /**
   * Create a sandboxed Docker environment for safe code execution
   */
  async createDockerWorkspace(projectPath: string, options?: {
    name?: string;
    image?: string;
    ports?: Record<number, number>;
    installDeps?: boolean;
  }): Promise<DockerWorkspace | null> {
    try {
      const docker = await getDockerManager();
      if (!docker.isAvailable()) {
        console.warn('Docker is not available on this system');
        return null;
      }
      const workspace = await docker.createWorkspace(projectPath, options);
      docker.setActiveWorkspace(workspace.id);
      await this.recordSkillUsage('docker_workspace', true);
      return workspace;
    } catch (error) {
      console.error('Failed to create Docker workspace:', error);
      await this.recordSkillUsage('docker_workspace', false);
      return null;
    }
  }

  /**
   * Execute a command in the active workspace (Docker or local)
   */
  async executeInWorkspace(command: string, useDocker: boolean = false): Promise<{
    output: string;
    exitCode: number;
    isDocker: boolean;
  }> {
    try {
      if (useDocker) {
        const docker = await getDockerManager();
        const workspace = docker.getActiveWorkspace();
        if (workspace) {
          const result = await docker.execInContainer(workspace.containerId, command, workspace.workspaceDir);
          await this.recordSkillUsage('docker_exec', result.exitCode === 0);
          return { output: result.output, exitCode: result.exitCode, isDocker: true };
        }
      }

      // Fall back to workspace manager
      const manager = await getWorkspaceManager();
      const result = await manager.execInWorkspace(command);
      await this.recordSkillUsage('workspace_exec', result.exitCode === 0);
      return { output: result.stdout + result.stderr, exitCode: result.exitCode, isDocker: false };
    } catch (error: any) {
      return { output: error.message || 'Command failed', exitCode: 1, isDocker: false };
    }
  }

  /**
   * Run tests in the active workspace
   */
  async runWorkspaceTests(testCommand?: string, useDocker: boolean = false): Promise<{
    success: boolean;
    output: string;
    passed: number;
    failed: number;
    skipped: number;
  }> {
    try {
      if (useDocker) {
        const docker = await getDockerManager();
        const workspace = docker.getActiveWorkspace();
        if (workspace) {
          const result = await docker.runTests(workspace.id, testCommand);
          const summary = this.parseTestSummary(result.output);
          return { 
            success: result.exitCode === 0, 
            output: result.output, 
            ...summary 
          };
        }
      }

      const manager = await getWorkspaceManager();
      const result = await manager.runTests(testCommand);
      return {
        success: result.success,
        output: result.output,
        passed: result.summary.passed,
        failed: result.summary.failed,
        skipped: result.summary.skipped,
      };
    } catch (error: any) {
      return { success: false, output: error.message, passed: 0, failed: 0, skipped: 0 };
    }
  }

  /**
   * Run build in the active workspace
   */
  async runWorkspaceBuild(buildCommand?: string, useDocker: boolean = false): Promise<{
    success: boolean;
    output: string;
    errors: string[];
  }> {
    try {
      if (useDocker) {
        const docker = await getDockerManager();
        const workspace = docker.getActiveWorkspace();
        if (workspace) {
          const result = await docker.runBuild(workspace.id, buildCommand);
          const errors = this.parseBuildErrors(result.output);
          return { success: result.exitCode === 0, output: result.output, errors };
        }
      }

      const manager = await getWorkspaceManager();
      const result = await manager.runBuild(buildCommand);
      return result;
    } catch (error: any) {
      return { success: false, output: error.message, errors: [error.message] };
    }
  }

  /**
   * Read a file from the workspace
   */
  async readWorkspaceFile(filePath: string, useDocker: boolean = false): Promise<string | null> {
    try {
      if (useDocker) {
        const docker = await getDockerManager();
        const workspace = docker.getActiveWorkspace();
        if (workspace) {
          return await docker.readFile(workspace.containerId, filePath);
        }
      }

      const manager = await getWorkspaceManager();
      return await manager.readFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Write a file to the workspace with versioning support
   */
  async writeWorkspaceFile(filePath: string, content: string, useDocker: boolean = false): Promise<boolean> {
    try {
      if (useDocker) {
        const docker = await getDockerManager();
        const workspace = docker.getActiveWorkspace();
        if (workspace) {
          await docker.writeFile(workspace.containerId, filePath, content);
          return true;
        }
      }

      const manager = await getWorkspaceManager();
      await manager.writeFile(filePath, content, true);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Rollback a file to a previous version
   */
  async rollbackWorkspaceFile(filePath: string, versionId: string): Promise<boolean> {
    try {
      const manager = await getWorkspaceManager();
      return await manager.rollbackFile(filePath, versionId);
    } catch {
      return false;
    }
  }

  /**
   * Get file version history
   */
  async getFileVersionHistory(filePath: string): Promise<Array<{
    id: string;
    timestamp: number;
    message?: string;
  }>> {
    try {
      const manager = await getWorkspaceManager();
      const versions = await manager.getFileVersions(filePath);
      return versions.map(v => ({
        id: v.id,
        timestamp: v.timestamp,
        message: v.commitMessage,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Git operations in workspace
   */
  async gitCommitWorkspace(message: string): Promise<string | null> {
    try {
      const manager = await getWorkspaceManager();
      return await manager.gitCommit(message);
    } catch {
      return null;
    }
  }

  async gitPushWorkspace(remote?: string, branch?: string): Promise<boolean> {
    try {
      const manager = await getWorkspaceManager();
      await manager.gitPush(remote, branch);
      return true;
    } catch {
      return false;
    }
  }

  async gitPullWorkspace(remote?: string, branch?: string): Promise<boolean> {
    try {
      const manager = await getWorkspaceManager();
      await manager.gitPull(remote, branch);
      return true;
    } catch {
      return false;
    }
  }

  async gitCreateBranch(branchName: string, checkout: boolean = true): Promise<boolean> {
    try {
      const manager = await getWorkspaceManager();
      await manager.gitCreateBranch(branchName, checkout);
      return true;
    } catch {
      return false;
    }
  }

  async getWorkspaceStatus(): Promise<{
    active: WorkspaceConfig | null;
    docker: DockerWorkspace | null;
    gitStatus: { staged: string[]; unstaged: string[]; untracked: string[] } | null;
  }> {
    try {
      const manager = await getWorkspaceManager();
      const docker = await getDockerManager();
      
      const activeWorkspace = manager.getActiveWorkspace();
      const activeDocker = docker.getActiveWorkspace();
      
      let gitStatus = null;
      if (activeWorkspace) {
        try {
          gitStatus = await manager.gitStatus();
        } catch {
          // Not a git repo
        }
      }

      return {
        active: activeWorkspace,
        docker: activeDocker,
        gitStatus,
      };
    } catch {
      return { active: null, docker: null, gitStatus: null };
    }
  }

  private parseTestSummary(output: string): { passed: number; failed: number; skipped: number } {
    let passed = 0, failed = 0, skipped = 0;
    
    // Jest/Vitest pattern
    const passedMatch = output.match(/(\d+)\s+pass(ed|ing)?/i);
    const failedMatch = output.match(/(\d+)\s+fail(ed|ing)?/i);
    const skippedMatch = output.match(/(\d+)\s+skip(ped)?/i);
    
    if (passedMatch) passed = parseInt(passedMatch[1]);
    if (failedMatch) failed = parseInt(failedMatch[1]);
    if (skippedMatch) skipped = parseInt(skippedMatch[1]);
    
    return { passed, failed, skipped };
  }

  private parseBuildErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.match(/error(\s+TS\d+)?:/i) || line.match(/:\d+:\d+:\s*error:/)) {
        errors.push(line.trim());
      }
    }
    
    return errors;
  }

  // ============================================================
  // CODE ANALYSIS METHODS
  // ============================================================

  /**
   * Analyze code files and return structured analysis
   */
  async analyzeCode(files: Array<{ path: string; content: string }>): Promise<{
    entities: CodeEntity[];
    complexity: CodeAnalysisResult['complexity'];
    issues: CodeAnalysisResult['issues'];
    dependencyGraph: {
      nodes: string[];
      edges: Array<{ from: string; to: string }>;
      circularDependencies: string[][];
    };
    summary: {
      totalFiles: number;
      totalEntities: number;
      byType: Record<string, number>;
      avgComplexity: number;
    };
  }> {
    codeAnalyzer.clear();
    codeAnalyzer.addFiles(files);

    const results: CodeAnalysisResult[] = [];
    for (const file of files) {
      results.push(codeAnalyzer.analyzeFile(file.path));
    }

    const graph = codeAnalyzer.buildDependencyGraph();
    const circularDeps = codeAnalyzer.findCircularDependencies();
    const summary = codeAnalyzer.getCodebaseSummary();

    return {
      entities: results.flatMap(r => r.entities),
      complexity: {
        cyclomaticComplexity: results.reduce((sum, r) => sum + r.complexity.cyclomaticComplexity, 0),
        linesOfCode: results.reduce((sum, r) => sum + r.complexity.linesOfCode, 0),
        functionCount: results.reduce((sum, r) => sum + r.complexity.functionCount, 0),
        classCount: results.reduce((sum, r) => sum + r.complexity.classCount, 0),
      },
      issues: results.flatMap(r => r.issues),
      dependencyGraph: {
        nodes: Array.from(graph.nodes.keys()),
        edges: graph.edges.map(e => ({ from: e.from, to: e.to })),
        circularDependencies: circularDeps,
      },
      summary,
    };
  }

  /**
   * Find callers of a specific function
   */
  findFunctionCallers(functionName: string): CodeEntity[] {
    return codeAnalyzer.findCallers(functionName);
  }

  /**
   * Find what functions are called by a specific function
   */
  findFunctionCallees(functionName: string): string[] {
    return codeAnalyzer.findCallees(functionName);
  }

  /**
   * Search for code entities by pattern
   */
  searchCodeEntities(pattern: string, type?: CodeEntity['type']): CodeEntity[] {
    return codeAnalyzer.searchEntities(pattern, type);
  }

  /**
   * Get a specific entity by name
   */
  getCodeEntity(name: string): CodeEntity | null {
    return codeAnalyzer.getEntity(name);
  }

  /**
   * Get files that depend on a specific file
   */
  getFileDependents(filePath: string): string[] {
    return codeAnalyzer.getDependents(filePath);
  }

  /**
   * Get files that a specific file depends on
   */
  getFileDependencies(filePath: string): string[] {
    return codeAnalyzer.getDependencies(filePath);
  }

    /**
     * Analyze code for potential issues (security, performance, maintainability)
     */
    async reviewCode(files: Array<{ path: string; content: string }>): Promise<{
      issues: CodeAnalysisResult['issues'];
      suggestions: string[];
      complexity: CodeAnalysisResult['complexity'];
    }> {
      const analysis = await this.analyzeCode(files);
      const suggestions: string[] = [];

      // Generate suggestions based on analysis
      if (analysis.complexity.cyclomaticComplexity > 20) {
        suggestions.push('High cyclomatic complexity detected. Consider breaking down complex functions.');
      }

      const highComplexityFunctions = analysis.entities
        .filter(e => e.type === 'function' && e.complexity && e.complexity > 10);
      for (const fn of highComplexityFunctions) {
        suggestions.push(`Function "${fn.name}" has high complexity (${fn.complexity}). Consider refactoring.`);
      }

      if (analysis.dependencyGraph.circularDependencies.length > 0) {
        suggestions.push(`${analysis.dependencyGraph.circularDependencies.length} circular dependencies detected. This can cause maintainability issues.`);
      }

      const errorIssues = analysis.issues.filter(i => i.type === 'error');
      if (errorIssues.length > 0) {
        suggestions.push(`${errorIssues.length} error(s) found. These should be fixed before deployment.`);
      }

      return {
        issues: analysis.issues,
        suggestions,
        complexity: analysis.complexity,
      };
    }

    // ============================================================
    // DIFF-BASED EDITING METHODS
    // ============================================================

    /**
     * Apply a unified diff to file content
     * Surgical edit: preserves all lines except those in the diff
     */
    applyDiff(content: string, diffString: string): EditResult {
      return diffEditor.applyDiffString(content, diffString);
    }

    /**
     * Generate a diff between old and new content
     */
    generateDiff(oldContent: string, newContent: string, filePath: string): string {
      return DiffParser.generate(oldContent, newContent, filePath);
    }

    /**
     * Replace specific lines in content (surgical edit)
     * @param content - Original file content
     * @param startLine - First line to replace (1-indexed)
     * @param endLine - Last line to replace (1-indexed)
     * @param newContent - New content to insert
     */
    replaceLines(content: string, startLine: number, endLine: number, newContent: string): EditResult {
      return LineRangeEditor.replaceLines(content, startLine, endLine, newContent);
    }

    /**
     * Insert content after a specific line
     */
    insertAfterLine(content: string, line: number, newContent: string): EditResult {
      return LineRangeEditor.insertAfter(content, line, newContent);
    }

    /**
     * Insert content before a specific line
     */
    insertBeforeLine(content: string, line: number, newContent: string): EditResult {
      return LineRangeEditor.insertBefore(content, line, newContent);
    }

    /**
     * Delete a range of lines
     */
    deleteLines(content: string, startLine: number, endLine: number): EditResult {
      return LineRangeEditor.deleteLines(content, startLine, endLine);
    }

    /**
     * AST-aware modification (insert/modify/delete functions, classes, etc.)
     */
    astModify(content: string, filePath: string, modification: ASTModification): EditResult {
      return diffEditor.astModify(content, filePath, modification);
    }

    /**
     * Add a new function to a file
     */
    addFunction(content: string, filePath: string, functionCode: string, options?: {
      position?: 'before' | 'after' | 'start' | 'end';
      relativeTo?: string;
    }): EditResult {
      return diffEditor.addFunction(content, filePath, functionCode, options);
    }

    /**
     * Edit an existing function's body
     */
    editFunction(content: string, filePath: string, functionName: string, newBody: string): EditResult {
      return diffEditor.editFunction(content, filePath, functionName, newBody);
    }

    /**
     * Add an import statement
     */
    addImport(content: string, filePath: string, importStatement: string): EditResult {
      return diffEditor.addImport(content, filePath, importStatement);
    }

    /**
     * Delete a function, class, or variable by name
     */
    deleteEntity(content: string, filePath: string, entityName: string): EditResult {
      return diffEditor.deleteEntity(content, filePath, entityName);
    }

    /**
     * Rename a function, class, or variable
     */
    renameEntity(content: string, filePath: string, oldName: string, newName: string): EditResult {
      return diffEditor.renameEntity(content, filePath, oldName, newName);
    }

    /**
     * Add a method to a class
     */
    addMethod(content: string, filePath: string, className: string, methodCode: string): EditResult {
      return diffEditor.addMethod(content, filePath, className, methodCode);
    }

    /**
     * Wrap a function in try-catch
     */
    wrapInTryCatch(content: string, filePath: string, functionName: string): EditResult {
      return diffEditor.wrapInTryCatch(content, filePath, functionName);
    }

    /**
     * Validate code for syntax errors
     */
    validateCode(content: string, filePath: string): ValidationError[] {
      return diffEditor.validate(content, filePath);
    }

    /**
     * Check if code is syntactically valid
     */
    isCodeValid(content: string, filePath: string): boolean {
      return diffEditor.isSyntaxValid(content, filePath);
    }

    /**
     * Validate an edit before applying it
     */
    validateEdit(originalContent: string, editedContent: string, filePath: string): {
      valid: boolean;
      errors: ValidationError[];
      newErrors: ValidationError[];
    } {
      return diffEditor.validateEdit(originalContent, editedContent, filePath);
    }

    /**
     * Apply edits to multiple files atomically
     * If any file fails validation, no files are modified
     */
    async multiFileEdit(
      files: Map<string, string>,
      edits: MultiFileEdit,
      validate: boolean = true
    ): Promise<{
      success: boolean;
      results: Map<string, EditResult>;
      errors?: string[];
      rollbackAvailable: boolean;
    }> {
      const result = await diffEditor.multiFileEdit(files, edits, validate);
      
      if (result.success) {
        await this.recordSkillUsage('diff_editing', true);
      } else {
        await this.recordSkillUsage('diff_editing', false);
      }
      
      return result;
    }

    /**
     * Get backups for potential rollback
     */
    getEditBackups(): Map<string, string> {
      return diffEditor.getBackups();
    }

    /**
     * Edit a file in the workspace using diff-based editing
     */
    async editWorkspaceFile(
      filePath: string,
      edit: {
        type: 'diff' | 'replaceLines' | 'insertAfter' | 'insertBefore' | 'deleteLines' | 'ast';
        diff?: string;
        startLine?: number;
        endLine?: number;
        line?: number;
        content?: string;
        modification?: ASTModification;
      },
      useDocker: boolean = false
    ): Promise<EditResult & { diff?: string }> {
      // Read the file
      const currentContent = await this.readWorkspaceFile(filePath, useDocker);
      if (currentContent === null) {
        return { success: false, error: 'File not found' };
      }

      let result: EditResult;

      // Apply the edit based on type
      switch (edit.type) {
        case 'diff':
          if (!edit.diff) return { success: false, error: 'diff is required' };
          result = this.applyDiff(currentContent, edit.diff);
          break;

        case 'replaceLines':
          if (!edit.startLine || !edit.endLine || edit.content === undefined) {
            return { success: false, error: 'startLine, endLine, and content are required' };
          }
          result = this.replaceLines(currentContent, edit.startLine, edit.endLine, edit.content);
          break;

        case 'insertAfter':
          if (!edit.line || edit.content === undefined) {
            return { success: false, error: 'line and content are required' };
          }
          result = this.insertAfterLine(currentContent, edit.line, edit.content);
          break;

        case 'insertBefore':
          if (!edit.line || edit.content === undefined) {
            return { success: false, error: 'line and content are required' };
          }
          result = this.insertBeforeLine(currentContent, edit.line, edit.content);
          break;

        case 'deleteLines':
          if (!edit.startLine || !edit.endLine) {
            return { success: false, error: 'startLine and endLine are required' };
          }
          result = this.deleteLines(currentContent, edit.startLine, edit.endLine);
          break;

        case 'ast':
          if (!edit.modification) {
            return { success: false, error: 'modification is required' };
          }
          result = this.astModify(currentContent, filePath, edit.modification);
          break;

        default:
          return { success: false, error: `Unknown edit type: ${edit.type}` };
      }

      if (!result.success) {
        return result;
      }

      // Validate the edit if it's a TypeScript/JavaScript file
      if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
        const validation = this.validateEdit(currentContent, result.content!, filePath);
        if (!validation.valid) {
          return {
            success: false,
            error: 'Edit validation failed',
            validationErrors: validation.newErrors,
          };
        }
      }

      // Write the file
      const writeSuccess = await this.writeWorkspaceFile(filePath, result.content!, useDocker);
      if (!writeSuccess) {
        return { success: false, error: 'Failed to write file' };
      }

      // Generate diff for response
      const diffOutput = this.generateDiff(currentContent, result.content!, filePath);

      await this.recordSkillUsage('diff_editing', true);

      return {
        success: true,
        content: result.content,
        diff: diffOutput,
      };
    }

    /**
     * Preview an edit without applying it
     */
    previewEdit(
      content: string,
      filePath: string,
      edit: {
        type: 'diff' | 'replaceLines' | 'insertAfter' | 'insertBefore' | 'deleteLines' | 'ast';
        diff?: string;
        startLine?: number;
        endLine?: number;
        line?: number;
        content?: string;
        modification?: ASTModification;
      }
    ): { result: EditResult; diff: string; validation: { valid: boolean; errors: ValidationError[] } } {
      let result: EditResult;

      switch (edit.type) {
        case 'diff':
          result = this.applyDiff(content, edit.diff || '');
          break;
        case 'replaceLines':
          result = this.replaceLines(content, edit.startLine || 0, edit.endLine || 0, edit.content || '');
          break;
        case 'insertAfter':
          result = this.insertAfterLine(content, edit.line || 0, edit.content || '');
          break;
        case 'insertBefore':
          result = this.insertBeforeLine(content, edit.line || 0, edit.content || '');
          break;
        case 'deleteLines':
          result = this.deleteLines(content, edit.startLine || 0, edit.endLine || 0);
          break;
        case 'ast':
          result = this.astModify(content, filePath, edit.modification!);
          break;
        default:
          result = { success: false, error: `Unknown edit type` };
      }

      const diff = result.success 
        ? this.generateDiff(content, result.content!, filePath) 
        : '';
      
      const validation = result.success
        ? this.validateEdit(content, result.content!, filePath)
        : { valid: false, errors: [], newErrors: [] };

      return {
        result,
        diff,
        validation: {
          valid: validation.valid,
          errors: validation.newErrors,
        },
      };
    }

    // ============================================================
    // CONTEXT WINDOW MANAGEMENT METHODS
    // ============================================================

    /**
     * Add a code file to the context with intelligent summarization
     * Automatically determines detail level based on file size and relevance
     */
    async addCodeFileToContext(
      filePath: string,
      content: string,
      relevanceScore: number = 0.5,
      preferSummary: boolean = true
    ): Promise<string> {
      return this.contextManager.addCodeFile(filePath, content, relevanceScore, preferSummary);
    }

    /**
     * Add a specific code entity (function, class, etc.) to context
     */
    async addCodeEntityToContext(
      filePath: string,
      content: string,
      entityName: string,
      relevanceScore: number = 0.7
    ): Promise<string | null> {
      return this.contextManager.addCodeEntity(filePath, content, entityName, relevanceScore);
    }

    /**
     * Add conversation to the sliding window context
     */
    addConversationToContext(content: string, relevanceScore: number = 0.6): string {
      this.slidingWindow.add(content); // Also add to sliding window for history
      return this.contextManager.addConversation(content, relevanceScore);
    }

    /**
     * Add memory to context
     */
    addMemoryToContext(content: string, source: string, relevanceScore: number = 0.5): string {
      return this.contextManager.addMemory(content, source, relevanceScore);
    }

    /**
     * Add current task to context with high priority
     */
    addTaskToContext(content: string, relevanceScore: number = 0.9): string {
      return this.contextManager.addTask(content, relevanceScore);
    }

    /**
     * Build optimized context for LLM prompt
     * Returns context string optimized for token limit
     */
    buildOptimizedContext(options?: Partial<ContextSelectionOptions>): {
      contextString: string;
      tokenCount: number;
      itemCount: number;
      usedPercentage: number;
    } {
      const defaultOptions: ContextSelectionOptions = {
        maxTokens: 8000,
        preferSummaries: true,
        priorityWeights: {
          recency: 0.2,
          relevance: 0.6,
          importance: 0.2,
        },
        ...options,
      };

      const window = this.contextManager.buildContext(defaultOptions);
      const contextString = this.contextManager.buildContextString(window);

      return {
        contextString,
        tokenCount: window.totalTokens,
        itemCount: window.items.length,
        usedPercentage: window.usedPercentage,
      };
    }

    /**
     * Select most relevant context items for a specific query
     * Uses semantic similarity with embeddings
     */
    async selectRelevantContext(
      query: string,
      maxTokens: number = 4000,
      minScore: number = 0.5
    ): Promise<ContextItem[]> {
      const allItems = Array.from(this.contextManager['items'].values());
      return this.relevanceSelector.selectRelevant(allItems, query, maxTokens, minScore);
    }

    /**
     * Get hierarchical summary of a code file
     */
    async summarizeCodeFile(filePath: string, content: string): Promise<FileSummary> {
      return this.codeSummarizer.summarizeFile(filePath, content);
    }

    /**
     * Get code at specific detail level
     * Level 1: Just summary
     * Level 2: Summary + signatures
     * Level 3: Summary + key function bodies
     * Level 4: Full content
     */
    async getCodeAtDetailLevel(
      filePath: string,
      content: string,
      level: 1 | 2 | 3 | 4,
      keyEntities?: string[]
    ): Promise<string> {
      const summary = await this.codeSummarizer.summarizeFile(filePath, content);
      return this.codeSummarizer.getAtDetailLevel(summary, level, keyEntities);
    }

    /**
     * Load a large file for paging
     */
    loadFileForPaging(filePath: string, content: string, pageSize: number = 100): {
      totalLines: number;
      totalPages: number;
      pageSize: number;
    } {
      const pagedFile = this.filePager.loadFile(filePath, content, pageSize);
      return {
        totalLines: pagedFile.totalLines,
        totalPages: pagedFile.totalPages,
        pageSize: pagedFile.pageSize,
      };
    }

    /**
     * Get a specific page from a large file
     */
    getFilePage(filePath: string, pageNumber: number): string | null {
      return this.filePager.getPage(filePath, pageNumber);
    }

    /**
     * Get page containing a specific line
     */
    getFilePageForLine(filePath: string, lineNumber: number): { page: number; content: string } | null {
      return this.filePager.getPageForLine(filePath, lineNumber);
    }

    /**
     * Get a range of lines from a file
     */
    getFileLineRange(filePath: string, startLine: number, endLine: number): string | null {
      return this.filePager.getLineRange(filePath, startLine, endLine);
    }

    /**
     * Get current sliding window content
     */
    getSlidingWindowContent(): string {
      return this.slidingWindow.getContent();
    }

    /**
     * Get sliding window token usage
     */
    getSlidingWindowTokens(): number {
      return this.slidingWindow.getTotalTokens();
    }

    /**
     * Clear the sliding window
     */
    clearSlidingWindow(): void {
      this.slidingWindow.clear();
    }

    /**
     * Get context statistics
     */
    getContextStats(): {
      itemCount: number;
      totalTokens: number;
      byType: Record<string, { count: number; tokens: number }>;
      slidingWindowTokens: number;
    } {
      const stats = this.contextManager.getStats();
      return {
        ...stats,
        slidingWindowTokens: this.slidingWindow.getTotalTokens(),
      };
    }

    /**
     * Clear all context
     */
    clearAllContext(): void {
      this.contextManager.clear();
      this.slidingWindow.clear();
      this.relevanceSelector.clearCache();
      this.codeSummarizer.clearCache();
      this.filePager.clear();
    }

    /**
     * Clear context older than specified age
     */
    clearOldContext(maxAgeMs: number = 3600000): number {
      return this.contextManager.clearOlderThan(maxAgeMs);
    }

    /**
     * Estimate token count for text
     */
    estimateTokens(text: string): number {
      return estimateTokenCount(text);
    }

    /**
     * Truncate text to token limit
     */
    truncateToTokenLimit(text: string, maxTokens: number): string {
      return truncateToTokens(text, maxTokens);
    }

      /**
       * Get enhanced context for task execution
       * Combines memories, skills, and code context with intelligent prioritization
       */
      async getEnhancedTaskContext(
        task: string,
        codeFiles?: Array<{ path: string; content: string }>,
        maxTokens: number = 6000
      ): Promise<string> {
        // Clear old context first
        this.clearOldContext(1800000); // 30 minutes

        // Add task with high priority
        this.addTaskToContext(task, 0.95);

        // Add code files with automatic summarization
        if (codeFiles) {
          for (const file of codeFiles) {
            // Calculate relevance based on task keywords
            const taskLower = task.toLowerCase();
            const pathLower = file.path.toLowerCase();
            const relevance = pathLower.includes(taskLower) || taskLower.includes(pathLower.split('/').pop()?.split('.')[0] || '')
              ? 0.85
              : 0.5;
            
            await this.addCodeFileToContext(file.path, file.content, relevance, true);
          }
        }

        // Get memories and add to context
        const memories = await agentMemory.searchUniversalMemory(task, 5);
        for (const memory of memories) {
          this.addMemoryToContext(memory.content, `memory:${memory.type}`, memory.similarity || 0.5);
        }

        // Get relevant skills
        const skills = await skillManager.searchSkills(task);
        for (const skill of skills.slice(0, 3)) {
          this.addMemoryToContext(
            `Skill: ${skill.skill_name} - ${skill.description}`,
            `skill:${skill.skill_name}`,
            0.6
          );
        }

        // Build optimized context
        const { contextString } = this.buildOptimizedContext({ maxTokens });
        
        return contextString;
      }

      // ============================================================
      // HALLUCINATION PREVENTION METHODS
      // ============================================================

      /**
       * Update the codebase context for hallucination prevention grounding checks
       */
      async updateHallucinationPreventionContext(files: Array<{ path: string; content: string }>): Promise<void> {
        await hallucinationPrevention.updateCodebaseContext(files);
        // Also update the hierarchical planner context
        await hierarchicalPlanner.setCodebaseContext(files);
      }

      /**
       * Verify that a file exists in the codebase
       */
      verifyFileExists(filePath: string): GroundingCheck {
        return hallucinationPrevention.verifyFileExists(filePath);
      }

      /**
       * Verify that a function exists in the codebase
       */
      verifyFunctionExists(functionName: string, expectedFile?: string): GroundingCheck {
        return hallucinationPrevention.verifyFunctionExists(functionName, expectedFile);
      }

      /**
       * Verify that a type/interface exists in the codebase
       */
      verifyTypeExists(typeName: string, expectedFile?: string): GroundingCheck {
        return hallucinationPrevention.verifyTypeExists(typeName, expectedFile);
      }

      /**
       * Verify an import path is valid
       */
      verifyImportValid(importPath: string, fromFile: string): GroundingCheck {
        return hallucinationPrevention.verifyImportValid(importPath, fromFile);
      }

      /**
       * Verify code syntax before presenting it
       */
      verifySyntax(code: string, language: string, filePath?: string): SyntaxVerification {
        return hallucinationPrevention.verifySyntax(code, language, filePath);
      }

      /**
       * Verify that generated code integrates properly with the codebase
       */
      async verifyCodeIntegration(
        code: string,
        targetFile: string,
        dependencies?: string[]
      ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
        return hallucinationPrevention.verifyCodeIntegration(code, targetFile, dependencies);
      }

      /**
       * Full verification pipeline for generated content
       * Use this before presenting code, claims, or plans to the user
       */
      async verifyContent(
        content: string,
        options: {
          contentType: 'code' | 'claim' | 'plan';
          language?: string;
          targetFile?: string;
          autoResolve?: boolean;
        }
      ): Promise<VerificationResult> {
        const result = await hallucinationPrevention.verify(content, options);
        
        // Log verification results for transparency
        if (result.confidenceScore.recommendation === 'reject') {
          console.warn('[AgentBrain] Content verification REJECTED:');
          for (const flag of result.confidenceScore.flags) {
            console.warn(`  - [${flag.severity}] ${flag.message}`);
          }
        } else if (result.confidenceScore.recommendation === 'review') {
          console.log('[AgentBrain] Content verification needs REVIEW:');
          for (const flag of result.confidenceScore.flags.filter(f => f.severity !== 'info')) {
            console.log(`  - [${flag.severity}] ${flag.message}`);
          }
        }

        // Record skill usage
        await this.recordSkillUsage('hallucination_prevention', result.verified);

        return result;
      }

      /**
       * Generate verification challenges for content
       */
      generateVerificationChallenges(
        content: string,
        contentType: 'code' | 'claim' | 'plan'
      ): VerificationChallenge[] {
        return hallucinationPrevention.generateVerificationChallenges(content, contentType);
      }

      /**
       * Resolve verification challenges against the codebase
       */
      resolveVerificationChallenges(challenges: VerificationChallenge[]): VerificationChallenge[] {
        return hallucinationPrevention.resolveVerificationChallenges(challenges);
      }

      /**
       * Get confidence score for generated content
       * Returns detailed breakdown and recommendation
       */
      calculateConfidence(
        content: string,
        context: {
          groundingChecks: GroundingCheck[];
          syntaxVerification?: SyntaxVerification;
          citations: Array<{ type: string; reference: string; confidence: number }>;
          claimsCount: number;
          verifiedClaimsCount: number;
        }
      ): ConfidenceScore {
        return hallucinationPrevention.calculateConfidence(content, context as any);
      }

      /**
       * Check if generated code is safe to present (passes all verification)
       * Quick check that returns a simple boolean with optional details
       */
      async isCodeSafeToPresent(
        code: string,
        language: string,
        targetFile?: string
      ): Promise<{
        safe: boolean;
        confidence: number;
        issues: string[];
      }> {
        const verification = await this.verifyContent(code, {
          contentType: 'code',
          language,
          targetFile,
          autoResolve: true,
        });

        const issues: string[] = [];
        
        // Collect syntax errors
        if (verification.syntaxVerification && !verification.syntaxVerification.valid) {
          for (const err of verification.syntaxVerification.errors) {
            issues.push(`Line ${err.line}: ${err.message}`);
          }
        }
        
        // Collect grounding issues
        for (const check of verification.groundingChecks.filter(c => !c.exists)) {
          issues.push(`Missing ${check.type.replace('_', ' ')}: ${check.target}`);
        }
        
        // Collect confidence flags
        for (const flag of verification.confidenceScore.flags.filter(f => f.severity === 'critical')) {
          issues.push(flag.message);
        }

        return {
          safe: verification.confidenceScore.recommendation !== 'reject',
          confidence: verification.confidenceScore.overall,
          issues,
        };
      }

      /**
       * Verify a plan before execution
       * Checks that all referenced files, functions, and types exist
       */
      async verifyPlan(planSteps: string[]): Promise<{
        valid: boolean;
        stepResults: Array<{
          step: string;
          valid: boolean;
          issues: string[];
        }>;
        overallConfidence: number;
      }> {
        const stepResults: Array<{ step: string; valid: boolean; issues: string[] }> = [];
        let totalConfidence = 0;

        for (const step of planSteps) {
          const verification = await this.verifyContent(step, {
            contentType: 'plan',
            autoResolve: true,
          });

          const issues: string[] = [];
          for (const check of verification.groundingChecks.filter(c => !c.exists)) {
            issues.push(`Missing ${check.type.replace('_', ' ')}: ${check.target}`);
          }

          stepResults.push({
            step,
            valid: verification.verified,
            issues,
          });

          totalConfidence += verification.confidenceScore.overall;
        }

        const overallConfidence = planSteps.length > 0 ? totalConfidence / planSteps.length : 0;

        return {
          valid: stepResults.every(r => r.valid),
          stepResults,
          overallConfidence,
        };
      }

      /**
       * Get hallucination prevention statistics
       */
      getHallucinationPreventionStats(): {
        fileCount: number;
        entityCount: number;
        lastUpdated: Date;
      } {
        return hallucinationPrevention.getCodebaseStats();
      }

        /**
         * Clear hallucination prevention cache
         */
        clearHallucinationPreventionCache(): void {
          hallucinationPrevention.clearCache();
        }

        // ============================================================
        // DOCUMENTATION GENERATION METHODS
        // ============================================================

        /**
         * Generate a commit message from diff content
         * Uses AI to analyze changes and create meaningful commit messages
         */
        async generateCommitMessage(
          diffContent: string,
          options?: CommitMessageOptions
        ): Promise<CommitMessage> {
          const result = await documentationGenerator.generateCommitMessage(diffContent, options);
          await this.recordSkillUsage('documentation_generation', true);
          return result;
        }

        /**
         * Generate a commit message from file changes
         */
        async generateCommitMessageFromChanges(
          changes: Array<{ path: string; oldContent: string; newContent: string }>,
          options?: CommitMessageOptions
        ): Promise<CommitMessage> {
          const result = await documentationGenerator.generateCommitMessageFromChanges(changes, options);
          await this.recordSkillUsage('documentation_generation', true);
          return result;
        }

        /**
         * Generate inline comments for complex code sections
         * Identifies high-complexity functions and generates explanatory comments
         */
        async generateInlineComments(
          filePath: string,
          content: string,
          thresholds?: Partial<ComplexityThreshold>
        ): Promise<InlineComment[]> {
          const comments = await documentationGenerator.generateInlineComments(filePath, content, thresholds);
          await this.recordSkillUsage('documentation_generation', true);
          return comments;
        }

        /**
         * Generate JSDoc/TSDoc documentation for a function
         */
        async generateFunctionDoc(
          functionCode: string,
          functionName: string,
          context?: string
        ): Promise<string> {
          const doc = await documentationGenerator.generateFunctionDoc(functionCode, functionName, context);
          await this.recordSkillUsage('documentation_generation', true);
          return doc;
        }

        /**
         * Generate full documentation for a code entity (function, class, interface, type)
         */
        async generateCodeDocumentation(
          code: string,
          entityType: 'function' | 'class' | 'interface' | 'type'
        ): Promise<CodeDocumentation> {
          const doc = await documentationGenerator.generateCodeDocumentation(code, entityType);
          await this.recordSkillUsage('documentation_generation', true);
          return doc;
        }

        /**
         * Explain a code action with rationale and impact
         * Useful for explaining agent decisions to users
         */
        async explainAction(
          action: string,
          context?: {
            task?: string;
            previousActions?: string[];
            codeContext?: string;
            files?: string[];
          }
        ): Promise<ActionExplanation> {
          return documentationGenerator.explainAction(action, context);
        }

        /**
         * Explain a sequence of actions taken during task execution
         */
        async explainActionSequence(
          actions: string[],
          context?: { task?: string; codeContext?: string }
        ): Promise<{ summary: string; steps: ActionExplanation[] }> {
          return documentationGenerator.explainActionSequence(actions, context);
        }

        /**
         * Generate documentation updates based on code changes
         */
        async generateDocUpdates(
          codeChanges: Array<{ path: string; oldContent: string; newContent: string }>,
          existingDocs: Array<{ path: string; content: string }>
        ): Promise<DocumentationUpdate[]> {
          const updates = await documentationGenerator.generateDocUpdates(codeChanges, existingDocs);
          await this.recordSkillUsage('documentation_generation', true);
          return updates;
        }

        /**
         * Update README based on code changes
         */
        async updateReadme(
          readmeContent: string,
          codeChanges: Array<{ path: string; oldContent: string; newContent: string }>
        ): Promise<{ updatedContent: string; changes: string[] }> {
          const result = await documentationGenerator.updateReadme(readmeContent, codeChanges);
          await this.recordSkillUsage('documentation_generation', true);
          return result;
        }

        /**
         * Generate a PR description from code changes
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
          const description = await documentationGenerator.generatePRDescription(changes, options);
          await this.recordSkillUsage('documentation_generation', true);
          return description;
        }

        /**
         * Generate all documentation artifacts at once (commit message, PR description, doc updates)
         * Useful for completing a task and preparing for code review
         */
        async generateAllDocumentation(
          changes: Array<{ path: string; oldContent: string; newContent: string }>,
          existingDocs?: Array<{ path: string; content: string }>,
          options?: {
            commitOptions?: CommitMessageOptions;
            prOptions?: {
              title?: string;
              includeChecklist?: boolean;
              reviewers?: string[];
            };
          }
        ): Promise<{
          commitMessage: CommitMessage;
          prDescription: PRDescription;
          docUpdates: DocumentationUpdate[];
        }> {
          const [commitMessage, prDescription, docUpdates] = await Promise.all([
            documentationGenerator.generateCommitMessageFromChanges(changes, options?.commitOptions),
            documentationGenerator.generatePRDescription(changes, options?.prOptions),
            existingDocs
              ? documentationGenerator.generateDocUpdates(changes, existingDocs)
              : Promise.resolve([]),
          ]);

          await this.recordSkillUsage('documentation_generation', true);

          return {
            commitMessage,
            prDescription,
            docUpdates,
          };
        }

        /**
         * Generate a commit message and apply it to the workspace
         * Convenience method that generates message and commits in one call
         */
        async commitWithGeneratedMessage(
          changes: Array<{ path: string; oldContent: string; newContent: string }>,
          options?: CommitMessageOptions
        ): Promise<{ commitMessage: CommitMessage; commitHash: string | null }> {
          const commitMessage = await this.generateCommitMessageFromChanges(changes, options);
          const commitHash = await this.gitCommitWorkspace(commitMessage.fullMessage);
          return { commitMessage, commitHash };
        }

        // ============================================================
        // ERROR RECOVERY & DEBUGGING METHODS
        // ============================================================

        /**
         * Parse an error string into a structured format
         * Extracts category, severity, file location, stack trace, and identifiers
         */
        parseError(errorString: string): ParsedError {
          return errorParser.parse(errorString);
        }

        /**
         * Parse multiple errors from build/test output
         */
        parseMultipleErrors(output: string): ParsedError[] {
          return errorParser.parseMultiple(output);
        }

        /**
         * Start a new debug session for an error
         * Automatically parses errors and generates fix hypotheses
         */
        async startDebugSession(
          errorOutput: string,
          codeContext?: { file: string; content: string }[]
        ): Promise<DebugSession> {
          debugLogger.info('Starting debug session via AgentBrain', { errorOutput: errorOutput.substring(0, 200) });
          const session = await debugLoop.startSession(errorOutput, codeContext);
          await this.recordSkillUsage('error_debugging', true);
          return session;
        }

        /**
         * Get the current status of a debug session
         */
        getDebugSession(sessionId: string): DebugSession | undefined {
          return debugLoop.getSession(sessionId);
        }

        /**
         * Get all active debug sessions
         */
        getActiveDebugSessions(): DebugSession[] {
          return debugLoop.getActiveSessions();
        }

        /**
         * Get the next recommended fix hypothesis to try
         */
        getNextFixHypothesis(sessionId: string): FixHypothesis | null {
          return debugLoop.getNextHypothesis(sessionId);
        }

        /**
         * Attempt to apply a fix and verify it
         * Returns the attempt result including whether it succeeded
         */
        async attemptFix(
          sessionId: string,
          hypothesisId: string,
          applyChanges: (changes: CodeChange[]) => Promise<boolean>,
          runVerification: () => Promise<{ testResults?: TestResult; buildResults?: BuildResult; output: string }>
        ): Promise<DebugAttempt> {
          debugLogger.info('Attempting fix via AgentBrain', { sessionId, hypothesisId });
          const attempt = await debugLoop.attemptFix(sessionId, hypothesisId, applyChanges, runVerification);
          
          if (attempt.outcome === 'success') {
            await this.recordSkillUsage('error_debugging', true);
          } else {
            await this.recordSkillUsage('error_debugging', false);
          }
          
          return attempt;
        }

        /**
         * Run the full automated debug loop
         * Iteratively tries hypotheses until success or all options exhausted
         */
        async runAutomatedDebugLoop(
          sessionId: string,
          applyChanges: (changes: CodeChange[]) => Promise<boolean>,
          runVerification: () => Promise<{ testResults?: TestResult; buildResults?: BuildResult; output: string }>,
          onProgress?: (attempt: DebugAttempt, remaining: number) => void
        ): Promise<DebugSession> {
          debugLogger.info('Starting automated debug loop', { sessionId });
          const session = await debugLoop.runAutomatedLoop(sessionId, applyChanges, runVerification, onProgress);
          
          if (session.status === 'resolved') {
            await this.recordSkillUsage('error_debugging', true);
            // Learn from successful fix
            if (session.resolution) {
              await this.learn([{
                type: 'error_fix',
                content: `Fixed error: ${session.errors[0]?.summary} using: ${session.resolution.hypothesis.description}`,
                importance: 0.7,
                entities: [session.errors[0]?.category || 'error'],
                relations: [{ target: 'debugging', type: 'solved_by' }],
              }]);
            }
          }
          
          return session;
        }

        /**
         * Generate a debug report for a session
         */
        generateDebugReport(sessionId: string): string {
          return debugLoop.generateReport(sessionId);
        }

        /**
         * Analyze errors to find the root cause
         * Groups related errors and identifies the primary issue
         */
        analyzeRootCause(errors: (string | ParsedError)[]): {
          rootCause: ParsedError | null;
          rootCauseReason: string;
          relatedErrors: ParsedError[];
          recommendation: string;
        } {
          const parsedErrors = errors.map(e => 
            typeof e === 'string' ? errorParser.parse(e) : e
          );

          // Group errors by category
          const byCategory: Record<string, ParsedError[]> = {};
          for (const error of parsedErrors) {
            if (!byCategory[error.category]) {
              byCategory[error.category] = [];
            }
            byCategory[error.category].push(error);
          }

          // Priority order for root cause determination
          const priority: (keyof typeof byCategory)[] = ['syntax', 'import', 'type', 'runtime', 'build_failure'];
          let rootCause: ParsedError | null = null;
          let rootCauseReason = '';

          for (const category of priority) {
            if (byCategory[category] && byCategory[category].length > 0) {
              rootCause = byCategory[category][0];
              rootCauseReason = `${category} errors often cause cascading issues`;
              break;
            }
          }

          if (!rootCause && parsedErrors.length > 0) {
            rootCause = parsedErrors[0];
            rootCauseReason = 'First error in sequence';
          }

          // Find related errors (same file or shared identifiers)
          const relatedErrors = parsedErrors.filter(e => {
            if (e === rootCause) return false;
            if (rootCause?.file && e.file === rootCause.file) return true;
            const shared = rootCause?.involvedIdentifiers?.some(id => 
              e.involvedIdentifiers?.includes(id)
            );
            return shared;
          });

          return {
            rootCause,
            rootCauseReason,
            relatedErrors,
            recommendation: rootCause 
              ? `Fix the ${rootCause.category} error in ${rootCause.file || 'unknown file'} first`
              : 'No clear root cause identified',
          };
        }

        /**
         * Analyze a stack trace to find the origin of an error
         */
        analyzeStackTrace(error: string | ParsedError): {
          origin: { file: string; line: number; function?: string } | null;
          callPath: string[];
          filesInvolved: string[];
          recommendation: string;
        } {
          const parsed = typeof error === 'string' ? errorParser.parse(error) : error;
          const stackTrace = parsed.stackTrace || [];
          
          // Filter out internal frames
          const userFrames = stackTrace.filter(f => !f.isInternal);
          const origin = userFrames[0] || null;
          const filesInvolved = [...new Set(userFrames.map(f => f.file))];

          return {
            origin: origin ? { file: origin.file, line: origin.line, function: origin.function } : null,
            callPath: userFrames.map(f => `${f.function || 'anonymous'} (${f.file}:${f.line})`),
            filesInvolved,
            recommendation: origin 
              ? `Start debugging at ${origin.file}:${origin.line}`
              : 'No user code found in stack trace',
          };
        }

        /**
         * Enable debug logging mode for increased verbosity
         */
        enableDebugMode(): void {
          debugLogger.enable();
          debugLogger.info('Debug mode enabled by AgentBrain');
        }

        /**
         * Disable debug logging mode
         */
        disableDebugMode(): void {
          debugLogger.info('Debug mode disabled by AgentBrain');
          debugLogger.disable();
        }

        /**
         * Check if debug mode is enabled
         */
        isDebugModeEnabled(): boolean {
          return debugLogger.isEnabled();
        }

        /**
         * Get debug logs
         */
        getDebugLogs(filter?: { level?: string; since?: number }): Array<{
          level: string;
          message: string;
          timestamp: number;
          data?: any;
        }> {
          return debugLogger.getLogs(filter);
        }

        /**
         * Export all debug logs as formatted string
         */
        exportDebugLogs(): string {
          return debugLogger.exportLogs();
        }

        /**
         * Clear debug logs
         */
        clearDebugLogs(): void {
          debugLogger.clear();
        }

        /**
         * Update debug loop configuration
         */
        updateDebugConfig(config: Partial<DebugConfig>): void {
          debugLoop.updateConfig(config);
        }

        /**
         * Clear all debug sessions
         */
        clearDebugSessions(): void {
          debugLoop.clearSessions();
        }

        /**
         * Get debugging statistics
         */
        getDebuggingStats(): {
          activeSessions: number;
          debugModeEnabled: boolean;
          logCount: number;
        } {
          return {
            activeSessions: debugLoop.getActiveSessions().length,
            debugModeEnabled: debugLogger.isEnabled(),
            logCount: debugLogger.getLogs().length,
          };
        }

          /**
           * High-level method to debug an error output
           * Parses the error, generates hypotheses, and returns actionable fixes
           */
          async debugError(
            errorOutput: string,
            codeContext?: { file: string; content: string }[]
          ): Promise<{
            session: DebugSession;
            rootCause: ParsedError | null;
            topHypotheses: FixHypothesis[];
            recommendation: string;
          }> {
            // Start debug session
            const session = await this.startDebugSession(errorOutput, codeContext);
            
            // Analyze root cause
            const analysis = this.analyzeRootCause(session.errors);
            
            // Get top hypotheses
            const topHypotheses = session.hypotheses.slice(0, 5);

            return {
              session,
              rootCause: analysis.rootCause,
              topHypotheses,
              recommendation: analysis.recommendation,
            };
          }

          // ============================================================
          // GIT WORKFLOW METHODS
          // ============================================================

          /**
           * Initialize GitHub workflow integration (requires GitHub connection)
           */
          private async initializeGitHubWorkflow(): Promise<boolean> {
            if (this.githubWorkflow) return true;
            
            await this.github.initialize();
            if (!this.github.isConnected()) return false;

            const connection = await import('./github').then(m => m.getGitHubConnection(this.userId));
            if (!connection?.access_token) return false;

            const octokit = new Octokit({ auth: connection.access_token, userAgent: 'Agent-3D-Room/1.0' });
            this.githubWorkflow = createGitHubWorkflowIntegration(octokit, this.userId);
            return true;
          }

          /**
           * Clone a repository to the local workspace
           */
          async gitClone(repoUrl: string, options?: GitCloneOptions): Promise<{
            success: boolean;
            path: string;
            error?: string;
          }> {
            const result = await this.gitWorkflow.clone(repoUrl, options);
            if (result.success) {
              await this.recordSkillUsage('git_workflow', true);
            } else {
              await this.recordSkillUsage('git_workflow', false);
            }
            return result;
          }

          /**
           * Get current git status
           */
          async gitStatus(repoPath?: string): Promise<GitStatus> {
            return this.gitWorkflow.getStatus(repoPath);
          }

          /**
           * Stage files for commit
           */
          async gitStage(files: string[] | 'all', repoPath?: string): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.stage(files, repoPath);
          }

          /**
           * Unstage files
           */
          async gitUnstage(files: string[] | 'all', repoPath?: string): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.unstage(files, repoPath);
          }

          /**
           * Commit staged changes
           */
          async gitCommit(options: GitCommitOptions, repoPath?: string): Promise<{
            success: boolean;
            sha?: string;
            error?: string;
          }> {
            const result = await this.gitWorkflow.commit(options, repoPath);
            if (result.success) {
              await this.recordSkillUsage('git_workflow', true);
            }
            return result;
          }

          /**
           * Push changes to remote
           */
          async gitPush(options?: GitPushOptions, repoPath?: string): Promise<{ success: boolean; error?: string }> {
            const result = await this.gitWorkflow.push(options || {}, repoPath);
            if (result.success) {
              await this.recordSkillUsage('git_workflow', true);
            }
            return result;
          }

          /**
           * Pull changes from remote
           */
          async gitPull(
            remote?: string,
            branch?: string,
            rebase?: boolean,
            repoPath?: string
          ): Promise<{ success: boolean; updated: boolean; conflicts: boolean; error?: string }> {
            return this.gitWorkflow.pull(remote, branch, rebase, repoPath);
          }

          /**
           * Fetch from remote
           */
          async gitFetch(remote?: string, prune?: boolean, repoPath?: string): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.fetch(remote, prune, repoPath);
          }

          /**
           * Create a new branch
           */
          async gitCreateBranchLocal(
            branchName: string,
            checkout?: boolean,
            startPoint?: string,
            repoPath?: string
          ): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.createBranch(branchName, checkout, startPoint, repoPath);
          }

          /**
           * Checkout a branch
           */
          async gitCheckout(branchName: string, repoPath?: string): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.checkout(branchName, repoPath);
          }

          /**
           * Delete a branch
           */
          async gitDeleteBranch(
            branchName: string,
            force?: boolean,
            remote?: boolean,
            repoPath?: string
          ): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.deleteBranch(branchName, force, remote, repoPath);
          }

          /**
           * Merge a branch
           */
          async gitMerge(
            branchName: string,
            options?: GitMergeOptions,
            repoPath?: string
          ): Promise<{ success: boolean; conflicts: MergeConflict[]; error?: string }> {
            const result = await this.gitWorkflow.merge(branchName, options, repoPath);
            if (result.success) {
              await this.recordSkillUsage('git_workflow', true);
            }
            return result;
          }

          /**
           * Rebase onto another branch
           */
          async gitRebase(
            onto: string,
            options?: GitRebaseOptions,
            repoPath?: string
          ): Promise<{ success: boolean; conflicts: MergeConflict[]; error?: string }> {
            const result = await this.gitWorkflow.rebase(onto, options, repoPath);
            if (result.success) {
              await this.recordSkillUsage('git_workflow', true);
            }
            return result;
          }

          /**
           * Get merge/rebase conflicts
           */
          async gitGetConflicts(repoPath?: string): Promise<MergeConflict[]> {
            return this.gitWorkflow.getConflicts(repoPath);
          }

          /**
           * Resolve a merge conflict
           */
          async gitResolveConflict(
            resolution: ConflictResolution,
            repoPath?: string
          ): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.resolveConflict(resolution, repoPath);
          }

          /**
           * Abort an in-progress merge
           */
          async gitAbortMerge(repoPath?: string): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.abortMerge(repoPath);
          }

          /**
           * Get commit log
           */
          async gitLog(count?: number, branch?: string, repoPath?: string): Promise<Array<{
            sha: string;
            message: string;
            author: string;
            date: string;
          }>> {
            return this.gitWorkflow.getLog(count, branch, repoPath);
          }

          /**
           * Get diff between refs
           */
          async gitDiff(
            fromRef: string,
            toRef?: string,
            files?: string[],
            repoPath?: string
          ): Promise<string> {
            return this.gitWorkflow.getDiff(fromRef, toRef, files, repoPath);
          }

          /**
           * Stash changes
           */
          async gitStash(
            message?: string,
            includeUntracked?: boolean,
            repoPath?: string
          ): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.stash(message, includeUntracked, repoPath);
          }

          /**
           * Pop stash
           */
          async gitStashPop(repoPath?: string): Promise<{ success: boolean; conflicts: boolean; error?: string }> {
            return this.gitWorkflow.stashPop(repoPath);
          }

          /**
           * Cherry-pick a commit
           */
          async gitCherryPick(sha: string, repoPath?: string): Promise<{
            success: boolean;
            conflicts: boolean;
            error?: string;
          }> {
            return this.gitWorkflow.cherryPick(sha, repoPath);
          }

          /**
           * Reset to a specific commit
           */
          async gitReset(
            ref: string,
            mode?: 'soft' | 'mixed' | 'hard',
            repoPath?: string
          ): Promise<{ success: boolean; error?: string }> {
            return this.gitWorkflow.reset(ref, mode, repoPath);
          }

          /**
           * Get/set current repo path
           */
          getGitRepoPath(): string | null {
            return this.gitWorkflow.getRepoPath();
          }

          setGitRepoPath(path: string): void {
            this.gitWorkflow.setRepoPath(path);
          }

          // ============================================================
          // GITHUB PR REVIEW METHODS
          // ============================================================

          /**
           * Get PR reviews
           */
          async getPRReviews(owner: string, repo: string, prNumber: number): Promise<PRReview[]> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) return [];
            return this.githubWorkflow.getPRReviews(owner, repo, prNumber);
          }

          /**
           * Get PR review comments
           */
          async getPRReviewComments(owner: string, repo: string, prNumber: number): Promise<PRReviewComment[]> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) return [];
            return this.githubWorkflow.getPRReviewComments(owner, repo, prNumber);
          }

          /**
           * Reply to a PR review comment
           */
          async replyToReviewComment(
            owner: string,
            repo: string,
            prNumber: number,
            commentId: number,
            body: string
          ): Promise<{ success: boolean; commentId?: number; error?: string }> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) {
              return { success: false, error: 'GitHub not connected' };
            }
            const result = await this.githubWorkflow.replyToReviewComment(owner, repo, prNumber, commentId, body);
            if (result.success) {
              await this.recordSkillUsage('pr_review', true);
            }
            return result;
          }

          /**
           * Create a review on a PR
           */
          async createPRReview(
            owner: string,
            repo: string,
            prNumber: number,
            options: {
              event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
              body?: string;
              comments?: Array<{ path: string; line: number; body: string; side?: 'LEFT' | 'RIGHT' }>;
            }
          ): Promise<{ success: boolean; reviewId?: number; error?: string }> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) {
              return { success: false, error: 'GitHub not connected' };
            }
            const result = await this.githubWorkflow.createReview(owner, repo, prNumber, options);
            if (result.success) {
              await this.recordSkillUsage('pr_review', true);
            }
            return result;
          }

          /**
           * Get files changed in a PR
           */
          async getPRFiles(owner: string, repo: string, prNumber: number): Promise<Array<{
            filename: string;
            status: string;
            additions: number;
            deletions: number;
            changes: number;
            patch?: string;
          }>> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) return [];
            return this.githubWorkflow.getPRFiles(owner, repo, prNumber);
          }

          /**
           * Update a PR based on review feedback
           */
          async updatePRFromReview(
            owner: string,
            repo: string,
            prNumber: number,
            changes: Array<{ path: string; content: string }>,
            commitMessage: string
          ): Promise<{ success: boolean; sha?: string; error?: string }> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) {
              return { success: false, error: 'GitHub not connected' };
            }
            const result = await this.githubWorkflow.updatePRFromReview(owner, repo, prNumber, changes, commitMessage);
            if (result.success) {
              await this.recordSkillUsage('pr_review', true);
            }
            return result;
          }

          // ============================================================
          // CI/CD INTEGRATION METHODS
          // ============================================================

          /**
           * Get CI workflow runs for a repository
           */
          async getWorkflowRuns(
            owner: string,
            repo: string,
            options?: { branch?: string; status?: 'queued' | 'in_progress' | 'completed'; perPage?: number }
          ): Promise<CIWorkflowRun[]> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) return [];
            return this.githubWorkflow.getWorkflowRuns(owner, repo, options);
          }

          /**
           * Get workflow run logs
           */
          async getWorkflowRunLogs(owner: string, repo: string, runId: number): Promise<{
            success: boolean;
            logs?: string;
            error?: string;
          }> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) {
              return { success: false, error: 'GitHub not connected' };
            }
            return this.githubWorkflow.getWorkflowRunLogs(owner, repo, runId);
          }

          /**
           * Get details of a failed workflow for debugging
           */
          async getFailedWorkflowDetails(owner: string, repo: string, runId: number): Promise<{
            failedJobs: Array<{
              name: string;
              failedStep: { name: string; number: number } | null;
              logs?: string;
            }>;
            summary: string;
          }> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) {
              return { failedJobs: [], summary: 'GitHub not connected' };
            }
            return this.githubWorkflow.getFailedWorkflowDetails(owner, repo, runId);
          }

          /**
           * Re-run a workflow
           */
          async rerunWorkflow(
            owner: string,
            repo: string,
            runId: number,
            failedOnly?: boolean
          ): Promise<{ success: boolean; error?: string }> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) {
              return { success: false, error: 'GitHub not connected' };
            }
            const result = await this.githubWorkflow.rerunWorkflow(owner, repo, runId, failedOnly);
            if (result.success) {
              await this.recordSkillUsage('ci_cd', true);
            }
            return result;
          }

          /**
           * Cancel a workflow run
           */
          async cancelWorkflow(owner: string, repo: string, runId: number): Promise<{ success: boolean; error?: string }> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) {
              return { success: false, error: 'GitHub not connected' };
            }
            return this.githubWorkflow.cancelWorkflow(owner, repo, runId);
          }

          /**
           * Wait for a workflow to complete
           */
          async waitForWorkflow(
            owner: string,
            repo: string,
            runId: number,
            timeoutMs?: number,
            pollIntervalMs?: number
          ): Promise<{ completed: boolean; conclusion: string | null; timedOut: boolean }> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) {
              return { completed: false, conclusion: null, timedOut: false };
            }
            return this.githubWorkflow.waitForWorkflow(owner, repo, runId, timeoutMs, pollIntervalMs);
          }

          /**
           * Get commit checks
           */
          async getCommitChecks(owner: string, repo: string, ref: string): Promise<Array<{
            name: string;
            status: string;
            conclusion: string | null;
            output: { title: string | null; summary: string | null };
          }>> {
            const initialized = await this.initializeGitHubWorkflow();
            if (!initialized || !this.githubWorkflow) return [];
            return this.githubWorkflow.getCommitChecks(owner, repo, ref);
          }

          // ============================================================
          // HIGH-LEVEL GIT WORKFLOW METHODS
          // ============================================================

          /**
           * Full workflow: Clone repo, create branch, make changes, commit, push, create PR
           */
          async executeFullGitWorkflow(
            repoUrl: string,
            branchName: string,
            changes: Array<{ path: string; content: string }>,
            commitMessage: string,
            prTitle: string,
            prBody?: string
          ): Promise<{
            success: boolean;
            repoPath?: string;
            commitSha?: string;
            prUrl?: string;
            error?: string;
          }> {
            try {
              // Clone repository
              const cloneResult = await this.gitClone(repoUrl, { depth: 1 });
              if (!cloneResult.success) {
                return { success: false, error: `Clone failed: ${cloneResult.error}` };
              }

              // Create and checkout branch
              const branchResult = await this.gitCreateBranchLocal(branchName, true);
              if (!branchResult.success) {
                return { success: false, error: `Branch creation failed: ${branchResult.error}` };
              }

              // Write changes
              for (const change of changes) {
                const writeSuccess = await this.writeWorkspaceFile(change.path, change.content);
                if (!writeSuccess) {
                  return { success: false, error: `Failed to write ${change.path}` };
                }
              }

              // Stage all changes
              const stageResult = await this.gitStage('all');
              if (!stageResult.success) {
                return { success: false, error: `Stage failed: ${stageResult.error}` };
              }

              // Commit
              const commitResult = await this.gitCommit({ message: commitMessage });
              if (!commitResult.success) {
                return { success: false, error: `Commit failed: ${commitResult.error}` };
              }

              // Push
              const pushResult = await this.gitPush({ setUpstream: true, remote: 'origin', branch: branchName });
              if (!pushResult.success) {
                return { success: false, error: `Push failed: ${pushResult.error}` };
              }

              // Extract owner/repo from URL
              const urlMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
              if (!urlMatch) {
                return { 
                  success: true, 
                  repoPath: cloneResult.path, 
                  commitSha: commitResult.sha,
                  error: 'Could not parse repo URL for PR creation'
                };
              }

              const [, owner, repo] = urlMatch;

              // Create PR
              const prResult = await this.createPR(owner, repo, prTitle, branchName, 'main', prBody);
              
              return {
                success: true,
                repoPath: cloneResult.path,
                commitSha: commitResult.sha,
                prUrl: prResult.prUrl,
              };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          }

          /**
           * Handle a full CI feedback loop:
           * 1. Monitor for failing builds
           * 2. Analyze failures
           * 3. Generate fixes
           * 4. Create PR with fixes
           */
          async handleCIFeedbackLoop(
            owner: string,
            repo: string,
            options?: {
              maxAttempts?: number;
              autoFix?: boolean;
              branchPrefix?: string;
            }
          ): Promise<{
            success: boolean;
            failedRuns: CIWorkflowRun[];
            fixAttempts: Array<{
              runId: number;
              analysis: string;
              fixApplied: boolean;
              prUrl?: string;
            }>;
            summary: string;
          }> {
            const maxAttempts = options?.maxAttempts || 3;
            const branchPrefix = options?.branchPrefix || 'fix/ci-';
            const fixAttempts: Array<{
              runId: number;
              analysis: string;
              fixApplied: boolean;
              prUrl?: string;
            }> = [];

            // Get recent workflow runs
            const runs = await this.getWorkflowRuns(owner, repo, { status: 'completed', perPage: 10 });
            const failedRuns = runs.filter(r => r.conclusion === 'failure');

            if (failedRuns.length === 0) {
              return {
                success: true,
                failedRuns: [],
                fixAttempts: [],
                summary: 'No failed CI runs found',
              };
            }

            await this.recordSkillUsage('ci_cd', true);

            for (const run of failedRuns.slice(0, maxAttempts)) {
              // Get failure details
              const details = await this.getFailedWorkflowDetails(owner, repo, run.id);
              
              fixAttempts.push({
                runId: run.id,
                analysis: details.summary,
                fixApplied: false,
              });

              // If auto-fix is enabled and we have file context, we could attempt fixes here
              // This would integrate with the debugging system
            }

            return {
              success: true,
              failedRuns,
              fixAttempts,
              summary: `Found ${failedRuns.length} failed run(s). Analysis complete.`,
            };
          }

          /**
           * Respond to all review comments on a PR
           */
          async respondToAllPRComments(
            owner: string,
            repo: string,
            prNumber: number,
            responseStrategy: 'acknowledge' | 'detailed' | 'custom',
            customResponses?: Map<number, string>
          ): Promise<{
            success: boolean;
            responsesCount: number;
            errors: string[];
          }> {
            const comments = await this.getPRReviewComments(owner, repo, prNumber);
            const errors: string[] = [];
            let responsesCount = 0;

            for (const comment of comments) {
              // Skip if already replied (would need to track this)
              let responseBody: string;

              if (customResponses?.has(comment.id)) {
                responseBody = customResponses.get(comment.id)!;
              } else {
                switch (responseStrategy) {
                  case 'acknowledge':
                    responseBody = 'Thank you for the feedback. I will address this.';
                    break;
                  case 'detailed':
                    responseBody = `Acknowledged. This feedback regarding the code at ${comment.path}:${comment.line} has been noted and will be addressed in the next commit.`;
                    break;
                  default:
                    continue;
                }
              }

              const result = await this.replyToReviewComment(owner, repo, prNumber, comment.id, responseBody);
              if (result.success) {
                responsesCount++;
              } else {
                errors.push(`Failed to reply to comment ${comment.id}: ${result.error}`);
              }
            }

            return {
              success: errors.length === 0,
              responsesCount,
              errors,
            };
          }

          // ============================================================
          // ENHANCED TESTING SYSTEM METHODS
          // ============================================================

          /**
           * Detect the test framework used in a workspace
           */
          async detectTestFramework(workspacePath: string): Promise<TestFramework> {
            return this.enhancedTestRunner.detectFramework(workspacePath);
          }

          /**
           * Run tests with detailed parsing of results
           * Returns structured failure information with causes and suggested fixes
           */
          async runEnhancedTests(
            workspacePath: string,
            options?: {
              framework?: TestFramework;
              testFile?: string;
              testPattern?: string;
              coverage?: boolean;
              timeout?: number;
            }
          ): Promise<ParsedTestResult> {
            const result = await this.enhancedTestRunner.runTests(workspacePath, options);
            await this.recordSkillUsage('enhanced_testing', result.success);
            return result;
          }

          /**
           * Generate unit tests for a source file
           * Analyzes the code to create comprehensive test templates
           */
          async generateTests(
            sourceFile: string,
            sourceCode: string,
            options?: {
              framework?: TestFramework;
              testStyle?: 'unit' | 'integration' | 'e2e';
              targetEntities?: string[];
            }
          ): Promise<GeneratedTest[]> {
            const tests = await this.enhancedTestRunner.generateTests(sourceFile, sourceCode, options);
            await this.recordSkillUsage('test_generation', tests.length > 0);
            return tests;
          }

          /**
           * Analyze test failures and get detailed diagnostics
           * Returns possible causes and suggested fixes for each failure
           */
          analyzeTestFailures(result: ParsedTestResult): Array<{
            failure: ParsedTestFailure;
            possibleCauses: string[];
            suggestedFixes: string[];
          }> {
            return this.enhancedTestRunner.analyzeFailures(result);
          }

          /**
           * Get coverage report for a workspace
           */
          async getTestCoverage(
            workspacePath: string,
            framework?: TestFramework
          ): Promise<CoverageReport | null> {
            const coverage = await this.enhancedTestRunner.getCoverageReport(workspacePath, framework);
            await this.recordSkillUsage('coverage_analysis', coverage !== null);
            return coverage;
          }

          /**
           * Generate tests specifically targeting uncovered code
           */
          async generateCoverageTests(
            workspacePath: string,
            sourceFiles: Array<{ path: string; content: string }>,
            framework?: TestFramework
          ): Promise<GeneratedTest[]> {
            const tests = await this.enhancedTestRunner.generateCoverageTests(workspacePath, sourceFiles, framework);
            await this.recordSkillUsage('coverage_test_generation', tests.length > 0);
            return tests;
          }

          /**
           * Start a TDD session for a new feature
           * Guides through the red-green-refactor cycle
           */
          startTDDSession(
            feature: string,
            targetFile: string,
            framework?: TestFramework
          ): TDDSession {
            return this.enhancedTestRunner.startTDDSession(feature, targetFile, framework);
          }

          /**
           * Get guidance for the current TDD step
           */
          getTDDGuidance(sessionId: string): {
            step: TDDStep['step'];
            guidance: string;
            template?: string;
          } {
            return this.enhancedTestRunner.getTDDGuidance(sessionId);
          }

          /**
           * Record completion of a TDD step
           */
          recordTDDStep(
            sessionId: string,
            step: TDDStep['step'],
            data: {
              testCode?: string;
              implementationCode?: string;
              testResult?: ParsedTestResult;
            }
          ): TDDStep {
            return this.enhancedTestRunner.recordTDDStep(sessionId, step, data);
          }

          /**
           * Get a TDD session by ID
           */
          getTDDSession(sessionId: string): TDDSession | null {
            return this.enhancedTestRunner.getTDDSession(sessionId);
          }

          /**
           * Get test history for the user
           */
          async getTestHistory(limit?: number): Promise<any[]> {
            return this.enhancedTestRunner.getTestHistory(limit);
          }

          /**
           * Full TDD workflow: write test, run, write code, verify
           * Orchestrates the complete test-driven development cycle
           */
          async executeTDDCycle(
            feature: string,
            targetFile: string,
            sourceCode: string,
            options?: {
              framework?: TestFramework;
              workspacePath?: string;
            }
          ): Promise<{
            session: TDDSession;
            testCode: string;
            testResult: ParsedTestResult;
            suggestions: string[];
          }> {
            const framework = options?.framework;
            const workspacePath = options?.workspacePath || process.cwd();

            // Start TDD session
            const session = this.startTDDSession(feature, targetFile, framework);

            // Generate initial test
            const generatedTests = await this.generateTests(targetFile, sourceCode, {
              framework,
              testStyle: 'unit',
            });

            const testCode = generatedTests.length > 0 
              ? generatedTests[0].testCode 
              : this.getTDDGuidance(session.id).template || '';

            // Record test writing step
            this.recordTDDStep(session.id, 'write_test', { testCode });

            // Run the test
            const testResult = await this.runEnhancedTests(workspacePath, { framework });

            // Record test run step
            this.recordTDDStep(session.id, 'run_test', { testResult });

            // Analyze failures if any
            const failureAnalysis = this.analyzeTestFailures(testResult);
            const suggestions = failureAnalysis.flatMap(a => a.suggestedFixes);

            return {
              session,
              testCode,
              testResult,
              suggestions,
            };
          }

          /**
           * Run tests and automatically fix failures
           * Iteratively attempts to fix failing tests
           */
          async runTestsAndFix(
            workspacePath: string,
            options?: {
              framework?: TestFramework;
              maxAttempts?: number;
              autoFix?: boolean;
            }
          ): Promise<{
            finalResult: ParsedTestResult;
            attempts: number;
            fixesApplied: string[];
          }> {
            const maxAttempts = options?.maxAttempts || 3;
            const fixesApplied: string[] = [];
            let attempts = 0;
            let result = await this.runEnhancedTests(workspacePath, options);

            while (!result.success && attempts < maxAttempts) {
              attempts++;
              const analysis = this.analyzeTestFailures(result);

              // Log the fixes we would suggest
              for (const { failure, suggestedFixes } of analysis) {
                if (suggestedFixes.length > 0) {
                  fixesApplied.push(`[${failure.testName}] Suggested: ${suggestedFixes[0]}`);
                }
              }

              // If autoFix is enabled, we would apply fixes here
              // For now, we just document what fixes are needed
              if (!options?.autoFix) {
                break;
              }

              // Re-run tests after potential fixes
              result = await this.runEnhancedTests(workspacePath, options);
            }

            return {
              finalResult: result,
              attempts,
              fixesApplied,
            };
          }

          /**
           * Get testing statistics and recommendations
           */
          async getTestingStats(workspacePath?: string): Promise<{
            framework: TestFramework;
            coverage?: CoverageReport;
            lastRun?: ParsedTestResult;
            recommendations: string[];
          }> {
            const framework = workspacePath 
              ? await this.detectTestFramework(workspacePath)
              : 'unknown' as TestFramework;

            const coverage = workspacePath 
              ? await this.getTestCoverage(workspacePath, framework)
              : null;

            const recommendations: string[] = [];

            if (framework === 'unknown') {
              recommendations.push('No test framework detected. Consider adding Jest, Vitest, or pytest.');
            }

            if (coverage) {
              if (coverage.linePercentage < 50) {
                recommendations.push(`Low test coverage (${coverage.linePercentage}%). Add tests for uncovered code.`);
              }
              if (coverage.branchPercentage < 50) {
                recommendations.push(`Low branch coverage (${coverage.branchPercentage}%). Add tests for conditional paths.`);
              }
              if (coverage.functionPercentage < 70) {
                recommendations.push(`Some functions are untested. Consider adding unit tests for all public functions.`);
              }
            } else {
              recommendations.push('No coverage data available. Run tests with coverage enabled.');
            }

            return {
              framework,
              coverage: coverage || undefined,
              recommendations,
            };
          }
}

export function createAgentBrain(userId: string): AgentBrain {
  return new AgentBrain(userId);
}

export async function initializeBaseSkills(): Promise<void> {
  const baseSkills = [
    {
      name: 'web_browsing',
      category: 'research' as const,
      description: 'Navigate websites, search for information, and extract data from web pages',
      knowledge: { patterns: ['NAVIGATE:url', 'TYPE:search_query', 'CLICK:element'] },
    },
    {
      name: 'code_execution',
      category: 'coding' as const,
      description: 'Write and execute code in multiple programming languages',
      knowledge: { languages: ['javascript', 'python', 'typescript'], patterns: ['write', 'test', 'debug'] },
    },
    {
      name: 'github_integration',
      category: 'integration' as const,
      description: 'Interact with GitHub repositories, create branches, and manage pull requests',
      knowledge: { actions: ['clone', 'branch', 'commit', 'push', 'pr'] },
    },
    {
      name: 'testing',
      category: 'coding' as const,
      description: 'Write and run automated tests for code',
      knowledge: { frameworks: ['jest', 'unittest', 'pytest'] },
    },
    {
      name: 'enhanced_testing',
      category: 'coding' as const,
      description: 'Advanced testing with test generation, TDD workflow, coverage analysis, and failure diagnostics',
      knowledge: { 
        frameworks: ['jest', 'vitest', 'pytest', 'mocha', 'go-test', 'cargo-test'],
        features: ['test_generation', 'tdd_workflow', 'coverage_analysis', 'failure_diagnostics'],
        capabilities: ['generate_tests', 'parse_output', 'analyze_failures', 'coverage_tests', 'tdd_session'],
      },
    },
    {
      name: 'task_planning',
      category: 'analysis' as const,
      description: 'Break down complex tasks into manageable steps',
      knowledge: { patterns: ['analyze', 'plan', 'execute', 'verify'] },
    },
    {
      name: 'workspace_mount',
      category: 'integration' as const,
      description: 'Mount local project directories as active workspace for file operations',
      knowledge: { actions: ['mount', 'unmount', 'switch'], supported: ['local', 'git-clone', 'git-worktree'] },
    },
    {
      name: 'workspace_clone',
      category: 'integration' as const,
      description: 'Clone git repositories and set them as active workspace',
      knowledge: { actions: ['clone', 'checkout', 'branch'], vcs: ['git'] },
    },
    {
      name: 'docker_workspace',
      category: 'automation' as const,
      description: 'Create sandboxed Docker environments for safe code execution and testing',
      knowledge: { images: ['node', 'python', 'go', 'rust'], actions: ['create', 'exec', 'test', 'build'] },
    },
    {
      name: 'workspace_exec',
      category: 'automation' as const,
      description: 'Execute commands in the active workspace context',
      knowledge: { patterns: ['shell', 'npm', 'python', 'make'] },
    },
      {
        name: 'docker_exec',
        category: 'automation' as const,
        description: 'Execute commands inside Docker containers for isolated execution',
          knowledge: { patterns: ['shell', 'test', 'build', 'install'] },
        },
        {
            name: 'diff_editing',
            category: 'coding' as const,
            description: 'Surgical code editing using unified diffs, line-range operations, and AST-aware modifications',
            knowledge: { 
              operations: ['applyDiff', 'replaceLines', 'insertAfter', 'insertBefore', 'deleteLines', 'astModify'],
              astOperations: ['insertFunction', 'insertClass', 'insertMethod', 'insertImport', 'modifyFunction', 'deleteEntity', 'renameEntity'],
              features: ['validation', 'multiFile', 'atomicCommit', 'rollback']
            },
          },
            {
              name: 'hallucination_prevention',
              category: 'analysis' as const,
              description: 'Verify generated code and claims against the actual codebase to prevent hallucinations',
              knowledge: {
                checks: ['file_exists', 'function_exists', 'type_exists', 'import_valid', 'syntax_valid'],
                features: ['grounding', 'confidence_scoring', 'verification_challenges', 'source_citations'],
                scoring: ['evidence_based', 'syntax_validity', 'grounding_score', 'consistency_score'],
              },
            },
            {
              name: 'documentation_generation',
              category: 'communication' as const,
              description: 'Generate documentation including commit messages, PR descriptions, inline comments, and README updates',
              knowledge: {
                outputs: ['commit_message', 'pr_description', 'inline_comments', 'readme_update', 'jsdoc', 'action_explanation'],
                styles: ['conventional', 'semantic', 'descriptive'],
                features: ['diff_analysis', 'complexity_detection', 'automatic_changelog', 'checklist_generation'],
              },
            },
          {
            name: 'error_debugging',
            category: 'coding' as const,
            description: 'Debug errors through parsing, root cause analysis, hypothesis generation, and iterative fix-test-verify loops',
            knowledge: {
              errorCategories: ['syntax', 'type', 'runtime', 'import', 'dependency', 'permission', 'network', 'resource', 'test_failure', 'build_failure'],
              features: ['error_parsing', 'stack_trace_analysis', 'root_cause_analysis', 'llm_hypothesis_generation', 'fix_verification'],
              workflow: ['parse', 'categorize', 'hypothesize', 'apply', 'verify', 'iterate'],
            },
          },
          {
            name: 'git_workflow',
            category: 'integration' as const,
            description: 'Full git workflow operations including clone, branch, commit, push, pull, merge, rebase, and conflict resolution',
            knowledge: {
              operations: ['clone', 'commit', 'push', 'pull', 'fetch', 'branch', 'checkout', 'merge', 'rebase', 'stash', 'cherry-pick', 'reset'],
              features: ['conflict_detection', 'conflict_resolution', 'merge_strategies', 'rebase_interactive'],
              workflows: ['feature_branch', 'trunk_based', 'gitflow'],
            },
          },
          {
            name: 'pr_review',
            category: 'integration' as const,
            description: 'GitHub pull request review operations including reading reviews, responding to comments, and creating reviews',
            knowledge: {
              operations: ['get_reviews', 'get_comments', 'reply_to_comment', 'create_review', 'update_pr'],
              reviewTypes: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
              features: ['inline_comments', 'review_threads', 'pr_files_diff'],
            },
          },
          {
            name: 'ci_cd',
            category: 'automation' as const,
            description: 'CI/CD integration for GitHub Actions including monitoring, debugging failures, and triggering reruns',
            knowledge: {
              operations: ['get_runs', 'get_logs', 'analyze_failures', 'rerun', 'cancel', 'wait'],
              features: ['job_analysis', 'step_analysis', 'failure_summary', 'commit_checks'],
              integrations: ['github_actions'],
            },
          },
        ];
  
  for (const skill of baseSkills) {
    await skillManager.learnSkill(skill.name, skill.category, skill.description, skill.knowledge);
  }
}
