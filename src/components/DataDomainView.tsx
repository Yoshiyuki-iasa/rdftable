import { useState, useRef, useEffect } from 'react'
import { useTableStore } from '../store/tableStore'
import './DataDomainView.css'

export default function DataDomainView() {
  const { dataDomains, categoryProperties, addDataDomain, updateDataDomain, removeDataDomain } = useTableStore()
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [addingCategory, setAddingCategory] = useState<string | null>(null)
  const [newDomainName, setNewDomainName] = useState('')
  const [newDomainDataType, setNewDomainDataType] = useState<'string' | 'number' | 'boolean' | 'date'>('string')
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleStartAddDomain = (categoryUri: string) => {
    setAddingCategory(categoryUri)
    setNewDomainName('')
    setNewDomainDataType('string')
    setShowAddMenu(false)
  }

  const handleAddDomain = () => {
    if (!addingCategory) return

    const trimmedName = newDomainName.trim()
    if (!trimmedName) return

    // 重複チェック
    if (dataDomains.some(d => d.name === trimmedName)) {
      alert(`データドメイン名 "${trimmedName}" は既に存在します`)
      return
    }

    addDataDomain(trimmedName, addingCategory, newDomainDataType)
    setNewDomainName('')
    setAddingCategory(null)
  }

  const handleCancelAdd = () => {
    setNewDomainName('')
    setAddingCategory(null)
  }

  const handleStartEditDomainName = (domainId: string, currentName: string) => {
    setEditValue(currentName)
    setEditingDomainId(domainId)
  }

  const handleSaveDomainName = () => {
    if (!editingDomainId) {
      setEditingDomainId(null)
      return
    }

    const trimmedName = editValue.trim()
    if (!trimmedName) {
      setEditingDomainId(null)
      return
    }

    const currentDomain = dataDomains.find(d => d.id === editingDomainId)
    if (!currentDomain) {
      setEditingDomainId(null)
      return
    }

    if (trimmedName === currentDomain.name) {
      setEditingDomainId(null)
      return
    }

    // 重複チェック
    if (dataDomains.some(d => d.id !== editingDomainId && d.name === trimmedName)) {
      alert(`データドメイン名 "${trimmedName}" は既に存在します`)
      return
    }

    updateDataDomain(editingDomainId, { name: trimmedName })
    setEditingDomainId(null)
  }

  // カテゴリ別にグループ化
  const domainsByCategory = categoryProperties.map(category => ({
    category,
    domains: dataDomains.filter(d => d.parentCategory === category.uri)
  }))

  return (
    <div className="data-domain-view">
      <div className="domain-header">
        <h2>データドメイン編集</h2>
        <p className="domain-description">
          データドメインは論理的なデータの種類を表します（例：金額、電話番号、都道府県コード）
        </p>
      </div>

      <div className="add-domain-section" ref={menuRef}>
        <button
          className="add-domain-btn"
          onClick={() => setShowAddMenu(!showAddMenu)}
        >
          + データドメインを追加 ▼
        </button>
        {showAddMenu && (
          <div className="add-menu">
            {categoryProperties.map(cat => (
              <div
                key={cat.uri}
                className="add-menu-item"
                onClick={() => handleStartAddDomain(cat.uri)}
              >
                {cat.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {domainsByCategory.map(({ category, domains }) => (
        <div key={category.uri} className="category-section">
          <h3 className="category-title">
            {category.label}
            <span className="category-count">({domains.length})</span>
          </h3>

          {addingCategory === category.uri && (
            <div className="add-domain-form">
              <input
                type="text"
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
                placeholder="データドメイン名（例：金額、電話番号）"
                autoFocus
              />
              <select
                value={newDomainDataType}
                onChange={(e) => setNewDomainDataType(e.target.value as any)}
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="date">date</option>
              </select>
              <button onClick={handleAddDomain}>追加</button>
              <button onClick={handleCancelAdd}>キャンセル</button>
            </div>
          )}

          <table className="domain-table">
            <thead>
              <tr>
                <th>物理名</th>
                <th>論理名</th>
                <th>データ型</th>
                <th>説明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => (
                <tr key={domain.id}>
                  <td>
                    {editingDomainId === domain.id ? (
                      <input
                        type="text"
                        className="edit-domain-name"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveDomainName()
                          if (e.key === 'Escape') setEditingDomainId(null)
                        }}
                        onBlur={handleSaveDomainName}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="domain-name"
                        onClick={() => handleStartEditDomainName(domain.id, domain.name)}
                      >
                        {domain.name}
                      </span>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      className="domain-label"
                      placeholder="論理名"
                      value={domain.label || ''}
                      onChange={(e) => updateDataDomain(domain.id, { label: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="domain-datatype"
                      value={domain.dataType}
                      onChange={(e) => updateDataDomain(domain.id, { dataType: e.target.value as any })}
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="domain-comment"
                      placeholder="説明"
                      value={domain.comment || ''}
                      onChange={(e) => updateDataDomain(domain.id, { comment: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      className="delete-btn"
                      onClick={() => {
                        if (confirm(`データドメイン "${domain.name}" を削除しますか？`)) {
                          removeDataDomain(domain.id)
                        }
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {domains.length === 0 && addingCategory !== category.uri && (
                <tr>
                  <td colSpan={5} className="empty-message">
                    データドメインがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
