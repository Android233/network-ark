import { useState, useRef } from 'react'
import type { Person, GroupType, Gender } from '../types'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import { compressImage } from '../utils/helpers'

interface PersonFormProps {
  person?: Person
  onSubmit: (person: Omit<Person, 'id' | 'createdAt' | 'updatedAt'> | Person) => void
  onCancel: () => void
}

export default function PersonForm({ person, onSubmit, onCancel }: PersonFormProps) {
  const [name, setName] = useState(person?.name || '')
  const [phone, setPhone] = useState(person?.phone || '')
  const [email, setEmail] = useState(person?.email || '')
  const [address, setAddress] = useState(person?.address || '')
  const [occupation, setOccupation] = useState(person?.occupation || '')
  const [organization, setOrganization] = useState(person?.organization || '')
  const [wechat, setWechat] = useState(person?.wechat || '')
  const [gender, setGender] = useState<Gender>(person?.gender || 'unknown')
  const [tags, setTags] = useState(person?.tags.join('、') || '')
  const [note, setNote] = useState(person?.note || '')
  const [birthday, setBirthday] = useState(person?.birthday || '')
  const [avatar, setAvatar] = useState<string | undefined>(person?.avatar)
  const [customGroupLabel, setCustomGroupLabel] = useState(person?.customGroupLabel || '')
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showError = (msg: string) => setErrorMsg(msg)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      // 使用 react-image-file-resizer 压缩：400x400, JPEG 70%，通常压缩到几百KB以内
      const compressed = await compressImage(file, 400, 400, 70)
      setAvatar(compressed)
    } catch (err) {
      showError('图片压缩失败，请更换图片')
    }
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      showError('请输入姓名')
      return
    }
    if (!customGroupLabel.trim()) {
      showError('请输入分组名')
      return
    }

    const data = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      occupation: occupation.trim() || undefined,
      organization: organization.trim() || undefined,
      wechat: wechat.trim() || undefined,
      group: 'other' as GroupType,
      customGroupLabel: customGroupLabel.trim(),
      gender,
      tags: tags ? tags.split(/[,，、]/).map((t) => t.trim()).filter(Boolean) : [],
      note: note.trim() || undefined,
      birthday: birthday || undefined,
      avatar,
      isMe: person?.isMe || false,
    }

    if (person) {
      onSubmit({ ...person, ...data })
    } else {
      onSubmit(data)
    }
  }

  return (
    <div className="space-y-4">
      {/* 头像预览 */}
      <div className="flex justify-center mb-2">
        <div className="relative">
          <Avatar name={name || '?'} size={64} avatar={avatar} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white border-2 border-white shadow-md"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
      </div>

      {/* 姓名 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="请输入姓名"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 电话 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="请输入电话号码"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 电子邮箱 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">电子邮箱</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="请输入电子邮箱"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 微信号 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">微信号</label>
        <input
          type="text"
          value={wechat}
          onChange={(e) => setWechat(e.target.value)}
          placeholder="请输入微信号"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 职业 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">职业</label>
        <input
          type="text"
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
          placeholder="如：工程师、教师、设计师..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 所在单位 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">所在单位</label>
        <input
          type="text"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="如：XX科技有限公司、XX学校..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 家庭住址 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">家庭住址</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="请输入家庭住址"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 分组 - 纯自定义 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">分组 *</label>
        <input
          type="text"
          value={customGroupLabel}
          onChange={(e) => setCustomGroupLabel(e.target.value)}
          placeholder="请输入分组名（如：家人、朋友、同事、恋人...）"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
        {/* 快捷分组建议 */}
        <div className="flex flex-wrap gap-2 mt-2">
          {['家人', '朋友', '同事', '恋人', '同学', '客户'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCustomGroupLabel(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                customGroupLabel === s
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 性别 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">性别</label>
        <div className="flex gap-2">
          {([
            { value: 'male', label: '男' },
            { value: 'female', label: '女' },
            { value: 'unknown', label: '未知' },
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

      {/* 生日 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">生日</label>
        <input
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 标签 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="多个标签用顿号分隔"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 备注 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="添加备注信息..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
        />
      </div>

      {/* 按钮 */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium"
        >
          {person ? '保存' : '添加'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium"
        >
          取消
        </button>
      </div>

      {/* 美观的错误提示弹窗 */}
      <ConfirmDialog
        open={!!errorMsg}
        title="提示"
        message={errorMsg}
        confirmText="知道了"
        type="warning"
        singleButton
        onConfirm={() => setErrorMsg('')}
        onCancel={() => setErrorMsg('')}
      />
    </div>
  )
}
