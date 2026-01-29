import type { TableStore } from "@/table/state/createTableStore";
import type { IPanel, IPanelConfig } from "@/table/panel/IPanel";


/**
 * 面板注册表: 管理所有可用的面板类型
 * 
 * 职责: 
 * 1. 注册面板配置 (不创建实例)
 * 2. 根据 id 创建面板实例
 * 3. 验证面板配置的合法性
 * 
 * 设计模式: 工厂模式 + 注册表模式
 */
export class PanelRegistry {
  // 存储所有已注册的面板配置
  private configs = new Map<string, IPanelConfig>()

  // 注册面板, 不创建实例哦
  public register(config: IPanelConfig): void {
    // 验证 id 唯一性
    if (this.configs.has(config.id)) {
      throw new Error(`[PanelRegistry] 面板 id "${config.id}" 已存在, 勿重复注册`)
    }
    // 验证必填字段
    if (!config.id || !config.title || !config.component) {
      throw new Error(`[PanelRegistry] 面板配置缺少必填字段: id, title, conponent`)
    }
    this.configs.set(config.id, config)
  }

  // 批量注册多个面板
  public registerAll(configs: IPanelConfig[]): void {
    configs.forEach(config => this.register(config))
  }

  // 注销一个面板, 根据面板 id 
  public unregister(id: string): boolean {
    const deleted = this.configs.delete(id)
    if (deleted) {
    }
    return deleted
  }

  // 创建面板实例: 要传入 id, store, 并支持额外的参数
  public createPanel(id: string, store: TableStore, ...args: any[]): IPanel {
    // 没注册就不能创建哦
    const config = this.configs.get(id)
    if (!config) {
      throw new Error(`[PanelRegistry] 面板 "${id}" 尚未注册哦!`)
    }
    // 直接调用 component , 不使用 new 
    return config.component(store, ...args)
  }

  // 获取面板配置, 根据 id
  public getConfig(id: string): IPanelConfig | undefined {
    return this.configs.get(id)
  }

  // 获取所有已注册面板 id 
  public getAvailableIds(): string[] {
    return Array.from(this.configs.keys())
  }

  // 获取所有已注册面板配置 
  public getAllConfigs(): IPanelConfig[] {
    return Array.from(this.configs.values())
  }

  // 检查面板是否已注册, 根据 id 
  public has(id: string): boolean {
    return this.configs.has(id)
  }

  // 清空所有注册的面板
  public clear(): void {
    this.configs.clear()
  }
  
}