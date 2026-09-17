// CSV 导出（export.ts）的单元测试

import { describe, expect, it, vi } from 'vitest'

// electron 模块在纯 Node 环境里不可用，用空假模块替换（本文件只测纯函数，不弹保存窗口）
vi.mock('electron', () => ({}))

import { buildCsv, escapeCell } from '../src/main/export'
import type { RecordItem } from '../src/shared/types'

function record(overrides: Partial<RecordItem> = {}): RecordItem {
  return {
    id: 1,
    type: 'expense',
    amountCents: 12345,
    categoryId: 1,
    date: '2026-09-17',
    note: '备注',
    categoryName: '午餐',
    categoryIcon: '🍜',
    parentName: '餐饮',
    ...overrides
  }
}

describe('CSV 单元格转义（escapeCell）', () => {
  it('普通文字原样输出', () => {
    expect(escapeCell('午餐')).toBe('午餐')
  })

  it('含逗号、引号或换行的文字用引号包裹', () => {
    expect(escapeCell('吃饭,喝水')).toBe('"吃饭,喝水"')
    expect(escapeCell('说"你好"')).toBe('"说""你好"""')
    expect(escapeCell('第一行\n第二行')).toBe('"第一行\n第二行"')
  })
})

describe('CSV 文件内容（buildCsv）', () => {
  it('开头带 BOM 标记（防止 Excel 打开中文乱码）', () => {
    const csv = buildCsv([record()])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('表头为：日期、类型、金额(元)、一级分类、二级分类、备注', () => {
    const csv = buildCsv([record()])
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[0]).toBe('日期,类型,金额(元),一级分类,二级分类,备注')
  })

  it('金额从「分」换算成「元」并保留两位小数', () => {
    const csv = buildCsv([record({ amountCents: 12345 })])
    expect(csv).toContain('123.45')
    const csv2 = buildCsv([record({ amountCents: 50 })])
    expect(csv2).toContain('0.50')
  })

  it('日期列写成文本公式，防止 Excel 自动改日期格式', () => {
    // 公式文本含引号，按 CSV 规范转义后 Excel 打开会还原成 ="2026-09-01"，仍按文本显示日期
    const csv = buildCsv([record({ date: '2026-09-01' })])
    expect(csv).toContain('"=""2026-09-01"""')
  })

  it('支出显示「支出」、收入显示「收入」', () => {
    const csv = buildCsv([record({ type: 'expense' }), record({ id: 2, type: 'income' })])
    expect(csv).toContain('支出')
    expect(csv).toContain('收入')
  })

  it('备注含逗号时正确转义，一行账目仍占一行', () => {
    const csv = buildCsv([record({ note: '买了菜,还了钱' })])
    expect(csv).toContain('"买了菜,还了钱"')
    expect(csv.split('\r\n')).toHaveLength(2) // 表头一行 + 数据一行
  })
})
