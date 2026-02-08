/**
 * Code Analysis API
 * Provides deep code understanding through AST parsing and semantic analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { codeAnalyzer, CodeEntity, CodeAnalysisResult } from '@/lib/codeAnalysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, files, functionName, pattern, type, filePath, content, query } = body;

    switch (action) {
      case 'analyze': {
        // Analyze code files
        if (!files || !Array.isArray(files)) {
          return NextResponse.json(
            { error: 'Files array is required' },
            { status: 400 }
          );
        }

        codeAnalyzer.clearCache();
        
        const results: Array<{ filePath: string } & CodeAnalysisResult> = [];
        for (const file of files) {
          const result = await codeAnalyzer.analyzeFile(file.path, file.content);
          results.push({
            filePath: file.path,
            ...result,
          });
        }

        // Get dependency graph
        const graph = codeAnalyzer.getDependencyGraph();
        const callGraph = codeAnalyzer.getCallGraph();

        return NextResponse.json({
          results,
          dependencyGraph: {
            nodes: Array.from(graph.nodes.keys()),
            edges: graph.edges.map((e: { from: string; to: string; type: string }) => ({ from: e.from, to: e.to, type: e.type })),
          },
          callGraphSize: callGraph.size,
        });
      }

      case 'analyzeFile': {
        // Analyze a single file
        if (!filePath || !content) {
          return NextResponse.json(
            { error: 'filePath and content are required' },
            { status: 400 }
          );
        }

        const result = await codeAnalyzer.analyzeFile(filePath, content);
        return NextResponse.json({ result });
      }

      case 'analyzeProject': {
        // Analyze multiple files as a project
        if (!files || !Array.isArray(files)) {
          return NextResponse.json(
            { error: 'Files array is required' },
            { status: 400 }
          );
        }

        const projectResult = await codeAnalyzer.analyzeProject(files);
        
        // Convert Maps to JSON-serializable objects
        const fileResults: Record<string, CodeAnalysisResult> = {};
        projectResult.files.forEach((value, key) => {
          fileResults[key] = value;
        });

        const callGraphData: Record<string, unknown> = {};
        projectResult.callGraph.forEach((value, key) => {
          callGraphData[key] = value;
        });

        return NextResponse.json({
          files: fileResults,
          dependencyGraph: {
            nodes: Array.from(projectResult.dependencyGraph.nodes.keys()),
            edges: projectResult.dependencyGraph.edges,
          },
          callGraph: callGraphData,
          projectSummary: projectResult.projectSummary,
          refactoringOpportunities: projectResult.refactoringOpportunities,
        });
      }

      case 'getFunctionContext': {
        // Get context for a specific function
        if (!filePath || !content || !functionName) {
          return NextResponse.json(
            { error: 'filePath, content, and functionName are required' },
            { status: 400 }
          );
        }

        const context = await codeAnalyzer.getFunctionContext(filePath, content, functionName);
        return NextResponse.json({ context });
      }

      case 'findSimilarCode': {
        // Search for similar code patterns
        if (!query || !files || !Array.isArray(files)) {
          return NextResponse.json(
            { error: 'query and files array are required' },
            { status: 400 }
          );
        }

        const results = await codeAnalyzer.findSimilarCode(query, files);
        return NextResponse.json({ results });
      }

      case 'generateDocumentation': {
        // Generate documentation for a file
        if (!filePath || !content) {
          return NextResponse.json(
            { error: 'filePath and content are required' },
            { status: 400 }
          );
        }

        const documentation = await codeAnalyzer.generateDocumentation(filePath, content);
        return NextResponse.json({ documentation });
      }

      case 'getDependencyGraph': {
        const graph = codeAnalyzer.getDependencyGraph();
        return NextResponse.json({
          nodes: Array.from(graph.nodes.keys()),
          edges: graph.edges,
        });
      }

      case 'getCallGraph': {
        const callGraph = codeAnalyzer.getCallGraph();
        const callGraphData: Record<string, unknown> = {};
        callGraph.forEach((value, key) => {
          callGraphData[key] = value;
        });
        return NextResponse.json({ callGraph: callGraphData });
      }

      case 'clearCache': {
        codeAnalyzer.clearCache();
        return NextResponse.json({ success: true, message: 'Cache cleared' });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Code analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'Code Analysis API',
    version: '2.0.0',
    actions: [
      'analyze - Analyze code files and extract entities, complexity, and issues',
      'analyzeFile - Analyze a single file',
      'analyzeProject - Analyze multiple files as a project with full analysis',
      'getFunctionContext - Get detailed context for a specific function',
      'findSimilarCode - Search for similar code patterns',
      'generateDocumentation - Generate documentation for a file',
      'getDependencyGraph - Get the dependency graph',
      'getCallGraph - Get the call graph',
      'clearCache - Clear the analysis cache',
    ],
    capabilities: [
      'AST parsing with ts-morph',
      'Function/class/variable extraction',
      'Dependency graph building',
      'Call graph analysis',
      'Cyclomatic and cognitive complexity calculation',
      'Code issue detection',
      'Security vulnerability scanning',
      'Code smell detection',
      'Design pattern recognition',
      'Refactoring opportunity detection',
      'Semantic code search',
      'Auto-documentation generation',
    ],
  });
}
