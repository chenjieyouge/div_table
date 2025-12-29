
import { IPageResponse, ITableQuery } from "@/types";

// 模拟生成后端分页数据, 全局 filter / sort 后分页 + totalRows

/**
 * 模拟分页 API
 * @param pageIndex 页码从 0 开始
 * @param pageSize  每页的数量
 * @param totalRows 总行数
 * @param query?: ITableQuery 全局的筛选排序条件
 * @returns Promise<{ list: Record<string, any>[]>, totalRows: number }>
 */

// 本地加载大数据测试, 接受大性能问题, 但暂时能用, 这样才方便测试
export async function mockFechPageData(
  pageIndex: number,
  pageSize: number,
  totalRows: number,
  query?: ITableQuery
): Promise<IPageResponse> {
  // 模拟网络延迟 1s 
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000 + 250))
  // 1. 生成全量蜀山 (模拟后端全表), 这个会有性能问题吧!
  const allRows: Record<string, any>[] = []
  for (let i = 0; i < totalRows; i++) {
    allRows.push(generateRow(i, i+1))
  }
  // 2. 应用列筛选 (模拟后端 where 条件)
  let filtered = allRows
  if (query?.columnFilters) {
    filtered = allRows.filter(row => {
      for (const key in query.columnFilters!) {
        const filter = query.columnFilters![key]
        const cellVal = row[key]
        if (filter.kind ==='set') {
          if (filter.values.length === 0) continue 
          if (!filter.values.includes(String(cellVal ?? ''))) return false

        } else if (filter.kind === 'text') {
          if (!filter.value) continue 
          if (!String(cellVal ?? '').toLowerCase().includes(filter.value.toLowerCase())) {
            return false 
          }

        } else if (filter.kind === 'dateRange') {
          const dateStr = String(cellVal ?? '')
          if (filter.start && dateStr < filter.start) return false 
          if (filter.end && dateStr > filter.end) return false

        } else if (filter.kind === 'numberRange') {
          const num = Number(cellVal)
          if (isNaN(num)) return false 
          if (filter.min !== undefined && num < filter.min) return false 
          if (filter.max !== undefined && num > filter.max) return false 

        } // else if 其他值类型
      }
      return true 
    })
  }

  // 3. 应用全局文本筛选
  if (query?.filterText) {
    const kw = query.filterText.toLowerCase()
    filtered = filtered.filter(row =>
      Object.values(row).some(val => String(val).toLowerCase().includes(kw))
    )
  }

  // 4. 应用排序
  if (query?.sortKey && query.sortDirection) {
    const key = query.sortKey
    const dir = query.sortDirection
    filtered.sort((a, b) => {
      const aVal = a[key]
      const bVal = b[key]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (aVal < bVal) return dir === 'asc' ? -1 : 1
      if (aVal > bVal) return dir === 'asc' ? 1 : -1
      return 0
    })
  }

  // 5. 分页 
  const filteredTotalRows = filtered.length
  const start = pageIndex * pageSize
  const end = Math.min(start + pageSize, filteredTotalRows)
  const list = filtered.slice(start, end)

  return { list, totalRows: filteredTotalRows }
}



// 生成模拟数据行, rowIndex 是原始行号, seq 是 "筛选+排序"后的行号
function generateRow(rowIndex: number, seq: number) {
  const region = ['华南', '华东', '华北'][rowIndex % 3]
  const dept = ['市场部', '销售部', '生产部'][rowIndex % 3]
  const product = ['AI智能手机', 'AI学习平板', 'AI眼镜'][rowIndex % 3]
  const sales = rowIndex // 约定让它单调递增, 方便模拟 "全局排序后分页"
  const cost = (rowIndex * 16) % 5000 // 成本/利润页做成确定性
  const profit = sales - cost

  return {
    seq,
    id: rowIndex + 1,
    name: `员工${(rowIndex + 1).toLocaleString()}`,
    dept,
    region,
    product,
    sales,
    cost,
    profit
  }
}

// 总结行模拟
export function mockFechSummaryData(): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        name: '合计',
        sales: '¥85亿',
        cost: '¥52亿',
        profit: '¥33亿',
      })
    }, 300)
  })
}

// test
// mockFechPageData(2, 3, 10).then((res) => console.log(res))
