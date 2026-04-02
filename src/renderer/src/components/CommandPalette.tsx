/**
 * CommandPalette — power-user quick-access to files and actions.
 *
 * Triggered by Cmd+K (all commands) or Cmd+P (file-only quick open).
 *
 * Command groups:
 *   - Files: all workspace .excalidraw files, fuzzy search by name/path
 *   - Actions: New Drawing, New Folder, Save
 *   - View: Toggle Sidebar, Toggle Theme, Dashboard (Home)
 *
 * Uses shadcn `command` components (based on cmdk) inside a Dialog.
 * cmdk handles fuzzy matching, keyboard navigation, and filtering natively.
 */

import { useCallback, useMemo } from 'react'
import type { FileNode } from '@/types/ipc'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import * as ipc from '@/lib/ipc'
import { saveFile, saveActiveFile } from '@/lib/saveService'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator
} from '@/components/ui/command'

// ---------------------------------------------------------------------------
// Icons (inline SVGs to avoid dependency on lucide-react tree-shaking)
// ---------------------------------------------------------------------------

function FileIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  )
}

function FolderPlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 10v6" /><path d="M9 13h6" />
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </svg>
  )
}

function LayoutIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

function SunMoonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
    </svg>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ExportIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten a FileNode tree into all .excalidraw files. */
function flattenFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.isDirectory) {
      result.push(...flattenFiles(node.children ?? []))
    } else {
      result.push(node)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type CommandPaletteMode = 'all' | 'files'

export interface CommandPaletteProps {
  open: boolean
  mode: CommandPaletteMode
  onOpenChange: (open: boolean) => void
  onToggleSidebar: () => void
  onToggleTheme: () => void
  onShowDashboard: () => void
  onOpenSettings: () => void
  onOpenExport: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({
  open,
  mode,
  onOpenChange,
  onToggleSidebar,
  onToggleTheme,
  onShowDashboard,
  onOpenSettings,
  onOpenExport
}: CommandPaletteProps) {
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const refreshFileTree = useWorkspaceStore((s) => s.refreshFileTree)
  const activeFile = useWorkspaceStore((s) => s.activeFile)
  const isDirty = useWorkspaceStore((s) => s.isDirty)
  const openFile = useWorkspaceStore((s) => s.openFile)

  // Flatten all files
  const allFiles = useMemo(() => flattenFiles(fileTree), [fileTree])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  // --- File actions ---

  const handleOpenFile = useCallback(
    (path: string) => {
      openFile(path)
      close()
    },
    [openFile, close]
  )

  // --- Action handlers ---

  const handleNewDrawing = useCallback(async () => {
    close()
    if (!rootPath) return
    try {
      const siblings = await ipc.readDir()
      const names = siblings.map((n) => n.name)
      let name = 'Untitled.excalidraw'
      if (names.includes(name)) {
        let i = 2
        while (names.includes(`Untitled ${i}.excalidraw`)) i++
        name = `Untitled ${i}.excalidraw`
      }
      await ipc.writeFile(name, '{}')
      await refreshFileTree()
      openFile(name)
    } catch (err) {
      console.error('Failed to create new drawing:', err)
    }
  }, [rootPath, refreshFileTree, openFile, close])

  const handleNewFolder = useCallback(async () => {
    close()
    if (!rootPath) return
    try {
      const siblings = await ipc.readDir()
      const names = siblings.map((n) => n.name)
      let name = 'New Folder'
      if (names.includes(name)) {
        let i = 2
        while (names.includes(`New Folder ${i}`)) i++
        name = `New Folder ${i}`
      }
      await ipc.mkDir(name)
      await refreshFileTree()
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }, [rootPath, refreshFileTree, close])

  const handleSave = useCallback(() => {
    close()
    if (activeFile && isDirty) {
      saveFile(activeFile).catch((err) => {
        console.error('Save failed:', err)
      })
    }
  }, [close, activeFile, isDirty])

  const handleSaveAll = useCallback(() => {
    close()
    saveActiveFile().catch((err) => {
      console.error('Save failed:', err)
    })
  }, [close])

  const handleToggleSidebar = useCallback(() => {
    close()
    onToggleSidebar()
  }, [close, onToggleSidebar])

  const handleToggleTheme = useCallback(() => {
    close()
    onToggleTheme()
  }, [close, onToggleTheme])

  const handleDashboard = useCallback(() => {
    close()
    onShowDashboard()
  }, [close, onShowDashboard])

  const handleSettings = useCallback(() => {
    close()
    onOpenSettings()
  }, [close, onOpenSettings])

  const handleExport = useCallback(() => {
    close()
    onOpenExport()
  }, [close, onOpenExport])

  // Platform shortcut symbol
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const mod = isMac ? '\u2318' : 'Ctrl+'

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'files' ? 'Open File' : 'Command Palette'}
      description={mode === 'files' ? 'Search for a file to open...' : 'Search for a command to run...'}
      showCloseButton={false}
    >
      <CommandInput
        placeholder={mode === 'files' ? 'Search files...' : 'Type a command or search...'}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Files group */}
        <CommandGroup heading="Files">
          {allFiles.map((file) => {
            const displayName = file.name.replace(/\.excalidraw$/, '')
            const folder = file.path.includes('/')
              ? file.path.substring(0, file.path.lastIndexOf('/'))
              : ''
            return (
              <CommandItem
                key={file.path}
                value={file.path}
                onSelect={() => handleOpenFile(file.path)}
              >
                <FileIcon className="h-4 w-4" />
                <span className="truncate">{displayName}</span>
                {folder && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {folder}
                  </span>
                )}
              </CommandItem>
            )
          })}
        </CommandGroup>

        {/* Actions group — only in "all" mode */}
        {mode === 'all' && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem onSelect={handleNewDrawing} value="new drawing">
                <PlusIcon className="h-4 w-4" />
                <span>New Drawing</span>
                <CommandShortcut>{mod}N</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={handleNewFolder} value="new folder">
                <FolderPlusIcon className="h-4 w-4" />
                <span>New Folder</span>
              </CommandItem>
              <CommandItem onSelect={handleSave} value="save">
                <SaveIcon className="h-4 w-4" />
                <span>Save</span>
                <CommandShortcut>{mod}S</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={handleSaveAll} value="save all">
                <SaveIcon className="h-4 w-4" />
                <span>Save All</span>
                <CommandShortcut>{mod}\u21e7S</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={handleExport} value="export as png svg json">
                <ExportIcon className="h-4 w-4" />
                <span>Export As...</span>
                <CommandShortcut>{mod}\u21e7E</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {/* View group — only in "all" mode */}
        {mode === 'all' && (
          <>
            <CommandSeparator />
            <CommandGroup heading="View">
              <CommandItem onSelect={handleToggleSidebar} value="toggle sidebar">
                <LayoutIcon className="h-4 w-4" />
                <span>Toggle Sidebar</span>
                <CommandShortcut>{mod}B</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={handleToggleTheme} value="toggle theme dark light">
                <SunMoonIcon className="h-4 w-4" />
                <span>Toggle Theme</span>
              </CommandItem>
              <CommandItem onSelect={handleDashboard} value="dashboard home">
                <HomeIcon className="h-4 w-4" />
                <span>Dashboard</span>
                <CommandShortcut>{mod}\u21e7H</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={handleSettings} value="settings preferences">
                <SettingsIcon className="h-4 w-4" />
                <span>Settings</span>
                <CommandShortcut>{mod},</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
