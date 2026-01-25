/**
 * 渲染调度协议
 * 
 * 目的: 明确 refresh() 和 updateVisibleRows() 的使用边界, 防止误用导致表格数据闪烁
 * 
 * 核心规则: 
 * [规则 1]: refresh() 只能在 结构性 变化时调用
 *    eg: 列数量/顺序变化, 冻结列变化, totalRows 等导致 scroll 尺寸重算且需要清屏时
 * 
 * [规则 2]: 普通滚动 / 补数据, 只能 updateVisibleRows() + updateRowData()
 *          禁止 在 滚动回调中调用 refresh()
 * 
 * [规则 3]: server 下, 首页加载完成后, 不能直接走 applyServerQuery(), 只能先走 "填充" 路径
 *          applyServerQuery() 的职责: query 真变化时, 触发 (排序/筛选)
 *          禁止 SET_TOTAL_ROWS 这种 action 间接触发, 导致表格数闪动
 */

/**
 * 渲染调度场景枚举
 */
export enum RenderScenario {
  // 结构性变化: 列数量/列顺序/冻结列等
  STRUCTURAL_CHANGE = 'STRUCTURAL_CHANGE',

  // 数据查询变化: 排序/筛选条件变化
  QUERY_CHANGE = 'QUERY_CHANGE',

  // 普通滚动: 用户滚动时触发的可视区更新
  SCROLL_UPDATE = 'SCROLL_UPDATE',

  // 初始化填充: 首次加载数据
  INITIAL_FILL = 'INITIAL_FILL',

  // 数据加载: 异步数据加载新页数据
  DATA_PATCH = 'DATA_PATCH'

}

/**
 * 渲染方法枚举
 */
export enum RenderMethod {
  // 清屏重建: 清空所有 DOM 并重新渲染
  REFRESH = 'REFRESH',

  // 增量更新: 只更新可视区行
  UPDATE_VISIBLE = 'UPDATE_VISIBLE',

  // 数据更新: 只更新行数据内容
  UPDATE_DATA = 'UPDATE_DATA'
}

/**
 * 渲染协议规则映射表
 * 
 * 定义每种场景应该使用哪种渲染方法
 */
export const RENDER_PROTOCOL: Record<RenderScenario, RenderMethod> = {
  // 结构性变化必须 refresh
  [RenderScenario.STRUCTURAL_CHANGE]: RenderMethod.REFRESH,
  [RenderScenario.QUERY_CHANGE]: RenderMethod.REFRESH,

  // 增量更新-可视区
  [RenderScenario.SCROLL_UPDATE]: RenderMethod.UPDATE_VISIBLE,
  [RenderScenario.INITIAL_FILL]: RenderMethod.UPDATE_VISIBLE,

  // 增量更新-数据行
  [RenderScenario.DATA_PATCH]: RenderMethod.UPDATE_DATA
}

/**
 * 开发模式下的协议校验器
 */
export class RenderProtocalValidator {
  // 用一个调用栈, 记录是否符合调用协议情况
  private static callStack: Array<{
    scenario: RenderScenario;
    method: RenderMethod;
    timestamp: number;
  }> = []

  /**
   * 校验渲染器是否符合协议
   */
  static validate(scenario: RenderScenario, method: RenderMethod, caller: string): void {
    if (process.env.NODE_ENV !== 'development') return  

    const expectedMethod = RENDER_PROTOCOL[scenario]

    if (method !== expectedMethod) {
      console.error(
        `[渲染协议违规] ${caller} 在场景 "${scenario}" 下调用了 "${method}"`,
        `\n预期方法: "${expectedMethod}"`,
        `\n违反规则: ${this.getViolatedRule(scenario, method)}`,
        `\n调用栈:`, this.callStack.slice(-5)
      )
    }

    // 记录调用栈
    this.callStack.push({ scenario, method, timestamp: Date.now() })
    if (this.callStack.length > 100) {
      this.callStack.shift()
    }
  }

  /**
   * 获取违反的规则描述
  */
 private static getViolatedRule(scenario: RenderScenario, method: RenderMethod): string {
  if (scenario === RenderScenario.SCROLL_UPDATE && method === RenderMethod.REFRESH) {
    return '普通滚动不能调用 refresh()'
  }
  if (scenario === RenderScenario.INITIAL_FILL && method === RenderMethod.REFRESH) {
    return '初始化填充不能调用 refresh(), 应走增量更新路径'
  }
  if (scenario === RenderScenario.DATA_PATCH && method === RenderMethod.REFRESH) {
    return '数据补充不能调用 refresh()'
  }
  return '未知规则违规'
 }

 /**
  * 清空调用栈 (用于测试)
  */
 static reset(): void {
  this.callStack = []
 }

}