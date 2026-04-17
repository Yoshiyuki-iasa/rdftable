import { useState, useRef } from 'react'
import { useTableStore } from '../store/tableStore'
import { generateTurtle } from '../model/rdf'
import { parseTurtle } from '../model/parser'
import './TurtlePanel.css'

export default function TurtlePanel() {
  const { prefix, tables, categoryTurtleContent, dataDomains, importSchema } = useTableStore()
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const turtleOutput = generateTurtle(prefix, tables, categoryTurtleContent, dataDomains)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(turtleOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = () => {
    const blob = new Blob([turtleOutput], { type: 'text/turtle' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prefix.name || 'schema'}.ttl`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      try {
        const { prefix: importedPrefix, tables: importedTables, dataDomains: importedDataDomains } = parseTurtle(content)
        importSchema(importedPrefix, importedTables, importedDataDomains)
        alert('インポートが完了しました')
      } catch (error) {
        console.error('Turtle parse error:', error)
        alert('Turtleファイルの読み込みに失敗しました')
      }
    }
    reader.readAsText(file)

    // リセット（同じファイルを再選択可能にする）
    e.target.value = ''
  }

  return (
    <div className="turtle-panel">
      <div className="turtle-header">
        <h3>Turtle出力</h3>
        <div className="turtle-actions">
          <button onClick={handleCopy} className="action-btn">
            {copied ? 'コピーしました!' : 'コピー'}
          </button>
          <button onClick={handleExport} className="action-btn export-btn">
            書き出し
          </button>
          <button onClick={handleImport} className="action-btn import-btn">
            読み込み
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ttl,.turtle"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>
      <div className="import-warning">※ 読み込みを実行すると既存のデータは上書きされます</div>
      <pre className="turtle-output">{turtleOutput || '# スキーマを定義するとここにTurtleが表示されます'}</pre>
    </div>
  )
}
