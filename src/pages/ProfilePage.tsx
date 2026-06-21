import { useState, useEffect, useMemo } from 'react'
import type { Person, Interaction, FamilyMember } from '../types'
import { personDB, interactionDB, familyDB, clearAllData } from '../utils/db'
import { calculateHealthScoreDetailed, getHealthLevel } from '../utils/helpers'
import type { HealthBreakdown } from '../utils/helpers'
import { generateSuggestions } from '../utils/suggestions'
import type { SuggestionType } from '../utils/suggestions'
import { useLanguage } from '../utils/i18n'
import { useTheme } from '../utils/theme'
import type { ThemeMode } from '../utils/theme'
import { isEncryptionAvailable, isPassphraseEnabled, setPassphrase, clearPassphrase } from '../utils/crypto'
import PageHeader from '../components/PageHeader'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

export default function ProfilePage({ onStartTour }: { onStartTour?: () => void }) {
  const { t, lang, setLang } = useLanguage()
  const { theme, setTheme } = useTheme()
  const [persons, setPersons] = useState<Person[]>([])
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [showAbout, setShowAbout] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  // 加密相关状态
  const [showEncryption, setShowEncryption] = useState(false)
  const [encryptionEnabled, setEncryptionEnabled] = useState(isPassphraseEnabled())
  const [encryptionAvailable] = useState(isEncryptionAvailable())
  const [passphraseInput, setPassphraseInput] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [encryptionMsg, setEncryptionMsg] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [p, i, f] = await Promise.all([
      personDB.getAll(),
      interactionDB.getAll(),
      familyDB.getAll(),
    ])
    setPersons(p)
    setInteractions(i)
    setFamilyMembers(f)
  }

  // 统计数据
  const totalPersons = persons.length
  const totalInteractions = interactions.length
  const totalFamily = familyMembers.length

  // 关系健康度统计（精细化多维度评分）- 排除"我"，只统计真实关系
  const otherPersons = persons.filter((p) => !p.isMe)
  const healthStats = otherPersons.map((person) => {
    const personInteractions = interactions.filter((i) => i.personId === person.id)
    const lastTime = personInteractions.length > 0
      ? Math.max(...personInteractions.map((i) => new Date(i.date).getTime()))
      : person.updatedAt
    const timestamps = personInteractions.map((i) => new Date(i.date).getTime())
    const types = personInteractions.map((i) => i.type)
    const breakdown = calculateHealthScoreDetailed(lastTime, personInteractions.length, timestamps, types)
    return { person, score: breakdown.total, breakdown }
  })

  const avgHealth = otherPersons.length > 0
    ? Math.round(healthStats.reduce((sum, h) => sum + h.score, 0) / otherPersons.length)
    : 0

  const healthLevel = getHealthLevel(avgHealth)

  // 平均维度评分（用于展示整体健康度构成）
  const avgBreakdown: HealthBreakdown = otherPersons.length > 0
    ? {
        frequency: Math.round(healthStats.reduce((s, h) => s + h.breakdown.frequency, 0) / otherPersons.length),
        recency: Math.round(healthStats.reduce((s, h) => s + h.breakdown.recency, 0) / otherPersons.length),
        diversity: Math.round(healthStats.reduce((s, h) => s + h.breakdown.diversity, 0) / otherPersons.length),
        trend: Math.round(healthStats.reduce((s, h) => s + h.breakdown.trend, 0) / otherPersons.length),
        consistency: Math.round(healthStats.reduce((s, h) => s + h.breakdown.consistency, 0) / otherPersons.length),
        bonus: Math.round(healthStats.reduce((s, h) => s + h.breakdown.bonus, 0) / otherPersons.length),
        total: avgHealth,
      }
    : { frequency: 0, recency: 0, diversity: 0, trend: 0, consistency: 0, bonus: 0, total: 0 }

  const needAttention = healthStats
    .filter((h) => h.score < 40)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)

  // 规则引擎生成关系维护建议
  const suggestions = useMemo(() => generateSuggestions(persons, interactions), [persons, interactions])

  const handleClearData = () => {
    setShowClearConfirm(true)
  }

  const confirmClearData = () => {
    setShowClearConfirm(false)
    clearAllData().then(async () => {
      // 清空后只重新添加"我"（联系人 + 家族成员），不恢复示例数据
      const { personDB, familyDB, generateId } = await import('../utils/db')
      const now = Date.now()
      await personDB.add({
        id: generateId(),
        name: '我',
        group: 'other',
        tags: ['本人'],
        gender: 'male',
        birthday: '1990-06-15',
        note: '这是我自己',
        isMe: true,
        createdAt: now,
        updatedAt: now,
      })
      await familyDB.add({
        id: generateId(),
        name: '我',
        gender: 'male',
        generation: 'self',
        relation: '本人',
        birthday: '1990-06-15',
        parentIds: [],
        note: '',
        isMe: true,
        createdAt: now,
      })
      loadData()
    })
  }

  // 建议类型样式
  const suggestionStyles: Record<SuggestionType, { bg: string; text: string; icon: string; label: string }> = {
    urgent: { bg: 'bg-red-50', text: 'text-red-700', icon: '🔴', label: t('suggestion.urgent') },
    warning: { bg: 'bg-orange-50', text: 'text-orange-700', icon: '🟠', label: t('suggestion.warning') },
    info: { bg: 'bg-blue-50', text: 'text-blue-700', icon: '🔵', label: t('suggestion.info') },
    good: { bg: 'bg-green-50', text: 'text-green-700', icon: '🟢', label: t('suggestion.good') },
  }

  // 设置密码保护
  const handleSetPassphrase = async () => {
    if (passphraseInput.length < 4) {
      setEncryptionMsg(t('encryption.passwordTooShort'))
      return
    }
    if (passphraseInput !== passphraseConfirm) {
      setEncryptionMsg(t('encryption.passwordMismatch'))
      return
    }
    try {
      await setPassphrase(passphraseInput)
      setEncryptionEnabled(true)
      setEncryptionMsg(t('encryption.enableSuccess'))
      setPassphraseInput('')
      setPassphraseConfirm('')
      setTimeout(() => {
        setShowEncryption(false)
        setEncryptionMsg('')
      }, 1500)
    } catch (e) {
      setEncryptionMsg((e as Error).message)
    }
  }

  // 取消密码保护
  const handleRemovePassphrase = async () => {
    try {
      await clearPassphrase()
      setEncryptionEnabled(false)
      setEncryptionMsg(t('encryption.removeSuccess'))
      setTimeout(() => {
        setShowEncryption(false)
        setEncryptionMsg('')
      }, 1500)
    } catch (e) {
      setEncryptionMsg((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('profile.title')} />

      <div className="flex-1 overflow-y-auto">
        {/* 用户信息卡片 */}
        <div className="m-4 p-5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
              {t('common.me')}
            </div>
            <div>
              <h2 className="text-xl font-bold">{t('profile.user')}</h2>
              <p className="text-sm opacity-80 mt-0.5">{t('profile.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* 新手教程按钮 */}
        {onStartTour && (
          <div className="mx-4 mb-4">
            <button
              onClick={onStartTour}
              className="w-full p-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl text-white shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
                  🚀
                </div>
                <div className="flex-1 text-left">
                  <div className="text-base font-bold">{t('tour.button')}</div>
                  <div className="text-xs opacity-80">{t('tour.buttonDesc')}</div>
                </div>
                <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>
        )}

        {/* 数据统计 */}
        <div className="mx-4 mb-4 grid grid-cols-3 gap-3">
          <StatCard icon="👥" value={totalPersons} label={t('profile.contacts')} />
          <StatCard icon="📋" value={totalInteractions} label={t('profile.interactions')} />
          <StatCard icon="🌳" value={totalFamily} label={t('profile.family')} />
        </div>

        {/* 智能关系维护建议（规则引擎） */}
        <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">{t('profile.suggestions')}</h3>
          <p className="text-xs text-gray-400 mb-3">{t('profile.suggestionsDesc')}</p>
          {suggestions.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-4">{t('profile.noSuggestions')}</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {suggestions.slice(0, 8).map((s) => {
                const style = suggestionStyles[s.type]
                return (
                  <div key={s.id} className={`flex items-start gap-2 p-2.5 rounded-lg ${style.bg}`}>
                    <span className="text-sm flex-shrink-0">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-500">{s.person.name}</span>
                      </div>
                      <div className="text-sm text-gray-700 mt-0.5">{s.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{s.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 关系健康度 */}
        <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('profile.health')}</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke={healthLevel.color}
                  strokeWidth="3"
                  strokeDasharray={`${avgHealth * 0.94} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold" style={{ color: healthLevel.color }}>{avgHealth}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium" style={{ color: healthLevel.color }}>
                {healthLevel.label}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('profile.healthDesc')}
              </p>
            </div>
          </div>

          {/* 健康度维度评分明细 */}
          {totalPersons > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
              <div className="text-xs text-gray-400 mb-1">{t('profile.healthBreakdown')}</div>
              {([
                { key: 'frequency', label: t('profile.healthFrequency'), max: 20, value: avgBreakdown.frequency, color: '#3b82f6' },
                { key: 'recency', label: t('profile.healthRecency'), max: 25, value: avgBreakdown.recency, color: '#10b981' },
                { key: 'diversity', label: t('profile.healthDiversity'), max: 15, value: avgBreakdown.diversity, color: '#8b5cf6' },
                { key: 'trend', label: t('profile.healthTrend'), max: 15, value: avgBreakdown.trend, color: '#f59e0b' },
                { key: 'consistency', label: t('profile.healthConsistency'), max: 15, value: avgBreakdown.consistency, color: '#06b6d4' },
                { key: 'bonus', label: t('profile.healthBonus'), max: 10, value: avgBreakdown.bonus, color: '#ec4899' },
              ]).map((dim) => (
                <div key={dim.key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16 flex-shrink-0">{dim.label}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(dim.value / dim.max) * 100}%`,
                        backgroundColor: dim.color,
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{dim.value}/{dim.max}</span>
                </div>
              ))}
            </div>
          )}

          {needAttention.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <div className="text-xs text-gray-400 mb-2">{t('profile.needAttention')}</div>
              {needAttention.map(({ person, score }) => (
                <div key={person.id} className="flex items-center gap-2 py-1.5">
                  <Avatar name={person.name} size={28} />
                  <span className="text-sm text-gray-700 flex-1">{person.name}</span>
                  <span className="text-xs font-medium" style={{ color: getHealthLevel(score).color }}>
                    {score}{t('profile.score')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 语言切换 */}
        <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('profile.language')}</h3>
          <div className="flex gap-2">
            {([
              { value: 'zh' as const, label: '中文' },
              { value: 'en' as const, label: 'English' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLang(opt.value)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  lang === opt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 主题模式切换 */}
        <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('profile.theme')}</h3>
          <div className="flex gap-2">
            {([
              { value: 'system' as const, label: t('profile.themeSystem'), icon: '🖥️' },
              { value: 'light' as const, label: t('profile.themeLight'), icon: '☀️' },
              { value: 'dark' as const, label: t('profile.themeDark'), icon: '🌙' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value as ThemeMode)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  theme === opt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                <span className="mr-1">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 本地数据加密 */}
        {encryptionAvailable && (
          <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">{t('encryption.title')}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  encryptionEnabled
                    ? 'bg-green-100 text-green-600'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {encryptionEnabled ? t('encryption.statusOn') : t('encryption.statusOff')}
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-3">{t('encryption.desc')}</p>
            <button
              onClick={() => setShowEncryption(true)}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                encryptionEnabled
                  ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {encryptionEnabled ? t('encryption.changePassword') : t('encryption.setPassword')}
            </button>
          </div>
        )}

        {/* 设置列表 */}
        <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          <button onClick={() => setShowAbout(true)} className="w-full">
            <MenuItem icon="ℹ️" label={t('profile.about')} value="v1.0.0" />
          </button>
          <button onClick={handleClearData} className="w-full">
            <MenuItem icon="🗑️" label={t('profile.clearData')} value="" danger />
          </button>
        </div>

        <div className="text-center text-xs text-gray-400 py-4">
          {t('app.name')} v1.0.0<br />
          {t('profile.footer')}
        </div>
      </div>

      {/* 关于弹窗 */}
      <Modal open={showAbout} onClose={() => setShowAbout(false)} title={t('about.title')}>
        <div className="space-y-4">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold mb-3">
              {t('app.name').charAt(0)}
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t('app.name')}</h3>
            <p className="text-sm text-gray-400">v1.0.0</p>
          </div>

          <div className="text-sm text-gray-600 leading-relaxed">
            <p className="mb-2">{t('about.desc')}</p>
            <ul className="space-y-1 ml-4">
              <li>• {t('about.f1')}</li>
              <li>• {t('about.f2')}</li>
              <li>• {t('about.f3')}</li>
              <li>• {t('about.f4')}</li>
              <li>• {t('about.f5')}</li>
            </ul>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
            <div className="flex justify-between py-1">
              <span>{t('about.techStack')}</span>
              <span>React + TypeScript + ECharts</span>
            </div>
            <div className="flex justify-between py-1">
              <span>{t('about.storage')}</span>
              <span>{t('about.storageValue')}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>{t('about.track')}</span>
              <span>{t('about.trackValue')}</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* 清空数据确认弹窗 */}
      <ConfirmDialog
        open={showClearConfirm}
        title={t('clear.title')}
        message={t('clear.message')}
        confirmText={t('clear.confirm')}
        type="danger"
        onConfirm={confirmClearData}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* 加密设置弹窗 */}
      <Modal
        open={showEncryption}
        onClose={() => {
          if (!encryptionMsg) {
            setShowEncryption(false)
            setPassphraseInput('')
            setPassphraseConfirm('')
            setEncryptionMsg('')
          }
        }}
        title={t('encryption.title')}
      >
        <div className="py-2 space-y-3">
          <p className="text-xs text-gray-500">{t('encryption.desc')}</p>

          {/* 当前状态 */}
          <div className={`p-3 rounded-lg ${encryptionEnabled ? 'bg-green-50' : 'bg-gray-50'}`}>
            <div className="text-xs font-medium mb-0.5">
              {encryptionEnabled ? '🟢 ' + t('encryption.enabled') : '⚪ ' + t('encryption.disabled')}
            </div>
          </div>

          {/* 密码输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {encryptionEnabled ? t('encryption.changePassword') : t('encryption.setPassword')}
            </label>
            <input
              type="password"
              value={passphraseInput}
              onChange={(e) => setPassphraseInput(e.target.value)}
              placeholder={t('encryption.passwordPlaceholder')}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <input
              type="password"
              value={passphraseConfirm}
              onChange={(e) => setPassphraseConfirm(e.target.value)}
              placeholder={t('encryption.confirmPlaceholder')}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* 消息提示 */}
          {encryptionMsg && (
            <div className={`p-2.5 rounded-lg text-xs ${
              encryptionMsg.includes('成功') || encryptionMsg.includes('enabled') || encryptionMsg.includes('removed')
                ? 'bg-green-50 text-green-600'
                : 'bg-red-50 text-red-600'
            }`}>
              {encryptionMsg}
            </div>
          )}

          {/* 注意事项 */}
          <div className="p-2.5 bg-amber-50 rounded-lg">
            <div className="text-xs text-amber-700">⚠️ {t('encryption.note')}</div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSetPassphrase}
              disabled={!passphraseInput || !passphraseConfirm}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700"
            >
              {t('common.confirm')}
            </button>
            {encryptionEnabled && (
              <button
                onClick={handleRemovePassphrase}
                className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100"
              >
                {t('encryption.removePassword')}
              </button>
            )}
            <button
              onClick={() => {
                setShowEncryption(false)
                setPassphraseInput('')
                setPassphraseConfirm('')
                setEncryptionMsg('')
              }}
              className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}

function MenuItem({ icon, label, value, danger }: { icon: string; label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <span className="text-xl">{icon}</span>
      <span className={`flex-1 text-sm font-medium ${danger ? 'text-red-600' : 'text-gray-700'}`}>{label}</span>
      {value && <span className="text-xs text-gray-400">{value}</span>}
      {!danger && (
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )
}
