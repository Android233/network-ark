import { useRef, useEffect, useCallback } from 'react'
import type * as echarts from 'echarts'

/**
 * ECharts 移动端触摸工具
 * 解决 Capacitor WebView 中 chart.on('click') 不触发的问题
 * 使用长按检测弹出详情页，避免与拖拽/缩放冲突
 * 同时提供缩放控制
 */

interface TouchStart {
  x: number
  y: number
  time: number
}

/**
 * 绑定移动端长按事件到 ECharts 图表
 * 在手机上长按节点时触发回调（长按 500ms，移动距离 <15px）
 */
export function useChartTouchTap(
  chartRef: React.RefObject<HTMLDivElement | null>,
  chartInstance: React.RefObject<echarts.ECharts | null>,
  onNodeTap: (nodeData: any) => void,
  nodeDataKey: string = 'data'
) {
  const touchStartRef = useRef<TouchStart | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasFiredRef = useRef(false)

  useEffect(() => {
    const container = chartRef.current
    if (!container) return

    const findNodeAtPosition = (x: number, y: number): any => {
      const chart = chartInstance.current
      if (!chart) return null
      try {
        const seriesModel = (chart as any).getModel()?.getSeriesByIndex(0)
        if (!seriesModel) return null
        const data = seriesModel.getData()
        let nearestNode: any = null
        let nearestDist = Infinity

        for (let i = 0; i < data.count(); i++) {
          const layout = data.getItemLayout(i)
          if (!layout || !Array.isArray(layout)) continue
          const pixelPoint = chart.convertToPixel(
            { seriesIndex: 0 },
            [layout[0], layout[1]]
          )
          if (!pixelPoint) continue

          const nodeDist = Math.sqrt(
            (x - pixelPoint[0]) ** 2 + (y - pixelPoint[1]) ** 2
          )
          const symbolSize = data.getItemVisual(i, 'symbolSize')
          const threshold = (typeof symbolSize === 'number' ? symbolSize : 40) / 2 + 15

          if (nodeDist < threshold && nodeDist < nearestDist) {
            nearestDist = nodeDist
            nearestNode = data.get(nodeDataKey, i)
          }
        }
        return nearestNode
      } catch {
        return null
      }
    }

    const clearLongPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const rect = container.getBoundingClientRect()
        const x = e.touches[0].clientX - rect.left
        const y = e.touches[0].clientY - rect.top
        touchStartRef.current = { x, y, time: Date.now() }
        hasFiredRef.current = false

        // 设置长按定时器（500ms 后触发）
        clearLongPress()
        longPressTimerRef.current = setTimeout(() => {
          const touchStart = touchStartRef.current
          if (!touchStart || hasFiredRef.current) return
          // 检查手指是否还在屏幕上
          // 注意：touchstart 后如果手指移动了，touchStartRef 会在 touchmove 中更新
          const node = findNodeAtPosition(touchStart.x, touchStart.y)
          if (node) {
            hasFiredRef.current = true
            onNodeTap(node)
            // 触觉反馈
            if (navigator.vibrate) navigator.vibrate(30)
          }
        }, 500)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      const rect = container.getBoundingClientRect()
      const x = e.touches[0].clientX - rect.left
      const y = e.touches[0].clientY - rect.top
      const dx = x - touchStartRef.current.x
      const dy = y - touchStartRef.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      // 移动超过 15px 取消长按
      if (dist > 15) {
        clearLongPress()
        touchStartRef.current = null
      }
    }

    const handleTouchEnd = () => {
      clearLongPress()
      touchStartRef.current = null
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      clearLongPress()
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [chartRef, chartInstance, onNodeTap, nodeDataKey])
}

/**
 * ECharts 缩放控制
 * 提供 zoomIn / zoomOut / reset 方法
 */
export function useChartZoom(
  chartInstance: React.RefObject<echarts.ECharts | null>
) {
  const zoomIn = useCallback(() => {
    const chart = chartInstance.current
    if (!chart) return
    chart.dispatchAction({
      type: 'graphRoam',
      seriesIndex: 0,
      zoom: 1.3,
      originX: chart.getWidth() / 2,
      originY: chart.getHeight() / 2,
    })
  }, [chartInstance])

  const zoomOut = useCallback(() => {
    const chart = chartInstance.current
    if (!chart) return
    chart.dispatchAction({
      type: 'graphRoam',
      seriesIndex: 0,
      zoom: 0.77,
      originX: chart.getWidth() / 2,
      originY: chart.getHeight() / 2,
    })
  }, [chartInstance])

  const resetZoom = useCallback(() => {
    const chart = chartInstance.current
    if (!chart) return
    // 通过 setOption 重置 roam
    chart.setOption({
      series: [{ zoom: 1, center: undefined }],
    } as any)
  }, [chartInstance])

  return { zoomIn, zoomOut, resetZoom }
}
