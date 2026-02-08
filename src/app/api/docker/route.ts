import { NextRequest, NextResponse } from 'next/server';
import { getDockerManager, DockerWorkspace, DockerExecResult } from '@/lib/dockerManager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;
    const dockerManager = await getDockerManager();

    if (!dockerManager.isAvailable()) {
      return NextResponse.json(
        { error: 'Docker is not available on this system' },
        { status: 503 }
      );
    }

    switch (action) {
      case 'create': {
        // Create a new Docker workspace from a host path
        const { hostPath, name, image, ports, env, installDeps } = params;
        if (!hostPath) {
          return NextResponse.json({ error: 'hostPath is required' }, { status: 400 });
        }
        const workspace = await dockerManager.createWorkspace(hostPath, {
          name,
          image,
          ports,
          env,
          installDeps,
        });
        return NextResponse.json({ workspace });
      }

      case 'activate': {
        // Set a Docker workspace as active
        const { workspaceId } = params;
        if (!workspaceId) {
          return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        const workspace = dockerManager.setActiveWorkspace(workspaceId);
        return NextResponse.json({ workspace });
      }

      case 'exec': {
        // Execute command in a Docker container
        const { workspaceId, command, workDir } = params;
        if (!workspaceId && !dockerManager.getActiveWorkspace()) {
          return NextResponse.json({ error: 'workspaceId is required or set an active workspace' }, { status: 400 });
        }
        if (!command) {
          return NextResponse.json({ error: 'command is required' }, { status: 400 });
        }
        
        const workspace = workspaceId 
          ? dockerManager.getWorkspace(workspaceId)
          : dockerManager.getActiveWorkspace();
        
        if (!workspace) {
          return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        const result = await dockerManager.execInContainer(
          workspace.containerId,
          command,
          workDir || workspace.workspaceDir
        );
        return NextResponse.json({ result, workspace });
      }

      case 'read-file': {
        // Read file from Docker container
        const { workspaceId, filePath } = params;
        if (!filePath) {
          return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
        }
        
        const workspace = workspaceId 
          ? dockerManager.getWorkspace(workspaceId)
          : dockerManager.getActiveWorkspace();
        
        if (!workspace) {
          return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        const content = await dockerManager.readFile(workspace.containerId, filePath);
        return NextResponse.json({ content });
      }

      case 'write-file': {
        // Write file in Docker container
        const { workspaceId, filePath, content } = params;
        if (!filePath || content === undefined) {
          return NextResponse.json({ error: 'filePath and content are required' }, { status: 400 });
        }
        
        const workspace = workspaceId 
          ? dockerManager.getWorkspace(workspaceId)
          : dockerManager.getActiveWorkspace();
        
        if (!workspace) {
          return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        await dockerManager.writeFile(workspace.containerId, filePath, content);
        return NextResponse.json({ success: true });
      }

      case 'test': {
        // Run tests in Docker container
        const { workspaceId, testCommand } = params;
        
        const workspace = workspaceId 
          ? dockerManager.getWorkspace(workspaceId)
          : dockerManager.getActiveWorkspace();
        
        if (!workspace) {
          return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        const result = await dockerManager.runTests(workspace.id, testCommand);
        return NextResponse.json({ result });
      }

      case 'build': {
        // Run build in Docker container
        const { workspaceId, buildCommand } = params;
        
        const workspace = workspaceId 
          ? dockerManager.getWorkspace(workspaceId)
          : dockerManager.getActiveWorkspace();
        
        if (!workspace) {
          return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        const result = await dockerManager.runBuild(workspace.id, buildCommand);
        return NextResponse.json({ result });
      }

      case 'install': {
        // Install package in Docker container
        const { workspaceId, packageName } = params;
        if (!packageName) {
          return NextResponse.json({ error: 'packageName is required' }, { status: 400 });
        }
        
        const workspace = workspaceId 
          ? dockerManager.getWorkspace(workspaceId)
          : dockerManager.getActiveWorkspace();
        
        if (!workspace) {
          return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        const result = await dockerManager.installPackage(workspace.id, packageName);
        return NextResponse.json({ result });
      }

      case 'start': {
        // Start a stopped Docker workspace
        const { workspaceId } = params;
        if (!workspaceId) {
          return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        await dockerManager.startWorkspace(workspaceId);
        return NextResponse.json({ success: true });
      }

      case 'stop': {
        // Stop a running Docker workspace
        const { workspaceId } = params;
        if (!workspaceId) {
          return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        await dockerManager.stopWorkspace(workspaceId);
        return NextResponse.json({ success: true });
      }

      case 'remove': {
        // Remove a Docker workspace
        const { workspaceId } = params;
        if (!workspaceId) {
          return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        await dockerManager.removeWorkspace(workspaceId);
        return NextResponse.json({ success: true });
      }

      case 'logs': {
        // Get container logs
        const { workspaceId, tail } = params;
        if (!workspaceId) {
          return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        const logs = await dockerManager.getLogs(workspaceId, tail);
        return NextResponse.json({ logs });
      }

      case 'stats': {
        // Get container resource usage stats
        const { workspaceId } = params;
        if (!workspaceId) {
          return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        const stats = await dockerManager.getStats(workspaceId);
        return NextResponse.json({ stats });
      }

      case 'copy-to': {
        // Copy file from host to container
        const { workspaceId, hostPath, containerPath } = params;
        if (!hostPath || !containerPath) {
          return NextResponse.json({ error: 'hostPath and containerPath are required' }, { status: 400 });
        }
        
        const workspace = workspaceId 
          ? dockerManager.getWorkspace(workspaceId)
          : dockerManager.getActiveWorkspace();
        
        if (!workspace) {
          return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        await dockerManager.copyToContainer(workspace.containerId, hostPath, containerPath);
        return NextResponse.json({ success: true });
      }

      case 'copy-from': {
        // Copy file from container to host
        const { workspaceId, containerPath, hostPath } = params;
        if (!hostPath || !containerPath) {
          return NextResponse.json({ error: 'hostPath and containerPath are required' }, { status: 400 });
        }
        
        const workspace = workspaceId 
          ? dockerManager.getWorkspace(workspaceId)
          : dockerManager.getActiveWorkspace();
        
        if (!workspace) {
          return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        await dockerManager.copyFromContainer(workspace.containerId, containerPath, hostPath);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Docker API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const dockerManager = await getDockerManager();
    
    const isAvailable = dockerManager.isAvailable();
    const workspaces = dockerManager.listWorkspaces();
    const activeWorkspace = dockerManager.getActiveWorkspace();

    return NextResponse.json({
      available: isAvailable,
      workspaces: workspaces.map(w => ({
        id: w.id,
        name: w.containerName,
        image: w.image,
        status: w.status,
        mountPath: w.mountPath,
        projectType: w.projectType,
        ports: w.ports,
        createdAt: w.createdAt,
      })),
      activeWorkspace: activeWorkspace ? {
        id: activeWorkspace.id,
        containerId: activeWorkspace.containerId,
        image: activeWorkspace.image,
        status: activeWorkspace.status,
        mountPath: activeWorkspace.mountPath,
        workspaceDir: activeWorkspace.workspaceDir,
        projectType: activeWorkspace.projectType,
      } : null,
      capabilities: [
        'create',
        'activate',
        'exec',
        'read-file',
        'write-file',
        'test',
        'build',
        'install',
        'start',
        'stop',
        'remove',
        'logs',
        'stats',
        'copy-to',
        'copy-from',
      ],
    });
  } catch (error: any) {
    console.error('Docker API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
