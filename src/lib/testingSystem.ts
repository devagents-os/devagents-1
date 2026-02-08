import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { supabaseAdmin, type TestResult } from './supabase';
import { codeAnalyzer, type CodeEntity, type CodeAnalysisResult, type ParameterInfo } from './codeAnalysis';

const execAsync = promisify(exec);

// ============================================================
// TEST FRAMEWORK CONFIGURATION
// ============================================================

export type TestFramework = 'jest' | 'vitest' | 'pytest' | 'unittest' | 'mocha' | 'go-test' | 'cargo-test' | 'unknown';

export interface TestFrameworkConfig {
  name: TestFramework;
  language: string;
  runCommand: string;
  coverageCommand: string;
  configFiles: string[];
  testFilePatterns: string[];
  testFunctionPatterns: RegExp[];
  importStatements: string[];
}

const FRAMEWORK_CONFIGS: Record<TestFramework, TestFrameworkConfig> = {
  jest: {
    name: 'jest',
    language: 'typescript',
    runCommand: 'npx jest',
    coverageCommand: 'npx jest --coverage --coverageReporters=json-summary',
    configFiles: ['jest.config.js', 'jest.config.ts', 'jest.config.json'],
    testFilePatterns: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.test.jsx', '**/*.spec.ts', '**/*.spec.tsx'],
    testFunctionPatterns: [/^describe\(/, /^it\(/, /^test\(/],
    importStatements: ["import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';"],
  },
  vitest: {
    name: 'vitest',
    language: 'typescript',
    runCommand: 'npx vitest run',
    coverageCommand: 'npx vitest run --coverage --reporter=json',
    configFiles: ['vitest.config.ts', 'vitest.config.js', 'vite.config.ts'],
    testFilePatterns: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    testFunctionPatterns: [/^describe\(/, /^it\(/, /^test\(/],
    importStatements: ["import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';"],
  },
  pytest: {
    name: 'pytest',
    language: 'python',
    runCommand: 'pytest -v',
    coverageCommand: 'pytest --cov --cov-report=json',
    configFiles: ['pytest.ini', 'pyproject.toml', 'setup.cfg'],
    testFilePatterns: ['**/test_*.py', '**/*_test.py'],
    testFunctionPatterns: [/^def test_/, /^class Test/],
    importStatements: ['import pytest'],
  },
  unittest: {
    name: 'unittest',
    language: 'python',
    runCommand: 'python -m unittest discover -v',
    coverageCommand: 'coverage run -m unittest discover && coverage json',
    configFiles: [],
    testFilePatterns: ['**/test_*.py', '**/*_test.py'],
    testFunctionPatterns: [/^def test_/, /^class Test/],
    importStatements: ['import unittest'],
  },
  mocha: {
    name: 'mocha',
    language: 'javascript',
    runCommand: 'npx mocha',
    coverageCommand: 'npx nyc --reporter=json mocha',
    configFiles: ['.mocharc.js', '.mocharc.json', '.mocharc.yml'],
    testFilePatterns: ['**/*.test.js', '**/*.spec.js'],
    testFunctionPatterns: [/^describe\(/, /^it\(/],
    importStatements: ["const { describe, it } = require('mocha');", "const { expect } = require('chai');"],
  },
  'go-test': {
    name: 'go-test',
    language: 'go',
    runCommand: 'go test -v ./...',
    coverageCommand: 'go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out',
    configFiles: ['go.mod'],
    testFilePatterns: ['**/*_test.go'],
    testFunctionPatterns: [/^func Test/],
    importStatements: ['import "testing"'],
  },
  'cargo-test': {
    name: 'cargo-test',
    language: 'rust',
    runCommand: 'cargo test',
    coverageCommand: 'cargo tarpaulin --out Json',
    configFiles: ['Cargo.toml'],
    testFilePatterns: ['**/tests/*.rs', '**/src/**/*_test.rs'],
    testFunctionPatterns: [/^#\[test\]/, /^fn test_/],
    importStatements: [],
  },
  unknown: {
    name: 'unknown',
    language: 'unknown',
    runCommand: '',
    coverageCommand: '',
    configFiles: [],
    testFilePatterns: [],
    testFunctionPatterns: [],
    importStatements: [],
  },
};

// ============================================================
// TEST OUTPUT PARSING
// ============================================================

export interface ParsedTestFailure {
  testName: string;
  testFile: string;
  lineNumber?: number;
  errorMessage: string;
  errorType: 'assertion' | 'exception' | 'timeout' | 'syntax' | 'unknown';
  stackTrace?: string;
  expected?: string;
  actual?: string;
  diff?: string;
}

export interface ParsedTestResult {
  framework: TestFramework;
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: ParsedTestFailure[];
  coverage?: CoverageReport;
  rawOutput: string;
}

export interface CoverageReport {
  totalLines: number;
  coveredLines: number;
  linePercentage: number;
  totalBranches: number;
  coveredBranches: number;
  branchPercentage: number;
  totalFunctions: number;
  coveredFunctions: number;
  functionPercentage: number;
  fileReports: FileCoverageReport[];
  uncoveredLines: Map<string, number[]>;
}

export interface FileCoverageReport {
  filePath: string;
  linePercentage: number;
  branchPercentage: number;
  functionPercentage: number;
  uncoveredLines: number[];
}

export class TestOutputParser {
  parseOutput(output: string, framework: TestFramework): ParsedTestResult {
    switch (framework) {
      case 'jest':
      case 'vitest':
        return this.parseJestVitest(output, framework);
      case 'pytest':
        return this.parsePytest(output);
      case 'mocha':
        return this.parseMocha(output);
      case 'go-test':
        return this.parseGoTest(output);
      case 'cargo-test':
        return this.parseCargoTest(output);
      default:
        return this.parseGeneric(output, framework);
    }
  }

  private parseJestVitest(output: string, framework: TestFramework): ParsedTestResult {
    const failures: ParsedTestFailure[] = [];
    let total = 0, passed = 0, failed = 0, skipped = 0, duration = 0;

    // Parse summary line: Tests: X failed, Y passed, Z total
    const summaryMatch = output.match(/Tests:\s*(\d+)\s*failed?,?\s*(\d+)\s*passed?,?\s*(\d+)\s*(?:skipped?,?\s*)?(\d+)\s*total/i);
    if (summaryMatch) {
      failed = parseInt(summaryMatch[1]) || 0;
      passed = parseInt(summaryMatch[2]) || 0;
      skipped = parseInt(summaryMatch[3]) || 0;
      total = parseInt(summaryMatch[4]) || 0;
    } else {
      // Alternate format
      const passedMatch = output.match(/(\d+)\s*pass(ed|ing)?/i);
      const failedMatch = output.match(/(\d+)\s*fail(ed|ing)?/i);
      const skippedMatch = output.match(/(\d+)\s*skip(ped)?/i);
      
      passed = passedMatch ? parseInt(passedMatch[1]) : 0;
      failed = failedMatch ? parseInt(failedMatch[1]) : 0;
      skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;
      total = passed + failed + skipped;
    }

    // Parse duration
    const durationMatch = output.match(/Time:\s*(\d+(?:\.\d+)?)\s*s/);
    if (durationMatch) {
      duration = parseFloat(durationMatch[1]) * 1000;
    }

    // Parse failures with detailed info
    const failureBlocks = output.split(/●\s*|FAIL\s+/).slice(1);
    for (const block of failureBlocks) {
      const failure = this.parseJestFailureBlock(block);
      if (failure) {
        failures.push(failure);
      }
    }

    return {
      framework,
      success: failed === 0,
      total,
      passed,
      failed,
      skipped,
      duration,
      failures,
      rawOutput: output,
    };
  }

  private parseJestFailureBlock(block: string): ParsedTestFailure | null {
    const lines = block.split('\n');
    if (lines.length < 2) return null;

    const testNameMatch = lines[0].match(/(.+?)\s*›\s*(.+)/);
    const testName = testNameMatch ? `${testNameMatch[1]} › ${testNameMatch[2]}` : lines[0].trim();

    let errorMessage = '';
    let expected = '';
    let actual = '';
    let stackTrace = '';
    let testFile = '';
    let lineNumber: number | undefined;
    let errorType: ParsedTestFailure['errorType'] = 'unknown';

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Expected/Received
      if (line.includes('Expected:')) {
        expected = line.replace('Expected:', '').trim();
        errorType = 'assertion';
      }
      if (line.includes('Received:')) {
        actual = line.replace('Received:', '').trim();
      }

      // Error message
      if (line.match(/Error:|AssertionError:|expect\(.*\)/)) {
        errorMessage = line.trim();
        if (line.includes('AssertionError')) errorType = 'assertion';
        if (line.includes('TypeError') || line.includes('ReferenceError')) errorType = 'exception';
      }

      // File location
      const fileMatch = line.match(/at\s+(?:Object\.)?<anonymous>\s+\((.+?):(\d+):(\d+)\)/);
      if (fileMatch) {
        testFile = fileMatch[1];
        lineNumber = parseInt(fileMatch[2]);
        stackTrace += line + '\n';
      }
    }

    if (!errorMessage) {
      errorMessage = lines.slice(1, 5).join(' ').trim();
    }

    return {
      testName,
      testFile,
      lineNumber,
      errorMessage,
      errorType,
      stackTrace: stackTrace.trim(),
      expected,
      actual,
    };
  }

  private parsePytest(output: string): ParsedTestResult {
    const failures: ParsedTestFailure[] = [];
    let total = 0, passed = 0, failed = 0, skipped = 0, duration = 0;

    // Parse summary: X passed, Y failed, Z skipped in Xs
    const summaryMatch = output.match(/=+ (\d+) passed(?:, (\d+) failed)?(?:, (\d+) skipped)? in ([\d.]+)s =+/i);
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1]) || 0;
      failed = parseInt(summaryMatch[2]) || 0;
      skipped = parseInt(summaryMatch[3]) || 0;
      duration = parseFloat(summaryMatch[4]) * 1000;
      total = passed + failed + skipped;
    }

    // Parse failures
    const failureSection = output.match(/=+ FAILURES =+([\s\S]*?)(?:=+ short test summary info =+|=+ \d+ )/);
    if (failureSection) {
      const failureBlocks = failureSection[1].split(/_{10,}/);
      for (const block of failureBlocks) {
        const failure = this.parsePytestFailureBlock(block);
        if (failure) {
          failures.push(failure);
        }
      }
    }

    return {
      framework: 'pytest',
      success: failed === 0,
      total,
      passed,
      failed,
      skipped,
      duration,
      failures,
      rawOutput: output,
    };
  }

  private parsePytestFailureBlock(block: string): ParsedTestFailure | null {
    const lines = block.trim().split('\n');
    if (lines.length < 2) return null;

    const testNameMatch = lines[0].match(/(\w+::)?(test_\w+)/);
    const testName = testNameMatch ? testNameMatch[2] : lines[0].trim();

    let errorMessage = '';
    let testFile = '';
    let lineNumber: number | undefined;
    let errorType: ParsedTestFailure['errorType'] = 'unknown';
    let expected = '';
    let actual = '';

    for (const line of lines) {
      // File location
      const fileMatch = line.match(/(\S+\.py):(\d+):/);
      if (fileMatch) {
        testFile = fileMatch[1];
        lineNumber = parseInt(fileMatch[2]);
      }

      // Assertion error
      if (line.includes('AssertionError')) {
        errorType = 'assertion';
        errorMessage = line.trim();
      }

      // assert comparison
      if (line.includes('assert')) {
        const assertMatch = line.match(/assert\s+(.+?)\s*(==|!=|<|>|<=|>=)\s*(.+)/);
        if (assertMatch) {
          actual = assertMatch[1].trim();
          expected = assertMatch[3].trim();
        }
      }

      // Exception
      if (line.match(/\w+Error:/)) {
        errorType = 'exception';
        errorMessage = line.trim();
      }
    }

    if (!errorMessage) {
      errorMessage = lines.slice(1, 5).join(' ').trim();
    }

    return {
      testName,
      testFile,
      lineNumber,
      errorMessage,
      errorType,
      expected,
      actual,
    };
  }

  private parseMocha(output: string): ParsedTestResult {
    const failures: ParsedTestFailure[] = [];
    let total = 0, passed = 0, failed = 0, skipped = 0, duration = 0;

    // Parse passing/failing counts
    const passingMatch = output.match(/(\d+)\s+passing\s+\((\d+(?:\.\d+)?)(m?s)\)/);
    if (passingMatch) {
      passed = parseInt(passingMatch[1]);
      duration = parseFloat(passingMatch[2]) * (passingMatch[3] === 's' ? 1000 : 1);
    }

    const failingMatch = output.match(/(\d+)\s+failing/);
    if (failingMatch) {
      failed = parseInt(failingMatch[1]);
    }

    const pendingMatch = output.match(/(\d+)\s+pending/);
    if (pendingMatch) {
      skipped = parseInt(pendingMatch[1]);
    }

    total = passed + failed + skipped;

    // Parse failure blocks
    const failureMatches = output.matchAll(/\d+\)\s+(.+?):\n([\s\S]*?)(?=\n\s*\d+\)|\n\s*$)/g);
    for (const match of failureMatches) {
      failures.push({
        testName: match[1].trim(),
        testFile: '',
        errorMessage: match[2].trim().split('\n')[0],
        errorType: 'assertion',
      });
    }

    return {
      framework: 'mocha',
      success: failed === 0,
      total,
      passed,
      failed,
      skipped,
      duration,
      failures,
      rawOutput: output,
    };
  }

  private parseGoTest(output: string): ParsedTestResult {
    const failures: ParsedTestFailure[] = [];
    let passed = 0, failed = 0, duration = 0;

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('--- PASS:')) {
        passed++;
        const durationMatch = line.match(/\((\d+(?:\.\d+)?)(m?s)\)/);
        if (durationMatch) {
          duration += parseFloat(durationMatch[1]) * (durationMatch[2] === 's' ? 1000 : 1);
        }
      }
      if (line.startsWith('--- FAIL:')) {
        failed++;
        const testNameMatch = line.match(/--- FAIL: (\w+)/);
        if (testNameMatch) {
          failures.push({
            testName: testNameMatch[1],
            testFile: '',
            errorMessage: 'Test failed',
            errorType: 'assertion',
          });
        }
      }
    }

    return {
      framework: 'go-test',
      success: failed === 0,
      total: passed + failed,
      passed,
      failed,
      skipped: 0,
      duration,
      failures,
      rawOutput: output,
    };
  }

  private parseCargoTest(output: string): ParsedTestResult {
    const failures: ParsedTestFailure[] = [];
    let passed = 0, failed = 0, duration = 0;

    const summaryMatch = output.match(/test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed;/);
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1]);
      failed = parseInt(summaryMatch[2]);
    }

    // Parse failures
    const failureSection = output.match(/failures:\n([\s\S]*?)(?:failures:|test result:)/);
    if (failureSection) {
      const failureLines = failureSection[1].split('\n').filter(l => l.trim().startsWith('----'));
      for (const line of failureLines) {
        const testName = line.replace(/^-+\s*/, '').replace(/\s*-+$/, '').trim();
        failures.push({
          testName,
          testFile: '',
          errorMessage: 'Test panicked or assertion failed',
          errorType: 'assertion',
        });
      }
    }

    return {
      framework: 'cargo-test',
      success: failed === 0,
      total: passed + failed,
      passed,
      failed,
      skipped: 0,
      duration,
      failures,
      rawOutput: output,
    };
  }

  private parseGeneric(output: string, framework: TestFramework): ParsedTestResult {
    let passed = 0, failed = 0, skipped = 0;

    // Generic patterns
    const passedMatch = output.match(/(\d+)\s*pass(ed|ing)?/i);
    const failedMatch = output.match(/(\d+)\s*fail(ed|ing)?/i);
    const skippedMatch = output.match(/(\d+)\s*skip(ped)?/i);

    if (passedMatch) passed = parseInt(passedMatch[1]);
    if (failedMatch) failed = parseInt(failedMatch[1]);
    if (skippedMatch) skipped = parseInt(skippedMatch[1]);

    // Count checkmarks and X marks
    const checkmarks = (output.match(/✓|✔|PASS/g) || []).length;
    const xmarks = (output.match(/✗|✘|FAIL/g) || []).length;

    if (passed === 0 && failed === 0) {
      passed = checkmarks;
      failed = xmarks;
    }

    return {
      framework,
      success: failed === 0,
      total: passed + failed + skipped,
      passed,
      failed,
      skipped,
      duration: 0,
      failures: [],
      rawOutput: output,
    };
  }

  parseCoverageReport(output: string, framework: TestFramework): CoverageReport | null {
    try {
      switch (framework) {
        case 'jest':
        case 'vitest':
          return this.parseJestCoverage(output);
        case 'pytest':
          return this.parsePytestCoverage(output);
        default:
          return this.parseGenericCoverage(output);
      }
    } catch {
      return null;
    }
  }

  private parseJestCoverage(output: string): CoverageReport | null {
    // Look for JSON coverage summary
    const jsonMatch = output.match(/\{[\s\S]*"total"[\s\S]*"lines"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0]);
        const total = data.total;
        return {
          totalLines: total.lines.total,
          coveredLines: total.lines.covered,
          linePercentage: total.lines.pct,
          totalBranches: total.branches.total,
          coveredBranches: total.branches.covered,
          branchPercentage: total.branches.pct,
          totalFunctions: total.functions.total,
          coveredFunctions: total.functions.covered,
          functionPercentage: total.functions.pct,
          fileReports: [],
          uncoveredLines: new Map(),
        };
      } catch {
        return null;
      }
    }

    // Parse text coverage table
    const tableMatch = output.match(/All files.*?\n([\s\S]*?)(?:\n-{10,}|$)/);
    if (tableMatch) {
      const percentMatch = tableMatch[1].match(/(\d+(?:\.\d+)?)\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*(\d+(?:\.\d+)?)/);
      if (percentMatch) {
        return {
          totalLines: 0,
          coveredLines: 0,
          linePercentage: parseFloat(percentMatch[4]),
          totalBranches: 0,
          coveredBranches: 0,
          branchPercentage: parseFloat(percentMatch[2]),
          totalFunctions: 0,
          coveredFunctions: 0,
          functionPercentage: parseFloat(percentMatch[3]),
          fileReports: [],
          uncoveredLines: new Map(),
        };
      }
    }

    return null;
  }

  private parsePytestCoverage(output: string): CoverageReport | null {
    // Parse pytest-cov output
    const totalMatch = output.match(/TOTAL\s+\d+\s+\d+\s+(\d+)%/);
    if (totalMatch) {
      return {
        totalLines: 0,
        coveredLines: 0,
        linePercentage: parseInt(totalMatch[1]),
        totalBranches: 0,
        coveredBranches: 0,
        branchPercentage: 0,
        totalFunctions: 0,
        coveredFunctions: 0,
        functionPercentage: 0,
        fileReports: [],
        uncoveredLines: new Map(),
      };
    }
    return null;
  }

  private parseGenericCoverage(output: string): CoverageReport | null {
    const percentMatch = output.match(/(\d+(?:\.\d+)?)\s*%\s*(?:coverage|covered)/i);
    if (percentMatch) {
      return {
        totalLines: 0,
        coveredLines: 0,
        linePercentage: parseFloat(percentMatch[1]),
        totalBranches: 0,
        coveredBranches: 0,
        branchPercentage: 0,
        totalFunctions: 0,
        coveredFunctions: 0,
        functionPercentage: 0,
        fileReports: [],
        uncoveredLines: new Map(),
      };
    }
    return null;
  }
}

// ============================================================
// TEST GENERATOR
// ============================================================

export interface TestGenerationContext {
  sourceFile: string;
  sourceCode: string;
  entities: CodeEntity[];
  existingTests?: string;
  framework: TestFramework;
  testStyle: 'unit' | 'integration' | 'e2e';
  coverage?: CoverageReport;
}

export interface GeneratedTest {
  testCode: string;
  testFile: string;
  targetEntity: string;
  testType: 'unit' | 'integration' | 'e2e';
  framework: TestFramework;
  description: string;
}

export class TestGenerator {
  private parser = new TestOutputParser();

  /**
   * Generate test code for a function or class
   */
  generateTestForEntity(
    entity: CodeEntity,
    context: TestGenerationContext
  ): GeneratedTest {
    const framework = context.framework;
    const config = FRAMEWORK_CONFIGS[framework];

    let testCode = '';
    let description = '';

    switch (entity.type) {
      case 'function':
        testCode = this.generateFunctionTest(entity, context, config);
        description = `Unit tests for function ${entity.name}`;
        break;
      case 'class':
        testCode = this.generateClassTest(entity, context, config);
        description = `Unit tests for class ${entity.name}`;
        break;
      case 'method':
        testCode = this.generateMethodTest(entity, context, config);
        description = `Unit tests for method ${entity.name}`;
        break;
      default:
        testCode = this.generateGenericTest(entity, context, config);
        description = `Tests for ${entity.type} ${entity.name}`;
    }

    const testFile = this.generateTestFileName(entity.filePath, config);

    return {
      testCode,
      testFile,
      targetEntity: entity.name,
      testType: context.testStyle,
      framework,
      description,
    };
  }

  private generateFunctionTest(
    entity: CodeEntity,
    context: TestGenerationContext,
    config: TestFrameworkConfig
  ): string {
    const { name, signature, docComment, parameters } = entity;
    const imports = config.importStatements.join('\n');
    const modulePath = this.getModuleImportPath(entity.filePath, config);

    // Get parameter info array
    const params = parameters || [];

    if (config.language === 'typescript' || config.language === 'javascript') {
      return this.generateJsTestTemplate(name, params, modulePath, imports, docComment);
    } else if (config.language === 'python') {
      return this.generatePythonTestTemplate(name, params, modulePath, docComment);
    }

    return this.generateGenericTestTemplate(name, config);
  }

  private generateJsTestTemplate(
    funcName: string,
    params: ParameterInfo[],
    modulePath: string,
    imports: string,
    docComment?: string
  ): string {
    const testCases = this.generateTestCases(funcName, params);
    const paramNames = params.map(p => p.name);

    return `${imports}
import { ${funcName} } from '${modulePath}';

describe('${funcName}', () => {
  ${docComment ? `// ${docComment}\n  ` : ''}
  describe('basic functionality', () => {
    it('should be defined', () => {
      expect(${funcName}).toBeDefined();
    });

    it('should return expected result for valid input', () => {
      ${testCases.validInput}
    });

    it('should handle edge cases', () => {
      ${testCases.edgeCase}
    });
  });

  describe('error handling', () => {
    it('should handle invalid input gracefully', () => {
      ${testCases.invalidInput}
    });

    it('should throw appropriate errors for null/undefined', () => {
      ${testCases.nullInput}
    });
  });

  ${params.length > 0 ? `describe('parameter validation', () => {
    ${params.map(p => `it('should validate ${p.name} parameter (${p.type}${p.isOptional ? ', optional' : ''})', () => {
      // TODO: Add parameter validation test for ${p.name}: ${p.type}
      expect(true).toBe(true);
    });`).join('\n\n    ')}
  });` : ''}
});
`;
  }

  private generatePythonTestTemplate(
    funcName: string,
    params: ParameterInfo[],
    modulePath: string,
    docComment?: string
  ): string {
    const paramNames = params.map(p => p.name);
    
    return `import pytest
from ${modulePath} import ${funcName}


class Test${this.toPascalCase(funcName)}:
    """${docComment || `Tests for ${funcName}`}"""

    def test_basic_functionality(self):
        """Test basic functionality of ${funcName}"""
        # TODO: Implement basic test
        result = ${funcName}(${params.map(() => 'None').join(', ')})
        assert result is not None

    def test_valid_input(self):
        """Test with valid input"""
        # TODO: Add valid input test
        pass

    def test_edge_cases(self):
        """Test edge cases"""
        # TODO: Add edge case tests
        pass

    def test_invalid_input(self):
        """Test handling of invalid input"""
        with pytest.raises(Exception):
            ${funcName}(${params.map(() => 'None').join(', ')})

    ${params.map(p => `def test_${p.name}_parameter(self):
        """Test ${p.name} parameter validation (${p.type}${p.isOptional ? ', optional' : ''})"""
        # TODO: Add parameter validation test for ${p.name}: ${p.type}
        pass`).join('\n\n    ')}
`;
  }

  private generateGenericTestTemplate(funcName: string, config: TestFrameworkConfig): string {
    return `// Tests for ${funcName}
// Framework: ${config.name}

// TODO: Implement tests for ${funcName}
// Test cases to cover:
// 1. Basic functionality
// 2. Valid input handling
// 3. Edge cases
// 4. Error handling
// 5. Parameter validation
`;
  }

  private generateClassTest(
    entity: CodeEntity,
    context: TestGenerationContext,
    config: TestFrameworkConfig
  ): string {
    const { name, docstring } = entity;
    const methods = context.entities.filter(
      e => e.type === 'method' && e.signature?.includes(name)
    );

    if (config.language === 'typescript' || config.language === 'javascript') {
      return this.generateJsClassTest(name, methods, context, config);
    } else if (config.language === 'python') {
      return this.generatePythonClassTest(name, methods, context, config);
    }

    return this.generateGenericTestTemplate(name, config);
  }

  private generateJsClassTest(
    className: string,
    methods: CodeEntity[],
    context: TestGenerationContext,
    config: TestFrameworkConfig
  ): string {
    const imports = config.importStatements.join('\n');
    const modulePath = this.getModuleImportPath(context.sourceFile, config);

    return `${imports}
import { ${className} } from '${modulePath}';

describe('${className}', () => {
  let instance: ${className};

  beforeEach(() => {
    instance = new ${className}();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(instance).toBeInstanceOf(${className});
    });

    it('should initialize with default values', () => {
      // TODO: Add initialization tests
      expect(instance).toBeDefined();
    });
  });

  ${methods.map(m => `describe('${m.name}', () => {
    it('should be defined', () => {
      expect(instance.${m.name}).toBeDefined();
    });

    it('should return expected result', () => {
      // TODO: Implement test for ${m.name}
      // const result = instance.${m.name}();
      // expect(result).toBe(expected);
    });

    it('should handle errors', () => {
      // TODO: Add error handling test
    });
  });`).join('\n\n  ')}
});
`;
  }

  private generatePythonClassTest(
    className: string,
    methods: CodeEntity[],
    context: TestGenerationContext,
    config: TestFrameworkConfig
  ): string {
    const modulePath = this.getModuleImportPath(context.sourceFile, config);

    return `import pytest
from ${modulePath} import ${className}


class Test${className}:
    """Tests for ${className}"""

    @pytest.fixture
    def instance(self):
        """Create a ${className} instance for testing"""
        return ${className}()

    def test_instantiation(self, instance):
        """Test that ${className} can be instantiated"""
        assert instance is not None
        assert isinstance(instance, ${className})

    ${methods.map(m => `def test_${m.name}(self, instance):
        """Test ${m.name} method"""
        # TODO: Implement test for ${m.name}
        # result = instance.${m.name}()
        # assert result == expected
        pass`).join('\n\n    ')}
`;
  }

  private generateMethodTest(
    entity: CodeEntity,
    context: TestGenerationContext,
    config: TestFrameworkConfig
  ): string {
    // Method tests are typically part of class tests
    return this.generateFunctionTest(entity, context, config);
  }

  private generateGenericTest(
    entity: CodeEntity,
    context: TestGenerationContext,
    config: TestFrameworkConfig
  ): string {
    return this.generateGenericTestTemplate(entity.name, config);
  }

  private generateTestCases(funcName: string, params: ParameterInfo[]): {
    validInput: string;
    edgeCase: string;
    invalidInput: string;
    nullInput: string;
  } {
    const paramPlaceholders = params.map(p => this.getPlaceholderForType(p)).join(', ');

    return {
      validInput: `const result = ${funcName}(${paramPlaceholders});
      expect(result).toBeDefined();
      // TODO: Add specific assertions`,
      edgeCase: `// TODO: Test boundary conditions
      // Example: empty strings, zero values, max values
      expect(true).toBe(true);`,
      invalidInput: `// TODO: Test with invalid input types
      // expect(() => ${funcName}(invalidValue)).toThrow();
      expect(true).toBe(true);`,
      nullInput: `// TODO: Test null/undefined handling
      // expect(() => ${funcName}(null)).toThrow();
      expect(true).toBe(true);`,
    };
  }

  private getPlaceholderForType(param: ParameterInfo): string {
    const type = param.type.toLowerCase();
    
    if (param.defaultValue) {
      return param.defaultValue;
    }
    
    // Provide sensible placeholders based on type
    if (type.includes('string')) return `'test_${param.name}'`;
    if (type.includes('number') || type === 'int' || type === 'float') return '0';
    if (type.includes('boolean') || type === 'bool') return 'false';
    if (type.includes('array') || type.includes('[]')) return '[]';
    if (type.includes('object') || type === '{}') return '{}';
    if (type === 'null') return 'null';
    if (type === 'undefined') return 'undefined';
    if (type === 'any' || type === 'unknown') return `/* ${param.name}: ${param.type} */`;
    
    // For complex types, provide a placeholder comment
    return `/* ${param.name}: ${param.type} */`;
  }

  private generateTestFileName(sourceFile: string, config: TestFrameworkConfig): string {
    const ext = path.extname(sourceFile);
    const baseName = path.basename(sourceFile, ext);
    const dir = path.dirname(sourceFile);

    switch (config.language) {
      case 'typescript':
      case 'javascript':
        return path.join(dir, '__tests__', `${baseName}.test${ext}`);
      case 'python':
        return path.join(dir, 'tests', `test_${baseName}.py`);
      case 'go':
        return path.join(dir, `${baseName}_test.go`);
      case 'rust':
        return path.join(dir, 'tests', `${baseName}_test.rs`);
      default:
        return path.join(dir, `${baseName}.test${ext}`);
    }
  }

  private getModuleImportPath(filePath: string, config: TestFrameworkConfig): string {
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const dir = path.dirname(filePath);

    switch (config.language) {
      case 'typescript':
      case 'javascript':
        return `../${baseName}`;
      case 'python':
        return dir.replace(/\//g, '.') + '.' + baseName;
      default:
        return baseName;
    }
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * Generate tests targeting uncovered code
   */
  generateCoverageTests(
    context: TestGenerationContext,
    coverage: CoverageReport
  ): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Find entities on uncovered lines
    for (const [filePath, uncoveredLines] of coverage.uncoveredLines) {
      const fileEntities = context.entities.filter(e => e.filePath === filePath);

      for (const entity of fileEntities) {
        const entityLines = new Set(
          Array.from({ length: entity.endLine - entity.startLine + 1 }, (_, i) => entity.startLine + i)
        );

        const uncoveredInEntity = uncoveredLines.filter(line => entityLines.has(line));
        if (uncoveredInEntity.length > 0) {
          const test = this.generateTestForEntity(entity, {
            ...context,
            coverage,
          });
          tests.push(test);
        }
      }
    }

    return tests;
  }
}

// ============================================================
// TDD WORKFLOW
// ============================================================

export interface TDDStep {
  step: 'write_test' | 'run_test' | 'write_code' | 'refactor' | 'complete';
  description: string;
  testCode?: string;
  implementationCode?: string;
  testResult?: ParsedTestResult;
}

export interface TDDSession {
  id: string;
  feature: string;
  targetFile: string;
  testFile: string;
  framework: TestFramework;
  steps: TDDStep[];
  currentStep: TDDStep['step'];
  startedAt: number;
  completedAt?: number;
}

export class TDDWorkflow {
  private parser = new TestOutputParser();
  private generator = new TestGenerator();
  private sessions: Map<string, TDDSession> = new Map();

  /**
   * Start a new TDD session for a feature
   */
  startSession(
    feature: string,
    targetFile: string,
    framework: TestFramework
  ): TDDSession {
    const config = FRAMEWORK_CONFIGS[framework];
    const testFile = this.generateTestFilePath(targetFile, config);

    const session: TDDSession = {
      id: `tdd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      feature,
      targetFile,
      testFile,
      framework,
      steps: [],
      currentStep: 'write_test',
      startedAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get the current step guidance
   */
  getCurrentStepGuidance(sessionId: string): {
    step: TDDStep['step'];
    guidance: string;
    template?: string;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const config = FRAMEWORK_CONFIGS[session.framework];

    switch (session.currentStep) {
      case 'write_test':
        return {
          step: 'write_test',
          guidance: `Write a failing test for: ${session.feature}\nTest file: ${session.testFile}`,
          template: this.getTestTemplate(session.feature, session.framework),
        };

      case 'run_test':
        return {
          step: 'run_test',
          guidance: `Run the test to verify it fails.\nCommand: ${config.runCommand} ${session.testFile}`,
        };

      case 'write_code':
        return {
          step: 'write_code',
          guidance: `Write the minimum code to make the test pass.\nTarget file: ${session.targetFile}`,
        };

      case 'refactor':
        return {
          step: 'refactor',
          guidance: 'Refactor the code while keeping tests green.\nFocus on: code clarity, DRY, performance',
        };

      case 'complete':
        return {
          step: 'complete',
          guidance: 'TDD cycle complete! Consider adding more test cases or starting a new feature.',
        };
    }
  }

  /**
   * Record a step completion
   */
  recordStep(
    sessionId: string,
    step: TDDStep['step'],
    data: {
      testCode?: string;
      implementationCode?: string;
      testResult?: ParsedTestResult;
    }
  ): TDDStep {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const tddStep: TDDStep = {
      step,
      description: this.getStepDescription(step),
      ...data,
    };

    session.steps.push(tddStep);

    // Advance to next step
    session.currentStep = this.getNextStep(step, data.testResult);

    if (session.currentStep === 'complete') {
      session.completedAt = Date.now();
    }

    return tddStep;
  }

  /**
   * Get the next TDD step based on current step and test results
   */
  private getNextStep(currentStep: TDDStep['step'], testResult?: ParsedTestResult): TDDStep['step'] {
    switch (currentStep) {
      case 'write_test':
        return 'run_test';

      case 'run_test':
        if (testResult?.failed === 0) {
          // Test passed - either we're done or need to refactor
          return 'refactor';
        }
        // Test failed - write code to make it pass
        return 'write_code';

      case 'write_code':
        return 'run_test';

      case 'refactor':
        return 'complete';

      default:
        return 'complete';
    }
  }

  private getStepDescription(step: TDDStep['step']): string {
    const descriptions: Record<TDDStep['step'], string> = {
      write_test: 'Write a failing test that defines the expected behavior',
      run_test: 'Run the test to verify current state',
      write_code: 'Write the minimum code to make the test pass',
      refactor: 'Clean up the code while keeping tests green',
      complete: 'TDD cycle completed',
    };
    return descriptions[step];
  }

  private getTestTemplate(feature: string, framework: TestFramework): string {
    const config = FRAMEWORK_CONFIGS[framework];
    const imports = config.importStatements.join('\n');

    if (framework === 'jest' || framework === 'vitest') {
      return `${imports}

describe('${feature}', () => {
  it('should [describe expected behavior]', () => {
    // Arrange
    const input = /* setup test data */;
    
    // Act
    const result = /* call function under test */;
    
    // Assert
    expect(result).toBe(/* expected value */);
  });
});
`;
    } else if (framework === 'pytest') {
      return `import pytest


def test_${feature.toLowerCase().replace(/\s+/g, '_')}():
    """Test ${feature}"""
    # Arrange
    input_data = None  # setup test data
    
    # Act
    result = None  # call function under test
    
    # Assert
    assert result == expected  # expected value
`;
    }

    return `// Test for: ${feature}\n// TODO: Implement test`;
  }

  private generateTestFilePath(targetFile: string, config: TestFrameworkConfig): string {
    const ext = path.extname(targetFile);
    const baseName = path.basename(targetFile, ext);
    const dir = path.dirname(targetFile);

    switch (config.language) {
      case 'typescript':
      case 'javascript':
        return path.join(dir, '__tests__', `${baseName}.test${ext}`);
      case 'python':
        return path.join(dir, 'tests', `test_${baseName}.py`);
      default:
        return path.join(dir, `${baseName}.test${ext}`);
    }
  }

  getSession(sessionId: string): TDDSession | null {
    return this.sessions.get(sessionId) || null;
  }

  listSessions(): TDDSession[] {
    return Array.from(this.sessions.values());
  }
}

// ============================================================
// ENHANCED TEST RUNNER
// ============================================================

export class EnhancedTestRunner {
  private userId: string;
  private parser = new TestOutputParser();
  private generator = new TestGenerator();
  private tddWorkflow = new TDDWorkflow();

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Detect the test framework used in a workspace
   */
  async detectFramework(workspacePath: string): Promise<TestFramework> {
    // Check for framework config files
    for (const [framework, config] of Object.entries(FRAMEWORK_CONFIGS)) {
      for (const configFile of config.configFiles) {
        try {
          await fs.access(path.join(workspacePath, configFile));
          return framework as TestFramework;
        } catch {
          // File doesn't exist
        }
      }
    }

    // Check package.json for dependencies
    try {
      const pkgPath = path.join(workspacePath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.vitest) return 'vitest';
      if (deps.jest) return 'jest';
      if (deps.mocha) return 'mocha';
    } catch {
      // No package.json
    }

    // Check for Python test frameworks
    try {
      const pyprojectPath = path.join(workspacePath, 'pyproject.toml');
      const content = await fs.readFile(pyprojectPath, 'utf-8');
      if (content.includes('pytest')) return 'pytest';
    } catch {
      // No pyproject.toml
    }

    // Check for Go
    try {
      await fs.access(path.join(workspacePath, 'go.mod'));
      return 'go-test';
    } catch {}

    // Check for Rust
    try {
      await fs.access(path.join(workspacePath, 'Cargo.toml'));
      return 'cargo-test';
    } catch {}

    return 'unknown';
  }

  /**
   * Run tests and get detailed results
   */
  async runTests(
    workspacePath: string,
    options: {
      framework?: TestFramework;
      testFile?: string;
      testPattern?: string;
      coverage?: boolean;
      timeout?: number;
    } = {}
  ): Promise<ParsedTestResult> {
    const framework = options.framework || await this.detectFramework(workspacePath);
    const config = FRAMEWORK_CONFIGS[framework];

    if (framework === 'unknown') {
      return {
        framework: 'unknown',
        success: false,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        failures: [{
          testName: 'Framework Detection',
          testFile: '',
          errorMessage: 'Unable to detect test framework',
          errorType: 'unknown',
        }],
        rawOutput: 'No test framework detected',
      };
    }

    let command = options.coverage ? config.coverageCommand : config.runCommand;

    // Add file/pattern filters
    if (options.testFile) {
      command += ` ${options.testFile}`;
    }
    if (options.testPattern) {
      command += ` --testNamePattern="${options.testPattern}"`;
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workspacePath,
        timeout: options.timeout || 120000,
        maxBuffer: 1024 * 1024 * 10,
      });

      const output = stdout + stderr;
      const result = this.parser.parseOutput(output, framework);

      // Parse coverage if requested
      if (options.coverage) {
        result.coverage = this.parser.parseCoverageReport(output, framework) || undefined;
      }

      // Save result to database
      await this.saveTestResult(result);

      return result;
    } catch (error: any) {
      const output = (error.stdout || '') + (error.stderr || error.message || '');
      const result = this.parser.parseOutput(output, framework);

      await this.saveTestResult(result);

      return result;
    }
  }

  /**
   * Generate tests for a source file
   */
  async generateTests(
    sourceFile: string,
    sourceCode: string,
    options: {
      framework?: TestFramework;
      testStyle?: 'unit' | 'integration' | 'e2e';
      targetEntities?: string[];
    } = {}
  ): Promise<GeneratedTest[]> {
    // Analyze the source code
    const analysis = await codeAnalyzer.analyzeFile(sourceFile, sourceCode);
    const entities = analysis.entities;

    const framework = options.framework || this.inferFramework(sourceFile);
    const testStyle = options.testStyle || 'unit';

    const context: TestGenerationContext = {
      sourceFile,
      sourceCode,
      entities,
      framework,
      testStyle,
    };

    const tests: GeneratedTest[] = [];

    // Filter entities if specific targets requested
    const targetEntities = options.targetEntities
      ? entities.filter(e => options.targetEntities!.includes(e.name))
      : entities.filter(e => ['function', 'class'].includes(e.type));

    for (const entity of targetEntities) {
      const test = this.generator.generateTestForEntity(entity, context);
      tests.push(test);
    }

    return tests;
  }

  /**
   * Analyze test failures and suggest fixes
   */
  analyzeFailures(result: ParsedTestResult): Array<{
    failure: ParsedTestFailure;
    possibleCauses: string[];
    suggestedFixes: string[];
  }> {
    return result.failures.map(failure => {
      const { possibleCauses, suggestedFixes } = this.diagnoseFailure(failure);
      return { failure, possibleCauses, suggestedFixes };
    });
  }

  private diagnoseFailure(failure: ParsedTestFailure): {
    possibleCauses: string[];
    suggestedFixes: string[];
  } {
    const causes: string[] = [];
    const fixes: string[] = [];

    switch (failure.errorType) {
      case 'assertion':
        causes.push('Expected value does not match actual value');
        if (failure.expected && failure.actual) {
          causes.push(`Expected: ${failure.expected}, Got: ${failure.actual}`);
        }
        fixes.push('Verify the expected value in the test is correct');
        fixes.push('Check if the implementation logic produces the correct output');
        fixes.push('Review any recent changes to the function being tested');
        break;

      case 'exception':
        causes.push('Unexpected error thrown during test execution');
        causes.push(failure.errorMessage);
        fixes.push('Add try-catch handling in the code under test');
        fixes.push('Check for null/undefined values before operations');
        fixes.push('Verify input validation is proper');
        break;

      case 'timeout':
        causes.push('Test took too long to complete');
        fixes.push('Check for infinite loops in the code');
        fixes.push('Optimize async operations');
        fixes.push('Increase test timeout if operation is legitimately slow');
        break;

      case 'syntax':
        causes.push('Syntax error in test or source file');
        fixes.push('Run linter to identify syntax issues');
        fixes.push('Check for missing brackets, parentheses, or semicolons');
        break;

      default:
        causes.push('Unknown error type');
        causes.push(failure.errorMessage);
        fixes.push('Review the test output for more details');
        fixes.push('Check test isolation - ensure tests don\'t depend on each other');
    }

    return { possibleCauses: causes, suggestedFixes: fixes };
  }

  /**
   * Start a TDD session
   */
  startTDDSession(feature: string, targetFile: string, framework?: TestFramework): TDDSession {
    const fw = framework || this.inferFramework(targetFile);
    return this.tddWorkflow.startSession(feature, targetFile, fw);
  }

  /**
   * Get TDD guidance for current step
   */
  getTDDGuidance(sessionId: string) {
    return this.tddWorkflow.getCurrentStepGuidance(sessionId);
  }

  /**
   * Record TDD step completion
   */
  recordTDDStep(
    sessionId: string,
    step: TDDStep['step'],
    data: { testCode?: string; implementationCode?: string; testResult?: ParsedTestResult }
  ): TDDStep {
    return this.tddWorkflow.recordStep(sessionId, step, data);
  }

  /**
   * Get TDD session
   */
  getTDDSession(sessionId: string): TDDSession | null {
    return this.tddWorkflow.getSession(sessionId);
  }

  /**
   * Get coverage report
   */
  async getCoverageReport(workspacePath: string, framework?: TestFramework): Promise<CoverageReport | null> {
    const result = await this.runTests(workspacePath, { framework, coverage: true });
    return result.coverage || null;
  }

  /**
   * Generate tests for uncovered code
   */
  async generateCoverageTests(
    workspacePath: string,
    sourceFiles: Array<{ path: string; content: string }>,
    framework?: TestFramework
  ): Promise<GeneratedTest[]> {
    const coverage = await this.getCoverageReport(workspacePath, framework);
    if (!coverage) return [];

    const fw = framework || await this.detectFramework(workspacePath);
    const entities: CodeEntity[] = [];

    for (const file of sourceFiles) {
      const analysis = await codeAnalyzer.analyzeFile(file.path, file.content);
      entities.push(...analysis.entities);
    }

    const context: TestGenerationContext = {
      sourceFile: sourceFiles[0]?.path || '',
      sourceCode: sourceFiles[0]?.content || '',
      entities,
      framework: fw,
      testStyle: 'unit',
      coverage,
    };

    return this.generator.generateCoverageTests(context, coverage);
  }

  private inferFramework(filePath: string): TestFramework {
    const ext = path.extname(filePath);
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'vitest';
      case '.js':
      case '.jsx':
        return 'jest';
      case '.py':
        return 'pytest';
      case '.go':
        return 'go-test';
      case '.rs':
        return 'cargo-test';
      default:
        return 'unknown';
    }
  }

  private async saveTestResult(result: ParsedTestResult): Promise<void> {
    try {
      const testResult: TestResult = {
        user_id: this.userId,
        test_framework: result.framework,
        total_tests: result.total,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        coverage_percent: result.coverage?.linePercentage,
        output: result.rawOutput.substring(0, 10000),
      };

      await supabaseAdmin.from('test_results').insert(testResult);
    } catch (error) {
      console.error('Error saving test result:', error);
    }
  }

  async getTestHistory(limit: number = 20): Promise<TestResult[]> {
    const { data } = await supabaseAdmin
      .from('test_results')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return data || [];
  }
}

// ============================================================
// EXPORTS
// ============================================================

export const testOutputParser = new TestOutputParser();
export const testGenerator = new TestGenerator();
export const tddWorkflow = new TDDWorkflow();

export function createTestRunner(userId: string): EnhancedTestRunner {
  return new EnhancedTestRunner(userId);
}
