import type { DrawspaceApi } from '../renderer/src/types/ipc'

declare global {
  interface Window {
    api: DrawspaceApi
  }
}
