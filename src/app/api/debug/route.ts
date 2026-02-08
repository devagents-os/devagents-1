import { NextResponse } from 'next/server';
import {
  errorParser,
  debugLoop,
  debugLogger,
  ErrorParser,
  DebugLoop,
  DebugLogger,
  type ParsedError,
  type FixHypothesis,
  type DebugSession,
  type DebugAttempt,
  type DebugConfig,
  type CodeChange,
} from '@/lib/debuggingSystem';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ============================================================
      // ERROR PARSING
      // ============================================================

      case 'parse_error': {
        // Parse a single error string
        const { error: errorString } = body;
        if (!errorString) {
          return NextResponse.json({ error: 'error string is required' }, { status: 400 });
        }

        const parsed = errorParser.parse(errorString);
        return NextResponse.json({
          success: true,
          error: parsed,
        });
      }

      case 'parse_multiple': {
        // Parse multiple errors from build/test output
        const { output } = body;
        if (!output) {
          return NextResponse.json({ error: 'output is required' }, { status: 400 });
        }

        const errors = errorParser.parseMultiple(output);
        return NextResponse.json({
          success: true,
          errors,
          count: errors.length,
        });
      }

      // ============================================================
      // DEBUG SESSION MANAGEMENT
      // ============================================================

      case 'start_session': {
        // Start a new debug session
        const { errorOutput, codeContext } = body;
        if (!errorOutput) {
          return NextResponse.json({ error: 'errorOutput is required' }, { status: 400 });
        }

        const session = await debugLoop.startSession(errorOutput, codeContext);
        return NextResponse.json({
          success: true,
          session: {
            id: session.id,
            status: session.status,
            errorCount: session.errors.length,
            hypothesesCount: session.hypotheses.length,
            errors: session.errors,
            hypotheses: session.hypotheses,
          },
        });
      }

      case 'get_session': {
        // Get session status
        const { sessionId } = body;
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const session = debugLoop.getSession(sessionId);
        if (!session) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          session,
        });
      }

      case 'get_active_sessions': {
        const sessions = debugLoop.getActiveSessions();
        return NextResponse.json({
          success: true,
          sessions: sessions.map(s => ({
            id: s.id,
            status: s.status,
            errorCount: s.errors.length,
            attemptsCount: s.attempts.length,
          })),
          count: sessions.length,
        });
      }

      case 'get_next_hypothesis': {
        // Get the next hypothesis to try
        const { sessionId } = body;
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const hypothesis = debugLoop.getNextHypothesis(sessionId);
        return NextResponse.json({
          success: true,
          hypothesis,
          hasMore: hypothesis !== null,
        });
      }

      case 'generate_report': {
        // Generate a debug report for a session
        const { sessionId } = body;
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const report = debugLoop.generateReport(sessionId);
        return NextResponse.json({
          success: true,
          report,
        });
      }

      case 'clear_sessions': {
        debugLoop.clearSessions();
        return NextResponse.json({
          success: true,
          message: 'All sessions cleared',
        });
      }

      // ============================================================
      // FIX HYPOTHESIS OPERATIONS
      // ============================================================

      case 'generate_hypotheses': {
        // Generate fix hypotheses for an error
        const { error: errorData, codeContext } = body;
        if (!errorData) {
          return NextResponse.json({ error: 'error data is required' }, { status: 400 });
        }

        // Parse error if string, otherwise use as-is
        const parsedError: ParsedError = typeof errorData === 'string' 
          ? errorParser.parse(errorData) 
          : errorData;

        const session = await debugLoop.startSession(parsedError.raw, codeContext);
        return NextResponse.json({
          success: true,
          sessionId: session.id,
          hypotheses: session.hypotheses,
          error: session.errors[0],
        });
      }

      case 'attempt_fix': {
        // Attempt to apply a fix (simulation mode - returns what would be done)
        const { sessionId, hypothesisId, simulate = true } = body;
        if (!sessionId || !hypothesisId) {
          return NextResponse.json({ error: 'sessionId and hypothesisId are required' }, { status: 400 });
        }

        const session = debugLoop.getSession(sessionId);
        if (!session) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const hypothesis = session.hypotheses.find(h => h.id === hypothesisId);
        if (!hypothesis) {
          return NextResponse.json({ error: 'Hypothesis not found' }, { status: 404 });
        }

        if (simulate) {
          // Return what would be done without actually doing it
          return NextResponse.json({
            success: true,
            simulation: true,
            hypothesis,
            wouldApply: {
              changes: hypothesis.changes,
              verificationSteps: hypothesis.verificationSteps,
            },
            message: 'This is a simulation. Set simulate=false to actually attempt the fix.',
          });
        }

        // For actual fix attempts, the client must provide applyChanges and runVerification callbacks
        // Since we're in an API context, we return the changes to be applied by the client
        return NextResponse.json({
          success: true,
          simulation: false,
          hypothesis,
          action: 'apply_changes',
          changes: hypothesis.changes,
          verificationSteps: hypothesis.verificationSteps,
          message: 'Apply these changes and run verification, then call record_attempt with results',
        });
      }

      case 'record_attempt': {
        // Record the result of a fix attempt
        const { 
          sessionId, 
          hypothesisId, 
          outcome, 
          testResults, 
          buildResults, 
          newErrorOutput,
          notes 
        } = body;
        
        if (!sessionId || !hypothesisId || !outcome) {
          return NextResponse.json({ 
            error: 'sessionId, hypothesisId, and outcome are required' 
          }, { status: 400 });
        }

        const session = debugLoop.getSession(sessionId);
        if (!session) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const hypothesis = session.hypotheses.find(h => h.id === hypothesisId);
        if (!hypothesis) {
          return NextResponse.json({ error: 'Hypothesis not found' }, { status: 404 });
        }

        // Create attempt record
        const attempt: DebugAttempt = {
          id: `attempt-${Date.now()}`,
          timestamp: Date.now(),
          hypothesisId,
          changesApplied: hypothesis.changes,
          outcome,
          testResults,
          buildResults,
          notes: notes || '',
        };

        // Parse new errors if fix introduced them
        if (newErrorOutput && outcome !== 'success') {
          const newErrors = errorParser.parseMultiple(newErrorOutput);
          if (newErrors.length > 0) {
            attempt.errorAfterFix = newErrors[0];
            session.errors.push(newErrors[0]);
          }
        }

        session.attempts.push(attempt);

        // Update session status
        if (outcome === 'success') {
          session.status = 'resolved';
          session.resolution = {
            hypothesis,
            changesApplied: hypothesis.changes,
            verificationPassed: true,
          };
        } else if (session.attempts.length >= 5) {
          session.status = 'abandoned';
        }

        return NextResponse.json({
          success: true,
          attempt,
          sessionStatus: session.status,
          nextHypothesis: outcome !== 'success' ? debugLoop.getNextHypothesis(sessionId) : null,
        });
      }

      // ============================================================
      // DEBUG LOGGING
      // ============================================================

      case 'enable_debug': {
        debugLogger.enable();
        return NextResponse.json({
          success: true,
          enabled: true,
          message: 'Debug logging enabled',
        });
      }

      case 'disable_debug': {
        debugLogger.disable();
        return NextResponse.json({
          success: true,
          enabled: false,
          message: 'Debug logging disabled',
        });
      }

      case 'get_debug_status': {
        return NextResponse.json({
          success: true,
          enabled: debugLogger.isEnabled(),
        });
      }

      case 'get_logs': {
        const { level, since, limit = 100 } = body;
        
        let logs = debugLogger.getLogs({ level, since });
        if (limit) {
          logs = logs.slice(-limit);
        }

        return NextResponse.json({
          success: true,
          logs,
          count: logs.length,
        });
      }

      case 'export_logs': {
        const exported = debugLogger.exportLogs();
        return NextResponse.json({
          success: true,
          logs: exported,
        });
      }

      case 'clear_logs': {
        debugLogger.clear();
        return NextResponse.json({
          success: true,
          message: 'Logs cleared',
        });
      }

      // ============================================================
      // CONFIGURATION
      // ============================================================

      case 'update_config': {
        const { config } = body;
        if (!config || typeof config !== 'object') {
          return NextResponse.json({ error: 'config object is required' }, { status: 400 });
        }

        debugLoop.updateConfig(config);
        return NextResponse.json({
          success: true,
          message: 'Configuration updated',
        });
      }

      // ============================================================
      // ROOT CAUSE ANALYSIS
      // ============================================================

      case 'analyze_root_cause': {
        // Analyze errors to find the root cause
        const { errors: errorInputs } = body;
        if (!errorInputs || !Array.isArray(errorInputs)) {
          return NextResponse.json({ error: 'errors array is required' }, { status: 400 });
        }

        const parsedErrors: ParsedError[] = errorInputs.map((e: string | ParsedError) => 
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

        // Find related errors (same file or same identifiers)
        const relatedGroups: ParsedError[][] = [];
        const used = new Set<number>();

        for (let i = 0; i < parsedErrors.length; i++) {
          if (used.has(i)) continue;
          
          const group = [parsedErrors[i]];
          used.add(i);

          for (let j = i + 1; j < parsedErrors.length; j++) {
            if (used.has(j)) continue;

            const e1 = parsedErrors[i];
            const e2 = parsedErrors[j];

            // Same file
            if (e1.file && e1.file === e2.file) {
              group.push(e2);
              used.add(j);
              continue;
            }

            // Shared identifiers
            const shared = e1.involvedIdentifiers?.filter(id => 
              e2.involvedIdentifiers?.includes(id)
            );
            if (shared && shared.length > 0) {
              group.push(e2);
              used.add(j);
            }
          }

          if (group.length > 1) {
            relatedGroups.push(group);
          }
        }

        // Determine likely root cause
        let rootCause: ParsedError | null = null;
        let rootCauseReason = '';

        // Priority: syntax > import > type > runtime
        const priority = ['syntax', 'import', 'type', 'runtime', 'build_failure'];
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

        return NextResponse.json({
          success: true,
          analysis: {
            totalErrors: parsedErrors.length,
            byCategory,
            relatedGroups,
            rootCause,
            rootCauseReason,
            recommendation: rootCause 
              ? `Fix the ${rootCause.category} error in ${rootCause.file || 'unknown file'} first`
              : 'No clear root cause identified',
          },
        });
      }

      // ============================================================
      // STACK TRACE ANALYSIS
      // ============================================================

      case 'analyze_stack_trace': {
        const { error: errorInput } = body;
        if (!errorInput) {
          return NextResponse.json({ error: 'error is required' }, { status: 400 });
        }

        const parsed = typeof errorInput === 'string' 
          ? errorParser.parse(errorInput) 
          : errorInput;

        const stackTrace = parsed.stackTrace || [];
        
        // Filter out internal frames
        const userFrames = stackTrace.filter(f => !f.isInternal);
        const internalFrames = stackTrace.filter(f => f.isInternal);

        // Find the origin (first user frame)
        const origin = userFrames[0] || null;

        // Find unique files involved
        const filesInvolved = [...new Set(userFrames.map(f => f.file))];

        return NextResponse.json({
          success: true,
          analysis: {
            error: parsed.summary,
            category: parsed.category,
            origin,
            callPath: userFrames.map(f => `${f.function || 'anonymous'} (${f.file}:${f.line})`),
            filesInvolved,
            totalFrames: stackTrace.length,
            userFrames: userFrames.length,
            internalFrames: internalFrames.length,
            recommendation: origin 
              ? `Start debugging at ${origin.file}:${origin.line}`
              : 'No user code found in stack trace',
          },
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown action type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      { error: 'Failed to process debug request', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Debug API',
    version: '1.0.0',
    description: 'Error recovery and debugging loop API',
    endpoints: {
      'parse_error': 'Parse a single error string',
      'parse_multiple': 'Parse multiple errors from output',
      'start_session': 'Start a new debug session',
      'get_session': 'Get session status',
      'get_active_sessions': 'Get all active sessions',
      'get_next_hypothesis': 'Get next fix hypothesis',
      'generate_report': 'Generate debug report',
      'generate_hypotheses': 'Generate fix hypotheses for an error',
      'attempt_fix': 'Attempt to apply a fix (simulation)',
      'record_attempt': 'Record fix attempt result',
      'enable_debug': 'Enable debug logging',
      'disable_debug': 'Disable debug logging',
      'get_logs': 'Get debug logs',
      'analyze_root_cause': 'Analyze errors for root cause',
      'analyze_stack_trace': 'Analyze stack trace',
    },
    debugEnabled: debugLogger.isEnabled(),
    activeSessions: debugLoop.getActiveSessions().length,
  });
}
