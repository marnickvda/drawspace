/**
 * AppShell — main application layout.
 *
 * ┌──────────────────────────────────────────────┐
 * │ [native title bar: "filename - Drawspace"]   │
 * ├────────┬─────────────────────────────────────┤
 * │        │                                     │
 * │  Side  │                                     │
 * │  bar   │   Content Area                      │
 * │        │   (Dashboard or Excalidraw canvas)  │
 * │ (File  │                                     │
 * │  Tree) │                                     │
 * │        │                                     │
 * ├────────┴─────────────────────────────────────┤
 * │ Status Bar                                   │
 * └──────────────────────────────────────────────┘
 *
 * Uses react-resizable-panels via shadcn for the sidebar <-> content split.
 * Native title bar is managed by Electron (ADR 6).
 *
 * Single-file navigation model: clicking a file in the sidebar opens it in
 * the canvas, replacing the current one. No tab bar.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable'
import { SidebarContent, useSidebar } from '@/components/sidebar/Sidebar'
import { DrawingCanvas } from '@/components/canvas/DrawingCanvas'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { CommandPalette } from '@/components/CommandPalette'
import type { CommandPaletteMode } from '@/components/CommandPalette'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ExportDialog } from '@/components/ExportDialog'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useTheme } from '@/hooks/useTheme'
import { setWindowTitle, onWindowFocus, onMenuAction, onOpenFile } from '@/lib/ipc'
import { saveFile, saveActiveFile } from '@/lib/saveService'
import * as ipc from '@/lib/ipc'

// Sidebar size constraints (as percentages of the panel group)
const SIDEBAR_MIN_SIZE = 3 // Near-zero — actual min-width handled by CSS
const SIDEBAR_DEFAULT_SIZE = 20 // ~144px at 1200px width
const SIDEBAR_COLLAPSED_SIZE = 0

export function AppShell() {
  const config = useWorkspaceStore((s) => s.config)
  const session = useWorkspaceStore((s) => s.session)
  const refreshFileTree = useWorkspaceStore((s) => s.refreshFileTree)
  const activeFile = useWorkspaceStore((s) => s.activeFile)
  const isDirty = useWorkspaceStore((s) => s.isDirty)

  const { panelRef, onResize, toggleSidebar } = useSidebar()
  const { toggleTheme } = useTheme()

  // Ref for the content area — used to return focus after dialogs close
  const contentRef = useRef<HTMLDivElement>(null)

  // Force-show dashboard even when a file is open (Cmd+Shift+H)
  const [showDashboard, setShowDashboard] = useState(false)

  // Command palette state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteMode, setCommandPaletteMode] = useState<CommandPaletteMode>('all')

  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Export dialog state
  const [exportOpen, setExportOpen] = useState(false)

  // Focus-returning wrappers: when dialogs opened programmatically (not from a
  // trigger element) close, Radix has nowhere to restore focus. We return focus
  // to the content area so the Excalidraw canvas can receive keyboard input.
  const handleCommandPaletteOpenChange = useCallback((open: boolean) => {
    setCommandPaletteOpen(open)
    if (!open) {
      requestAnimationFrame(() => contentRef.current?.focus())
    }
  }, [])

  const handleSettingsOpenChange = useCallback((open: boolean) => {
    setSettingsOpen(open)
    if (!open) {
      requestAnimationFrame(() => contentRef.current?.focus())
    }
  }, [])

  const handleExportOpenChange = useCallback((open: boolean) => {
    setExportOpen(open)
    if (!open) {
      requestAnimationFrame(() => contentRef.current?.focus())
    }
  }, [])

  // Dynamic window title: "filename - WorkspaceName - Drawspace"
  useEffect(() => {
    const parts: string[] = []
    if (activeFile) {
      const fileName = activeFile.includes('/')
        ? activeFile.split('/').pop()!.replace(/\.excalidraw$/, '')
        : activeFile.replace(/\.excalidraw$/, '')
      parts.push(isDirty ? `${fileName} (modified)` : fileName)
    }
    if (config?.name) parts.push(config.name)
    parts.push('Drawspace')
    setWindowTitle(parts.join(' - '))
  }, [config?.name, activeFile, isDirty])

  // Refresh file tree when the window regains focus (external changes)
  useEffect(() => {
    return onWindowFocus(() => {
      refreshFileTree()
    })
  }, [refreshFileTree])

  // Show toast on save errors (subscribe to workspaceStore save status changes)
  useEffect(() => {
    let prevStatus: string = 'idle'
    return useWorkspaceStore.subscribe((state) => {
      if (state.saveStatus === 'error' && prevStatus !== 'error' && state.activeFile) {
        const fileName = state.activeFile.includes('/')
          ? state.activeFile.split('/').pop()!.replace(/\.excalidraw$/, '')
          : state.activeFile.replace(/\.excalidraw$/, '')
        toast.error('Auto-save failed', {
          description: `Could not save ${fileName}`,
          duration: Infinity
        })
      }
      prevStatus = state.saveStatus
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const isMeta = e.metaKey || e.ctrlKey

      // Cmd+S — manual save active file
      if (isMeta && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        const { activeFile: file, isDirty: dirty } = useWorkspaceStore.getState()
        if (file && dirty) {
          saveFile(file)
            .then(() => {
              toast.success('Saved', { duration: 2000 })
            })
            .catch((err) => {
              toast.error('Failed to save', {
                description: err?.message ?? 'Unknown error',
                duration: Infinity
              })
            })
        }
        return
      }

      // Cmd+Shift+S — save active file (same as Cmd+S in single-file model)
      if (isMeta && e.shiftKey && e.key === 's') {
        e.preventDefault()
        saveActiveFile()
          .then(() => {
            toast.success('Saved', { duration: 2000 })
          })
          .catch((err) => {
            toast.error('Failed to save', {
              description: err?.message ?? 'Unknown error',
              duration: Infinity
            })
          })
        return
      }

      // Cmd+Shift+H — toggle dashboard (home)
      if (isMeta && e.shiftKey && e.key === 'h') {
        e.preventDefault()
        setShowDashboard((prev) => !prev)
        return
      }

      // Cmd+K — command palette (all groups)
      if (isMeta && !e.shiftKey && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteMode('all')
        setCommandPaletteOpen(true)
        return
      }

      // Cmd+P — quick open file (file-only mode)
      if (isMeta && !e.shiftKey && e.key === 'p') {
        e.preventDefault()
        setCommandPaletteMode('files')
        setCommandPaletteOpen(true)
        return
      }

      // Cmd+B — toggle sidebar
      if (isMeta && !e.shiftKey && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      // Cmd+, — open settings
      if (isMeta && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
        return
      }

      // Cmd+W — close active file (go to dashboard)
      if (isMeta && e.key === 'w') {
        e.preventDefault()
        useWorkspaceStore.getState().closeFile()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Handle menu bar actions from the main process (native menu items)
  useEffect(() => {
    return onMenuAction((action) => {
      switch (action) {
        case 'new-drawing': {
          // Create a new drawing at workspace root
          const rootPath = useWorkspaceStore.getState().rootPath
          if (!rootPath) return
          ipc.readDir().then(async (siblings) => {
            const names = siblings.map((n) => n.name)
            let name = 'Untitled.excalidraw'
            if (names.includes(name)) {
              let i = 2
              while (names.includes(`Untitled ${i}.excalidraw`)) i++
              name = `Untitled ${i}.excalidraw`
            }
            await ipc.writeFile(name, '{}')
            await useWorkspaceStore.getState().refreshFileTree()
            useWorkspaceStore.getState().openFile(name)
            toast.success('Drawing created', { description: name })
          }).catch((err) => {
            toast.error('Failed to create drawing', {
              description: err instanceof Error ? err.message : 'Unknown error'
            })
          })
          break
        }
        case 'new-folder': {
          const rootPath = useWorkspaceStore.getState().rootPath
          if (!rootPath) return
          ipc.readDir().then(async (siblings) => {
            const names = siblings.map((n) => n.name)
            let name = 'New Folder'
            if (names.includes(name)) {
              let i = 2
              while (names.includes(`New Folder ${i}`)) i++
              name = `New Folder ${i}`
            }
            await ipc.mkDir(name)
            await useWorkspaceStore.getState().refreshFileTree()
            toast.success('Folder created', { description: name })
          }).catch((err) => {
            toast.error('Failed to create folder', {
              description: err instanceof Error ? err.message : 'Unknown error'
            })
          })
          break
        }
        case 'save': {
          const { activeFile: file, isDirty: dirty } = useWorkspaceStore.getState()
          if (file && dirty) {
            saveFile(file)
              .then(() => {
                toast.success('Saved', { duration: 2000 })
              })
              .catch((err) => {
                toast.error('Failed to save', {
                  description: err?.message ?? 'Unknown error',
                  duration: Infinity
                })
              })
          }
          break
        }
        case 'save-all':
          saveActiveFile()
            .then(() => {
              toast.success('Saved', { duration: 2000 })
            })
            .catch((err) => {
              toast.error('Failed to save', {
                description: err?.message ?? 'Unknown error',
                duration: Infinity
              })
            })
          break
        case 'close-tab':
          useWorkspaceStore.getState().closeFile()
          break
        case 'toggle-sidebar':
          toggleSidebar()
          break
        case 'command-palette':
          setCommandPaletteMode('all')
          setCommandPaletteOpen(true)
          break
        case 'toggle-theme':
          toggleTheme()
          break
        case 'settings':
          setSettingsOpen(true)
          break
        case 'export':
          setExportOpen(true)
          break
        case 'dashboard':
          setShowDashboard((prev) => !prev)
          break
        case 'open-workspace':
          // Open workspace directory picker — handled by WelcomeScreen normally,
          // but from the menu we trigger the dialog directly
          ipc.openDirectory().then((dir) => {
            if (dir) {
              useWorkspaceStore.getState().openWorkspace(dir).catch((err) => {
                // If it's not a valid workspace, show error as toast
                const msg = err instanceof Error ? err.message : 'Failed to open workspace'
                toast.error('Failed to open workspace', { description: msg })
              })
            }
          }).catch((err) => {
            console.error('Failed to open workspace:', err)
          })
          break
        case 'close-workspace':
          useWorkspaceStore.getState().closeWorkspace()
          break
      }
    })
  }, [toggleSidebar, toggleTheme])

  // Dismiss forced dashboard when a file becomes active
  useEffect(() => {
    if (activeFile && showDashboard) {
      setShowDashboard(false)
    }
  }, [activeFile])

  // Handle files opened externally (macOS open-file, file association)
  useEffect(() => {
    return onOpenFile((absolutePath) => {
      const rootPath = useWorkspaceStore.getState().rootPath
      if (!rootPath) {
        toast.info('Open a workspace first to edit files')
        return
      }
      // Check if the file is within the current workspace
      if (absolutePath.startsWith(rootPath + '/')) {
        const relativePath = absolutePath.slice(rootPath.length + 1)
        useWorkspaceStore.getState().openFile(relativePath)
      } else {
        toast.info('File is outside the current workspace', {
          description: absolutePath
        })
      }
    })
  }, [])

  // Handle drag-and-drop of .excalidraw files onto the window
  useEffect(() => {
    const handleDragOver = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = async (e: DragEvent): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()

      const rootPath = useWorkspaceStore.getState().rootPath
      if (!rootPath || !e.dataTransfer?.files) return

      const files = Array.from(e.dataTransfer.files)
      const excalidrawFiles = files.filter((f) => f.name.endsWith('.excalidraw'))

      if (excalidrawFiles.length === 0) {
        toast.info('Only .excalidraw files can be opened')
        return
      }

      // In single-file mode, we only open the first dropped file
      const file = excalidrawFiles[0]
      const absPath = (file as File & { path: string }).path
      if (absPath && absPath.startsWith(rootPath + '/')) {
        const relativePath = absPath.slice(rootPath.length + 1)
        useWorkspaceStore.getState().openFile(relativePath)
      } else if (absPath) {
        // File is outside workspace — copy it in
        try {
          const content = await file.text()
          const name = file.name
          // Check for name collision
          const siblings = await ipc.readDir()
          const names = siblings.map((n) => n.name)
          let targetName = name
          if (names.includes(targetName)) {
            const base = name.replace(/\.excalidraw$/, '')
            let i = 2
            while (names.includes(`${base} ${i}.excalidraw`)) i++
            targetName = `${base} ${i}.excalidraw`
          }
          await ipc.writeFile(targetName, content)
          await useWorkspaceStore.getState().refreshFileTree()
          useWorkspaceStore.getState().openFile(targetName)
          toast.success('File imported', { description: targetName })
        } catch (err) {
          toast.error('Failed to import file', {
            description: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      }

      // If multiple files dropped, notify user we only opened the first
      if (excalidrawFiles.length > 1) {
        toast.info(`Opened ${excalidrawFiles[0].name}. Only one file can be open at a time.`)
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  // Restore sidebar size from session
  const defaultSidebarSize = session?.sidebarWidth ?? SIDEBAR_DEFAULT_SIZE

  const shouldShowCanvas = activeFile && !showDashboard

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Main content area: sidebar + content */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Sidebar */}
        <ResizablePanel
          panelRef={panelRef}
          defaultSize={defaultSidebarSize}
          minSize={SIDEBAR_MIN_SIZE}
          collapsible
          collapsedSize={SIDEBAR_COLLAPSED_SIZE}
          onResize={onResize}
          className="min-w-0"
        >
          <SidebarContent />
        </ResizablePanel>

        {/* Resize handle */}
        <ResizableHandle />

        {/* Content area */}
        <ResizablePanel defaultSize={100 - defaultSidebarSize} minSize={30}>
          <div ref={contentRef} role="main" tabIndex={-1} className="flex h-full flex-col outline-none">
            {/* Canvas or Dashboard */}
            {shouldShowCanvas ? (
              <DrawingCanvas
                key={activeFile}
                filePath={activeFile}
              />
            ) : (
              <Dashboard onToggleSidebar={toggleSidebar} />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Command palette */}
      <CommandPalette
        open={commandPaletteOpen}
        mode={commandPaletteMode}
        onOpenChange={handleCommandPaletteOpenChange}
        onToggleSidebar={toggleSidebar}
        onToggleTheme={toggleTheme}
        onShowDashboard={() => setShowDashboard(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenExport={() => setExportOpen(true)}
      />

      {/* Settings dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={handleSettingsOpenChange} />

      {/* Export dialog */}
      <ExportDialog open={exportOpen} onOpenChange={handleExportOpenChange} />
    </div>
  )
}
