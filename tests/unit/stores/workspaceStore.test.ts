/**
 * Tests for workspaceStore — Zustand store for workspace management.
 *
 * All IPC calls are mocked. Tests verify state transitions only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WorkspaceConfig, SessionState, RecentWorkspace } from '@/types/workspace'

// ---------------------------------------------------------------------------
// Mock the IPC module — factory is hoisted, so no external references
// ---------------------------------------------------------------------------

vi.mock('@/lib/ipc', () => ({
  openWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  saveConfig: vi.fn(),
  saveSession: vi.fn(),
  getRecentWorkspaces: vi.fn(),
  addRecentWorkspace: vi.fn(),
  removeRecentWorkspace: vi.fn(),
  scanFiles: vi.fn(),
  openDirectory: vi.fn()
}))

// Import after mock is set up
import * as ipc from '@/lib/ipc'
import { useWorkspaceStore, flushSessionSave } from '@/stores/workspaceStore'

// Cast to mocked versions for type-safe mock manipulation
const mockedIpc = vi.mocked(ipc)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CONFIG: WorkspaceConfig = {
  name: 'Test Workspace',
  version: '1.0.0',
  created: '2026-04-02T10:00:00Z',
  settings: {
    theme: 'system',
    autoSaveInterval: 3000,
    defaultGridMode: false,
    defaultZenMode: false
  },
  collections: []
}

const MOCK_SESSION: SessionState = {
  activeFile: null,
  recentFiles: [],
  sidebarWidth: 260,
  sidebarCollapsed: false,
  expandedFolders: [],
  dashboardView: 'grid',
  dashboardSort: 'modified'
}

const MOCK_ROOT = '/tmp/test-workspace'

const MOCK_OPEN_RESULT = {
  config: MOCK_CONFIG,
  session: MOCK_SESSION,
  rootPath: MOCK_ROOT
}

const MOCK_RECENTS: RecentWorkspace[] = [
  { name: 'Project A', path: '/Users/test/project-a', lastOpened: '2026-04-01T10:00:00Z' },
  { name: 'Project B', path: '/Users/test/project-b', lastOpened: '2026-03-31T10:00:00Z' }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore(): void {
  useWorkspaceStore.setState({
    config: null,
    session: null,
    rootPath: null,
    fileTree: [],
    recentWorkspaces: [],
    isLoading: false,
    isFileTreeLoading: false,
    error: null,
    activeFile: null,
    isDirty: false,
    saveStatus: 'idle'
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workspaceStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    // Default mocks
    mockedIpc.addRecentWorkspace.mockResolvedValue(MOCK_RECENTS)
    mockedIpc.scanFiles.mockResolvedValue([])
  })

  afterEach(() => {
    flushSessionSave()
  })

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('has correct initial state', () => {
    const state = useWorkspaceStore.getState()
    expect(state.config).toBeNull()
    expect(state.session).toBeNull()
    expect(state.rootPath).toBeNull()
    expect(state.fileTree).toEqual([])
    expect(state.recentWorkspaces).toEqual([])
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('isOpen is false when no workspace is loaded', () => {
    const state = useWorkspaceStore.getState()
    expect(state.rootPath).toBeNull()
  })

  // -------------------------------------------------------------------------
  // openWorkspace
  // -------------------------------------------------------------------------

  it('openWorkspace sets config, session, and rootPath on success', async () => {
    mockedIpc.openWorkspace.mockResolvedValue(MOCK_OPEN_RESULT)

    await useWorkspaceStore.getState().openWorkspace(MOCK_ROOT)

    const state = useWorkspaceStore.getState()
    expect(state.config).toEqual(MOCK_CONFIG)
    expect(state.session).toEqual(MOCK_SESSION)
    expect(state.rootPath).toBe(MOCK_ROOT)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('openWorkspace calls addRecentWorkspace', async () => {
    mockedIpc.openWorkspace.mockResolvedValue(MOCK_OPEN_RESULT)

    await useWorkspaceStore.getState().openWorkspace(MOCK_ROOT)

    expect(mockedIpc.addRecentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: MOCK_CONFIG.name,
        path: MOCK_ROOT
      })
    )
  })

  it('openWorkspace calls scanFiles', async () => {
    mockedIpc.openWorkspace.mockResolvedValue(MOCK_OPEN_RESULT)

    await useWorkspaceStore.getState().openWorkspace(MOCK_ROOT)

    // scanFiles is called async via refreshFileTree — wait for microtask
    await vi.waitFor(() => {
      expect(mockedIpc.scanFiles).toHaveBeenCalledWith(MOCK_ROOT)
    })
  })

  it('openWorkspace sets error on failure', async () => {
    mockedIpc.openWorkspace.mockRejectedValue(new Error('Not a workspace'))

    // openWorkspace re-throws errors after setting error state
    await expect(
      useWorkspaceStore.getState().openWorkspace('/bad/path')
    ).rejects.toThrow('Not a workspace')

    const state = useWorkspaceStore.getState()
    expect(state.error).toBe('Not a workspace')
    expect(state.rootPath).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  // -------------------------------------------------------------------------
  // createWorkspace
  // -------------------------------------------------------------------------

  it('createWorkspace sets config, session, and rootPath on success', async () => {
    mockedIpc.createWorkspace.mockResolvedValue(MOCK_OPEN_RESULT)

    await useWorkspaceStore.getState().createWorkspace(MOCK_ROOT, 'Test Workspace')

    const state = useWorkspaceStore.getState()
    expect(state.config).toEqual(MOCK_CONFIG)
    expect(state.session).toEqual(MOCK_SESSION)
    expect(state.rootPath).toBe(MOCK_ROOT)
    expect(state.isLoading).toBe(false)
  })

  it('createWorkspace sets error on failure', async () => {
    mockedIpc.createWorkspace.mockRejectedValue(new Error('Already exists'))

    await useWorkspaceStore.getState().createWorkspace(MOCK_ROOT, 'Test')

    const state = useWorkspaceStore.getState()
    expect(state.error).toBe('Already exists')
    expect(state.rootPath).toBeNull()
  })

  // -------------------------------------------------------------------------
  // closeWorkspace
  // -------------------------------------------------------------------------

  it('closeWorkspace resets workspace state', async () => {
    // First open a workspace
    mockedIpc.openWorkspace.mockResolvedValue(MOCK_OPEN_RESULT)
    mockedIpc.saveSession.mockResolvedValue(undefined)
    await useWorkspaceStore.getState().openWorkspace(MOCK_ROOT)

    // Then close it
    useWorkspaceStore.getState().closeWorkspace()

    const state = useWorkspaceStore.getState()
    expect(state.config).toBeNull()
    expect(state.session).toBeNull()
    expect(state.rootPath).toBeNull()
    expect(state.fileTree).toEqual([])
  })

  // -------------------------------------------------------------------------
  // updateConfig
  // -------------------------------------------------------------------------

  it('updateConfig merges partial config and persists', async () => {
    // Open workspace first
    mockedIpc.openWorkspace.mockResolvedValue(MOCK_OPEN_RESULT)
    mockedIpc.saveConfig.mockResolvedValue(undefined)
    await useWorkspaceStore.getState().openWorkspace(MOCK_ROOT)

    await useWorkspaceStore.getState().updateConfig({ name: 'Renamed' })

    const state = useWorkspaceStore.getState()
    expect(state.config?.name).toBe('Renamed')
    expect(mockedIpc.saveConfig).toHaveBeenCalledWith(
      MOCK_ROOT,
      expect.objectContaining({ name: 'Renamed' })
    )
  })

  it('updateConfig does nothing when no workspace is open', async () => {
    await useWorkspaceStore.getState().updateConfig({ name: 'Noop' })
    expect(mockedIpc.saveConfig).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // updateSession
  // -------------------------------------------------------------------------

  it('updateSession merges partial session state', async () => {
    mockedIpc.openWorkspace.mockResolvedValue(MOCK_OPEN_RESULT)
    await useWorkspaceStore.getState().openWorkspace(MOCK_ROOT)

    useWorkspaceStore.getState().updateSession({ sidebarWidth: 300 })

    const state = useWorkspaceStore.getState()
    expect(state.session?.sidebarWidth).toBe(300)
  })

  it('updateSession does nothing when no workspace is open', () => {
    useWorkspaceStore.getState().updateSession({ sidebarWidth: 300 })
    expect(useWorkspaceStore.getState().session).toBeNull()
  })

  // -------------------------------------------------------------------------
  // loadRecentWorkspaces
  // -------------------------------------------------------------------------

  it('loadRecentWorkspaces populates recentWorkspaces', async () => {
    mockedIpc.getRecentWorkspaces.mockResolvedValue(MOCK_RECENTS)

    await useWorkspaceStore.getState().loadRecentWorkspaces()

    expect(useWorkspaceStore.getState().recentWorkspaces).toEqual(MOCK_RECENTS)
  })

  // -------------------------------------------------------------------------
  // removeRecentWorkspace
  // -------------------------------------------------------------------------

  it('removeRecentWorkspace updates the list', async () => {
    const remaining = [MOCK_RECENTS[1]]
    mockedIpc.removeRecentWorkspace.mockResolvedValue(remaining)

    await useWorkspaceStore.getState().removeRecentWorkspace(MOCK_RECENTS[0].path)

    expect(useWorkspaceStore.getState().recentWorkspaces).toEqual(remaining)
    expect(mockedIpc.removeRecentWorkspace).toHaveBeenCalledWith(MOCK_RECENTS[0].path)
  })

  // -------------------------------------------------------------------------
  // refreshFileTree
  // -------------------------------------------------------------------------

  it('refreshFileTree updates fileTree from IPC', async () => {
    mockedIpc.openWorkspace.mockResolvedValue(MOCK_OPEN_RESULT)
    await useWorkspaceStore.getState().openWorkspace(MOCK_ROOT)

    const mockTree = [
      { name: 'diagram.excalidraw', path: 'diagram.excalidraw', isDirectory: false as const }
    ]
    mockedIpc.scanFiles.mockResolvedValue(mockTree)

    await useWorkspaceStore.getState().refreshFileTree()

    expect(useWorkspaceStore.getState().fileTree).toEqual(mockTree)
  })

  it('refreshFileTree does nothing when no workspace is open', async () => {
    mockedIpc.scanFiles.mockClear()
    await useWorkspaceStore.getState().refreshFileTree()
    expect(mockedIpc.scanFiles).not.toHaveBeenCalled()
  })
})
