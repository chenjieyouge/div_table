// 性能监控工具类
export class PerformanceMonitor {

  private static enabled = false // 默认关闭, 生产环境下不影响性能

  public static enable() {
    this.enabled = true 
  }

  public static disable() {
    this.enabled = false 
  }

  // 测量同步函数执行时间
  public static measure<T>(name: string, fn: () => T, threshold = 10): T {
    if (!this.enabled) {
      return fn()
    }
    const startTime = performance.now()
    const result = fn()
    const endTime = performance.now()
    
    const duration = endTime - startTime
    if (duration > threshold) {
      console.warn(`[性能] ${name} 耗时: ${duration.toFixed(2)}ms`)
    }
    return result
  }

  // 测量异步函数执行时间
  public static async measureAsync<T>(name: string, fn: () => Promise<T>, threshold = 10): Promise<T> {
    // 若状态是开启测量, 则执行被测量函数
    if (!this.enabled) {
      return fn()
    }
    const startTime = performance.now()
    const result = await fn()
    const endTime = performance.now()

    const duration = endTime - startTime
    if (duration > threshold) {
      console.warn(`[性能] ${name} 耗时: ${duration.toFixed(2)}ms`)
    }
    return result
  }
}