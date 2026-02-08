import { getImmediateAction, getReflectivePlan } from './groq';
import { agentMemory } from './agentMemory';
import { calculateEvidenceBasedScore, hallucinationPrevention } from './hallucinationPrevention';

interface ThoughtNode {
  id: string;
  thought: string;
  score: number;
  confidence: number;
  evidence: string[];
  warnings: string[];
  children: ThoughtNode[];
  parent?: string;
  depth: number;
}

interface PlanningContext {
  codebaseFiles?: Array<{ path: string; content: string }>;
  previousSteps?: string[];
}

export class HierarchicalPlanner {
  private maxDepth = 3;
  private branchFactor = 3;
  private planningContext: PlanningContext = {};

  /**
   * Set codebase context for evidence-based scoring
   */
  async setCodebaseContext(files: Array<{ path: string; content: string }>): Promise<void> {
    this.planningContext.codebaseFiles = files;
    await hallucinationPrevention.updateCodebaseContext(files);
  }

  async plan(task: string, currentState: any, context: string): Promise<string[]> {
    console.log(`Starting Tree of Thoughts for task: ${task}`);
    
    // Level 0: Root
    const root: ThoughtNode = {
      id: 'root',
      thought: task,
      score: 1.0,
      confidence: 1.0,
      evidence: ['Root task'],
      warnings: [],
      children: [],
      depth: 0
    };

    // Reset previous steps for new planning session
    this.planningContext.previousSteps = [];

    // BFS/DFS to build the tree
    let currentLevelNodes = [root];
    
    for (let d = 1; d <= this.maxDepth; d++) {
      const nextLevelNodes: ThoughtNode[] = [];
      
      for (const node of currentLevelNodes) {
        const branches = await this.generateBranches(node, task, currentState, context);
        node.children = branches;
        nextLevelNodes.push(...branches);
      }
      
      // Keep only top nodes to prevent explosion
      // Prioritize high-confidence, high-score nodes
      currentLevelNodes = nextLevelNodes
        .sort((a, b) => {
          // Combined score: 70% evidence score, 30% confidence
          const scoreA = a.score * 0.7 + a.confidence * 0.3;
          const scoreB = b.score * 0.7 + b.confidence * 0.3;
          return scoreB - scoreA;
        })
        .slice(0, this.branchFactor);
      
      // Log low-confidence nodes for transparency
      for (const node of currentLevelNodes) {
        if (node.confidence < 0.5) {
          console.warn(`[HierarchicalPlanner] Low confidence node: "${node.thought}" (confidence: ${node.confidence.toFixed(2)})`);
          if (node.warnings.length > 0) {
            console.warn(`  Warnings: ${node.warnings.join(', ')}`);
          }
        }
      }
      
      if (currentLevelNodes.length === 0) break;
    }

    // Find the best leaf node and trace back
    const bestPath = this.getBestPath(root);
    return bestPath;
  }

  private async generateBranches(node: ThoughtNode, task: string, currentState: any, context: string): Promise<ThoughtNode[]> {
    const branches: ThoughtNode[] = [];
    
    // Get reflective plan steps from LLM
    const plan = await getReflectivePlan(task, currentState, context);
    const steps = plan.steps || [];
    
    // Score each step using evidence-based verification instead of random
    for (let i = 0; i < Math.min(steps.length, this.branchFactor); i++) {
      const step = steps[i];
      
      // Calculate evidence-based score using actual codebase verification
      const scoreResult = await calculateEvidenceBasedScore(step, {
        task,
        codebaseFiles: this.planningContext.codebaseFiles,
        previousSteps: this.planningContext.previousSteps,
      });
      
      branches.push({
        id: `${node.id}-${i}`,
        thought: step,
        score: scoreResult.score,
        confidence: scoreResult.confidence,
        evidence: scoreResult.evidence,
        warnings: scoreResult.warnings,
        children: [],
        parent: node.id,
        depth: node.depth + 1
      });
      
      // Track this step for context in subsequent branches
      this.planningContext.previousSteps = [
        ...(this.planningContext.previousSteps || []),
        step
      ].slice(-5); // Keep last 5 steps for context
    }

    return branches;
  }

  private getBestPath(root: ThoughtNode): string[] {
    let path: string[] = [];
    let current = root;
    
    while (current.children.length > 0) {
      // Pick the child with the highest combined score
      const bestChild = current.children.reduce((prev, curr) => {
        const prevScore = prev.score * 0.7 + prev.confidence * 0.3;
        const currScore = curr.score * 0.7 + curr.confidence * 0.3;
        return currScore > prevScore ? curr : prev;
      });
      
      path.push(bestChild.thought);
      current = bestChild;
    }
    
    return path;
  }

  /**
   * Get detailed plan with confidence scores
   */
  async planWithDetails(task: string, currentState: any, context: string): Promise<{
    steps: string[];
    scores: number[];
    confidences: number[];
    evidence: string[][];
    warnings: string[][];
    overallConfidence: number;
  }> {
    // Build the tree
    const root: ThoughtNode = {
      id: 'root',
      thought: task,
      score: 1.0,
      confidence: 1.0,
      evidence: ['Root task'],
      warnings: [],
      children: [],
      depth: 0
    };

    this.planningContext.previousSteps = [];
    let currentLevelNodes = [root];
    
    for (let d = 1; d <= this.maxDepth; d++) {
      const nextLevelNodes: ThoughtNode[] = [];
      
      for (const node of currentLevelNodes) {
        const branches = await this.generateBranches(node, task, currentState, context);
        node.children = branches;
        nextLevelNodes.push(...branches);
      }
      
      currentLevelNodes = nextLevelNodes
        .sort((a, b) => (b.score * 0.7 + b.confidence * 0.3) - (a.score * 0.7 + a.confidence * 0.3))
        .slice(0, this.branchFactor);
      
      if (currentLevelNodes.length === 0) break;
    }

    // Trace best path with details
    const steps: string[] = [];
    const scores: number[] = [];
    const confidences: number[] = [];
    const evidence: string[][] = [];
    const warnings: string[][] = [];
    
    let current = root;
    while (current.children.length > 0) {
      const bestChild = current.children.reduce((prev, curr) => {
        const prevScore = prev.score * 0.7 + prev.confidence * 0.3;
        const currScore = curr.score * 0.7 + curr.confidence * 0.3;
        return currScore > prevScore ? curr : prev;
      });
      
      steps.push(bestChild.thought);
      scores.push(bestChild.score);
      confidences.push(bestChild.confidence);
      evidence.push(bestChild.evidence);
      warnings.push(bestChild.warnings);
      current = bestChild;
    }

    const overallConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

    return {
      steps,
      scores,
      confidences,
      evidence,
      warnings,
      overallConfidence,
    };
  }
}

export const hierarchicalPlanner = new HierarchicalPlanner();
