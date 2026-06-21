import type { Person, Interaction } from '../types'
import { daysUntilBirthday } from './helpers'

export type SuggestionType = 'urgent' | 'warning' | 'info' | 'good'

export interface Suggestion {
  id: string
  type: SuggestionType
  person: Person
  title: string
  description: string
  action: string
}

// 计算距离上次互动的天数
function daysSinceLastInteraction(personId: string, interactions: Interaction[]): number | null {
  const personInteractions = interactions.filter((i) => i.personId === personId)
  if (personInteractions.length === 0) return null
  const lastDate = Math.max(...personInteractions.map((i) => new Date(i.date).getTime()))
  return Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24))
}

// 规则引擎：基于互动数据生成关系维护建议
export function generateSuggestions(persons: Person[], interactions: Interaction[]): Suggestion[] {
  const suggestions: Suggestion[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 排除"我"
  const others = persons.filter((p) => !p.isMe)

  for (const person of others) {
    const daysSince = daysSinceLastInteraction(person.id, interactions)
    const personInteractions = interactions.filter((i) => i.personId === person.id)
    const interactionCount = personInteractions.length
    const birthdayDays = person.birthday ? daysUntilBirthday(person.birthday) : null

    // 规则1：生日临近提醒（7天内）
    if (birthdayDays !== null && birthdayDays <= 7 && birthdayDays >= 0) {
      suggestions.push({
        id: `birthday-${person.id}`,
        type: birthdayDays === 0 ? 'urgent' : 'warning',
        person,
        title: birthdayDays === 0
          ? `今天是 ${person.name} 的生日`
          : `${person.name} 的生日还有 ${birthdayDays} 天`,
        description: person.birthday
          ? `生日：${person.birthday}，建议提前准备祝福或礼物`
          : '建议提前准备生日祝福',
        action: birthdayDays === 0 ? '立即发送祝福' : '设置提醒',
      })
    }

    // 规则2：从未互动过的联系人
    if (daysSince === null) {
      suggestions.push({
        id: `never-${person.id}`,
        type: 'info',
        person,
        title: `${person.name} 还没有任何互动记录`,
        description: `添加为联系人后尚未记录互动，建议主动联系建立关系`,
        action: '添加互动',
      })
      continue
    }

    // 规则3：超过90天未联系（紧急）
    if (daysSince > 90) {
      suggestions.push({
        id: `urgent-${person.id}`,
        type: 'urgent',
        person,
        title: `${person.name} 已 ${daysSince} 天未联系`,
        description: `关系可能正在疏远，建议尽快通过电话或会面重新建立联系`,
        action: '发起通话',
      })
    }
    // 规则4：超过60天未联系（提醒）
    else if (daysSince > 60) {
      suggestions.push({
        id: `warning-${person.id}`,
        type: 'warning',
        person,
        title: `${person.name} 已 ${daysSince} 天未联系`,
        description: `较长时间未互动，建议发条消息或约个时间聊聊`,
        action: '发消息',
      })
    }
    // 规则5：超过30天未联系（建议）
    else if (daysSince > 30) {
      suggestions.push({
        id: `info-${person.id}`,
        type: 'info',
        person,
        title: `${person.name} 已 ${daysSince} 天未联系`,
        description: `近期互动较少，可以找个话题聊聊近况`,
        action: '查看详情',
      })
    }

    // 规则6：互动频繁且近期有联系（良好）
    if (daysSince !== null && daysSince <= 14 && interactionCount >= 5) {
      suggestions.push({
        id: `good-${person.id}`,
        type: 'good',
        person,
        title: `与 ${person.name} 的关系维护得很好`,
        description: `已互动 ${interactionCount} 次，最近 ${daysSince} 天前有联系，继续保持！`,
        action: '',
      })
    }
  }

  // 排序：urgent > warning > info > good
  const typeOrder: Record<SuggestionType, number> = {
    urgent: 0,
    warning: 1,
    info: 2,
    good: 3,
  }

  return suggestions.sort((a, b) => {
    if (typeOrder[a.type] !== typeOrder[b.type]) {
      return typeOrder[a.type] - typeOrder[b.type]
    }
    // 同类型按生日临近度排序
    return 0
  })
}
