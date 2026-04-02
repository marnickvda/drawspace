/**
 * Path security — workspace containment.
 *
 * Every IPC file operation MUST call `validatePath()` before touching the
 * filesystem. This prevents path traversal attacks from the renderer.
 */

import { resolve, relative, isAbsolute } from 'path'
import { realpath } from 'fs/promises'

/**
 * Validates that `requestedPath` resolves to a location inside `workspaceRoot`.
 *
 * - Resolves symlinks on both the workspace root and the target to prevent
 *   symlink escapes (e.g. macOS /tmp -> /private/tmp).
 * - For files that don't exist yet (create scenario), validates the parent.
 * - Returns the resolved absolute path on success.
 * - Throws on any path that escapes the workspace.
 */
export async function validatePath(
  requestedPath: string,
  workspaceRoot: string
): Promise<string> {
  // Resolve the workspace root itself to its canonical path
  const realRoot = await realpath(workspaceRoot)
  const resolved = resolve(realRoot, requestedPath)

  // Resolve symlinks on the target
  let real: string
  try {
    real = await realpath(resolved)
  } catch {
    // File doesn't exist yet (create scenario) — validate parent instead
    const parent = resolve(resolved, '..')
    let realParent: string
    try {
      realParent = await realpath(parent)
    } catch {
      throw new Error(`Parent directory does not exist: ${requestedPath}`)
    }

    const rel = relative(realRoot, realParent)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Path escapes workspace: ${requestedPath}`)
    }
    return resolved
  }

  const rel = relative(realRoot, real)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${requestedPath}`)
  }

  return real
}
