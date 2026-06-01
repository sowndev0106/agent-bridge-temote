import type { TreeDataProvider, TreeItem, TreeItemIndex, Disposable } from 'react-complex-tree'
import { api } from './api'
import type { FileEntry } from '../../types'

export interface FileTreeData {
  entry: FileEntry | null // null for the synthetic root
}

// Builds a TreeDataProvider for one project. Children of a folder are lazily
// fetched the first time the folder is expanded, then cached.
export function createFileTreeProvider(projectId: string): TreeDataProvider<FileTreeData> {
  const items = new Map<TreeItemIndex, TreeItem<FileTreeData>>()
  const listeners = new Set<(changedItemIds: TreeItemIndex[]) => void>()

  // Synthetic root
  items.set('', {
    index: '',
    isFolder: true,
    children: undefined,
    data: { entry: null }
  })

  const toItem = (entry: FileEntry): TreeItem<FileTreeData> => ({
    index: entry.path,
    isFolder: entry.type === 'directory',
    children: undefined,
    data: { entry }
  })

  const loadChildren = async (index: TreeItemIndex): Promise<TreeItemIndex[]> => {
    const path = index === '' ? '' : String(index)
    const res = await api.listProjectFiles(projectId, path)
    const sorted = [...res.entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const e of sorted) if (!items.has(e.path)) items.set(e.path, toItem(e))
    const parent = items.get(index)
    if (parent) parent.children = sorted.map(e => e.path)
    return sorted.map(e => e.path)
  }

  return {
    async getTreeItem(index: TreeItemIndex): Promise<TreeItem<FileTreeData>> {
      const item = items.get(index)
      if (item && (item.children !== undefined || !item.isFolder)) return item
      // Folder not yet loaded — load children then return.
      await loadChildren(index)
      return items.get(index)!
    },
    async getTreeItems(indices: TreeItemIndex[]): Promise<TreeItem<FileTreeData>[]> {
      return Promise.all(indices.map(i => this.getTreeItem!(i)))
    },
    onDidChangeTreeData(listener: (changedItemIds: TreeItemIndex[]) => void): Disposable {
      listeners.add(listener)
      return { dispose: () => { listeners.delete(listener) } }
    }
  }
}
