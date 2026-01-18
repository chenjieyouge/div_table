import type { IPanel, IPanelConfig } from "@/table/panel/IPanel";
import type { TableStore } from "@/table/state/createTableStore";
import { PanelRegistry } from "@/table/panel/PanelRegistry";

/**
 * 右侧面板管理器: 管理右侧面板的显示, 切换和销毁
 * 
 * 职责: 
 * 1. 管理面板实例的生命周期 (创建, 显示, 隐藏, 销毁)
 * 2. 处理面板的切换逻辑
 * 3. 渲染面板容器和切换 Tab
 * 
 * 设计模式: 单例模式 (每个表格一个实例)
 */
export class SidePanelManager {
  private registry: PanelRegistry // 面板注册表
  private panels = new Map<string, IPanel>()  // 已创建的面板实例缓存
  private activePanel: string | null = null // 当前集合的面板 id

  private container: HTMLDivElement // 面板容器
  private tabsContainer!: HTMLDivElement // Tab 切换容器
  private contentContainer!: HTMLDivElement // 面板内容容器

  constructor(
    private store: TableStore, 
    private configs: IPanelConfig[] // 要启用的面板配置
  ) {
    this.registry = new PanelRegistry()
    // 注册所有面板
    this.registry.registerAll(configs)
    // 渲染容器
    this.container = this.render()
  }

  // 渲染面板管理器的 dom 结构
  private render(): HTMLDivElement {
    const container = document.createElement('div')
    container.className = 'side-panel-manager'
    // 渲染 Tab 切换栏
    this.tabsContainer = this.renderTabs()
    container.appendChild(this.tabsContainer)
    // 渲染面板内容容器
    this.contentContainer = document.createElement('div')
    this.contentContainer.className = 'side-panel-content'
    container.appendChild(this.contentContainer)
    return container
  }

  // 渲染 Tab 切换栏
  public renderTabs(): HTMLDivElement {
    const tabs = document.createElement('div')
    tabs.className = 'side-panel-tabs'
    // 为每个面板创建一个 tab
    this.configs.forEach(config => {
      const tab = document.createElement('div')
      tab.className = 'side-panel-tab'
      tab.dataset.panelId = config.id
      // Tab 内容: 图标 + 标题
      if (config.icon) {
        const icon = document.createElement('span')
        icon.className = 'tab-icon'
        icon.textContent = config.icon
        tab.appendChild(icon)
      }
      // 标题 
      const title = document.createElement('span')
      title.className = 'tab-title'
      title.textContent = config.title 
      tab.appendChild(title)
      // 点击 Tab 切换面板
      tab.onclick = () => this.showPanel(config.id)
      tabs.appendChild(tab)
    })
    return tabs 
  }

  // 显示指定面板
  public showPanel(id: string): void {
    // 未注册, 就是当前面板, 则不用处理
    if (!this.registry.has(id)) return 
    if  (this.activePanel === id) return 
    // 1. 隐藏当前活跃面板
    if (this.activePanel) {
      const currentPanel = this.panels.get(this.activePanel)
      currentPanel?.onHide?.()
    }
    // 2. 获取或创建目标面板实例
    let panel = this.panels.get(id)
    if (!panel) {
      // 懒加载, 首次闲时候才创建实例
      panel = this.registry.createPanel(id, this.store)
      this.panels.set(id, panel)
      console.log(`[SidePanelManager] 创建面板实例: ${id}`)
    }
    // 3. 显示目标面板实例
    this.contentContainer.innerHTML = ''
    this.contentContainer.appendChild(panel.getContainer())
    panel.onShow?.()
    // 4. 更新激活状态
    this.activePanel = id 
    this.updateTabsActiveState(id)
    console.log(`[SidePanelManager] 切换到面板: ${id}`)
  }

  // 更新 Tab 激活状态
  public updateTabsActiveState(activeId: string): void {
    const tabs = this.tabsContainer.querySelectorAll<HTMLDivElement>('.side-panel-tab')
    tabs.forEach(tab => {
      const tabId = tab.dataset.panelId 
      if (tabId === activeId) {
        tab.classList.add('active')
      } else {
        tab.classList.remove('active')
      }
    })
  }

  // 隐藏当前面板
  public hideCurrentPanel(): void {
    if (this.activePanel) {
      const panel = this.panels.get(this.activePanel)
      panel?.onHide?.()
      this.contentContainer.innerHTML = ''
      this.activePanel = null 
      this.updateTabsActiveState('')
    }
  }

  // 获取面板管理的 dom 容器
  public getContainer(): HTMLDivElement {
    return this.container
  }

  // 获取当前激活面板 id 
  public getActivePanel(): string | null {
    return this.activePanel
  }

  // 销毁面板管理器, 释放所有资源
  public destroy(): void {
    // 销毁所有面板实例
    this.panels.forEach((panel, id) => {
      console.log(`[SidePanelManager] 销毁面板: ${id}`)
      panel.destroy()
    })

    this.panels.clear()
    this.registry.clear()
    this.container.remove()
    this.activePanel = null 
    console.log('[SidePanelManager] 面板管理器已销毁')
  }
}