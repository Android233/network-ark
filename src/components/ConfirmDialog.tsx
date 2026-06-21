import { useState, useEffect } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  onConfirm?: () => void
  onCancel?: () => void
  singleButton?: boolean // 单按钮模式（仅显示确认按钮）
}

export default function ConfirmDialog({
  open,
  title = '确认操作',
  message,
  confirmText = '确定',
  cancelText = '取消',
  type = 'danger',
  onConfirm,
  onCancel,
  singleButton = false,
}: ConfirmDialogProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [open])

  if (!open) return null

  const config = {
    danger: {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
      iconBg: 'from-red-400 to-rose-500',
      iconShadow: 'shadow-red-500/30',
      btnBg: 'bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600',
      accent: 'text-red-500',
    },
    warning: {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
      iconBg: 'from-amber-400 to-orange-500',
      iconShadow: 'shadow-amber-500/30',
      btnBg: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600',
      accent: 'text-amber-500',
    },
    info: {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      ),
      iconBg: 'from-blue-400 to-indigo-500',
      iconShadow: 'shadow-blue-500/30',
      btnBg: 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600',
      accent: 'text-blue-500',
    },
  }[type]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-8">
      {/* 遮罩 - 带模糊效果 */}
      <div
        className={`absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onCancel}
      />

      {/* 弹窗 */}
      <div
        className={`relative bg-white rounded-3xl w-full max-w-[300px] overflow-hidden shadow-2xl transition-all duration-300 ${
          visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
        }`}
      >
        {/* 顶部装饰条 */}
        <div className={`h-1.5 bg-gradient-to-r ${config.iconBg}`} />

        {/* 图标区域 - 渐变背景圆形 */}
        <div className="flex justify-center pt-7 pb-4">
          <div
            className={`w-16 h-16 rounded-full bg-gradient-to-br ${config.iconBg} ${config.iconShadow} flex items-center justify-center text-white shadow-lg`}
          >
            {config.icon}
          </div>
        </div>

        {/* 内容 */}
        <div className="px-6 pb-3 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-1.5">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>

        {/* 按钮 */}
        <div className="flex gap-2.5 px-5 pb-5 pt-2">
          {!singleButton && (
            <button
              onClick={onCancel}
              className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-2xl text-sm font-medium hover:bg-gray-200 active:scale-95 transition-all"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 text-white rounded-2xl text-sm font-medium shadow-md active:scale-95 transition-all ${config.btnBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
