import { useMemo } from 'react'
import { UncontrolledTreeEnvironment, Tree, type TreeItem } from 'react-complex-tree'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { createFileTreeProvider, type FileTreeData } from '../lib/fileTreeProvider'
import { fileIconSpec } from '../lib/fileIcons'
import { useEditorStore } from '../stores/editor'
import type { Project } from '../../types'

export default function FileTree({ project }: { project: Project }) {
  // Recreate the provider when the project changes so caches don't leak across projects.
  const dataProvider = useMemo(() => createFileTreeProvider(project.id), [project.id])
  const openFile = useEditorStore(s => s.openFile)

  return (
    <div className="rb-filetree rb-scrollbar min-h-0 flex-1 overflow-y-auto py-1 text-sm">
      <UncontrolledTreeEnvironment<FileTreeData>
        key={project.id}
        dataProvider={dataProvider}
        getItemTitle={(item) => item.data.entry?.name ?? project.name}
        viewState={{ ['file-tree']: {} }}
        canDragAndDrop={false}
        onPrimaryAction={(item: TreeItem<FileTreeData>) => {
          const entry = item.data.entry
          if (entry && entry.type !== 'directory') openFile(project.id, entry.path)
        }}
        renderItemArrow={({ item, context }) =>
          item.isFolder ? (
            <ChevronRight
              size={14}
              className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${context.isExpanded ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="w-[14px] shrink-0" />
          )
        }
        renderItemTitle={({ item, title, context }) => {
          if (item.isFolder) {
            const FolderIcon = context.isExpanded ? FolderOpen : Folder
            return (
              <span className="flex min-w-0 items-center gap-1.5">
                <FolderIcon size={15} className="shrink-0 text-[var(--color-text-muted)]" />
                <span className="truncate">{title}</span>
              </span>
            )
          }
          const { Icon, color } = fileIconSpec(item.data.entry?.name ?? title)
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon size={15} className="shrink-0" style={{ color }} />
              <span className="truncate">{title}</span>
            </span>
          )
        }}
        renderItem={({ depth, children, title, arrow, context }) => (
          <li {...context.itemContainerWithChildrenProps}>
            <div
              {...context.itemContainerWithoutChildrenProps}
              {...context.interactiveElementProps}
              style={{ paddingLeft: 4 + depth * 12 }}
              className={`flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-[3px] transition-colors ${
                context.isSelected
                  ? 'bg-[var(--color-accent-glow)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
              }`}
            >
              {arrow}
              {title}
            </div>
            {children}
          </li>
        )}
      >
        <Tree treeId="file-tree" rootItem="" treeLabel={`${project.name} files`} />
      </UncontrolledTreeEnvironment>
    </div>
  )
}
