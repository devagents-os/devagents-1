import { NextResponse } from 'next/server';
import { getImmediateAction, getReflectivePlan, processComputerTask, getAutonomousAction, getNextComputerAction, ScreenState } from '@/lib/groq';
import { createAgentBrain, initializeBaseSkills } from '@/lib/agentBrain';
import { agentMemory, skillManager } from '@/lib/agentMemory';
import { hallucinationPrevention } from '@/lib/hallucinationPrevention';
import { deductTokens } from '@/lib/tokenService';

let skillsInitialized = false;

async function ensureSkillsInitialized() {
  if (!skillsInitialized) {
    await initializeBaseSkills();
    skillsInitialized = true;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, task, currentState, previousActions, mood, screenState, userId = 'default', roomConfig } = body;

    await ensureSkillsInitialized();

      const brain = createAgentBrain(userId);

      // Token deduction for actions that cost tokens
      const FREE_ACTIONS = ['get_stats', 'get_skills', 'get_memories', 'get_verification_stats', 'update_codebase_context'];
      if (!FREE_ACTIONS.includes(action) && userId !== 'default') {
        const tokenResult = await deductTokens(userId, action, { source: 'agent' });
        if (!tokenResult.allowed) {
          return NextResponse.json(
            {
              error: 'Insufficient credits',
              tokensRemaining: tokenResult.tokensRemaining,
              cost: tokenResult.cost,
              planTier: tokenResult.planTier,
            },
            { status: 403 }
          );
        }
      }

      switch (action) {
      case 'immediate': {
        const context = await brain.getContextForTask(task);
        const result = await getImmediateAction(task, currentState, previousActions || [], context, undefined, roomConfig);
        return NextResponse.json(result);
      }

      case 'reflective': {
        const context = await brain.getContextForTask(task);
        const result = await getReflectivePlan(task, currentState, context, undefined, roomConfig);
        return NextResponse.json(result);
      }

      case 'computer': {
        const result = await processComputerTask(task, screenState as ScreenState | undefined);
        return NextResponse.json(result);
      }

      case 'computer_step': {
        const result = await getNextComputerAction(task, screenState as ScreenState, previousActions || []);
        return NextResponse.json(result);
      }

      case 'autonomous': {
        const { unrestricted } = body;
        const result = await getAutonomousAction(currentState, previousActions || [], mood || 'curious', roomConfig, unrestricted ?? true);
        return NextResponse.json(result);
      }

      case 'think': {
        const thinking = await brain.think({
          userId,
          task,
          previousActions: previousActions || [],
          screenState,
        });
        return NextResponse.json(thinking);
      }

      case 'learn': {
        const { insights } = body;
        if (insights && Array.isArray(insights)) {
          await brain.learn(insights);
        }
        return NextResponse.json({ success: true });
      }

      case 'learn_from_task': {
        const { outcome, notes, actions: taskActions } = body;
        await brain.learnFromTask(task, taskActions || previousActions || [], outcome, notes);
        return NextResponse.json({ success: true });
      }

      case 'execute_code': {
          const { language, code, verifyFirst = true, targetFile } = body;
          
          // Optionally verify code syntax before execution
          if (verifyFirst && (language === 'typescript' || language === 'javascript')) {
            const syntaxCheck = hallucinationPrevention.verifySyntax(code, language, targetFile);
            if (!syntaxCheck.valid) {
              return NextResponse.json({
                success: false,
                output: '',
                error: `Syntax verification failed:\n${syntaxCheck.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n')}`,
                syntaxErrors: syntaxCheck.errors,
                verified: false,
              });
            }
          }
          
          const result = await brain.executeCode(language, code);
          return NextResponse.json({
            ...result,
            verified: true,
          });
        }

      case 'run_tests': {
        const { language, code, testCode } = body;
        const result = await brain.runTests(language, code, testCode);
        return NextResponse.json(result);
      }

      case 'get_stats': {
        const stats = await brain.getAgentStats();
        return NextResponse.json(stats);
      }

      case 'get_skills': {
        const skills = await skillManager.getAllSkills();
        return NextResponse.json({ skills });
      }

      case 'get_memories': {
          const memories = await agentMemory.getRecentMemories(20);
          return NextResponse.json({ memories });
        }

        // ============================================================
        // HALLUCINATION PREVENTION & VERIFICATION ACTIONS
        // ============================================================

        case 'verify_code': {
          // Verify code before presenting it to the user
          const { code, language, targetFile, codebaseFiles } = body;
          if (!code) {
            return NextResponse.json({ error: 'code is required' }, { status: 400 });
          }

          // Update codebase context if provided
          if (codebaseFiles && Array.isArray(codebaseFiles)) {
            await hallucinationPrevention.updateCodebaseContext(codebaseFiles);
          }

          const verification = await brain.isCodeSafeToPresent(
            code,
            language || 'typescript',
            targetFile
          );

          return NextResponse.json({
            ...verification,
            recommendation: verification.safe ? 'proceed' : (verification.confidence > 0.5 ? 'review' : 'reject'),
          });
        }

        case 'verify_plan': {
          // Verify a plan before execution
          const { planSteps, codebaseFiles } = body;
          if (!planSteps || !Array.isArray(planSteps)) {
            return NextResponse.json({ error: 'planSteps array is required' }, { status: 400 });
          }

          // Update codebase context if provided
          if (codebaseFiles && Array.isArray(codebaseFiles)) {
            await hallucinationPrevention.updateCodebaseContext(codebaseFiles);
          }

          const verification = await brain.verifyPlan(planSteps);
          return NextResponse.json(verification);
        }

        case 'verify_claim': {
          // Verify a claim or assertion against the codebase
          const { claim, codebaseFiles } = body;
          if (!claim) {
            return NextResponse.json({ error: 'claim is required' }, { status: 400 });
          }

          // Update codebase context if provided
          if (codebaseFiles && Array.isArray(codebaseFiles)) {
            await hallucinationPrevention.updateCodebaseContext(codebaseFiles);
          }

          const verification = await brain.verifyContent(claim, {
            contentType: 'claim',
            autoResolve: true,
          });

          return NextResponse.json({
            verified: verification.verified,
            confidence: verification.confidenceScore.overall,
            recommendation: verification.confidenceScore.recommendation,
            groundingChecks: verification.groundingChecks,
            challenges: verification.challenges,
            flags: verification.confidenceScore.flags,
          });
        }

        case 'grounding_check': {
          // Check if references exist in the codebase
          const { checks, codebaseFiles } = body;
          if (!checks || !Array.isArray(checks)) {
            return NextResponse.json({ error: 'checks array is required' }, { status: 400 });
          }

          // Update codebase context if provided
          if (codebaseFiles && Array.isArray(codebaseFiles)) {
            await hallucinationPrevention.updateCodebaseContext(codebaseFiles);
          }

          const results = [];
          for (const check of checks) {
            let result;
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
              case 'import':
                result = hallucinationPrevention.verifyImportValid(check.target, check.fromFile);
                break;
              default:
                continue;
            }
            results.push(result);
          }

          const allExist = results.every(r => r.exists);
          return NextResponse.json({
            results,
            allExist,
            verified: results.filter(r => r.exists).length,
            failed: results.filter(r => !r.exists).length,
          });
        }

        case 'update_codebase_context': {
          // Update the codebase context for grounding checks
          const { files } = body;
          if (!files || !Array.isArray(files)) {
            return NextResponse.json({ error: 'files array is required' }, { status: 400 });
          }

          await brain.updateHallucinationPreventionContext(files);
          const stats = brain.getHallucinationPreventionStats();
          
          return NextResponse.json({
            success: true,
            message: 'Codebase context updated',
            stats,
          });
        }

        case 'get_verification_stats': {
          const stats = brain.getHallucinationPreventionStats();
          return NextResponse.json({ stats });
        }

      default:
        return NextResponse.json({ error: 'Unknown action type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', action: 'IDLE', thought: 'Error', done: true },
      { status: 500 }
    );
  }
}
