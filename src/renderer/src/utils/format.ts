/** 金额格式化：分 → 元的字符串（保留两位小数） */
export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}
