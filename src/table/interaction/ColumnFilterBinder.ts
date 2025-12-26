export class ColumnFilterBinder {
  private popEl: HTMLDivElement | null = null 
  private onClickOutside: ((e: MouseEvent) => void) | null = null 

  public bind(params: {
    scrollContainer: HTMLDivElement,
    headerRow: HTMLDivElement,
    onFilterChange: (key: string, values: string[]) => void 
    getFilterOptions: (key: string) => Promise<string[]>,
    getCurrentFilter: (key: string) => string[],
  }) {
    // 解构出从 tableShell 传入进来的参数
    const {
      scrollContainer,
      headerRow,
      onFilterChange,
      getFilterOptions,
      getCurrentFilter,
    } = params

    headerRow.addEventListener('click', async (e: MouseEvent) => {
      const target = e.target as HTMLDivElement
      const btn = target?.closest<HTMLDivElement>('.col-filter-btn')
      if (!btn) return 
      e.stopPropagation()

      const key = btn.dataset.columnKey 
      if (!key) return 
      // 关闭旧弹层
      this.closePopup()

      // 获取可选值 (client 从 DataManager 推导; server 从接口中拉取)
      const options = await getFilterOptions(key)
      const current = getCurrentFilter(key)
      // 创建弹层
      this.popEl = document.createElement('div')
      this.popEl.className = 'col-filter-popup'
      const rect = btn.getBoundingClientRect()
      const containerRect = scrollContainer.getBoundingClientRect()

      this.popEl.style.left = `${rect.left - containerRect.left + scrollContainer.scrollLeft}px`
      this.popEl.style.top = `${rect.bottom - containerRect.top + scrollContainer.scrollTop}px`

      // 简单多选框 UI (原生 checkbox); TODO: 精美的筛选组件(单选, 多选, 时间范围等)
      const selected = new Set(current)
      const checkboxes: HTMLInputElement[] = []

      options.forEach(val => {
        const label = document.createElement('lable')
        label.className = 'filter-option'
        // 原生多选下拉框
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.value = val 
        checkbox.checked = selected.has(val)
        // 下拉列表搞起来
        checkboxes.push(checkbox)
        label.appendChild(checkbox)
        label.appendChild(document.createTextNode(val))
        this.popEl!.appendChild(label)
      })

      // 确认按钮
      const btnOk = document.createElement('button')
      btnOk.className = 'filter-btn-ok'
      btnOk.textContent = '确定'
      btnOk.onclick = () => {
        const values = checkboxes.filter(c => c.checked).map(c => c.value)
        onFilterChange(key, values)
        this.closePopup()
      }

      // 清空按钮
      const btnClear = document.createElement('div')
      btnClear.className = 'filter-btn-clear'
      btnClear.textContent = '清空'
      btnClear.onclick = () => {
        onFilterChange(key, [])
        this.closePopup
      }

      const footer = document.createElement('div')
      footer.className = 'filter-popup-footer'
      footer.appendChild(btnOk)
      footer.appendChild(btnClear)
      this.popEl!.appendChild(footer)
      scrollContainer.appendChild(this.popEl)
      // 点击外部关闭
      this.onClickOutside = (ce: MouseEvent) => {
        if (!this.popEl?.contains(ce.target as Node)) {
          this.closePopup()
        }
      }

      setTimeout(() => {
        window.addEventListener('click', this.onClickOutside!, true)
      }, 0)
    })
  }

  public closePopup() {
    if (this.popEl) {
      this.popEl.remove()
      this.popEl = null 
    }
    if (this.onClickOutside) {
      window.removeEventListener('click', this.onClickOutside, true)
      this.onClickOutside = null
    }
  }

  public unbind() {
    this.closePopup()
  }
}