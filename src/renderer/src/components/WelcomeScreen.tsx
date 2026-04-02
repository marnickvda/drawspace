/**
 * WelcomeScreen — shown when no workspace is open.
 *
 * Features:
 *   - "Open Workspace" button (picks existing directory with .drawspace/config.json)
 *   - "Create New Workspace" button (picks directory + prompts for name)
 *   - Recent workspaces list with name, path, last-opened date
 *   - Remove from recents option
 *   - Handles missing workspace paths gracefully
 */

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import * as ipc from '@/lib/ipc'
import type { RecentWorkspace } from '@/types/workspace'

// Icons (inline SVG to avoid extra dependencies)
function FolderOpenIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Helper: format relative time
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

// ---------------------------------------------------------------------------
// Recent workspace row
// ---------------------------------------------------------------------------

function RecentRow({
  entry,
  onOpen,
  onRemove
}: {
  entry: RecentWorkspace
  onOpen: (path: string) => void
  onRemove: (path: string) => void
}) {
  return (
    <button
      onClick={() => onOpen(entry.path)}
      className="group flex items-center w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <FolderOpenIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <p className="break-all text-xs text-muted-foreground">{entry.path}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatRelativeTime(entry.lastOpened)}
      </span>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(entry.path)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onRemove(entry.path)
                }
              }}
              className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
            >
              <XIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Remove from recents</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </button>
  )
}

// ---------------------------------------------------------------------------
// WelcomeScreen
// ---------------------------------------------------------------------------

export function WelcomeScreen() {
  const {
    recentWorkspaces,
    isLoading,
    error,
    openWorkspace,
    createWorkspace,
    loadRecentWorkspaces,
    removeRecentWorkspace
  } = useWorkspaceStore()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedDir, setSelectedDir] = useState<string | null>(null)

  // Load recent workspaces on mount
  useEffect(() => {
    loadRecentWorkspaces()
  }, [loadRecentWorkspaces])

  // --- Handlers ---

  const handleOpenWorkspace = useCallback(async () => {
    const dir = await ipc.openDirectory()
    if (!dir) return
    try {
      await openWorkspace(dir)
    } catch (err) {
      // If the directory doesn't have a .drawspace/config.json, offer to create one
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('missing .drawspace/config.json') || msg.includes('Not a Drawspace workspace')) {
        const parts = dir.split('/')
        setNewName(parts[parts.length - 1] || 'My Workspace')
        setSelectedDir(dir)
        setCreateDialogOpen(true)
      }
      // Other errors are shown by the store's error state
    }
  }, [openWorkspace])

  const handleCreateStart = useCallback(async () => {
    const dir = await ipc.openDirectory()
    if (!dir) return
    setSelectedDir(dir)
    // Default name from directory name
    const parts = dir.split('/')
    setNewName(parts[parts.length - 1] || 'My Workspace')
    setCreateDialogOpen(true)
  }, [])

  const handleCreateConfirm = useCallback(async () => {
    if (!selectedDir || !newName.trim()) return
    setCreateDialogOpen(false)
    await createWorkspace(selectedDir, newName.trim())
  }, [selectedDir, newName, createWorkspace])

  const handleOpenRecent = useCallback(
    async (path: string) => {
      await openWorkspace(path)
    },
    [openWorkspace]
  )

  const handleRemoveRecent = useCallback(
    async (path: string) => {
      await removeRecentWorkspace(path)
    },
    [removeRecentWorkspace]
  )

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex w-full max-w-lg flex-col items-center gap-8 px-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <img src="/icon.png" alt="Drawspace" className="mb-4 h-20 w-20" />
          <h1 className="text-4xl font-bold tracking-tight">Drawspace</h1>
          <p className="mt-2 text-muted-foreground">
            Desktop workspace for Excalidraw drawings
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex w-full gap-3">
          <Button
            variant="default"
            className="flex-1 gap-2"
            onClick={handleOpenWorkspace}
            disabled={isLoading}
          >
            <FolderOpenIcon className="h-4 w-4" />
            Open Workspace
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleCreateStart}
            disabled={isLoading}
          >
            <PlusIcon className="h-4 w-4" />
            New Workspace
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <div className="w-full rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Recent workspaces */}
        {recentWorkspaces.length > 0 && (
          <div className="w-full">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <ClockIcon className="h-4 w-4" />
              <span>Recent Workspaces</span>
            </div>
            <Separator className="mb-1" />
            <ScrollArea className="max-h-64">
              <div className="flex flex-col gap-0.5">
                {recentWorkspaces.map((entry) => (
                  <RecentRow
                    key={entry.path}
                    entry={entry}
                    onOpen={handleOpenRecent}
                    onRemove={handleRemoveRecent}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <p className="text-sm text-muted-foreground">Opening workspace...</p>
        )}
      </div>

      {/* Create workspace dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div>
              <label
                htmlFor="workspace-name"
                className="mb-1.5 block text-sm font-medium"
              >
                Workspace Name
              </label>
              <Input
                id="workspace-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Workspace"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateConfirm()
                }}
              />
            </div>
            {selectedDir && (
              <p className="break-all text-xs text-muted-foreground">
                Location: {selectedDir}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateConfirm}
              disabled={!newName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
