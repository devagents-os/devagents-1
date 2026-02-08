import { NextRequest, NextResponse } from 'next/server';
import {
  createTestRunner,
  testGenerator,
  testOutputParser,
  type TestFramework,
  type ParsedTestResult,
} from '@/lib/testingSystem';
import { codeAnalyzer, type CodeEntity, type ParameterInfo } from '@/lib/codeAnalysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId = 'default', ...params } = body;

    const runner = createTestRunner(userId);

    switch (action) {
      // ============================================================
      // FRAMEWORK DETECTION
      // ============================================================
      case 'detect_framework': {
        const { workspacePath } = params;
        if (!workspacePath) {
          return NextResponse.json({ error: 'workspacePath is required' }, { status: 400 });
        }
        const framework = await runner.detectFramework(workspacePath);
        return NextResponse.json({ framework });
      }

      // ============================================================
      // TEST EXECUTION
      // ============================================================
      case 'run_tests': {
        const { workspacePath, framework, testFile, testPattern, coverage, timeout } = params;
        if (!workspacePath) {
          return NextResponse.json({ error: 'workspacePath is required' }, { status: 400 });
        }
        const result = await runner.runTests(workspacePath, {
          framework,
          testFile,
          testPattern,
          coverage,
          timeout,
        });
        return NextResponse.json(result);
      }

      // ============================================================
      // TEST GENERATION
      // ============================================================
      case 'generate_tests': {
        const { sourceFile, sourceCode, framework, testStyle, targetEntities } = params;
        if (!sourceFile || !sourceCode) {
          return NextResponse.json({ error: 'sourceFile and sourceCode are required' }, { status: 400 });
        }
        const tests = await runner.generateTests(sourceFile, sourceCode, {
          framework,
          testStyle,
          targetEntities,
        });
        return NextResponse.json({ tests });
      }

      // ============================================================
      // FAILURE ANALYSIS
      // ============================================================
      case 'analyze_failures': {
        const { testResult } = params;
        if (!testResult) {
          return NextResponse.json({ error: 'testResult is required' }, { status: 400 });
        }
        const analysis = runner.analyzeFailures(testResult as ParsedTestResult);
        return NextResponse.json({ analysis });
      }

      // ============================================================
      // COVERAGE
      // ============================================================
      case 'get_coverage': {
        const { workspacePath, framework } = params;
        if (!workspacePath) {
          return NextResponse.json({ error: 'workspacePath is required' }, { status: 400 });
        }
        const coverage = await runner.getCoverageReport(workspacePath, framework);
        return NextResponse.json({ coverage });
      }

      case 'generate_coverage_tests': {
        const { workspacePath, sourceFiles, framework } = params;
        if (!workspacePath || !sourceFiles) {
          return NextResponse.json({ error: 'workspacePath and sourceFiles are required' }, { status: 400 });
        }
        const tests = await runner.generateCoverageTests(workspacePath, sourceFiles, framework);
        return NextResponse.json({ tests });
      }

      // ============================================================
      // TDD WORKFLOW
      // ============================================================
      case 'start_tdd_session': {
        const { feature, targetFile, framework } = params;
        if (!feature || !targetFile) {
          return NextResponse.json({ error: 'feature and targetFile are required' }, { status: 400 });
        }
        const session = runner.startTDDSession(feature, targetFile, framework);
        return NextResponse.json({ session });
      }

      case 'get_tdd_guidance': {
        const { sessionId } = params;
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }
        const guidance = runner.getTDDGuidance(sessionId);
        return NextResponse.json({ guidance });
      }

      case 'record_tdd_step': {
        const { sessionId, step, testCode, implementationCode, testResult } = params;
        if (!sessionId || !step) {
          return NextResponse.json({ error: 'sessionId and step are required' }, { status: 400 });
        }
        const tddStep = runner.recordTDDStep(sessionId, step, {
          testCode,
          implementationCode,
          testResult,
        });
        return NextResponse.json({ step: tddStep });
      }

      case 'get_tdd_session': {
        const { sessionId } = params;
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }
        const session = runner.getTDDSession(sessionId);
        return NextResponse.json({ session });
      }

      // ============================================================
      // PARSE OUTPUT (for external test runners)
      // ============================================================
      case 'parse_output': {
        const { output, framework } = params;
        if (!output || !framework) {
          return NextResponse.json({ error: 'output and framework are required' }, { status: 400 });
        }
        const result = testOutputParser.parseOutput(output, framework as TestFramework);
        return NextResponse.json(result);
      }

      case 'parse_coverage': {
        const { output, framework } = params;
        if (!output || !framework) {
          return NextResponse.json({ error: 'output and framework are required' }, { status: 400 });
        }
        const coverage = testOutputParser.parseCoverageReport(output, framework as TestFramework);
        return NextResponse.json({ coverage });
      }

      // ============================================================
      // CODE ANALYSIS FOR TESTING
      // ============================================================
      case 'analyze_for_tests': {
        const { sourceFile, sourceCode } = params;
        if (!sourceFile || !sourceCode) {
          return NextResponse.json({ error: 'sourceFile and sourceCode are required' }, { status: 400 });
        }
        const analysis = await codeAnalyzer.analyzeFile(sourceFile, sourceCode);
        const testableEntities = analysis.entities.filter((e: any) => 
          ['function', 'class', 'method'].includes(e.type)
        );
        return NextResponse.json({
          entities: testableEntities,
          complexity: analysis.complexity,
          suggestions: generateTestSuggestions(testableEntities, analysis),
        });
      }

      // ============================================================
      // TEST HISTORY
      // ============================================================
      case 'get_history': {
        const { limit = 20 } = params;
        const history = await runner.getTestHistory(limit);
        return NextResponse.json({ history });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Testing API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate test suggestions based on code analysis
 */
function generateTestSuggestions(
  entities: CodeEntity[],
  analysis: { complexity: { cyclomaticComplexity: number }; issues: Array<{ type: string }> }
): string[] {
  const suggestions: string[] = [];

  // High complexity functions need more tests
  const highComplexityFunctions = entities.filter(e => e.complexity && e.complexity > 5);
  for (const fn of highComplexityFunctions) {
    suggestions.push(`Function '${fn.name}' has high complexity (${fn.complexity}). Consider writing multiple test cases for different branches.`);
  }

  // Functions with many parameters need parameter validation tests
  const manyParams = entities.filter(e => e.parameters && e.parameters.length > 3);
  for (const fn of manyParams) {
    suggestions.push(`Function '${fn.name}' has ${fn.parameters?.length} parameters. Add tests for parameter validation and edge cases.`);
  }

  // Classes need constructor and method tests
  const classes = entities.filter(e => e.type === 'class');
  for (const cls of classes) {
    suggestions.push(`Class '${cls.name}' should have tests for constructor and all public methods.`);
  }

  // Overall complexity suggestions
  if (analysis.complexity.cyclomaticComplexity > 20) {
    suggestions.push('Overall code complexity is high. Consider refactoring before adding more tests.');
  }

  // Issue-based suggestions
  const errorCount = analysis.issues.filter(i => i.type === 'error').length;
  if (errorCount > 0) {
    suggestions.push(`Found ${errorCount} code issues. Fix these before writing tests to avoid testing buggy code.`);
  }

  if (suggestions.length === 0) {
    suggestions.push('Code structure looks good. Start with unit tests for each function.');
  }

  return suggestions;
}
