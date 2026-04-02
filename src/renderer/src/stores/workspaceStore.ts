/**
 * Workspace store — manages the current workspace state and active file.
 *
 * State:
 *   config      — parsed .drawspace/config.json (WorkspaceConfig)
 *   session     — parsed .drawspace/state.json (SessionState)
 *   rootPath    — absolute path to workspace root
 *   fileTree    — FileNode[] tree of .excalidraw files
 *   isLoading   — loading indicator
 *   error       — error message (null when OK)
 *
 * Active file state (replaces the old tab system):
 *   activeFile  — relative path of the currently open file (null = dashboard)
 *   isDirty     — whether the active file has unsaved changes
 *   saveStatus  — save status for the active file
 *
 * Computed:
 *   isOpen      — rootPath !== null
 *
 * Session state writes are debounced (5s) to avoid thrashing the disk.
 */

import { create } from 'zustand'
import type { FileNode } from '@/types/ipc'
import type {
  WorkspaceConfig,
  SessionState,
  RecentWorkspace
} from '@/types/workspace'
import * as ipc from '@/lib/ipc'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface WorkspaceState {
  config: WorkspaceConfig | null
  session: SessionState | null
  rootPath: string | null
  fileTree: FileNode[]
  recentWorkspaces: RecentWorkspace[]
  isLoading: boolean
  isFileTreeLoading: boolean
  error: string | null

  // Active file state (single-file model — replaces tabs)
  activeFile: string | null
  isDirty: boolean
  saveStatus: SaveStatus
}

interface WorkspaceActions {
  /** Open an existing workspace directory */
  openWorkspace: (dirPath: string) => Promise<void>
  /** Create a new workspace in a directory */
  createWorkspace: (dirPath: string, name: string) => Promise<void>
  /** Close the current workspace */
  closeWorkspace: () => void
  /** Re-scan the file tree */
  refreshFileTree: () => Promise<void>
  /** Partial update to workspace config (persists to disk) */
  updateConfig: (partial: Partial<WorkspaceConfig>) => Promise<void>
  /** Partial update to session state (debounced persist) */
  updateSession: (partial: Partial<SessionState>) => void
  /** Load the recent workspaces list */
  loadRecentWorkspaces: () => Promise<void>
  /** Remove a workspace from the recent list */
  removeRecentWorkspace: (path: string) => Promise<void>

  // Active file actions
  /** Open a file (auto-saves current file first if dirty). */
  openFile: (filePath: string) => void
  /** Close the active file (returns to dashboard). */
  closeFile: () => void
  /** Mark the active file as dirty (unsaved changes). No-op guarded. */
  markDirty: () => void
  /** Mark the active file as clean (saved). No-op guarded. */
  markClean: () => void
  /** Update the save status for the active file. No-op guarded. */
  setSaveStatus: (status: SaveStatus) => void
  /** Update the active file's path (for rename operations). */
  updateFilePath: (oldPath: string, newPath: string) => void
  /** Close the active file if it matches a prefix (for delete operations). */
  closeFileByPrefix: (pathPrefix: string) => void
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions

// ---------------------------------------------------------------------------
// Session save debounce
// ---------------------------------------------------------------------------

let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null
const SESSION_SAVE_DELAY = 5000

function debouncedSessionSave(rootPath: string, session: SessionState): void {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer)
  pendingSessionSave = { rootPath, session }
  sessionSaveTimer = setTimeout(() => {
    pendingSessionSave = null
    ipc.saveSession(rootPath, session).catch((err) => {
      console.error('Failed to save session state:', err)
    })
  }, SESSION_SAVE_DELAY)
}

/** Track the last debounced args so flushSessionSave can execute them. */
let pendingSessionSave: { rootPath: string; session: SessionState } | null = null

/** Flush any pending session save immediately. Returns a promise that resolves when done. */
export function flushSessionSave(): Promise<void> {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer)
    sessionSaveTimer = null
  }
  if (pendingSessionSave) {
    const { rootPath, session } = pendingSessionSave
    pendingSessionSave = null
    return ipc.saveSession(rootPath, session).catch((err) => {
      console.error('Failed to flush session save:', err)
    })
  }
  return Promise.resolve()
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  // --- State ---
  config: null,
  session: null,
  rootPath: null,
  fileTree: [],
  recentWorkspaces: [],
  isLoading: false,
  isFileTreeLoading: false,
  error: null,

  // Active file state
  activeFile: null,
  isDirty: false,
  saveStatus: 'idle',

  // --- Actions ---

  openWorkspace: async (dirPath: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await ipc.openWorkspace(dirPath)
      set({
        config: result.config,
        session: result.session,
        rootPath: result.rootPath,
        isLoading: false,
        // Restore active file from session
        activeFile: result.session.activeFile ?? null,
        isDirty: false,
        saveStatus: 'idle'
      })

      // Add to recents
      await ipc.addRecentWorkspace({
        name: result.config.name,
        path: result.rootPath,
        lastOpened: new Date().toISOString()
      })

      // Scan file tree in background
      get().refreshFileTree()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open workspace'
      set({
        isLoading: false,
        error: message
      })
      // Re-throw so the caller (e.g., WelcomeScreen) can handle missing-config case
      throw err
    }
  },

  createWorkspace: async (dirPath: string, name: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await ipc.createWorkspace(dirPath, name)
      set({
        config: result.config,
        session: result.session,
        rootPath: result.rootPath,
        isLoading: false,
        activeFile: null,
        isDirty: false,
        saveStatus: 'idle'
      })

      // Add to recents
      await ipc.addRecentWorkspace({
        name: result.config.name,
        path: result.rootPath,
        lastOpened: new Date().toISOString()
      })

      // Scan file tree (will be empty for new workspace, but establishes pattern)
      get().refreshFileTree()
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to create workspace'
      })
    }
  },

  closeWorkspace: () => {
    // Flush any pending session save (executes it immediately)
    flushSessionSave()

    set({
      config: null,
      session: null,
      rootPath: null,
      fileTree: [],
      error: null,
      activeFile: null,
      isDirty: false,
      saveStatus: 'idle'
    })
  },

  refreshFileTree: async () => {
    const { rootPath } = get()
    if (!rootPath) return
    set({ isFileTreeLoading: true })
    try {
      const tree = await ipc.scanFiles(rootPath)
      set({ fileTree: tree, isFileTreeLoading: false })
    } catch (err) {
      console.error('Failed to scan file tree:', err)
      set({ isFileTreeLoading: false })
    }
  },

  updateConfig: async (partial: Partial<WorkspaceConfig>) => {
    const { config, rootPath } = get()
    if (!config || !rootPath) return

    const updated = { ...config, ...partial }
    set({ config: updated })

    try {
      await ipc.saveConfig(rootPath, updated)
    } catch (err) {
      console.error('Failed to save config:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to save config' })
    }
  },

  updateSession: (partial: Partial<SessionState>) => {
    const { session, rootPath } = get()
    if (!session || !rootPath) return

    const updated = { ...session, ...partial }
    set({ session: updated })

    // Debounced persist
    debouncedSessionSave(rootPath, updated)
  },

  loadRecentWorkspaces: async () => {
    try {
      const recents = await ipc.getRecentWorkspaces()
      set({ recentWorkspaces: recents })
    } catch (err) {
      console.error('Failed to load recent workspaces:', err)
    }
  },

  removeRecentWorkspace: async (path: string) => {
    try {
      const updated = await ipc.removeRecentWorkspace(path)
      set({ recentWorkspaces: updated })
    } catch (err) {
      console.error('Failed to remove recent workspace:', err)
    }
  },

  // -------------------------------------------------------------------------
  // Active file actions
  // -------------------------------------------------------------------------

  openFile: (filePath: string) => {
    const { activeFile } = get()

    // If already viewing this file, no-op
    if (activeFile === filePath) return

    // Switch to the new file (saveService auto-save handles persisting
    // dirty state before the component unmounts)
    set({
      activeFile: filePath,
      isDirty: false,
      saveStatus: 'idle'
    })

    // Persist to session
    get().updateSession({ activeFile: filePath })
  },

  closeFile: () => {
    set({
      activeFile: null,
      isDirty: false,
      saveStatus: 'idle'
    })
    get().updateSession({ activeFile: null })
  },

  markDirty: () => {
    // No-op if already dirty — avoids creating new state references
    // on every Excalidraw onChange, preventing cascading re-renders.
    if (get().isDirty) return
    set({ isDirty: true })
  },

  markClean: () => {
    // No-op if already clean
    if (!get().isDirty) return
    set({ isDirty: false })
  },

  setSaveStatus: (status: SaveStatus) => {
    // No-op if status is already the same
    if (get().saveStatus === status) return
    set({ saveStatus: status })
  },

  updateFilePath: (oldPath: string, newPath: string) => {
    const { activeFile } = get()
    if (activeFile === oldPath) {
      set({ activeFile: newPath })
      get().updateSession({ activeFile: newPath })
    }
  },

  closeFileByPrefix: (pathPrefix: string) => {
    const { activeFile } = get()
    if (
      activeFile &&
      (activeFile === pathPrefix || activeFile.startsWith(pathPrefix + '/'))
    ) {
      set({
        activeFile: null,
        isDirty: false,
        saveStatus: 'idle'
      })
      get().updateSession({ activeFile: null })
    }
  }
}))
