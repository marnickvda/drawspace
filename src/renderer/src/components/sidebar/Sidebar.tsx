/**
 * Sidebar — resizable, collapsible sidebar panel.
 *
 * - Uses react-resizable-panels via shadcn's Resizable components
 * - Width and collapsed state persisted in session state (debounced)
 * - Collapsible via Cmd+B (keyboard shortcut wired in Step 13)
 * - Min width: ~10% (~120px at 1200px), default: ~12% (~144px)
 * - Contains FileTree with workspace header
 */

import { useCallback, useEffect, useRef } from 'react'
import { usePanelRef } from 'react-resizable-panels'
import type { PanelSize } from 'react-resizable-panels'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { FileTree } from './FileTree'

/**
 * Sidebar content — rendered inside the ResizablePanel in AppShell.
 * Contains the FileTree with workspace header, refresh, and collapse-all controls.
 */
export function SidebarContent() {
  return (
    <nav
      aria-label="Workspace sidebar"
      className="flex h-full flex-col bg-sidebar text-sidebar-foreground"
    >
      <FileTree />
    </nav>
  )
}

/**
 * Hook for sidebar resize/collapse behavior.
 * Returns a ref for the panel and handlers for resize/collapse.
 */
export function useSidebar() {
  const panelRef = usePanelRef()
  const session = useWorkspaceStore((s) => s.session)
  const updateSession = useWorkspaceStore((s) => s.updateSession)
  const wasCollapsedRef = useRef(session?.sidebarCollapsed ?? false)

  const isCollapsed = session?.sidebarCollapsed ?? false

  const toggleSidebar = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return

    if (isCollapsed) {
      panel.expand()
    } else {
      panel.collapse()
    }
  }, [panelRef, isCollapsed])

  /**
   * onResize fires on every size change, including collapse/expand.
   * We detect collapse/expand transitions by checking if size crosses 0.
   */
  const onResize = useCallback(
    (panelSize: PanelSize) => {
      const collapsed = panelSize.asPercentage === 0
      const wasCollapsed = wasCollapsedRef.current
      wasCollapsedRef.current = collapsed

      if (collapsed && !wasCollapsed) {
        // Just collapsed
        updateSession({ sidebarCollapsed: true })
      } else if (!collapsed && wasCollapsed) {
        // Just expanded
        updateSession({ sidebarCollapsed: false, sidebarWidth: panelSize.asPercentage })
      } else if (!collapsed) {
        // Normal resize
        updateSession({ sidebarWidth: panelSize.asPercentage })
      }
    },
    [updateSession]
  )

  // Restore collapsed state on mount
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    if (session?.sidebarCollapsed) {
      panel.collapse()
    }
  }, []) // Only on mount

  return {
    panelRef,
    isCollapsed,
    toggleSidebar,
    onResize
  }
}
