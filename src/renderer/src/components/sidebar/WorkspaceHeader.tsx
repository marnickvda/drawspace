/**
 * WorkspaceHeader -- top section of the sidebar.
 *
 * Shows: workspace name, new file button (+), refresh button, collapse all button.
 * Height matches the main content header (Dashboard toolbar).
 */

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { useWorkspaceStore } from '@/stores/workspaceStore'

// Inline SVG icons (lucide-style)

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

function RefreshIcon({ className }: { className?: string }) {
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
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  )
}

function CollapseAllIcon({ className }: { className?: string }) {
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
      <path d="m7 20 5-5 5 5" />
      <path d="m7 4 5 5 5-5" />
    </svg>
  )
}

interface WorkspaceHeaderProps {
  onNewFile: () => void
  onRefresh: () => void
  onCollapseAll: () => void
}

export function WorkspaceHeader({
  onNewFile,
  onRefresh,
  onCollapseAll
}: WorkspaceHeaderProps) {
  const config = useWorkspaceStore((s) => s.config)
  const isFileTreeLoading = useWorkspaceStore((s) => s.isFileTreeLoading)

  return (
    <div className="relative flex shrink-0 items-center justify-between border-b px-3 py-2.5 h-[48px]">
      <span className="truncate text-sm font-semibold tracking-tight">
        {config?.name ?? 'Workspace'}
      </span>
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onNewFile}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="New drawing"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New Drawing</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onRefresh}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="Refresh file tree"
              >
                <RefreshIcon className={`h-3.5 w-3.5${isFileTreeLoading ? ' animate-spin' : ''}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCollapseAll}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="Collapse all folders"
              >
                <CollapseAllIcon className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Collapse All</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {/* Subtle loading bar at the bottom of the header */}
      {isFileTreeLoading && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden bg-muted">
          <div className="h-full w-1/3 animate-[shimmer_1s_ease-in-out_infinite] bg-primary/40" />
        </div>
      )}
    </div>
  )
}
