/**
 * Verification & Hallucination Prevention API
 * Provides grounding checks, syntax verification, and confidence scoring
 * to prevent the agent from producing incorrect code or claims.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  hallucinationPrevention,
  GroundingCheck,
  SyntaxVerification,
  ConfidenceScore,
  VerificationResult,
  calculateEvidenceBasedScore,
} from '@/lib/hallucinationPrevention';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ============================================================
      // CODEBASE CONTEXT MANAGEMENT
      // ============================================================
      case 'updateCodebaseContext': {
        const { files } = body;
        if (!files || !Array.isArray(files)) {
          return NextResponse.json(
            { error: 'files array is required' },
            { status: 400 }
          );
        }

        await hallucinationPrevention.updateCodebaseContext(files);
        const stats = hallucinationPrevention.getCodebaseStats();

        return NextResponse.json({
          success: true,
          message: 'Codebase context updated',
          stats,
        });
      }

      // ============================================================
      // GROUNDING CHECKS
      // ============================================================
      case 'verifyFileExists': {
        const { filePath } = body;
        if (!filePath) {
          return NextResponse.json(
            { error: 'filePath is required' },
            { status: 400 }
          );
        }

        const result = hallucinationPrevention.verifyFileExists(filePath);
        return NextResponse.json({ result });
      }

      case 'verifyFunctionExists': {
        const { functionName, expectedFile } = body;
        if (!functionName) {
          return NextResponse.json(
            { error: 'functionName is required' },
            { status: 400 }
          );
        }

        const result = hallucinationPrevention.verifyFunctionExists(functionName, expectedFile);
        return NextResponse.json({ result });
      }

      case 'verifyTypeExists': {
        const { typeName, expectedFile } = body;
        if (!typeName) {
          return NextResponse.json(
            { error: 'typeName is required' },
            { status: 400 }
          );
        }

        const result = hallucinationPrevention.verifyTypeExists(typeName, expectedFile);
        return NextResponse.json({ result });
      }

      case 'verifyVariableExists': {
        const { variableName, expectedFile } = body;
        if (!variableName) {
          return NextResponse.json(
            { error: 'variableName is required' },
            { status: 400 }
          );
        }

        const result = hallucinationPrevention.verifyVariableExists(variableName, expectedFile);
        return NextResponse.json({ result });
      }

      case 'verifyImportValid': {
        const { importPath, fromFile } = body;
        if (!importPath || !fromFile) {
          return NextResponse.json(
            { error: 'importPath and fromFile are required' },
            { status: 400 }
          );
        }

        const result = hallucinationPrevention.verifyImportValid(importPath, fromFile);
        return NextResponse.json({ result });
      }

      case 'batchGroundingCheck': {
        const { checks } = body;
        if (!checks || !Array.isArray(checks)) {
          return NextResponse.json(
            { error: 'checks array is required' },
            { status: 400 }
          );
        }

        const results: GroundingCheck[] = [];
        for (const check of checks) {
          let result: GroundingCheck;
          switch (check.type) {
            case 'file':
              result = hallucinationPrevention.verifyFileExists(check.target);
              break;
            case 'function':
              result = hallucinationPrevention.verifyFunctionExists(check.target, check.expectedFile);
              break;
            case 'type':
              result = hallucinationPrevention.verifyTypeExists(check.target, check.expectedFile);
              break;
            case 'variable':
              result = hallucinationPrevention.verifyVariableExists(check.target, check.expectedFile);
              break;
            case 'import':
              result = hallucinationPrevention.verifyImportValid(check.target, check.fromFile);
              break;
            default:
              continue;
          }
          results.push(result);
        }

        const allExist = results.every(r => r.exists);
        const avgConfidence = results.length > 0
          ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
          : 0;

        return NextResponse.json({
          results,
          summary: {
            total: results.length,
            verified: results.filter(r => r.exists).length,
            failed: results.filter(r => !r.exists).length,
            allExist,
            avgConfidence,
          },
        });
      }

      // ============================================================
      // SYNTAX VERIFICATION
      // ============================================================
      case 'verifySyntax': {
        const { code, language, filePath } = body;
        if (!code || !language) {
          return NextResponse.json(
            { error: 'code and language are required' },
            { status: 400 }
          );
        }

        const result = hallucinationPrevention.verifySyntax(code, language, filePath);
        return NextResponse.json({ result });
      }

      case 'verifyCodeIntegration': {
        const { code, targetFile, dependencies } = body;
        if (!code || !targetFile) {
          return NextResponse.json(
            { error: 'code and targetFile are required' },
            { status: 400 }
          );
        }

        const result = await hallucinationPrevention.verifyCodeIntegration(
          code,
          targetFile,
          dependencies
        );
        return NextResponse.json({ result });
      }

      // ============================================================
      // FULL VERIFICATION PIPELINE
      // ============================================================
      case 'verify': {
        const { content, contentType, language, targetFile, autoResolve } = body;
        if (!content || !contentType) {
          return NextResponse.json(
            { error: 'content and contentType are required' },
            { status: 400 }
          );
        }

        const result = await hallucinationPrevention.verify(content, {
          contentType,
          language,
          targetFile,
          autoResolve,
        });

        return NextResponse.json({ result });
      }

      case 'verifyCode': {
        // Convenience endpoint for verifying code specifically
        const { code, language, targetFile } = body;
        if (!code) {
          return NextResponse.json(
            { error: 'code is required' },
            { status: 400 }
          );
        }

        // First verify syntax
        const syntaxResult = hallucinationPrevention.verifySyntax(
          code,
          language || 'typescript',
          targetFile
        );

        // Then run full verification
        const fullResult = await hallucinationPrevention.verify(code, {
          contentType: 'code',
          language: language || 'typescript',
          targetFile,
          autoResolve: true,
        });

        // Determine if safe to present
        const safe = syntaxResult.valid && fullResult.confidenceScore.recommendation !== 'reject';
        const issues: string[] = [];

        if (!syntaxResult.valid) {
          issues.push(...syntaxResult.errors.map(e => `Syntax error at line ${e.line}: ${e.message}`));
        }
        
        for (const flag of fullResult.confidenceScore.flags.filter(f => f.severity === 'critical')) {
          issues.push(flag.message);
        }

        return NextResponse.json({
          safe,
          syntaxValid: syntaxResult.valid,
          syntaxErrors: syntaxResult.errors,
          syntaxWarnings: syntaxResult.warnings,
          confidence: fullResult.confidenceScore.overall,
          confidenceBreakdown: fullResult.confidenceScore.breakdown,
          recommendation: fullResult.confidenceScore.recommendation,
          groundingChecks: fullResult.groundingChecks,
          challenges: fullResult.challenges,
          issues,
        });
      }

      // ============================================================
      // VERIFICATION CHALLENGES
      // ============================================================
      case 'generateChallenges': {
        const { content, contentType } = body;
        if (!content || !contentType) {
          return NextResponse.json(
            { error: 'content and contentType are required' },
            { status: 400 }
          );
        }

        const challenges = hallucinationPrevention.generateVerificationChallenges(
          content,
          contentType
        );
        return NextResponse.json({ challenges });
      }

      case 'resolveChallenges': {
        const { challenges } = body;
        if (!challenges || !Array.isArray(challenges)) {
          return NextResponse.json(
            { error: 'challenges array is required' },
            { status: 400 }
          );
        }

        const resolved = hallucinationPrevention.resolveVerificationChallenges(challenges);
        const allResolved = resolved.every(c => c.resolved);
        const verifiedCount = resolved.filter(c => c.resolution?.startsWith('Verified')).length;

        return NextResponse.json({
          challenges: resolved,
          summary: {
            total: resolved.length,
            resolved: resolved.filter(c => c.resolved).length,
            verified: verifiedCount,
            failed: resolved.filter(c => c.resolved && !c.resolution?.startsWith('Verified')).length,
            allResolved,
            verificationRate: resolved.length > 0 ? verifiedCount / resolved.length : 0,
          },
        });
      }

      // ============================================================
      // CONFIDENCE SCORING
      // ============================================================
      case 'calculateConfidence': {
        const { content, context } = body;
        if (!content || !context) {
          return NextResponse.json(
            { error: 'content and context are required' },
            { status: 400 }
          );
        }

        const score = hallucinationPrevention.calculateConfidence(content, context);
        return NextResponse.json({ score });
      }

      case 'calculateEvidenceScore': {
        const { step, task, codebaseFiles, previousSteps } = body;
        if (!step || !task) {
          return NextResponse.json(
            { error: 'step and task are required' },
            { status: 400 }
          );
        }

        const result = await calculateEvidenceBasedScore(step, {
          task,
          codebaseFiles,
          previousSteps,
        });

        return NextResponse.json({ result });
      }

      // ============================================================
      // UTILITY OPERATIONS
      // ============================================================
      case 'getStats': {
        const stats = hallucinationPrevention.getCodebaseStats();
        return NextResponse.json({ stats });
      }

      case 'clearCache': {
        hallucinationPrevention.clearCache();
        return NextResponse.json({
          success: true,
          message: 'Verification cache cleared',
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const stats = hallucinationPrevention.getCodebaseStats();

  return NextResponse.json({
    service: 'Verification & Hallucination Prevention API',
    version: '1.0.0',
    stats,
    actions: {
      codebaseContext: [
        'updateCodebaseContext - Load files for grounding checks',
        'getStats - Get codebase statistics',
        'clearCache - Clear verification cache',
      ],
      groundingChecks: [
        'verifyFileExists - Check if a file exists',
        'verifyFunctionExists - Check if a function exists',
        'verifyTypeExists - Check if a type/interface exists',
        'verifyVariableExists - Check if a variable exists',
        'verifyImportValid - Check if an import is valid',
        'batchGroundingCheck - Verify multiple items at once',
      ],
      syntaxVerification: [
        'verifySyntax - Verify code syntax',
        'verifyCodeIntegration - Verify code integrates with codebase',
      ],
      fullVerification: [
        'verify - Full verification pipeline for any content',
        'verifyCode - Convenience endpoint for code verification',
      ],
      challenges: [
        'generateChallenges - Generate verification challenges',
        'resolveChallenges - Resolve challenges against codebase',
      ],
      confidence: [
        'calculateConfidence - Calculate confidence score',
        'calculateEvidenceScore - Calculate evidence-based score for planning',
      ],
    },
    capabilities: [
      'File/function/type/variable existence verification',
      'TypeScript/JavaScript syntax verification via ts-morph',
      'JSON syntax verification',
      'Import path resolution and validation',
      'Evidence-based confidence scoring',
      'Verification challenge generation and resolution',
      'Hallucination detection via grounding checks',
      'Similar entity suggestions when not found',
      'Source citation tracking',
    ],
  });
}
