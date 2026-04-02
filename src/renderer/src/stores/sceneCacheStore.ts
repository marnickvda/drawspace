/**
 * Scene cache — in-memory cache for Excalidraw scene data.
 *
 * NOT a Zustand store (see ADR 2). This is a plain Map with a thin API.
 * Keeps scene data (elements, appState, files) keyed by file path so that
 * file switches don't require re-reading from disk.
 *
 * Lifecycle:
 *   1. File opened → read from disk → populate cache → mount Excalidraw
 *   2. onChange fires → update cache entry (debounced, same data used for auto-save)
 *   3. File switched → current file's latest state already in cache → new file reads
 *   4. File closed → evict from cache
 *   5. File saved → cache entry is the source, serialize + write to disk
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFiles
} from '@excalidraw/excalidraw/types'

/**
 * The trio of data Excalidraw produces on every change.
 * Typed with the actual Excalidraw types for full type safety.
 */
export interface SceneData {
  /** Excalidraw elements array */
  elements: readonly ExcalidrawElement[]
  /** Excalidraw appState (partial — only the bits we care to persist) */
  appState: Partial<AppState>
  /** Excalidraw binary files (images, etc.) keyed by fileId */
  files: BinaryFiles
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = new Map<string, SceneData>()

export const sceneCacheStore = {
  /** Get scene data for a file. Returns null if not cached. */
  get: (filePath: string): SceneData | null => cache.get(filePath) ?? null,

  /** Store scene data for a file. */
  set: (filePath: string, data: SceneData): void => {
    cache.set(filePath, data)
  },

  /** Remove scene data for a file (e.g. on file close). */
  delete: (filePath: string): boolean => cache.delete(filePath),

  /** Check if scene data exists for a file. */
  has: (filePath: string): boolean => cache.has(filePath),

  /** Clear the entire cache (e.g. on workspace close). */
  clear: (): void => cache.clear(),

  /** Migrate a cache entry from one path to another (e.g. on rename). */
  migratePath: (oldPath: string, newPath: string): void => {
    const data = cache.get(oldPath)
    if (data) {
      cache.set(newPath, data)
      cache.delete(oldPath)
    }
  },

  /** Delete all entries whose keys start with a prefix (e.g. on folder delete). */
  deleteByPrefix: (prefix: string): void => {
    for (const key of cache.keys()) {
      if (key === prefix || key.startsWith(prefix + '/')) {
        cache.delete(key)
      }
    }
  },

  /** Number of cached scenes (for debugging/testing). */
  get size(): number {
    return cache.size
  }
}
