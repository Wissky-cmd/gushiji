import { contextBridge, ipcRenderer } from 'electron'
import type { Api, CategoryInput, RecordInput, RecordType } from '../shared/types'

// 界面侧可调用的全部接口（与 src/shared/types.ts 的 Api 一致）
const api: Api = {
  getCategories: (type: RecordType) => ipcRenderer.invoke('db:getCategories', type),
  getRecords: (month: string) => ipcRenderer.invoke('db:getRecords', month),
  getMonthTrend: (count: number, endMonth?: string) =>
    ipcRenderer.invoke('db:getMonthTrend', count, endMonth),
  createRecord: (input: RecordInput) => ipcRenderer.invoke('db:createRecord', input),
  updateRecord: (id: number, input: RecordInput) =>
    ipcRenderer.invoke('db:updateRecord', id, input),
  deleteRecord: (id: number) => ipcRenderer.invoke('db:deleteRecord', id),
  createCategory: (input: CategoryInput) => ipcRenderer.invoke('db:createCategory', input),
  updateCategory: (id: number, name: string, icon?: string) =>
    ipcRenderer.invoke('db:updateCategory', id, name, icon),
  deleteCategory: (id: number) => ipcRenderer.invoke('db:deleteCategory', id),
  moveCategory: (id: number, direction: 'up' | 'down') =>
    ipcRenderer.invoke('db:moveCategory', id, direction),
  exportCsv: (month: string | null) => ipcRenderer.invoke('export:csv', month)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
