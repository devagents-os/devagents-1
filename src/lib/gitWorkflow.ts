/**
 * Git Workflow Manager - Full git workflow support for AI Software Engineer
 * 
 * Capabilities:
 * - Clone repositories to local workspace
 * - Full commit workflow (stage → commit → push)
 * - Branch management (create, checkout, merge, rebase)
 * - Merge conflict detection and resolution assistance
 * - PR lifecycle management
 * - CI/CD integration with GitHub Actions
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GitHubIntegration, type GitHubPR, type GitHubCommit } from './github';
import { Octokit } from 'octokit';

const execAsync = promisify(exec);

// Types
export interface GitCloneOptions {
  depth?: number;           // Shallow clone depth
  branch?: string;          // Specific branch to clone
  singleBranch?: boolean;   // Only clone single branch
  recursive?: boolean;      // Include submodules
}

export interface GitCommitOptions {
  message: string;
  amend?: boolean;
  noVerify?: boolean;       // Skip pre-commit hooks
  author?: { name: string; email: string };
}

export interface GitPushOptions {
  remote?: string;
  branch?: string;
  force?: boolean;
  forceLease?: boolean;     // Safer force push
  setUpstream?: boolean;
  tags?: boolean;
}

export interface GitMergeOptions {
  noFastForward?: boolean;
  squash?: boolean;
  commit?: boolean;
  message?: string;
}

export interface GitRebaseOptions {
  interactive?: boolean;
  autosquash?: boolean;
  onto?: string;
  abort?: boolean;
  continue?: boolean;
}

export interface MergeConflict {
  file: string;
  conflictType: 'content' | 'both_modified' | 'delete_modify' | 'rename';
  ourVersion?: string;
  theirVersion?: string;
  baseVersion?: string;
  conflictMarkers?: {
    startLine: number;
    midLine: number;
    endLine: number;
  }[];
}

export interface ConflictResolution {
  file: string;
  resolution: 'ours' | 'theirs' | 'manual';
  manualContent?: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: { file: string; status: 'A' | 'M' | 'D' | 'R' | 'C' }[];
  unstaged: { file: string; status: 'M' | 'D' }[];
  untracked: string[];
  conflicts: string[];
}

export interface CIWorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  headSha: string;
  branch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  jobs: CIJob[];
}

export interface CIJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string;
  completedAt: string | null;
  steps: CIStep[];
}

export interface CIStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

export interface PRReviewComment {
  id: number;
  path: string;
  line: number;
  body: string;
  user: string;
  createdAt: string;
  inReplyToId?: number;
}

export interface PRReview {
  id: number;
  user: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED';
  body: string | null;
  submittedAt: string;
  comments: PRReviewComment[];
}

/**
 * Git Workflow Manager - handles local git operations
 */
export class GitWorkflowManager {
  private workspaceRoot: string;
  private currentRepo: string | null = null;
  
  constructor(workspaceRoot: string = '/tmp/agent-workspace') {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Clone a repository to the workspace
   */
  async clone(
    repoUrl: string,
    options: GitCloneOptions = {}
  ): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      // Extract repo name from URL
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
      const targetPath = path.join(this.workspaceRoot, repoName);
      
      // Ensure workspace directory exists
      await fs.mkdir(this.workspaceRoot, { recursive: true });
      
      // Check if already cloned
      try {
        await fs.access(targetPath);
        // Directory exists, check if it's a git repo
        await execAsync('git rev-parse --is-inside-work-tree', { cwd: targetPath });
        this.currentRepo = targetPath;
        return { success: true, path: targetPath };
      } catch {
        // Directory doesn't exist or not a git repo, proceed with clone
      }

      // Build clone command
      let cmd = `git clone`;
      if (options.depth) cmd += ` --depth ${options.depth}`;
      if (options.branch) cmd += ` --branch ${options.branch}`;
      if (options.singleBranch) cmd += ` --single-branch`;
      if (options.recursive) cmd += ` --recursive`;
      cmd += ` "${repoUrl}" "${targetPath}"`;

      await execAsync(cmd);
      this.currentRepo = targetPath;
      
      return { success: true, path: targetPath };
    } catch (error: any) {
      return { success: false, path: '', error: error.message || 'Clone failed' };
    }
  }

  /**
   * Get current git status
   */
  async getStatus(repoPath?: string): Promise<GitStatus> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) throw new Error('No repository set');

    // Get branch name
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd });
    const branch = branchOutput.trim();

    // Get ahead/behind count
    let ahead = 0, behind = 0;
    try {
      const { stdout: statusOutput } = await execAsync(
        `git rev-list --left-right --count ${branch}...@{upstream}`,
        { cwd }
      );
      const [a, b] = statusOutput.trim().split(/\s+/);
      ahead = parseInt(a) || 0;
      behind = parseInt(b) || 0;
    } catch {
      // No upstream set
    }

    // Get status porcelain v2
    const { stdout: porcelain } = await execAsync('git status --porcelain=v2', { cwd });
    
    const staged: GitStatus['staged'] = [];
    const unstaged: GitStatus['unstaged'] = [];
    const untracked: string[] = [];
    const conflicts: string[] = [];

    for (const line of porcelain.split('\n').filter(Boolean)) {
      if (line.startsWith('1 ') || line.startsWith('2 ')) {
        // Ordinary changed entry
        const parts = line.split(' ');
        const xy = parts[1];
        const filePath = parts.slice(8).join(' ');
        
        const indexStatus = xy[0];
        const worktreeStatus = xy[1];
        
        if (indexStatus !== '.') {
          staged.push({ file: filePath, status: indexStatus as 'A' | 'M' | 'D' | 'R' | 'C' });
        }
        if (worktreeStatus !== '.') {
          unstaged.push({ file: filePath, status: worktreeStatus as 'M' | 'D' });
        }
      } else if (line.startsWith('u ')) {
        // Unmerged entry (conflict)
        const parts = line.split(' ');
        const filePath = parts.slice(10).join(' ');
        conflicts.push(filePath);
      } else if (line.startsWith('? ')) {
        // Untracked
        untracked.push(line.substring(2));
      }
    }

    return { branch, ahead, behind, staged, unstaged, untracked, conflicts };
  }

  /**
   * Stage files for commit
   */
  async stage(files: string[] | 'all', repoPath?: string): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      if (files === 'all') {
        await execAsync('git add -A', { cwd });
      } else {
        const fileList = files.map(f => `"${f}"`).join(' ');
        await execAsync(`git add ${fileList}`, { cwd });
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Unstage files
   */
  async unstage(files: string[] | 'all', repoPath?: string): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      if (files === 'all') {
        await execAsync('git reset HEAD', { cwd });
      } else {
        const fileList = files.map(f => `"${f}"`).join(' ');
        await execAsync(`git reset HEAD ${fileList}`, { cwd });
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Commit staged changes
   */
  async commit(options: GitCommitOptions, repoPath?: string): Promise<{ success: boolean; sha?: string; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      let cmd = 'git commit';
      if (options.amend) cmd += ' --amend';
      if (options.noVerify) cmd += ' --no-verify';
      if (options.author) {
        cmd += ` --author="${options.author.name} <${options.author.email}>"`;
      }
      cmd += ` -m "${options.message.replace(/"/g, '\\"')}"`;

      await execAsync(cmd, { cwd });

      // Get commit SHA
      const { stdout: sha } = await execAsync('git rev-parse HEAD', { cwd });
      return { success: true, sha: sha.trim() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Push changes to remote
   */
  async push(options: GitPushOptions = {}, repoPath?: string): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      let cmd = 'git push';
      if (options.force) cmd += ' --force';
      if (options.forceLease) cmd += ' --force-with-lease';
      if (options.setUpstream) cmd += ' --set-upstream';
      if (options.tags) cmd += ' --tags';
      if (options.remote) cmd += ` ${options.remote}`;
      if (options.branch) cmd += ` ${options.branch}`;

      await execAsync(cmd, { cwd });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(
    remote: string = 'origin',
    branch?: string,
    rebase: boolean = false,
    repoPath?: string
  ): Promise<{ success: boolean; updated: boolean; conflicts: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, updated: false, conflicts: false, error: 'No repository set' };

    try {
      let cmd = `git pull${rebase ? ' --rebase' : ''} ${remote}`;
      if (branch) cmd += ` ${branch}`;

      const { stdout } = await execAsync(cmd, { cwd });
      
      const updated = !stdout.includes('Already up to date');
      return { success: true, updated, conflicts: false };
    } catch (error: any) {
      const isConflict = error.message.includes('CONFLICT') || error.message.includes('Automatic merge failed');
      return { 
        success: false, 
        updated: false, 
        conflicts: isConflict,
        error: error.message 
      };
    }
  }

  /**
   * Fetch from remote
   */
  async fetch(
    remote: string = 'origin',
    prune: boolean = true,
    repoPath?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      let cmd = `git fetch ${remote}`;
      if (prune) cmd += ' --prune';
      await execAsync(cmd, { cwd });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(
    branchName: string,
    checkout: boolean = true,
    startPoint?: string,
    repoPath?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      let cmd = checkout ? 'git checkout -b' : 'git branch';
      cmd += ` ${branchName}`;
      if (startPoint) cmd += ` ${startPoint}`;
      
      await execAsync(cmd, { cwd });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Switch to a branch
   */
  async checkout(
    branchName: string,
    repoPath?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      await execAsync(`git checkout ${branchName}`, { cwd });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(
    branchName: string,
    force: boolean = false,
    remote: boolean = false,
    repoPath?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      if (remote) {
        await execAsync(`git push origin --delete ${branchName}`, { cwd });
      } else {
        const flag = force ? '-D' : '-d';
        await execAsync(`git branch ${flag} ${branchName}`, { cwd });
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge a branch
   */
  async merge(
    branchName: string,
    options: GitMergeOptions = {},
    repoPath?: string
  ): Promise<{ success: boolean; conflicts: MergeConflict[]; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, conflicts: [], error: 'No repository set' };

    try {
      let cmd = `git merge ${branchName}`;
      if (options.noFastForward) cmd += ' --no-ff';
      if (options.squash) cmd += ' --squash';
      if (options.commit === false) cmd += ' --no-commit';
      if (options.message) cmd += ` -m "${options.message.replace(/"/g, '\\"')}"`;

      await execAsync(cmd, { cwd });
      return { success: true, conflicts: [] };
    } catch (error: any) {
      if (error.message.includes('CONFLICT')) {
        const conflicts = await this.getConflicts(cwd);
        return { success: false, conflicts, error: 'Merge conflicts detected' };
      }
      return { success: false, conflicts: [], error: error.message };
    }
  }

  /**
   * Rebase onto another branch
   */
  async rebase(
    onto: string,
    options: GitRebaseOptions = {},
    repoPath?: string
  ): Promise<{ success: boolean; conflicts: MergeConflict[]; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, conflicts: [], error: 'No repository set' };

    try {
      if (options.abort) {
        await execAsync('git rebase --abort', { cwd });
        return { success: true, conflicts: [] };
      }
      
      if (options.continue) {
        await execAsync('git rebase --continue', { cwd });
        return { success: true, conflicts: [] };
      }

      let cmd = 'git rebase';
      if (options.interactive) cmd += ' -i';
      if (options.autosquash) cmd += ' --autosquash';
      if (options.onto) cmd += ` --onto ${options.onto}`;
      cmd += ` ${onto}`;

      await execAsync(cmd, { cwd });
      return { success: true, conflicts: [] };
    } catch (error: any) {
      if (error.message.includes('CONFLICT')) {
        const conflicts = await this.getConflicts(cwd);
        return { success: false, conflicts, error: 'Rebase conflicts detected' };
      }
      return { success: false, conflicts: [], error: error.message };
    }
  }

  /**
   * Get merge/rebase conflicts
   */
  async getConflicts(repoPath?: string): Promise<MergeConflict[]> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return [];

    const conflicts: MergeConflict[] = [];

    try {
      // Get list of conflicted files
      const { stdout } = await execAsync('git diff --name-only --diff-filter=U', { cwd });
      const files = stdout.trim().split('\n').filter(Boolean);

      for (const file of files) {
        const conflict: MergeConflict = {
          file,
          conflictType: 'content',
        };

        // Read file content to extract conflict markers
        try {
          const filePath = path.join(cwd, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          
          const markers: MergeConflict['conflictMarkers'] = [];
          let currentMarker: { startLine: number; midLine: number; endLine: number } | null = null;

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('<<<<<<<')) {
              currentMarker = { startLine: i + 1, midLine: 0, endLine: 0 };
            } else if (lines[i].startsWith('=======') && currentMarker) {
              currentMarker.midLine = i + 1;
            } else if (lines[i].startsWith('>>>>>>>') && currentMarker) {
              currentMarker.endLine = i + 1;
              markers.push(currentMarker);
              currentMarker = null;
            }
          }

          if (markers.length > 0) {
            conflict.conflictMarkers = markers;
          }

          // Extract our vs their version for the first conflict
          if (markers.length > 0) {
            const first = markers[0];
            const ourLines = lines.slice(first.startLine, first.midLine - 1);
            const theirLines = lines.slice(first.midLine, first.endLine - 1);
            conflict.ourVersion = ourLines.join('\n');
            conflict.theirVersion = theirLines.join('\n');
          }
        } catch {
          // File might have been deleted
          conflict.conflictType = 'delete_modify';
        }

        conflicts.push(conflict);
      }
    } catch (error) {
      // No conflicts
    }

    return conflicts;
  }

  /**
   * Resolve a merge conflict
   */
  async resolveConflict(
    resolution: ConflictResolution,
    repoPath?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      const filePath = path.join(cwd, resolution.file);

      switch (resolution.resolution) {
        case 'ours':
          await execAsync(`git checkout --ours "${resolution.file}"`, { cwd });
          await execAsync(`git add "${resolution.file}"`, { cwd });
          break;
        case 'theirs':
          await execAsync(`git checkout --theirs "${resolution.file}"`, { cwd });
          await execAsync(`git add "${resolution.file}"`, { cwd });
          break;
        case 'manual':
          if (!resolution.manualContent) {
            return { success: false, error: 'Manual content required for manual resolution' };
          }
          await fs.writeFile(filePath, resolution.manualContent, 'utf-8');
          await execAsync(`git add "${resolution.file}"`, { cwd });
          break;
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Abort an in-progress merge
   */
  async abortMerge(repoPath?: string): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      await execAsync('git merge --abort', { cwd });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get commit log
   */
  async getLog(
    count: number = 10,
    branch?: string,
    repoPath?: string
  ): Promise<Array<{ sha: string; message: string; author: string; date: string }>> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return [];

    try {
      let cmd = `git log -${count} --format="%H%n%s%n%an%n%aI%n---"`;
      if (branch) cmd += ` ${branch}`;
      
      const { stdout } = await execAsync(cmd, { cwd });
      const entries = stdout.split('---\n').filter(Boolean);
      
      return entries.map(entry => {
        const [sha, message, author, date] = entry.trim().split('\n');
        return { sha, message, author, date };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get diff between refs
   */
  async getDiff(
    fromRef: string,
    toRef: string = 'HEAD',
    files?: string[],
    repoPath?: string
  ): Promise<string> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return '';

    try {
      let cmd = `git diff ${fromRef}..${toRef}`;
      if (files && files.length > 0) {
        cmd += ` -- ${files.map(f => `"${f}"`).join(' ')}`;
      }
      
      const { stdout } = await execAsync(cmd, { cwd });
      return stdout;
    } catch {
      return '';
    }
  }

  /**
   * Stash changes
   */
  async stash(
    message?: string,
    includeUntracked: boolean = true,
    repoPath?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      let cmd = 'git stash push';
      if (includeUntracked) cmd += ' --include-untracked';
      if (message) cmd += ` -m "${message}"`;
      
      await execAsync(cmd, { cwd });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Pop stash
   */
  async stashPop(repoPath?: string): Promise<{ success: boolean; conflicts: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, conflicts: false, error: 'No repository set' };

    try {
      await execAsync('git stash pop', { cwd });
      return { success: true, conflicts: false };
    } catch (error: any) {
      const hasConflicts = error.message.includes('CONFLICT');
      return { success: false, conflicts: hasConflicts, error: error.message };
    }
  }

  /**
   * Cherry-pick a commit
   */
  async cherryPick(
    sha: string,
    repoPath?: string
  ): Promise<{ success: boolean; conflicts: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, conflicts: false, error: 'No repository set' };

    try {
      await execAsync(`git cherry-pick ${sha}`, { cwd });
      return { success: true, conflicts: false };
    } catch (error: any) {
      const hasConflicts = error.message.includes('CONFLICT');
      return { success: false, conflicts: hasConflicts, error: error.message };
    }
  }

  /**
   * Reset to a specific commit
   */
  async reset(
    ref: string,
    mode: 'soft' | 'mixed' | 'hard' = 'mixed',
    repoPath?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      await execAsync(`git reset --${mode} ${ref}`, { cwd });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current repo path
   */
  getRepoPath(): string | null {
    return this.currentRepo;
  }

  /**
   * Set current repo path
   */
  setRepoPath(path: string): void {
    this.currentRepo = path;
  }

  /**
   * Clean workspace
   */
  async clean(
    force: boolean = true,
    directories: boolean = true,
    repoPath?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cwd = repoPath || this.currentRepo;
    if (!cwd) return { success: false, error: 'No repository set' };

    try {
      let cmd = 'git clean';
      if (force) cmd += ' -f';
      if (directories) cmd += ' -d';
      
      await execAsync(cmd, { cwd });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * Enhanced GitHub Integration with PR review and CI capabilities
 */
export class GitHubWorkflowIntegration {
  private octokit: Octokit;
  private userId: string;
  
  constructor(octokit: Octokit, userId: string) {
    this.octokit = octokit;
    this.userId = userId;
  }

  /**
   * Get PR reviews
   */
  async getPRReviews(owner: string, repo: string, prNumber: number): Promise<PRReview[]> {
    try {
      const { data: reviews } = await this.octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
      });

      const result: PRReview[] = [];
      
      for (const review of reviews) {
        // Get review comments
        const { data: comments } = await this.octokit.rest.pulls.listCommentsForReview({
          owner,
          repo,
          pull_number: prNumber,
          review_id: review.id,
        });

        result.push({
          id: review.id,
          user: review.user?.login || 'unknown',
          state: review.state as PRReview['state'],
          body: review.body,
          submittedAt: review.submitted_at || '',
          comments: comments.map(c => ({
            id: c.id,
            path: c.path,
            line: c.line || c.original_line || 0,
            body: c.body,
            user: c.user?.login || 'unknown',
            createdAt: c.created_at,
            inReplyToId: c.in_reply_to_id,
          })),
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting PR reviews:', error);
      return [];
    }
  }

  /**
   * Get PR review comments (inline comments)
   */
  async getPRReviewComments(owner: string, repo: string, prNumber: number): Promise<PRReviewComment[]> {
    try {
      const { data: comments } = await this.octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: prNumber,
      });

      return comments.map(c => ({
        id: c.id,
        path: c.path,
        line: c.line || c.original_line || 0,
        body: c.body,
        user: c.user?.login || 'unknown',
        createdAt: c.created_at,
        inReplyToId: c.in_reply_to_id,
      }));
    } catch (error) {
      console.error('Error getting PR comments:', error);
      return [];
    }
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
    try {
      const { data } = await this.octokit.rest.pulls.createReplyForReviewComment({
        owner,
        repo,
        pull_number: prNumber,
        comment_id: commentId,
        body,
      });

      return { success: true, commentId: data.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a review with comments
   */
  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      body?: string;
      comments?: Array<{
        path: string;
        line: number;
        body: string;
        side?: 'LEFT' | 'RIGHT';
      }>;
    }
  ): Promise<{ success: boolean; reviewId?: number; error?: string }> {
    try {
      const { data } = await this.octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        event: options.event,
        body: options.body,
        comments: options.comments?.map(c => ({
          path: c.path,
          line: c.line,
          body: c.body,
          side: c.side,
        })),
      });

      return { success: true, reviewId: data.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Submit a pending review
   */
  async submitReview(
    owner: string,
    repo: string,
    prNumber: number,
    reviewId: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.octokit.rest.pulls.submitReview({
        owner,
        repo,
        pull_number: prNumber,
        review_id: reviewId,
        event,
        body,
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get CI workflow runs for a repo
   */
  async getWorkflowRuns(
    owner: string,
    repo: string,
    options?: {
      branch?: string;
      status?: 'queued' | 'in_progress' | 'completed';
      perPage?: number;
    }
  ): Promise<CIWorkflowRun[]> {
    try {
      const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch: options?.branch,
        status: options?.status,
        per_page: options?.perPage || 10,
      });

      const runs: CIWorkflowRun[] = [];
      
      for (const run of data.workflow_runs) {
        // Get jobs for each run
        const { data: jobsData } = await this.octokit.rest.actions.listJobsForWorkflowRun({
          owner,
          repo,
          run_id: run.id,
        });

        runs.push({
          id: run.id,
          name: run.name || 'unknown',
          status: run.status as CIWorkflowRun['status'],
          conclusion: run.conclusion as CIWorkflowRun['conclusion'],
          headSha: run.head_sha,
          branch: run.head_branch || '',
          event: run.event,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
          htmlUrl: run.html_url,
          jobs: jobsData.jobs.map(job => ({
            id: job.id,
            name: job.name,
            status: job.status,
            conclusion: job.conclusion,
            startedAt: job.started_at || '',
            completedAt: job.completed_at,
            steps: (job.steps || []).map(step => ({
              name: step.name,
              status: step.status,
              conclusion: step.conclusion || null,
              number: step.number,
            })),
          })),
        });
      }

      return runs;
    } catch (error) {
      console.error('Error getting workflow runs:', error);
      return [];
    }
  }

  /**
   * Get workflow run logs
   */
  async getWorkflowRunLogs(
    owner: string,
    repo: string,
    runId: number
  ): Promise<{ success: boolean; logs?: string; error?: string }> {
    try {
      // Get jobs first for structured info
      const { data: jobsData } = await this.octokit.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });

      let logs = `Workflow Run ${runId} Logs:\n\n`;
      
      for (const job of jobsData.jobs) {
        logs += `=== Job: ${job.name} ===\n`;
        logs += `Status: ${job.status}\n`;
        logs += `Conclusion: ${job.conclusion || 'pending'}\n\n`;
        
        for (const step of job.steps || []) {
          const icon = step.conclusion === 'success' ? '✓' : step.conclusion === 'failure' ? '✗' : '○';
          logs += `  ${icon} ${step.name} (${step.status}${step.conclusion ? `: ${step.conclusion}` : ''})\n`;
        }
        logs += '\n';
      }

      return { success: true, logs };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get failed workflow details for debugging
   */
  async getFailedWorkflowDetails(
    owner: string,
    repo: string,
    runId: number
  ): Promise<{
    failedJobs: Array<{
      name: string;
      failedStep: { name: string; number: number } | null;
      logs?: string;
    }>;
    summary: string;
  }> {
    try {
      const { data: jobsData } = await this.octokit.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });

      const failedJobs = jobsData.jobs
        .filter(job => job.conclusion === 'failure')
        .map(job => {
          const failedStep = (job.steps || []).find(s => s.conclusion === 'failure');
          return {
            name: job.name,
            failedStep: failedStep ? { name: failedStep.name, number: failedStep.number } : null,
          };
        });

      let summary = failedJobs.length === 0 
        ? 'No failed jobs found'
        : `${failedJobs.length} job(s) failed:\n` + 
          failedJobs.map(j => `- ${j.name}: Failed at step "${j.failedStep?.name || 'unknown'}"`).join('\n');

      return { failedJobs, summary };
    } catch (error) {
      return { failedJobs: [], summary: 'Error fetching workflow details' };
    }
  }

  /**
   * Re-run a failed workflow
   */
  async rerunWorkflow(
    owner: string,
    repo: string,
    runId: number,
    failedOnly: boolean = true
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (failedOnly) {
        await this.octokit.rest.actions.reRunWorkflowFailedJobs({
          owner,
          repo,
          run_id: runId,
        });
      } else {
        await this.octokit.rest.actions.reRunWorkflow({
          owner,
          repo,
          run_id: runId,
        });
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel a workflow run
   */
  async cancelWorkflow(
    owner: string,
    repo: string,
    runId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.octokit.rest.actions.cancelWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for a workflow to complete
   */
  async waitForWorkflow(
    owner: string,
    repo: string,
    runId: number,
    timeoutMs: number = 300000, // 5 minutes
    pollIntervalMs: number = 10000 // 10 seconds
  ): Promise<{ completed: boolean; conclusion: string | null; timedOut: boolean }> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const { data: run } = await this.octokit.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });

      if (run.status === 'completed') {
        return { completed: true, conclusion: run.conclusion, timedOut: false };
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    return { completed: false, conclusion: null, timedOut: true };
  }

  /**
   * Get checks for a commit
   */
  async getCommitChecks(
    owner: string,
    repo: string,
    ref: string
  ): Promise<Array<{
    name: string;
    status: string;
    conclusion: string | null;
    output: { title: string | null; summary: string | null };
  }>> {
    try {
      const { data } = await this.octokit.rest.checks.listForRef({
        owner,
        repo,
        ref,
      });

      return data.check_runs.map(check => ({
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        output: {
          title: check.output.title,
          summary: check.output.summary,
        },
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Update PR with changes based on review feedback
   */
  async updatePRFromReview(
    owner: string,
    repo: string,
    prNumber: number,
    changes: Array<{ path: string; content: string }>,
    commitMessage: string
  ): Promise<{ success: boolean; sha?: string; error?: string }> {
    try {
      // Get PR details
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const branch = pr.head.ref;

      // Get the current tree SHA
      const { data: ref } = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      const currentCommitSha = ref.object.sha;

      const { data: currentCommit } = await this.octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: currentCommitSha,
      });

      // Create blobs for each file
      const treeItems: Array<{
        path: string;
        mode: '100644';
        type: 'blob';
        sha: string;
      }> = [];

      for (const change of changes) {
        const { data: blob } = await this.octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(change.content).toString('base64'),
          encoding: 'base64',
        });

        treeItems.push({
          path: change.path,
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        });
      }

      // Create new tree
      const { data: tree } = await this.octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: currentCommit.tree.sha,
        tree: treeItems,
      });

      // Create commit
      const { data: commit } = await this.octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage,
        tree: tree.sha,
        parents: [currentCommitSha],
      });

      // Update branch reference
      await this.octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: commit.sha,
      });

      return { success: true, sha: commit.sha };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get PR files changed
   */
  async getPRFiles(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Array<{
    filename: string;
    status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>> {
    try {
      const { data } = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
      });

      return data.map(f => ({
        filename: f.filename,
        status: f.status as any,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
      }));
    } catch (error) {
      return [];
    }
  }
}

// Singleton instances
let gitWorkflowManager: GitWorkflowManager | null = null;

export function getGitWorkflowManager(workspaceRoot?: string): GitWorkflowManager {
  if (!gitWorkflowManager) {
    gitWorkflowManager = new GitWorkflowManager(workspaceRoot);
  }
  return gitWorkflowManager;
}

export function createGitHubWorkflowIntegration(
  octokit: Octokit,
  userId: string
): GitHubWorkflowIntegration {
  return new GitHubWorkflowIntegration(octokit, userId);
}
