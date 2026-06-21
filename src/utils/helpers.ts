// 工具函数
import { pinyin } from 'pinyin-pro'

// 格式化日期
export function formatDate(date: string | number | Date): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 格式化日期为中文
export function formatDateCN(date: string | number | Date): string {
  const d = new Date(date)
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}月${day}日`
}

// 获取相对时间描述
export function getRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < week) return `${Math.floor(diff / day)}天前`
  if (diff < month) return `${Math.floor(diff / week)}周前`
  return formatDate(timestamp)
}

// 计算距离生日还有多少天
export function daysUntilBirthday(birthday: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const birthDate = new Date(birthday)
  const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())
  
  if (thisYearBirthday < today) {
    thisYearBirthday.setFullYear(today.getFullYear() + 1)
  }
  
  const diff = thisYearBirthday.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// 获取星座
export function getZodiacSign(birthday: string): string {
  const date = new Date(birthday)
  const month = date.getMonth() + 1
  const day = date.getDate()
  
  const zodiacs: [number, number, string][] = [
    [3, 21, '白羊座'], [4, 20, '金牛座'], [5, 21, '双子座'],
    [6, 22, '巨蟹座'], [7, 23, '狮子座'], [8, 23, '处女座'],
    [9, 23, '天秤座'], [10, 24, '天蝎座'], [11, 23, '射手座'],
    [12, 22, '摩羯座'], [1, 20, '水瓶座'], [2, 19, '双鱼座'],
  ]
  
  for (let i = 0; i < zodiacs.length; i++) {
    const [m, d, name] = zodiacs[i]
    const next = zodiacs[(i + 1) % zodiacs.length]
    if ((month === m && day >= d) || (month === next[0] && day < next[1])) {
      return name
    }
  }
  
  return '未知'
}

// 获取年龄
export function getAge(birthday: string): number {
  const birth = new Date(birthday)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

// 生成头像颜色（基于名字）
export function getAvatarColor(name: string): string {
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// 获取姓名首字
export function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

// 获取名字的拼音首字母（使用 pinyin-pro 库，支持多音字和生僻字）
export function getPinyinInitial(name: string): string {
  if (!name) return '#'
  const firstChar = name.charAt(0)

  // 英文字母直接返回大写
  if (/[a-zA-Z]/.test(firstChar)) {
    return firstChar.toUpperCase()
  }

  // 数字开头归到 #
  if (/[0-9]/.test(firstChar)) {
    return '#'
  }

  // 使用 pinyin-pro 获取拼音，pattern: 'first' 只取首字母，toneType: 'none' 无声调
  const result = pinyin(firstChar, { pattern: 'first', toneType: 'none' })
  // pinyin-pro 对非汉字字符返回原字符，过滤掉
  if (result && /[a-zA-Z]/.test(result)) {
    return result.toUpperCase()
  }

  // 其他返回 #
  return '#'
}

// 防抖
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// 计算关系健康度（0-100）- 简化版（向后兼容）
export function calculateHealthScore(
  lastInteractionTime: number,
  interactionCount: number
): number {
  return calculateHealthScoreDetailed(lastInteractionTime, interactionCount, []).total
}

// 关系健康度维度评分明细
export interface HealthBreakdown {
  frequency: number    // 互动频率 0-20
  recency: number      // 近期联系 0-25
  diversity: number    // 互动多样性 0-15
  trend: number        // 互动趋势 0-15
  consistency: number  // 关系稳定性 0-15
  bonus: number        // 特殊加分 0-10
  total: number        // 总分 0-100
}

// 精细化关系健康度评分（多维度）
// interactionTimes: 所有互动的时间戳数组（用于趋势和稳定性分析）
// interactionTypes: 所有互动的类型数组（用于多样性分析）
export function calculateHealthScoreDetailed(
  lastInteractionTime: number,
  interactionCount: number,
  interactionTimestamps: number[],
  interactionTypes?: string[]
): HealthBreakdown {
  const now = Date.now()
  const DAY = 1000 * 60 * 60 * 24
  const daysSinceLastInteraction = Math.floor((now - lastInteractionTime) / DAY)

  // ===== 1. 互动频率（0-20）=====
  // 使用对数曲线：前几次互动加分快，之后递减
  // 5次=10分, 10次=14分, 20次=17分, 50次=20分
  let frequency = 0
  if (interactionCount > 0) {
    frequency = Math.min(20, Math.round(Math.log2(interactionCount + 1) * 5))
  }

  // ===== 2. 近期联系（0-25）=====
  // 更精细的时间衰减
  let recency = 0
  if (interactionCount === 0) {
    recency = 0
  } else if (daysSinceLastInteraction <= 3) {
    recency = 25  // 3天内
  } else if (daysSinceLastInteraction <= 7) {
    recency = 22  // 一周内
  } else if (daysSinceLastInteraction <= 14) {
    recency = 18  // 两周内
  } else if (daysSinceLastInteraction <= 30) {
    recency = 14  // 一个月内
  } else if (daysSinceLastInteraction <= 60) {
    recency = 8   // 两个月内
  } else if (daysSinceLastInteraction <= 90) {
    recency = 4   // 三个月内
  } else if (daysSinceLastInteraction <= 180) {
    recency = 2   // 半年内
  }
  // 超过半年 = 0分

  // ===== 3. 互动多样性（0-15）=====
  // 不同类型的互动越多，关系越丰富
  let diversity = 0
  if (interactionTypes && interactionTypes.length > 0) {
    const uniqueTypes = new Set(interactionTypes).size
    // 1种=5分, 2种=9分, 3种=12分, 4种+=15分
    diversity = Math.min(15, uniqueTypes * 4 + Math.max(0, uniqueTypes - 3) * 3)
  }

  // ===== 4. 互动趋势（0-15）=====
  // 比较最近30天和前30天的互动频率
  let trend = 7 // 默认中性
  if (interactionTimestamps.length >= 2) {
    const thirtyDaysAgo = now - 30 * DAY
    const sixtyDaysAgo = now - 60 * DAY
    const recentCount = interactionTimestamps.filter((t) => t >= thirtyDaysAgo).length
    const previousCount = interactionTimestamps.filter((t) => t >= sixtyDaysAgo && t < thirtyDaysAgo).length
    if (previousCount === 0) {
      // 之前没有互动，现在有 = 上升趋势
      trend = recentCount > 0 ? 13 : 5
    } else {
      const ratio = recentCount / previousCount
      if (ratio >= 2) trend = 15        // 翻倍增长
      else if (ratio >= 1.5) trend = 13 // 显著增长
      else if (ratio >= 1) trend = 11   // 持平或微增
      else if (ratio >= 0.5) trend = 7  // 下降
      else if (ratio > 0) trend = 4     // 显著下降
      else trend = 2                    // 完全停止
    }
  }

  // ===== 5. 关系稳定性（0-15）=====
  // 互动是否分散在不同时间段（而非集中在一次）
  let consistency = 0
  if (interactionTimestamps.length >= 2) {
    // 计算互动时间跨度的天数
    const sortedTimes = [...interactionTimestamps].sort((a, b) => a - b)
    const spanDays = Math.max(1, (sortedTimes[sortedTimes.length - 1] - sortedTimes[0]) / DAY)
    // 互动密度 = 互动次数 / 跨度天数
    const density = interactionCount / spanDays
    // 理想密度：每周至少1次互动（1/7 ≈ 0.14）
    if (density >= 0.14) consistency = 15
    else if (density >= 0.07) consistency = 12  // 每两周1次
    else if (density >= 0.03) consistency = 9   // 每月1次
    else if (density >= 0.01) consistency = 6   // 每季度1次
    else consistency = 3
    // 如果只有1-2次互动且都在同一天，稳定性低
    if (interactionCount <= 2 && spanDays < 1) consistency = Math.min(consistency, 4)
  } else if (interactionCount === 1) {
    consistency = 3
  }

  // ===== 6. 特殊加分（0-10）=====
  let bonus = 0
  // 近7天有互动 +5
  if (daysSinceLastInteraction <= 7 && interactionCount > 0) bonus += 5
  // 互动次数超过20 +3（长期维护）
  if (interactionCount >= 20) bonus += 3
  // 互动次数超过50 +2（深度关系）
  if (interactionCount >= 50) bonus += 2
  bonus = Math.min(bonus, 10)

  const total = Math.min(frequency + recency + diversity + trend + consistency + bonus, 100)

  return {
    frequency,
    recency,
    diversity,
    trend,
    consistency,
    bonus,
    total,
  }
}

// 获取健康度等级
export function getHealthLevel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: '优秀', color: '#10b981' }
  if (score >= 60) return { label: '良好', color: '#3b82f6' }
  if (score >= 40) return { label: '一般', color: '#f59e0b' }
  if (score >= 20) return { label: '需关注', color: '#f97316' }
  return { label: '需维护', color: '#ef4444' }
}

// 压缩图片文件为 base64（使用原生 Canvas API）
// maxWidth/maxHeight: 最大尺寸（保持比例），quality: 质量 0-100
export function compressImage(
  file: File,
  maxWidth = 400,
  maxHeight = 400,
  quality = 70
): Promise<string> {
  return new Promise((resolve, reject) => {
    // 校验文件类型
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'))
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        // 按比例计算新尺寸（不放大原图）
        let { width, height } = img
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建画布上下文'))
          return
        }
        // 白底（避免 PNG 透明背景变黑）
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', quality / 100)
          resolve(dataUrl)
        } catch (err) {
          reject(new Error('图片编码失败，可能为不支持的格式'))
        }
      }
      img.onerror = () => reject(new Error('图片加载失败，请更换图片'))
      const result = e.target?.result
      if (typeof result === 'string') {
        img.src = result
      } else {
        reject(new Error('文件读取结果无效'))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 导出 ECharts 图表为图片并分享/下载
 * 在 Capacitor 原生环境中使用 Share 插件分享图片文件
 * 在浏览器中尝试 Web Share API，最后回退到下载链接
 * @param dataUrl ECharts getDataURL 返回的 data URL
 * @param filename 文件名（不含扩展名）
 */
export async function exportChartImage(dataUrl: string, filename: string): Promise<void> {
  // 从 data URL 提取 base64 数据
  const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl

  // 方案1：Capacitor 原生环境 - 使用 Filesystem + Share
  try {
    const cap = (window as any).Capacitor
    if (cap?.isNative?.()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const { Share } = await import('@capacitor/share')

      // 写入临时文件
      const fileName = `${filename}_${Date.now()}.png`
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      })

      // 获取文件 URI 并分享
      const uriResult = await Filesystem.getUri({
        directory: Directory.Cache,
        path: fileName,
      })

      await Share.share({
        title: filename,
        url: uriResult.uri,
      })
      return
    }
  } catch (err) {
    console.warn('Capacitor Share failed, falling back:', err)
  }

  // 方案2：Web Share API（支持文件分享的浏览器）
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], `${filename}.png`, { type: 'image/png' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename })
      return
    }
  } catch (err) {
    // 用户取消分享不算错误
    if (err instanceof Error && err.name === 'AbortError') return
    console.warn('Web Share failed, falling back:', err)
  }

  // 方案3：下载链接（桌面浏览器）
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
