// 账本数据库（db.ts）的单元测试
//
// 安全说明：测试把 electron 的 app 换成假模块，账本写入系统临时目录的测试专用文件夹，
// 绝不读写用户真实账本（AppData\Roaming\故事记 里的数据）。

import { rmSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import dayjs from 'dayjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// electron 模块在纯 Node 环境里不可用，用假模块替换（工厂里不能引用模块级常量，故路径在此内联）
vi.mock('electron', () => ({
  app: { getPath: () => (process.env.TEMP || '/tmp') + '/gushiji-vitest-data' }
}))

import {
  closeDb,
  createCategory,
  createRecord,
  deleteCategory,
  deleteRecord,
  getCategories,
  getMonthTrend,
  getRecords,
  initDb,
  moveCategory,
  updateCategory,
  updateRecord
} from '../src/main/db'
import type { RecordInput } from '../src/shared/types'

const TEST_DATA_DIR = (process.env.TEMP || '/tmp') + '/gushiji-vitest-data'
const DB_PATH = TEST_DATA_DIR + '/故事记/heimajizhang.db'

// 内置分类总数（初始化后记录，用于清理自定义分类，绝不误删内置分类）
let builtinCategoryCount = 0

/** 每个检查开始前：清空账目与测试自建分类，回到干净状态 */
function resetDb(): void {
  const raw = new DatabaseSync(DB_PATH)
  raw.prepare('DELETE FROM records').run()
  raw.prepare('DELETE FROM categories WHERE id > ?').run(builtinCategoryCount)
  raw.close()
}

/** 取内置支出分类「餐饮」下「午餐」的 id（二级分类，记账必须用二级） */
function expenseChildId(): number {
  const cat = getCategories('expense').find((c) => c.name === '午餐')
  if (!cat) throw new Error('内置分类缺失：午餐')
  return cat.id
}

function incomeChildId(): number {
  const cat = getCategories('income').find((c) => c.name === '基本工资')
  if (!cat) throw new Error('内置分类缺失：基本工资')
  return cat.id
}

function firstParentId(type: 'expense' | 'income'): number {
  const cat = getCategories(type).find((c) => c.parentId === null)
  if (!cat) throw new Error('内置一级分类缺失')
  return cat.id
}

/** 一份合法的新账目输入 */
function validInput(overrides: Partial<RecordInput> = {}): RecordInput {
  return {
    type: 'expense',
    amountCents: 2000,
    categoryId: expenseChildId(),
    date: '2026-09-17',
    note: '午饭',
    ...overrides
  }
}

beforeAll(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  initDb()
  builtinCategoryCount = getCategories('expense').length + getCategories('income').length
})

afterAll(() => {
  closeDb()
  rmSync(TEST_DATA_DIR, { recursive: true, force: true })
})

beforeEach(resetDb)

describe('内置分类', () => {
  it('支出分类：9 个大类，一级之下挂二级', () => {
    const cats = getCategories('expense')
    expect(cats.filter((c) => c.parentId === null)).toHaveLength(9)
    expect(cats.some((c) => c.name === '餐饮' && c.icon === '🍜')).toBe(true)
    expect(cats.some((c) => c.name === '午餐' && c.parentId !== null)).toBe(true)
  })

  it('收入分类：6 个大类', () => {
    const cats = getCategories('income')
    expect(cats.filter((c) => c.parentId === null)).toHaveLength(6)
  })

  it('二级分类的 parentId 指向对应一级分类', () => {
    const cats = getCategories('expense')
    const lunch = cats.find((c) => c.name === '午餐')!
    const food = cats.find((c) => c.name === '餐饮')!
    expect(lunch.parentId).toBe(food.id)
  })
})

describe('记一笔（createRecord）', () => {
  it('正常记一笔支出，返回带分类名称与图标的完整记录', () => {
    const record = createRecord(validInput())
    expect(record.amountCents).toBe(2000)
    expect(record.type).toBe('expense')
    expect(record.categoryName).toBe('午餐')
    expect(record.parentName).toBe('餐饮')
    expect(record.categoryIcon).toBe('🍜')
    expect(record.note).toBe('午饭')
  })

  it('备注自动去掉首尾空格', () => {
    const record = createRecord(validInput({ note: '  和同事吃饭  ' }))
    expect(record.note).toBe('和同事吃饭')
  })

  it('金额为 0 或负数时报错', () => {
    expect(() => createRecord(validInput({ amountCents: 0 }))).toThrow('金额必须大于 0')
    expect(() => createRecord(validInput({ amountCents: -100 }))).toThrow('金额必须大于 0')
  })

  it('金额带小数（非整数分）时报错', () => {
    expect(() => createRecord(validInput({ amountCents: 10.5 }))).toThrow('金额必须大于 0')
  })

  it('收支类型不合法时报错', () => {
    expect(() => createRecord(validInput({ type: 'other' as never }))).toThrow('收支类型不正确')
  })

  it('日期格式不正确时报错', () => {
    expect(() => createRecord(validInput({ date: '2026/09/17' }))).toThrow('日期格式不正确')
    expect(() => createRecord(validInput({ date: '2026-9-17' }))).toThrow('日期格式不正确')
  })

  it('支出账选了收入分类时报错', () => {
    expect(() => createRecord(validInput({ categoryId: incomeChildId() }))).toThrow(
      '分类不正确，请选择二级分类'
    )
  })

  it('选了不存在或一级分类时报错', () => {
    expect(() => createRecord(validInput({ categoryId: 999999 }))).toThrow('分类不正确')
    expect(() => createRecord(validInput({ categoryId: firstParentId('expense') }))).toThrow(
      '分类不正确'
    )
  })
})

describe('账单查询（getRecords）', () => {
  it('月份格式不正确时报错', () => {
    expect(() => getRecords('2026-9')).toThrow('月份格式不正确')
    expect(() => getRecords('2026/09')).toThrow('月份格式不正确')
  })

  it('只返回指定月份的账目', () => {
    createRecord(validInput({ date: '2026-09-01', note: '九月的' }))
    createRecord(validInput({ date: '2026-08-31', note: '八月的' }))
    createRecord(validInput({ date: '2026-10-01', note: '十月的' }))
    const records = getRecords('2026-09')
    expect(records).toHaveLength(1)
    expect(records[0].note).toBe('九月的')
  })

  it('同月账目按日期倒序排列，同日按记账先后倒序', () => {
    createRecord(validInput({ date: '2026-09-01', note: '早' }))
    createRecord(validInput({ date: '2026-09-03', note: '晚' }))
    createRecord(validInput({ date: '2026-09-03', note: '晚二' }))
    const notes = getRecords('2026-09').map((r) => r.note)
    expect(notes).toEqual(['晚二', '晚', '早'])
  })
})

describe('修改与删除', () => {
  it('修改一笔账，字段全部更新', () => {
    const created = createRecord(validInput())
    const updated = updateRecord(created.id, validInput({ amountCents: 3500, note: '改成35元' }))
    expect(updated.amountCents).toBe(3500)
    expect(updated.note).toBe('改成35元')
    expect(getRecords('2026-09')).toHaveLength(1)
  })

  it('修改不存在的账目时报错', () => {
    expect(() => updateRecord(999999, validInput())).toThrow('该账目不存在')
  })

  it('删除一笔账，账单里不再出现', () => {
    const created = createRecord(validInput())
    deleteRecord(created.id)
    expect(getRecords('2026-09')).toHaveLength(0)
  })

  it('删除不存在的账目时报错', () => {
    expect(() => deleteRecord(999999)).toThrow('该账目不存在')
  })
})

describe('月度统计（getMonthTrend）', () => {
  it('本月的支出与收入分别汇总正确', () => {
    const today = dayjs().format('YYYY-MM-DD')
    createRecord(validInput({ date: today, amountCents: 2000 }))
    createRecord(validInput({ date: today, amountCents: 500 }))
    createRecord(
      validInput({ type: 'income', date: today, amountCents: 100000, categoryId: incomeChildId() })
    )
    const thisMonth = today.slice(0, 7)
    const trend = getMonthTrend(1)
    expect(trend).toEqual([{ month: thisMonth, expense: 2500, income: 100000 }])
  })

  it('包含上月账目，不包含更早的账目', () => {
    const thisMonth = dayjs().format('YYYY-MM-DD')
    const lastMonth = dayjs().subtract(1, 'month').format('YYYY-MM-DD')
    const twoMonthsAgo = dayjs().subtract(2, 'month').format('YYYY-MM-DD')
    createRecord(validInput({ date: thisMonth, note: '本月', amountCents: 100 }))
    createRecord(validInput({ date: lastMonth, note: '上月', amountCents: 200 }))
    createRecord(validInput({ date: twoMonthsAgo, note: '上上月', amountCents: 300 }))
    const trend = getMonthTrend(2)
    expect(trend.map((t) => t.month)).toEqual([lastMonth.slice(0, 7), thisMonth.slice(0, 7)])
    expect(trend[0].expense).toBe(200)
    expect(trend[1].expense).toBe(100)
  })

  it('月份数量参数不合法时报错', () => {
    expect(() => getMonthTrend(0)).toThrow('月份数量不正确')
    expect(() => getMonthTrend(-1)).toThrow('月份数量不正确')
    expect(() => getMonthTrend(1.5)).toThrow('月份数量不正确')
    expect(() => getMonthTrend(61)).toThrow('月份数量不正确')
  })

  it('支持指定截止月份：回看过去月份时，统计窗口跟随所选月份', () => {
    const threeMonthsAgo = dayjs().subtract(3, 'month').format('YYYY-MM-DD')
    createRecord(validInput({ date: threeMonthsAgo, amountCents: 700, note: '三个月前' }))
    const endMonth = threeMonthsAgo.slice(0, 7)
    // 截止到 3 个月前：这笔账在窗口内，应统计到
    const withEnd = getMonthTrend(1, endMonth)
    expect(withEnd).toHaveLength(1)
    expect(withEnd[0].expense).toBe(700)
    // 不传截止月份（默认以今天为终点）：这笔账在窗口外，不应出现
    const noEnd = getMonthTrend(1)
    expect(noEnd.some((t) => t.expense === 700)).toBe(false)
  })

  it('截止月份格式不正确时报错', () => {
    expect(() => getMonthTrend(12, '2026-9')).toThrow('月份格式不正确')
  })
})

describe('分类管理', () => {
  it('新建一级分类成功', () => {
    const cat = createCategory({ type: 'expense', parentId: null, name: '宠物', icon: '🐱' })
    expect(cat.name).toBe('宠物')
    expect(cat.icon).toBe('🐱')
    expect(cat.parentId).toBeNull()
  })

  it('新建二级分类：图标自动跟随一级分类', () => {
    const parent = createCategory({ type: 'expense', parentId: null, name: '宠物', icon: '🐱' })
    const child = createCategory({ type: 'expense', parentId: parent.id, name: '猫粮' })
    expect(child.icon).toBe('🐱')
    expect(child.parentId).toBe(parent.id)
  })

  it('分类名称为空（或纯空格）时报错', () => {
    expect(() => createCategory({ type: 'expense', parentId: null, name: '   ' })).toThrow(
      '分类名称不能为空'
    )
  })

  it('二级分类的父分类不是一级分类时报错', () => {
    const parent = createCategory({ type: 'expense', parentId: null, name: '宠物', icon: '🐱' })
    const child = createCategory({ type: 'expense', parentId: parent.id, name: '猫粮' })
    // 把「猫粮」当成一级分类再挂子分类 → 报错
    expect(() => createCategory({ type: 'expense', parentId: child.id, name: '猫粮品牌' })).toThrow(
      '所属大类不正确'
    )
    // 收入分类挂到支出一级分类下 → 报错
    expect(() => createCategory({ type: 'income', parentId: parent.id, name: '卖宠物' })).toThrow(
      '所属大类不正确'
    )
  })

  it('一级分类换图标后，二级分类图标跟随', () => {
    const parent = createCategory({ type: 'expense', parentId: null, name: '宠物', icon: '🐱' })
    createCategory({ type: 'expense', parentId: parent.id, name: '猫粮' })
    updateCategory(parent.id, '宠物', '🐶')
    const child = getCategories('expense').find((c) => c.name === '猫粮')!
    expect(child.icon).toBe('🐶')
  })

  it('修改分类名称成功', () => {
    const cat = createCategory({ type: 'expense', parentId: null, name: '宠物', icon: '🐱' })
    const updated = updateCategory(cat.id, '萌宠')
    expect(updated.name).toBe('萌宠')
  })

  it('删除空分类成功', () => {
    const cat = createCategory({ type: 'expense', parentId: null, name: '宠物', icon: '🐱' })
    deleteCategory(cat.id)
    expect(getCategories('expense').some((c) => c.name === '宠物')).toBe(false)
  })

  it('大类下还有小分类时不能删除', () => {
    const parent = createCategory({ type: 'expense', parentId: null, name: '宠物', icon: '🐱' })
    createCategory({ type: 'expense', parentId: parent.id, name: '猫粮' })
    expect(() => deleteCategory(parent.id)).toThrow('下还有小分类')
  })

  it('分类下已有账目时不能删除', () => {
    const child = createCategory({
      type: 'expense',
      parentId: firstParentId('expense'),
      name: '临时分类'
    })
    createRecord(validInput({ categoryId: child.id }))
    expect(() => deleteCategory(child.id)).toThrow('已有账目，不能删除')
  })

  it('同一层级内移动分类（上移/下移交换顺序）', () => {
    createCategory({ type: 'expense', parentId: null, name: '分类A', icon: '🅰️' })
    const b = createCategory({ type: 'expense', parentId: null, name: '分类B', icon: '🅱️' })
    // 初始顺序：…内置…, A, B
    const names = (): string[] => getCategories('expense').map((c) => c.name)
    expect(names().slice(-2)).toEqual(['分类A', '分类B'])
    moveCategory(b.id, 'up')
    expect(names().slice(-2)).toEqual(['分类B', '分类A'])
    moveCategory(b.id, 'down')
    expect(names().slice(-2)).toEqual(['分类A', '分类B'])
  })

  it('移动到边界时顺序不变、不报错', () => {
    const a = createCategory({ type: 'expense', parentId: null, name: '分类A', icon: '🅰️' })
    moveCategory(a.id, 'down') // 已是最后一位，向下移动 → 保持不变
    const names = getCategories('expense').map((c) => c.name)
    expect(names[names.length - 1]).toBe('分类A')
    const first = getCategories('expense')[0]
    moveCategory(first.id, 'up') // 已是第一位，向上移动 → 保持不变
    expect(getCategories('expense')[0].name).toBe(first.name)
  })
})
