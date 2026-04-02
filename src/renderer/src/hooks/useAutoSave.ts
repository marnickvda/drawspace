/**
 * useAutoSave — React hook that bridges DrawingCanvas to the save service.
 *
 * Exposes:
 *   - `notifyChange(version)` — call from onChange to let the save service
 *     decide dirty state and schedule auto-save.
 *   - `setInitialVersion(elements)` — call after loading from disk to seed
 *     the saved-version baseline.
 *
 * Handles cleanup (cancel pending auto-save) on unmount / file switch.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { DEFAULT_SETTINGS } from '@/types/workspace'
import {
  notifyChange as serviceNotifyChange,
  cancelAutoSave,
  setInitialVersion
} from '@/lib/saveService'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

interface UseAutoSaveOptions {
  filePath: string
}

interface UseAutoSaveReturn {
  /** Notify the save service that the scene version changed */
  notifyChange: (version: number) => void
  /** Record the initial scene version (call after loading from disk) */
  setInitialVersion: (elements: readonly ExcalidrawElement[]) => void
}

export function useAutoSave({ filePath }: UseAutoSaveOptions): UseAutoSaveReturn {
  const autoSaveInterval = useWorkspaceStore(
    (s) => s.config?.settings.autoSaveInterval ?? DEFAULT_SETTINGS.autoSaveInterval
  )

  // Keep latest values in refs so the callback doesn't need to re-create
  const filePathRef = useRef(filePath)
  const intervalRef = useRef(autoSaveInterval)

  filePathRef.current = filePath
  intervalRef.current = autoSaveInterval

  // Cleanup on unmount (file close or switch)
  useEffect(() => {
    return () => {
      cancelAutoSave(filePathRef.current)
    }
  }, [filePath])

  const notifyChange = useCallback((version: number) => {
    serviceNotifyChange(
      filePathRef.current,
      version,
      intervalRef.current
    )
  }, [])

  const setVersion = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      setInitialVersion(filePathRef.current, elements)
    },
    []
  )

  return {
    notifyChange,
    setInitialVersion: setVersion
  }
}
