/**
 * Workspace IPC handlers.
 *
 * Manages workspace lifecycle: open, create, persist config/session,
 * track recent workspaces, and scan the file tree.
 *
 * All workspace metadata lives inside `.drawspace/`:
 *   - `.drawspace/config.json`  — workspace config (git-tracked)
 *   - `.drawspace/state.json`   — session state (gitignored)
 *   - `.drawspace/thumbnails/`  — drawing thumbnails (gitignored)
 */

import { ipcMain, app } from 'electron'
import {
  readFile,
  writeFile,
  mkdir,
  access
} from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { setWorkspaceRoot } from './fileSystem'
import { scanTree } from './fileTree'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_FILE = '.drawspace/config.json'
const STATE_DIR = '.drawspace'
const STATE_FILE = '.drawspace/state.json'
const THUMBNAILS_DIR = '.drawspace/thumbnails'
const RECENT_FILE = 'recent-workspaces.json'

const GITIGNORE_CONTENT = `# Drawspace session state (volatile, safe to lose)
.drawspace/state.json
.drawspace/thumbnails/
`

// ---------------------------------------------------------------------------
// Inline types (cannot import from renderer)
// ---------------------------------------------------------------------------

interface WorkspaceConfig {
  name: string
  version: string
  created: string
  settings: {
    theme: string
    autoSaveInterval: number
    defaultGridMode: boolean
    defaultZenMode: boolean
  }
  collections: Array<{ name: string; path: string; color: string }>
}

interface SessionState {
  activeFile: string | null
  recentFiles: string[]
  sidebarWidth: number
  sidebarCollapsed: boolean
  expandedFolders: string[]
  dashboardView: 'grid' | 'list'
  dashboardSort: 'name' | 'modified' | 'created'
}

interface RecentWorkspace {
  name: string
  path: string
  lastOpened: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SESSION: SessionState = {
  activeFile: null,
  recentFiles: [],
  sidebarWidth: 260,
  sidebarCollapsed: false,
  expandedFolders: [],
  dashboardView: 'grid',
  dashboardSort: 'modified'
}

function createDefaultConfig(name: string): WorkspaceConfig {
  return {
    name,
    version: '1.0.0',
    created: new Date().toISOString(),
    settings: {
      theme: 'system',
      autoSaveInterval: 3000,
      defaultGridMode: false,
      defaultZenMode: false
    },
    collections: []
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recentFilePath(): string {
  return join(app.getPath('userData'), RECENT_FILE)
}

/** Atomic write: write to tmp then rename. */
async function atomicWriteJson(absPath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  const tmpPath = `${absPath}.${randomUUID()}.tmp`
  await writeFile(tmpPath, content, 'utf-8')
  const { rename } = await import('fs/promises')
  await rename(tmpPath, absPath)
}

/** Try to read and parse JSON, return null on any failure. */
async function readJsonSafe<T>(absPath: string): Promise<T | null> {
  try {
    const raw = await readFile(absPath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Check if a path exists. */
async function pathExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Recent workspaces persistence
// ---------------------------------------------------------------------------

async function loadRecent(): Promise<RecentWorkspace[]> {
  return (await readJsonSafe<RecentWorkspace[]>(recentFilePath())) ?? []
}

async function saveRecent(recents: RecentWorkspace[]): Promise<void> {
  await atomicWriteJson(recentFilePath(), recents)
}

// ---------------------------------------------------------------------------
// Register IPC handlers
// ---------------------------------------------------------------------------

export function registerWorkspaceHandlers(): void {
  /**
   * workspace:open — Open an existing workspace directory.
   * Reads .drawspace/config.json and .drawspace/state.json.
   * Sets the workspace root for file system operations.
   */
  ipcMain.handle('workspace:open', async (_event, dirPath: string) => {
    const configPath = join(dirPath, CONFIG_FILE)

    // Validate the directory has a .drawspace/config.json
    if (!(await pathExists(configPath))) {
      throw new Error(`Not a Drawspace workspace: ${dirPath} (missing ${CONFIG_FILE})`)
    }

    const config = await readJsonSafe<WorkspaceConfig>(configPath)
    if (!config) {
      throw new Error(`Failed to parse ${CONFIG_FILE} in ${dirPath}`)
    }

    // Read session state (may not exist — that's fine)
    const session =
      (await readJsonSafe<SessionState>(join(dirPath, STATE_FILE))) ?? {
        ...DEFAULT_SESSION
      }

    // Ensure .drawspace directory exists (may have been gitignored and cleaned)
    await mkdir(join(dirPath, STATE_DIR), { recursive: true })
    await mkdir(join(dirPath, THUMBNAILS_DIR), { recursive: true })

    // Set the workspace root so all fs:* handlers work
    setWorkspaceRoot(dirPath)

    return { config, session, rootPath: dirPath }
  })

  /**
   * workspace:create — Create a new workspace in the given directory.
   * Creates .drawspace/config.json, .drawspace/state.json,
   * .drawspace/thumbnails/, and a .gitignore if one doesn't exist.
   */
  ipcMain.handle(
    'workspace:create',
    async (_event, dirPath: string, name: string) => {
      const configPath = join(dirPath, CONFIG_FILE)

      // Don't overwrite an existing workspace
      if (await pathExists(configPath)) {
        throw new Error(`A workspace already exists at ${dirPath}`)
      }

      // Create directory structure
      await mkdir(join(dirPath, STATE_DIR), { recursive: true })
      await mkdir(join(dirPath, THUMBNAILS_DIR), { recursive: true })

      // Write default config
      const config = createDefaultConfig(name)
      await atomicWriteJson(configPath, config)

      // Write default session
      const session = { ...DEFAULT_SESSION }
      await atomicWriteJson(join(dirPath, STATE_FILE), session)

      // Create .gitignore if one doesn't already exist
      const gitignorePath = join(dirPath, '.gitignore')
      if (!(await pathExists(gitignorePath))) {
        await writeFile(gitignorePath, GITIGNORE_CONTENT, 'utf-8')
      }

      // Set the workspace root
      setWorkspaceRoot(dirPath)

      return { config, session, rootPath: dirPath }
    }
  )

  /**
   * workspace:saveConfig — Write .drawspace/config.json (infrequent).
   */
  ipcMain.handle(
    'workspace:saveConfig',
    async (_event, dirPath: string, config: WorkspaceConfig) => {
      // Ensure .drawspace dir exists
      await mkdir(join(dirPath, STATE_DIR), { recursive: true })
      await atomicWriteJson(join(dirPath, CONFIG_FILE), config)
    }
  )

  /**
   * workspace:saveSession — Write .drawspace/state.json (frequent, debounced on renderer side).
   */
  ipcMain.handle(
    'workspace:saveSession',
    async (_event, dirPath: string, session: SessionState) => {
      // Ensure .drawspace dir exists
      await mkdir(join(dirPath, STATE_DIR), { recursive: true })
      await atomicWriteJson(join(dirPath, STATE_FILE), session)
    }
  )

  /**
   * workspace:getRecent — Read the recent workspaces list.
   */
  ipcMain.handle('workspace:getRecent', async () => {
    return loadRecent()
  })

  /**
   * workspace:addRecent — Add/update a workspace in the recent list.
   * Deduplicates by path, moves to front, caps at 20.
   */
  ipcMain.handle(
    'workspace:addRecent',
    async (_event, entry: RecentWorkspace) => {
      const recents = await loadRecent()
      // Remove existing entry for this path
      const filtered = recents.filter((r) => r.path !== entry.path)
      // Prepend the new entry
      filtered.unshift({
        name: entry.name,
        path: entry.path,
        lastOpened: new Date().toISOString()
      })
      // Cap at 20
      const capped = filtered.slice(0, 20)
      await saveRecent(capped)
      return capped
    }
  )

  /**
   * workspace:removeRecent — Remove a workspace from the recent list.
   */
  ipcMain.handle('workspace:removeRecent', async (_event, path: string) => {
    const recents = await loadRecent()
    const filtered = recents.filter((r) => r.path !== path)
    await saveRecent(filtered)
    return filtered
  })

  /**
   * workspace:scanFiles — Recursive scan of workspace directory.
   * Returns FileNode[] tree filtered to .excalidraw files.
   */
  ipcMain.handle('workspace:scanFiles', async (_event, dirPath: string) => {
    return scanTree(dirPath, '')
  })
}
