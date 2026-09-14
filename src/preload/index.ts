import { contextBridge, ipcRenderer } from 'electron'
import type { Api, RecordInput, RecordType } from '../shared/types'

// 界面侧可调用的全部接口（与 src/shared/types.ts 的 Api 一致）
const api: Api = {
  getCategories: (type: RecordType) => ipcRenderer.invoke('db:getCategories', type),
  getRecords: (month: string) => ipcRenderer.invoke('db:getRecords', month),
  getMonthTrend: (count: number) => ipcRenderer.invoke('db:getMonthTrend', count),
  createRecord: (input: RecordInput) => ipcRenderer.invoke('db:createRecord', input),
  updateRecord: (id: number, input: RecordInput) => ipcRenderer.invoke('db:updateRecord', id, input),
  deleteRecord: (id: number) => ipcRenderer.invoke('db:deleteRecord', id)
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
