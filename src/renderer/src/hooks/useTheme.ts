/**
 * useTheme — manages application theme (light / dark / system).
 *
 * Three modes:
 *   - "light"  — always light
 *   - "dark"   — always dark
 *   - "system" — follows OS preference via matchMedia('prefers-color-scheme: dark')
 *
 * Resolved theme is always "light" or "dark".
 *
 * DOM effect: adds/removes `.dark` class on `<html>` (Tailwind v4 dark mode strategy).
 * Persistence: writes to `config.settings.theme` in the workspace store (.drawspace/config.json).
 * Fallback: when no workspace is open, defaults to "system".
 *
 * The hook is designed to be called once at the AppShell level. Other components
 * can read the resolved theme via the `useResolvedTheme` hook (lightweight selector).
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { WorkspaceSettings } from '@/types/workspace'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface UseThemeReturn {
  /** The stored preference: "light" | "dark" | "system" */
  mode: ThemeMode
  /** The resolved (applied) theme: "light" | "dark" */
  resolvedTheme: ResolvedTheme
  /** Set the theme mode (persists to workspace config) */
  setTheme: (mode: ThemeMode) => void
  /** Cycle: light → dark → system → light */
  toggleTheme: () => void
}

// ---------------------------------------------------------------------------
// System theme detection via matchMedia
// ---------------------------------------------------------------------------

const darkQuery =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

/** Subscribe to OS dark-mode changes. useSyncExternalStore-compatible. */
function subscribeSystemTheme(callback: () => void): () => void {
  if (!darkQuery) return () => {}
  darkQuery.addEventListener('change', callback)
  return () => darkQuery.removeEventListener('change', callback)
}

function getSystemThemeSnapshot(): boolean {
  return darkQuery?.matches ?? false
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function applyThemeToDOM(resolved: ResolvedTheme): void {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

// ---------------------------------------------------------------------------
// Resolve mode + system preference into light/dark
// ---------------------------------------------------------------------------

function resolveTheme(mode: ThemeMode, systemIsDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemIsDark ? 'dark' : 'light'
  return mode
}

// ---------------------------------------------------------------------------
// Cycle order for toggle
// ---------------------------------------------------------------------------

const CYCLE: ThemeMode[] = ['light', 'dark', 'system']

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): UseThemeReturn {
  const config = useWorkspaceStore((s) => s.config)
  const updateConfig = useWorkspaceStore((s) => s.updateConfig)

  // Read mode from workspace config, fallback to "system"
  const mode: ThemeMode = config?.settings?.theme ?? 'system'

  // Track OS dark-mode preference reactively
  const systemIsDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemThemeSnapshot
  )

  const resolvedTheme = useMemo(
    () => resolveTheme(mode, systemIsDark),
    [mode, systemIsDark]
  )

  // Apply to DOM whenever resolved theme changes
  useEffect(() => {
    applyThemeToDOM(resolvedTheme)
  }, [resolvedTheme])

  // Set a specific theme mode and persist
  const setTheme = useCallback(
    (newMode: ThemeMode) => {
      if (!config) return
      const newSettings: WorkspaceSettings = {
        ...config.settings,
        theme: newMode
      }
      updateConfig({ settings: newSettings })
    },
    [config, updateConfig]
  )

  // Cycle: light → dark → system → light
  const toggleTheme = useCallback(() => {
    const currentIndex = CYCLE.indexOf(mode)
    const nextIndex = (currentIndex + 1) % CYCLE.length
    setTheme(CYCLE[nextIndex])
  }, [mode, setTheme])

  return { mode, resolvedTheme, setTheme, toggleTheme }
}

// ---------------------------------------------------------------------------
// Lightweight selector for components that only need the resolved theme
// ---------------------------------------------------------------------------

/**
 * Returns the resolved theme ("light" or "dark") without exposing setter logic.
 * Reads from workspace config + system preference. Useful for components like
 * DrawingCanvas that only need to know the current theme, not toggle it.
 */
export function useResolvedTheme(): ResolvedTheme {
  const config = useWorkspaceStore((s) => s.config)
  const mode: ThemeMode = config?.settings?.theme ?? 'system'

  const systemIsDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemThemeSnapshot
  )

  return useMemo(() => resolveTheme(mode, systemIsDark), [mode, systemIsDark])
}
