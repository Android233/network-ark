import { useState, useEffect, useRef, useMemo } from 'react'
import * as echarts from 'echarts'
import type { Person, Relation, Interaction } from '../types'
import { personDB, relationDB, interactionDB, generateId } from '../utils/db'
import { exportChartImage } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import PersonDetail from '../components/PersonDetail'
import PersonForm from '../components/PersonForm'
import { useLanguage } from '../utils/i18n'
import { useGraphWorker } from '../hooks/useGraphWorker'
import { useChartZoom } from '../hooks/useChartTouch'

// 自定义分组颜色池
const GROUP_COLOR_POOL = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
]

type ViewMode = 'network' | 'tree' | 'linear'

export default function GraphPage() {
  const { t } = useLanguage()
  const { findPath: workerFindPath, computeLinear: workerComputeLinear } = useGraphWorker()
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const [persons, setPersons] = useState<Person[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('network')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<Person[]>([])
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [showAddRelation, setShowAddRelation] = useState(false)
  const [showManageRelation, setShowManageRelation] = useState(false)
  const [showGroupFilter, setShowGroupFilter] = useState(false)
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set())
  const [showPathAnalysis, setShowPathAnalysis] = useState(false)
  const [pathResult, setPathResult] = useState<{ path: Person[]; relations: Relation[] } | null>(null)
  const [showStrength, setShowStrength] = useState(true)
  // Web Worker 预计算的直线布局位置
  const [linearPositions, setLinearPositions] = useState<Record<string, { x: number; y: number; level: number }> | null>(null)

  // 移动端缩放控制
  const { zoomIn, zoomOut, resetZoom } = useChartZoom(chartInstance)

  // 注册全局函数：tooltip 中的"详情"链接点击时调用
  const personsRef = useRef<Person[]>([])
  personsRef.current = persons
  useEffect(() => {
    (window as any).__graphShowDetail = (personId: string) => {
      // 先隐藏 tooltip 气泡框
      chartInstance.current?.dispatchAction({ type: 'hideTip' })
      const person = personsRef.current.find((p) => p.id === personId)
      if (person) setSelectedPerson(person)
    }
    return () => {
      delete (window as any).__graphShowDetail
    }
  }, [])

  // tooltip 配置：显示名字 + 可点击的"详情"链接
  const tooltipConfig = {
    trigger: 'item' as const,
    enterable: true,
    hideDelay: 3000,
    confine: true,
    formatter: (params: any) => {
      if (params.dataType === 'node' && params.data?.data) {
        const p = params.data.data as Person
        return `<div style="font-size:13px;font-weight:600;margin-bottom:4px;">${p.name}</div>` +
               `<a onclick="window.__graphShowDetail('${p.id}')" style="color:#3b82f6;text-decoration:underline;font-size:12px;cursor:pointer;">详情</a>`
      }
      return ''
    },
  }

  // 切换某分组的显示/隐藏
  const toggleGroup = (group: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  // 动态计算分组图例：自定义分组名 → 颜色
  const groupLegend = useMemo(() => {
    const map: Record<string, string> = {}
    let idx = 0
    persons.forEach((p) => {
      if (p.isMe) return
      const label = p.customGroupLabel || '未分组'
      if (!map[label]) {
        map[label] = GROUP_COLOR_POOL[idx % GROUP_COLOR_POOL.length]
        idx++
      }
    })
    return map
  }, [persons])

  // 各分组人数统计
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    persons.forEach((p) => {
      if (p.isMe) return
      const label = p.customGroupLabel || '未分组'
      counts[label] = (counts[label] || 0) + 1
    })
    return counts
  }, [persons])

  // 当前可见的联系人数量（"我"始终可见）
  const visiblePersonCount = useMemo(() => {
    return persons.filter((p) => {
      if (p.isMe) return true
      const label = p.customGroupLabel || '未分组'
      return !hiddenGroups.has(label)
    }).length
  }, [persons, hiddenGroups])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (chartRef.current && persons.length > 0) {
      renderChart()
    }
    return () => {
      chartInstance.current?.dispose()
    }
  }, [persons, relations, interactions, viewMode, highlightId, hiddenGroups, showStrength, pathResult, linearPositions])

  // Web Worker 预计算直线布局位置（避免阻塞 UI 线程）
  useEffect(() => {
    if (viewMode !== 'linear' || !chartRef.current || persons.length === 0) {
      setLinearPositions(null)
      return
    }
    let cancelled = false
    const width = chartRef.current.offsetWidth || 400
    const height = chartRef.current.offsetHeight || 600
    // 当前可见的节点和关系
    const visiblePersons = persons.filter((p) => {
      if (p.isMe) return true
      const label = p.customGroupLabel || '未分组'
      return !hiddenGroups.has(label)
    })
    const visibleIds = new Set(visiblePersons.map((p) => p.id))
    const visibleRelations = relations.filter(
      (r) => visibleIds.has(r.fromId) && visibleIds.has(r.toId)
    )
    workerComputeLinear(visiblePersons, visibleRelations, width, height).then((positions) => {
      if (!cancelled && positions) {
        setLinearPositions(positions)
      }
    })
    return () => { cancelled = true }
  }, [viewMode, persons, relations, hiddenGroups, workerComputeLinear])

  // 搜索候选计算
  useEffect(() => {
    if (searchKeyword.trim()) {
      const q = searchKeyword.trim().toLowerCase()
      setSearchResults(persons.filter((p) => p.name.toLowerCase().includes(q)))
    } else {
      setSearchResults([])
    }
  }, [searchKeyword, persons])

  const loadData = async () => {
    const [p, r, i] = await Promise.all([personDB.getAll(), relationDB.getAll(), interactionDB.getAll()])
    setPersons(p)
    setRelations(r)
    setInteractions(i)
  }

  // BFS 查找两个联系人之间的最短关系路径
  const findShortestPath = (fromId: string, toId: string): { path: string[]; relations: Relation[] } | null => {
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
              (r) =>
                (r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)
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

  // 导出当前图谱为图片
  const handleExportImage = async () => {
    if (!chartInstance.current) return
    try {
      const url = chartInstance.current.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      })
      await exportChartImage(url, '关系图谱')
    } catch (e) {
      alert('导出失败：' + (e as Error).message)
    }
  }

  // 创建两个联系人之间的关系
  const handleAddRelation = async (fromId: string, toId: string, relationName: string) => {
    if (fromId === toId) {
      alert(t('graph.selectTwoDifferent'))
      return
    }
    // 检查是否已存在关系
    const exists = relations.some(
      (r) =>
        (r.fromId === fromId && r.toId === toId) ||
        (r.fromId === toId && r.toId === fromId)
    )
    if (exists) {
      alert(t('graph.relationExists'))
      return
    }
    await relationDB.add({
      id: generateId(),
      fromId,
      toId,
      type: 'other',
      note: relationName,
    })
    setShowAddRelation(false)
    loadData()
  }

  // 删除关系
  const handleDeleteRelation = async (relationId: string) => {
    await relationDB.remove(relationId)
    loadData()
  }

  // 更新联系人（编辑场景下 person 一定带 id）
  const handleUpdatePerson = async (person: Omit<Person, 'id' | 'createdAt' | 'updatedAt'> | Person) => {
    if ('id' in person) {
      await personDB.update({ ...person, updatedAt: Date.now() })
      setEditingPerson(null)
      loadData()
    }
  }

  // 删除联系人
  const handleDeletePerson = async (id: string) => {
    await personDB.remove(id)
    setSelectedPerson(null)
    loadData()
  }

  const renderChart = () => {
    if (!chartRef.current) return

    if (chartInstance.current) {
      chartInstance.current.dispose()
    }

    const chart = echarts.init(chartRef.current)
    chartInstance.current = chart

    // 按分组显示/隐藏过滤：隐藏分组中的人不显示（"我"始终显示）
    const visiblePersons = persons.filter((p) => {
      if (p.isMe) return true
      const label = p.customGroupLabel || '未分组'
      return !hiddenGroups.has(label)
    })
    const visibleIds = new Set(visiblePersons.map((p) => p.id))
    const visibleRelations = relations.filter(
      (r) => visibleIds.has(r.fromId) && visibleIds.has(r.toId)
    )

    // 找到"我"
    const me = visiblePersons.find((p) => p.isMe) || visiblePersons[0]
    const meId = me?.id

    // 根据高亮节点ID计算需要高亮的节点ID集合（高亮节点 + 通过 relations 直接关联的节点）
    const highlightIds = new Set<string>()
    if (highlightId) {
      highlightIds.add(highlightId)
      visibleRelations.forEach((r) => {
        if (highlightIds.has(r.fromId)) {
          highlightIds.add(r.toId)
        }
        if (highlightIds.has(r.toId)) {
          highlightIds.add(r.fromId)
        }
      })
    }
    const hasSearch = highlightIds.size > 0

    // 路径分析结果：构建路径节点集合和路径边集合
    const pathNodeIds = new Set<string>()
    const pathEdgeKeys = new Set<string>()
    if (pathResult) {
      pathResult.path.forEach((p) => pathNodeIds.add(p.id))
      pathResult.relations.forEach((r) => {
        pathEdgeKeys.add(`${r.fromId}__${r.toId}`)
        pathEdgeKeys.add(`${r.toId}__${r.fromId}`)
      })
    }
    const hasPath = pathNodeIds.size > 0

    // 计算每条关系两端联系人的互动次数总和（用于关系强度可视化）
    const interactionCountByPerson = new Map<string, number>()
    interactions.forEach((i) => {
      interactionCountByPerson.set(i.personId, (interactionCountByPerson.get(i.personId) || 0) + 1)
    })
    // 关系强度 = 两端联系人互动次数之和
    const getRelationStrength = (r: Relation): number => {
      const a = interactionCountByPerson.get(r.fromId) || 0
      const b = interactionCountByPerson.get(r.toId) || 0
      return a + b
    }

    // 动态为每个自定义分组分配颜色
    const groupColorMap: Record<string, string> = {}
    let colorIndex = 0
    persons.forEach((p) => {
      const label = p.customGroupLabel || '未分组'
      if (!groupColorMap[label] && !p.isMe) {
        groupColorMap[label] = GROUP_COLOR_POOL[colorIndex % GROUP_COLOR_POOL.length]
        colorIndex++
      }
    })

    // 构建节点数据 - "我"为中心，更大更突出
    // 有头像用图片，否则男性=方形(rect)，女性=圆形(circle)，未知=圆形
    const nodes = visiblePersons.map((p) => {
      const isMe = p.id === meId
      const groupLabel = p.customGroupLabel || '未分组'
      const shapeSymbol = p.gender === 'male' ? 'rect' : 'circle'
      // 高亮逻辑：搜索高亮、路径高亮优先；都没有则全部高亮
      let isHighlighted = true
      if (hasPath) {
        isHighlighted = pathNodeIds.has(p.id)
      } else if (hasSearch) {
        isHighlighted = highlightIds.has(p.id)
      }
      // 有头像时使用图片作为节点符号
      const symbol = p.avatar ? `image://${p.avatar}` : shapeSymbol
      const symbolSize = isMe ? 60 : (hasPath && pathNodeIds.has(p.id) ? 48 : 40)
      return {
        id: p.id,
        name: isMe ? `我 (${p.name})` : p.name,
        symbol,
        symbolSize,
        itemStyle: {
          color: isMe ? '#f59e0b' : (groupColorMap[groupLabel] || '#8b5cf6'),
          borderColor: isMe ? '#fbbf24' : (p.avatar ? '#ffffff' : 'transparent'),
          borderWidth: isMe ? 3 : (p.avatar ? 2 : 0),
          shadowBlur: isMe ? 15 : (p.avatar ? 6 : 0),
          shadowColor: isMe ? 'rgba(245, 158, 11, 0.4)' : 'rgba(0,0,0,0.15)',
          opacity: isHighlighted ? 1 : 0.15,
        },
        label: {
          show: true,
          position: 'bottom',
          fontSize: isMe ? 15 : 13,
          fontWeight: isMe ? 'bold' : 'normal',
          color: isMe ? '#d97706' : (hasPath && pathNodeIds.has(p.id) ? '#7c3aed' : '#374151'),
          opacity: isHighlighted ? 1 : 0.15,
        },
        data: p,
        fixed: isMe,
        x: isMe && chartRef.current ? chartRef.current.offsetWidth / 2 : undefined,
        y: isMe && chartRef.current ? chartRef.current.offsetHeight / 2 : undefined,
      }
    })

    // 构建连线数据 - 线上文字显示分组名
    // 通过 source/target 节点查找对应联系人的自定义分组名
    const personMap = new Map(visiblePersons.map((p) => [p.id, p]))
    const links = visibleRelations.map((r) => {
      const targetPerson = personMap.get(r.toId)
      const sourcePerson = personMap.get(r.fromId)
      // 优先用关系备注；否则取非"我"那一端的分组名
      let labelText = r.note
      if (!labelText) {
        const other = sourcePerson?.isMe ? targetPerson : (targetPerson?.isMe ? sourcePerson : targetPerson)
        labelText = other?.customGroupLabel || ''
      }
      // 高亮判断
      let isHighlighted = true
      if (hasPath) {
        isHighlighted = pathEdgeKeys.has(`${r.fromId}__${r.toId}`)
      } else if (hasSearch) {
        isHighlighted = highlightIds.has(r.fromId) && highlightIds.has(r.toId)
      }

      // 关系强度可视化：根据互动次数计算连线粗细和颜色深浅
      const strength = showStrength ? getRelationStrength(r) : 0
      // 线宽：基础 1.5px，每 2 次互动 +0.5px，最大 6px
      const lineWidth = showStrength ? Math.min(1.5 + strength * 0.25, 6) : 2
      // 颜色：互动越多越偏暖（蓝→橙→红），无互动为浅蓝
      let lineColor = '#60a5fa'
      if (showStrength && strength > 0) {
        if (strength >= 10) lineColor = '#ef4444'
        else if (strength >= 6) lineColor = '#f97316'
        else if (strength >= 3) lineColor = '#f59e0b'
        else lineColor = '#3b82f6'
      }
      // 路径上的边用紫色高亮
      if (hasPath && pathEdgeKeys.has(`${r.fromId}__${r.toId}`)) {
        lineColor = '#7c3aed'
      }

      // 强度标签：互动次数 > 0 时显示
      const showStrengthLabel = showStrength && strength > 0 && !hasPath && !hasSearch

      return {
        source: r.fromId,
        target: r.toId,
        value: showStrengthLabel ? `${labelText || '关系'} · ${strength}次互动` : labelText,
        label: {
          show: !hasPath || isHighlighted,
          formatter: showStrengthLabel ? `${labelText || ''} ${strength}` : labelText,
          fontSize: 13,
          color: hasPath && isHighlighted ? '#7c3aed' : '#3b82f6',
          fontWeight: 'bold',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          padding: [3, 6],
          borderRadius: 4,
          opacity: isHighlighted ? 1 : 0.15,
        },
        lineStyle: {
          color: lineColor,
          width: (hasPath && isHighlighted) ? 4 : lineWidth,
          curveness: 0.15,
          opacity: isHighlighted ? 0.85 : 0.1,
          type: (hasPath && isHighlighted) ? 'solid' : 'solid',
        },
      }
    })

    let option: echarts.EChartsCoreOption

    if (viewMode === 'network') {
      option = {
        tooltip: tooltipConfig,
        series: [{
          type: 'graph',
          layout: 'force',
          data: nodes,
          links: links,
          roam: true,
          draggable: true,
          force: {
            repulsion: 500,
            edgeLength: 220,
            gravity: 0.08,
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3,
              color: '#2563eb',
            },
            label: {
              fontSize: 15,
              fontWeight: 'bold',
            },
          },
          lineStyle: {
            color: '#60a5fa',
            width: 2,
            curveness: 0.15,
            opacity: 0.8,
          },
        }],
      }
    } else if (viewMode === 'tree') {
      option = {
        tooltip: tooltipConfig,
        series: [{
          type: 'graph',
          layout: 'circular',
          data: nodes,
          links: links,
          roam: true,
          draggable: true,
          circular: {
            rotateLabel: true,
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3,
              color: '#2563eb',
            },
          },
          lineStyle: {
            color: '#60a5fa',
            width: 2,
            curveness: 0.2,
            opacity: 0.8,
          },
        }],
      }
    } else {
      // linear: 直线布局，按 BFS 层级排列，不可拖拽
      // 优先使用 Web Worker 预计算的位置；否则降级为主线程同步计算
      const width = chartRef.current?.offsetWidth || 400
      const height = chartRef.current?.offsetHeight || 600

      let linearPositionsMap: Record<string, { x: number; y: number }> = {}

      if (linearPositions) {
        // 使用 Worker 预计算的结果
        Object.entries(linearPositions).forEach(([id, pos]) => {
          linearPositionsMap[id] = { x: pos.x, y: pos.y }
        })
      } else {
        // 降级：主线程同步 BFS 分层
        const adjacency: Record<string, string[]> = {}
        visiblePersons.forEach((p) => { adjacency[p.id] = [] })
        visibleRelations.forEach((r) => {
          if (adjacency[r.fromId]) adjacency[r.fromId].push(r.toId)
          if (adjacency[r.toId]) adjacency[r.toId].push(r.fromId)
        })
        const mePerson = visiblePersons.find((p) => p.isMe)
        const rootNode = mePerson ? mePerson.id : visiblePersons[0]?.id
        const levels: string[][] = []
        const visited = new Set<string>()
        if (rootNode) {
          const queue: { id: string; level: number }[] = [{ id: rootNode, level: 0 }]
          visited.add(rootNode)
          while (queue.length > 0) {
            const { id, level } = queue.shift()!
            if (!levels[level]) levels[level] = []
            levels[level].push(id)
            for (const neighborId of (adjacency[id] || [])) {
              if (!visited.has(neighborId)) {
                visited.add(neighborId)
                queue.push({ id: neighborId, level: level + 1 })
              }
            }
          }
          const orphans = visiblePersons.filter((p) => !visited.has(p.id)).map((p) => p.id)
          if (orphans.length > 0) levels.push(orphans)
        }
        const levelHeight = Math.min(140, height / Math.max(levels.length, 1))
        const startY = height / 2 - ((levels.length - 1) * levelHeight) / 2
        levels.forEach((levelNodes, levelIdx) => {
          const y = startY + levelIdx * levelHeight
          const spacing = Math.min(160, width / Math.max(levelNodes.length, 1))
          const startX = width / 2 - ((levelNodes.length - 1) * spacing) / 2
          levelNodes.forEach((nodeId, nodeIdx) => {
            linearPositionsMap[nodeId] = { x: startX + nodeIdx * spacing, y }
          })
        })
      }

      // 给节点设置固定位置
      const linearNodes = nodes.map((n: any) => ({
        ...n,
        x: linearPositionsMap[n.id]?.x ?? width / 2,
        y: linearPositionsMap[n.id]?.y ?? height / 2,
        fixed: true,
        draggable: false,
      }))

      option = {
        tooltip: tooltipConfig,
        series: [{
          type: 'graph',
          layout: 'none',
          data: linearNodes,
          links: links.map((l: any) => ({
            ...l,
            lineStyle: { ...l.lineStyle, curveness: 0 },
          })),
          roam: true,
          draggable: false,
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3,
              color: '#2563eb',
            },
          },
          lineStyle: {
            color: '#60a5fa',
            width: 2,
            curveness: 0,
            opacity: 0.8,
          },
        }],
      }
    }

    chart.setOption(option)

    chart.on('click', (params: any) => {
      if (params.dataType === 'node' && params.data?.data) {
        setSelectedPerson(params.data.data)
      }
    })
  }

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const viewModes: { key: ViewMode; label: string; icon: string }[] = [
    { key: 'network', label: t('graph.network'), icon: '🕸️' },
    { key: 'tree', label: t('graph.tree'), icon: '🌳' },
    { key: 'linear', label: t('graph.linear'), icon: '📏' },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('graph.title')}
        subtitle={
          pathResult
            ? t('graph.pathAnalysis', { n: pathResult.path.length, m: pathResult.relations.length })
            : hiddenGroups.size > 0
            ? t('graph.showingNodes', { n: visiblePersonCount, m: persons.length, k: relations.length })
            : t('graph.nodesRelations', { n: persons.length, m: relations.length })
        }
        right={
          <div className="flex gap-2">
            <button
              onClick={handleExportImage}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
              title={t('graph.exportImage')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={() => {
                setPathResult(null)
                setShowPathAnalysis(true)
              }}
              className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200 ${
                pathResult ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
              }`}
              title={t('graph.pathFind')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </button>
            <button
              onClick={() => setShowGroupFilter(true)}
              className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200 ${
                hiddenGroups.size > 0 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}
              title={t('graph.groupFilter')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
            <button
              onClick={() => setShowManageRelation(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
              title={t('graph.manageRelation')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={() => setShowAddRelation(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
              title={t('graph.addRelation')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        }
      />

      {/* 视图切换 + 强度开关 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
        <div className="flex gap-2 items-center">
          {viewModes.map((mode) => (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === mode.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              <span>{mode.icon}</span>
              {mode.label}
            </button>
          ))}
          <button
            onClick={() => setShowStrength(!showStrength)}
            className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              showStrength ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
            }`}
            title={t('graph.strengthTip')}
          >
            <span>🔥</span>
            {t('graph.strength')}
          </button>
        </div>
      </div>

      {/* 搜索框 + 候选列表 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100 relative">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => {
              setSearchKeyword(e.target.value)
              setHighlightId(null)
            }}
            placeholder={t('graph.searchPlaceholder')}
            className="w-full pl-9 pr-9 py-2 text-sm bg-gray-50 rounded-lg border border-gray-100 focus:outline-none focus:border-blue-400"
          />
          {searchKeyword && (
            <button
              onClick={() => {
                setSearchKeyword('')
                setHighlightId(null)
                setSearchResults([])
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 搜索候选下拉列表 */}
        {searchResults.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 max-h-60 overflow-y-auto z-20">
            {searchResults.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setHighlightId(p.id)
                  setSelectedPerson(p)
                  setSearchResults([])
                  setSearchKeyword(p.name)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-b-0"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                  style={{ backgroundColor: p.isMe ? '#f59e0b' : (groupLegend[p.customGroupLabel || '未分组'] || '#8b5cf6') }}
                >
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {p.isMe ? `我 (${p.name})` : p.name}
                  </div>
                  {p.customGroupLabel && (
                    <div className="text-xs text-gray-400">{p.customGroupLabel}</div>
                  )}
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {searchKeyword && searchResults.length === 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 px-3 py-3 text-sm text-gray-400 text-center z-20">
            {t('graph.noMatch')}
          </div>
        )}
      </div>

      {/* 路径分析结果横幅 */}
      {pathResult && (
        <div className="flex-shrink-0 mx-4 my-2 p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-purple-700">
              🔗 {t('graph.shortestPath', { n: pathResult.path.length - 1 })}
            </span>
            <button
              onClick={() => setPathResult(null)}
              className="text-xs text-purple-500 hover:text-purple-700"
            >
              ✕ {t('graph.clear')}
            </button>
          </div>
          <div className="flex items-center flex-wrap gap-1 text-xs">
            {pathResult.path.map((p, idx) => (
              <span key={p.id} className="flex items-center gap-1">
                <span className={`px-1.5 py-0.5 rounded ${p.isMe ? 'bg-amber-100 text-amber-700' : 'bg-white text-purple-700 border border-purple-200'}`}>
                  {p.isMe ? t('common.me') : p.name}
                </span>
                {idx < pathResult.path.length - 1 && (
                  <span className="text-purple-400">→</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 图表区域 */}
      <div className="flex-1 relative bg-white">
        {persons.length === 0 ? (
          <EmptyState
            icon="🕸️"
            title={t('graph.noData')}
            description={t('graph.noDataDesc')}
          />
        ) : (
          <>
            <div ref={chartRef} className="w-full h-full" style={{ touchAction: 'manipulation' }} />
            {/* 缩放控制按钮 */}
            <div className="absolute right-3 bottom-4 flex flex-col gap-2 z-20">
              <button
                onClick={zoomIn}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                title={t('graph.zoomIn')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v10M5 12h10" />
                </svg>
              </button>
              <button
                onClick={zoomOut}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                title={t('graph.zoomOut')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM5 12h10" />
                </svg>
              </button>
              <button
                onClick={resetZoom}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                title={t('graph.zoomReset')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* 图例 - 动态显示自定义分组 + 性别形状，分组项可点击切换显示/隐藏 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-t border-gray-100">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-amber-500 ring-2 ring-amber-300" style={{ borderRadius: 2 }} />
            <span className="text-xs text-gray-500">{t('graph.legendMe')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-gray-400" style={{ borderRadius: 2 }} />
            <span className="text-xs text-gray-500">{t('graph.legendMale')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-gray-400 rounded-full" />
            <span className="text-xs text-gray-500">{t('graph.legendFemale')}</span>
          </div>
          {showStrength && (
            <>
              <span className="text-xs text-gray-300">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">{t('graph.legendStrength')}</span>
                <span className="w-4 h-0.5 bg-blue-400" />
                <span className="text-[10px] text-gray-400">{t('graph.legendNone')}</span>
                <span className="w-4 h-0.5 bg-blue-600" />
                <span className="text-[10px] text-gray-400">{t('graph.legendFew')}</span>
                <span className="w-4 h-1 bg-amber-500" />
                <span className="text-[10px] text-gray-400">{t('graph.legendMid')}</span>
                <span className="w-4 h-1.5 bg-red-500" />
                <span className="text-[10px] text-gray-400">{t('graph.legendMany')}</span>
              </div>
            </>
          )}
          <span className="text-xs text-gray-300">|</span>
          {Object.entries(groupLegend).map(([label, color]) => {
            const isHidden = hiddenGroups.has(label)
            return (
              <button
                key={label}
                onClick={() => toggleGroup(label)}
                className={`flex items-center gap-1.5 transition-opacity ${isHidden ? 'opacity-40' : 'opacity-100'}`}
                title={isHidden ? `点击显示「${label}」` : `点击隐藏「${label}」`}
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: isHidden ? '#d1d5db' : color,
                    textDecoration: isHidden ? 'line-through' : 'none',
                  }}
                />
                <span
                  className="text-xs"
                  style={{
                    color: isHidden ? '#9ca3af' : '#6b7280',
                    textDecoration: isHidden ? 'line-through' : 'none',
                  }}
                >
                  {label}
                </span>
              </button>
            )
          })}
          {hiddenGroups.size > 0 && (
            <button
              onClick={() => setHiddenGroups(new Set())}
              className="text-xs text-blue-600 hover:underline ml-1"
            >
              {t('graph.showAll')}
            </button>
          )}
        </div>
      </div>

      {/* 节点详情弹窗 */}
      <Modal open={!!selectedPerson} onClose={() => setSelectedPerson(null)}>
        {selectedPerson && (
          <PersonDetail
            person={selectedPerson}
            onEdit={() => {
              setEditingPerson(selectedPerson)
              setSelectedPerson(null)
            }}
            onDelete={() => handleDeletePerson(selectedPerson.id)}
            onClose={() => setSelectedPerson(null)}
          />
        )}
      </Modal>

      {/* 编辑联系人弹窗 */}
      <Modal open={!!editingPerson} onClose={() => setEditingPerson(null)} title={t('graph.editContact')}>
        {editingPerson && (
          <PersonForm
            person={editingPerson}
            onSubmit={handleUpdatePerson}
            onCancel={() => setEditingPerson(null)}
          />
        )}
      </Modal>

      {/* 添加关系弹窗 */}
      <Modal open={showAddRelation} onClose={() => setShowAddRelation(false)} title={t('graph.addRelationTitle')}>
        <AddRelationForm
          persons={persons.filter((p) => !p.isMe)}
          onSubmit={handleAddRelation}
          onCancel={() => setShowAddRelation(false)}
        />
      </Modal>

      {/* 关系管理弹窗 */}
      <Modal open={showManageRelation} onClose={() => setShowManageRelation(false)} title={t('graph.manageRelationTitle')}>
        <ManageRelationForm
          persons={persons}
          relations={relations}
          onDelete={handleDeleteRelation}
          onCancel={() => setShowManageRelation(false)}
        />
      </Modal>

      {/* 分组筛选弹窗 */}
      <Modal open={showGroupFilter} onClose={() => setShowGroupFilter(false)} title={t('graph.groupFilterTitle')}>
        <GroupFilterForm
          groupLegend={groupLegend}
          groupCounts={groupCounts}
          hiddenGroups={hiddenGroups}
          onToggle={toggleGroup}
          onShowAll={() => setHiddenGroups(new Set())}
          onHideAll={() => setHiddenGroups(new Set(Object.keys(groupLegend)))}
          onCancel={() => setShowGroupFilter(false)}
        />
      </Modal>

      {/* 关系路径分析弹窗 */}
      <Modal open={showPathAnalysis} onClose={() => setShowPathAnalysis(false)} title={t('graph.pathAnalysisTitle')}>
        <PathAnalysisForm
          persons={persons}
          onFindPath={async (fromId, toId) => {
            // 优先使用 Web Worker 计算（避免阻塞 UI）
            let result: { path: string[]; relations: Relation[] } | null = null
            try {
              result = await workerFindPath(persons, relations, fromId, toId)
            } catch {
              // 降级：主线程同步计算
              result = findShortestPath(fromId, toId)
            }
            if (!result) {
              setPathResult(null)
              setShowPathAnalysis(false)
              alert(t('graph.noPathAlert'))
              return
            }
            const personMap = new Map(persons.map((p) => [p.id, p]))
            const pathPersons = result.path.map((id) => personMap.get(id)).filter(Boolean) as Person[]
            setPathResult({ path: pathPersons, relations: result.relations })
            setShowPathAnalysis(false)
          }}
          onCancel={() => setShowPathAnalysis(false)}
        />
      </Modal>
    </div>
  )
}

// 添加关系表单
function AddRelationForm({
  persons,
  onSubmit,
  onCancel,
}: {
  persons: Person[]
  onSubmit: (fromId: string, toId: string, relationName: string) => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [relationName, setRelationName] = useState('')

  const handleSubmit = () => {
    if (!fromId || !toId) {
      alert(t('graph.selectTwoContacts'))
      return
    }
    if (fromId === toId) {
      alert(t('graph.selectTwoDifferent'))
      return
    }
    if (!relationName.trim()) {
      alert(t('graph.inputRelationName'))
      return
    }
    onSubmit(fromId, toId, relationName.trim())
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('graph.personOne')} *</label>
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        >
          <option value="">{t('graph.selectContact')}</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('graph.personTwo')} *</label>
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        >
          <option value="">{t('graph.selectContact')}</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('graph.relationName')} *</label>
        <input
          type="text"
          value={relationName}
          onChange={(e) => setRelationName(e.target.value)}
          placeholder={t('graph.relationPlaceholder')}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium"
        >
          {t('common.confirm')}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

// 关系管理表单 - 列出所有"我"之外成员之间的关系，可删除
function ManageRelationForm({
  persons,
  relations,
  onDelete,
  onCancel,
}: {
  persons: Person[]
  relations: Relation[]
  onDelete: (relationId: string) => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const personMap = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons])
  const me = persons.find((p) => p.isMe)

  // 筛选出"我"之外成员之间的关系
  const otherRelations = useMemo(() => {
    return relations.filter((r) => {
      if (!me) return true
      return r.fromId !== me.id && r.toId !== me.id
    })
  }, [relations, me])

  return (
    <div className="space-y-3">
      {otherRelations.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8">
          {t('graph.noOtherRelations')}
        </div>
      ) : (
        otherRelations.map((r) => {
          const from = personMap.get(r.fromId)
          const to = personMap.get(r.toId)
          if (!from || !to) return null
          return (
            <div
              key={r.id}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <span className="text-lg">🔗</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {from.name} ↔ {to.name}
                </div>
                <div className="text-xs text-blue-600 mt-0.5">
                  {r.note || t('graph.relation')}
                </div>
              </div>
              <button
                onClick={() => onDelete(r.id)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })
      )}

      <div className="flex pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}

// 分组筛选表单 - 勾选要显示的分组
function GroupFilterForm({
  groupLegend,
  groupCounts,
  hiddenGroups,
  onToggle,
  onShowAll,
  onHideAll,
  onCancel,
}: {
  groupLegend: Record<string, string>
  groupCounts: Record<string, number>
  hiddenGroups: Set<string>
  onToggle: (group: string) => void
  onShowAll: () => void
  onHideAll: () => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const groups = Object.keys(groupLegend)

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {t('graph.filterInstruction')}
      </p>

      {/* 全部显示 / 全部隐藏 */}
      <div className="flex gap-2">
        <button
          onClick={onShowAll}
          disabled={hiddenGroups.size === 0}
          className="flex-1 py-2 text-xs bg-blue-50 text-blue-600 rounded-lg font-medium disabled:opacity-40"
        >
          {t('graph.showAllBtn')}
        </button>
        <button
          onClick={onHideAll}
          disabled={hiddenGroups.size === groups.length}
          className="flex-1 py-2 text-xs bg-gray-100 text-gray-600 rounded-lg font-medium disabled:opacity-40"
        >
          {t('graph.hideAllBtn')}
        </button>
      </div>

      {/* 分组列表 */}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-6">
            {t('graph.noGroupData')}
          </div>
        ) : (
          groups.map((label) => {
            const color = groupLegend[label]
            const isHidden = hiddenGroups.has(label)
            const count = groupCounts[label] || 0
            return (
              <button
                key={label}
                onClick={() => onToggle(label)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] ${
                  isHidden
                    ? 'bg-gray-50 border-gray-100'
                    : 'bg-white border-gray-200'
                }`}
              >
                {/* 勾选框 */}
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                    isHidden ? 'bg-gray-200' : 'bg-blue-600'
                  }`}
                >
                  {!isHidden && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {/* 分组颜色圆点 */}
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isHidden ? '#d1d5db' : color }}
                />
                {/* 分组名 + 人数 */}
                <div className="flex-1 min-w-0 text-left">
                  <div
                    className="text-sm font-medium"
                    style={{
                      color: isHidden ? '#9ca3af' : '#374151',
                      textDecoration: isHidden ? 'line-through' : 'none',
                    }}
                  >
                    {label}
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: isHidden ? '#f3f4f6' : `${color}20`,
                    color: isHidden ? '#9ca3af' : color,
                  }}
                >
                  {count} {t('common.people')}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div className="flex pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium"
        >
          {t('common.done')}
        </button>
      </div>
    </div>
  )
}

// 关系路径分析表单 - 选择两个联系人，查找最短关系路径
function PathAnalysisForm({
  persons,
  onFindPath,
  onCancel,
}: {
  persons: Person[]
  onFindPath: (fromId: string, toId: string) => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')

  const handleSubmit = () => {
    if (!fromId || !toId) {
      alert(t('graph.selectTwoContacts'))
      return
    }
    if (fromId === toId) {
      alert(t('graph.selectTwoDifferent'))
      return
    }
    onFindPath(fromId, toId)
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-purple-50 rounded-xl">
        <p className="text-xs text-purple-700 leading-relaxed">
          🔗 {t('graph.pathInstruction')}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('graph.startContact')} *</label>
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-purple-400"
        >
          <option value="">{t('graph.selectContact')}</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.isMe ? `我 (${p.name})` : p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-center">
        <span className="text-2xl text-purple-400">↓</span>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('graph.endContact')} *</label>
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-purple-400"
        >
          <option value="">{t('graph.selectContact')}</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.isMe ? `我 (${p.name})` : p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg font-medium"
        >
          {t('graph.findPath')}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
