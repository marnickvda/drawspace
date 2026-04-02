import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { validatePath } from '../../src/main/ipc/pathSecurity'
import { mkdtemp, mkdir, symlink, writeFile, rm, realpath } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

let workspaceRoot: string // as passed by user (may contain symlinks)
let realWorkspaceRoot: string // canonical path after realpath
let tempDir: string

beforeAll(async () => {
  // Create a real temp workspace for testing
  tempDir = await mkdtemp(join(tmpdir(), 'drawspace-test-'))
  workspaceRoot = join(tempDir, 'workspace')
  await mkdir(workspaceRoot, { recursive: true })
  await mkdir(join(workspaceRoot, 'subdir'), { recursive: true })
  await writeFile(join(workspaceRoot, 'test.excalidraw'), '{}')
  await writeFile(join(workspaceRoot, 'subdir', 'nested.excalidraw'), '{}')

  // Resolve canonical path (macOS: /tmp -> /private/tmp)
  realWorkspaceRoot = await realpath(workspaceRoot)

  // Create a directory outside workspace for symlink tests
  await mkdir(join(tempDir, 'outside'), { recursive: true })
  await writeFile(join(tempDir, 'outside', 'secret.txt'), 'secret')

  // Create a symlink inside workspace that points outside
  await symlink(
    join(tempDir, 'outside'),
    join(workspaceRoot, 'escape-link')
  )
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('validatePath', () => {
  it('allows a normal relative path to an existing file', async () => {
    const result = await validatePath('test.excalidraw', workspaceRoot)
    expect(result).toBe(join(realWorkspaceRoot, 'test.excalidraw'))
  })

  it('allows a nested relative path', async () => {
    const result = await validatePath('subdir/nested.excalidraw', workspaceRoot)
    expect(result).toBe(join(realWorkspaceRoot, 'subdir', 'nested.excalidraw'))
  })

  it('allows a path to a file that does not exist yet (create scenario)', async () => {
    const result = await validatePath('subdir/new-file.excalidraw', workspaceRoot)
    expect(result).toBe(join(realWorkspaceRoot, 'subdir', 'new-file.excalidraw'))
  })

  it('rejects ../ traversal', async () => {
    await expect(
      validatePath('../outside/secret.txt', workspaceRoot)
    ).rejects.toThrow('Path escapes workspace')
  })

  it('rejects deeply nested ../ traversal', async () => {
    await expect(
      validatePath('subdir/../../outside/secret.txt', workspaceRoot)
    ).rejects.toThrow('Path escapes workspace')
  })

  it('rejects symlink escapes', async () => {
    await expect(
      validatePath('escape-link/secret.txt', workspaceRoot)
    ).rejects.toThrow('Path escapes workspace')
  })

  it('rejects absolute paths outside workspace', async () => {
    await expect(
      validatePath('/etc/passwd', workspaceRoot)
    ).rejects.toThrow()
  })

  it('rejects when parent directory does not exist', async () => {
    await expect(
      validatePath('nonexistent-dir/file.excalidraw', workspaceRoot)
    ).rejects.toThrow('Parent directory does not exist')
  })

  it('allows the workspace root itself (empty relative path resolves to root)', async () => {
    const result = await validatePath('.', workspaceRoot)
    expect(result).toBe(realWorkspaceRoot)
  })
})
