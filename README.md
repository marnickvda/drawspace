# Drawspace

A desktop app for managing [Excalidraw](https://excalidraw.com) drawings in workspace-based projects. Think of it as a
local-first alternative to Excalidraw+ with a file tree and project structure.

## Features

- **Workspace-based file management** -- Open any folder as a workspace and browse `.excalidraw` files in a sidebar file
  tree.
- **Full Excalidraw editor** -- Draw, sketch, and diagram with the complete Excalidraw toolset.
- **Auto-save** -- Changes are saved automatically as you draw. The file tree shows an unsaved indicator when a file has
  pending changes.
- **File operations** -- Create, rename, duplicate, and delete drawings and folders directly from the sidebar. Reveal
  files in Finder or copy their path.
- **Command palette** -- Quick access to actions and file navigation via keyboard shortcut.
- **Export** -- Export drawings from the app.
- **`.excalidraw` file association** -- Double-click `.excalidraw` files in Finder to open them in Drawspace.
- **Recent workspaces** -- Quickly reopen previously used workspaces from the welcome screen.
- **Resizable sidebar** -- Drag the sidebar edge to resize or collapse it.
- **Dark mode** -- Follows your system theme.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- npm

### Install dependencies

```sh
npm install
```

### Run in development

```sh
npm run dev
```

### Build for distribution

```sh
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

Built artifacts are output to the `dist/` directory.

### Installing on macOS (ad-hoc signed builds)

Since the app is not notarized, macOS Gatekeeper will block it on first launch. To open it:

1. Right-click the app and select **Open**, then click **Open** in the dialog, or
2. Run `xattr -cr /Applications/Drawspace.app` after copying it to Applications.

This only needs to be done once.

## Tech Stack

- [Electron](https://www.electronjs.org) + [electron-vite](https://electron-vite.org)
- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Excalidraw](https://github.com/excalidraw/excalidraw)
- [Zustand](https://zustand.docs.pmnd.rs) for state management
- [Tailwind CSS](https://tailwindcss.com) + [Radix UI](https://www.radix-ui.com)
- [electron-builder](https://www.electron.build) for packaging

## License

MIT
