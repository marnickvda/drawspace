/**
 * Workspace types — shared between renderer stores and IPC.
 *
 * WorkspaceConfig maps to `.drawspace/config.json` (git-tracked, rarely written).
 * SessionState maps to `.drawspace/state.json` (gitignored, frequently written).
 */

// ---------------------------------------------------------------------------
// Workspace config (.drawspace/config.json)
// ---------------------------------------------------------------------------

export interface Collection {
  /** Human-readable name */
  name: string
  /** Relative path from workspace root */
  path: string
  /** CSS color for sidebar badge */
  color: string
}

export interface WorkspaceSettings {
  /** "light" | "dark" | "system" */
  theme: 'light' | 'dark' | 'system'
  /** Auto-save interval in ms */
  autoSaveInterval: number
  /** Default grid mode for new drawings */
  defaultGridMode: boolean
  /** Default zen mode for new drawings */
  defaultZenMode: boolean
}

export interface WorkspaceConfig {
  /** Workspace display name */
  name: string
  /** Config format version */
  version: string
  /** ISO 8601 creation date */
  created: string
  /** Workspace settings */
  settings: WorkspaceSettings
  /** Organizational collections (folders with metadata) */
  collections: Collection[]
}

// ---------------------------------------------------------------------------
// Session state (.drawspace/state.json)
// ---------------------------------------------------------------------------

export type DashboardView = 'grid' | 'list'
export type DashboardSort = 'name' | 'modified' | 'created'

export interface SessionState {
  /** Relative path of the active (open) file, or null if none */
  activeFile: string | null
  /** Recently opened file paths */
  recentFiles: string[]
  /** Sidebar width in pixels */
  sidebarWidth: number
  /** Whether the sidebar is collapsed */
  sidebarCollapsed: boolean
  /** Expanded folder paths in the file tree */
  expandedFolders: string[]
  /** Dashboard view mode: grid or list */
  dashboardView: DashboardView
  /** Dashboard sort field */
  dashboardSort: DashboardSort
}

// ---------------------------------------------------------------------------
// Recent workspace entry (stored in Electron userData)
// ---------------------------------------------------------------------------

export interface RecentWorkspace {
  /** Workspace display name */
  name: string
  /** Absolute path to workspace root */
  path: string
  /** ISO 8601 timestamp of last open */
  lastOpened: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  theme: 'system',
  autoSaveInterval: 3000,
  defaultGridMode: false,
  defaultZenMode: false
}

export const DEFAULT_SESSION: SessionState = {
  activeFile: null,
  recentFiles: [],
  sidebarWidth: 260,
  sidebarCollapsed: false,
  expandedFolders: [],
  dashboardView: 'grid',
  dashboardSort: 'modified'
}

export function createDefaultConfig(name: string): WorkspaceConfig {
  return {
    name,
    version: '1.0.0',
    created: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    collections: []
  }
}
