/// <reference lib="webworker" />
// 图谱计算 Web Worker - 将耗时计算放到子线程避免阻塞 UI

import type { Person, Relation } from '../types'

// ===== 消息类型定义 =====
type MessageData =
  | { type: 'findPath'; persons: Person[]; relations: Relation[]; fromId: string; toId: string }
  | {
      type: 'linearLayout'
      persons: Person[]
      relations: Relation[]
      width: number
      height: number
    }
  | { type: 'groupStats'; persons: Person[] }

// ===== BFS 最短路径查找 =====
function findShortestPath(
  _persons: Person[],
  relations: Relation[],
  fromId: string,
  toId: string
): { path: string[]; relations: Relation[] } | null {
  if (fromId === toId) return { path: [fromId], relations: [] }

  // 构建邻接表
  const adjacency: Record<string, { neighborId: string; relation: Relation }[]> = {}
  relations.forEach((r) => {
    if (!adjacency[r.fromId]) adjacency[r.fromId] = []
    if (!adjacency[r.toId]) adjacency[r.toId] = []
    adjacency[r.fromId].push({ neighborId: r.toId, relation: r })
    adjacency[r.toId].push({ neighborId: r.fromId, relation: r })
  })

  const queue: string[][] = [[fromId]]
  const visited = new Set<string>([fromId])

  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    const neighbors = adjacency[current] || []
    for (const { neighborId } of neighbors) {
      if (visited.has(neighborId)) continue
      const newPath = [...path, neighborId]
      if (neighborId === toId) {
        // 重建路径上的关系
        const pathRelations: Relation[] = []
        for (let i = 0; i < newPath.length - 1; i++) {
          const a = newPath[i]
          const b = newPath[i + 1]
          const rel = relations.find(
            (r) => (r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)
          )
          if (rel) pathRelations.push(rel)
        }
        return { path: newPath, relations: pathRelations }
      }
      visited.add(neighborId)
      queue.push(newPath)
    }
  }
  return null
}

// ===== 直线布局：BFS 分层 + 坐标计算 =====
function computeLinearLayout(
  persons: Person[],
  relations: Relation[],
  width: number,
  height: number
): Record<string, { x: number; y: number; level: number }> {
  // 构建邻接表
  const adjacency: Record<string, string[]> = {}
  persons.forEach((p) => { adjacency[p.id] = [] })
  relations.forEach((r) => {
    if (adjacency[r.fromId]) adjacency[r.fromId].push(r.toId)
    if (adjacency[r.toId]) adjacency[r.toId].push(r.fromId)
  })

  // BFS 分层（从"我"开始）
  const mePerson = persons.find((p) => p.isMe)
  const rootNode = mePerson ? mePerson.id : persons[0]?.id
  const levels: string[][] = []
  const visited = new Set<string>()
  const nodeLevel: Record<string, number> = {}

  if (rootNode) {
    const queue: { id: string; level: number }[] = [{ id: rootNode, level: 0 }]
    visited.add(rootNode)
    while (queue.length > 0) {
      const { id, level } = queue.shift()!
      if (!levels[level]) levels[level] = []
      levels[level].push(id)
      nodeLevel[id] = level
      for (const neighborId of adjacency[id] || []) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          queue.push({ id: neighborId, level: level + 1 })
        }
      }
    }
    // 孤立节点放到最后一层
    const orphans = persons.filter((p) => !visited.has(p.id)).map((p) => p.id)
    if (orphans.length > 0) {
      const orphanLevel = levels.length
      levels.push(orphans)
      orphans.forEach((id) => { nodeLevel[id] = orphanLevel })
    }
  }

  // 计算每层节点的 x/y 坐标
  const levelHeight = Math.min(140, height / Math.max(levels.length, 1))
  const startY = height / 2 - ((levels.length - 1) * levelHeight) / 2
  const positions: Record<string, { x: number; y: number; level: number }> = {}
  levels.forEach((levelNodes, levelIdx) => {
    const y = startY + levelIdx * levelHeight
    const spacing = Math.min(160, width / Math.max(levelNodes.length, 1))
    const startX = width / 2 - ((levelNodes.length - 1) * spacing) / 2
    levelNodes.forEach((nodeId, nodeIdx) => {
      positions[nodeId] = { x: startX + nodeIdx * spacing, y, level: levelIdx }
    })
  })

  return positions
}

// ===== 分组统计 =====
function computeGroupStats(persons: Person[]): {
  groups: Record<string, number>
  total: number
} {
  const groups: Record<string, number> = {}
  let total = 0
  persons.forEach((p) => {
    if (p.isMe) return
    const label = p.customGroupLabel || '未分组'
    groups[label] = (groups[label] || 0) + 1
    total++
  })
  return { groups, total }
}

// ===== 消息处理 =====
self.onmessage = (e: MessageEvent<MessageData>) => {
  const data = e.data
  try {
    switch (data.type) {
      case 'findPath': {
        const result = findShortestPath(data.persons, data.relations, data.fromId, data.toId)
        self.postMessage({ type: 'findPath', result })
        break
      }
      case 'linearLayout': {
        const positions = computeLinearLayout(data.persons, data.relations, data.width, data.height)
        self.postMessage({ type: 'linearLayout', positions })
        break
      }
      case 'groupStats': {
        const stats = computeGroupStats(data.persons)
        self.postMessage({ type: 'groupStats', stats })
        break
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: (err as Error).message })
  }
}
