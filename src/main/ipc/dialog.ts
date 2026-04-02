/**
 * Native dialog IPC handlers.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:openDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    'dialog:saveFile',
    async (event, defaultName: string, filters?: Electron.FileFilter[]) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return null

      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultName,
        filters: filters ?? [
          { name: 'Excalidraw', extensions: ['excalidraw'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) return null
      return result.filePath
    }
  )
}
