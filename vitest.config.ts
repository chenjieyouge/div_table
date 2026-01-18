import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // 使用 jsdom 模拟浏览器环境
    environment: 'jsdom',
    
    // 测试覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    },
    
    // 全局测试设置
    globals: true,
    
    // 测试文件匹配模式
    include: ['src/**/*.{test,spec}.ts']
  },
  
  // 路径别名(与 tsconfig.json 保持一致)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})