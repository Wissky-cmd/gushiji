// 主进程与界面之间共享的数据类型

export type RecordType = 'expense' | 'income'

/** 分类（两级：parentId 为 null 的是一级分类，其余是二级分类） */
export interface Category {
  id: number
  type: RecordType
  parentId: number | null
  name: string
  icon: string
  sortOrder: number
}

/** 一条账目记录（含关联出的分类信息） */
export interface RecordItem {
  id: number
  type: RecordType
  /** 金额，单位：分（避免小数误差） */
  amountCents: number
  categoryId: number
  /** 日期，格式 YYYY-MM-DD */
  date: string
  note: string
  categoryName: string
  categoryIcon: string
  parentName: string
}

/** 某个月的收支合计（用于趋势图） */
export interface MonthTrend {
  month: string
  expense: number
  income: number
}

/** 新建分类的输入（parentId 为 null 表示一级分类） */
export interface CategoryInput {
  type: RecordType
  parentId: number | null
  name: string
  /** 一级分类的图标；二级分类自动跟随父分类，无需传 */
  icon?: string
}

/** CSV 导出结果 */
export interface ExportResult {
  canceled: boolean
  /** 没有可导出的账目 */
  empty?: boolean
  path?: string
  count?: number
}

/** 新建 / 修改账目时的输入 */
export interface RecordInput {
  type: RecordType
  amountCents: number
  categoryId: number
  date: string
  note: string
}

/** 界面通过 window.api 可调用的全部接口 */
export interface Api {
  getCategories: (type: RecordType) => Promise<Category[]>
  getRecords: (month: string) => Promise<RecordItem[]>
  getMonthTrend: (count: number) => Promise<MonthTrend[]>
  createRecord: (input: RecordInput) => Promise<RecordItem>
  updateRecord: (id: number, input: RecordInput) => Promise<RecordItem>
  deleteRecord: (id: number) => Promise<void>
  createCategory: (input: CategoryInput) => Promise<Category>
  updateCategory: (id: number, name: string, icon?: string) => Promise<Category>
  deleteCategory: (id: number) => Promise<void>
  moveCategory: (id: number, direction: 'up' | 'down') => Promise<void>
  exportCsv: (month: string | null) => Promise<ExportResult>
}
