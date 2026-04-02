/**
 * File system IPC handlers.
 *
 * Every handler calls `validatePath()` before any `fs` operation. No exceptions.
 * Writes are atomic (write to .tmp then rename) to prevent corruption on crash.
 */

import { ipcMain } from 'electron'
import {
  readFile,
  writeFile,
  mkdir,
  rename as fsRename,
  stat as fsStat
} from 'fs/promises'
import { shell } from 'electron'
import { validatePath } from './pathSecurity'
import { randomUUID } from 'crypto'
import { scanTree } from './fileTree'

let workspaceRoot: string | null = null

export function setWorkspaceRoot(root: string | null): void {
  workspaceRoot = root
}

export function getWorkspaceRoot(): string | null {
  return workspaceRoot
}

function requireWorkspace(): string {
  if (!workspaceRoot) {
    throw new Error('No workspace is open')
  }
  return workspaceRoot
}

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

async function atomicWrite(absPath: string, data: string | Buffer): Promise<void> {
  const tmpPath = `${absPath}.${randomUUID()}.tmp`
  await writeFile(tmpPath, data)
  await fsRename(tmpPath, absPath)
}

// ---------------------------------------------------------------------------
// Register IPC handlers
// ---------------------------------------------------------------------------

export function registerFileSystemHandlers(): void {
  // --- Text read/write ---

  ipcMain.handle('fs:readFile', async (_event, relativePath: string) => {
    const root = requireWorkspace()
    const absPath = await validatePath(relativePath, root)
    return readFile(absPath, 'utf-8')
  })

  ipcMain.handle(
    'fs:writeFile',
    async (_event, relativePath: string, content: string) => {
      const root = requireWorkspace()
      const absPath = await validatePath(relativePath, root)
      await atomicWrite(absPath, content)
    }
  )

  // --- Binary read/write ---

  ipcMain.handle('fs:readBinary', async (_event, relativePath: string) => {
    const root = requireWorkspace()
    const absPath = await validatePath(relativePath, root)
    const buffer = await readFile(absPath)
    return new Uint8Array(buffer)
  })

  ipcMain.handle(
    'fs:writeBinary',
    async (_event, relativePath: string, data: Uint8Array) => {
      const root = requireWorkspace()
      const absPath = await validatePath(relativePath, root)
      await atomicWrite(absPath, Buffer.from(data))
    }
  )

  // --- Directory operations ---

  ipcMain.handle('fs:readDir', async (_event, relativePath?: string) => {
    const root = requireWorkspace()
    const dirAbs = relativePath
      ? await validatePath(relativePath, root)
      : root
    const relBase = relativePath ?? ''
    return scanTree(dirAbs, relBase)
  })

  ipcMain.handle('fs:mkdir', async (_event, relativePath: string) => {
    const root = requireWorkspace()
    const absPath = await validatePath(relativePath, root)
    await mkdir(absPath, { recursive: true })
  })

  ipcMain.handle(
    'fs:rename',
    async (_event, oldRelPath: string, newRelPath: string) => {
      const root = requireWorkspace()
      const oldAbs = await validatePath(oldRelPath, root)
      const newAbs = await validatePath(newRelPath, root)
      await fsRename(oldAbs, newAbs)
    }
  )

  ipcMain.handle('fs:delete', async (_event, relativePath: string) => {
    const root = requireWorkspace()
    const absPath = await validatePath(relativePath, root)
    // Move to OS trash — never permanent delete
    await shell.trashItem(absPath)
  })

  ipcMain.handle('fs:exists', async (_event, relativePath: string) => {
    const root = requireWorkspace()
    try {
      const absPath = await validatePath(relativePath, root)
      await fsStat(absPath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:stat', async (_event, relativePath: string) => {
    const root = requireWorkspace()
    const absPath = await validatePath(relativePath, root)
    const s = await fsStat(absPath)
    return {
      size: s.size,
      mtimeMs: s.mtimeMs,
      isDirectory: s.isDirectory()
    }
  })

  // --- Shell ---

  ipcMain.on('shell:showItemInFolder', (_event, relativePath: string) => {
    const root = requireWorkspace()
    validatePath(relativePath, root)
      .then((absPath) => shell.showItemInFolder(absPath))
      .catch((err) => console.error('showItemInFolder blocked:', err))
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })
}
