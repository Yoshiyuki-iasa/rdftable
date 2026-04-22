import { Parser, Store } from 'n3'
import type { Prefix } from '../model/types'

export interface GraphNode {
  id: string
  label: string
  type: 'class' | 'instance' | 'literal' | 'other'
  uri: string
  props: Array<{ p: string; o: string }>
}

export interface GraphLink {
  source: string
  target: string
  label: string
  predUri: string
  isSchema: boolean
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class'
const OWL_OBJPROP = 'http://www.w3.org/2002/07/owl#ObjectProperty'
const OWL_DATAPROP = 'http://www.w3.org/2002/07/owl#DatatypeProperty'
const RDFS_CLASS = 'http://www.w3.org/2000/01/rdf-schema#Class'
const RDFS_SUBCLASSOF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf'
const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain'
const RDFS_RANGE = 'http://www.w3.org/2000/01/rdf-schema#range'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'

/**
 * Turtleテキストをパースし、グラフ描画用のノード・リンクに変換
 * ユーザー定義プレフィックスのリソースのみを抽出
 */
export function buildGraphData(
  turtleContent: string,
  prefix: Prefix
): { nodes: GraphNode[]; links: GraphLink[]; classCount: number } {
  const parser = new Parser()
  const store = new Store()

  try {
    const quads = parser.parse(turtleContent)
    store.addQuads(quads)
  } catch (error) {
    console.error('Turtle parse error in graphBuilder:', error)
    return { nodes: [], links: [], classCount: 0 }
  }

  // ユーザープレフィックスのパターン
  const userPrefixPattern = new RegExp(`^${prefix.uri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  const userDomainPattern = new RegExp(`^${prefix.uri.replace('#', '-domain#').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

  // categoryプレフィックスは除外
  const categoryPattern = /example\.org\/category#/

  // OWL/RDFS組み込みクラスを除外
  const owlRdfsPattern = /^http:\/\/www\.w3\.org\/(1999\/02\/22-rdf-syntax-ns#|2000\/01\/rdf-schema#|2002\/07\/owl#|2001\/XMLSchema#)/

  function isUserResource(uri: string): boolean {
    if (uri.startsWith('"')) return false // リテラルは含める（別の判定で）
    if (categoryPattern.test(uri)) return false
    return userPrefixPattern.test(uri) || userDomainPattern.test(uri)
  }

  const classSet = new Set<string>()
  const propSet = new Set<string>()
  const labelMap = new Map<string, string>()
  const propsOf = new Map<string, Array<{ p: string; o: string }>>()

  // ObjectPropertyのdomain/range情報を保存
  interface PropertyDomainRange {
    property: string
    domain?: string
    range?: string
    label?: string
  }
  const propertyDomainRanges: PropertyDomainRange[] = []

  // 全トリプルを走査
  for (const quad of store.getQuads(null, null, null, null)) {
    const s = quad.subject.value
    const p = quad.predicate.value
    const o = quad.object.value

    // ユーザーリソース以外はスキップ（主語がユーザーリソースのもののみ）
    if (!isUserResource(s)) continue

    // クラス判定
    if (p === RDF_TYPE && (o === OWL_CLASS || o === RDFS_CLASS)) {
      classSet.add(s)
    }

    // プロパティ判定（ObjectPropertyのみ収集）
    if (p === RDF_TYPE && o === OWL_OBJPROP) {
      propSet.add(s)
    }

    // domain/range情報を収集
    if (p === RDFS_DOMAIN && isUserResource(s)) {
      let prop = propertyDomainRanges.find(pr => pr.property === s)
      if (!prop) {
        prop = { property: s }
        propertyDomainRanges.push(prop)
      }
      prop.domain = o
    }

    if (p === RDFS_RANGE && isUserResource(s)) {
      let prop = propertyDomainRanges.find(pr => pr.property === s)
      if (!prop) {
        prop = { property: s }
        propertyDomainRanges.push(prop)
      }
      prop.range = o
    }

    // ラベル取得
    if (p === RDFS_LABEL) {
      const label = o.replace(/^"(.*)".*$/, '$1')
      labelMap.set(s, label)
    }

    // プロパティ保存
    if (!propsOf.has(s)) propsOf.set(s, [])
    propsOf.get(s)!.push({ p, o })
  }

  // インスタンス判定（rdf:typeの目的語がクラス）
  for (const quad of store.getQuads(null, RDF_TYPE, null, null)) {
    const s = quad.subject.value
    const o = quad.object.value

    if (!isUserResource(s)) continue

    if (
      o !== OWL_CLASS &&
      o !== RDFS_CLASS &&
      o !== OWL_OBJPROP &&
      o !== OWL_DATAPROP &&
      !categoryPattern.test(o)
    ) {
      if (isUserResource(o)) {
        classSet.add(o)
      }
    }
  }

  function shortLabel(uri: string): string {
    if (uri.startsWith('"')) return uri.slice(1, -1) // リテラル
    const hash = uri.lastIndexOf('#')
    const slash = uri.lastIndexOf('/')
    const idx = Math.max(hash, slash)
    return idx >= 0 ? uri.slice(idx + 1) : uri
  }

  const nodeMap = new Map<string, GraphNode>()

  function getNode(uri: string): GraphNode {
    if (!nodeMap.has(uri)) {
      const isLiteral = uri.startsWith('"')
      const isClass = classSet.has(uri)
      const label = labelMap.get(uri) || shortLabel(uri)

      nodeMap.set(uri, {
        id: uri,
        label,
        type: isLiteral ? 'literal' : isClass ? 'class' : 'other',
        uri,
        props: propsOf.get(uri) || []
      })
    }
    return nodeMap.get(uri)!
  }

  // インスタンスのタイプ判定
  for (const quad of store.getQuads(null, RDF_TYPE, null, null)) {
    const s = quad.subject.value
    const o = quad.object.value

    if (!isUserResource(s)) continue

    if (
      o !== OWL_CLASS &&
      o !== RDFS_CLASS &&
      o !== OWL_OBJPROP &&
      o !== OWL_DATAPROP &&
      !classSet.has(s) &&
      isUserResource(o)
    ) {
      getNode(s).type = 'instance'
    }
  }

  const links: GraphLink[] = []

  // 1. クラス間の継承関係 (rdfs:subClassOf)
  for (const quad of store.getQuads(null, RDFS_SUBCLASSOF, null, null)) {
    const s = quad.subject.value
    const o = quad.object.value

    if (!isUserResource(s)) continue
    if (categoryPattern.test(o)) continue
    if (owlRdfsPattern.test(o)) continue
    if (!isUserResource(o)) continue

    getNode(s)
    getNode(o)

    links.push({
      source: s,
      target: o,
      label: 'subClassOf',
      predUri: RDFS_SUBCLASSOF,
      isSchema: true
    })
  }

  // 2. ObjectPropertyのdomain/rangeからクラス間の関係を生成
  for (const propInfo of propertyDomainRanges) {
    if (!propInfo.domain || !propInfo.range) continue
    if (!isUserResource(propInfo.domain)) continue
    if (!isUserResource(propInfo.range)) continue
    if (categoryPattern.test(propInfo.domain)) continue
    if (categoryPattern.test(propInfo.range)) continue
    if (owlRdfsPattern.test(propInfo.domain)) continue
    if (owlRdfsPattern.test(propInfo.range)) continue

    // domainとrangeがどちらもユーザー定義クラスの場合のみ
    getNode(propInfo.domain)
    getNode(propInfo.range)

    const propLabel = labelMap.get(propInfo.property) || shortLabel(propInfo.property)

    links.push({
      source: propInfo.domain,
      target: propInfo.range,
      label: propLabel,
      predUri: propInfo.property,
      isSchema: false
    })
  }

  // categoryノードとOWL/RDFSノードを除外
  const nodes = Array.from(nodeMap.values()).filter(node => {
    return !categoryPattern.test(node.uri) && !owlRdfsPattern.test(node.uri)
  })

  return {
    nodes,
    links,
    classCount: classSet.size
  }
}
