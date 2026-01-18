import { describe, it, expect, beforeEach } from 'vitest'
import { PanelRegistry } from '@/table/panel/PanelRegistry'
import { DemoPanel } from '@/table/panel/panels/DemoPanel'
import type { IPanelConfig } from '@/table/panel/IPanel'


describe('PanelRegistry', () => {
  let registry: PanelRegistry

  const demoConfig: IPanelConfig = {
    id: 'demo',
    title: '示例面板',
    icon: '🎯',
    component: DemoPanel
  }

  beforeEach(() => {
    registry = new PanelRegistry()
  })

  // 单项测试, 输入, 输出,验证
  it('能注册面板', () => {
    registry.register(demoConfig)
    expect(registry.has('demo')).toBe(true)
  })

  it('能获取面板配置', () => {
    registry.register(demoConfig)
    const config = registry.getConfig('demo')
    expect(config).toEqual(demoConfig)
  })

  it('能拒绝注册相同id的面板', () => {
    registry.register(demoConfig)
    expect(() => registry.register(demoConfig)).toThrow('已存在')
  })

  it('能注销某个面板', () => {
    registry.register(demoConfig)
    const result = registry.unregister('demo')
    expect(result).toBe(true)
    expect(registry.has('demo')).toBe(false)
  })

  it('能批量注册面板', () => {
    const configs: IPanelConfig[] = [
      demoConfig,
      { id: 'test', title: '测试', component: DemoPanel }
    ]
    registry.registerAll(configs)
    expect(registry.getAvailableIds()).toEqual(['demo', 'test'])
  })

  it('能获取所有已注册面板 id', () => {
    registry.register(demoConfig)
    const ids = registry.getAvailableIds()
    expect(ids).toEqual(['demo'])
  })

  it('能清空所有面板', () => {
    registry.register(demoConfig)
    registry.clear()
    expect(registry.getAvailableIds()).toEqual([])
  })

  it('创建未注册面板应报错', () => {
    expect(() => registry.createPanel('unknow', {} as any)).toThrow('未注册')
  })

  // ... 更多用例测试

})