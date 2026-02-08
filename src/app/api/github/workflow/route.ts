import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from 'octokit';
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
  type ConflictResolution,
} from '@/lib/gitWorkflow';
import { getGitHubConnection } from '@/lib/github';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId, ...params } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const gitManager = getGitWorkflowManager();

    // Actions that don't require GitHub connection
    switch (action) {
      // ============================================================
      // LOCAL GIT OPERATIONS
      // ============================================================
      
      case 'clone': {
        const { repoUrl, options } = params as { repoUrl: string; options?: GitCloneOptions };
        if (!repoUrl) {
          return NextResponse.json({ error: 'repoUrl is required' }, { status: 400 });
        }
        const result = await gitManager.clone(repoUrl, options);
        return NextResponse.json(result);
      }

      case 'status': {
        const { repoPath } = params;
        try {
          const status = await gitManager.getStatus(repoPath);
          return NextResponse.json({ success: true, status });
        } catch (error: any) {
          return NextResponse.json({ success: false, error: error.message });
        }
      }

      case 'stage': {
        const { files, repoPath } = params as { files: string[] | 'all'; repoPath?: string };
        if (!files) {
          return NextResponse.json({ error: 'files is required' }, { status: 400 });
        }
        const result = await gitManager.stage(files, repoPath);
        return NextResponse.json(result);
      }

      case 'unstage': {
        const { files, repoPath } = params as { files: string[] | 'all'; repoPath?: string };
        if (!files) {
          return NextResponse.json({ error: 'files is required' }, { status: 400 });
        }
        const result = await gitManager.unstage(files, repoPath);
        return NextResponse.json(result);
      }

      case 'commit': {
        const { options, repoPath } = params as { options: GitCommitOptions; repoPath?: string };
        if (!options?.message) {
          return NextResponse.json({ error: 'options.message is required' }, { status: 400 });
        }
        const result = await gitManager.commit(options, repoPath);
        return NextResponse.json(result);
      }

      case 'push': {
        const { options, repoPath } = params as { options?: GitPushOptions; repoPath?: string };
        const result = await gitManager.push(options || {}, repoPath);
        return NextResponse.json(result);
      }

      case 'pull': {
        const { remote, branch, rebase, repoPath } = params;
        const result = await gitManager.pull(remote, branch, rebase, repoPath);
        return NextResponse.json(result);
      }

      case 'fetch': {
        const { remote, prune, repoPath } = params;
        const result = await gitManager.fetch(remote, prune, repoPath);
        return NextResponse.json(result);
      }

      case 'create_branch': {
        const { branchName, checkout, startPoint, repoPath } = params;
        if (!branchName) {
          return NextResponse.json({ error: 'branchName is required' }, { status: 400 });
        }
        const result = await gitManager.createBranch(branchName, checkout, startPoint, repoPath);
        return NextResponse.json(result);
      }

      case 'checkout': {
        const { branchName, repoPath } = params;
        if (!branchName) {
          return NextResponse.json({ error: 'branchName is required' }, { status: 400 });
        }
        const result = await gitManager.checkout(branchName, repoPath);
        return NextResponse.json(result);
      }

      case 'delete_branch': {
        const { branchName, force, remote, repoPath } = params;
        if (!branchName) {
          return NextResponse.json({ error: 'branchName is required' }, { status: 400 });
        }
        const result = await gitManager.deleteBranch(branchName, force, remote, repoPath);
        return NextResponse.json(result);
      }

      case 'merge': {
        const { branchName, options, repoPath } = params as { 
          branchName: string; 
          options?: GitMergeOptions; 
          repoPath?: string 
        };
        if (!branchName) {
          return NextResponse.json({ error: 'branchName is required' }, { status: 400 });
        }
        const result = await gitManager.merge(branchName, options || {}, repoPath);
        return NextResponse.json(result);
      }

      case 'rebase': {
        const { onto, options, repoPath } = params as { 
          onto: string; 
          options?: GitRebaseOptions; 
          repoPath?: string 
        };
        if (!onto && !options?.abort && !options?.continue) {
          return NextResponse.json({ error: 'onto is required (or use abort/continue)' }, { status: 400 });
        }
        const result = await gitManager.rebase(onto, options || {}, repoPath);
        return NextResponse.json(result);
      }

      case 'get_conflicts': {
        const { repoPath } = params;
        const conflicts = await gitManager.getConflicts(repoPath);
        return NextResponse.json({ success: true, conflicts });
      }

      case 'resolve_conflict': {
        const { resolution, repoPath } = params as { 
          resolution: ConflictResolution; 
          repoPath?: string 
        };
        if (!resolution) {
          return NextResponse.json({ error: 'resolution is required' }, { status: 400 });
        }
        const result = await gitManager.resolveConflict(resolution, repoPath);
        return NextResponse.json(result);
      }

      case 'abort_merge': {
        const { repoPath } = params;
        const result = await gitManager.abortMerge(repoPath);
        return NextResponse.json(result);
      }

      case 'log': {
        const { count, branch, repoPath } = params;
        const log = await gitManager.getLog(count, branch, repoPath);
        return NextResponse.json({ success: true, log });
      }

      case 'diff': {
        const { fromRef, toRef, files, repoPath } = params;
        if (!fromRef) {
          return NextResponse.json({ error: 'fromRef is required' }, { status: 400 });
        }
        const diff = await gitManager.getDiff(fromRef, toRef, files, repoPath);
        return NextResponse.json({ success: true, diff });
      }

      case 'stash': {
        const { message, includeUntracked, repoPath } = params;
        const result = await gitManager.stash(message, includeUntracked, repoPath);
        return NextResponse.json(result);
      }

      case 'stash_pop': {
        const { repoPath } = params;
        const result = await gitManager.stashPop(repoPath);
        return NextResponse.json(result);
      }

      case 'cherry_pick': {
        const { sha, repoPath } = params;
        if (!sha) {
          return NextResponse.json({ error: 'sha is required' }, { status: 400 });
        }
        const result = await gitManager.cherryPick(sha, repoPath);
        return NextResponse.json(result);
      }

      case 'reset': {
        const { ref, mode, repoPath } = params;
        if (!ref) {
          return NextResponse.json({ error: 'ref is required' }, { status: 400 });
        }
        const result = await gitManager.reset(ref, mode, repoPath);
        return NextResponse.json(result);
      }

      case 'clean': {
        const { force, directories, repoPath } = params;
        const result = await gitManager.clean(force, directories, repoPath);
        return NextResponse.json(result);
      }

      case 'set_repo_path': {
        const { path } = params;
        if (!path) {
          return NextResponse.json({ error: 'path is required' }, { status: 400 });
        }
        gitManager.setRepoPath(path);
        return NextResponse.json({ success: true });
      }

      case 'get_repo_path': {
        const path = gitManager.getRepoPath();
        return NextResponse.json({ success: true, path });
      }
    }

    // ============================================================
    // GITHUB API OPERATIONS (require connection)
    // ============================================================

    const connection = await getGitHubConnection(userId);
    if (!connection?.access_token) {
      return NextResponse.json({ error: 'Not connected to GitHub' }, { status: 401 });
    }

    const octokit = new Octokit({ auth: connection.access_token, userAgent: 'Agent-3D-Room/1.0' });
    const githubWorkflow = createGitHubWorkflowIntegration(octokit, userId);

    switch (action) {
      // ============================================================
      // PR REVIEW OPERATIONS
      // ============================================================

      case 'get_pr_reviews': {
        const { owner, repo, prNumber } = params;
        if (!owner || !repo || !prNumber) {
          return NextResponse.json({ error: 'owner, repo, and prNumber are required' }, { status: 400 });
        }
        const reviews = await githubWorkflow.getPRReviews(owner, repo, prNumber);
        return NextResponse.json({ success: true, reviews });
      }

      case 'get_pr_review_comments': {
        const { owner, repo, prNumber } = params;
        if (!owner || !repo || !prNumber) {
          return NextResponse.json({ error: 'owner, repo, and prNumber are required' }, { status: 400 });
        }
        const comments = await githubWorkflow.getPRReviewComments(owner, repo, prNumber);
        return NextResponse.json({ success: true, comments });
      }

      case 'reply_to_review_comment': {
        const { owner, repo, prNumber, commentId, body: replyBody } = params;
        if (!owner || !repo || !prNumber || !commentId || !replyBody) {
          return NextResponse.json({ 
            error: 'owner, repo, prNumber, commentId, and body are required' 
          }, { status: 400 });
        }
        const result = await githubWorkflow.replyToReviewComment(
          owner, repo, prNumber, commentId, replyBody
        );
        return NextResponse.json(result);
      }

      case 'create_review': {
        const { owner, repo, prNumber, event, body: reviewBody, comments } = params;
        if (!owner || !repo || !prNumber || !event) {
          return NextResponse.json({ 
            error: 'owner, repo, prNumber, and event are required' 
          }, { status: 400 });
        }
        const result = await githubWorkflow.createReview(owner, repo, prNumber, {
          event,
          body: reviewBody,
          comments,
        });
        return NextResponse.json(result);
      }

      case 'submit_review': {
        const { owner, repo, prNumber, reviewId, event, body: reviewBody } = params;
        if (!owner || !repo || !prNumber || !reviewId || !event) {
          return NextResponse.json({ 
            error: 'owner, repo, prNumber, reviewId, and event are required' 
          }, { status: 400 });
        }
        const result = await githubWorkflow.submitReview(
          owner, repo, prNumber, reviewId, event, reviewBody
        );
        return NextResponse.json(result);
      }

      case 'get_pr_files': {
        const { owner, repo, prNumber } = params;
        if (!owner || !repo || !prNumber) {
          return NextResponse.json({ error: 'owner, repo, and prNumber are required' }, { status: 400 });
        }
        const files = await githubWorkflow.getPRFiles(owner, repo, prNumber);
        return NextResponse.json({ success: true, files });
      }

      case 'update_pr_from_review': {
        const { owner, repo, prNumber, changes, commitMessage } = params;
        if (!owner || !repo || !prNumber || !changes || !commitMessage) {
          return NextResponse.json({ 
            error: 'owner, repo, prNumber, changes, and commitMessage are required' 
          }, { status: 400 });
        }
        const result = await githubWorkflow.updatePRFromReview(
          owner, repo, prNumber, changes, commitMessage
        );
        return NextResponse.json(result);
      }

      // ============================================================
      // CI/CD OPERATIONS
      // ============================================================

      case 'get_workflow_runs': {
        const { owner, repo, branch, status: workflowStatus, perPage } = params;
        if (!owner || !repo) {
          return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
        }
        const runs = await githubWorkflow.getWorkflowRuns(owner, repo, {
          branch,
          status: workflowStatus,
          perPage,
        });
        return NextResponse.json({ success: true, runs });
      }

      case 'get_workflow_run_logs': {
        const { owner, repo, runId } = params;
        if (!owner || !repo || !runId) {
          return NextResponse.json({ error: 'owner, repo, and runId are required' }, { status: 400 });
        }
        const result = await githubWorkflow.getWorkflowRunLogs(owner, repo, runId);
        return NextResponse.json(result);
      }

      case 'get_failed_workflow_details': {
        const { owner, repo, runId } = params;
        if (!owner || !repo || !runId) {
          return NextResponse.json({ error: 'owner, repo, and runId are required' }, { status: 400 });
        }
        const details = await githubWorkflow.getFailedWorkflowDetails(owner, repo, runId);
        return NextResponse.json({ success: true, ...details });
      }

      case 'rerun_workflow': {
        const { owner, repo, runId, failedOnly } = params;
        if (!owner || !repo || !runId) {
          return NextResponse.json({ error: 'owner, repo, and runId are required' }, { status: 400 });
        }
        const result = await githubWorkflow.rerunWorkflow(owner, repo, runId, failedOnly);
        return NextResponse.json(result);
      }

      case 'cancel_workflow': {
        const { owner, repo, runId } = params;
        if (!owner || !repo || !runId) {
          return NextResponse.json({ error: 'owner, repo, and runId are required' }, { status: 400 });
        }
        const result = await githubWorkflow.cancelWorkflow(owner, repo, runId);
        return NextResponse.json(result);
      }

      case 'wait_for_workflow': {
        const { owner, repo, runId, timeoutMs, pollIntervalMs } = params;
        if (!owner || !repo || !runId) {
          return NextResponse.json({ error: 'owner, repo, and runId are required' }, { status: 400 });
        }
        const result = await githubWorkflow.waitForWorkflow(
          owner, repo, runId, timeoutMs, pollIntervalMs
        );
        return NextResponse.json({ success: true, ...result });
      }

      case 'get_commit_checks': {
        const { owner, repo, ref } = params;
        if (!owner || !repo || !ref) {
          return NextResponse.json({ error: 'owner, repo, and ref are required' }, { status: 400 });
        }
        const checks = await githubWorkflow.getCommitChecks(owner, repo, ref);
        return NextResponse.json({ success: true, checks });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('GitHub Workflow API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
