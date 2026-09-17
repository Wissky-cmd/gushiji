// 金额格式化（format.ts）的单元测试

import { describe, expect, it } from 'vitest'
import { formatMoney } from '../src/renderer/src/utils/format'

describe('金额格式化（formatMoney）', () => {
  it('分 → 元，保留两位小数', () => {
    expect(formatMoney(12345)).toBe('123.45')
    expect(formatMoney(50)).toBe('0.50')
    expect(formatMoney(0)).toBe('0.00')
    expect(formatMoney(1)).toBe('0.01')
  })
})
