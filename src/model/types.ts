export interface Column {
  id: string
  name: string
  label?: string
  comment?: string
  isPrimaryKey: boolean
  isForeignKey: boolean
  referencedTable?: string // FK参照先テーブル名
  dataDomain?: string // データドメインID
  dataType: 'string' | 'number' | 'boolean' | 'date'
}

export interface Table {
  id: string
  name: string
  label?: string
  comment?: string
  parentClass?: string // category オントロジーのクラスURI
  parentUserClass?: string // ユーザー定義クラス（テーブルID）
  columns: Column[]
}

export interface CategoryClass {
  uri: string
  label: string
}

export interface CategoryProperty {
  uri: string
  label: string
}

export interface DataDomain {
  id: string
  name: string
  label?: string
  comment?: string
  parentCategory?: string // category オントロジーのプロパティURI
  dataType: 'string' | 'number' | 'boolean' | 'date'
}

export interface Row {
  tableId: string
  id: string
  data: Record<string, any> // columnId -> value
}

export interface Prefix {
  name: string  // 例: "ex"
  uri: string   // 例: "http://example.com/#"
}

export interface Schema {
  prefix: Prefix
  tables: Table[]
  rows: Row[]
}
