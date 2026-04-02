import type { WorkspaceConfig, SessionState, RecentWorkspace } from './workspace'

/**
 * IPC channel definitions and payload types.
 *
 * These types are shared between the main process (handlers) and the renderer
 * process (client). The preload script exposes these as `window.api.*`.
 */

// ---------------------------------------------------------------------------
// Menu actions (main → renderer via menu:action channel)
// ---------------------------------------------------------------------------

export type MenuAction =
  | 'new-drawing'
  | 'new-folder'
  | 'open-workspace'
  | 'close-workspace'
  | 'save'
  | 'save-all'
  | 'close-tab'
  | 'toggle-sidebar'
  | 'command-palette'
  | 'toggle-theme'
  | 'dashboard'
  | 'settings'
  | 'export'

// ---------------------------------------------------------------------------
// File system
// ---------------------------------------------------------------------------

/** Mirrors Electron.FileFilter — defined here since Electron types aren't available in the renderer. */
export interface FileFilter {
  extensions: string[]
  name: string
}

export interface FileStat {
  size: number
  mtimeMs: number
  isDirectory: boolean
}

export interface FileEntry {
  name: string
  path: string // relative to workspace root
  isDirectory: false
}

export interface FolderEntry {
  name: string
  path: string // relative to workspace root
  isDirectory: true
  children: FileNode[]
}

export type FileNode = FileEntry | FolderEntry

// ---------------------------------------------------------------------------
// IPC channel map: channel name → { params, result }
// ---------------------------------------------------------------------------

export interface IpcChannelMap {
  // File system — text
  'fs:readFile': { params: [relativePath: string]; result: string }
  'fs:writeFile': { params: [relativePath: string, content: string]; result: void }

  // File system — binary
  'fs:readBinary': { params: [relativePath: string]; result: Uint8Array }
  'fs:writeBinary': { params: [relativePath: string, data: Uint8Array]; result: void }

  // File system — operations
  'fs:readDir': { params: [relativePath?: string]; result: FileNode[] }
  'fs:mkdir': { params: [relativePath: string]; result: void }
  'fs:rename': { params: [oldPath: string, newPath: string]; result: void }
  'fs:delete': { params: [relativePath: string]; result: void }
  'fs:exists': { params: [relativePath: string]; result: boolean }
  'fs:stat': { params: [relativePath: string]; result: FileStat }

  // Dialogs
  'dialog:openDirectory': { params: []; result: string | null }
  'dialog:saveFile': {
    params: [defaultName: string, filters?: FileFilter[]]
    result: string | null
  }

  // Shell
  'shell:showItemInFolder': { params: [relativePath: string]; result: void }
  'shell:openExternal': { params: [url: string]; result: void }

  // Window
  'window:setTitle': { params: [title: string]; result: void }

  // Workspace
  'workspace:open': {
    params: [dirPath: string]
    result: { config: WorkspaceConfig; session: SessionState; rootPath: string }
  }
  'workspace:create': {
    params: [dirPath: string, name: string]
    result: { config: WorkspaceConfig; session: SessionState; rootPath: string }
  }
  'workspace:saveConfig': {
    params: [dirPath: string, config: WorkspaceConfig]
    result: void
  }
  'workspace:saveSession': {
    params: [dirPath: string, session: SessionState]
    result: void
  }
  'workspace:getRecent': { params: []; result: RecentWorkspace[] }
  'workspace:addRecent': { params: [entry: RecentWorkspace]; result: RecentWorkspace[] }
  'workspace:removeRecent': { params: [path: string]; result: RecentWorkspace[] }
  'workspace:scanFiles': { params: [dirPath: string]; result: FileNode[] }
}

export type IpcChannel = keyof IpcChannelMap

// ---------------------------------------------------------------------------
// The API surface exposed via contextBridge (window.api)
// ---------------------------------------------------------------------------

export interface DrawspaceApi {
  // File system — text
  readFile(relativePath: string): Promise<string>
  writeFile(relativePath: string, content: string): Promise<void>

  // File system — binary
  readBinary(relativePath: string): Promise<Uint8Array>
  writeBinary(relativePath: string, data: Uint8Array): Promise<void>

  // File system — operations
  readDir(relativePath?: string): Promise<FileNode[]>
  mkdir(relativePath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  delete(relativePath: string): Promise<void>
  exists(relativePath: string): Promise<boolean>
  stat(relativePath: string): Promise<FileStat>

  // Dialogs
  openDirectory(): Promise<string | null>
  saveFile(defaultName: string, filters?: FileFilter[]): Promise<string | null>

  // Shell
  showItemInFolder(relativePath: string): void
  openExternal(url: string): Promise<void>

  // Window
  setTitle(title: string): void

  // Window events (main → renderer)
  /** Register a callback for window focus. Returns an unsubscribe function. */
  onWindowFocus(callback: () => void): () => void

  // Close protection events
  /** Register a callback for before-close check. Returns an unsubscribe function. */
  onBeforeClose(callback: () => void): () => void
  /** Register a callback for save-and-close signal. Returns an unsubscribe function. */
  onSaveAndClose(callback: () => void): () => void
  /** Send dirty tab count back to main process for close dialog. */
  sendCloseResponse(dirtyCount: number): void
  /** Signal that save-all is complete, main process can close window. */
  sendSaveComplete(): void

  // Workspace root management (set by main process after workspace open)
  setWorkspaceRoot(rootPath: string): void
  getWorkspaceRoot(): string | null

  // Workspace lifecycle
  openWorkspace(
    dirPath: string
  ): Promise<{ config: WorkspaceConfig; session: SessionState; rootPath: string }>
  createWorkspace(
    dirPath: string,
    name: string
  ): Promise<{ config: WorkspaceConfig; session: SessionState; rootPath: string }>
  saveConfig(dirPath: string, config: WorkspaceConfig): Promise<void>
  saveSession(dirPath: string, session: SessionState): Promise<void>
  getRecentWorkspaces(): Promise<RecentWorkspace[]>
  addRecentWorkspace(entry: RecentWorkspace): Promise<RecentWorkspace[]>
  removeRecentWorkspace(path: string): Promise<RecentWorkspace[]>
  scanFiles(dirPath: string): Promise<FileNode[]>

  // Menu actions (main → renderer)
  /** Register a callback for menu bar actions. Returns an unsubscribe function. */
  onMenuAction(callback: (action: MenuAction) => void): () => void

  // Open file externally (macOS open-file, drag to dock, file association)
  /** Register a callback for files opened externally. Returns an unsubscribe function. */
  onOpenFile(callback: (absolutePath: string) => void): () => void
}
