/**
 * SettingsDialog — user-configurable workspace preferences.
 *
 * Sections:
 *   - General: auto-save interval, default grid mode, default zen mode
 *   - Appearance: theme picker (light / dark / system)
 *
 * Each setting updates the workspace config live (persists to .drawspace/config.json).
 * "Reset to Defaults" button per section.
 *
 * Opened via Cmd+, or command palette / View menu.
 */

import { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useTheme } from '@/hooks/useTheme'
import type { ThemeMode } from '@/hooks/useTheme'
import type { WorkspaceSettings } from '@/types/workspace'
import { DEFAULT_SETTINGS } from '@/types/workspace'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Auto-save interval constraints
// ---------------------------------------------------------------------------

const AUTO_SAVE_MIN = 1000 // 1s
const AUTO_SAVE_MAX = 60000 // 60s
const AUTO_SAVE_STEP = 500 // 0.5s steps

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Theme option button — highlights when active */
function ThemeOption({
  label,
  description,
  value,
  current,
  onSelect
}: {
  label: string
  description: string
  value: ThemeMode
  current: ThemeMode
  onSelect: (mode: ThemeMode) => void
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

/** Toggle switch — a simple checkbox styled as a toggle */
function Toggle({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
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
// SettingsDialog
// ---------------------------------------------------------------------------

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const config = useWorkspaceStore((s) => s.config)
  const updateConfig = useWorkspaceStore((s) => s.updateConfig)
  const { mode: themeMode, setTheme } = useTheme()

  const settings = config?.settings ?? DEFAULT_SETTINGS

  // Helper to update a single setting field
  const updateSetting = useCallback(
    <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => {
      if (!config) return
      const newSettings: WorkspaceSettings = { ...config.settings, [key]: value }
      updateConfig({ settings: newSettings })
    },
    [config, updateConfig]
  )

  // --- Auto-save interval ---
  const autoSaveSeconds = settings.autoSaveInterval / 1000

  const handleAutoSaveChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const ms = Math.round(parseFloat(e.target.value) * 1000)
      const clamped = Math.max(AUTO_SAVE_MIN, Math.min(AUTO_SAVE_MAX, ms))
      updateSetting('autoSaveInterval', clamped)
    },
    [updateSetting]
  )

  // --- Reset handlers ---
  const resetGeneral = useCallback(() => {
    if (!config) return
    updateConfig({
      settings: {
        ...config.settings,
        autoSaveInterval: DEFAULT_SETTINGS.autoSaveInterval,
        defaultGridMode: DEFAULT_SETTINGS.defaultGridMode,
        defaultZenMode: DEFAULT_SETTINGS.defaultZenMode
      }
    })
  }, [config, updateConfig])

  const resetAppearance = useCallback(() => {
    setTheme(DEFAULT_SETTINGS.theme)
  }, [setTheme])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Workspace preferences are saved to .drawspace/config.json.
          </DialogDescription>
        </DialogHeader>

        {/* --- Appearance Section --- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={resetAppearance}
            >
              Reset
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ThemeOption
              label="Light"
              description="Always light"
              value="light"
              current={themeMode}
              onSelect={setTheme}
            />
            <ThemeOption
              label="Dark"
              description="Always dark"
              value="dark"
              current={themeMode}
              onSelect={setTheme}
            />
            <ThemeOption
              label="System"
              description="Follow OS"
              value="system"
              current={themeMode}
              onSelect={setTheme}
            />
          </div>
        </div>

        <Separator />

        {/* --- General Section --- */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">General</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={resetGeneral}
            >
              Reset
            </Button>
          </div>

          {/* Auto-save interval */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Auto-save interval</div>
                <div className="text-xs text-muted-foreground">
                  How long to wait after changes before auto-saving
                </div>
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">
                {autoSaveSeconds.toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min={AUTO_SAVE_MIN / 1000}
              max={AUTO_SAVE_MAX / 1000}
              step={AUTO_SAVE_STEP / 1000}
              value={autoSaveSeconds}
              onChange={handleAutoSaveChange}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1s</span>
              <span>60s</span>
            </div>
          </div>

          {/* Default grid mode */}
          <Toggle
            checked={settings.defaultGridMode}
            onChange={(v) => updateSetting('defaultGridMode', v)}
            label="Default grid mode"
            description="Show grid on new drawings by default"
          />

          {/* Default zen mode */}
          <Toggle
            checked={settings.defaultZenMode}
            onChange={(v) => updateSetting('defaultZenMode', v)}
            label="Default zen mode"
            description="Hide UI elements on new drawings by default"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
