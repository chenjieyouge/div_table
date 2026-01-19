import { TableConfig } from '@/config/TableConfig'
import { DataManager } from '@/data/DataManager'
import { DOMRenderer } from '@/dom/DOMRenderer'
import { VirtualScroller } from '@/scroll/VirtualScroller'
import type { ColumnFilterValue, IConfig, ITableQuery, IUserConfig } from '@/types'
import { HeaderSortBinder } from '@/table/interaction/HeaderSortBinder'
import { bootstrapTable } from '@/table/data/bootstrapTable'
import { VirtualViewport } from '@/table/viewport/VirtualViewport'
import type { ITableShell } from '@/table/TableShell'
import { mountTableShell } from '@/table/TableShell'
import type { TableStore } from '@/table/state/createTableStore'
import type { TableAction, TableState } from '@/table/state/types'
import type { IColumn } from '@/types'
import { createTableStore } from '@/table/state/createTableStore'
import { assertUniqueColumnKeys, resolveColumns } from '@/table/model/ColumnModel'
import { ColumnWidthStorage } from '@/utils/ColumnWidthStorage'
import { ColumnManager } from '@/table/core/ColumnManager'
import { PerformanceMonitor } from '@/utils/PerformanceMonitor'
import { actionHandlers, handleDataChange } from '@/table/handlers/ActionHandlers'
import type { ActionContext } from '@/table/handlers/ActionHandlers'
// 重构布局 + 右侧菜单栏
import { LayoutManager } from '@/table/layout/LayoutManager'
import { SidePanelManager } from '@/table/panel/SidePanelManager'
import type { IPanelConfig } from '@/table/panel/IPanel'
// 回调函数抽离
import { ShellCallbacks } from '@/table/handlers/ShellCallbacks'



// 主协调者, 表格缝合怪;  只做调度, 不包含业务逻辑
export class VirtualTable {
  private config: IConfig // 内部用完整配置
  private shell!: ITableShell
  private mode: 'client' | 'server' = 'server' 
  private headerSortBinder = new HeaderSortBinder()
  private serverQuery: ITableQuery = { filterText: '' } 
  private viewport!: VirtualViewport

  private dataManager: DataManager
  private renderer: DOMRenderer
  private scroller: VirtualScroller

  private store!: TableStore 
  private originalColumns!: IColumn[]
  private unsubscribleStore: (() => void) | null = null 
  private widthStorage: ColumnWidthStorage | null = null  // 列宽存储

  private columnManager!: ColumnManager // 列统一管理器, 这个很强大

  // 布局管理器 + 右侧面板管理器
  private layoutManager: LayoutManager | null = null 
  private sidePanelManager: SidePanelManager | null = null 

  // ready 用于外部等待初始化完后 (store/shell/viewport 都 ok 后, 再 dispatch)
  public readonly ready: Promise<void> 
  private resolveReady: (() => void) | null = null 
  private pendingActions: TableAction[] = []
  private isReady = false

  constructor(userConfig: IUserConfig) {
    // 初始化配置 (此时的 totalRows 是默认值, 后续会被覆盖)
    const tableConfig = new TableConfig(userConfig)
    this.config = tableConfig.getAll()

    // 初始化列宽存储, 使用最终的 tableId, 自动生成
    const finalTableId = this.config.tableId
    if (finalTableId) {
      this.widthStorage = new ColumnWidthStorage(finalTableId)
      this.restoreColumnWidths() // 恢复保存的列宽
    }

    this.dataManager = new DataManager(this.config)
    this.renderer = new DOMRenderer(this.config)
    this.scroller = new VirtualScroller(this.config)

    // 创建 ready Promise, initializeAsync 完成后 resolve 
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve
    })

    // 启动异步初始化流程
    this.initializeAsync()

    // 开发模式下, 开启性能监控
    if (process.env.NODE_ENV === 'development') {
      PerformanceMonitor.enable()
    }
  }

  // 对外暴露当前表格 state 状态, 后续做 vue 封装会很需要
  public getState() {
    return this.store.getState()
  }

  // 方便 demo 使用 (减少导出 await)
  public onReady(cb: () => void) {
    this.ready.then(cb).catch(console.warn)
  }

  // 对外暴露 dispatch, 后续拽列, 原生 UI 都走它
  public dispatch(action: TableAction) {
    // 未初始完成时, 不直接 dispatch, 先排队, 避免 store 为 undefined
    if (!this.isReady || !this.store) {
      this.pendingActions.push(action)
      return 
    }
    return this.store.dispatch(action)
  }

  // 异步初始化
  private async initializeAsync() {
    // ======= server 模式 渲染流程 ===========
    // 0. server 模式渲染准备前期工作

    // server 模式下, 不要 await 首次请求, 否则 mount 被阻塞, 会白屏无数据
    const isServerBootstrap = !this.config.initialData && typeof this.config.fetchPageData === 'function'
    try {
      if (isServerBootstrap) {
        // 先按 server 模式将 "骨架表格" 挂出来
        this.mode = 'server'
        // totalRows 先用默认值, 等有数真实数据再替换回来
        assertUniqueColumnKeys(this.config.columns) // 列 key 唯一校验
        this.originalColumns = [...this.config.columns]

        // 1. 创建 store
        this.store = createTableStore({
          columns: this.originalColumns,
          mode: this.mode,
          frozenCount: this.config.frozenColumns
        })
        // 2. 同步列顺序 到 state
        this.syncColumnOrderToState()
        // 3. 订阅 state 变化
        this.unsubscribleStore?.()
        this.unsubscribleStore = this.store.subscribe((next, prev, action) => {
          this.handleStateChange(next, prev, action) 
        })
        // 4. 应用列配置
        this.applyColumnsFromState()
        // 5. 挂载 DOM (会创建 ColumnManager)
        this.mount() // 这里 ColumnManager 才初始化, 可能导致更新列有问题
        // 6. 设置排序指示器
        this.shell.setSortIndicator(this.store.getState().data.sort)
        this.config.onModeChange?.(this.mode)

        // 7. ready 可以在 mount 后就 resolve, 此时 dispatch 安全, 数据可能还还在加载
        this.isReady = true 
        const pending = this.pendingActions
        this.pendingActions = []
        pending.forEach(action => this.store.dispatch(action))
        this.resolveReady?.()
        this.resolveReady = null 

        // 8. 后台开始拉取第 0 页, 让 totalRows 更新真实值, 并刷新 scroller/viewport
        void this.dataManager.getPageData(0).then(() => {
          const realTotal = this.dataManager.getServerTotalRows()
          if (typeof realTotal === 'number' && realTotal >= 0 && realTotal !== this.config.totalRows) {
            // totalRows 更新必须重建 scroller, 否则高度不对
            this.config.totalRows = realTotal
            this.scroller = new VirtualScroller(this.config)
            this.viewport.setScroller(this.scroller)
            this.shell.setScrollHeight(this.scroller)
            // 刷新可视区, 骨架屏会重新计算范围, 然后从 cache 拿到 page0 填充
            this.viewport.refresh()
          }
        }).catch(console.warn)
        return 
      }

    // ======= client 模式或者 用户传入了 initialData 的情况 ===========

    // 0. client 模式下, 渲染前准备工作处理
    const { mode, totalRows } = await bootstrapTable(this.config,this.dataManager)
    this.mode = mode 
    this.config.totalRows = totalRows
    assertUniqueColumnKeys(this.config.columns) // 列 key 唯一值校验, 避免排序拖拽等混乱
    this.originalColumns = [...this.config.columns] // 保留用户原始列配置

    // 1. 创建 store (里程碑A: 先非受控模式)
    this.store = createTableStore({
      columns: this.originalColumns,
      mode: this.mode,
      frozenCount: this.config.frozenColumns
    })

    // 2. 订阅 state 变化 -> 驱动副作用 (排序/筛选/列变化重建等)
    this.unsubscribleStore?.()
    this.unsubscribleStore = this.store.subscribe((next, prev, action) => {
      this.handleStateChange(next, prev, action)
    })

    // 3. 应用列配置: 在 mount 前, 将 state 解析出来的列, 应用回 config
    this.applyColumnsFromState()
    // 4. 挂载 DOM, 会绑定表头点击事件, 滚动事件等, 右侧边栏等
    this.mount()
    // 5. 设置排序指示器
    this.shell.setSortIndicator(this.store.getState().data.sort)
    this.config.onModeChange?.(this.mode)

    // 标记 ready, 并 flush 初始化前积攒的 action 
    this.isReady = true 
    const pending = this.pendingActions
    this.pendingActions = []
    pending.forEach(action => this.store.dispatch(action))
    this.resolveReady?.()
    this.resolveReady = null 

  } catch (err) {
    console.warn('[VirtualTable.initializeAsync] faild: ', err)
    throw err 
  }
}

  // 挂载 shell + viewport (由 initializeAsync 内部调用)
  private mount(containerSelector?: string): void {
    // 0. 防止重复挂载
    if (this.shell) {
      console.warn('[VirtualTable] 检测到重复挂载, 销毁旧实例')
      // 清理旧的实例, 允许重新挂载
      this.remount(containerSelector!)
      // this.destroy()

    }
    // 1. 检查 store 是否已初始化
    if (!this.store) {
      console.error('[VirtualTable] store 未初始化, 无法挂载表格!')
      throw new Error('[VirtualTable] mount() 必须在 store 初始化后调用!')
    }

    // 2. 确认容器存在
    const selector = containerSelector || this.config.container
    const containerEl = typeof selector === 'string'
      ? document.querySelector<HTMLDivElement>(selector)
      : selector 
    
    if (!containerEl) {
      throw new Error(`[VirtualTable] 容器未找到: ${selector}`)
    }
    // 3. 清空容器, 避免内容重复
    containerEl.innerHTML = ''
    // 4. 添加唯一标识, 表格实例样式隔离
    containerEl.setAttribute('data-table-id', this.config.tableId)
    containerEl.classList.add('virtual-table-instance')
    // 5. 判断是否启用右侧面板, !! 强制转为 boolean
    const hasSidePanel = !!(
      this.config.sidePanel?.enabled &&
      this.config.sidePanel?.panels &&
      this.config.sidePanel.panels.length > 0 
    )
    // 6. 创建回调函数集合, 并提取公共的 mountTableShell 参数
    const shellCallbacks = new ShellCallbacks(
      this.config,
      this.store,
      this.mode,
      this.originalColumns,
      this.widthStorage,
      (key: string) => this.getClientFilterOptions(key),
      (summaryRow: HTMLDivElement) => this.loadSummaryData(summaryRow)
    )

    const commonShellParams = {
      config: this.config,
      renderer: this.renderer,
      headerSortBinder: this.headerSortBinder,
      ...shellCallbacks.getCallbacks() // 展开所有回调函数
    }

    // 7. 根据是否有右侧面板, 选择不同的布局方式
    if (hasSidePanel) {
      // 类型守卫 和用 ?? 来提供默认值
      const sp = this.config.sidePanel!
      // ======== 有右侧面板: 使用 LayoutManager 布局 =============
      this.layoutManager = new LayoutManager(this.config, {
        mode: 'desktop',
        sidePanel: {
          position: sp.position ?? 'right',
          width: sp.width ?? 250,
          collapsible: true,
          defaultOpen: sp.defaultOpen ?? true
        }
      })
      // 渲染布局容器
      const layoutContainer = this.layoutManager.render()
      containerEl.appendChild(layoutContainer)
      // 创建右侧面板管理器, sp.panels 就一定存在
      this.sidePanelManager = new SidePanelManager(
        this.store, // 此时 store 可能还没有有值哦!
        sp.panels
      )
      // 将面板管理器挂载到右侧区域
      const sideArea = this.layoutManager.getSideArea()
      if (sideArea) {
        sideArea.appendChild(this.sidePanelManager.getContainer())
      }
      // 关键: 挂载 table 到 mainArea, 并传入所有回调, 注意右侧面板先不要调用哦!
      const mainArea = this.layoutManager.getMainArea()!
      this.shell = mountTableShell({
        ...commonShellParams, // 展开所有公共参数
        container: mainArea // 指定容器为主区域
      })
      console.log('[VirtualTable] 已启用右侧面板布局')

    } else {
      // ========= 无右侧面板: 标准布局 ===========
      this.shell = mountTableShell({
        ...commonShellParams, // 展开所有公共参数
        container: containerEl
      })
    }

    // 8. 通用初始化逻辑, 两种模式都需要
    // 首次挂载后, 就立刻同步一次滚动高度
    this.shell.setScrollHeight(this.scroller)
    // 创建 viewport: 将 "可视区更新/骨架行/数据渲染" 的职责下放
    this.viewport = new VirtualViewport({
      config: this.config,
      dataManager: this.dataManager,
      renderer: this.renderer,
      scroller: this.scroller,
      scrollContainer: this.shell.scrollContainer,
      virtualContent: this.shell.virtualContent
    })

    // 初始化 ColumnManager 统一列管理
    this.columnManager = new ColumnManager(
      this.config,
      this.renderer,
      this.dataManager
    )

    // 滚动监听由 shell 统一绑定, 而 VirtualTable 只提供滚动后做什么
    this.shell.bindScroll(() => {
      this.viewport.updateVisibleRows()
    })
    // 首次渲染数据
    this.viewport.updateVisibleRows()
    // 首次挂载后, 立即刷新一次总结行数据
    if (this.config.showSummary) {
      this.refreshSummary().catch(console.warn)
    }

    // 9. 最后显示默认面板 (使用微任务延迟,(可选)确保所有初始化完成)
    if (hasSidePanel && this.sidePanelManager) {
      const sp = this.config.sidePanel!
      // 直接调用, 不需要 setTimeout
      if (sp.defaultPanel) {
        this.sidePanelManager?.showPanel(sp.defaultPanel)
      } else if (sp.panels.length > 0) {
        this.sidePanelManager?.showPanel(sp.panels[0].id)
      }
    }
  }

  // server 模式下: 加载总结行数据 (传参)
  private async loadSummaryData(summaryRow: HTMLDivElement) {
    if (!this.config.fetchSummaryData) return 
    try {
      const summaryData = await this.config.fetchSummaryData(this.serverQuery)
      this.renderer.updateSummaryRow(summaryRow, summaryData)
    } catch (err) {
      console.error('加载总结行失败: ', err)
    }
  }

  // client / server 刷新总结行数据
  public async refreshSummary() {
    if (!this.config.showSummary) return 
    const row = this.shell?.summaryRow
    if (!row) return 
    // client 模式: 动态计算总结行
    if (this.mode === 'client') {
      const summaryData = this.dataManager.computeSummary(this.config.columns)
      this.renderer.updateSummaryRow(row, summaryData)
    } else {
      // server 模式: 调用接口拉取
      await this.loadSummaryData(row)
    }
    
  }

  // 对外暴露: 是否为客户端模式
  public get isClientMode(): boolean {
    return this.mode === 'client'
  }

  public sort(sortKey: string, direction: 'asc' | 'desc') {
    this.store.dispatch({ type: 'SORT_SET', payload: { sort: { key: sortKey, direction }}})
  }


  public filter(filterText: string) {
    this.store.dispatch(
      {
        type: 'SET_FILTER_TEXT',
        payload: { text: filterText }
      }
    )
  }

  // 将 state 应用到 config (列顺序, 列宽, 冻结列数等)
  private applyColumnsFromState() {
    const state = this.store.getState()
    const resolved = resolveColumns({ originalColumns: this.originalColumns, state})
    // 让后续 DOMRenderer/Viewport 都使用新列定义
    this.config.columns = resolved 
    // 冻结列仍沿用我现有实现的: 前 N 列冻结
    this.config.frozenColumns = state.columns.frozenCount
  }

  // 列操作的统一更新逻辑
  private updateColumnUI() {
    // 防御性检查, server 模式下, 列管理可能还未初始化, 更新个毛线!
    if (!this.columnManager) {
      console.warn('[VirtualTable] columnManger 未初始化, 跳过列更新!')
      return 
    }
    // 性能监控
    PerformanceMonitor.measure('列更新', () => {
      this.applyColumnsFromState()
      // 用 ColumnManager 统一更新, 并使用 shell 的缓存 DOM 引用, 减少重复查询
      this.columnManager.updateColumns(this.config.columns, {
        headerRow: this.shell.headerRow, 
        summaryRow: this.shell.summaryRow,
        dataRows: this.viewport.getVisibleRows()
      })
      // 更新列宽, 同时会设置 css 变量
      this.shell.updateColumnWidths(this.config.columns, this.viewport.getVisibleRows())
    })
  }

  // state 变化后的统一入口 (里程碑A的 "表格骨架核心"), 作为触发动作执行的最后一步
  private handleStateChange(next: TableState, prev: TableState, action: TableAction) {
    // 使用策略模式, 路由到 ActionHandler 处理器
    const handler = actionHandlers.get(action.type)

    if (handler) {
      const context: ActionContext = { table: this }
      handler(action, context) // 动作名称, 响应视图逻辑
    } else {
      // 默认处理: 排序, 筛选等数据变化
      handleDataChange(action, { table: this })
    }
  }


  // client 模式下, 将 state 应用到 DataManager + Scroller + Viewport
  private async applyClientState(state: TableState) {
    
    const filterText: string = state.data.clientFilterText ?? ''
    const sort = state.data.sort 
    const columnFilters = state.data.columnFilters ?? {}

    // 先恢复 原始顺序 + 应用筛选, 保证可回到自然顺序
    this.dataManager.resetClientOrder({ filterText, columnFilters }) // 恢复为原始顺序,考虑了筛选动作
    // 若有排序, 则再处理
    if (sort) {
      this.dataManager.sortData(sort.key, sort.direction)
    }

    // 监控 totalRow 变化时, 需要重建 scroller 
    this.config.totalRows = this.dataManager.getFullDataLength()
    this.scroller = new VirtualScroller(this.config)
    this.viewport.setScroller(this.scroller)
    // 同步滚动高度 + 刷新可视区
    this.shell.setScrollHeight(this.scroller)
    this.viewport.refresh()
    await this.refreshSummary() // 总结行也可能刷新
  }


  // client 模式下, 推导列可选值 (topN 或全量去重, 避免百万枚举卡死)
  private getClientFilterOptions(key: string): string[] {
    const fullData= (this.dataManager as any).originalFullData as Record<string, any>[] | null 
    if (!fullData) return []

    const valSet = new Set<string>()
    const limit = 1000 // 最多取前 1000 个不同值, 避免卡顿
    for (const row of fullData) {
      if (valSet.size >= limit) break 
      const val = String(row[key] ?? '')
      if (val) valSet.add(val)
    }
    return Array.from(valSet).sort() // Array.from 和 [...] 谁性能高?
  }

  // 暴力重建 (列变化时用), 最稳但性能不行, 后续里程碑在优化为局部更新
  private rebuild() {
    // 先销毁旧 DOM 和 旧 viewport
    this.shell?.destroy()
    this.viewport?.destroy()
    // 重写挂载前, 现将最新列状态, 写回 config (顺序/宽度/冻结列等)
    this.applyColumnsFromState()
    // 重新挂载
    this.mount()
    // 重建后, 将 UI 与数据状态重新对齐
    const state = this.store.getState()
    this.shell.setSortIndicator(state.data.sort)

    if (state.data.mode === 'client') {
      void this.applyClientState(state)
    } else {
      void this.applyServerQuery(state.data.query).then(() => {
        void this.refreshSummary()
      })
    }
  }

  // server 模式下的筛选 
  // 更新 query -> 清缓存 -> 拉取第一页 -> 更新 totalRows \
  // -> 重建 VirtualScroller -> 通知 viewport.setScroller 和 refresh table
  private async applyServerQuery(next: ITableQuery) {
    this.serverQuery = {
      sortKey: next.sortKey,
      sortDirection: next.sortDirection,
      filterText: next.filterText ?? "",
      columnFilters: next.columnFilters ?? {}  // server 模式也必须带上列筛选
    }
    // 更新 DataManager 的 query, 缓存也会自动清除
    this.dataManager.setQuery(this.serverQuery)
    // 筛选排序后回到顶部, 避免当前滚动位置超出 新 totalRows
    this.shell.scrollContainer.scrollTop = 0
    // 主动来取第 0 页, 让 totalRows 先有值并缓存 page0
    await this.dataManager.getPageData(0)
    const totalRows = this.dataManager.getServerTotalRows()
    if (typeof totalRows === 'number') {
      this.config.totalRows = totalRows
    }
    // totalRows 变化后必须重建 scroller, 否则滚动高度不准
    this.scroller = new VirtualScroller(this.config)
    this.viewport.setScroller(this.scroller)
    // 一定要记得重设滚动容器的高
    this.shell.setScrollHeight(this.scroller)
    // 最后再刷新可视区
    this.viewport.refresh()
  }

  // 从 localStorage 恢复列宽, 表格宽, 列顺序
  private restoreColumnWidths() {
    if (!this.widthStorage) return
    // 恢复列宽
    const savedColumnWidths = this.widthStorage.loadColumnWidth()
    if (savedColumnWidths) {
      this.config.columns.forEach(col => {
        if (savedColumnWidths[col.key]) {
          col.width = savedColumnWidths[col.key]
        }
      })
    }
    // 恢复整表宽度
    const savedTableWidth = this.widthStorage.loadTableWidth()
    if (savedTableWidth) {
      this.config.tableWidth = savedTableWidth
    }

    // 恢复列顺序 (在列宽恢复之后, 避免影响)
    const savedColumnOrder = this.widthStorage.loadColumnOrder()
    if (savedColumnOrder && savedColumnOrder.length > 0) {
      this.restoreColumnOrder(savedColumnOrder)
    }
  }

  // 恢复列顺序
  public restoreColumnOrder(savedOrder: string[]) {
    try {
      // 创建列映射, 方便查找
      const columnMap = new Map(this.config.columns.map(col => [col.key, col]))
      // 按保存的顺序查询排列列
      const newColumns: IColumn[] = []
      const processedKeys = new Set<string>
      // 添加保存顺序中的列
      for (const key of savedOrder) {
        const col = columnMap.get(key)
        if (col) {
          newColumns.push(col)
          processedKeys.add(key)
        }
      }
      // 添加没有在保存顺序中的列 (新增列)
      for (const col of this.config.columns) {
        if (!processedKeys.has(col.key)) {
          newColumns.push(col)
        }
      }
      // 恢复时, 只恢复列配置, 不同步 state
      // 初始化后, syncColumnOrderToState 统一同步到 state
      // 变化时: 保存 loclaStorage
      this.config.columns = newColumns
      this.originalColumns = [...newColumns]  // 同步更新原始列配置

    } catch (err) {
      console.warn('恢复列顺序失败: ', err)
    }
  }

  private syncColumnOrderToState() {
    if (!this.store) return 
    
    if (this.config.columns.length > 0) {
      const columnKeys = this.config.columns.map(col => col.key)
      this.store.dispatch({
        type: 'COLUMN_ORDER_SET',
        payload: { order: columnKeys }
      })
    }
  }

  // 切换右侧面板显示/隐藏
  public toggleSidePanel(show?: boolean): void {
    this.layoutManager?.toggleSidePanel(show)
  }

  // 切换到指定的面板
  public showPanel(panelId: string): void {
    this.sidePanelManager?.showPanel(panelId)
  }

  // 获取当前激活面板的 id 
  public getActivePanel(): string | null {
    return this.sidePanelManager?.getActivePanel() ?? null 
  }

  // 重新挂载到容器, 和 清空的区别在于, 保留了 store 订阅
  public remount(containerSelector: string): void {
    // dom 都清除, 但 store 订阅保留
    this.shell?.destroy()
    this.viewport?.destroy()
    // 清空布局管理器
    this.layoutManager?.destroy()
    this.layoutManager = null 
    // 清理面板管理器
    this.sidePanelManager?.destroy()
    this.sidePanelManager = null 
    // 重置标记, 先用 any 大法顶上, 后续出问题再说
    this.shell = null as any 
    this.viewport = null as any 
    // 重新挂载
    this.mount(containerSelector)
  }

  // 全部清空, dom + 状态 + 一切, 避免内存泄露
  public destroy() {
    this.unsubscribleStore?.()
    this.unsubscribleStore = null // 解绑 store 订阅
    this.shell?.destroy()
    this.viewport?.destroy()
    // 清空布局管理器
    this.layoutManager?.destroy()
    this.layoutManager = null 
    // 清理面板管理器
    this.sidePanelManager?.destroy()
    this.sidePanelManager = null 
  }


}
