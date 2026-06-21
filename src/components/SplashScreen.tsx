import { useState, useEffect, useCallback } from 'react'

/**
 * Web 层开屏覆盖层
 * - 显示开屏图片 500ms 后自动关闭
 * - 右上角提供"跳过"按钮，可立即关闭
 * - 与原生 SplashScreen 衔接：原生显示 500ms 后，WebView 已加载，本组件接管显示
 */
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  const dismiss = useCallback(() => {
    setFading(true)
    // 淡出动画 200ms 后卸载
    setTimeout(() => {
      setVisible(false)
      onDone()
    }, 200)
  }, [onDone])

  useEffect(() => {
    // 立即隐藏原生 SplashScreen（由 Web 层接管）
    import('@capacitor/splash-screen')
      .then(({ SplashScreen }) => SplashScreen.hide())
      .catch(() => {
        // Web 环境下忽略
      })

    // 显示 3000ms 后自动关闭
    const timer = setTimeout(dismiss, 3000)
    return () => clearTimeout(timer)
  }, [dismiss])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-white transition-opacity duration-200 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* 开屏图片 */}
      <img
        src="/splash.png"
        alt="开屏"
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* 右上角跳过按钮 */}
      <button
        onClick={dismiss}
        className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/30 text-white text-sm backdrop-blur-sm hover:bg-black/40 transition-colors"
        style={{ paddingTop: '6px', paddingBottom: '6px' }}
      >
        跳过
      </button>
    </div>
  )
}
