import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Table, Column, Row, Prefix, CategoryClass, CategoryProperty, DataDomain } from '../model/types'

interface TableStore {
  prefix: Prefix
  tables: Table[]
  rows: Row[]
  categoryClasses: CategoryClass[]
  categoryProperties: CategoryProperty[]
  categoryTurtleContent: string
  dataDomains: DataDomain[]

  // カテゴリー操作
  loadCategoryClasses: (classes: CategoryClass[]) => void
  loadCategoryProperties: (properties: CategoryProperty[]) => void
  setCategoryTurtleContent: (content: string) => void

  // データドメイン操作
  addDataDomain: (name: string, parentCategory: string, dataType: 'string' | 'number' | 'boolean' | 'date') => void
  updateDataDomain: (domainId: string, updates: Partial<DataDomain>) => void
  removeDataDomain: (domainId: string) => void

  // プレフィックス操作
  updatePrefix: (prefix: Partial<Prefix>) => void

  // インポート/エクスポート
  importSchema: (prefix: Prefix, tables: Table[]) => void

  // テーブル操作
  addTable: (name: string) => void
  updateTable: (tableId: string, updates: Partial<Table>) => void
  renameTable: (tableId: string, newName: string) => void
  removeTable: (tableId: string) => void

  // 列操作
  addColumn: (tableId: string, column: Omit<Column, 'id'>) => void
  updateColumn: (tableId: string, columnId: string, updates: Partial<Column>) => void
  removeColumn: (tableId: string, columnId: string) => void
  moveColumn: (tableId: string, columnId: string, direction: 'up' | 'down') => void

  // 行操作
  addRow: (tableId: string, data: Record<string, any>) => void
  updateRow: (rowId: string, data: Record<string, any>) => void
  removeRow: (rowId: string) => void
}

export const useTableStore = create<TableStore>()(
  persist(
    (set) => ({
      prefix: {
        name: '',
        uri: ''
      },
      tables: [],
      rows: [],
      categoryClasses: [],
      categoryProperties: [],
      categoryTurtleContent: '',
      dataDomains: [],

      loadCategoryClasses: (classes) => set(() => ({
        categoryClasses: classes
      })),

      loadCategoryProperties: (properties) => set(() => ({
        categoryProperties: properties
      })),

      setCategoryTurtleContent: (content) => set(() => ({
        categoryTurtleContent: content
      })),

      addDataDomain: (name, parentCategory, dataType) => set((state) => ({
        dataDomains: [...state.dataDomains, {
          id: `domain_${Date.now()}`,
          name,
          parentCategory,
          dataType
        }]
      })),

      updateDataDomain: (domainId, updates) => set((state) => ({
        dataDomains: state.dataDomains.map(d =>
          d.id === domainId ? { ...d, ...updates } : d
        )
      })),

      removeDataDomain: (domainId) => set((state) => ({
        dataDomains: state.dataDomains.filter(d => d.id !== domainId)
      })),

      updatePrefix: (prefix) => set((state) => ({
        prefix: { ...state.prefix, ...prefix }
      })),

  importSchema: (prefix, tables) => set(() => {
    // 参照先テーブル名をIDに変換
    const tableNameToId = new Map<string, string>()
    tables.forEach(t => tableNameToId.set(t.name, t.id))

    const resolvedTables = tables.map(table => ({
      ...table,
      columns: table.columns.map(col => {
        if (col.isForeignKey && col.referencedTable) {
          const referencedId = tableNameToId.get(col.referencedTable)
          return { ...col, referencedTable: referencedId }
        }
        return col
      })
    }))

    return {
      prefix,
      tables: resolvedTables,
      rows: []
    }
  }),

  addTable: (name) => set((state) => ({
    tables: [...state.tables, {
      id: `table_${Date.now()}`,
      name,
      columns: []
    }]
  })),

  updateTable: (tableId, updates) => set((state) => ({
    tables: state.tables.map(t =>
      t.id === tableId ? { ...t, ...updates } : t
    )
  })),

  renameTable: (tableId, newName) => set((state) => ({
    tables: state.tables.map(t =>
      t.id === tableId ? { ...t, name: newName } : t
    )
  })),

  removeTable: (tableId) => set((state) => ({
    tables: state.tables.filter(t => t.id !== tableId),
    rows: state.rows.filter(r => r.tableId !== tableId)
  })),

  addColumn: (tableId, column) => set((state) => ({
    tables: state.tables.map(t =>
      t.id === tableId
        ? { ...t, columns: [...t.columns, { ...column, id: `col_${Date.now()}` }] }
        : t
    )
  })),

  updateColumn: (tableId, columnId, updates) => set((state) => ({
    tables: state.tables.map(t =>
      t.id === tableId
        ? {
            ...t,
            columns: t.columns.map(c =>
              c.id === columnId ? { ...c, ...updates } : c
            )
          }
        : t
    )
  })),

  removeColumn: (tableId, columnId) => set((state) => ({
    tables: state.tables.map(t =>
      t.id === tableId
        ? { ...t, columns: t.columns.filter(c => c.id !== columnId) }
        : t
    )
  })),

  moveColumn: (tableId, columnId, direction) => set((state) => ({
    tables: state.tables.map(t => {
      if (t.id !== tableId) return t

      const index = t.columns.findIndex(c => c.id === columnId)
      if (index === -1) return t

      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= t.columns.length) return t

      const newColumns = [...t.columns]
      const [removed] = newColumns.splice(index, 1)
      newColumns.splice(newIndex, 0, removed)

      return { ...t, columns: newColumns }
    })
  })),

  addRow: (tableId, data) => set((state) => ({
    rows: [...state.rows, {
      tableId,
      id: `row_${Date.now()}`,
      data
    }]
  })),

  updateRow: (rowId, data) => set((state) => ({
    rows: state.rows.map(r =>
      r.id === rowId ? { ...r, data: { ...r.data, ...data } } : r
    )
  })),

  removeRow: (rowId) => set((state) => ({
    rows: state.rows.filter(r => r.id !== rowId)
  }))
    }),
    {
      name: 'rdf-table-editor-storage',
    }
  )
)
