import { ColumnMenuView, IColumnMenuConfig } from "@/table/interaction/ColumnMenuView";

export class ColumnMenuBinder {
  private menuView = new ColumnMenuView()
  private onClickOutSide: ((e: MouseEvent) => void) | null = null 

  public bind(params: {
    scrollContainer: HTMLDivElement,
    headerRow: HTMLDivElement,
    getCurrentSort: () => { key: string, direction: 'asc' | 'desc' } | null,
    onSort: (key: string, direction: 'asc' | 'desc' | null) => void 

  }) {
    const { scrollContainer, headerRow, getCurrentSort, onSort } = params
    // 事件委托, 点击 "三点" 按钮
    headerRow.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLDivElement
      const btn = target.closest<HTMLDivElement>('.col-menu-btn')

      if(!btn) return 
      e.stopPropagation()
      const key = btn.dataset.columnKey 
      
      if (!key) return 
      if (btn.classList.contains('active')) {
        this.closeMenu()
        return 
      }
      // 关闭旧菜单
      this.closeMenu()
      btn.classList.add('.active')  // 标记按钮为激活状态
      // 获取列配置 (从 headerRow 的 cell 中推导)
      const cell = btn.closest('.header-cell') as HTMLDivElement
      const columnKey = cell?.dataset.columnKey

      if(!columnKey) return 
      // 简化配置, 后续从 config.columns 中获取
      const column = {
        key: columnKey,
        title: cell.querySelector('.header-text')?.textContent || '',
        width: 100,
        sortable: cell.dataset.sortable === 'true'
      }
      const currentSort = getCurrentSort()
      // 渲染菜单
      const menuConfig: IColumnMenuConfig = {
        column,
        currentSort,
        onSort: (direction) => {
          onSort(columnKey, direction)
          btn.classList.remove('active')
        }
      }
      this.menuView.render(menuConfig, btn, scrollContainer)
      // 点击外部关闭菜单
      this.onClickOutSide = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('.col-menu-popup') && !target.closest('.col-menu-btn')) {
          this.closeMenu()
        }
      }
      setTimeout(() => {
        document.addEventListener('click', this.onClickOutSide!)
      }, 0)
    })
  }

  // 关闭菜单
  private closeMenu() {
    this.menuView.destroy()
    document.querySelectorAll('.col-menu-btn.active').forEach(btn => {
      btn.classList.remove('active')
    })

    if (this.onClickOutSide) {
      document.removeEventListener('click', this.onClickOutSide)
      this.onClickOutSide = null 
    }
  }

  // 解绑
  public unbind() {
    this.closeMenu()
  }
}