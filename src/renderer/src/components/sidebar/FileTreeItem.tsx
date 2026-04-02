/**
 * FileTreeItem -- single node in the file tree.
 *
 * Features:
 *   - Folder/file icons (folder open/closed, .excalidraw file)
 *   - Name label with truncation + tooltip
 *   - Active highlight (if file is open in active tab)
 *   - Dirty indicator (dot if unsaved changes)
 *   - Inline rename mode (double-click or F2)
 *   - Context menu: New Drawing, New Folder, Rename, Duplicate, Delete, Reveal, Copy Path
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { FileNode } from "@/types/ipc";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function FolderOpenIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 0 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FileTreeItemProps {
  node: FileNode;
  depth: number;
  isExpanded: boolean;
  isActive: boolean;
  isDirty: boolean;
  isFocused: boolean;
  onToggleExpand: (path: string) => void;
  onSelect: (node: FileNode) => void;
  onRename: (oldPath: string, newName: string) => void;
  onNewFile: (folderPath: string) => void;
  onNewFolder: (folderPath: string) => void;
  onDuplicate: (path: string) => void;
  onDelete: (path: string, isDirectory: boolean) => void;
  onRevealInFinder: (path: string) => void;
  onCopyPath: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileTreeItem({
  node,
  depth,
  isExpanded,
  isActive,
  isDirty,
  isFocused,
  onToggleExpand,
  onSelect,
  onRename,
  onNewFile,
  onNewFolder,
  onDuplicate,
  onDelete,
  onRevealInFinder,
  onCopyPath,
}: FileTreeItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      // Select the name without the extension
      const dotIndex = renameValue.lastIndexOf(".");
      inputRef.current.focus();
      if (dotIndex > 0 && !node.isDirectory) {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, [isRenaming]);

  const startRename = useCallback(() => {
    setRenameValue(node.name);
    setIsRenaming(true);
  }, [node.name]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) {
      onRename(node.path, trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, node.name, node.path, onRename]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue(node.name);
  }, [node.name]);

  const handleClick = useCallback(() => {
    if (node.isDirectory) {
      onToggleExpand(node.path);
    } else {
      onSelect(node);
    }
  }, [node, onToggleExpand, onSelect]);

  const handleDoubleClick = useCallback(() => {
    if (!node.isDirectory) {
      startRename();
    }
  }, [node.isDirectory, startRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        startRename();
      }
    },
    [startRename],
  );

  // Determine the folder path for "New Drawing in this folder" / "New Folder"
  const contextFolderPath = node.isDirectory
    ? node.path
    : node.path.replace(/\/[^/]+$/, "") || "";

  // Display name: strip .excalidraw extension for files
  const displayName = node.isDirectory
    ? node.name
    : node.name.replace(/\.excalidraw$/, "");

  // Indentation: 20px per depth level + 8px base padding
  const paddingLeft = depth * 20 + 8;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="treeitem"
          aria-expanded={node.isDirectory ? isExpanded : undefined}
          aria-selected={isActive}
          aria-label={`${node.isDirectory ? "Folder" : "Drawing"}: ${displayName}${isDirty ? " (unsaved)" : ""}`}
          tabIndex={isFocused ? 0 : -1}
          data-path={node.path}
          className={`
            group flex h-8 cursor-pointer items-center gap-2 rounded-md pr-3 text-sm
            transition-colors select-none justify-start
            ${
              isActive
                ? "bg-accent font-medium text-accent-foreground"
                : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
            }
            ${isFocused ? "outline-none ring-1 ring-ring" : ""}
          `}
          style={{ paddingLeft }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
        >
          {/* Expand/collapse chevron (folders only) */}
          {node.isDirectory ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <ChevronRightIcon
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
              />
            </span>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}

          {/* Icon */}
          {node.isDirectory ? (
            isExpanded ? (
              <FolderOpenIcon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            ) : (
              <FolderIcon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            )
          ) : (
            <FileIcon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          )}

          {/* Name / Inline rename */}
          {isRenaming ? (
            <Input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-6 min-w-0 flex-1 rounded-sm border-none bg-background px-1.5 py-0 text-sm shadow-none focus-visible:ring-1"
            />
          ) : (
            <TooltipProvider delayDuration={600}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="min-w-0 flex-1 truncate">{displayName}</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">{node.path}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Dirty indicator */}
          {isDirty && !isRenaming && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-foreground/60" />
          )}
        </div>
      </ContextMenuTrigger>

      {/* Context menu */}
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onNewFile(contextFolderPath)}>
          New Drawing
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onNewFolder(contextFolderPath)}>
          New Folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={startRename}>
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDuplicate(node.path)}>
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onRevealInFinder(node.path)}>
          Reveal in Finder
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCopyPath(node.path)}>
          Copy Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => onDelete(node.path, node.isDirectory)}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
