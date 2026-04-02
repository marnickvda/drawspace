/**
 * DrawingCanvas — Excalidraw wrapper that manages loading, scene cache, and onChange.
 *
 * Single-file model (no tabs):
 *   - Keyed by filePath — each file gets a fresh `<Excalidraw key={filePath} />` instance
 *   - Scene data is loaded from cache first, then from disk on cache miss
 *
 * Loading flow:
 *   1. File opened -> check sceneCacheStore for cached data
 *   2. Cache miss -> IPC fs:readFile to get .excalidraw JSON
 *   3. Parse JSON, populate cache, set as initialData
 *   4. Excalidraw mounts with key={filePath} (clean instance)
 *
 * onChange handler:
 *   - Immediately updates sceneCacheStore (no debounce — cache must always be current)
 *   - Calls saveService.notifyChange() which is the single source of truth for
 *     dirty state and auto-save scheduling
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, getSceneVersion } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { sceneCacheStore, type SceneData } from '@/stores/sceneCacheStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useResolvedTheme } from '@/hooks/useTheme'
import { Button } from '@/components/ui/button'
import * as ipc from '@/lib/ipc'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'
import '@excalidraw/excalidraw/index.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the display file name from a path. */
function getFileName(filePath: string): string {
  const name = filePath.includes('/') ? filePath.split('/').pop()! : filePath
  return name.replace(/\.excalidraw$/, '')
}

/** Parse a .excalidraw file's JSON content into SceneData. */
function parseExcalidrawFile(content: string): SceneData {
  try {
    const parsed = JSON.parse(content)
    return {
      elements: parsed.elements ?? [],
      appState: parsed.appState ?? {},
      files: parsed.files ?? {}
    }
  } catch {
    // Empty/invalid file — return empty scene
    return { elements: [], appState: {}, files: {} }
  }
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-background">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading drawing...</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DrawingCanvas
// ---------------------------------------------------------------------------

interface DrawingCanvasProps {
  filePath: string
}

export function DrawingCanvas({ filePath }: DrawingCanvasProps) {
  const [initialData, setInitialData] = useState<SceneData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const closeFile = useWorkspaceStore((s) => s.closeFile)
  const resolvedTheme = useResolvedTheme()

  // Auto-save hook — single source of truth for dirty state
  const {
    notifyChange,
    setInitialVersion
  } = useAutoSave({ filePath })

  // Load scene: cache first, then disk
  useEffect(() => {
    let cancelled = false

    const cached = sceneCacheStore.get(filePath)
    if (cached) {
      setInitialData(cached)
      setInitialVersion(cached.elements as readonly ExcalidrawElement[])
      return
    }

    // Cache miss — load from disk
    ipc
      .readFile(filePath)
      .then((content) => {
        if (cancelled) return
        const data = parseExcalidrawFile(content)
        sceneCacheStore.set(filePath, data)
        setInitialVersion(data.elements as readonly ExcalidrawElement[])
        setInitialData(data)
      })
      .catch((err) => {
        if (cancelled) return
        // File might not exist yet (new file)
        const emptyScene: SceneData = { elements: [], appState: {}, files: {} }
        sceneCacheStore.set(filePath, emptyScene)
        setInitialVersion([])
        setInitialData(emptyScene)
        if (err?.message?.includes('ENOENT')) {
          // New file — this is expected
        } else {
          setLoadError(err?.message ?? 'Failed to load file')
          console.error('Failed to load drawing:', err)
        }
      })

    return () => {
      cancelled = true
    }
  }, [filePath, setInitialVersion])

  // onChange handler: update cache + notify save service
  const handleChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      // Always update the cache so it reflects latest state
      sceneCacheStore.set(filePath, { elements, appState, files })

      // Notify the save service with the current version.
      // It compares against the last saved version to decide dirty state
      // and whether to schedule auto-save. This is the single code path
      // for all dirty/clean transitions — no race conditions.
      const version = getSceneVersion(elements)
      notifyChange(version)
    },
    [filePath, notifyChange]
  )

  if (loadError && !initialData) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm font-medium text-destructive">
            Failed to load drawing
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{loadError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                // Start fresh with an empty scene
                const emptyScene: SceneData = { elements: [], appState: {}, files: {} }
                sceneCacheStore.set(filePath, emptyScene)
                setInitialVersion([])
                setLoadError(null)
                setInitialData(emptyScene)
              }}
            >
              Create New
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => closeFile()}
            >
              Close File
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!initialData) return <LoadingSkeleton />

  return (
    <CanvasErrorBoundary
      filePath={filePath}
      fileName={getFileName(filePath)}
      key={`${filePath}-boundary`}
    >
      <div className="h-full w-full">
        <Excalidraw
          key={filePath}
          initialData={{
            elements: initialData.elements,
            appState: {
              ...initialData.appState
            },
            files: initialData.files
          }}
          excalidrawAPI={(api) => {
            excalidrawAPIRef.current = api
          }}
          onChange={handleChange}
          name={getFileName(filePath)}
          theme={resolvedTheme}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
              export: { saveFileToDisk: false }
            }
          }}
        />
      </div>
    </CanvasErrorBoundary>
  )
}
