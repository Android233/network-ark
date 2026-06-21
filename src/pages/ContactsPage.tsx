import { useState, useEffect, useMemo, useRef } from 'react'
import { useLanguage } from '../utils/i18n'
import type { Person, GroupType, Gender } from '../types'
import { personDB, relationDB, generateId } from '../utils/db'
import { parseCSV, parseVCard, importPersons } from '../utils/sampleData'
import { getPinyinInitial } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import PersonDetail from '../components/PersonDetail'
import PersonForm from '../components/PersonForm'

type FilterGroup = GroupType | 'all'

export default function ContactsPage() {
  const { t } = useLanguage()
  const [persons, setPersons] = useState<Person[]>([])
  const [filter, setFilter] = useState<FilterGroup>('all')
  const [genderFilter, setGenderFilter] = useState<'all' | Gender>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importMode, setImportMode] = useState<'choice' | 'vcard' | 'csv'>('choice')
  const [importMsg, setImportMsg] = useState<string>('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [activeLetter, setActiveLetter] = useState<string>('')
  const [draggingLetter, setDraggingLetter] = useState<string>('')
  const listRef = useRef<HTMLDivElement>(null)
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const letterIndexRef = useRef<HTMLDivElement | null>(null)
  const isDraggingRef = useRef(false)

  // 批量操作相关状态
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchGroup, setShowBatchGroup] = useState(false)
  const [showBatchTags, setShowBatchTags] = useState(false)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [batchGroupValue, setBatchGroupValue] = useState('')
  const [batchTagInput, setBatchTagInput] = useState('')
  const [batchTagMode, setBatchTagMode] = useState<'add' | 'remove'>('add')

  // 虚拟列表相关状态
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const ITEM_HEADER_HEIGHT = 28
  const ITEM_ROW_HEIGHT = 68
  const VIRTUAL_BUFFER = 5
  const VIRTUAL_THRESHOLD = 100 // 超过此数量启用虚拟列表

  const loadPersons = async () => {
    const data = await personDB.getAll()
    // "我"始终置顶
    setPersons(data.sort((a, b) => {
      if (a.isMe) return -1
      if (b.isMe) return 1
      return a.name.localeCompare(b.name)
    }))
  }

  useEffect(() => {
    loadPersons()
  }, [])

  // 监听列表容器尺寸变化（虚拟列表需要知道视口高度）
  useEffect(() => {
    if (!listRef.current) return
    const updateHeight = () => {
      if (listRef.current) setViewportHeight(listRef.current.clientHeight)
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [])

  const filteredPersons = useMemo(() => {
    let result = persons
    if (filter !== 'all') {
      result = result.filter((p) => p.isMe || p.customGroupLabel === filter)
    }
    if (genderFilter !== 'all') {
      result = result.filter((p) => p.isMe || p.gender === genderFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.phone?.includes(search) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return result
  }, [persons, filter, genderFilter, search])

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = { all: persons.length }
    for (const p of persons) {
      if (p.isMe) continue
      const key = p.customGroupLabel || '未分组'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [persons])

  const handleAddPerson = async (person: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (person.isMe) {
      person.isMe = false
    }
    const now = Date.now()
    const newPerson: Person = {
      ...person,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    await personDB.add(newPerson)

    // 自动创建与"我"的关系，连线文字为分组名
    const me = persons.find((p) => p.isMe)
    if (me) {
      await relationDB.add({
        id: generateId(),
        fromId: me.id,
        toId: newPerson.id,
        type: 'partner',
        note: person.customGroupLabel || '联系人',
      })
    }

    setShowAdd(false)
    loadPersons()
  }

  const handleUpdatePerson = async (person: Person | Omit<Person, 'id' | 'createdAt' | 'updatedAt'>) => {
    if ('id' in person) {
      await personDB.update({ ...person, updatedAt: Date.now() })
      setEditingPerson(null)
      setSelectedPerson(null)
      loadPersons()
    }
  }

  const handleDeletePerson = async (id: string) => {
    await personDB.remove(id)
    setSelectedPerson(null)
    loadPersons()
  }

  // 进入/退出批量模式
  const enterBatchMode = () => {
    setBatchMode(true)
    setSelectedIds(new Set())
  }
  const exitBatchMode = () => {
    setBatchMode(false)
    setSelectedIds(new Set())
  }

  // 切换单个选中
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 全选/取消全选（仅当前过滤后可见的联系人，排除"我"）
  const selectAllVisible = () => {
    const visible = filteredPersons.filter((p) => !p.isMe).map((p) => p.id)
    setSelectedIds(new Set(visible))
  }
  const clearSelection = () => setSelectedIds(new Set())

  // 批量修改分组
  const handleBatchUpdateGroup = async () => {
    const label = batchGroupValue.trim()
    if (!label) return
    const now = Date.now()
    for (const id of selectedIds) {
      const p = await personDB.getById(id)
      if (p) {
        await personDB.update({ ...p, customGroupLabel: label, updatedAt: now })
      }
    }
    setShowBatchGroup(false)
    setBatchGroupValue('')
    exitBatchMode()
    loadPersons()
  }

  // 批量打标签（添加/移除）
  const handleBatchUpdateTags = async () => {
    const tags = batchTagInput
      .split(/[、,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (tags.length === 0) return
    const now = Date.now()
    for (const id of selectedIds) {
      const p = await personDB.getById(id)
      if (!p) continue
      let newTags: string[]
      if (batchTagMode === 'add') {
        newTags = Array.from(new Set([...p.tags, ...tags]))
      } else {
        newTags = p.tags.filter((t) => !tags.includes(t))
      }
      await personDB.update({ ...p, tags: newTags, updatedAt: now })
    }
    setShowBatchTags(false)
    setBatchTagInput('')
    exitBatchMode()
    loadPersons()
  }

  // 批量删除
  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await personDB.remove(id)
      // 同时清理相关关系
      const rels = await relationDB.getAll()
      for (const r of rels) {
        if (r.fromId === id || r.toId === id) {
          await relationDB.remove(r.id)
        }
      }
    }
    setShowBatchDelete(false)
    exitBatchMode()
    loadPersons()
  }

  const handleImportCSV = async (text: string) => {
    const parsed = parseCSV(text)
    if (parsed.length === 0) {
      setImportMsg('CSV 格式错误或无数据，请检查表头是否包含「姓名」字段。')
      return
    }
    setImporting(true)
    try {
      const count = await importPersons(parsed)
      setImporting(false)
      setShowImport(false)
      setImportMode('choice')
      setImportMsg(`成功导入 ${count} 个联系人`)
      loadPersons()
    } catch (e) {
      setImporting(false)
      setImportMsg('导入失败：' + (e as Error).message)
    }
  }

  const handleImportVCard = async (file: File) => {
    if (!file) return
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.vcf') && !lowerName.endsWith('.vcard')) {
      setImportMsg('请选择 .vcf 或 .vcard 格式的文件')
      return
    }
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = parseVCard(text)
      if (parsed.length === 0) {
        setImporting(false)
        setImportMsg('未在文件中解析到任何联系人，请确认文件为标准 vCard 格式。')
        return
      }
      const count = await importPersons(parsed)
      setImporting(false)
      setShowImport(false)
      setImportMode('choice')
      setImportMsg(`成功导入 ${count} 个联系人`)
      loadPersons()
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e) {
      setImporting(false)
      setImportMsg('导入失败：' + (e as Error).message)
    }
  }

  const closeImport = () => {
    if (importing) return
    setShowImport(false)
    setImportMode('choice')
  }

  // 动态构建筛选标签（纯自定义分组）
  const customGroups = useMemo(() => {
    const groups = new Set<string>()
    persons.forEach((p) => {
      if (p.customGroupLabel) groups.add(p.customGroupLabel)
    })
    return Array.from(groups).sort()
  }, [persons])

  const filterTabs: { key: FilterGroup; label: string }[] = [
    { key: 'all', label: '全部' },
    ...customGroups.map((g) => ({ key: g as FilterGroup, label: g })),
  ]

  // 按首字母分组
  const groupedPersons = useMemo(() => {
    const groups: Record<string, Person[]> = {}
    // "我"单独放最前面
    const me = filteredPersons.find((p) => p.isMe)
    const others = filteredPersons.filter((p) => !p.isMe)

    if (me) {
      groups['★'] = [me]
    }

    others.forEach((p) => {
      const letter = getPinyinInitial(p.name)
      if (!groups[letter]) groups[letter] = []
      groups[letter].push(p)
    })

    // 排序：★ 最前，然后 A-Z，# 最后
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === '★') return -1
      if (b === '★') return 1
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })

    return sortedKeys.map((key) => ({ letter: key, persons: groups[key] }))
  }, [filteredPersons])

  const letters = groupedPersons.map((g) => g.letter)

  // 扁平化分组数据用于虚拟列表（含每项的位置和高度）
  const flatItems = useMemo(() => {
    const items: Array<{
      type: 'header' | 'row'
      key: string
      height: number
      offset: number
      letter?: string
      person?: Person
    }> = []
    let offset = 0
    for (const group of groupedPersons) {
      items.push({
        type: 'header',
        key: `header-${group.letter}`,
        height: ITEM_HEADER_HEIGHT,
        offset,
        letter: group.letter,
      })
      offset += ITEM_HEADER_HEIGHT
      for (const person of group.persons) {
        items.push({
          type: 'row',
          key: person.id,
          height: ITEM_ROW_HEIGHT,
          offset,
          person,
        })
        offset += ITEM_ROW_HEIGHT
      }
    }
    return items
  }, [groupedPersons])

  const totalListHeight = flatItems.length > 0
    ? flatItems[flatItems.length - 1].offset + flatItems[flatItems.length - 1].height
    : 0

  // 是否启用虚拟列表
  const useVirtual = filteredPersons.length > VIRTUAL_THRESHOLD

  // 计算可见范围
  const visibleRange = useMemo(() => {
    if (!useVirtual) return { start: 0, end: flatItems.length }
    const startIdx = flatItems.findIndex((item) => item.offset + item.height > scrollTop)
    const safeStart = Math.max(0, startIdx - VIRTUAL_BUFFER)
    const endIdx = flatItems.findIndex(
      (item) => item.offset > scrollTop + viewportHeight
    )
    const safeEnd = endIdx === -1 ? flatItems.length : endIdx + VIRTUAL_BUFFER
    return { start: safeStart, end: Math.min(safeEnd, flatItems.length) }
  }, [flatItems, scrollTop, viewportHeight, useVirtual])

  const visibleItems = useVirtual ? flatItems.slice(visibleRange.start, visibleRange.end) : flatItems
  const virtualPaddingTop = useVirtual
    ? (visibleItems[0]?.offset || 0)
    : 0

  const scrollToLetter = (letter: string) => {
    setActiveLetter(letter)
    if (isDraggingRef.current) {
      setDraggingLetter(letter)
    }
    if (useVirtual && listRef.current) {
      // 虚拟列表模式：通过偏移量直接滚动
      const targetItem = flatItems.find((item) => item.type === 'header' && item.letter === letter)
      if (targetItem) {
        listRef.current.scrollTo({ top: targetItem.offset, behavior: 'smooth' })
      }
    } else {
      const el = letterRefs.current[letter]
      if (el && listRef.current) {
        listRef.current.scrollTo({ top: el.offsetTop - listRef.current.offsetTop, behavior: 'smooth' })
      }
    }
  }

  // 根据触摸/鼠标 Y 坐标计算对应的字母
  const getLetterAtY = (clientY: number): string | null => {
    const container = letterIndexRef.current
    if (!container) return null
    const rect = container.getBoundingClientRect()
    const y = clientY - rect.top
    if (y < 0 || y > rect.height) return null
    // 按比例计算字母索引
    const letterHeight = rect.height / letters.length
    const idx = Math.floor(y / letterHeight)
    if (idx >= 0 && idx < letters.length) {
      return letters[idx]
    }
    return null
  }

  // 触摸事件
  const handleLetterTouchStart = (e: React.TouchEvent) => {
    isDraggingRef.current = true
    const touch = e.touches[0]
    const letter = getLetterAtY(touch.clientY)
    if (letter) {
      setDraggingLetter(letter)
      scrollToLetter(letter)
    }
  }

  const handleLetterTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return
    e.preventDefault()
    const touch = e.touches[0]
    const letter = getLetterAtY(touch.clientY)
    if (letter) {
      setDraggingLetter(letter)
      scrollToLetter(letter)
    }
  }

  const handleLetterTouchEnd = () => {
    isDraggingRef.current = false
    setDraggingLetter('')
  }

  // 鼠标事件（PC 端支持）
  const handleLetterMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true
    const letter = getLetterAtY(e.clientY)
    if (letter) {
      setDraggingLetter(letter)
      scrollToLetter(letter)
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      const l = getLetterAtY(ev.clientY)
      if (l) {
        setDraggingLetter(l)
        scrollToLetter(l)
      }
    }
    const handleMouseUp = () => {
      isDraggingRef.current = false
      setDraggingLetter('')
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('contacts.title')}
        subtitle={t('contacts.subtitle', { n: persons.length })}
        right={
          <div className="flex gap-2">
            {!batchMode ? (
              <>
                <button
                  onClick={enterBatchMode}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                  title={t('contacts.batchMode')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowImport(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
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
              </>
            ) : (
              <button
                onClick={exitBatchMode}
                className="px-3 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>
        }
      />

      {/* 搜索栏 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('contacts.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 rounded-lg border border-gray-100 focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* 筛选区 - 第一行：标签筛选 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-50">
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.label}
              <span className={filter === tab.key ? 'text-blue-200' : 'text-gray-400'}>
                {groupCounts[tab.key] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 筛选区 - 第二行：性别筛选 */}
      <div className="flex-shrink-0 px-4 py-1.5 bg-white border-b border-gray-100">
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-400 mr-1">{t('common.gender')}</span>
          {([
            { key: 'all' as const, label: t('common.all') },
            { key: 'male' as const, label: t('common.male') },
            { key: 'female' as const, label: t('common.female') },
            { key: 'unknown' as const, label: t('common.unknown') },
          ]).map((g) => (
            <button
              key={g.key}
              onClick={() => setGenderFilter(g.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                genderFilter === g.key
                  ? 'bg-blue-100 text-blue-600'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* 联系人列表 + 字母索引 */}
      <div className="flex-1 flex overflow-hidden">
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto"
          onScroll={(e) => {
            if (useVirtual) {
              const target = e.currentTarget
              setScrollTop(target.scrollTop)
            }
          }}
        >
          {filteredPersons.length === 0 ? (
            <EmptyState
              icon="👥"
              title={t('contacts.noContacts')}
              description={t('contacts.noContactsDesc')}
            />
          ) : useVirtual ? (
            /* 虚拟列表模式：只渲染可见项 */
            <div style={{ height: totalListHeight, position: 'relative' }}>
              <div style={{ transform: `translateY(${virtualPaddingTop}px)` }}>
                {visibleItems.map((item) => {
                  if (item.type === 'header') {
                    return (
                      <div
                        key={item.key}
                        style={{ height: ITEM_HEADER_HEIGHT }}
                        className="sticky top-0 px-4 py-1 bg-gray-50 text-xs font-medium text-gray-400 z-10"
                      >
                        {item.letter === '★' ? t('contacts.myCard') : item.letter}
                      </div>
                    )
                  }
                  const person = item.person!
                  const isSelected = selectedIds.has(person.id)
                  const isSelectable = batchMode && !person.isMe
                  return (
                    <button
                      key={item.key}
                      style={{ height: ITEM_ROW_HEIGHT }}
                      onClick={() => {
                        if (isSelectable) {
                          toggleSelect(person.id)
                        } else {
                          setSelectedPerson(person)
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left ${
                        person.isMe ? 'bg-amber-50' : ''
                      } ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      {batchMode && (
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            person.isMe
                              ? 'border-gray-200 bg-gray-100 opacity-50'
                              : isSelected
                              ? 'border-blue-600 bg-blue-600'
                              : 'border-gray-300'
                          }`}
                        >
                          {isSelected && !person.isMe && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      <Avatar name={person.name} size={44} avatar={person.avatar} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">{person.name}</span>
                          {person.isMe && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-200 text-amber-700 rounded font-medium">
                              {t('common.me')}
                            </span>
                          )}
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              color: '#8b5cf6',
                              backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            }}
                          >
                            {person.customGroupLabel || t('common.ungrouped')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {person.phone && (
                            <span className="text-xs text-gray-400">{person.phone}</span>
                          )}
                          {person.tags.length > 0 && (
                            <span className="text-xs text-gray-400 truncate">
                              · {person.tags.join('、')}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* 普通模式：渲染所有分组（少量数据时开销更低） */
            groupedPersons.map((group) => (
              <div key={group.letter} ref={(el) => { letterRefs.current[group.letter] = el }}>
                {/* 字母分组标题 */}
                <div className="sticky top-0 px-4 py-1 bg-gray-50 text-xs font-medium text-gray-400 z-10">
                  {group.letter === '★' ? t('contacts.myCard') : group.letter}
                </div>
                {/* 联系人列表 */}
                <div className="divide-y divide-gray-50">
                  {group.persons.map((person) => {
                    const isSelected = selectedIds.has(person.id)
                    const isSelectable = batchMode && !person.isMe
                    return (
                      <button
                        key={person.id}
                        onClick={() => {
                          if (isSelectable) {
                            toggleSelect(person.id)
                          } else {
                            setSelectedPerson(person)
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left ${
                          person.isMe ? 'bg-amber-50' : ''
                        } ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        {batchMode && (
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              person.isMe
                                ? 'border-gray-200 bg-gray-100 opacity-50'
                                : isSelected
                                ? 'border-blue-600 bg-blue-600'
                                : 'border-gray-300'
                            }`}
                          >
                            {isSelected && !person.isMe && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        )}
                        <Avatar name={person.name} size={44} avatar={person.avatar} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 truncate">{person.name}</span>
                            {person.isMe && (
                              <span className="text-xs px-1.5 py-0.5 bg-amber-200 text-amber-700 rounded font-medium">
                                {t('common.me')}
                              </span>
                            )}
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                color: '#8b5cf6',
                                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                              }}
                            >
                              {person.customGroupLabel || t('common.ungrouped')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {person.phone && (
                              <span className="text-xs text-gray-400">{person.phone}</span>
                            )}
                            {person.tags.length > 0 && (
                              <span className="text-xs text-gray-400 truncate">
                                · {person.tags.join('、')}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 右侧字母索引 - 支持长按拖动选择 */}
        {letters.length > 1 && (
          <div
            ref={letterIndexRef}
            className="flex-shrink-0 w-6 flex flex-col items-center justify-center py-2 bg-white/80 touch-none select-none"
            onTouchStart={handleLetterTouchStart}
            onTouchMove={handleLetterTouchMove}
            onTouchEnd={handleLetterTouchEnd}
            onMouseDown={handleLetterMouseDown}
          >
            {letters.map((letter) => (
              <button
                key={letter}
                data-letter={letter}
                onClick={() => scrollToLetter(letter)}
                className={`text-[10px] font-medium leading-tight py-0.5 transition-colors pointer-events-none ${
                  activeLetter === letter ? 'text-blue-600 scale-125' : 'text-gray-400'
                }`}
              >
                {letter === '★' ? '★' : letter}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 拖动字母索引时的超大字母提示 */}
      {draggingLetter && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none">
          <div className="w-24 h-24 rounded-3xl bg-blue-600/90 backdrop-blur-sm flex items-center justify-center shadow-2xl animate-scale-in">
            <span className="text-5xl font-bold text-white">
              {draggingLetter === '★' ? '★' : draggingLetter}
            </span>
          </div>
        </div>
      )}

      {/* 批量操作底部工具栏 */}
      {batchMode && (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 shadow-lg">
          {/* 顶部选择控制行 */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-xs text-gray-500">
              {t('contacts.selected', { n: selectedIds.size })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAllVisible}
                className="text-xs text-blue-600 hover:underline"
              >
                {t('contacts.selectAll')}
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
                className="text-xs text-gray-500 hover:underline disabled:opacity-40"
              >
                {t('contacts.clearAll')}
              </button>
            </div>
          </div>
          {/* 操作按钮行 */}
          <div className="flex gap-2 px-4 py-3">
            <button
              onClick={() => setShowBatchGroup(true)}
              disabled={selectedIds.size === 0}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 disabled:opacity-40 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-[11px] font-medium">{t('contacts.batchGroup')}</span>
            </button>
            <button
              onClick={() => setShowBatchTags(true)}
              disabled={selectedIds.size === 0}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-40 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span className="text-[11px] font-medium">{t('contacts.batchTag')}</span>
            </button>
            <button
              onClick={() => setShowBatchDelete(true)}
              disabled={selectedIds.size === 0}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="text-[11px] font-medium">{t('contacts.batchDelete')}</span>
            </button>
          </div>
        </div>
      )}

      {/* 添加联系人 */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('contacts.addContact')}>
        <PersonForm onSubmit={handleAddPerson} onCancel={() => setShowAdd(false)} />
      </Modal>

      {/* 编辑联系人 */}
      <Modal open={!!editingPerson} onClose={() => setEditingPerson(null)} title={t('contacts.editContact')}>
        {editingPerson && (
          <PersonForm
            person={editingPerson}
            onSubmit={handleUpdatePerson}
            onCancel={() => setEditingPerson(null)}
          />
        )}
      </Modal>

      {/* 联系人详情 */}
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

      {/* 导入联系人 - 弹窗选择导入方式 */}
      <Modal open={showImport} onClose={closeImport} title={t('contacts.importContact')}>
        <ImportForm
          mode={importMode}
          setMode={setImportMode}
          onImportCSV={handleImportCSV}
          onImportVCard={handleImportVCard}
          onCancel={closeImport}
          importing={importing}
          fileInputRef={fileInputRef}
        />
      </Modal>

      {/* 导入结果/错误提示 */}
      <ConfirmDialog
        open={!!importMsg}
        title={t('import.result')}
        message={importMsg}
        type="info"
        singleButton
        confirmText={t('common.ok')}
        onConfirm={() => setImportMsg('')}
        onCancel={() => setImportMsg('')}
      />

      {/* 批量修改分组 */}
      <Modal
        open={showBatchGroup}
        onClose={() => setShowBatchGroup(false)}
        title={t('contacts.batchGroupTitle', { n: selectedIds.size })}
      >
        <div className="py-2">
          <p className="text-xs text-gray-500 mb-3">
            {t('contacts.batchGroupDesc')}
          </p>
          {/* 已有分组快捷选择 */}
          {customGroups.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {customGroups.map((g) => (
                <button
                  key={g}
                  onClick={() => setBatchGroupValue(g)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    batchGroupValue === g
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={batchGroupValue}
            onChange={(e) => setBatchGroupValue(e.target.value)}
            placeholder={t('contacts.batchGroupPlaceholder')}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-purple-400"
          />
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleBatchUpdateGroup}
              disabled={!batchGroupValue.trim()}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-purple-700"
            >
              {t('contacts.batchGroupConfirm')}
            </button>
            <button
              onClick={() => setShowBatchGroup(false)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>

      {/* 批量打标签 */}
      <Modal
        open={showBatchTags}
        onClose={() => setShowBatchTags(false)}
        title={t('contacts.batchTagTitle', { n: selectedIds.size })}
      >
        <div className="py-2">
          {/* 添加/移除模式切换 */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setBatchTagMode('add')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                batchTagMode === 'add'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t('contacts.batchTagAdd')}
            </button>
            <button
              onClick={() => setBatchTagMode('remove')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                batchTagMode === 'remove'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t('contacts.batchTagRemove')}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            {batchTagMode === 'add'
              ? t('contacts.batchTagAddDesc')
              : t('contacts.batchTagRemoveDesc')}
          </p>
          <input
            type="text"
            value={batchTagInput}
            onChange={(e) => setBatchTagInput(e.target.value)}
            placeholder={t('contacts.batchTagPlaceholder')}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
          />
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleBatchUpdateTags}
              disabled={!batchTagInput.trim()}
              className={`flex-1 py-2.5 text-white rounded-lg font-medium disabled:opacity-50 ${
                batchTagMode === 'add'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {batchTagMode === 'add' ? t('contacts.batchTagAddBtn') : t('contacts.batchTagRemoveBtn')}
            </button>
            <button
              onClick={() => setShowBatchTags(false)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>

      {/* 批量删除确认 */}
      <ConfirmDialog
        open={showBatchDelete}
        title={t('contacts.batchDeleteTitle')}
        message={t('contacts.batchDeleteMsg', { n: selectedIds.size })}
        type="danger"
        confirmText={t('contacts.batchDeleteConfirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleBatchDelete}
        onCancel={() => setShowBatchDelete(false)}
      />
    </div>
  )
}

function ImportForm({
  mode,
  setMode,
  onImportCSV,
  onImportVCard,
  onCancel,
  importing,
  fileInputRef,
}: {
  mode: 'choice' | 'vcard' | 'csv'
  setMode: (m: 'choice' | 'vcard' | 'csv') => void
  onImportCSV: (text: string) => void
  onImportVCard: (file: File) => void
  onCancel: () => void
  importing: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useLanguage()
  const [text, setText] = useState('')

  const sample = `姓名,电话,分组,邮箱,微信,职业,单位,住址,性别,标签,备注,生日
张三,13800138000,朋友,zs@example.com,zs_wx,工程师,科技公司,北京,男,同学;室友,大学室友,1990-01-01
李四,13900139000,同事,ls@example.com,ls_wx,主管,技术部,上海,女,主管,技术负责人,1985-05-15`

  // 选择方式界面
  if (mode === 'choice') {
    return (
      <div className="py-2">
        <p className="text-sm text-gray-500 mb-4 text-center">{t('import.chooseMethod')}</p>
        <div className="space-y-3">
          {/* 方式一：vCard 文件导入 */}
          <button
            onClick={() => setMode('vcard')}
            className="w-full flex items-center gap-3 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl hover:shadow-md transition-all active:scale-[0.98] text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">{t('import.vcard')}</div>
              <div className="text-xs text-gray-500 mt-0.5">{t('import.vcardDesc')}</div>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* 方式二：CSV 格式导入 */}
          <button
            onClick={() => setMode('csv')}
            className="w-full flex items-center gap-3 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl hover:shadow-md transition-all active:scale-[0.98] text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">{t('import.csv')}</div>
              <div className="text-xs text-gray-500 mt-0.5">{t('import.csvDesc')}</div>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  // vCard 文件导入界面
  if (mode === 'vcard') {
    return (
      <div className="py-2">
        <button
          onClick={() => setMode('choice')}
          className="flex items-center gap-1 text-xs text-blue-600 mb-3 hover:underline"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('import.back')}
        </button>

        <div className="border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center bg-blue-50/50">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md mb-3">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div className="text-sm font-medium text-gray-900 mb-1">{t('import.vcardSelectFile')}</div>
          <div className="text-xs text-gray-500 mb-4">{t('import.vcardFormat')}</div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? t('import.importing') : t('import.selectFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vcf,.vcard,text/vcard"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportVCard(f)
            }}
          />
        </div>

        <div className="mt-4 p-3 bg-amber-50 rounded-xl">
          <div className="text-xs text-amber-700 leading-relaxed">
            {t('import.vcardTip')}
          </div>
        </div>
      </div>
    )
  }

  // CSV 粘贴导入界面
  return (
    <div className="py-2">
      <button
        onClick={() => setMode('choice')}
        className="flex items-center gap-1 text-xs text-blue-600 mb-3 hover:underline"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('import.back')}
      </button>

      <p className="text-xs text-gray-500 mb-2">
        {t('import.csvInstruction')}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={sample}
        className="w-full h-40 p-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono"
      />
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onImportCSV(text)}
          disabled={!text.trim() || importing}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {importing ? t('import.importing') : t('import.importBtn')}
        </button>
        <button
          onClick={onCancel}
          disabled={importing}
          className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
