/**
 * ExportDialog — export the active drawing as PNG, SVG, or JSON.
 *
 * Uses Excalidraw's built-in export utilities:
 *   - exportToBlob() for PNG
 *   - exportToSvg() for SVG
 *   - serializeAsJSON() for .excalidraw JSON
 *   - exportToClipboard() for clipboard copy
 *
 * Two export destinations:
 *   - "Save to Workspace" — writes the export file alongside the drawing
 *   - "Copy to Clipboard" — copies PNG/SVG/JSON to the system clipboard
 */

import { useCallback, useState } from 'react'
import { exportToBlob, exportToSvg, exportToClipboard, serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExcalidrawElement, NonDeleted } from '@excalidraw/excalidraw/element/types'
import type { BinaryFiles } from '@excalidraw/excalidraw/types'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { sceneCacheStore } from '@/stores/sceneCacheStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import * as ipc from '@/lib/ipc'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExportFormat = 'png' | 'svg' | 'json'
type ScaleOption = 1 | 2 | 3

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileName(filePath: string): string {
  const name = filePath.includes('/') ? filePath.split('/').pop()! : filePath
  return name.replace(/\.excalidraw$/, '')
}

/** Get the directory portion of a file path (empty string if root). */
function getDirName(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/')
  return lastSlash === -1 ? '' : filePath.substring(0, lastSlash)
}

function getExtension(format: ExportFormat): string {
  switch (format) {
    case 'png': return '.png'
    case 'svg': return '.svg'
    case 'json': return '.excalidraw'
  }
}

// ---------------------------------------------------------------------------
// Format option button
// ---------------------------------------------------------------------------

function FormatOption({
  label,
  description,
  value,
  current,
  onSelect
}: {
  label: string
  description: string
  value: ExportFormat
  current: ExportFormat
  onSelect: (format: ExportFormat) => void
}) {
  const isActive = value === current
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex flex-col items-start rounded-md border p-3 text-left transition-colors ${
        isActive
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/50'
      }`}
    >
      <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>
        {label}
      </span>
      <span className="mt-0.5 text-xs text-muted-foreground">{description}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 translate-y-0.5 rounded-full bg-background shadow-sm ring-0 transition-transform ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Export helpers (generate export data)
// ---------------------------------------------------------------------------

interface ExportData {
  elements: readonly NonDeleted<ExcalidrawElement>[]
  appState: Record<string, unknown>
  files: BinaryFiles
}

function getExportAppState(
  scene: { appState?: Record<string, unknown> },
  includeBackground: boolean,
  darkMode: boolean
): Record<string, unknown> {
  return {
    viewBackgroundColor: includeBackground
      ? (scene.appState?.viewBackgroundColor ?? '#ffffff')
      : 'transparent',
    exportBackground: includeBackground,
    theme: darkMode ? 'dark' : 'light'
  }
}

// ---------------------------------------------------------------------------
// ExportDialog
// ---------------------------------------------------------------------------

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('png')
  const [includeBackground, setIncludeBackground] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [scale, setScale] = useState<ScaleOption>(2)
  const [padding, setPadding] = useState(10)
  const [isExporting, setIsExporting] = useState(false)

  const activeFile = useWorkspaceStore((s) => s.activeFile)
  const refreshFileTree = useWorkspaceStore((s) => s.refreshFileTree)

  // Get scene data from cache
  const getSceneData = useCallback((): ExportData | null => {
    if (!activeFile) return null
    const cached = sceneCacheStore.get(activeFile)
    if (!cached) return null
    return {
      elements: cached.elements as NonDeleted<ExcalidrawElement>[],
      appState: (cached.appState ?? {}) as Record<string, unknown>,
      files: (cached.files ?? {}) as BinaryFiles
    }
  }, [activeFile])

  // --- Copy to clipboard ---
  const handleCopyToClipboard = useCallback(async () => {
    const scene = getSceneData()
    if (!scene) return

    setIsExporting(true)
    try {
      if (format === 'json') {
        const json = serializeAsJSON(
          scene.elements as ExcalidrawElement[],
          getExportAppState(scene, includeBackground, darkMode),
          scene.files,
          'local'
        )
        await navigator.clipboard.writeText(json)
      } else {
        await exportToClipboard({
          elements: scene.elements,
          appState: getExportAppState(scene, includeBackground, darkMode),
          files: scene.files,
          type: format
        })
      }
      toast.success(`${format.toUpperCase()} copied to clipboard`)
      onOpenChange(false)
    } catch (err) {
      console.error('Copy to clipboard failed:', err)
      toast.error('Copy to clipboard failed', {
        description: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setIsExporting(false)
    }
  }, [getSceneData, format, includeBackground, darkMode, onOpenChange])

  // --- Save to workspace ---
  const handleSaveToWorkspace = useCallback(async () => {
    const scene = getSceneData()
    if (!scene || !activeFile) return

    const baseName = getFileName(activeFile)
    const dir = getDirName(activeFile)
    const ext = getExtension(format)
    const exportPath = dir ? `${dir}/${baseName}${ext}` : `${baseName}${ext}`

    setIsExporting(true)
    try {
      if (format === 'json') {
        const json = serializeAsJSON(
          scene.elements as ExcalidrawElement[],
          getExportAppState(scene, includeBackground, darkMode),
          scene.files,
          'local'
        )
        await ipc.writeFile(exportPath, json)
      } else if (format === 'png') {
        const blob = await exportToBlob({
          elements: scene.elements,
          appState: getExportAppState(scene, includeBackground, darkMode),
          files: scene.files,
          getDimensions: (width, height) => ({
            width: width * scale,
            height: height * scale,
            scale
          }),
          exportPadding: padding
        })
        const buffer = new Uint8Array(await blob.arrayBuffer())
        await ipc.writeBinary(exportPath, buffer)
      } else if (format === 'svg') {
        const svg = await exportToSvg({
          elements: scene.elements,
          appState: getExportAppState(scene, includeBackground, darkMode),
          files: scene.files,
          exportPadding: padding
        })
        const svgString = new XMLSerializer().serializeToString(svg)
        await ipc.writeFile(exportPath, svgString)
      }

      await refreshFileTree()
      toast.success(`Saved ${exportPath}`)
      onOpenChange(false)
    } catch (err) {
      console.error('Export to workspace failed:', err)
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setIsExporting(false)
    }
  }, [getSceneData, activeFile, format, includeBackground, darkMode, scale, padding, refreshFileTree, onOpenChange])

  const hasActiveDrawing = !!activeFile && !!getSceneData()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Drawing</DialogTitle>
          <DialogDescription>
            {activeFile
              ? `Export "${getFileName(activeFile)}" as an image or file.`
              : 'No drawing is currently active.'}
          </DialogDescription>
        </DialogHeader>

        {!hasActiveDrawing ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Open a drawing to export it.
          </p>
        ) : (
          <>
            {/* Format selector */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Format</h3>
              <div className="grid grid-cols-3 gap-2">
                <FormatOption
                  label="PNG"
                  description="Raster image"
                  value="png"
                  current={format}
                  onSelect={setFormat}
                />
                <FormatOption
                  label="SVG"
                  description="Vector image"
                  value="svg"
                  current={format}
                  onSelect={setFormat}
                />
                <FormatOption
                  label="JSON"
                  description="Excalidraw file"
                  value="json"
                  current={format}
                  onSelect={setFormat}
                />
              </div>
            </div>

            <Separator />

            {/* Options */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Options</h3>
              <Toggle
                checked={includeBackground}
                onChange={setIncludeBackground}
                label="Include background"
              />
              {format !== 'json' && (
                <Toggle
                  checked={darkMode}
                  onChange={setDarkMode}
                  label="Dark mode"
                />
              )}
              {format === 'png' && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Scale</span>
                  <div className="flex gap-1">
                    {([1, 2, 3] as ScaleOption[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setScale(s)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                          scale === s
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {format !== 'json' && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Padding</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={padding}
                      onChange={(e) => setPadding(parseInt(e.target.value, 10))}
                      className="w-24 accent-primary"
                    />
                    <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                      {padding}px
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasActiveDrawing || isExporting}
            onClick={handleCopyToClipboard}
          >
            Copy to Clipboard
          </Button>
          <Button
            size="sm"
            disabled={!hasActiveDrawing || isExporting}
            onClick={handleSaveToWorkspace}
          >
            {isExporting ? 'Exporting...' : 'Save to Workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
