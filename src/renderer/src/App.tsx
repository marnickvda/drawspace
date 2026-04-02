import { useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { onBeforeClose, onSaveAndClose, sendCloseResponse, sendSaveComplete } from '@/lib/ipc'
import { saveActiveFile } from '@/lib/saveService'

/**
 * Apply system theme (light/dark) when no workspace is open.
 * Once a workspace opens, the useTheme hook in AppShell takes over.
 */
function useSystemThemeFallback(hasWorkspace: boolean): void {
  useEffect(() => {
    if (hasWorkspace) return // AppShell's useTheme handles it

    const query = window.matchMedia('(prefers-color-scheme: dark)')

    function apply(): void {
      if (query.matches) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [hasWorkspace])
}

/**
 * Close protection — always mounted so the native close button works
 * regardless of whether a workspace is open (AppShell) or not (WelcomeScreen).
 */
function useCloseProtection(): void {
  useEffect(() => {
    const unsubBeforeClose = onBeforeClose(() => {
      const { isDirty } = useWorkspaceStore.getState()
      sendCloseResponse(isDirty ? 1 : 0)
    })

    const unsubSaveAndClose = onSaveAndClose(() => {
      saveActiveFile()
        .then(() => {
          sendSaveComplete()
        })
        .catch((err) => {
          console.error('Failed to save before close:', err)
          sendSaveComplete()
        })
    })

    return () => {
      unsubBeforeClose()
      unsubSaveAndClose()
    }
  }, [])
}

/**
 * Full-screen loading spinner shown while a workspace is being opened.
 */
function WorkspaceLoadingScreen(): React.JSX.Element {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      <p className="text-sm text-muted-foreground">Opening workspace...</p>
    </div>
  )
}

/**
 * Root app component.
 * Simple conditional render: WelcomeScreen when no workspace is open,
 * AppShell when one is. No react-router needed.
 */
function App(): React.JSX.Element {
  const isOpen = useWorkspaceStore((s) => s.rootPath !== null)
  const isLoading = useWorkspaceStore((s) => s.isLoading)

  // Apply system theme on WelcomeScreen; AppShell's useTheme takes over when open
  useSystemThemeFallback(isOpen)

  // Close protection must always be active (not just when AppShell is mounted)
  useCloseProtection()

  return (
    <>
      {isLoading && !isOpen ? (
        <WorkspaceLoadingScreen />
      ) : isOpen ? (
        <AppShell />
      ) : (
        <WelcomeScreen />
      )}
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
