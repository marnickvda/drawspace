/**
 * Save service — single source of truth for dirty state and save lifecycle.
 *
 * Design decisions:
 *   - Per-file save queue: saves are serialized per file (no concurrent writes
 *     to the same file), but different files can save in parallel.
 *   - Scene version tracking: uses `getSceneVersion(elements)` to detect actual
 *     changes and skip no-op writes.
 *   - Dirty state ownership: the save service is the ONLY place that calls
 *     markDirty / markClean on workspaceStore. The component just calls
 *     `notifyChange()` with the current scene version; the service compares
 *     against the last saved version and decides whether the file is dirty.
 *     This eliminates race conditions between auto-save and manual save.
 *   - Atomic writes: IPC `fs:writeFile` already writes to .tmp then renames.
 *   - Auto-save pauses while manual save is in progress for the same file.
 *   - Debounce interval is configurable (read from workspace settings).
 *
 * This is NOT a React hook — it's a plain service module with imperative API.
 * The `useAutoSave` hook in hooks/ wraps this for React lifecycle.
 */

import { serializeAsJSON, getSceneVersion } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { sceneCacheStore } from '@/stores/sceneCacheStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { scheduleThumbnailGeneration, invalidateThumbnailCache } from '@/lib/thumbnails'
import * as ipc from '@/lib/ipc'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Debounce timers per file path */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Per-file save queue: a promise chain that serializes writes */
const saveQueues = new Map<string, Promise<void>>()

/** Last saved scene version per file — to skip no-op saves */
const savedVersions = new Map<string, number>()

/** Whether manual save is in progress per file (pauses auto-save) */
const manualSaveInProgress = new Set<string>()

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Update save status in workspaceStore if `filePath` is still active. */
function setSaveStatus(filePath: string, status: SaveStatus): void {
  const { activeFile } = useWorkspaceStore.getState()
  if (activeFile === filePath) {
    useWorkspaceStore.getState().setSaveStatus(status)
  }
}

/** Update dirty flag in workspaceStore if `filePath` is still active. */
function setDirty(filePath: string, dirty: boolean): void {
  const { activeFile } = useWorkspaceStore.getState()
  if (activeFile !== filePath) return
  if (dirty) {
    useWorkspaceStore.getState().markDirty()
  } else {
    useWorkspaceStore.getState().markClean()
  }
}

// ---------------------------------------------------------------------------
// Change notification (called by DrawingCanvas)
// ---------------------------------------------------------------------------

/**
 * Notify the save service that the scene changed.
 *
 * This is the ONLY entry point for dirty-state changes. The component should
 * never call `markDirty` directly — it calls this instead, and the service
 * compares the version against the last saved version to decide.
 *
 * @param filePath - the file that changed
 * @param version  - current scene version from `getSceneVersion(elements)`
 * @param delayMs  - auto-save debounce interval
 */
export function notifyChange(
  filePath: string,
  version: number,
  delayMs: number
): void {
  const lastSaved = savedVersions.get(filePath)

  // If the version matches the last saved version, the file is clean.
  // This handles the case where auto-save ran but Excalidraw keeps firing
  // onChange for non-content changes (selection, pan, zoom).
  if (lastSaved !== undefined && version === lastSaved) {
    setDirty(filePath, false)
    return
  }

  // Version differs from last save — file is dirty, schedule auto-save.
  setDirty(filePath, true)
  scheduleAutoSave(filePath, delayMs)
}

// ---------------------------------------------------------------------------
// Core save logic
// ---------------------------------------------------------------------------

/**
 * Perform the actual save for a file. Reads from sceneCacheStore,
 * serializes to JSON, writes to disk via IPC, and updates dirty state.
 *
 * Returns true if a write was performed, false if skipped (no changes).
 */
async function performSave(filePath: string): Promise<boolean> {
  const sceneData = sceneCacheStore.get(filePath)
  if (!sceneData) return false

  // Check scene version to skip no-op writes
  const currentVersion = getSceneVersion(
    sceneData.elements as readonly ExcalidrawElement[]
  )
  const lastSaved = savedVersions.get(filePath)
  if (lastSaved !== undefined && currentVersion === lastSaved) {
    return false
  }

  // Serialize using Excalidraw's built-in serializer
  const json = serializeAsJSON(
    sceneData.elements as readonly ExcalidrawElement[],
    sceneData.appState,
    sceneData.files,
    'local'
  )

  // Write to disk (IPC handler does atomic write: tmp + rename)
  await ipc.writeFile(filePath, json)

  // Update tracking state
  savedVersions.set(filePath, currentVersion)

  return true
}

/**
 * Enqueue a save for a file. Saves are serialized per file path to prevent
 * concurrent writes to the same file.
 */
function enqueueSave(
  filePath: string,
  isManual: boolean
): Promise<void> {
  const queueKey = filePath

  const existing = saveQueues.get(queueKey) ?? Promise.resolve()

  const next = existing.then(async () => {
    setSaveStatus(filePath, 'saving')
    try {
      const wrote = await performSave(filePath)

      // Whether we wrote or skipped, the on-disk version matches the cache.
      // Mark clean through the same path in both cases.
      setDirty(filePath, false)
      setSaveStatus(filePath, 'saved')

      // Schedule thumbnail generation after successful write
      if (wrote) {
        const sceneData = sceneCacheStore.get(filePath)
        if (sceneData) {
          const version = getSceneVersion(
            sceneData.elements as readonly ExcalidrawElement[]
          )
          invalidateThumbnailCache(filePath)
          scheduleThumbnailGeneration(
            filePath,
            version,
            sceneData.elements as readonly ExcalidrawElement[],
            sceneData.appState,
            sceneData.files
          )
        }
      }
    } catch (err) {
      setSaveStatus(filePath, 'error')
      console.error(`Failed to save ${filePath}:`, err)
      throw err // Re-throw so callers can handle
    } finally {
      if (isManual) {
        manualSaveInProgress.delete(filePath)
      }
    }
  })

  // Clean up the queue entry when the chain is done (success or failure)
  const cleanup = next.catch(() => {
    // Error already logged, don't let it break the queue
  })
  saveQueues.set(queueKey, cleanup)

  return next
}

// ---------------------------------------------------------------------------
// Auto-save API
// ---------------------------------------------------------------------------

/**
 * Schedule a debounced auto-save for a file.
 *
 * If a manual save is in progress for this file, the auto-save is skipped.
 */
function scheduleAutoSave(
  filePath: string,
  delayMs: number
): void {
  // Cancel any existing debounce timer for this file
  const existing = debounceTimers.get(filePath)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    debounceTimers.delete(filePath)

    // Skip if manual save is in progress
    if (manualSaveInProgress.has(filePath)) return

    enqueueSave(filePath, false).catch(() => {
      // Error already logged in enqueueSave
    })
  }, delayMs)

  debounceTimers.set(filePath, timer)
}

/**
 * Cancel any pending auto-save for a file.
 * Called when a file is closed or on manual save.
 */
export function cancelAutoSave(filePath: string): void {
  const timer = debounceTimers.get(filePath)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(filePath)
  }
}

// ---------------------------------------------------------------------------
// Manual save API
// ---------------------------------------------------------------------------

/**
 * Manually save a specific file. Cancels any pending auto-save debounce
 * and immediately flushes the save.
 */
export async function saveFile(filePath: string): Promise<void> {
  // Cancel pending auto-save
  cancelAutoSave(filePath)

  // Mark manual save in progress (pauses auto-save)
  manualSaveInProgress.add(filePath)

  return enqueueSave(filePath, true)
}

/**
 * Save the current active file if it's dirty. Returns when save completes.
 */
export async function saveActiveFile(): Promise<void> {
  const { activeFile, isDirty } = useWorkspaceStore.getState()
  if (activeFile && isDirty) {
    await saveFile(activeFile)
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Record the initial scene version for a file (after loading from disk).
 * This prevents the first auto-save from writing unchanged data.
 */
export function setInitialVersion(
  filePath: string,
  elements: readonly ExcalidrawElement[]
): void {
  savedVersions.set(filePath, getSceneVersion(elements))
}

/**
 * Clean up all state for a file (on file close / switch away).
 */
export function cleanupFile(filePath: string): void {
  cancelAutoSave(filePath)
  savedVersions.delete(filePath)
  manualSaveInProgress.delete(filePath)
}

/**
 * Clean up everything (on workspace close).
 */
export function cleanupAll(): void {
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
  saveQueues.clear()
  savedVersions.clear()
  manualSaveInProgress.clear()
}
