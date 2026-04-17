import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import SchemaView from './components/SchemaView'
import TurtlePanel from './components/TurtlePanel'
import DataDomainView from './components/DataDomainView'
import { useTableStore } from './store/tableStore'
import { parseCategoryClasses, parseCategoryProperties } from './model/parser'
import './App.css'

function App() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [showingRdf, setShowingRdf] = useState(false)
  const [showingDataDomain, setShowingDataDomain] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const loadCategoryClasses = useTableStore(state => state.loadCategoryClasses)
  const loadCategoryProperties = useTableStore(state => state.loadCategoryProperties)
  const setCategoryTurtleContent = useTableStore(state => state.setCategoryTurtleContent)

  // 起動時にカテゴリーオントロジーを読み込み
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetch('/category.ttl')
        const turtleContent = await response.text()
        const classes = parseCategoryClasses(turtleContent)
        const properties = parseCategoryProperties(turtleContent)
        loadCategoryClasses(classes)
        loadCategoryProperties(properties)
        setCategoryTurtleContent(turtleContent)
      } catch (error) {
        console.error('Failed to load category ontology:', error)
      }
    }
    loadCategories()
  }, [])

  const handleSelectTable = (tableId: string) => {
    setSelectedTable(tableId)
    setShowingRdf(false)
    setShowingDataDomain(false)
  }

  const handleShowRdf = () => {
    setShowingRdf(true)
    setShowingDataDomain(false)
  }

  const handleShowDataDomain = () => {
    setShowingDataDomain(true)
    setShowingRdf(false)
  }

  return (
    <div className="app">
      {sidebarVisible && (
        <Sidebar
          selectedTable={selectedTable}
          showingRdf={showingRdf}
          showingDataDomain={showingDataDomain}
          onSelectTable={handleSelectTable}
          onShowRdf={handleShowRdf}
          onShowDataDomain={handleShowDataDomain}
        />
      )}
      <div className="main-content">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarVisible(!sidebarVisible)}
          title={sidebarVisible ? 'サイドバーを隠す' : 'サイドバーを表示'}
        >
          ☰
        </button>
        {showingRdf ? (
          <TurtlePanel />
        ) : showingDataDomain ? (
          <DataDomainView />
        ) : (
          <SchemaView selectedTable={selectedTable} />
        )}
      </div>
    </div>
  )
}

export default App
