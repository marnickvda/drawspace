/**
 * Recursive directory tree scanner for .excalidraw files.
 *
 * Shared between fileSystem.ts (fs:readDir) and workspace.ts (workspace:scanFiles).
 */

import { readdir } from 'fs/promises'
import { join, extname } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IGNORED_DIRS = new Set(['.drawspace', 'node_modules', '.git'])

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Recursively scan a directory and return a tree of .excalidraw files.
 * Empty directories (no .excalidraw files anywhere below) are pruned.
 * Results are sorted: folders first, then alphabetical (case-insensitive).
 */
export async function scanTree(dirAbsolute: string, relativeTo: string): Promise<FileNode[]> {
  const entries = await readdir(dirAbsolute, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries) {
    // Skip dotfiles/dotdirs and explicitly ignored directories
    if (entry.name.startsWith('.')) continue
    if (IGNORED_DIRS.has(entry.name)) continue

    const absPath = join(dirAbsolute, entry.name)
    const relPath = relativeTo ? join(relativeTo, entry.name) : entry.name

    if (entry.isDirectory()) {
      const children = await scanTree(absPath, relPath)
      // Only include folders that contain .excalidraw files (directly or nested)
      if (children.length > 0) {
        nodes.push({ name: entry.name, path: relPath, isDirectory: true, children })
      }
    } else if (extname(entry.name) === '.excalidraw') {
      nodes.push({ name: entry.name, path: relPath, isDirectory: false })
    }
  }

  // Sort: folders first, then alphabetical (case-insensitive)
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return nodes
}
