import * as d3 from 'd3'
import type { GraphNode, GraphLink } from './graphBuilder'

export interface GraphInstance {
  zoomIn(): void
  zoomOut(): void
  resetZoom(): void
  highlightNode(nodeId: string): void
  destroy(): void
}

type NodeType = 'class' | 'instance' | 'literal' | 'other'

const NODE_COLORS: Record<NodeType, string> = {
  class: '#7c6af7',
  instance: '#4ecdc4',
  literal: '#ff9f43',
  other: '#a8a8c8'
}

const NODE_RADIUS: Record<NodeType, number> = {
  class: 22,
  instance: 16,
  literal: 12,
  other: 14
}

interface D3Node extends GraphNode {
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface D3Link extends Omit<GraphLink, 'source' | 'target'> {
  source: D3Node | string
  target: D3Node | string
}

export function renderGraph(
  svgElement: SVGSVGElement,
  nodes: GraphNode[],
  links: GraphLink[],
  onNodeClick: (nodeId: string) => void
): GraphInstance {
  const width = svgElement.clientWidth
  const height = svgElement.clientHeight

  // SVGをクリア
  d3.select(svgElement).selectAll('*').remove()

  const svg = d3.select(svgElement)
  const g = svg.append('g')

  // 矢印マーカー定義
  const defs = svg.append('defs')
  Object.entries(NODE_COLORS).forEach(([type, color]) => {
    defs
      .append('marker')
      .attr('id', `arrow-${type}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', color)
      .attr('fill-opacity', 0.6)
  })

  // ノードIDからノードオブジェクトへのマップ
  const nodeById = new Map<string, D3Node>()
  nodes.forEach(n => nodeById.set(n.id, n as D3Node))

  // リンク描画
  const linkSelection = g
    .append('g')
    .selectAll('line')
    .data(links as D3Link[])
    .enter()
    .append('line')
    .attr('class', 'link')
    .attr('stroke', d => {
      const targetNode = typeof d.target === 'string' ? nodeById.get(d.target) : d.target
      return NODE_COLORS[targetNode?.type || 'other']
    })
    .attr('stroke-width', d => (d.isSchema ? 1.5 : 1))
    .attr('stroke-dasharray', d => (d.isSchema ? '4,3' : 'none'))
    .attr('stroke-opacity', 0.6)
    .attr('marker-end', d => {
      const targetNode = typeof d.target === 'string' ? nodeById.get(d.target) : d.target
      return `url(#arrow-${targetNode?.type || 'other'})`
    })

  // エッジラベル
  const edgeLabelSelection = g
    .append('g')
    .selectAll('text')
    .data(links as D3Link[])
    .enter()
    .append('text')
    .attr('class', 'link-label')
    .attr('font-size', 9)
    .attr('font-family', 'JetBrains Mono, monospace')
    .attr('fill', '#6b6b8a')
    .attr('pointer-events', 'none')
    .attr('text-anchor', 'middle')
    .text(d => (d.label.length > 18 ? d.label.slice(0, 16) + '…' : d.label))

  // ノードグループ
  const nodeGroups = g
    .append('g')
    .selectAll('g')
    .data(nodes as D3Node[])
    .enter()
    .append('g')
    .attr('class', 'node-group')
    .style('cursor', 'pointer')

  // ドラッグ動作
  const dragBehavior = d3
    .drag<SVGGElement, D3Node>()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on('drag', (event, d) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    })

  nodeGroups.call(dragBehavior)

  // ノードクリック
  nodeGroups.on('click', (_event, d) => {
    onNodeClick(d.id)
  })

  // ノード円
  nodeGroups
    .append('circle')
    .attr('class', 'node-circle')
    .attr('r', d => NODE_RADIUS[d.type])
    .attr('fill', d => NODE_COLORS[d.type] + '28')
    .attr('stroke', d => NODE_COLORS[d.type])
    .attr('stroke-width', 2)

  // ノード内アイコン
  const NODE_ICONS: Record<NodeType, string> = {
    class: '◈',
    instance: '◉',
    literal: '◆',
    other: '◇'
  }

  nodeGroups
    .append('text')
    .attr('class', 'node-icon')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', d => NODE_RADIUS[d.type] * 0.85)
    .attr('fill', '#e8e8f0')
    .attr('pointer-events', 'none')
    .text(d => NODE_ICONS[d.type])

  // ノードラベル
  nodeGroups
    .append('text')
    .attr('class', 'node-label')
    .attr('text-anchor', 'middle')
    .attr('y', d => NODE_RADIUS[d.type] + 12)
    .attr('font-size', 10)
    .attr('font-family', 'JetBrains Mono, monospace')
    .attr('fill', '#e8e8f0')
    .attr('pointer-events', 'none')
    .text(d => (d.label.length > 16 ? d.label.slice(0, 14) + '…' : d.label))

  // ズーム機能
  const zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on('zoom', event => {
      g.attr('transform', event.transform)
    })

  svg.call(zoomBehavior)

  // Force simulation (より疎な配置にするためパラメータ調整)
  const simulation = d3
    .forceSimulation(nodes as D3Node[])
    .force(
      'link',
      d3
        .forceLink<D3Node, D3Link>(links as D3Link[])
        .id(d => d.id)
        .distance(200)  // 120 → 200 に増加（ノード間距離を広げる）
        .strength(0.4)  // 0.5 → 0.4 に減少（エッジの引力を弱める）
    )
    .force('charge', d3.forceManyBody().strength(-600))  // -300 → -600 に増加（ノード間の反発力を強める）
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force(
      'collision',
      d3.forceCollide<D3Node>(d => NODE_RADIUS[d.type] + 35)  // 20 → 35 に増加（ノード間の余白を広げる）
    )
    .on('tick', () => {
      // リンク位置更新
      linkSelection
        .attr('x1', d => (typeof d.source === 'object' ? d.source.x ?? 0 : 0))
        .attr('y1', d => (typeof d.source === 'object' ? d.source.y ?? 0 : 0))
        .attr('x2', d => (typeof d.target === 'object' ? d.target.x ?? 0 : 0))
        .attr('y2', d => (typeof d.target === 'object' ? d.target.y ?? 0 : 0))

      // エッジラベル位置更新
      edgeLabelSelection
        .attr('x', d => {
          const sx = typeof d.source === 'object' ? d.source.x ?? 0 : 0
          const tx = typeof d.target === 'object' ? d.target.x ?? 0 : 0
          return (sx + tx) / 2
        })
        .attr('y', d => {
          const sy = typeof d.source === 'object' ? d.source.y ?? 0 : 0
          const ty = typeof d.target === 'object' ? d.target.y ?? 0 : 0
          return (sy + ty) / 2 - 4
        })

      // ノード位置更新
      nodeGroups.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

  // GraphInstanceを返す
  return {
    zoomIn() {
      svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.4)
    },
    zoomOut() {
      svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7)
    },
    resetZoom() {
      svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity)
    },
    highlightNode(nodeId: string) {
      nodeGroups.selectAll('.node-circle').attr('stroke-width', (d: any) => (d.id === nodeId ? 3 : 2))
    },
    destroy() {
      simulation.stop()
      svg.selectAll('*').remove()
    }
  }
}
