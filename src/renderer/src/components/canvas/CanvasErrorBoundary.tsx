/**
 * CanvasErrorBoundary — React error boundary wrapping Excalidraw.
 *
 * On crash:
 *   - Shows "Something went wrong" with drawing name
 *   - Offers "Reload Drawing" (remount) and "Close File" actions
 *   - Logs error for debugging
 */

import React from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Fallback UI (function component)
// ---------------------------------------------------------------------------

interface FallbackProps {
  error: Error
  fileName: string
  onRetry: () => void
}

function CanvasErrorFallback({ error, fileName, onRetry }: FallbackProps) {
  const closeFile = useWorkspaceStore((s) => s.closeFile)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8">
      <div className="text-center">
        <p className="text-lg font-medium text-destructive">
          Something went wrong
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Failed to render &ldquo;{fileName}&rdquo;
        </p>
        <pre className="mt-4 max-h-32 max-w-md overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          Reload Drawing
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
  )
}

// ---------------------------------------------------------------------------
// Error Boundary (class component — React requires it)
// ---------------------------------------------------------------------------

interface Props {
  filePath: string
  fileName: string
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class CanvasErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[CanvasErrorBoundary] Excalidraw crash in "${this.props.fileName}":`,
      error,
      errorInfo
    )
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <CanvasErrorFallback
          error={this.state.error}
          fileName={this.props.fileName}
          onRetry={this.handleRetry}
        />
      )
    }
    return this.props.children
  }
}
