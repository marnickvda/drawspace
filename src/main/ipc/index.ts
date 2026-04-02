/**
 * Register all IPC handlers. Called once from the main process entry point.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { registerFileSystemHandlers, setWorkspaceRoot, getWorkspaceRoot } from './fileSystem'
import { registerDialogHandlers } from './dialog'
import { registerWorkspaceHandlers } from './workspace'

export function registerAllIpcHandlers(): void {
  registerFileSystemHandlers()
  registerDialogHandlers()
  registerWorkspaceHandlers()

  // Window title
  ipcMain.on('window:setTitle', (event, title: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.setTitle(title)
  })

  // Workspace root management
  ipcMain.on('workspace:setRoot', (_event, rootPath: string) => {
    setWorkspaceRoot(rootPath)
  })

  ipcMain.handle('workspace:getRoot', () => {
    return getWorkspaceRoot()
  })
}

export { setWorkspaceRoot, getWorkspaceRoot }
