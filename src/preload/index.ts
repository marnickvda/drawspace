import { contextBridge, ipcRenderer } from 'electron'

/**
 * The Drawspace API exposed to the renderer via contextBridge.
 *
 * Every method here is a thin wrapper around ipcRenderer.invoke / .send.
 * The renderer imports types from `types/ipc.ts` for type safety.
 */
const api = {
  // File system — text
  readFile: (relativePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', relativePath),
  writeFile: (relativePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', relativePath, content),

  // File system — binary
  readBinary: (relativePath: string): Promise<Uint8Array> =>
    ipcRenderer.invoke('fs:readBinary', relativePath),
  writeBinary: (relativePath: string, data: Uint8Array): Promise<void> =>
    ipcRenderer.invoke('fs:writeBinary', relativePath, data),

  // File system — operations
  readDir: (relativePath?: string): Promise<unknown[]> =>
    ipcRenderer.invoke('fs:readDir', relativePath),
  mkdir: (relativePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:mkdir', relativePath),
  rename: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),
  delete: (relativePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:delete', relativePath),
  exists: (relativePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:exists', relativePath),
  stat: (relativePath: string): Promise<{ size: number; mtimeMs: number; isDirectory: boolean }> =>
    ipcRenderer.invoke('fs:stat', relativePath),

  // Dialogs
  openDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory'),
  saveFile: (defaultName: string, filters?: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultName, filters),

  // Shell
  showItemInFolder: (relativePath: string): void =>
    ipcRenderer.send('shell:showItemInFolder', relativePath),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),

  // Window
  setTitle: (title: string): void =>
    ipcRenderer.send('window:setTitle', title),

  // Window events (main → renderer)
  onWindowFocus: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('window:focus', handler)
    return () => {
      ipcRenderer.removeListener('window:focus', handler)
    }
  },

  // Close protection events
  onBeforeClose: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('window:before-close', handler)
    return () => {
      ipcRenderer.removeListener('window:before-close', handler)
    }
  },
  onSaveAndClose: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('window:save-and-close', handler)
    return () => {
      ipcRenderer.removeListener('window:save-and-close', handler)
    }
  },
  sendCloseResponse: (dirtyCount: number): void =>
    ipcRenderer.send('window:close-response', dirtyCount),
  sendSaveComplete: (): void =>
    ipcRenderer.send('window:save-complete'),

  // Workspace root management
  setWorkspaceRoot: (rootPath: string): void =>
    ipcRenderer.send('workspace:setRoot', rootPath),
  getWorkspaceRoot: (): Promise<string | null> =>
    ipcRenderer.invoke('workspace:getRoot'),

  // Workspace lifecycle
  openWorkspace: (dirPath: string): Promise<unknown> =>
    ipcRenderer.invoke('workspace:open', dirPath),
  createWorkspace: (dirPath: string, name: string): Promise<unknown> =>
    ipcRenderer.invoke('workspace:create', dirPath, name),
  saveConfig: (dirPath: string, config: unknown): Promise<void> =>
    ipcRenderer.invoke('workspace:saveConfig', dirPath, config),
  saveSession: (dirPath: string, session: unknown): Promise<void> =>
    ipcRenderer.invoke('workspace:saveSession', dirPath, session),
  getRecentWorkspaces: (): Promise<unknown[]> =>
    ipcRenderer.invoke('workspace:getRecent'),
  addRecentWorkspace: (entry: unknown): Promise<unknown[]> =>
    ipcRenderer.invoke('workspace:addRecent', entry),
  removeRecentWorkspace: (path: string): Promise<unknown[]> =>
    ipcRenderer.invoke('workspace:removeRecent', path),
  scanFiles: (dirPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke('workspace:scanFiles', dirPath),

  // Menu actions (main → renderer)
  onMenuAction: (callback: (action: string) => void): (() => void) => {
    const handler = (_event: unknown, action: string): void => callback(action)
    ipcRenderer.on('menu:action', handler)
    return () => {
      ipcRenderer.removeListener('menu:action', handler)
    }
  },

  // Open file externally (macOS open-file, drag to dock, file association)
  onOpenFile: (callback: (absolutePath: string) => void): (() => void) => {
    const handler = (_event: unknown, filePath: string): void => callback(filePath)
    ipcRenderer.on('open-file', handler)
    return () => {
      ipcRenderer.removeListener('open-file', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
