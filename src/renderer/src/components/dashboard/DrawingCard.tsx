/**
 * DrawingCard — single drawing entry in the dashboard.
 *
 * Shows:
 *   - Thumbnail preview (loaded from `.drawspace/thumbnails/`)
 *   - File name (without .excalidraw extension)
 *   - Relative folder path
 *   - Last modified date (relative: "2 hours ago")
 *   - Collection color badge (if configured)
 *   - Click to open in a tab
 *   - Context menu (same actions as file tree)
 *
 * Has two display modes: "grid" (card with thumbnail) and "list" (compact row).
 */

import { useEffect, useState } from 'react'
import { loadThumbnail } from '@/lib/thumbnails'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrawingFile {
  /** Relative path from workspace root (e.g. "folder/drawing.excalidraw") */
  path: string
  /** File name (e.g. "drawing.excalidraw") */
  name: string
  /** Display name without extension (e.g. "drawing") */
  displayName: string
  /** Relative folder path (e.g. "folder" or "" for root) */
  folder: string
  /** Last modified timestamp in ms */
  modifiedMs: number
  /** Created timestamp in ms (falls back to modified if unavailable) */
  createdMs: number
  /** Collection color (CSS value) if file is in a collection folder, or null */
  collectionColor: string | null
}

export interface DrawingCardProps {
  file: DrawingFile
  view: 'grid' | 'list'
  onClick: (path: string) => void
  onDuplicate: (path: string) => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
  onRevealInFinder: (path: string) => void
  onCopyPath: (path: string) => void
}

// ---------------------------------------------------------------------------
// Relative time formatting
// ---------------------------------------------------------------------------

function relativeTime(timestampMs: number): string {
  const now = Date.now()
  const diffMs = now - timestampMs
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffWeek < 5) return `${diffWeek}w ago`
  if (diffMonth < 12) return `${diffMonth}mo ago`

  return new Date(timestampMs).toLocaleDateString()
}

// ---------------------------------------------------------------------------
// Placeholder icon for missing thumbnails
// ---------------------------------------------------------------------------

function PlaceholderIcon({ className }: { className?: string }) {
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
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DrawingCard({
  file,
  view,
  onClick,
  onDuplicate,
  onRename,
  onDelete,
  onRevealInFinder,
  onCopyPath
}: DrawingCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  // Load thumbnail on mount
  useEffect(() => {
    let cancelled = false
    loadThumbnail(file.path)
      .then((url) => {
        if (!cancelled) setThumbnailUrl(url)
      })
      .catch(() => {
        // Ignore thumbnail load failures
      })
    return () => {
      cancelled = true
    }
  }, [file.path])

  const contextMenu = (
    <ContextMenuContent>
      <ContextMenuItem onClick={() => onClick(file.path)}>
        Open
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onRename(file.path)}>
        Rename
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onDuplicate(file.path)}>
        Duplicate
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onRevealInFinder(file.path)}>
        Reveal in Finder
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onCopyPath(file.path)}>
        Copy Path
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onClick={() => onDelete(file.path)}
      >
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  )

  // -------------------------------------------------------------------------
  // Grid view
  // -------------------------------------------------------------------------

  if (view === 'grid') {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={() => onClick(file.path)}
            className="group flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left
              transition-colors hover:border-primary/50 hover:bg-accent/50 focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* Thumbnail area */}
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={file.displayName}
                  className="h-full w-full object-contain p-2"
                  loading="lazy"
                />
              ) : (
                <PlaceholderIcon className="h-12 w-12 text-muted-foreground/40" />
              )}
              {/* Collection badge */}
              {file.collectionColor && (
                <span
                  className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: file.collectionColor }}
                />
              )}
            </div>
            {/* Info area */}
            <div className="flex flex-col gap-0.5 px-3 py-2">
              <span className="truncate text-sm font-medium">
                {file.displayName}
              </span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {file.folder && (
                  <>
                    <span className="truncate">{file.folder}</span>
                    <span className="shrink-0">·</span>
                  </>
                )}
                <span className="shrink-0">{relativeTime(file.modifiedMs)}</span>
              </div>
            </div>
          </button>
        </ContextMenuTrigger>
        {contextMenu}
      </ContextMenu>
    )
  }

  // -------------------------------------------------------------------------
  // List view
  // -------------------------------------------------------------------------

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => onClick(file.path)}
          className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left
            transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-ring"
        >
          {/* Thumbnail (small) */}
          <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={file.displayName}
                className="h-full w-full object-contain"
                loading="lazy"
              />
            ) : (
              <PlaceholderIcon className="h-5 w-5 text-muted-foreground/40" />
            )}
          </div>
          {/* File info */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {file.collectionColor && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: file.collectionColor }}
                />
              )}
              <span className="truncate text-sm font-medium">
                {file.displayName}
              </span>
            </div>
            {file.folder && (
              <span className="truncate text-xs text-muted-foreground">
                {file.folder}
              </span>
            )}
          </div>
          {/* Modified date */}
          <span className="shrink-0 text-xs text-muted-foreground">
            {relativeTime(file.modifiedMs)}
          </span>
        </button>
      </ContextMenuTrigger>
      {contextMenu}
    </ContextMenu>
  )
}
