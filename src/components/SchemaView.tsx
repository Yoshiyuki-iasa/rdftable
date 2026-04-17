import { useState } from 'react'
import { useTableStore } from '../store/tableStore'
import FilterableSelect from './FilterableSelect'
import './SchemaView.css'

interface SchemaViewProps {
  selectedTable: string | null
}

export default function SchemaView({ selectedTable }: SchemaViewProps) {
  const { tables, categoryClasses, dataDomains, addColumn, updateColumn, removeColumn, removeTable, renameTable, moveColumn, updateTable } = useTableStore()
  const [isAdding, setIsAdding] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [editingTableName, setEditingTableName] = useState(false)
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const table = tables.find(t => t.id === selectedTable)

  if (!selectedTable || !table) {
    return (
      <div className="schema-view empty">
        <p>テーブルを選択してください</p>
      </div>
    )
  }

  const handleAddColumn = () => {
    const trimmedName = newColumnName.trim()
    if (!trimmedName) return

    // 重複チェック（全テーブル横断）
    const isDuplicate = tables.some(t =>
      t.columns.some(c => c.name === trimmedName)
    )
    if (isDuplicate) {
      alert(`列名 "${trimmedName}" は既に他のテーブルで使用されています。\nRDF的にプロパティは全体でユニークである必要があります。`)
      return
    }

    addColumn(selectedTable, {
      name: trimmedName,
      isPrimaryKey: false,
      isForeignKey: false,
      dataType: 'string'
    })
    setNewColumnName('')
    setIsAdding(false)
  }

  const handleStartEditTableName = () => {
    setEditValue(table.name)
    setEditingTableName(true)
  }

  const handleSaveTableName = () => {
    const trimmedName = editValue.trim()
    if (!trimmedName) {
      setEditingTableName(false)
      return
    }

    // 変更がない場合はそのまま終了
    if (trimmedName === table.name) {
      setEditingTableName(false)
      return
    }

    // 重複チェック（他のテーブルと）
    if (tables.some(t => t.id !== selectedTable && t.name === trimmedName)) {
      alert(`テーブル名 "${trimmedName}" は既に存在します`)
      return
    }

    renameTable(selectedTable, trimmedName)
    setEditingTableName(false)
  }

  const handleStartEditColumnName = (columnId: string, currentName: string) => {
    setEditValue(currentName)
    setEditingColumnId(columnId)
  }

  const handleSaveColumnName = () => {
    if (!editingColumnId) {
      setEditingColumnId(null)
      return
    }

    const trimmedName = editValue.trim()
    if (!trimmedName) {
      setEditingColumnId(null)
      return
    }

    // 現在の列名を取得
    const currentColumn = table.columns.find(c => c.id === editingColumnId)
    if (!currentColumn) {
      setEditingColumnId(null)
      return
    }

    // 変更がない場合はそのまま終了
    if (trimmedName === currentColumn.name) {
      setEditingColumnId(null)
      return
    }

    // 重複チェック（全テーブル横断、自分以外）
    const isDuplicate = tables.some(t =>
      t.columns.some(c => c.id !== editingColumnId && c.name === trimmedName)
    )
    if (isDuplicate) {
      alert(`列名 "${trimmedName}" は既に他のテーブルで使用されています。\nRDF的にプロパティは全体でユニークである必要があります。`)
      return
    }

    updateColumn(selectedTable, editingColumnId, { name: trimmedName })
    setEditingColumnId(null)
  }

  return (
    <div className="schema-view">
      <div className="schema-header">
        <div className="table-name-section">
          {editingTableName ? (
            <input
              type="text"
              className="edit-table-name"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTableName()
                if (e.key === 'Escape') setEditingTableName(false)
              }}
              onBlur={handleSaveTableName}
              autoFocus
            />
          ) : (
            <>
              <h2>テーブル: {table.name}</h2>
              <button className="edit-btn" onClick={handleStartEditTableName}>
                ✏️
              </button>
            </>
          )}
        </div>
        <button
          className="delete-table-btn"
          onClick={() => {
            if (confirm(`テーブル "${table.name}" を削除しますか？`)) {
              removeTable(selectedTable)
            }
          }}
        >
          テーブル削除
        </button>
      </div>

      <div className="table-metadata">
        <select
          className="table-category"
          value={table.parentClass || ''}
          onChange={(e) => updateTable(selectedTable, { parentClass: e.target.value || undefined })}
        >
          <option value="">テーブルの種類</option>
          {categoryClasses.map((cls) => (
            <option key={cls.uri} value={cls.uri}>
              {cls.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="table-label"
          placeholder="テーブル論理名"
          value={table.label || ''}
          onChange={(e) => updateTable(selectedTable, { label: e.target.value })}
        />
        <input
          type="text"
          className="table-comment"
          placeholder="テーブルの説明"
          value={table.comment || ''}
          onChange={(e) => updateTable(selectedTable, { comment: e.target.value })}
        />
        <select
          className="table-parent-user-class"
          value={table.parentUserClass || ''}
          onChange={(e) => updateTable(selectedTable, { parentUserClass: e.target.value || undefined })}
        >
          <option value="">上位クラス選択</option>
          {tables.filter(t => t.id !== selectedTable).map(t => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <table className="schema-table">
        <thead>
          <tr>
            <th>順序</th>
            <th>物理名</th>
            <th>論理名</th>
            <th>PK</th>
            <th>FK</th>
            <th>参照先</th>
            <th>データドメイン</th>
            <th>型</th>
            <th>属性の説明</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {table.columns.map((column, index) => (
            <tr key={column.id}>
              <td>
                <div className="order-buttons">
                  <button
                    className="order-btn"
                    onClick={() => moveColumn(selectedTable, column.id, 'up')}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="order-btn"
                    onClick={() => moveColumn(selectedTable, column.id, 'down')}
                    disabled={index === table.columns.length - 1}
                  >
                    ↓
                  </button>
                </div>
              </td>
              <td>
                {editingColumnId === column.id ? (
                  <input
                    type="text"
                    className="edit-column-name"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveColumnName()
                      if (e.key === 'Escape') setEditingColumnId(null)
                    }}
                    onBlur={handleSaveColumnName}
                    autoFocus
                  />
                ) : (
                  <span
                    className="column-name"
                    onClick={() => handleStartEditColumnName(column.id, column.name)}
                  >
                    {column.name}
                  </span>
                )}
              </td>
              <td>
                <input
                  type="text"
                  className="column-label"
                  placeholder="論理名"
                  value={column.label || ''}
                  onChange={(e) => updateColumn(selectedTable, column.id, { label: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={column.isPrimaryKey}
                  onChange={(e) => updateColumn(selectedTable, column.id, { isPrimaryKey: e.target.checked })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={column.isForeignKey}
                  onChange={(e) => {
                    const updates: Partial<typeof column> = { isForeignKey: e.target.checked }
                    // FKをONにする場合、データドメインをクリア（ObjectPropertyにDatatypePropertyのsuperPropertyは付けられない）
                    if (e.target.checked) {
                      updates.dataDomain = undefined
                    }
                    updateColumn(selectedTable, column.id, updates)
                  }}
                />
              </td>
              <td>
                {column.isForeignKey ? (
                  <FilterableSelect
                    value={column.referencedTable || ''}
                    options={tables.map(t => ({ value: t.id, label: t.name }))}
                    onChange={(value) => updateColumn(selectedTable, column.id, { referencedTable: value })}
                    placeholder="参照先テーブル"
                  />
                ) : (
                  <span>--</span>
                )}
              </td>
              <td>
                {column.isForeignKey ? (
                  <span>--</span>
                ) : (
                  <FilterableSelect
                    value={column.dataDomain || ''}
                    options={[
                      { value: '', label: '' },
                      ...dataDomains.map(d => ({ value: d.id, label: `${d.name} (${d.dataType})` }))
                    ]}
                    onChange={(value) => {
                      if (value) {
                        const selectedDomain = dataDomains.find(d => d.id === value)
                        if (selectedDomain) {
                          updateColumn(selectedTable, column.id, {
                            dataDomain: selectedDomain.id,
                            dataType: selectedDomain.dataType
                          })
                        }
                      } else {
                        updateColumn(selectedTable, column.id, { dataDomain: undefined })
                      }
                    }}
                    placeholder="データドメイン"
                  />
                )}
              </td>
              <td>
                {column.isForeignKey ? (
                  <span>--</span>
                ) : (
                  <select
                    value={column.dataType}
                    onChange={(e) => updateColumn(selectedTable, column.id, { dataType: e.target.value as any })}
                    disabled={!!column.dataDomain}
                    title={column.dataDomain ? 'データドメインで型が決定されています' : ''}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="date">date</option>
                  </select>
                )}
              </td>
              <td>
                <input
                  type="text"
                  className="column-comment"
                  placeholder="属性の説明"
                  value={column.comment || ''}
                  onChange={(e) => updateColumn(selectedTable, column.id, { comment: e.target.value })}
                />
              </td>
              <td>
                <button
                  className="delete-btn"
                  onClick={() => removeColumn(selectedTable, column.id)}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isAdding ? (
        <div className="add-column-form">
          <input
            type="text"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
            placeholder="列名"
            autoFocus
          />
          <button onClick={handleAddColumn}>追加</button>
          <button onClick={() => setIsAdding(false)}>キャンセル</button>
        </div>
      ) : (
        <button className="add-column-btn" onClick={() => setIsAdding(true)}>
          + テーブル列を追加
        </button>
      )}
    </div>
  )
}
