import { useState, useEffect, useRef } from 'react'
import type { Person, Interaction, Photo } from '../types'
import { INTERACTION_LABELS, INTERACTION_ICONS } from '../types'
import { interactionDB, personDB, relationDB, photoDB } from '../utils/db'
import { getZodiacSign, getAge, daysUntilBirthday, compressImage } from '../utils/helpers'
import { useLanguage } from '../utils/i18n'
import Avatar from './Avatar'
import Modal from './Modal'
import PhotoWall from './PhotoWall'
import ConfirmDialog from './ConfirmDialog'

interface PersonDetailProps {
  person: Person
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export default function PersonDetail({ person, onEdit, onDelete }: PersonDetailProps) {
  const { t } = useLanguage()
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [avatar, setAvatar] = useState<string | undefined>(person.avatar)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [relations, setRelations] = useState<{ name: string; note: string }[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [showPhotoWall, setShowPhotoWall] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    setAvatar(person.avatar)
    interactionDB.getByPerson(person.id).then((data) => {
      setInteractions(data.sort((a, b) => b.createdAt - a.createdAt))
    })
    // 加载该联系人参与的关系（排除与"我"的关系，因为分组已显示）
    loadRelations()
    // 加载照片
    loadPhotos()
  }, [person.id, person.avatar])

  const loadRelations = async () => {
    const [allRelations, allPersons] = await Promise.all([
      relationDB.getAll(),
      personDB.getAll(),
    ])
    const personMap = new Map(allPersons.map((p) => [p.id, p]))
    const me = allPersons.find((p) => p.isMe)
    const result: { name: string; note: string }[] = []
    for (const r of allRelations) {
      // 跳过与"我"的关系（已通过分组显示）
      if (me && (r.fromId === me.id || r.toId === me.id)) continue
      let otherId = ''
      if (r.fromId === person.id) otherId = r.toId
      else if (r.toId === person.id) otherId = r.fromId
      else continue
      const other = personMap.get(otherId)
      if (other) {
        result.push({ name: other.name, note: r.note || '关系' })
      }
    }
    setRelations(result)
  }

  const loadPhotos = async () => {
    const data = await photoDB.getByPerson(person.id)
    setPhotos(data)
  }

  const birthdayDays = person.birthday ? daysUntilBirthday(person.birthday) : null

  // 头像上传处理 - 使用 react-image-file-resizer 压缩，无大小限制
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressedBase64 = await compressImage(file, 400, 400, 70)
      setAvatar(compressedBase64)
      // 保存到数据库
      await personDB.update({ ...person, avatar: compressedBase64, updatedAt: Date.now() })
    } catch (err) {
      alert('图片压缩失败，请更换图片')
    }
  }

  return (
    <div className="pb-4">
      {/* 顶部信息 */}
      <div className="flex flex-col items-center pt-6 pb-4 bg-gradient-to-b from-blue-50 to-transparent">
        <div className="relative">
          <Avatar name={person.name} size={72} avatar={avatar} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white border-2 border-white shadow-md hover:bg-blue-700"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.9l.82-1.2a2 2 0 011.66-.9h3.86a2 2 0 011.66.9l.82 1.2a2 2 0 001.66.9H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mt-3">{person.name}</h2>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              color: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
            }}
          >
            {person.customGroupLabel || '未分组'}
          </span>
          {person.birthday && (
            <>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{getZodiacSign(person.birthday)}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{getAge(person.birthday)}岁</span>
            </>
          )}
        </div>
      </div>

      {/* 生日提醒 */}
      {birthdayDays !== null && birthdayDays <= 30 && (
        <div className="mx-4 mb-3 p-3 bg-orange-50 rounded-lg flex items-center gap-2">
          <span className="text-lg">🎂</span>
          <span className="text-sm text-orange-700">
            {birthdayDays === 0
              ? `今天是 ${person.name} 的生日！`
              : `距 ${person.name} 生日还有 ${birthdayDays} 天`}
          </span>
        </div>
      )}

      {/* 基本信息 */}
      <div className="mx-4 mb-3 bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {person.phone && (
          <InfoRow
            icon="📞"
            label="电话"
            value={person.phone}
            action={
              <div className="flex-shrink-0 flex gap-1.5">
                <a
                  href={`tel:${person.phone}`}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
                  title="拨打电话"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </a>
                <a
                  href={`sms:${person.phone}`}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-green-50 text-green-600 hover:bg-green-100"
                  title="发送短信"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />
                  </svg>
                </a>
              </div>
            }
          />
        )}
        {person.email && (
          <InfoRow
            icon="✉️"
            label="电子邮箱"
            value={person.email}
            action={
              <a
                href={`mailto:${person.email}`}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100"
                title="发送邮件"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            }
          />
        )}
        {person.wechat && (
          <InfoRow
            icon="💬"
            label="微信号"
            value={person.wechat}
            action={
              <button
                onClick={async () => {
                  // 1. 复制微信号到剪贴板
                  try {
                    await navigator.clipboard.writeText(person.wechat!)
                  } catch {
                    const input = document.createElement('input')
                    input.value = person.wechat!
                    document.body.appendChild(input)
                    input.select()
                    document.execCommand('copy')
                    document.body.removeChild(input)
                  }

                  // 2. 提示已复制
                  showToast(person.wechat!)

                  // 3. 打开微信主界面
                  try {
                    const { AppLauncher } = await import('@capacitor/app-launcher')
                    const { value: canOpen } = await AppLauncher.canOpenUrl({ url: 'weixin://' })
                    if (canOpen) {
                      await AppLauncher.openUrl({ url: 'weixin://' })
                    } else {
                      showToast('未检测到微信应用，请手动打开微信')
                    }
                  } catch {
                    // Web 环境或插件不可用，微信号已复制，用户可手动打开微信
                  }
                }}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                title="打开微信"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.328.328 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.616-6.446 1.515-1.535 3.696-2.165 5.738-1.923.276-2.94-2.732-5.376-6.448-5.376zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1 .19-.555c1.633-1.121 2.61-2.799 2.61-4.659 0-3.276-3.054-5.928-6.876-6.083zm-2.224 3.18c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                </svg>
              </button>
            }
          />
        )}
        {person.occupation && (
          <InfoRow icon="💼" label="职业" value={person.occupation} />
        )}
        {person.organization && (
          <InfoRow icon="🏢" label="所在单位" value={person.organization} />
        )}
        {person.address && (
          <InfoRow icon="🏠" label="家庭住址" value={person.address} />
        )}
        {person.birthday && (
          <InfoRow icon="🎂" label="生日" value={person.birthday} />
        )}
        {person.tags.length > 0 && (
          <InfoRow icon="🏷️" label="标签" value={person.tags.join('、')} />
        )}
        {person.note && (
          <InfoRow icon="📝" label="备注" value={person.note} />
        )}
      </div>

      {/* 其他关系 */}
      {relations.length > 0 && (
        <div className="mx-4 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 px-1">
            其他关系 ({relations.length})
          </h3>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {relations.map((rel, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3">
                <span className="text-lg">🔗</span>
                <span className="text-sm text-gray-700 flex-1">
                  和 <span className="font-medium">{rel.name}</span> 是
                  <span className="text-blue-600 font-medium"> {rel.note}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 照片墙 */}
      <div className="mx-4 mb-3">
        <button
          onClick={() => setShowPhotoWall(true)}
          className="w-full bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
        >
          <span className="text-lg">🖼️</span>
          <span className="text-sm font-semibold text-gray-700 flex-1 text-left">
            {t('photo.wall')}
          </span>
          <span className="text-xs text-gray-400">{t('photo.count', { n: photos.length })}</span>
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 互动记录 */}
      <div className="mx-4 mb-3">
        <h3 className="text-sm font-semibold text-gray-700 mb-2 px-1">
          互动记录 ({interactions.length})
        </h3>
        {interactions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center text-sm text-gray-400">
            暂无互动记录
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {interactions.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3">
                <span className="text-lg">{INTERACTION_ICONS[item.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {INTERACTION_LABELS[item.type]}
                    </span>
                    <span className="text-xs text-gray-400">{item.date}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{item.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 px-4 mt-4">
        <button
          onClick={onEdit}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          编辑
        </button>
        {!person.isMe && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-lg font-medium flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除
          </button>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="删除联系人"
        message={`确定要删除「${person.name}」吗？删除后无法恢复。`}
        confirmText="删除"
        type="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false)
          onDelete()
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* 照片墙弹窗 */}
      <Modal
        open={showPhotoWall}
        onClose={() => setShowPhotoWall(false)}
        title={t('photo.wallTitle', { name: person.name })}
      >
        <PhotoWall
          ownerId={person.id}
          photos={photos}
          onRefresh={loadPhotos}
        />
      </Modal>

      {/* 美观的 Toast 提示 */}
      {toast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[300] animate-fade-in">
          <div className="bg-gray-900/90 backdrop-blur-sm text-white px-5 py-3.5 rounded-2xl shadow-2xl max-w-[80vw]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">微信号已复制到剪贴板</div>
                <div className="text-xs text-gray-300 mt-0.5 truncate">{toast}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon, label, value, action }: { icon: string; label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3">
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-400">{label}
        </div>
        <div className="text-sm text-gray-700 mt-0.5 break-words">{value}</div>
      </div>
      {action}
    </div>
  )
}
