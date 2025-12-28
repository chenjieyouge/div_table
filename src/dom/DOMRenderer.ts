import type { IConfig, IColumn } from '@/types'

// 纯 dom 创建与更新: 无状态, 只负责如何画, 不关心数据

export class DOMRenderer {
  private config: IConfig

  constructor(config: IConfig) {
    this.config = config
  }

  // 表头行 (一维)
  createHeaderRow(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'table-row sticky-header'
    this.renderCells(row, this.config.columns, 'header')
    return row
  }

  // 总结行 (一维)
  createSummaryRow(summaryData?: Record<string, any>): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'table-row sticky-summary'
    this.renderCells(row, this.config.columns, 'summary', summaryData)
    return row
  }

  // 更新总结行数据
  updateSummaryRow(rowElement: HTMLDivElement, data: Record<string, any>) {
    const cells = rowElement.querySelectorAll('.table-cell')
    cells.forEach((cell, idx) => {
      const col = this.config.columns[idx]
      cell.textContent = data[col.key] ?? (idx === 0 ? '合计' : '')
    })
  }

  // 骨架屏行
  createSkeletonRow(rowIndex: number): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'table-row virtual-row skeleton'
    row.dataset.rowIndex = rowIndex.toString() // 给每行一个行id, 是后续滚动计算的关键

    this.renderCells(row, this.config.columns, 'skeleton')
    return row
  }

  // 更新数据行, 给 cells 在骨架屏之后, 请求到数据, 则填充上
  updateDataRow(rowElement: HTMLDivElement, data: Record<string, any>) {
    const cells = rowElement.querySelectorAll('.table-cell')
    cells.forEach((cell, idx) => {
      cell.classList.remove('skeleton')
      const col = this.config.columns[idx]
      cell.textContent = data[col.key] ?? ''
    })
  }

  // 单元格渲染 (通用)
  private renderCells(
    row: HTMLDivElement,
    columns: IColumn[],
    type: 'header' | 'summary' | 'skeleton',
    data?: Record<string, any>
  ): void {
    // 解析列配置, 创建单元格, 设置样式, 填充数据等
    let leftOffset = 0
    columns.forEach((col, index) => {
      const cell = document.createElement('div')
      cell.className = 'table-cell'
      cell.style.width = `${col.width}px`

      // 处理冻结列
      if (index < this.config.frozenColumns) {
        cell.classList.add('cell-frozen')
        cell.style.left = `${leftOffset}px`
      }

      // TODO: 拓展更多字段配置

      // 填充单元格数据
      if (type === 'header') {
        cell.classList.add('header-cell')
        cell.textContent = col.title
        // 所有表头都要有 columnKey (列拖拽/列宽都要依赖它)
        cell.dataset.columnKey = col.key
        // 只有 sortable 列才标记排序, HeaderSortBinder 也只认这个
        if (col.sortable) {
          cell.dataset.sortable = 'true'
        }
        // 列宽拖拽手柄 (不引入第三方, 纯原生 dom)
        const handle = document.createElement('div')
        handle.className = 'col-resize-handle'
        handle.dataset.columnKey = col.key
        cell.appendChild(handle)

        // 列值筛选按钮 (配置了 filter 且 enabled 才能筛选 )
        if (col.filter?.enabled) {
          const filterBtn = document.createElement('div')
          filterBtn.className = 'col-filter-btn'
          filterBtn.dataset.columnKey = col.key
          // 将类型塞到 dataset, binder 可以直接读取
          filterBtn.dataset.filterType = col.filter.type
          filterBtn.textContent = '🔽'
          cell.appendChild(filterBtn)
        }
      } else if (type === 'summary') {
        cell.textContent = data?.[col.key] ?? (index === 0 ? '合计' : '')
      } else {
        // 先骨架屏, 等有数据再替换
        cell.classList.add('skeleton')
        cell.textContent = ''
      }

      // 每一列都会计算上 leftOffset, 但只有冻结列才添加上样式
      leftOffset += col.width
      row.appendChild(cell)
    })
  }

  // 更多渲染功能, 如按钮, 图标, 颜色等
}
