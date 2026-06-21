// 人物分组类型
export type GroupType = 'family' | 'friend' | 'colleague' | 'other'

// 性别
export type Gender = 'male' | 'female' | 'unknown'

// 人物卡片
export interface Person {
  id: string
  name: string
  phone?: string
  email?: string        // 电子邮箱
  address?: string      // 家庭住址
  occupation?: string   // 职业
  organization?: string // 所在单位
  wechat?: string       // 微信号
  avatar?: string
  group: GroupType
  customGroupLabel?: string // 自定义分组名称
  tags: string[]
  note?: string
  gender: Gender
  birthday?: string // YYYY-MM-DD
  isMe?: boolean // 是否为用户自己
  createdAt: number
  updatedAt: number
}

// 关系类型
export type RelationType =
  | 'parent'      // 父母
  | 'child'       // 子女
  | 'spouse'      // 配偶
  | 'sibling'     // 兄弟姐妹
  | 'relative'    // 亲戚
  | 'friend'      // 朋友
  | 'colleague'   // 同事
  | 'partner'     // 合作伙伴
  | 'classmate'   // 同学
  | 'other'       // 其他

// 人物关系
export interface Relation {
  id: string
  fromId: string
  toId: string
  type: RelationType
  note?: string
}

// 互动类型
export type InteractionType =
  | 'meeting'   // 会面
  | 'call'      // 通话
  | 'gift'      // 礼物
  | 'message'   // 消息
  | 'visit'     // 拜访
  | 'travel'    // 出行
  | 'date'      // 约会
  | 'custom'    // 自定义

// 互动记录
export interface Interaction {
  id: string
  personId: string         // 主联系人（向后兼容）
  personIds?: string[]     // 所有关联联系人（含主联系人，支持多选）
  type: InteractionType
  customType?: string // 自定义类型名（type 为 custom 时使用）
  content: string
  date: string // YYYY-MM-DD
  time?: string // HH:mm（可选时间）
  completed?: boolean // 是否完成（待办事项状态）
  createdAt: number
}

// 家族成员（扩展人物，增加世代信息）
export type Generation = 'grandparent' | 'parent' | 'self' | 'child' | 'grandchild'

export interface FamilyMember {
  id: string
  personId?: string // 关联到Person
  name: string
  gender: Gender
  generation: Generation
  relation: string // 与"我"的关系，如"父亲"、"表姐"
  avatar?: string // 头像（base64）
  birthday?: string
  note?: string
  parentIds: string[] // 父母ID
  spouseId?: string    // 配偶ID
  married?: boolean // 是否已婚（true=已婚配偶像线显示粉色虚线+婚字，false=未婚但有子女则用灰色实线连接）
  isMe?: boolean // 是否为用户自己
  createdAt: number
}

// 提醒事项
export interface Reminder {
  id: string
  personId: string
  type: 'birthday' | 'anniversary' | 'custom'
  title: string
  date: string // YYYY-MM-DD
  createdAt: number
}

// 照片（照片墙）
export interface Photo {
  id: string
  personId: string
  data: string // base64 压缩后的图片数据
  note?: string // 照片备注
  createdAt: number
}

// 分组配置
export const GROUP_LABELS: Record<GroupType, string> = {
  family: '家庭',
  friend: '朋友',
  colleague: '同事',
  other: '其他',
}

export const GROUP_COLORS: Record<GroupType, string> = {
  family: '#ef4444',
  friend: '#10b981',
  colleague: '#3b82f6',
  other: '#8b5cf6',
}

export const RELATION_LABELS: Record<RelationType, string> = {
  parent: '父母',
  child: '子女',
  spouse: '配偶',
  sibling: '兄弟姐妹',
  relative: '亲戚',
  friend: '朋友',
  colleague: '同事',
  partner: '合作伙伴',
  classmate: '同学',
  other: '其他',
}

export const INTERACTION_LABELS: Record<InteractionType, string> = {
  meeting: '会面',
  call: '通话',
  gift: '礼物',
  message: '消息',
  visit: '拜访',
  travel: '出行',
  date: '约会',
  custom: '自定义',
}

export const INTERACTION_ICONS: Record<InteractionType, string> = {
  meeting: '🤝',
  call: '📞',
  gift: '🎁',
  message: '💬',
  visit: '🚪',
  travel: '✈️',
  date: '❤️',
  custom: '✨',
}

export const GENERATION_LABELS: Record<Generation, string> = {
  grandparent: '祖辈',
  parent: '父辈',
  self: '同辈',
  child: '子辈',
  grandchild: '孙辈',
}
