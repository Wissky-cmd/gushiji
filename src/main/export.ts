import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { getAllRecords, getRecords } from './db'
import type { ExportResult } from '../shared/types'

// CSV 单元格转义（含逗号/引号/换行的字段加引号包裹）
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"'
  return value
}

function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

// 导出账目为 CSV 文件（弹出"另存为"窗口，默认保存到文档目录）
export async function exportCsv(month: string | null): Promise<ExportResult> {
  const records = month ? getRecords(month) : getAllRecords()
  if (records.length === 0) return { canceled: false, empty: true }

  const defaultName = month ? `故事记-${month}.csv` : `故事记-全部账目-${todayStamp()}.csv`
  const options = {
    title: '导出账目',
    defaultPath: join(app.getPath('documents'), defaultName),
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
  }
  const win = BrowserWindow.getFocusedWindow()
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { canceled: true }

  const header = ['日期', '类型', '金额(元)', '一级分类', '二级分类', '备注']
  // 日期列写成 ="YYYY-MM-DD" 文本公式，防止 Excel 自动把它识别成日期并改变显示格式
  const rows = records.map((r) => [
    `="${r.date}"`,
    r.type === 'expense' ? '支出' : '收入',
    (r.amountCents / 100).toFixed(2),
    r.parentName,
    r.categoryName,
    r.note
  ])
  // 开头加 BOM，保证 Excel 打开时中文不乱码
  const csv = '﻿' + [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
  try {
    writeFileSync(result.filePath, csv, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EBUSY' || code === 'EPERM') {
      throw new Error('该文件正被 Excel 等程序打开占用，请先关闭那个文件再导出，或另存为其他文件名')
    }
    throw err
  }
  return { canceled: false, path: result.filePath, count: records.length }
}
