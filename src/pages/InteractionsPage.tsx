import { useState, useEffect, useMemo } from 'react'
import type { Interaction, InteractionType, Person } from '../types'
import { INTERACTION_LABELS, INTERACTION_ICONS } from '../types'
import { interactionDB, personDB, generateId } from '../utils/db'
import { useLanguage } from '../utils/i18n'
import PageHeader from '../components/PageHeader'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'

type FilterType = 'all' | 'pending' | 'completed'

export default function InteractionsPage() {
  const { t } = useLanguage()
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState<Interaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Interaction | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [ints, ps] = await Promise.all([interactionDB.getAll(), personDB.getAll()])
    setInteractions(ints.sort((a, b) => b.createdAt - a.createdAt))
    setPersons(ps)
  }

  const personMap = useMemo(() => {
    const m = new Map<string, Person>()
    persons.forEach((p) => m.set(p.id, p))
    return m
  }, [persons])

  const filteredInteractions = useMemo(() => {
    if (filter === 'pending') return interactions.filter((i) => !i.completed)
    if (filter === 'completed') return interactions.filter((i) => i.completed)
    return interactions
  }, [interactions, filter])

  const pendingCount = interactions.filter((i) => !i.completed).length
  const completedCount = interactions.filter((i) => i.completed).length

  const handleToggleComplete = async (item: Interaction) => {
    await interactionDB.update({ ...item, completed: !item.completed })
    loadData()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await interactionDB.remove(deleteTarget.id)
    setDeleteTarget(null)
    loadData()
  }

  const handleSave = async (data: Omit<Interaction, 'id' | 'createdAt'> | Interaction) => {
    if ('id' in data) {
      await interactionDB.update(data)
      setEditingItem(null)
    } else {
      await interactionDB.add({
        ...data,
        id: generateId(),
        createdAt: Date.now(),
      })
      setShowAdd(false)
    }
    loadData()
  }

  const filterTabs: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: t('todo.all'), count: interactions.length },
    { key: 'pending', label: t('todo.pending'), count: pendingCount },
    { key: 'completed', label: t('todo.completed'), count: completedCount },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('todo.title')}
        subtitle={t('todo.subtitle', { n: interactions.length })}
        right={
          <button
            onClick={() => setShowAdd(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        }
      />

      {/* 筛选区 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
        <div className="flex gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.label}
              <span className={filter === tab.key ? 'text-blue-200' : 'text-gray-400'}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 待办列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredInteractions.length === 0 ? (
          <EmptyState
            icon="📋"
            title={t('todo.noData')}
            description={t('todo.noDataDesc')}
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredInteractions.map((item) => {
              // 支持多联系人：优先用 personIds，向后兼容 personId
              const itemPersonIds = item.personIds || [item.personId]
              const itemPersons = itemPersonIds.map((id) => personMap.get(id)).filter(Boolean) as Person[]
              const typeLabel = item.type === 'custom' ? (item.customType || INTERACTION_LABELS.custom) : INTERACTION_LABELS[item.type]
              const typeIcon = INTERACTION_ICONS[item.type]
              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors ${item.completed ? 'opacity-60' : ''}`}
                >
                  {/* 完成勾选框 */}
                  <button
                    onClick={() => handleToggleComplete(item)}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      item.completed
                        ? 'border-green-500 bg-green-500'
                        : 'border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {item.completed && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* 内容区 */}
                  <div className="flex-1 min-w-0" onClick={() => setEditingItem(item)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm">{typeIcon}</span>
                      <span className={`text-sm font-medium text-gray-900 ${item.completed ? 'line-through' : ''}`}>
                        {item.content}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                        {typeLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {itemPersons.length > 0 ? (
                        <>
                          {/* 多联系人头像叠加显示 */}
                          <div className="flex -space-x-2">
                            {itemPersons.slice(0, 3).map((p) => (
                              <div key={p.id} className="ring-2 ring-white rounded-full">
                                <Avatar name={p.name} size={20} avatar={p.avatar} />
                              </div>
                            ))}
                          </div>
                          <span className="text-xs text-gray-500">
                            {itemPersons.map((p) => p.name).join('、')}
                            {itemPersons.length > 3 && ` +${itemPersons.length - 3}`}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">{t('todo.noContact')}</span>
                      )}
                      <span className="text-xs text-gray-400">· {item.date}{item.time ? ` ${item.time}` : ''}</span>
                    </div>
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={() => setDeleteTarget(item)}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 添加待办 */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('todo.addTodo')}>
        <TodoForm persons={persons} onSubmit={handleSave} onCancel={() => setShowAdd(false)} />
      </Modal>

      {/* 编辑待办 */}
      <Modal open={!!editingItem} onClose={() => setEditingItem(null)} title={t('todo.editTodo')}>
        {editingItem && (
          <TodoForm
            item={editingItem}
            persons={persons}
            onSubmit={handleSave}
            onCancel={() => setEditingItem(null)}
          />
        )}
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('todo.deleteTitle')}
        message={t('todo.deleteConfirm')}
        type="danger"
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function TodoForm({
  item,
  persons,
  onSubmit,
  onCancel,
}: {
  item?: Interaction
  persons: Person[]
  onSubmit: (data: Omit<Interaction, 'id' | 'createdAt'> | Interaction) => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  // 多联系人选择：初始化时合并 personIds 和 personId
  const [selectedIds, setSelectedIds] = useState<string[]>(
    item?.personIds || (item?.personId ? [item.personId] : [])
  )
  const [type, setType] = useState<InteractionType>(item?.type || 'meeting')
  const [customType, setCustomType] = useState(item?.customType || '')
  const [content, setContent] = useState(item?.content || '')
  const [date, setDate] = useState(item?.date || new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState(item?.time || '')
  const [completed, setCompleted] = useState(item?.completed || false)
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearch, setContactSearch] = useState('')

  const toggleContact = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectedPersons = persons.filter((p) => selectedIds.includes(p.id))
  const availablePersons = persons.filter((p) => !p.isMe)
  const filteredAvailable = contactSearch
    ? availablePersons.filter((p) => p.name.toLowerCase().includes(contactSearch.toLowerCase()))
    : availablePersons

  const handleSubmit = () => {
    if (!content.trim()) {
      alert(t('todo.contentPlaceholder'))
      return
    }
    if (selectedIds.length === 0) {
      alert(t('todo.selectContact'))
      return
    }
    const data = {
      personId: selectedIds[0], // 主联系人（向后兼容）
      personIds: selectedIds,   // 所有选中的联系人
      type,
      customType: type === 'custom' ? customType.trim() : undefined,
      content: content.trim(),
      date,
      time: time || undefined,
      completed,
    }
    if (item) {
      onSubmit({ ...item, ...data })
    } else {
      onSubmit(data)
    }
  }

  const typeOptions = Object.keys(INTERACTION_LABELS) as InteractionType[]

  return (
    <div className="space-y-4">
      {/* 联系人多选 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('todo.selectContact')} * <span className="text-xs text-gray-400">({t('todo.multiSelectHint')})</span>
        </label>
        {/* 已选联系人标签 */}
        {selectedPersons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedPersons.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs"
              >
                <Avatar name={p.name} size={16} avatar={p.avatar} />
                {p.name}
                <button
                  onClick={() => toggleContact(p.id)}
                  className="ml-0.5 text-blue-400 hover:text-blue-600"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowContactPicker(!showContactPicker)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-left flex items-center justify-between"
        >
          <span className={selectedIds.length > 0 ? 'text-gray-700' : 'text-gray-400'}>
            {selectedIds.length > 0
              ? t('todo.selectedCount', { n: selectedIds.length })
              : t('todo.selectContact')}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${showContactPicker ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {/* 联系人选择面板 */}
        {showContactPicker && (
          <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-2 bg-gray-50 border-b border-gray-100">
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder={t('todo.searchContact')}
                className="w-full px-2 py-1.5 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredAvailable.map((p) => {
                const isSelected = selectedIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleContact(p.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <Avatar name={p.name} size={24} avatar={p.avatar} />
                    <span className="text-sm text-gray-700">{p.name}</span>
                    {p.customGroupLabel && (
                      <span className="text-xs text-gray-400 ml-auto">{p.customGroupLabel}</span>
                    )}
                  </button>
                )
              })}
              {filteredAvailable.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-gray-400">
                  {t('todo.noContactFound')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('todo.content')} *</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('todo.contentPlaceholder')}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t('todo.type')}</label>
        <div className="flex flex-wrap gap-2">
          {typeOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => setType(opt)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                type === opt
                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              <span>{INTERACTION_ICONS[opt]}</span>
              {INTERACTION_LABELS[opt]}
            </button>
          ))}
        </div>
        {type === 'custom' && (
          <input
            type="text"
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder={t('todo.type')}
            className="w-full mt-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('todo.date')} *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('todo.time')}</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {item && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('todo.completed')}</label>
          <div className="flex gap-2">
            <button
              onClick={() => setCompleted(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                !completed ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'
              }`}
            >
              {t('todo.pending')}
            </button>
            <button
              onClick={() => setCompleted(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                completed ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-600'
              }`}
            >
              {t('todo.completed')}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium"
        >
          {item ? t('common.save') : t('common.add')}
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
