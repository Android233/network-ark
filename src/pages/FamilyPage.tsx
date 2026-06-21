import { useState, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { FamilyMember, Gender, Generation, Person, Photo } from '../types'
import { GENERATION_LABELS } from '../types'
import { familyDB, personDB, photoDB, generateId } from '../utils/db'
import { compressImage, exportChartImage } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import PhotoWall from '../components/PhotoWall'
import ConfirmDialog from '../components/ConfirmDialog'
import { useLanguage } from '../utils/i18n'
import { useChartZoom } from '../hooks/useChartTouch'

export default function FamilyPage() {
  const { t } = useLanguage()
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [showPhotoWall, setShowPhotoWall] = useState(false)

  useEffect(() => {
    loadMembers()
  }, [])

  // 缩放控制
  const { zoomIn, zoomOut, resetZoom } = useChartZoom(chartInstance)

  // 注册全局函数：tooltip 中的"详情"链接点击时调用
  const membersRef = useRef<FamilyMember[]>([])
  membersRef.current = members
  useEffect(() => {
    (window as any).__familyShowDetail = (memberId: string) => {
      // 先隐藏 tooltip 气泡框
      chartInstance.current?.dispatchAction({ type: 'hideTip' })
      const member = membersRef.current.find((m) => m.id === memberId)
      if (member) setSelectedMember(member)
    }
    return () => {
      delete (window as any).__familyShowDetail
    }
  }, [])

  // tooltip 配置：显示名字 + 可点击的"详情"链接
  const tooltipConfig = {
    trigger: 'item' as const,
    enterable: true,
    hideDelay: 3000,
    confine: true,
    formatter: (params: any) => {
      if (params.dataType === 'node' && params.data?.value) {
        const m = params.data.value as FamilyMember
        return `<div style="font-size:13px;font-weight:600;margin-bottom:4px;">${m.name}</div>` +
               `<a onclick="window.__familyShowDetail('${m.id}')" style="color:#3b82f6;text-decoration:underline;font-size:12px;cursor:pointer;">详情</a>`
      }
      return ''
    },
  }

  // 选中成员变化时加载照片
  useEffect(() => {
    if (selectedMember) {
      loadPhotos()
    }
  }, [selectedMember])

  // 照片墙 ID：关联联系人则同步，否则独立
  const getPhotoOwnerId = (member: FamilyMember): string => {
    return member.personId || `family_${member.id}`
  }

  const loadPhotos = async () => {
    if (!selectedMember) return
    const ownerId = getPhotoOwnerId(selectedMember)
    const data = await photoDB.getByPerson(ownerId)
    setPhotos(data)
  }

  useEffect(() => {
    if (chartRef.current && members.length > 0) {
      renderTree()
    }
    return () => {
      chartInstance.current?.dispose()
    }
  }, [members, persons])

  const loadMembers = async () => {
    let data = await familyDB.getAll()
    // 去重：如果有多个"我"，保留带 isMe 标记的，删除其他重复项
    const meCandidates = data.filter((m) => m.isMe || m.relation === '本人' || m.name === '我')
    if (meCandidates.length > 1) {
      // 优先保留带 isMe 的；都没有 isMe 就给第一个补上
      const keeper = meCandidates.find((m) => m.isMe) || meCandidates[0]
      if (!keeper.isMe) {
        await familyDB.update({ ...keeper, isMe: true })
      }
      const toRemove = meCandidates.filter((m) => m.id !== keeper.id)
      for (const m of toRemove) {
        await familyDB.remove(m.id)
      }
      // 把被删除"我"的配偶/父母关系转移到保留的"我"上
      for (const m of data) {
        let changed = false
        if (m.spouseId && toRemove.some((r) => r.id === m.spouseId)) {
          m.spouseId = keeper.id
          changed = true
        }
        if (m.parentIds && m.parentIds.some((pid) => toRemove.some((r) => r.id === pid))) {
          m.parentIds = m.parentIds.map((pid) =>
            toRemove.some((r) => r.id === pid) ? keeper.id : pid
          )
          changed = true
        }
        if (changed) await familyDB.update(m)
      }
      data = await familyDB.getAll()
    }

    // 加载联系人，用于头像同步
    const allPersons = await personDB.getAll()
    setPersons(allPersons)

    // === 头像同步：家族成员头像与关联联系人保持一致 ===
    const personMap = new Map(allPersons.map((p) => [p.id, p]))
    const mePerson = allPersons.find((p) => p.isMe)
    let syncChanged = false
    data = data.map((m) => {
      let linkedPerson: Person | undefined
      // "我"的家族成员：关联到联系人中的"我"
      if (m.isMe) {
        if (mePerson) {
          // 若未关联 personId，则补上
          if (!m.personId) m.personId = mePerson.id
          linkedPerson = mePerson
        }
      } else if (m.personId) {
        // 其他成员：取关联联系人的头像
        linkedPerson = personMap.get(m.personId)
      }
      // 同步头像（联系人头像优先）
      if (linkedPerson && m.avatar !== linkedPerson.avatar) {
        m.avatar = linkedPerson.avatar
        syncChanged = true
      }
      return m
    })
    // 持久化同步结果
    if (syncChanged) {
      await Promise.all(data.map((m) => familyDB.update(m)))
    }

    setMembers(data)
  }

  const renderTree = () => {
    if (!chartRef.current) return

    if (chartInstance.current) {
      chartInstance.current.dispose()
    }

    const chart = echarts.init(chartRef.current)
    chartInstance.current = chart

    const memberMap = new Map(members.map((m) => [m.id, m]))
    const me = members.find((m) => m.isMe || m.relation === '本人' || m.name === '我')

    // === 1. 按辈分分组 ===
    const layerOrder: Generation[] = ['grandparent', 'parent', 'self', 'child', 'grandchild']
    // 层间距 140px，以 self 层为 y=0 居中
    const layerY: Record<Generation, number> = {
      grandparent: -280, parent: -140, self: 0, child: 140, grandchild: 280,
    }

    const layers: Record<Generation, FamilyMember[]> = {
      grandparent: [], parent: [], self: [], child: [], grandchild: [],
    }
    members.forEach((m) => {
      if (layers[m.generation]) {
        layers[m.generation].push(m)
      }
    })

    // === 2. 计算每层节点的 x 坐标（智能排序，避免连线交叉） ===
    const positions: Record<string, { x: number; y: number }> = {}
    const nodeSpacing = 120 // 同层普通节点间距
    const spouseSpacing = 80 // 配偶间距

    // 配偶配对：同层的配偶相邻放置
    const getPairs = (gen: Generation): FamilyMember[][] => {
      const layerMembers = layers[gen]
      const visited = new Set<string>()
      const pairs: FamilyMember[][] = []
      layerMembers.forEach((m) => {
        if (visited.has(m.id)) return
        visited.add(m.id)
        if (m.spouseId && memberMap.has(m.spouseId)) {
          const spouse = memberMap.get(m.spouseId)!
          if (spouse.generation === gen && !visited.has(spouse.id)) {
            visited.add(spouse.id)
            pairs.push([m, spouse])
          } else {
            pairs.push([m])
          }
        } else {
          pairs.push([m])
        }
      })
      return pairs
    }

    // 排列一层：计算总跨度并居中
    const layoutLayer = (gen: Generation, pairs: FamilyMember[][]) => {
      const y = layerY[gen]
      let totalSpan = 0
      pairs.forEach((pair, idx) => {
        if (pair.length === 2) totalSpan += spouseSpacing
        if (idx < pairs.length - 1) totalSpan += nodeSpacing
      })
      let currentX = -totalSpan / 2
      pairs.forEach((pair, idx) => {
        if (pair.length === 2) {
          positions[pair[0].id] = { x: currentX, y }
          currentX += spouseSpacing
          positions[pair[1].id] = { x: currentX, y }
        } else {
          positions[pair[0].id] = { x: currentX, y }
        }
        if (idx < pairs.length - 1) currentX += nodeSpacing
      })
    }

    // 计算pair的子女平均x坐标（用于父辈排序）
    const getPairChildrenAvgX = (pair: FamilyMember[]): number => {
      const children = members.filter(
        (c) =>
          c.parentIds &&
          (c.parentIds.includes(pair[0].id) ||
            (pair[1] && c.parentIds.includes(pair[1].id)))
      )
      const validXs = children
        .map((c) => positions[c.id]?.x)
        .filter((x): x is number => x !== undefined)
      if (validXs.length === 0) return NaN
      return validXs.reduce((a, b) => a + b, 0) / validXs.length
    }

    // 计算pair的父母平均x坐标（用于子辈排序）
    const getPairParentsAvgX = (pair: FamilyMember[]): number => {
      const parentIds = pair[0].parentIds || []
      const parents = parentIds
        .map((pid) => memberMap.get(pid))
        .filter((p) => p && positions[p.id])
      if (parents.length === 0) return NaN
      return parents.reduce((sum, p) => sum + positions[p!.id].x, 0) / parents.length
    }

    // 第一步：初步排列所有层（按添加顺序）
    layerOrder.forEach((gen) => {
      layoutLayer(gen, getPairs(gen))
    })

    // 第二步：从 self 层向上重新排序（父辈按子女位置排列，祖辈按父辈位置排列）
    const selfIdx = layerOrder.indexOf('self')
    for (let i = selfIdx - 1; i >= 0; i--) {
      const gen = layerOrder[i]
      const pairs = getPairs(gen)
      pairs.sort((a, b) => {
        const ax = getPairChildrenAvgX(a)
        const bx = getPairChildrenAvgX(b)
        if (isNaN(ax) && isNaN(bx)) return 0
        if (isNaN(ax)) return 1
        if (isNaN(bx)) return -1
        return ax - bx
      })
      layoutLayer(gen, pairs)
    }

    // 第三步：从 self 层向下重新排序（子辈按父母位置排列，孙辈按子辈位置排列）
    for (let i = selfIdx + 1; i < layerOrder.length; i++) {
      const gen = layerOrder[i]
      const pairs = getPairs(gen)
      pairs.sort((a, b) => {
        const ax = getPairParentsAvgX(a)
        const bx = getPairParentsAvgX(b)
        if (isNaN(ax) && isNaN(bx)) return 0
        if (isNaN(ax)) return 1
        if (isNaN(bx)) return -1
        return ax - bx
      })
      layoutLayer(gen, pairs)
    }

    // === 3. 构建节点（男性=方形，女性=圆形，我=金色高亮） ===
    // 头像优先级：FamilyMember.avatar → 关联 Person.avatar
    const personMap = new Map(persons.map((p) => [p.id, p]))
    const nodes: any[] = members.map((m) => {
      const isMe = m.id === me?.id
      const pos = positions[m.id] || { x: 0, y: 0 }
      // 头像兜底：成员无头像时，取关联联系人的头像
      const avatar = m.avatar || (m.personId ? personMap.get(m.personId)?.avatar : undefined)
      const baseNode: any = {
        id: m.id,
        name: m.name,
        value: m,
        x: pos.x,
        y: pos.y,
        symbol: m.gender === 'female' ? 'circle' : 'rect',
        symbolSize: isMe ? 36 : 28,
        itemStyle: {
          color: isMe ? '#f59e0b' : m.gender === 'male' ? '#3b82f6' : '#ec4899',
          borderColor: isMe ? '#fbbf24' : 'transparent',
          borderWidth: isMe ? 3 : 0,
          shadowBlur: isMe ? 12 : 0,
          shadowColor: isMe ? 'rgba(245, 158, 11, 0.4)' : 'transparent',
        },
        label: {
          show: true,
          position: 'bottom',
          fontSize: isMe ? 13 : 11,
          fontWeight: isMe ? 'bold' : 'normal',
          color: isMe ? '#d97706' : '#374151',
          formatter: m.relation && m.relation !== '本人' ? `${m.name}\n${m.relation}` : m.name,
        },
        fixed: true,
        draggable: false,
      }
      // 有头像时用图片替代纯色形状
      if (avatar) {
        baseNode.symbol = `image://${avatar}`
        baseNode.symbolSize = isMe ? 40 : 32
        baseNode.itemStyle = {
          borderColor: isMe ? '#fbbf24' : (m.gender === 'male' ? '#3b82f6' : '#ec4899'),
          borderWidth: 2,
          shadowBlur: isMe ? 12 : 0,
          shadowColor: isMe ? 'rgba(245, 158, 11, 0.4)' : 'transparent',
        }
      }
      return baseNode
    })

    // === 4. 构建连线 ===
    // 使用隐形连接节点（junction nodes）+ links 组成折线，
    // 这样 roam 拖拽/缩放时连线会随节点一起移动
    const links: any[] = []
    const junctionNodes: any[] = []
    let junctionCounter = 0

    const createJunction = (x: number, y: number): string => {
      const id = `__j_${junctionCounter++}`
      junctionNodes.push({
        id,
        name: '',
        x,
        y,
        symbol: 'circle',
        symbolSize: 1,
        itemStyle: { color: 'transparent', opacity: 0 },
        label: { show: false },
        fixed: true,
        draggable: false,
      })
      return id
    }

    const childLineStyle = { color: '#94a3b8', width: 1.5, curveness: 0 }

    // --- a. 配偶线 ---
    const coupleSet = new Set<string>()
    members.forEach((m) => {
      if (m.spouseId && memberMap.has(m.spouseId)) {
        const key = [m.id, m.spouseId].sort().join('-')
        if (!coupleSet.has(key)) {
          coupleSet.add(key)
          const spouse = memberMap.get(m.spouseId)!
          // 任一方标记为未婚则视为未婚
          const isMarried = m.married !== false && spouse.married !== false
          links.push({
            source: m.id,
            target: m.spouseId,
            lineStyle: {
              color: isMarried ? '#f43f5e' : '#94a3b8',
              width: 2,
              type: isMarried ? 'dashed' : 'solid',
              curveness: 0,
            },
            label: isMarried
              ? {
                  show: true,
                  formatter: '婚',
                  fontSize: 9,
                  color: '#f43f5e',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  padding: [1, 3],
                  borderRadius: 2,
                }
              : { show: false },
          })
        }
      }
    })

    // --- b. 父母-子女线（折线：中点向下 → 水平分叉 → 向下到子女） ---
    // 智能查找子女：先找夫妻对，从夫妻中点引线到所有包含任一配偶的孩子
    // 单亲（无配偶）的孩子直接从父母引线
    const assignedChildren = new Set<string>() // 已分配的子女，避免重复
    const childGroups: { parents: string[]; children: string[] }[] = []

    // a) 先处理夫妻对
    const processedCouples = new Set<string>()
    members.forEach((m) => {
      if (m.spouseId && memberMap.has(m.spouseId)) {
        const key = [m.id, m.spouseId].sort().join('-')
        if (!processedCouples.has(key)) {
          processedCouples.add(key)
          const spouse = memberMap.get(m.spouseId)!
          // 找到所有包含任一配偶的孩子
          const children = members.filter((c) => {
            if (assignedChildren.has(c.id)) return false
            if (!c.parentIds || c.parentIds.length === 0) return false
            return c.parentIds.includes(m.id) || c.parentIds.includes(spouse.id)
          })
          if (children.length > 0) {
            children.forEach((c) => assignedChildren.add(c.id))
            childGroups.push({ parents: [m.id, spouse.id], children: children.map((c) => c.id) })
          }
        }
      }
    })

    // b) 再处理单亲（无配偶或配偶不在成员中的）
    members.forEach((m) => {
      if (m.spouseId && memberMap.has(m.spouseId)) return // 已在夫妻对中处理
      const children = members.filter((c) => {
        if (assignedChildren.has(c.id)) return false
        if (!c.parentIds || c.parentIds.length === 0) return false
        return c.parentIds.includes(m.id)
      })
      if (children.length > 0) {
        children.forEach((c) => assignedChildren.add(c.id))
        childGroups.push({ parents: [m.id], children: children.map((c) => c.id) })
      }
    })

    childGroups.forEach(({ parents, children }) => {
      if (children.length === 0) return

      // 计算父母中点
      let midX: number, parentY: number
      if (parents.length >= 2) {
        const p1 = positions[parents[0]]
        const p2 = positions[parents[1]]
        midX = (p1.x + p2.x) / 2
        parentY = (p1.y + p2.y) / 2
      } else {
        const p1 = positions[parents[0]]
        midX = p1.x
        parentY = p1.y
      }

      const childY = positions[children[0]].y
      const midY = (parentY + childY) / 2
      const N = children.length

      // 主干顶部：双亲用中点连接点，单亲直接用父母节点
      const trunkTopId =
        parents.length >= 2 ? createJunction(midX, parentY) : parents[0]

      // 创建分支点（i/(N+1) 处，i=1..N）
      const branchIds: string[] = []
      for (let i = 1; i <= N; i++) {
        const branchY = parentY + (midY - parentY) * (i / (N + 1))
        branchIds.push(createJunction(midX, branchY))
      }

      // 主干连线：trunkTop → branch1 → branch2 → ... → branchN
      let prevId = trunkTopId
      for (const branchId of branchIds) {
        links.push({ source: prevId, target: branchId, lineStyle: childLineStyle })
        prevId = branchId
      }

      // 每个子女的分支：branch_i → 水平到子女x → 垂直向下到子女
      children.forEach((childId, idx) => {
        const branchId = branchIds[idx]
        const childPos = positions[childId]
        const branchY = parentY + (midY - parentY) * ((idx + 1) / (N + 1))

        // 水平线到子女 x 坐标
        const cornerId = createJunction(childPos.x, branchY)
        links.push({ source: branchId, target: cornerId, lineStyle: childLineStyle })
        // 垂直线向下到子女
        links.push({ source: cornerId, target: childId, lineStyle: childLineStyle })
      })
    })

    const allNodes = [...nodes, ...junctionNodes]

    const option: echarts.EChartsCoreOption = {
      tooltip: tooltipConfig,
      series: [
        {
          type: 'graph',
          layout: 'none',
          data: allNodes,
          links,
          roam: 'move', // 仅允许平移拖拽，缩放交给按钮控制，避免双指误操作
          draggable: false, // 节点不可拖拽
          scaleLimit: { min: 0.5, max: 3 },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3,
            },
          },
          lineStyle: {
            color: '#94a3b8',
            width: 1.5,
            curveness: 0,
          },
        },
      ],
    }

    chart.setOption(option)
  }

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleAddMember = async (data: Omit<FamilyMember, 'id' | 'createdAt'>) => {
    const member: FamilyMember = {
      ...data,
      id: generateId(),
      createdAt: Date.now(),
    }
    await familyDB.add(member)
    // 同步配偶关系：双向绑定
    if (member.spouseId) {
      const spouse = await familyDB.getById(member.spouseId)
      if (spouse && spouse.spouseId !== member.id) {
        await familyDB.update({ ...spouse, spouseId: member.id, married: member.married })
      }
    }
    setShowAdd(false)
    loadMembers()
  }

  const handleUpdateMember = async (member: FamilyMember | Omit<FamilyMember, 'id' | 'createdAt'>) => {
    if ('id' in member) {
      // 获取旧数据，检查配偶是否变更
      const oldMember = await familyDB.getById(member.id)
      const oldSpouseId = oldMember?.spouseId
      const newSpouseId = member.spouseId

      await familyDB.update(member)

      // 配偶变更同步
      if (oldSpouseId !== newSpouseId) {
        // 旧配偶解除关系
        if (oldSpouseId) {
          const oldSpouse = await familyDB.getById(oldSpouseId)
          if (oldSpouse && oldSpouse.spouseId === member.id) {
            await familyDB.update({ ...oldSpouse, spouseId: undefined })
          }
        }
        // 新配偶双向绑定
        if (newSpouseId) {
          const newSpouse = await familyDB.getById(newSpouseId)
          if (newSpouse && newSpouse.spouseId !== member.id) {
            await familyDB.update({ ...newSpouse, spouseId: member.id, married: member.married })
          }
        }
      } else if (newSpouseId) {
        // 配偶未变但 married 状态可能变了，同步 married
        const spouse = await familyDB.getById(newSpouseId)
        if (spouse && spouse.married !== member.married) {
          await familyDB.update({ ...spouse, married: member.married })
        }
      }

      setEditingMember(null)
      setSelectedMember(null)
      loadMembers()
    }
  }

  const handleDeleteMember = async (id: string) => {
    await familyDB.remove(id)
    setSelectedMember(null)
    loadMembers()
  }

  // 导出家族树为图片
  const handleExportImage = async () => {
    if (!chartInstance.current) return
    try {
      const url = chartInstance.current.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      })
      await exportChartImage(url, '家族树')
    } catch (e) {
      alert(t('family.graphExportFail') + (e as Error).message)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('family.title')}
        subtitle={t('family.subtitle', { n: members.length })}
        right={
          <div className="flex gap-2">
            <button
              onClick={handleExportImage}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
              title={t('family.exportImage')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        }
      />

      {/* 图例 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-blue-500" style={{ borderRadius: 2 }} />
            <span className="text-xs text-gray-500">{t('family.legendMale')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-pink-500" />
            <span className="text-xs text-gray-500">{t('family.legendFemale')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-amber-500" style={{ borderRadius: 2, outline: '2px solid #fbbf24' }} />
            <span className="text-xs text-gray-500">{t('family.legendMe')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0 border-t-2 border-dashed border-rose-500" />
            <span className="text-xs text-gray-500">{t('family.legendCouple')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0 border-t-2 border-slate-400" />
            <span className="text-xs text-gray-500">{t('family.legendParentChild')}</span>
          </div>
        </div>
      </div>

      {/* 家谱图 */}
      <div className="flex-1 relative bg-white">
        {members.length === 0 ? (
          <EmptyState
            icon="🌳"
            title={t('family.noMembers')}
            description={t('family.noMembersDesc')}
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

      {/* 添加成员 */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('family.addMember')}>
        <FamilyMemberForm
          members={members}
          onSubmit={handleAddMember}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>

      {/* 编辑成员 */}
      <Modal open={!!editingMember} onClose={() => setEditingMember(null)} title={t('family.editMember')}>
        {editingMember && (
          <FamilyMemberForm
            member={editingMember}
            members={members}
            onSubmit={handleUpdateMember}
            onCancel={() => setEditingMember(null)}
          />
        )}
      </Modal>

      {/* 成员详情 */}
      {selectedMember && (
        <div className="absolute inset-0 z-40 flex items-end" onClick={() => setSelectedMember(null)}>
          <div className="absolute inset-0 bg-black bg-opacity-20" />
          <div
            className="relative w-full bg-white rounded-t-2xl p-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              {selectedMember.avatar ? (
                <img
                  src={selectedMember.avatar}
                  alt={selectedMember.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ${
                    selectedMember.gender === 'male' ? 'bg-blue-500' :
                    selectedMember.gender === 'female' ? 'bg-pink-500' : 'bg-purple-500'
                  }`}
                >
                  {selectedMember.name.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{selectedMember.name}</h3>
                <p className="text-xs text-gray-500">
                  {selectedMember.relation} · {GENERATION_LABELS[selectedMember.generation]}
                </p>
              </div>
            </div>
            {selectedMember.birthday && (
              <div className="text-sm text-gray-600 mb-1">🎂 {selectedMember.birthday}</div>
            )}
            {selectedMember.note && (
              <div className="text-sm text-gray-600 mb-1">📝 {selectedMember.note}</div>
            )}

            {/* 照片墙入口 */}
            <button
              onClick={() => setShowPhotoWall(true)}
              className="w-full mt-2 mb-2 p-2.5 bg-gray-50 rounded-lg flex items-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <span className="text-base">🖼️</span>
              <span className="text-sm font-medium text-gray-700 flex-1 text-left">
                {t('photo.wall')}
              </span>
              <span className="text-xs text-gray-400">{t('photo.count', { n: photos.length })}</span>
              <span className="text-xs text-gray-300">
                {selectedMember.personId ? '🔗' : '📌'}
              </span>
            </button>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setEditingMember(selectedMember)}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
              >
                {t('common.edit')}
              </button>
              {!selectedMember.isMe && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium"
                >
                  {t('common.delete')}
                </button>
              )}
              <button
                onClick={() => setSelectedMember(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t('family.deleteMember')}
        message={selectedMember ? t('family.deleteConfirm', { name: selectedMember.name }) : ''}
        confirmText={t('family.deleteBtn')}
        type="danger"
        onConfirm={() => {
          if (selectedMember) {
            handleDeleteMember(selectedMember.id)
          }
          setShowDeleteConfirm(false)
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* 照片墙弹窗 */}
      <Modal
        open={showPhotoWall}
        onClose={() => setShowPhotoWall(false)}
        title={t('photo.wallTitle', { name: selectedMember?.name || '' })}
      >
        {selectedMember && (
          <PhotoWall
            ownerId={getPhotoOwnerId(selectedMember)}
            photos={photos}
            onRefresh={loadPhotos}
          />
        )}
      </Modal>
    </div>
  )
}

function FamilyMemberForm({
  member,
  members,
  onSubmit,
  onCancel,
}: {
  member?: FamilyMember
  members: FamilyMember[]
  onSubmit: (data: Omit<FamilyMember, 'id' | 'createdAt'> | FamilyMember) => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const [familyPersons, setFamilyPersons] = useState<Person[]>([])
  const [selectedPersonId, setSelectedPersonId] = useState<string>(member?.personId || '')
  const [name, setName] = useState(member?.name || '')
  const [gender, setGender] = useState<Gender>(member?.gender || 'unknown')
  const [generation, setGeneration] = useState<Generation>(member?.generation || 'self')
  const [relation, setRelation] = useState(member?.relation || '')
  const [avatar, setAvatar] = useState<string | undefined>(member?.avatar)
  const [birthday, setBirthday] = useState(member?.birthday || '')
  const [note, setNote] = useState(member?.note || '')
  const [parentIds, setParentIds] = useState<string[]>(member?.parentIds || [])
  const [spouseId, setSpouseId] = useState<string>(member?.spouseId || '')
  const [married, setMarried] = useState<boolean>(member?.married ?? true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 加载分组为"家人"的联系人
  useEffect(() => {
    personDB.getAll().then((all: Person[]) => {
      const family = all.filter((p) => p.customGroupLabel === '家人' && !p.isMe)
      setFamilyPersons(family)
    })
  }, [])

  // 选择联系人时自动填充信息
  const handleSelectPerson = (personId: string) => {
    setSelectedPersonId(personId)
    if (!personId) {
      // 清空选择时不清空已填写的字段，让用户保留手动输入
      return
    }
    const person = familyPersons.find((p) => p.id === personId)
    if (person) {
      setName(person.name)
      setGender(person.gender)
      setAvatar(person.avatar)
      setBirthday(person.birthday || '')
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      // 使用 react-image-file-resizer 压缩：400x400, JPEG 70%
      const compressed = await compressImage(file, 400, 400, 70)
      setAvatar(compressed)
    } catch (err) {
      alert(t('family.imageFail'))
    }
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      alert(t('family.inputName'))
      return
    }
    if (!relation.trim()) {
      alert(t('family.inputRelation'))
      return
    }

    const data = {
      personId: selectedPersonId || undefined,
      name: name.trim(),
      gender,
      generation,
      relation: relation.trim(),
      avatar,
      birthday: birthday || undefined,
      note: note.trim() || undefined,
      parentIds: parentIds.filter(Boolean),
      spouseId: spouseId || undefined,
      married: spouseId ? married : true,
    }

    if (member) {
      onSubmit({ ...member, ...data })
    } else {
      onSubmit(data)
    }
  }

  const generationOptions: { value: Generation; label: string }[] = [
    { value: 'grandparent', label: t('family.genGrandparent') },
    { value: 'parent', label: t('family.genParent') },
    { value: 'self', label: t('family.genSelf') },
    { value: 'child', label: t('family.genChild') },
    { value: 'grandchild', label: t('family.genGrandchild') },
  ]

  return (
    <div className="space-y-4">
      {/* 从联系人中选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('family.selectFromContacts')}</label>
        <select
          value={selectedPersonId}
          onChange={(e) => handleSelectPerson(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        >
          <option value="">{t('family.noLink')}</option>
          {familyPersons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.birthday ? ` (${p.birthday})` : ''}
            </option>
          ))}
        </select>
        {familyPersons.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">{t('family.noFamilyContacts')}</p>
        )}
      </div>

      {/* 头像 */}
      <div className="flex flex-col items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-blue-400 transition-colors"
        >
          {avatar ? (
            <img src={avatar} alt="头像" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-xs mt-0.5">{t('family.uploadAvatar')}</span>
            </div>
          )}
        </button>
        {avatar && (
          <button
            type="button"
            onClick={() => setAvatar(undefined)}
            className="text-xs text-red-500 hover:text-red-600"
          >
            {t('family.removeAvatar')}
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('family.name')} *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('family.namePlaceholder')}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('family.relation')} *</label>
        <input
          type="text"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder={t('family.relationPlaceholder')}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.gender')}</label>
        <div className="flex gap-2">
          {([
            { value: 'male', label: t('common.male') },
            { value: 'female', label: t('common.female') },
            { value: 'unknown', label: t('common.unknown') },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGender(opt.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                gender === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t('family.generation')}</label>
        <div className="flex flex-wrap gap-2">
          {generationOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGeneration(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                generation === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('family.birthday')}</label>
        <input
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('family.parents')}</label>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {members.filter((m) => m.id !== member?.id).length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">{t('family.noMembersToSelect')}</div>
          ) : (
            <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
              {members
                .filter((m) => m.id !== member?.id)
                .map((m) => {
                  const checked = parentIds.includes(m.id)
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => {
                        setParentIds((prev) =>
                          prev.includes(m.id)
                            ? prev.filter((id) => id !== m.id)
                            : [...prev, m.id]
                        )
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                        checked ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      <span>{m.name} ({m.relation})</span>
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                          checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                        }`}
                      >
                        {checked && (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    </button>
                  )
                })}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('family.parentsTip')}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('family.spouse')}</label>
        <select
          value={spouseId}
          onChange={(e) => setSpouseId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        >
          <option value="">{t('common.none')}</option>
          {members
            .filter((m) => m.id !== member?.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.relation})
              </option>
            ))}
        </select>
        {spouseId && (
          <div className="mt-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('family.married')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMarried(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  married
                    ? 'border-rose-500 bg-rose-50 text-rose-600'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {t('family.marriedYes')}
              </button>
              <button
                type="button"
                onClick={() => setMarried(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  !married
                    ? 'border-gray-500 bg-gray-50 text-gray-700'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {t('family.marriedNo')}
              </button>
            </div>
            {!married && (
              <p className="text-xs text-gray-400 mt-1">{t('family.unmarriedTip')}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('family.note')}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('family.notePlaceholder')}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium"
        >
          {member ? t('common.save') : t('common.add')}
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
