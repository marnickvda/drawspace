import { app, shell, BrowserWindow, Menu, dialog, ipcMain, screen, protocol, net } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { registerAllIpcHandlers } from './ipc'

const isDev = !app.isPackaged

// ---------------------------------------------------------------------------
// Custom protocol: serve renderer files over app:// so that fonts and assets
// resolve correctly (file:// has a null origin which breaks URL resolution)
// ---------------------------------------------------------------------------

const PROTOCOL_SCHEME = 'app'

protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

// ---------------------------------------------------------------------------
// Window state persistence
// ---------------------------------------------------------------------------

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

const WINDOW_STATE_FILE = 'window-state.json'

function getWindowStatePath(): string {
  return join(app.getPath('userData'), WINDOW_STATE_FILE)
}

function loadWindowState(): WindowState {
  const defaults: WindowState = { width: 1200, height: 800, isMaximized: false }
  try {
    const raw = readFileSync(getWindowStatePath(), 'utf-8')
    const state = JSON.parse(raw) as WindowState
    // Validate saved position is on a visible display
    if (state.x !== undefined && state.y !== undefined) {
      const displays = screen.getAllDisplays()
      const isOnScreen = displays.some((display) => {
        const { x, y, width, height } = display.bounds
        return (
          state.x! >= x - 100 &&
          state.x! < x + width + 100 &&
          state.y! >= y - 100 &&
          state.y! < y + height + 100
        )
      })
      if (!isOnScreen) {
        // Position is off-screen (e.g., monitor disconnected) — reset to center
        return { ...defaults, width: state.width || defaults.width, height: state.height || defaults.height }
      }
    }
    return {
      x: state.x,
      y: state.y,
      width: state.width || defaults.width,
      height: state.height || defaults.height,
      isMaximized: state.isMaximized ?? false
    }
  } catch {
    return defaults
  }
}

function saveWindowState(win: BrowserWindow): void {
  const isMaximized = win.isMaximized()
  // Save the non-maximized bounds so we restore to the right size
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized
  }
  try {
    writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf-8')
  } catch {
    // Ignore write errors — not critical
  }
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createWindow(): void {
  const windowState = loadWindowState()

  const mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Drawspace',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Notify renderer when window gains focus (for file-tree refresh)
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window:focus')
  })

  // Close protection: check for unsaved changes before closing
  let forceClose = false
  mainWindow.on('close', (e) => {
    // Always save window state before potentially closing
    saveWindowState(mainWindow)

    if (forceClose) return

    // Prevent close and ask the renderer for dirty tab count
    e.preventDefault()
    mainWindow.webContents.send('window:before-close')
  })

  // Handle the renderer's response to the close check
  ipcMain.on('window:close-response', async (_event, dirtyCount: number) => {
    if (dirtyCount === 0) {
      // No unsaved changes — close immediately
      forceClose = true
      mainWindow.close()
      return
    }

    // Show native dialog
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Unsaved Changes',
      message: `Save changes to ${dirtyCount} file${dirtyCount !== 1 ? 's' : ''}?`,
      detail: 'Your changes will be lost if you don\'t save them.',
      buttons: ['Save All', 'Don\'t Save', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })

    if (result.response === 0) {
      // Save All — tell renderer to save, then close
      mainWindow.webContents.send('window:save-and-close')
    } else if (result.response === 1) {
      // Don't Save — close without saving
      forceClose = true
      mainWindow.close()
    }
    // Cancel (response === 2) — do nothing, window stays open
  })

  // Renderer signals that save-all is complete, now close
  ipcMain.on('window:save-complete', () => {
    forceClose = true
    mainWindow.close()
  })

  // Open external links in the default browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL(`${PROTOCOL_SCHEME}://-/index.html`)
  }
}

app.whenReady().then(() => {
  // Register all IPC handlers before creating windows
  registerAllIpcHandlers()

  // Register custom protocol handler to serve renderer files from the asar
  if (!isDev) {
    const rendererDir = join(__dirname, '../renderer')
    protocol.handle(PROTOCOL_SCHEME, (request) => {
      // Strip the origin (app://-/) and decode the path
      const url = new URL(request.url)
      let filePath = decodeURIComponent(url.pathname)

      // Default to index.html for the root
      if (filePath === '/' || filePath === '') {
        filePath = '/index.html'
      }

      const fullPath = join(rendererDir, filePath)
      return net.fetch(pathToFileURL(fullPath).toString())
    })
  }

  // Set application menu (full menu bar — Step 13)
  const sendMenuAction = (action: string): void => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.send('menu:action', action)
  }

  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings...',
                accelerator: 'Cmd+,' as const,
                click: () => sendMenuAction('settings')
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Drawing',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new-drawing')
        },
        {
          label: 'New Folder',
          click: () => sendMenuAction('new-folder')
        },
        { type: 'separator' },
        {
          label: 'Open Workspace...',
          click: () => sendMenuAction('open-workspace')
        },
        {
          label: 'Close Workspace',
          click: () => sendMenuAction('close-workspace')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('save')
        },
        {
          label: 'Save All',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuAction('save-all')
        },
        { type: 'separator' },
        {
          label: 'Export As...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => sendMenuAction('export')
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendMenuAction('close-tab')
        },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              {
                label: 'Settings...',
                accelerator: 'Ctrl+,' as const,
                click: () => sendMenuAction('settings')
              },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ])
      ]
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendMenuAction('toggle-sidebar')
        },
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendMenuAction('command-palette')
        },
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => sendMenuAction('dashboard')
        },
        { type: 'separator' },
        {
          label: 'Toggle Theme',
          click: () => sendMenuAction('toggle-theme')
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.toggleDevTools()
          }
        }
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }])
      ]
    },

    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.toggleDevTools()
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  createWindow()
  flushPendingOpenFile()

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ---------------------------------------------------------------------------
// macOS: open .excalidraw files from Finder (double-click or drag to dock icon)
// ---------------------------------------------------------------------------

// Files requested before the app is ready (e.g., launched via file association)
let pendingOpenFile: string | null = null

app.on('open-file', (event, filePath) => {
  event.preventDefault()

  // If app isn't ready or no window exists yet, store for later
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send('open-file', filePath)
  } else {
    pendingOpenFile = filePath
  }
})

// Send the pending file after the window is created
function flushPendingOpenFile(): void {
  if (pendingOpenFile) {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      // Wait a bit for the renderer to be ready
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('open-file', pendingOpenFile)
        pendingOpenFile = null
      })
    }
  }
}
