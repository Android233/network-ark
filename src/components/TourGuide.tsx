import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../utils/i18n'

export interface TourStep {
  icon: string
  titleKey: string
  descKey: string
}

interface TourGuideProps {
  step: number
  total: number
  steps: (TourStep & { tab?: string })[]
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export default function TourGuide({
  step,
  total,
  steps,
  onNext,
  onPrev,
  onClose,
}: TourGuideProps) {
  const { t } = useLanguage()
  const current = steps[step]
  const isFirst = step === 0
  const isLast = step === total - 1
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)
  const rafRef = useRef<number | null>(null)

  // 查找当前步骤对应的底部导航按钮，获取其位置以创建聚光灯
  useEffect(() => {
    const updateSpotlight = () => {
      if (current?.tab) {
        const el = document.querySelector(`[data-tab="${current.tab}"]`) as HTMLElement
        if (el) {
          setSpotlightRect(el.getBoundingClientRect())
          return
        }
      }
      setSpotlightRect(null)
    }

    updateSpotlight()
    // 延迟再次更新，确保 tab 切换后布局已稳定
    const timer = setTimeout(updateSpotlight, 100)

    const handleResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateSpotlight)
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [current, step])

  // 计算聚光灯位置和大小
  const spotlight = spotlightRect
    ? {
        left: spotlightRect.left + spotlightRect.width / 2,
        top: spotlightRect.top + spotlightRect.height / 2,
        radius: Math.max(spotlightRect.width, spotlightRect.height) / 2 + 12,
      }
    : null

  // 提示卡片位置：默认在底部导航上方
  const cardPosition = spotlightRect
    ? { bottom: window.innerHeight - spotlightRect.top + 12 }
    : { bottom: 90 }

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* 半透明遮罩 + 聚光灯镂空（不模糊背景） */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-auto"
        onClick={onClose}
        style={{ backgroundColor: 'transparent' }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlight && (
              <circle
                cx={spotlight.left}
                cy={spotlight.top}
                r={spotlight.radius}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.45)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* 聚光灯边框高亮（在镂空区域周围画一个圆环） */}
      {spotlight && (
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            left: spotlight.left - spotlight.radius,
            top: spotlight.top - spotlight.radius,
            width: spotlight.radius * 2,
            height: spotlight.radius * 2,
            boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.8), 0 0 20px 4px rgba(59, 130, 246, 0.4)',
          }}
        />
      )}

      {/* 小型提示卡片 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[88%] max-w-xs pointer-events-auto animate-slide-up"
        style={cardPosition}
      >
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
          {/* 顶部渐变条 */}
          <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

          {/* 内容区 - 紧凑布局 */}
          <div className="px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="text-3xl flex-shrink-0 leading-none mt-0.5">{current.icon}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-900 mb-1">
                  {t(current.titleKey)}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {t(current.descKey)}
                </p>
              </div>
            </div>

            {/* 进度指示器 */}
            <div className="flex gap-1 mt-2.5 mb-2">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-0.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? 'w-5 bg-blue-600'
                      : i < step
                      ? 'w-1 bg-blue-300'
                      : 'w-1 bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {/* 按钮区 */}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-xs text-gray-400 hover:text-gray-600 font-medium px-1"
              >
                {t('tour.skip')}
              </button>
              <div className="flex-1" />
              {!isFirst && (
                <button
                  onClick={onPrev}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200"
                >
                  {t('tour.prev')}
                </button>
              )}
              <button
                onClick={onNext}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium text-white ${
                  isLast
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isLast ? t('tour.done') : t('tour.next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
