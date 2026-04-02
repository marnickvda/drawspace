/**
 * Dashboard — visual overview of all workspace drawings.
 *
 * Shown when no tabs are open (or via Cmd+Shift+H).
 *
 * Features:
 *   - Grid / list view toggle (persisted in session)
 *   - Sort by name, date modified, date created
 *   - Filter by folder (collection)
 *   - Quick search bar (filters by filename, instant)
 *   - Empty state with "create first drawing" action
 *
 * Drawing data is derived from the workspace fileTree by flattening all
 * .excalidraw FileNode entries and fetching their stat info lazily.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import type { FileNode } from '@/types/ipc'
import type { DashboardView, DashboardSort } from '@/types/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import * as ipc from '@/lib/ipc'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { DrawingCard } from './DrawingCard'
import type { DrawingFile } from './DrawingCard'

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function GridIcon({ className }: { className?: string }) {
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
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
    </svg>
  )
}

function ListIcon({ className }: { className?: string }) {
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
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function SortIcon({ className }: { className?: string }) {
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
      <path d="m3 16 4 4 4-4" />
      <path d="M7 20V4" />
      <path d="m21 8-4-4-4 4" />
      <path d="M17 4v16" />
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

function PanelLeftIcon({ className }: { className?: string }) {
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
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten a FileNode tree into a list of all .excalidraw file entries. */
function flattenFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.isDirectory) {
      result.push(...flattenFiles(node.children))
    } else {
      result.push(node)
    }
  }
  return result
}

/** Extract unique folder paths from a flat list of file nodes. */
function uniqueFolders(files: FileNode[]): string[] {
  const folders = new Set<string>()
  for (const file of files) {
    const idx = file.path.lastIndexOf('/')
    if (idx > 0) {
      folders.add(file.path.substring(0, idx))
    }
  }
  return Array.from(folders).sort()
}

/** Sort label for display. */
const SORT_LABELS: Record<DashboardSort, string> = {
  name: 'Name',
  modified: 'Last Modified',
  created: 'Date Created'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Dashboard({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const session = useWorkspaceStore((s) => s.session)
  const config = useWorkspaceStore((s) => s.config)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const updateSession = useWorkspaceStore((s) => s.updateSession)
  const refreshFileTree = useWorkspaceStore((s) => s.refreshFileTree)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const closeFileByPrefix = useWorkspaceStore((s) => s.closeFileByPrefix)

  // View and sort from session (with fallback)
  const view: DashboardView = session?.dashboardView ?? 'grid'
  const sort: DashboardSort = session?.dashboardSort ?? 'modified'

  // Local state
  const [search, setSearch] = useState('')
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [fileStats, setFileStats] = useState<Map<string, { mtimeMs: number }>>(new Map())

  // Flatten all files from the tree
  const allFiles = useMemo(() => flattenFiles(fileTree), [fileTree])
  const folders = useMemo(() => uniqueFolders(allFiles), [allFiles])

  // Build collection color map from config
  const collectionColorMap = useMemo(() => {
    const map = new Map<string, string>()
    if (config?.collections) {
      for (const col of config.collections) {
        map.set(col.path, col.color)
      }
    }
    return map
  }, [config?.collections])

  // Fetch file stats for sorting by modified/created date
  useEffect(() => {
    let cancelled = false
    const fetchStats = async () => {
      const statsMap = new Map<string, { mtimeMs: number }>()
      // Batch stat calls — collect promises
      const promises = allFiles.map(async (file) => {
        try {
          const stat = await ipc.fileStat(file.path)
          return { path: file.path, mtimeMs: stat.mtimeMs }
        } catch {
          return { path: file.path, mtimeMs: 0 }
        }
      })
      const results = await Promise.all(promises)
      if (cancelled) return
      for (const r of results) {
        statsMap.set(r.path, { mtimeMs: r.mtimeMs })
      }
      setFileStats(statsMap)
    }
    fetchStats()
    return () => {
      cancelled = true
    }
  }, [allFiles])

  // Build DrawingFile[] with collection colors and stat data
  const drawingFiles: DrawingFile[] = useMemo(() => {
    return allFiles.map((file) => {
      const folder = file.path.includes('/')
        ? file.path.substring(0, file.path.lastIndexOf('/'))
        : ''
      const displayName = file.name.replace(/\.excalidraw$/, '')
      const stat = fileStats.get(file.path)
      const modifiedMs = stat?.mtimeMs ?? 0

      // Check if file is in a collection folder
      let collectionColor: string | null = null
      for (const [colPath, color] of collectionColorMap) {
        if (file.path.startsWith(colPath + '/') || file.path === colPath) {
          collectionColor = color
          break
        }
      }

      return {
        path: file.path,
        name: file.name,
        displayName,
        folder,
        modifiedMs,
        createdMs: modifiedMs, // Fall back to modified time
        collectionColor
      }
    })
  }, [allFiles, fileStats, collectionColorMap])

  // Apply search filter
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return drawingFiles
    const term = search.trim().toLowerCase()
    return drawingFiles.filter(
      (f) =>
        f.displayName.toLowerCase().includes(term) ||
        f.folder.toLowerCase().includes(term)
    )
  }, [drawingFiles, search])

  // Apply folder filter
  const folderFiltered = useMemo(() => {
    if (!folderFilter) return searchFiltered
    return searchFiltered.filter(
      (f) => f.folder === folderFilter || f.folder.startsWith(folderFilter + '/')
    )
  }, [searchFiltered, folderFilter])

  // Apply sorting
  const sortedFiles = useMemo(() => {
    const sorted = [...folderFiltered]
    switch (sort) {
      case 'name':
        sorted.sort((a, b) => a.displayName.localeCompare(b.displayName))
        break
      case 'modified':
        sorted.sort((a, b) => b.modifiedMs - a.modifiedMs)
        break
      case 'created':
        sorted.sort((a, b) => b.createdMs - a.createdMs)
        break
    }
    return sorted
  }, [folderFiltered, sort])

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const setView = useCallback(
    (v: DashboardView) => {
      updateSession({ dashboardView: v })
    },
    [updateSession]
  )

  const setSort = useCallback(
    (s: DashboardSort) => {
      updateSession({ dashboardSort: s })
    },
    [updateSession]
  )

  const handleOpen = useCallback(
    (path: string) => {
      openFile(path)
    },
    [openFile]
  )

  const handleNewFile = useCallback(async () => {
    if (!rootPath) return
    try {
      // Generate unique filename at workspace root
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
      toast.success('Drawing created', { description: name })
    } catch (err) {
      toast.error('Failed to create drawing', {
        description: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }, [rootPath, refreshFileTree, openFile])

  const handleDuplicate = useCallback(
    async (path: string) => {
      try {
        const content = await ipc.readFile(path)
        const dir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''
        const name = path.includes('/') ? path.split('/').pop()! : path
        const baseName = name.replace(/\.excalidraw$/, '')

        const siblings = await ipc.readDir(dir || undefined)
        const names = siblings.map((n) => n.name)
        let newName = `${baseName} copy.excalidraw`
        if (names.includes(newName)) {
          let i = 2
          while (names.includes(`${baseName} copy ${i}.excalidraw`)) i++
          newName = `${baseName} copy ${i}.excalidraw`
        }
        const newPath = dir ? `${dir}/${newName}` : newName
        await ipc.writeFile(newPath, content)
        await refreshFileTree()
      } catch (err) {
        toast.error('Failed to duplicate', {
          description: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    },
    [refreshFileTree]
  )

  const handleRename = useCallback(
    (_path: string) => {
      // Rename from dashboard: open the file and let the user rename
      // from the file tree. A full inline rename in the dashboard
      // would require a modal — defer to the file tree for now.
      // For simplicity, we'll just open the file.
      openFile(_path)
    },
    [openFile]
  )

  const handleDelete = useCallback(
    async (path: string) => {
      try {
        await ipc.deleteFile(path)
        closeFileByPrefix(path)
        await refreshFileTree()
        toast.success('File deleted')
      } catch (err) {
        toast.error('Failed to delete', {
          description: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    },
    [refreshFileTree, closeFileByPrefix]
  )

  const handleRevealInFinder = useCallback(
    (path: string) => {
      if (!rootPath) return
      ipc.showItemInFolder(path)
    },
    [rootPath]
  )

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch((err) => {
      console.error('Failed to copy path:', err)
    })
  }, [])

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (allFiles.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <PlaceholderDrawingIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">
            No drawings yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first drawing to get started
          </p>
        </div>
        <Button onClick={handleNewFile} size="sm">
          <PlusIcon className="mr-2 h-4 w-4" />
          New Drawing
        </Button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 h-[48px]">
        {/* Sidebar toggle */}
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            <PanelLeftIcon className="h-4 w-4" />
          </Button>
        )}

        {/* Search */}
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search drawings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-9 text-sm"
          />
        </div>

        {/* Folder filter */}
        {folders.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                {folderFilter ?? 'All folders'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFolderFilter(null)}>
                All folders
              </DropdownMenuItem>
              {folders.map((f) => (
                <DropdownMenuItem key={f} onClick={() => setFolderFilter(f)}>
                  {f}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <SortIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORT_LABELS) as DashboardSort[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onClick={() => setSort(key)}
                className={sort === key ? 'bg-accent' : ''}
              >
                {SORT_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View toggle */}
        <div className="flex items-center rounded-md border">
          <Button
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-r-none"
            onClick={() => setView('grid')}
          >
            <GridIcon className="h-4 w-4" />
          </Button>
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-l-none"
            onClick={() => setView('list')}
          >
            <ListIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Results count */}
      <div className="px-4 py-1.5 text-xs text-muted-foreground">
        {sortedFiles.length} drawing{sortedFiles.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
        {folderFilter && ` in ${folderFilter}`}
      </div>

      {/* File grid/list */}
      <ScrollArea className="flex-1">
        {sortedFiles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No drawings match your search
            </p>
            <button
              onClick={() => {
                setSearch('')
                setFolderFilter(null)
              }}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 p-4">
            {sortedFiles.map((file) => (
              <DrawingCard
                key={file.path}
                file={file}
                view="grid"
                onClick={handleOpen}
                onDuplicate={handleDuplicate}
                onRename={handleRename}
                onDelete={handleDelete}
                onRevealInFinder={handleRevealInFinder}
                onCopyPath={handleCopyPath}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {sortedFiles.map((file) => (
              <DrawingCard
                key={file.path}
                file={file}
                view="list"
                onClick={handleOpen}
                onDuplicate={handleDuplicate}
                onRename={handleRename}
                onDelete={handleDelete}
                onRevealInFinder={handleRevealInFinder}
                onCopyPath={handleCopyPath}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state icon
// ---------------------------------------------------------------------------

function PlaceholderDrawingIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
    </svg>
  )
}
