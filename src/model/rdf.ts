import { Table, Prefix, DataDomain } from './types'

/**
 * データ型からXSD型へのマッピング
 */
function getXsdType(dataType: string): string {
  switch (dataType) {
    case 'string': return 'xsd:string'
    case 'number': return 'xsd:integer'
    case 'boolean': return 'xsd:boolean'
    case 'date': return 'xsd:date'
    default: return 'xsd:string'
  }
}

/**
 * テーブル定義からTurtle形式のRDFを生成
 */
export function generateTurtle(prefix: Prefix, tables: Table[], categoryTurtleContent?: string, dataDomains?: DataDomain[]): string {
  const lines: string[] = []

  // プレフィックス定義
  lines.push('@prefix owl:  <http://www.w3.org/2002/07/owl#> .')
  lines.push('@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .')
  lines.push('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .')
  lines.push('@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .')
  lines.push('@prefix category: <http://www.example.org/category#> .')

  // ユーザー定義プレフィックス
  const p = prefix.name || 'ex'
  if (prefix.name && prefix.uri) {
    lines.push(`@prefix ${prefix.name}: <${prefix.uri}> .`)
    // データドメイン専用プレフィックス（名前空間を分離）
    // URIの末尾の # や / を除去してから -domain# を付ける
    const baseUri = prefix.uri.replace(/[#\/]+$/, '')
    lines.push(`@prefix ${p}D: <${baseUri}-domain#> .`)
  } else {
    // デフォルトの場合
    lines.push(`@prefix ${p}D: <http://example.org/domain#> .`)
  }

  lines.push('')

  // category.ttl の内容を含める（プレフィックス定義を除く）
  if (categoryTurtleContent) {
    const categoryLines = categoryTurtleContent.split('\n')
    let inPrefixSection = true
    const categoryBody: string[] = []

    for (const line of categoryLines) {
      // プレフィックス定義をスキップ
      if (inPrefixSection) {
        if (line.trim().startsWith('@prefix') || line.trim().startsWith('@base')) {
          continue
        }
        if (line.trim() !== '') {
          inPrefixSection = false
        }
      }

      if (!inPrefixSection) {
        categoryBody.push(line)
      }
    }

    // category.ttl の本体を出力
    if (categoryBody.length > 0) {
      lines.push('### Category Ontology ###')
      lines.push('')
      lines.push(...categoryBody)
      lines.push('')
      lines.push('### User-Defined Schema ###')
      lines.push('')
    }
  }

  // ユーザー定義スキーマがない場合、category.ttlだけを返す
  if (tables.length === 0 && (!dataDomains || dataDomains.length === 0)) {
    return lines.join('\n')
  }

  // データドメインをプロパティとして定義
  if (dataDomains && dataDomains.length > 0) {
    lines.push('### Data Domains ###')
    lines.push('')

    dataDomains.forEach(domain => {
      lines.push(`${p}D:${domain.name}`)

      const domainProperties: string[] = []
      domainProperties.push('a owl:DatatypeProperty')

      // rdfs:subPropertyOf (category)
      if (domain.parentCategory) {
        const categoryPrefix = 'http://www.example.org/category#'
        const subPropertyValue = domain.parentCategory.startsWith(categoryPrefix)
          ? `category:${domain.parentCategory.slice(categoryPrefix.length)}`
          : `<${domain.parentCategory}>`
        domainProperties.push(`rdfs:subPropertyOf ${subPropertyValue}`)
      }

      // rdfs:label
      if (domain.label) {
        domainProperties.push(`rdfs:label "${domain.label}"`)
      }

      // rdfs:comment
      if (domain.comment) {
        domainProperties.push(`rdfs:comment "${domain.comment}"`)
      }

      // rdfs:range (データ型)
      const xsdType = getXsdType(domain.dataType)
      domainProperties.push(`rdfs:range ${xsdType}`)

      // プロパティをセミコロン区切りで出力
      domainProperties.forEach((prop, index) => {
        const isLast = index === domainProperties.length - 1
        lines.push(`  ${prop}${isLast ? ' .' : ' ;'}`)
      })

      lines.push('')
    })

    lines.push('### User-Defined Tables and Properties ###')
    lines.push('')
  }

  // 各テーブルをクラスとして定義
  tables.forEach(table => {
    lines.push(`### Class: ${table.name}`)
    lines.push(`${p}:${table.name}`)

    const classProperties: string[] = []
    classProperties.push('a owl:Class')

    // rdfs:subClassOf (category)
    if (table.parentClass) {
      // フルURI（http://www.example.org/category#Reference）をcategory:Reference形式に変換
      const match = table.parentClass.match(/category#(\w+)$/)
      if (match) {
        classProperties.push(`rdfs:subClassOf category:${match[1]}`)
      }
    }

    // rdfs:subClassOf (user-defined class)
    if (table.parentUserClass) {
      const parentTable = tables.find(t => t.id === table.parentUserClass)
      if (parentTable) {
        classProperties.push(`rdfs:subClassOf ${p}:${parentTable.name}`)
      }
    }

    // rdfs:label
    if (table.label) {
      classProperties.push(`rdfs:label "${table.label}"`)
    }

    // rdfs:comment
    if (table.comment) {
      classProperties.push(`rdfs:comment "${table.comment}"`)
    }

    // PK列を hasKey に含める
    const pkColumns = table.columns.filter(c => c.isPrimaryKey)
    if (pkColumns.length > 0) {
      const pkList = pkColumns.map(c => `${p}:${c.name}`).join(' ')
      classProperties.push(`owl:hasKey ( ${pkList} )`)
    }

    // プロパティをセミコロン区切りで出力
    classProperties.forEach((prop, index) => {
      const isLast = index === classProperties.length - 1
      lines.push(`  ${prop}${isLast ? ' .' : ' ;'}`)
    })

    lines.push('')

    // 各列をプロパティとして定義
    table.columns.forEach(column => {
      const propertyType = column.isForeignKey ? 'owl:ObjectProperty' : 'owl:DatatypeProperty'

      lines.push(`${p}:${column.name}`)

      const propertyProps: string[] = []
      propertyProps.push(`a ${propertyType}`)

      // rdfs:subPropertyOf (data domain)
      if (column.dataDomain && dataDomains) {
        const domain = dataDomains.find(d => d.id === column.dataDomain)
        if (domain) {
          propertyProps.push(`rdfs:subPropertyOf ${p}D:${domain.name}`)
        }
      }

      // rdfs:label
      if (column.label) {
        propertyProps.push(`rdfs:label "${column.label}"`)
      }

      // rdfs:comment
      if (column.comment) {
        propertyProps.push(`rdfs:comment "${column.comment}"`)
      }

      // rdfs:domain
      propertyProps.push(`rdfs:domain ${p}:${table.name}`)

      // rdfs:range
      if (column.isForeignKey && column.referencedTable) {
        // ObjectProperty: 参照先クラスをrangeに指定
        const refTable = tables.find(t => t.id === column.referencedTable)
        if (refTable) {
          propertyProps.push(`rdfs:range ${p}:${refTable.name}`)
        }
      } else {
        // DatatypeProperty: XSD型をrangeに指定
        const xsdType = getXsdType(column.dataType)
        propertyProps.push(`rdfs:range ${xsdType}`)
      }

      // プロパティをセミコロン区切りで出力
      propertyProps.forEach((prop, index) => {
        const isLast = index === propertyProps.length - 1
        lines.push(`  ${prop}${isLast ? ' .' : ' ;'}`)
      })

      lines.push('')
    })
  })

  return lines.join('\n')
}
