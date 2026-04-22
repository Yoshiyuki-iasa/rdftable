import { useState } from 'react'
import { useTableStore } from '../store/tableStore'
import './Sidebar.css'

interface SidebarProps {
  selectedTable: string | null
  showingRdf: boolean
  showingDataDomain: boolean
  showingGraph: boolean
  onSelectTable: (tableId: string) => void
  onShowRdf: () => void
  onShowDataDomain: () => void
  onShowGraph: () => void
}

export default function Sidebar({ selectedTable, showingRdf, showingDataDomain, showingGraph, onSelectTable, onShowRdf, onShowDataDomain, onShowGraph }: SidebarProps) {
  const { prefix, tables, categoryClasses, addTable, updatePrefix } = useTableStore()
  const [newTableName, setNewTableName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const handleAddTable = () => {
    const trimmedName = newTableName.trim()
    if (!trimmedName) return

    // 重複チェック
    if (tables.some(t => t.name === trimmedName)) {
      alert(`テーブル名 "${trimmedName}" は既に存在します`)
      return
    }

    addTable(trimmedName)
    setNewTableName('')
    setIsAdding(false)
  }

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  // テーブルをparentClassでグループ化
  const groupedTables = tables.reduce((acc, table) => {
    const groupKey = table.parentClass || 'uncategorized'
    if (!acc[groupKey]) {
      acc[groupKey] = []
    }
    acc[groupKey].push(table)
    return acc
  }, {} as Record<string, typeof tables>)

  // グループの表示順序を決定
  const sortedGroupKeys = Object.keys(groupedTables).sort((a, b) => {
    if (a === 'uncategorized') return 1
    if (b === 'uncategorized') return -1
    return 0
  })

  return (
    <div className="sidebar">
      <div className="prefix-section">
        <label className="prefix-label">プレフィックス</label>
        <input
          type="text"
          className="prefix-input"
          placeholder='プレフィクス名 (例: "ex")'
          value={prefix.name}
          onChange={(e) => updatePrefix({ name: e.target.value })}
        />
        <input
          type="text"
          className="prefix-input"
          placeholder='プレフィクス (例: "http://example.com/#")'
          value={prefix.uri}
          onChange={(e) => updatePrefix({ uri: e.target.value })}
        />
      </div>

      {isAdding ? (
        <div className="add-table-form">
          <input
            type="text"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTable()}
            placeholder="テーブル名"
            autoFocus
          />
          <button onClick={handleAddTable}>追加</button>
          <button onClick={() => setIsAdding(false)}>キャンセル</button>
        </div>
      ) : (
        <button className="add-button" onClick={() => setIsAdding(true)}>
          + テーブルを追加
        </button>
      )}

      <div className="table-list">
        {sortedGroupKeys.map(groupKey => {
          const groupTables = groupedTables[groupKey]
          const categoryClass = categoryClasses.find(c => c.uri === groupKey)
          const groupLabel = categoryClass ? categoryClass.label : '未分類'
          const isCollapsed = collapsedGroups.has(groupKey)

          return (
            <div key={groupKey} className="table-group">
              <div
                className="table-group-header"
                onClick={() => toggleGroup(groupKey)}
              >
                <span className="collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
                <span className="group-label">{groupLabel}</span>
                <span className="group-count">({groupTables.length})</span>
              </div>
              {!isCollapsed && (
                <ul className="table-group-list">
                  {groupTables.map(table => (
                    <li
                      key={table.id}
                      className={selectedTable === table.id && !showingRdf && !showingDataDomain && !showingGraph ? 'selected' : ''}
                      onClick={() => onSelectTable(table.id)}
                    >
                      {table.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <button
        className={`rdf-button ${showingDataDomain ? 'selected' : ''}`}
        onClick={onShowDataDomain}
      >
        データドメイン編集
      </button>

      <button
        className={`rdf-button ${showingRdf ? 'selected' : ''}`}
        onClick={onShowRdf}
      >
        RDF表示
      </button>

      <button
        className={`rdf-button ${showingGraph ? 'selected' : ''}`}
        onClick={onShowGraph}
      >
        📊 グラフ表示
      </button>
    </div>
  )
}
