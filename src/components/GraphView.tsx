import { useEffect, useRef, useState } from 'react'
import { useTableStore } from '../store/tableStore'
import { generateTurtle } from '../model/rdf'
import { buildGraphData } from '../utils/graphBuilder'
import { renderGraph, GraphInstance } from '../utils/graphRenderer'
import './GraphView.css'

export default function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const graphInstanceRef = useRef<GraphInstance | null>(null)
  const [stats, setStats] = useState({ nodes: 0, edges: 0, classes: 0 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [graphNodes, setGraphNodes] = useState<any[]>([])
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set())

  const { prefix, tables, dataDomains, categoryTurtleContent } = useTableStore()

  // localStorageのキー生成
  const getStorageKey = () => `graph-hidden-nodes:${prefix.name}:${prefix.uri}`

  // 初回マウント時にlocalStorageから非表示ノードを復元
  useEffect(() => {
    const key = getStorageKey()
    const stored = localStorage.getItem(key)
    if (stored) {
      try {
        const ids = JSON.parse(stored) as string[]
        setHiddenNodeIds(new Set(ids))
      } catch (e) {
        console.warn('Failed to parse hidden nodes from localStorage', e)
      }
    }
  }, [prefix.name, prefix.uri])

  // hiddenNodeIdsが変更されたらlocalStorageに保存
  useEffect(() => {
    const key = getStorageKey()
    if (hiddenNodeIds.size > 0) {
      localStorage.setItem(key, JSON.stringify(Array.from(hiddenNodeIds)))
    } else {
      localStorage.removeItem(key)
    }
  }, [hiddenNodeIds, prefix.name, prefix.uri])

  useEffect(() => {
    if (!svgRef.current) return

    // SVGのサイズが取得できるまで待つ
    const checkSize = () => {
      if (!svgRef.current) return

      const width = svgRef.current.clientWidth
      const height = svgRef.current.clientHeight

      if (width === 0 || height === 0) {
        setTimeout(checkSize, 50)
        return
      }

      renderGraphContent()
    }

    const renderGraphContent = () => {
      if (!svgRef.current) return

      // 現在のTurtleを生成
      const turtleContent = generateTurtle(prefix, tables, categoryTurtleContent, dataDomains)

      // グラフデータに変換（ユーザープレフィックスのみフィルタ）
      const { nodes, links, classCount } = buildGraphData(turtleContent, prefix)

      setGraphNodes(nodes)

      // 非表示ノードをフィルタ
      const visibleNodes = nodes.filter(n => !hiddenNodeIds.has(n.id))
      const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
      const visibleLinks = links.filter(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as any)?.id || ''
        const targetId = typeof l.target === 'string' ? l.target : (l.target as any)?.id || ''
        return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
      })

      setStats({
        nodes: visibleNodes.length,
        edges: visibleLinks.length,
        classes: classCount
      })

      // グラフを描画
      if (graphInstanceRef.current) {
        graphInstanceRef.current.destroy()
      }

      if (visibleNodes.length > 0) {
        graphInstanceRef.current = renderGraph(
          svgRef.current!,
          visibleNodes,
          visibleLinks,
          (nodeId) => setSelectedNodeId(nodeId)
        )
      }
    }

    checkSize()

    return () => {
      if (graphInstanceRef.current) {
        graphInstanceRef.current.destroy()
        graphInstanceRef.current = null
      }
    }
  }, [prefix, tables, dataDomains, categoryTurtleContent, hiddenNodeIds])

  useEffect(() => {
    if (graphInstanceRef.current && selectedNodeId) {
      graphInstanceRef.current.highlightNode(selectedNodeId)
    }
  }, [selectedNodeId])

  const selectedNode = graphNodes.find(n => n.id === selectedNodeId)
  const hiddenNodes = graphNodes.filter(n => hiddenNodeIds.has(n.id))

  const handleZoomIn = () => graphInstanceRef.current?.zoomIn()
  const handleZoomOut = () => graphInstanceRef.current?.zoomOut()
  const handleResetZoom = () => graphInstanceRef.current?.resetZoom()

  const handleToggleNodeVisibility = (nodeId: string) => {
    setHiddenNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
        if (selectedNodeId === nodeId) {
          setSelectedNodeId(null)
        }
      }
      return next
    })
  }

  return (
    <div className="graph-view">
      <div className="graph-header">
        <h2>オントロジーグラフ</h2>
        <div className="graph-stats">
          <span className="stat">ノード <strong>{stats.nodes}</strong></span>
          <span className="stat">エッジ <strong>{stats.edges}</strong></span>
          <span className="stat">クラス <strong>{stats.classes}</strong></span>
        </div>
      </div>

      <div className="graph-content">
        <div className="graph-canvas">
          <svg ref={svgRef} className="graph-svg" />
          {stats.nodes === 0 && (
            <div className="graph-empty">
              <div className="graph-empty-icon">📊</div>
              <div className="graph-empty-text">テーブルとデータを追加すると<br />グラフが表示されます</div>
            </div>
          )}

          {stats.nodes > 0 && (
            <div className="graph-controls">
              <button className="ctrl-btn" onClick={handleResetZoom} title="リセット">⊙</button>
              <button className="ctrl-btn" onClick={handleZoomIn} title="ズームイン">+</button>
              <button className="ctrl-btn" onClick={handleZoomOut} title="ズームアウト">−</button>
            </div>
          )}
        </div>

        <div className="graph-sidebar">
          {selectedNode && (
            <div className="node-detail">
              <div className="node-detail-header">選択中のノード</div>
              <div className="node-detail-name">{selectedNode.label}</div>
              <div className="node-detail-type">{selectedNode.type}</div>
              <div className="node-detail-uri">{shortUri(selectedNode.uri)}</div>
              <button
                className="node-hide-btn"
                onClick={() => handleToggleNodeVisibility(selectedNode.id)}
              >
                👁️ 非表示
              </button>
            </div>
          )}

          {hiddenNodes.length > 0 && (
            <div className="hidden-nodes">
              <div className="hidden-nodes-header">非表示のノード ({hiddenNodes.length})</div>
              {hiddenNodes.map(node => (
                <div key={node.id} className="hidden-node-item">
                  <span className="hidden-node-name">{node.label}</span>
                  <button
                    className="node-show-btn"
                    onClick={() => handleToggleNodeVisibility(node.id)}
                    title="表示する"
                  >
                    👁️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function shortUri(uri: string): string {
  if (uri.startsWith('"')) return uri.slice(0, 50)
  const hash = uri.lastIndexOf('#')
  const slash = uri.lastIndexOf('/')
  const idx = Math.max(hash, slash)
  return idx >= 0 ? uri.slice(idx + 1) : uri
}
