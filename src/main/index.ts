import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb, getCategories, getRecords, getMonthTrend, createRecord, updateRecord, deleteRecord } from './db'
import type { RecordInput, RecordType } from '../shared/types'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 860,
    minHeight: 620,
    show: false,
    title: '黑马记账',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 注册账本数据库接口（界面通过 window.api 调用，见 src/preload/index.ts）
function registerIpcHandlers(): void {
  ipcMain.handle('db:getCategories', (_event, type: RecordType) => getCategories(type))
  ipcMain.handle('db:getRecords', (_event, month: string) => getRecords(month))
  ipcMain.handle('db:getMonthTrend', (_event, count: number) => getMonthTrend(count))
  ipcMain.handle('db:createRecord', (_event, input: RecordInput) => createRecord(input))
  ipcMain.handle('db:updateRecord', (_event, id: number, input: RecordInput) => updateRecord(id, input))
  ipcMain.handle('db:deleteRecord', (_event, id: number) => deleteRecord(id))
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.heimajizhang')

  initDb()
  registerIpcHandlers()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
