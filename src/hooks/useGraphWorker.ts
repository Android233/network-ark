import { useRef, useCallback, useEffect } from 'react'
import type { Person, Relation } from '../types'

// 图谱计算 Worker 的消息类型
export type GraphWorkerResult =
  | { type: 'findPath'; result: { path: string[]; relations: Relation[] } | null }
  | { type: 'linearLayout'; positions: Record<string, { x: number; y: number; level: number }> }
  | { type: 'groupStats'; stats: { groups: Record<string, number>; total: number } }
  | { type: 'error'; error: string }

// 单例 Worker（整个应用共享一个）
let workerInstance: Worker | null = null
let pendingResolvers: Map<string, (value: any) => void> = new Map()
let messageId = 0

function getWorker(): Worker | null {
  if (workerInstance) return workerInstance
  try {
    workerInstance = new Worker(new URL('../workers/graphWorker.ts', import.meta.url), {
      type: 'module',
    })
    workerInstance.onmessage = (e: MessageEvent) => {
      const data = e.data as GraphWorkerResult & { id?: string }
      // 找到对应的 resolver 并调用
      const id = (data as any).id
      if (id && pendingResolvers.has(id)) {
        const resolver = pendingResolvers.get(id)!
        pendingResolvers.delete(id)
        resolver(data)
      }
    }
    workerInstance.onerror = (err) => {
      console.warn('GraphWorker error:', err)
    }
    return workerInstance
  } catch (err) {
    console.warn('Worker 创建失败，降级为主线程计算:', err)
    return null
  }
}

// 调用 Worker 并返回 Promise
function callWorker(data: any): Promise<GraphWorkerResult> {
  const worker = getWorker()
  if (!worker) {
    return Promise.reject(new Error('Worker 不可用'))
  }
  const id = `msg_${++messageId}`
  return new Promise((resolve) => {
    pendingResolvers.set(id, resolve)
    worker.postMessage({ ...data, id })
  })
}

// Hook：提供图谱计算能力
export function useGraphWorker() {
  const workerAvailable = useRef(false)

  useEffect(() => {
    workerAvailable.current = !!getWorker()
  }, [])

  // 在子线程中查找最短路径
  const findPath = useCallback(
    async (persons: Person[], relations: Relation[], fromId: string, toId: string) => {
      try {
        const result = await callWorker({
          type: 'findPath',
          persons,
          relations,
          fromId,
          toId,
        })
        if (result.type === 'findPath') return result.result
      } catch {
        // 降级：主线程计算
      }
      return null
    },
    []
  )

  // 在子线程中计算直线布局
  const computeLinear = useCallback(
    async (
      persons: Person[],
      relations: Relation[],
      width: number,
      height: number
    ): Promise<Record<string, { x: number; y: number; level: number }> | null> => {
      try {
        const result = await callWorker({
          type: 'linearLayout',
          persons,
          relations,
          width,
          height,
        })
        if (result.type === 'linearLayout') return result.positions
      } catch {
        // 降级
      }
      return null
    },
    []
  )

  return { findPath, computeLinear, workerAvailable: workerAvailable.current }
}
