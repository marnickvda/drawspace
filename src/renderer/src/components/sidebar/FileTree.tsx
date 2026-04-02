/**
 * FileTree — recursive file/folder tree in the sidebar.
 *
 * Features:
 *   - Renders from workspaceStore.fileTree (FileNode[])
 *   - Expand/collapse folders, persisted in session state
 *   - Click file to open in canvas
 *   - Keyboard navigation: arrow keys, Enter, Left/Right, F2
 *   - File operations: new file, new folder, rename, duplicate, delete, reveal, copy path
 *   - Auto-refresh after every file operation
 *   - Manual refresh, collapse all
 */

import { useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import type { FileNode } from '@/types/ipc'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { sceneCacheStore } from '@/stores/sceneCacheStore'
import * as ipc from '@/lib/ipc'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceHeader } from './WorkspaceHeader'
import { FileTreeItem } from './FileTreeItem'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten a tree into a list of visible node paths (respecting expanded state). */
function flattenVisibleNodes(
  nodes: FileNode[],
  expandedFolders: Set<string>
): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.isDirectory && expandedFolders.has(node.path) && node.children) {
      result.push(...flattenVisibleNodes(node.children, expandedFolders))
    }
  }
  return result
}

/** Compute the depth of a node from its path (number of / separators). */
function nodeDepth(path: string): number {
  if (!path) return 0
  return path.split('/').length - 1
}

/** Generate a unique filename like "Untitled.excalidraw" or "Untitled 2.excalidraw". */
function generateUniqueName(
  existingNames: string[],
  baseName: string,
  extension: string
): string {
  const fullBase = baseName + extension
  if (!existingNames.includes(fullBase)) return fullBase

  let i = 2
  while (existingNames.includes(`${baseName} ${i}${extension}`)) {
    i++
  }
  return `${baseName} ${i}${extension}`
}

// ---------------------------------------------------------------------------
// FileTree component
// ---------------------------------------------------------------------------

export function FileTree() {
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const session = useWorkspaceStore((s) => s.session)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const updateSession = useWorkspaceStore((s) => s.updateSession)
  const refreshFileTree = useWorkspaceStore((s) => s.refreshFileTree)
  const treeRef = useRef<HTMLDivElement>(null)

  // Track focused node for keyboard navigation
  const focusedPathRef = useRef<string | null>(null)

  // Expanded folders from session state
  const expandedFolders = useMemo(
    () => new Set(session?.expandedFolders ?? []),
    [session?.expandedFolders]
  )

  // Flatten visible nodes for keyboard navigation
  const visibleNodes = useMemo(
    () => flattenVisibleNodes(fileTree, expandedFolders),
    [fileTree, expandedFolders]
  )

  // -------------------------------------------------------------------------
  // Expand/collapse
  // -------------------------------------------------------------------------

  const toggleExpand = useCallback(
    (path: string) => {
      const newExpanded = new Set(expandedFolders)
      if (newExpanded.has(path)) {
        newExpanded.delete(path)
      } else {
        newExpanded.add(path)
      }
      updateSession({ expandedFolders: Array.from(newExpanded) })
    },
    [expandedFolders, updateSession]
  )

  const collapseAll = useCallback(() => {
    updateSession({ expandedFolders: [] })
  }, [updateSession])

  // -------------------------------------------------------------------------
  // File operations
  // -------------------------------------------------------------------------

  const activeFile = useWorkspaceStore((s) => s.activeFile)
  const isDirty = useWorkspaceStore((s) => s.isDirty)
  const updateFilePath = useWorkspaceStore((s) => s.updateFilePath)
  const closeFileByPrefix = useWorkspaceStore((s) => s.closeFileByPrefix)
  const openFile = useWorkspaceStore((s) => s.openFile)

  const handleSelect = useCallback(
    (node: FileNode) => {
      focusedPathRef.current = node.path
      if (!node.isDirectory) {
        openFile(node.path)
      } else {
        toggleExpand(node.path)
      }
    },
    [openFile, toggleExpand]
  )

  const handleNewFile = useCallback(
    async (folderPath: string) => {
      if (!rootPath) return
      try {
        // Find sibling names to avoid collisions
        const siblings = await ipc.readDir(folderPath || undefined)
        const names = siblings.map((n) => n.name)
        const name = generateUniqueName(names, 'Untitled', '.excalidraw')
        const relativePath = folderPath ? `${folderPath}/${name}` : name

        // Create empty .excalidraw file with minimal valid JSON
        await ipc.writeFile(relativePath, '{}')

        // Expand the parent folder
        if (folderPath && !expandedFolders.has(folderPath)) {
          const newExpanded = new Set(expandedFolders)
          newExpanded.add(folderPath)
          updateSession({ expandedFolders: Array.from(newExpanded) })
        }

        await refreshFileTree()
        toast.success('Drawing created', { description: name })
      } catch (err) {
        toast.error('Failed to create drawing', {
          description: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    },
    [rootPath, expandedFolders, updateSession, refreshFileTree]
  )

  const handleNewFolder = useCallback(
    async (folderPath: string) => {
      if (!rootPath) return
      try {
        const siblings = await ipc.readDir(folderPath || undefined)
        const names = siblings.map((n) => n.name)
        const name = generateUniqueName(names, 'New Folder', '')
        const relativePath = folderPath ? `${folderPath}/${name}` : name

        await ipc.mkDir(relativePath)

        // Expand the parent folder
        if (folderPath && !expandedFolders.has(folderPath)) {
          const newExpanded = new Set(expandedFolders)
          newExpanded.add(folderPath)
          updateSession({ expandedFolders: Array.from(newExpanded) })
        }

        await refreshFileTree()
        toast.success('Folder created', { description: name })
      } catch (err) {
        toast.error('Failed to create folder', {
          description: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    },
    [rootPath, expandedFolders, updateSession, refreshFileTree]
  )

  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      try {
        const dir = oldPath.includes('/') ? oldPath.replace(/\/[^/]+$/, '') : ''
        const newPath = dir ? `${dir}/${newName}` : newName
        await ipc.renameFile(oldPath, newPath)

        // Migrate scene cache and active file path if the renamed file was open
        sceneCacheStore.migratePath(oldPath, newPath)
        updateFilePath(oldPath, newPath)

        await refreshFileTree()
      } catch (err) {
        toast.error('Failed to rename', {
          description: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    },
    [refreshFileTree, updateFilePath]
  )

  const handleDuplicate = useCallback(
    async (path: string) => {
      try {
        const content = await ipc.readFile(path)
        const dir = path.includes('/') ? path.replace(/\/[^/]+$/, '') : ''
        const name = path.includes('/') ? path.split('/').pop()! : path
        const baseName = name.replace(/\.excalidraw$/, '')

        // Find siblings
        const siblings = await ipc.readDir(dir || undefined)
        const names = siblings.map((n) => n.name)
        const newName = generateUniqueName(names, `${baseName} copy`, '.excalidraw')
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

  const handleDelete = useCallback(
    async (path: string, isDirectory: boolean) => {
      try {
        await ipc.deleteFile(path)

        // Close active file if it was under the deleted path and clean up cache
        closeFileByPrefix(path)
        sceneCacheStore.deleteByPrefix(path)

        await refreshFileTree()
        toast.success(isDirectory ? 'Folder deleted' : 'File deleted')
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

  const handleCopyPath = useCallback(
    (path: string) => {
      navigator.clipboard.writeText(path).catch((err) => {
        console.error('Failed to copy path:', err)
      })
    },
    []
  )

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------

  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentPath = focusedPathRef.current
      const currentIndex = currentPath
        ? visibleNodes.findIndex((n) => n.path === currentPath)
        : -1

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const nextIndex = Math.min(currentIndex + 1, visibleNodes.length - 1)
          const nextNode = visibleNodes[nextIndex]
          if (nextNode) {
            focusedPathRef.current = nextNode.path
            // Focus the DOM element
            const el = treeRef.current?.querySelector(
              `[data-path="${CSS.escape(nextNode.path)}"]`
            ) as HTMLElement | null
            el?.focus()
          }
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prevIndex = Math.max(currentIndex - 1, 0)
          const prevNode = visibleNodes[prevIndex]
          if (prevNode) {
            focusedPathRef.current = prevNode.path
            const el = treeRef.current?.querySelector(
              `[data-path="${CSS.escape(prevNode.path)}"]`
            ) as HTMLElement | null
            el?.focus()
          }
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const node = currentIndex >= 0 ? visibleNodes[currentIndex] : null
          if (node?.isDirectory && !expandedFolders.has(node.path)) {
            toggleExpand(node.path)
          }
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const node = currentIndex >= 0 ? visibleNodes[currentIndex] : null
          if (node?.isDirectory && expandedFolders.has(node.path)) {
            toggleExpand(node.path)
          }
          break
        }
        case 'Enter': {
          e.preventDefault()
          const node = currentIndex >= 0 ? visibleNodes[currentIndex] : null
          if (node) handleSelect(node)
          break
        }
      }
    },
    [visibleNodes, expandedFolders, toggleExpand, handleSelect]
  )

  // -------------------------------------------------------------------------
  // Recursive render
  // -------------------------------------------------------------------------

  const renderNode = useCallback(
    (node: FileNode) => {
      const isExpanded = node.isDirectory && expandedFolders.has(node.path)
      const isFocused = focusedPathRef.current === node.path
      const isActive = !node.isDirectory && activeFile === node.path

      return (
        <div key={node.path}>
          <FileTreeItem
            node={node}
            depth={nodeDepth(node.path)}
            isExpanded={isExpanded}
            isActive={isActive}
            isDirty={isActive && isDirty}
            isFocused={isFocused}
            onToggleExpand={toggleExpand}
            onSelect={handleSelect}
            onRename={handleRename}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onRevealInFinder={handleRevealInFinder}
            onCopyPath={handleCopyPath}
          />
          {/* Render children if expanded */}
          {node.isDirectory && isExpanded && node.children && (
            <div role="group" className="flex flex-col gap-0.5">
              {node.children.length === 0 ? (
                <div
                  className="py-1.5 text-xs text-muted-foreground/60 italic"
                  style={{ paddingLeft: `${(nodeDepth(node.path) + 1) * 20 + 30}px` }}
                >
                  Empty
                </div>
              ) : (
                node.children.map(renderNode)
              )}
            </div>
          )}
        </div>
      )
    },
    [
      expandedFolders,
      activeFile,
      isDirty,
      toggleExpand,
      handleSelect,
      handleRename,
      handleNewFile,
      handleNewFolder,
      handleDuplicate,
      handleDelete,
      handleRevealInFinder,
      handleCopyPath
    ]
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader
        onNewFile={() => handleNewFile('')}
        onRefresh={refreshFileTree}
        onCollapseAll={collapseAll}
      />
      <ScrollArea className="flex-1">
        <div
          ref={treeRef}
          role="tree"
          aria-label="File tree"
          onKeyDown={handleTreeKeyDown}
          className="flex flex-col gap-0.5 px-2 py-2"
        >
          {fileTree.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No drawings yet
              </p>
              <button
                onClick={() => handleNewFile('')}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Create your first drawing
              </button>
            </div>
          ) : (
            fileTree.map(renderNode)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
