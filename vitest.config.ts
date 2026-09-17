import { defineConfig } from 'vitest/config'

// 单元测试配置（与 electron-vite 的打包配置互不影响）
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
