// 列宽持久化存储工具类
export class ColumnWidthStorage {
  private storageKey: string 

  constructor(tableId: string) {
    this.storageKey = `div_table_column_widths_${tableId}`
  }

  // 保存列宽到 localstorage
  public save(widths: Record<string, number>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(widths))
    } catch (err) {
      console.warn('保存列宽失败: ', err)
    }
  }

  // 从 localStorage 恢复列宽
  public load(): Record<string, number> | null {
    try {
      const data = localStorage.getItem(this.storageKey)
      return data ? JSON.parse(data) : null 
    } catch (err) {
      console.warn('恢复列宽失败: ', err)
      return null 
    }
  }

  // 清除保存的列宽
  public clear(): void {
    try {
      localStorage.removeItem(this.storageKey)
    } catch (err) {
      console.warn('清除列宽失败: ', err)
    }
  }
}