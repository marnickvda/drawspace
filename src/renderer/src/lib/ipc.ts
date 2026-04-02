/**
 * Type-safe IPC client for the renderer process.
 *
 * Wraps `window.api.*` calls with proper TypeScript types.
 * Import this module instead of accessing `window.api` directly.
 */

import type { DrawspaceApi, FileFilter, FileNode, FileStat, MenuAction } from '@/types/ipc'
import type { WorkspaceConfig, SessionState, RecentWorkspace } from '@/types/workspace'

function getApi(): DrawspaceApi {
  return window.api
}

// ---------------------------------------------------------------------------
// IPC timeout wrapper
// ---------------------------------------------------------------------------

const DEFAULT_IPC_TIMEOUT = 10000 // 10 seconds

/**
 * Wrap an IPC promise with a timeout. If the IPC call takes longer than
 * the timeout, the promise rejects with a descriptive error.
 */
function withTimeout<T>(promise: Promise<T>, label: string, ms = DEFAULT_IPC_TIMEOUT): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`IPC timeout: ${label} took longer than ${ms / 1000}s`))
    }, ms)

    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

// ---------------------------------------------------------------------------
// File system — text
// ---------------------------------------------------------------------------

export async function readFile(relativePath: string): Promise<string> {
  return withTimeout(getApi().readFile(relativePath), `readFile(${relativePath})`)
}

export async function writeFile(relativePath: string, content: string): Promise<void> {
  return withTimeout(getApi().writeFile(relativePath, content), `writeFile(${relativePath})`)
}

// ---------------------------------------------------------------------------
// File system — binary
// ---------------------------------------------------------------------------

export async function readBinary(relativePath: string): Promise<Uint8Array> {
  return withTimeout(getApi().readBinary(relativePath), `readBinary(${relativePath})`)
}

export async function writeBinary(relativePath: string, data: Uint8Array): Promise<void> {
  return withTimeout(getApi().writeBinary(relativePath, data), `writeBinary(${relativePath})`)
}

// ---------------------------------------------------------------------------
// File system — operations
// ---------------------------------------------------------------------------

export async function readDir(relativePath?: string): Promise<FileNode[]> {
  return withTimeout(getApi().readDir(relativePath), `readDir(${relativePath ?? '.'})`)
}

export async function mkDir(relativePath: string): Promise<void> {
  return withTimeout(getApi().mkdir(relativePath), `mkdir(${relativePath})`)
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  return withTimeout(getApi().rename(oldPath, newPath), `rename(${oldPath})`)
}

export async function deleteFile(relativePath: string): Promise<void> {
  return withTimeout(getApi().delete(relativePath), `delete(${relativePath})`)
}

export async function fileExists(relativePath: string): Promise<boolean> {
  return withTimeout(getApi().exists(relativePath), `exists(${relativePath})`)
}

export async function fileStat(relativePath: string): Promise<FileStat> {
  return withTimeout(getApi().stat(relativePath), `stat(${relativePath})`)
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

export async function openDirectory(): Promise<string | null> {
  return getApi().openDirectory()
}

export async function saveFileDialog(
  defaultName: string,
  filters?: FileFilter[]
): Promise<string | null> {
  return getApi().saveFile(defaultName, filters)
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function showItemInFolder(relativePath: string): void {
  getApi().showItemInFolder(relativePath)
}

export async function openExternal(url: string): Promise<void> {
  return getApi().openExternal(url)
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

export function setWindowTitle(title: string): void {
  getApi().setTitle(title)
}

/**
 * Register a callback that fires when the BrowserWindow gains focus.
 * Returns an unsubscribe function (call in useEffect cleanup).
 */
export function onWindowFocus(callback: () => void): () => void {
  return getApi().onWindowFocus(callback)
}

/**
 * Register a callback for before-close check (main process wants to close).
 * Returns an unsubscribe function.
 */
export function onBeforeClose(callback: () => void): () => void {
  return getApi().onBeforeClose(callback)
}

/**
 * Register a callback for save-and-close signal (user chose "Save All" in close dialog).
 * Returns an unsubscribe function.
 */
export function onSaveAndClose(callback: () => void): () => void {
  return getApi().onSaveAndClose(callback)
}

/**
 * Send the dirty tab count back to the main process for the close dialog.
 */
export function sendCloseResponse(dirtyCount: number): void {
  getApi().sendCloseResponse(dirtyCount)
}

/**
 * Signal that save-all is complete, allowing the main process to close the window.
 */
export function sendSaveComplete(): void {
  getApi().sendSaveComplete()
}

// ---------------------------------------------------------------------------
// Workspace root
// ---------------------------------------------------------------------------

export function setWorkspaceRoot(rootPath: string): void {
  getApi().setWorkspaceRoot(rootPath)
}

export async function getWorkspaceRoot(): Promise<string | null> {
  return getApi().getWorkspaceRoot()
}

// ---------------------------------------------------------------------------
// Workspace lifecycle
// ---------------------------------------------------------------------------

export async function openWorkspace(
  dirPath: string
): Promise<{ config: WorkspaceConfig; session: SessionState; rootPath: string }> {
  return withTimeout(getApi().openWorkspace(dirPath), 'openWorkspace')
}

export async function createWorkspace(
  dirPath: string,
  name: string
): Promise<{ config: WorkspaceConfig; session: SessionState; rootPath: string }> {
  return withTimeout(getApi().createWorkspace(dirPath, name), 'createWorkspace')
}

export async function saveConfig(
  dirPath: string,
  config: WorkspaceConfig
): Promise<void> {
  return withTimeout(getApi().saveConfig(dirPath, config), 'saveConfig')
}

export async function saveSession(
  dirPath: string,
  session: SessionState
): Promise<void> {
  return withTimeout(getApi().saveSession(dirPath, session), 'saveSession')
}

export async function getRecentWorkspaces(): Promise<RecentWorkspace[]> {
  return withTimeout(getApi().getRecentWorkspaces(), 'getRecentWorkspaces')
}

export async function addRecentWorkspace(
  entry: RecentWorkspace
): Promise<RecentWorkspace[]> {
  return withTimeout(getApi().addRecentWorkspace(entry), 'addRecentWorkspace')
}

export async function removeRecentWorkspace(
  path: string
): Promise<RecentWorkspace[]> {
  return withTimeout(getApi().removeRecentWorkspace(path), 'removeRecentWorkspace')
}

export async function scanFiles(dirPath: string): Promise<FileNode[]> {
  return withTimeout(getApi().scanFiles(dirPath), 'scanFiles', 30000) // 30s for large workspaces
}

// ---------------------------------------------------------------------------
// Menu actions (main → renderer)
// ---------------------------------------------------------------------------

/**
 * Register a callback for menu bar actions (sent from the main process native menu).
 * Returns an unsubscribe function.
 */
export function onMenuAction(callback: (action: MenuAction) => void): () => void {
  return getApi().onMenuAction(callback)
}

/**
 * Register a callback for files opened externally (macOS open-file, file association).
 * The callback receives the absolute path to the .excalidraw file.
 * Returns an unsubscribe function.
 */
export function onOpenFile(callback: (absolutePath: string) => void): () => void {
  return getApi().onOpenFile(callback)
}
