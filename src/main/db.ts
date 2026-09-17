import { app } from 'electron'
import { join } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import type { Category, CategoryInput, MonthTrend, RecordItem, RecordInput, RecordType } from '../shared/types'

// 内置默认分类（与 CLAUDE.md 3.2 一致，仅在首次启动时写入）
const DEFAULT_CATEGORIES: { type: RecordType; icon: string; name: string; children: string[] }[] = [
  { type: 'expense', icon: '🍜', name: '餐饮', children: ['早餐', '午餐', '晚餐', '夜宵', '零食', '饮料', '外卖', '聚餐'] },
  { type: 'expense', icon: '🚇', name: '交通', children: ['公交地铁', '打车', '加油充电', '停车', '火车票', '机票', '共享单车'] },
  { type: 'expense', icon: '🛒', name: '购物', children: ['服饰鞋包', '日用品', '数码家电', '美妆护肤', '其他购物'] },
  { type: 'expense', icon: '🏠', name: '居住', children: ['房租', '房贷', '水电燃气', '物业', '网络话费', '家居维修'] },
  { type: 'expense', icon: '🎮', name: '娱乐', children: ['电影演出', '游戏', '旅游', '运动健身', '会员订阅', '其他娱乐'] },
  { type: 'expense', icon: '💊', name: '医疗健康', children: ['门诊', '买药', '体检', '住院', '保健'] },
  { type: 'expense', icon: '📚', name: '教育学习', children: ['课程培训', '考试报名', '书籍文具'] },
  { type: 'expense', icon: '🧧', name: '人情往来', children: ['红包', '送礼', '请客', '捐赠'] },
  { type: 'expense', icon: '📦', name: '其他', children: ['其他支出'] },
  { type: 'income', icon: '💼', name: '工资薪金', children: ['基本工资', '加班费', '补贴'] },
  { type: 'income', icon: '🏆', name: '奖金绩效', children: ['年终奖', '项目奖金', '绩效'] },
  { type: 'income', icon: '📈', name: '理财收益', children: ['利息', '基金/股票收益', '房租收入'] },
  { type: 'income', icon: '🧑‍💻', name: '兼职外快', children: ['兼职', '接单', '二手卖出'] },
  { type: 'income', icon: '🧧', name: '红包礼金', children: ['收红包', '礼金', '退款'] },
  { type: 'income', icon: '💰', name: '其他收入', children: ['其他收入'] }
]

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

// 关闭数据库连接（应用退出时调用；单元测试用它释放文件占用后清理临时目录）
export function closeDb(): void {
  db?.close()
  db = null
}

// 数据文件位置（与 CLAUDE.md 六 一致，本机存储）：
// Windows: C:\Users\<用户名>\AppData\Roaming\故事记\heimajizhang.db
// macOS:   ~/Library/Application Support/故事记/heimajizhang.db
export function initDb(): void {
  const dataDir = join(app.getPath('appData'), '故事记')
  mkdirSync(dataDir, { recursive: true })
  const dbPath = join(dataDir, 'heimajizhang.db')
  // 旧版数据搬家：新账本不存在且旧版「黑马记账」账本存在时，复制过来（旧文件保留作备份）
  if (!existsSync(dbPath)) {
    const legacyDir = join(app.getPath('appData'), '黑马记账')
    const legacyDb = join(legacyDir, 'heimajizhang.db')
    if (existsSync(legacyDb)) {
      copyFileSync(legacyDb, dbPath)
      for (const ext of ['-wal', '-shm']) {
        const side = join(legacyDir, `heimajizhang.db${ext}`)
        if (existsSync(side)) copyFileSync(side, join(dataDir, `heimajizhang.db${ext}`))
      }
    }
  }
  db = new DatabaseSync(dbPath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL CHECK (type IN ('expense', 'income')),
      parent_id  INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      icon       TEXT NOT NULL DEFAULT '📦',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS records (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT NOT NULL CHECK (type IN ('expense', 'income')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category_id  INTEGER NOT NULL REFERENCES categories(id),
      date         TEXT NOT NULL,
      note         TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
  `)
  seedDefaultCategories()
}

function seedDefaultCategories(): void {
  const { c } = getDb().prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }
  if (c > 0) return
  const insert = getDb().prepare(
    'INSERT INTO categories (type, parent_id, name, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  getDb().exec('BEGIN')
  try {
    let order = 0
    for (const group of DEFAULT_CATEGORIES) {
      const parentId = insert.run(group.type, null, group.name, group.icon, order++).lastInsertRowid
      for (const child of group.children) {
        insert.run(group.type, parentId, child, group.icon, order++)
      }
    }
    getDb().exec('COMMIT')
  } catch (err) {
    getDb().exec('ROLLBACK')
    throw err
  }
}

export function getCategories(type: RecordType): Category[] {
  return getDb()
    .prepare(
      'SELECT id, type, parent_id AS parentId, name, icon, sort_order AS sortOrder FROM categories WHERE type = ? ORDER BY sort_order, id'
    )
    .all(type) as unknown as Category[]
}

const RECORD_SELECT = `
  SELECT r.id, r.type, r.amount_cents AS amountCents, r.category_id AS categoryId, r.date, r.note,
         c.name AS categoryName, c.icon AS categoryIcon, p.name AS parentName
  FROM records r
  JOIN categories c ON c.id = r.category_id
  LEFT JOIN categories p ON p.id = c.parent_id
`

export function getRecords(month: string): RecordItem[] {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月份格式不正确')
  return getDb()
    .prepare(`${RECORD_SELECT} WHERE substr(r.date, 1, 7) = ? ORDER BY r.date DESC, r.id DESC`)
    .all(month) as unknown as RecordItem[]
}

function getRecordById(id: number): RecordItem | undefined {
  return getDb().prepare(`${RECORD_SELECT} WHERE r.id = ?`).get(id) as unknown as
    | RecordItem
    | undefined
}

function validateInput(input: RecordInput): void {
  if (input.type !== 'expense' && input.type !== 'income') throw new Error('收支类型不正确')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('金额必须大于 0')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('日期格式不正确')
  const cat = getDb()
    .prepare('SELECT id, type, parent_id AS parentId FROM categories WHERE id = ?')
    .get(input.categoryId) as { id: number; type: RecordType; parentId: number | null } | undefined
  if (!cat || cat.type !== input.type || cat.parentId === null) {
    throw new Error('分类不正确，请选择二级分类')
  }
}

export function createRecord(input: RecordInput): RecordItem {
  validateInput(input)
  const result = getDb()
    .prepare('INSERT INTO records (type, amount_cents, category_id, date, note) VALUES (?, ?, ?, ?, ?)')
    .run(input.type, input.amountCents, input.categoryId, input.date, input.note.trim())
  return getRecordById(Number(result.lastInsertRowid))!
}

export function updateRecord(id: number, input: RecordInput): RecordItem {
  validateInput(input)
  const result = getDb()
    .prepare(
      "UPDATE records SET type = ?, amount_cents = ?, category_id = ?, date = ?, note = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
    )
    .run(input.type, input.amountCents, input.categoryId, input.date, input.note.trim(), id)
  if (result.changes === 0) throw new Error('该账目不存在')
  return getRecordById(id)!
}

export function deleteRecord(id: number): void {
  const result = getDb().prepare('DELETE FROM records WHERE id = ?').run(id)
  if (result.changes === 0) throw new Error('该账目不存在')
}

// 最近 count 个月的收支合计（没有账目的月份不会出现在结果里，由界面补零）
export function getMonthTrend(count: number): MonthTrend[] {
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('月份数量不正确')
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - count + 1, 1)
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  return getDb()
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS expense,
              SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) AS income
       FROM records
       WHERE date >= ?
       GROUP BY month
       ORDER BY month`
    )
    .all(startDate) as unknown as MonthTrend[]
}

// 全部账目（用于导出备份），按时间正序
export function getAllRecords(): RecordItem[] {
  return getDb().prepare(`${RECORD_SELECT} ORDER BY r.date ASC, r.id ASC`).all() as unknown as RecordItem[]
}

function getCategoryById(id: number): Category | undefined {
  return getDb()
    .prepare('SELECT id, type, parent_id AS parentId, name, icon, sort_order AS sortOrder FROM categories WHERE id = ?')
    .get(id) as unknown as Category | undefined
}

export function createCategory(input: CategoryInput): Category {
  const name = input.name.trim()
  if (!name) throw new Error('分类名称不能为空')
  let icon = input.icon ?? '📦'
  if (input.parentId !== null) {
    const parent = getCategoryById(input.parentId)
    if (!parent || parent.type !== input.type || parent.parentId !== null) {
      throw new Error('所属大类不正确')
    }
    icon = parent.icon
  }
  const max = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE type = ? AND parent_id IS ?')
    .get(input.type, input.parentId) as { m: number }
  const result = getDb()
    .prepare('INSERT INTO categories (type, parent_id, name, icon, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(input.type, input.parentId, name, icon, max.m + 1)
  return getCategoryById(Number(result.lastInsertRowid))!
}

export function updateCategory(id: number, name: string, icon?: string): Category {
  const cat = getCategoryById(id)
  if (!cat) throw new Error('分类不存在')
  const newName = name.trim()
  if (!newName) throw new Error('分类名称不能为空')
  getDb()
    .prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?')
    .run(newName, icon ?? cat.icon, id)
  if (cat.parentId === null && icon) {
    // 一级分类换图标时，二级分类跟随
    getDb().prepare('UPDATE categories SET icon = ? WHERE parent_id = ?').run(icon, id)
  }
  return getCategoryById(id)!
}

export function deleteCategory(id: number): void {
  const cat = getCategoryById(id)
  if (!cat) throw new Error('分类不存在')
  if (cat.parentId === null) {
    const children = getDb().prepare('SELECT COUNT(*) AS c FROM categories WHERE parent_id = ?').get(id) as { c: number }
    if (children.c > 0) throw new Error(`「${cat.name}」下还有小分类，请先删除它们`)
  }
  const used = getDb().prepare('SELECT COUNT(*) AS c FROM records WHERE category_id = ?').get(id) as { c: number }
  if (used.c > 0) throw new Error(`「${cat.name}」下已有账目，不能删除（可先删除或修改这些账目）`)
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
}

// 在同一层级内上移/下移（交换 sort_order）
export function moveCategory(id: number, direction: 'up' | 'down'): void {
  const cat = getCategoryById(id)
  if (!cat) throw new Error('分类不存在')
  const siblings = getDb()
    .prepare('SELECT id, sort_order AS sortOrder FROM categories WHERE type = ? AND parent_id IS ? ORDER BY sort_order, id')
    .all(cat.type, cat.parentId) as { id: number; sortOrder: number }[]
  const idx = siblings.findIndex((s) => s.id === id)
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || targetIdx < 0 || targetIdx >= siblings.length) return
  const target = siblings[targetIdx]
  getDb().exec('BEGIN')
  try {
    const upd = getDb().prepare('UPDATE categories SET sort_order = ? WHERE id = ?')
    upd.run(target.sortOrder, cat.id)
    upd.run(cat.sortOrder, target.id)
    getDb().exec('COMMIT')
  } catch (err) {
    getDb().exec('ROLLBACK')
    throw err
  }
}
