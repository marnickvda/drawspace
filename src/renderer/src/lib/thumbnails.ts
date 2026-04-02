/**
 * Thumbnail generation and loading utilities.
 *
 * Thumbnails are generated in the renderer process using Excalidraw's
 * `exportToBlob()` (requires DOM/canvas context), then written to disk
 * via IPC. They are stored under `.drawspace/thumbnails/` with flattened
 * path names (slashes replaced with `--`).
 *
 * Flow:
 *   1. After successful auto-save, schedule thumbnail generation
 *   2. exportToBlob() -> Blob -> ArrayBuffer -> IPC writeBinary
 *   3. Load thumbnail: IPC readBinary -> Blob -> URL.createObjectURL
 *
 * Thumbnail generation is low-priority — runs via setTimeout(0) to avoid
 * blocking the UI, and skips if the scene version hasn't changed since
 * the last thumbnail.
 */

import { exportToBlob } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import * as ipc from '@/lib/ipc'

// ---------------------------------------------------------------------------
// Path convention
// ---------------------------------------------------------------------------

/**
 * Convert a file path to a thumbnail path.
 * Flattens directory separators to `--` to avoid nested directories.
 *
 * Example:
 *   "architecture/system-overview.excalidraw"
 *   → ".drawspace/thumbnails/architecture--system-overview.png"
 */
export function thumbnailPath(filePath: string): string {
  const flattened = filePath
    .replace(/\.excalidraw$/, '')
    .replace(/\//g, '--')
  return `.drawspace/thumbnails/${flattened}.png`
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** Scene version of the last generated thumbnail per file path */
const lastThumbnailVersion = new Map<string, number>()

/** Pending thumbnail generation timeouts */
const pendingThumbnails = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Generate a PNG thumbnail from scene data and write it to disk.
 *
 * Uses Excalidraw's exportToBlob() which requires a DOM context.
 * Returns true if a thumbnail was generated, false if skipped.
 */
async function generateAndSave(
  filePath: string,
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles
): Promise<boolean> {
  // Filter out deleted elements (exportToBlob expects NonDeleted)
  const visibleElements = elements.filter(
    (el) => !(el as { isDeleted?: boolean }).isDeleted
  )

  // Skip if no visible elements (nothing to render)
  if (visibleElements.length === 0) return false

  const blob = await exportToBlob({
    elements: visibleElements,
    appState: {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: '#ffffff'
    },
    files,
    maxWidthOrHeight: 400,
    quality: 0.7,
    mimeType: 'image/png'
  })

  const buffer = new Uint8Array(await blob.arrayBuffer())
  const thumbPath = thumbnailPath(filePath)

  // Ensure the thumbnails directory exists
  try {
    await ipc.mkDir('.drawspace/thumbnails')
  } catch {
    // Directory might already exist — ignore
  }

  await ipc.writeBinary(thumbPath, buffer)
  return true
}

/**
 * Schedule thumbnail generation after a successful save.
 * Uses setTimeout(0) to defer work and avoid blocking the UI.
 * Skips if the scene version hasn't changed since the last thumbnail.
 *
 * @param filePath - Relative file path of the drawing
 * @param sceneVersion - Current scene version number
 * @param elements - Current scene elements
 * @param appState - Current app state
 * @param files - Current binary files
 */
export function scheduleThumbnailGeneration(
  filePath: string,
  sceneVersion: number,
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles
): void {
  // Skip if version hasn't changed since last thumbnail
  const lastVersion = lastThumbnailVersion.get(filePath)
  if (lastVersion !== undefined && lastVersion === sceneVersion) return

  // Cancel any pending generation for this file
  const pending = pendingThumbnails.get(filePath)
  if (pending) clearTimeout(pending)

  const timer = setTimeout(() => {
    pendingThumbnails.delete(filePath)

    generateAndSave(filePath, elements, appState, files)
      .then((generated) => {
        if (generated) {
          lastThumbnailVersion.set(filePath, sceneVersion)
        }
      })
      .catch((err) => {
        console.error(`Failed to generate thumbnail for ${filePath}:`, err)
      })
  }, 0)

  pendingThumbnails.set(filePath, timer)
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Cache of object URLs for loaded thumbnails */
const objectUrlCache = new Map<string, string>()

/**
 * Load a thumbnail for a file path. Returns an object URL that can be
 * used as an `<img src>`, or null if the thumbnail doesn't exist.
 *
 * Results are cached — subsequent calls for the same file return the
 * cached object URL without hitting disk.
 */
export async function loadThumbnail(filePath: string): Promise<string | null> {
  const thumbPath = thumbnailPath(filePath)

  // Check cache first
  const cached = objectUrlCache.get(filePath)
  if (cached) return cached

  try {
    const exists = await ipc.fileExists(thumbPath)
    if (!exists) return null

    const data = await ipc.readBinary(thumbPath)
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    objectUrlCache.set(filePath, url)
    return url
  } catch {
    return null
  }
}

/**
 * Invalidate the cached thumbnail URL for a file.
 * Call this when a new thumbnail is generated so the next load fetches fresh data.
 */
export function invalidateThumbnailCache(filePath: string): void {
  const cached = objectUrlCache.get(filePath)
  if (cached) {
    URL.revokeObjectURL(cached)
    objectUrlCache.delete(filePath)
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Clean up all thumbnail state (on workspace close).
 */
export function cleanupThumbnails(): void {
  // Cancel pending generations
  for (const timer of pendingThumbnails.values()) {
    clearTimeout(timer)
  }
  pendingThumbnails.clear()

  // Clear version tracking
  lastThumbnailVersion.clear()

  // Revoke all object URLs
  for (const url of objectUrlCache.values()) {
    URL.revokeObjectURL(url)
  }
  objectUrlCache.clear()
}
