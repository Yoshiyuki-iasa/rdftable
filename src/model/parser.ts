import { Parser, Store, DataFactory } from 'n3'
import { Table, Column, Prefix, CategoryClass, CategoryProperty, DataDomain } from './types'

const { namedNode } = DataFactory

/**
 * Turtle文字列をパースしてスキーマデータに変換
 */
export function parseTurtle(turtleContent: string): {
  prefix: Prefix
  tables: Table[]
  dataDomains: DataDomain[]
} {
  const parser = new Parser()
  const store = new Store()

  // Turtleをパースしてストアに格納
  const quads = parser.parse(turtleContent)
  store.addQuads(quads)

  // プレフィックスを抽出
  const prefix = extractPrefix(turtleContent)

  // データドメインを抽出
  const dataDomains = extractDataDomains(store, prefix)

  // クラス（テーブル）を抽出（データドメイン名→ID変換用）
  const tables = extractTables(store, prefix, dataDomains)

  return { prefix, tables, dataDomains }
}

/**
 * Turtle文字列からユーザー定義プレフィックスを抽出
 */
function extractPrefix(turtleContent: string): Prefix {
  const lines = turtleContent.split('\n')

  // owl, rdf, rdfs, xsd, category以外のプレフィックスを探す
  for (const line of lines) {
    const match = line.match(/@prefix\s+(\w+):\s+<([^>]+)>\s*\./)
    if (match) {
      const [, name, uri] = match
      if (!['owl', 'rdf', 'rdfs', 'xsd', 'category'].includes(name)) {
        return { name, uri }
      }
    }
  }

  return { name: 'ex', uri: 'http://example.org/#' }
}

/**
 * ストアからテーブル（クラス）を抽出
 */
function extractTables(store: Store, prefix: Prefix, dataDomains: DataDomain[]): Table[] {
  const OWL_CLASS = namedNode('http://www.w3.org/2002/07/owl#Class')
  const RDFS_LABEL = namedNode('http://www.w3.org/2000/01/rdf-schema#label')
  const RDFS_COMMENT = namedNode('http://www.w3.org/2000/01/rdf-schema#comment')
  const RDFS_SUBCLASS_OF = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf')
  const OWL_HAS_KEY = namedNode('http://www.w3.org/2002/07/owl#hasKey')

  const tables: Table[] = []

  // owl:Classのインスタンスを取得
  const classes = store.getSubjects(
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    OWL_CLASS,
    null
  )

  for (const classUri of classes) {
    if (classUri.termType !== 'NamedNode') continue

    // categoryクラス自体は除外（category:Master, category:Referenceなど）
    if (classUri.value.includes('example.org/category#')) continue

    const className = extractLocalName(classUri.value, prefix)
    if (!className) continue

    // rdfs:labelを取得
    const labelQuads = store.getQuads(classUri, RDFS_LABEL, null, null)
    const label = labelQuads.length > 0 && labelQuads[0].object.termType === 'Literal'
      ? labelQuads[0].object.value
      : undefined

    // rdfs:commentを取得
    const commentQuads = store.getQuads(classUri, RDFS_COMMENT, null, null)
    const comment = commentQuads.length > 0 && commentQuads[0].object.termType === 'Literal'
      ? commentQuads[0].object.value
      : undefined

    // rdfs:subClassOfを取得（親クラス）
    const subClassQuads = store.getQuads(classUri, RDFS_SUBCLASS_OF, null, null)
    let parentClass: string | undefined
    let parentUserClassName: string | undefined

    for (const quad of subClassQuads) {
      if (quad.object.termType !== 'NamedNode') continue

      const parentUri = quad.object.value

      // category:XXX → parentClass（カテゴリクラス）
      if (parentUri.includes('example.org/category#')) {
        parentClass = parentUri
      }
      // alpha:XXX → parentUserClass（ユーザー定義クラス）
      else {
        const localName = extractLocalName(parentUri, prefix)
        if (localName) {
          parentUserClassName = localName
        }
      }
    }

    // owl:hasKeyを取得（PK判定用）
    const hasKeyQuads = store.getQuads(classUri, OWL_HAS_KEY, null, null)
    const pkProperties = new Set<string>()
    if (hasKeyQuads.length > 0) {
      const keyList = hasKeyQuads[0].object
      // リストを展開してPKプロパティを取得
      const pkProps = extractListItems(store, keyList)
      pkProps.forEach(p => {
        const localName = extractLocalName(p.value, prefix)
        if (localName) pkProperties.add(localName)
      })
    }

    // このクラスに関連するプロパティを取得
    const columns = extractColumns(store, classUri, prefix, pkProperties, dataDomains)

    tables.push({
      id: `table_${Date.now()}_${Math.random()}`,
      name: className,
      label,
      comment,
      parentClass,
      parentUserClass: undefined, // 後で名前解決
      columns,
      _parentUserClassName: parentUserClassName // 一時的に名前を保存
    } as any)
  }

  // parentUserClassName（名前）を parentUserClass（ID）に変換
  const nameToId = new Map<string, string>()
  tables.forEach(t => nameToId.set(t.name, t.id))

  tables.forEach(table => {
    const parentName = (table as any)._parentUserClassName
    if (parentName) {
      table.parentUserClass = nameToId.get(parentName)
    }
    delete (table as any)._parentUserClassName
  })

  return tables
}

/**
 * ストアから列（プロパティ）を抽出
 */
function extractColumns(
  store: Store,
  classUri: any,
  prefix: Prefix,
  pkProperties: Set<string>,
  dataDomains: DataDomain[]
): Column[] {
  const RDFS_DOMAIN = namedNode('http://www.w3.org/2000/01/rdf-schema#domain')
  const RDFS_RANGE = namedNode('http://www.w3.org/2000/01/rdf-schema#range')
  const RDFS_SUBPROPERTY_OF = namedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf')
  const RDFS_LABEL = namedNode('http://www.w3.org/2000/01/rdf-schema#label')
  const RDFS_COMMENT = namedNode('http://www.w3.org/2000/01/rdf-schema#comment')
  const OWL_DATATYPE_PROPERTY = namedNode('http://www.w3.org/2002/07/owl#DatatypeProperty')
  const OWL_OBJECT_PROPERTY = namedNode('http://www.w3.org/2002/07/owl#ObjectProperty')

  const columns: Column[] = []

  // このクラスをdomainとするプロパティを検索
  const properties = store.getSubjects(RDFS_DOMAIN, classUri, null)

  for (const propUri of properties) {
    if (propUri.termType !== 'NamedNode') continue

    // categoryプロパティは除外（category:categoryID, category:designationなど）
    if (propUri.value.includes('example.org/category#')) continue

    const propName = extractLocalName(propUri.value, prefix)
    if (!propName) continue

    // プロパティの型を判定
    const typeQuads = store.getQuads(
      propUri,
      namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      null,
      null
    )
    const isObjectProperty = typeQuads.some(q => q.object.equals(OWL_OBJECT_PROPERTY))
    const isDatatypeProperty = typeQuads.some(q => q.object.equals(OWL_DATATYPE_PROPERTY))

    // rdfs:rangeを取得
    const rangeQuads = store.getQuads(propUri, RDFS_RANGE, null, null)
    const rangeUri = rangeQuads.length > 0 ? rangeQuads[0].object : null

    let dataType: 'string' | 'number' | 'boolean' | 'date' = 'string'
    let referencedTable: string | undefined

    if (isObjectProperty && rangeUri && rangeUri.termType === 'NamedNode') {
      // ObjectProperty: 参照先テーブル名を取得（実際のtableIdは後で解決）
      referencedTable = extractLocalName(rangeUri.value, prefix) ?? undefined
    } else if (isDatatypeProperty && rangeUri && rangeUri.termType === 'NamedNode') {
      // DatatypeProperty: XSD型からデータ型を判定
      dataType = getDataTypeFromXsd(rangeUri.value)
    }

    // rdfs:labelを取得
    const labelQuads = store.getQuads(propUri, RDFS_LABEL, null, null)
    const label = labelQuads.length > 0 && labelQuads[0].object.termType === 'Literal'
      ? labelQuads[0].object.value
      : undefined

    // rdfs:commentを取得
    const commentQuads = store.getQuads(propUri, RDFS_COMMENT, null, null)
    const comment = commentQuads.length > 0 && commentQuads[0].object.termType === 'Literal'
      ? commentQuads[0].object.value
      : undefined

    // rdfs:subPropertyOfを取得（データドメイン）
    const subPropQuads = store.getQuads(propUri, RDFS_SUBPROPERTY_OF, null, null)
    let dataDomain: string | undefined
    if (subPropQuads.length > 0 && subPropQuads[0].object.termType === 'NamedNode') {
      const domainUri = subPropQuads[0].object.value
      // alphaD:OrgName のような形式から名前を抽出
      const match = domainUri.match(/#(\w+)$/)
      if (match) {
        const domainName = match[1]
        // データドメイン名からIDを取得
        const domain = dataDomains.find(d => d.name === domainName)
        if (domain) {
          dataDomain = domain.id
        }
      }
    }

    columns.push({
      id: `col_${Date.now()}_${Math.random()}`,
      name: propName,
      label,
      comment,
      isPrimaryKey: pkProperties.has(propName),
      isForeignKey: isObjectProperty,
      referencedTable,
      dataType,
      dataDomain
    })
  }

  return columns
}

/**
 * URIからローカル名を抽出
 */
function extractLocalName(uri: string, prefix: Prefix): string | null {
  if (prefix.uri && uri.startsWith(prefix.uri)) {
    return uri.slice(prefix.uri.length)
  }
  // フォールバック: #または/の後の部分を取得
  const match = uri.match(/[#/]([^#/]+)$/)
  return match ? match[1] : null
}

/**
 * XSD型からデータ型を判定
 */
function getDataTypeFromXsd(xsdUri: string): 'string' | 'number' | 'boolean' | 'date' {
  if (xsdUri.includes('integer') || xsdUri.includes('int') || xsdUri.includes('decimal')) {
    return 'number'
  }
  if (xsdUri.includes('boolean')) {
    return 'boolean'
  }
  if (xsdUri.includes('date')) {
    return 'date'
  }
  return 'string'
}

/**
 * RDFリストの要素を取得
 */
function extractListItems(store: Store, listNode: any): any[] {
  const items: any[] = []
  const RDF_FIRST = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first')
  const RDF_REST = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest')
  const RDF_NIL = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil')

  let current = listNode

  while (current && !current.equals(RDF_NIL)) {
    const firstQuads = store.getQuads(current, RDF_FIRST, null, null)
    if (firstQuads.length > 0) {
      items.push(firstQuads[0].object)
    }

    const restQuads = store.getQuads(current, RDF_REST, null, null)
    if (restQuads.length > 0) {
      current = restQuads[0].object
    } else {
      break
    }
  }

  return items
}

/**
 * カテゴリーオントロジーからクラス一覧を抽出
 */
export function parseCategoryClasses(turtleContent: string): CategoryClass[] {
  const parser = new Parser()
  const store = new Store()

  try {
    const quads = parser.parse(turtleContent)
    store.addQuads(quads)
  } catch (error) {
    console.error('Failed to parse category ontology:', error)
    return []
  }

  const OWL_CLASS = namedNode('http://www.w3.org/2002/07/owl#Class')
  const RDFS_LABEL = namedNode('http://www.w3.org/2000/01/rdf-schema#label')
  const classes: CategoryClass[] = []

  // owl:Class のインスタンスを取得
  const classUris = store.getSubjects(
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    OWL_CLASS,
    null
  )

  for (const classUri of classUris) {
    if (classUri.termType !== 'NamedNode') continue

    // rdfs:label を取得（言語タグなし）
    const labelQuads = store.getQuads(classUri, RDFS_LABEL, null, null)
    if (labelQuads.length > 0 && labelQuads[0].object.termType === 'Literal') {
      const label = labelQuads[0].object.value
      classes.push({
        uri: classUri.value,
        label
      })
    }
  }

  return classes
}

/**
 * カテゴリーオントロジーからプロパティ一覧を抽出
 */
export function parseCategoryProperties(turtleContent: string): CategoryProperty[] {
  const parser = new Parser()
  const store = new Store()

  try {
    const quads = parser.parse(turtleContent)
    store.addQuads(quads)
  } catch (error) {
    console.error('Failed to parse category ontology:', error)
    return []
  }

  const OWL_DATATYPE_PROPERTY = namedNode('http://www.w3.org/2002/07/owl#DatatypeProperty')
  const RDFS_LABEL = namedNode('http://www.w3.org/2000/01/rdf-schema#label')
  const properties: CategoryProperty[] = []

  // owl:DatatypeProperty のインスタンスを取得
  const propertyUris = store.getSubjects(
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    OWL_DATATYPE_PROPERTY,
    null
  )

  for (const propertyUri of propertyUris) {
    if (propertyUri.termType !== 'NamedNode') continue

    // rdfs:label を取得（言語タグなし）
    const labelQuads = store.getQuads(propertyUri, RDFS_LABEL, null, null)
    if (labelQuads.length > 0 && labelQuads[0].object.termType === 'Literal') {
      const label = labelQuads[0].object.value
      properties.push({
        uri: propertyUri.value,
        label
      })
    }
  }

  return properties
}

/**
 * ストアからデータドメインを抽出
 */
function extractDataDomains(store: Store, prefix: Prefix): DataDomain[] {
  const OWL_DATATYPE_PROPERTY = namedNode('http://www.w3.org/2002/07/owl#DatatypeProperty')
  const RDFS_LABEL = namedNode('http://www.w3.org/2000/01/rdf-schema#label')
  const RDFS_COMMENT = namedNode('http://www.w3.org/2000/01/rdf-schema#comment')
  const RDFS_SUBPROPERTY_OF = namedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf')
  const RDFS_RANGE = namedNode('http://www.w3.org/2000/01/rdf-schema#range')
  const RDFS_DOMAIN = namedNode('http://www.w3.org/2000/01/rdf-schema#domain')

  const dataDomains: DataDomain[] = []

  // owl:DatatypePropertyのインスタンスを取得
  const properties = store.getSubjects(
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    OWL_DATATYPE_PROPERTY,
    null
  )

  for (const propUri of properties) {
    if (propUri.termType !== 'NamedNode') continue

    // categoryプロパティは除外
    if (propUri.value.includes('example.org/category#')) continue

    // プレフィックスDでマッチするもの（alphaD:など）だけを取得
    const domainPrefixPattern = new RegExp(`${prefix.uri.replace('#', '-domain#')}`)
    if (!propUri.value.match(domainPrefixPattern)) continue

    const propName = propUri.value.match(/#(\w+)$/)?.[1]
    if (!propName) continue

    // rdfs:domainがあるものは除外（テーブルのプロパティ）
    const domainQuads = store.getQuads(propUri, RDFS_DOMAIN, null, null)
    if (domainQuads.length > 0) continue

    // rdfs:labelを取得
    const labelQuads = store.getQuads(propUri, RDFS_LABEL, null, null)
    const label = labelQuads.length > 0 && labelQuads[0].object.termType === 'Literal'
      ? labelQuads[0].object.value
      : undefined

    // rdfs:commentを取得
    const commentQuads = store.getQuads(propUri, RDFS_COMMENT, null, null)
    const comment = commentQuads.length > 0 && commentQuads[0].object.termType === 'Literal'
      ? commentQuads[0].object.value
      : undefined

    // rdfs:subPropertyOfを取得（親カテゴリプロパティ）
    const subPropQuads = store.getQuads(propUri, RDFS_SUBPROPERTY_OF, null, null)
    let parentCategory: string | undefined
    if (subPropQuads.length > 0 && subPropQuads[0].object.termType === 'NamedNode') {
      parentCategory = subPropQuads[0].object.value
    }

    // rdfs:rangeを取得（データ型）
    const rangeQuads = store.getQuads(propUri, RDFS_RANGE, null, null)
    let dataType: 'string' | 'number' | 'boolean' | 'date' = 'string'
    if (rangeQuads.length > 0 && rangeQuads[0].object.termType === 'NamedNode') {
      dataType = getDataTypeFromXsd(rangeQuads[0].object.value)
    }

    dataDomains.push({
      id: `domain_${Date.now()}_${Math.random()}`,
      name: propName,
      label,
      comment,
      parentCategory,
      dataType
    })
  }

  return dataDomains
}
