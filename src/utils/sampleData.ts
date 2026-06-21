import type { Person, FamilyMember } from '../types'
import { GROUP_LABELS } from '../types'
import { personDB, relationDB, familyDB, generateId } from './db'

export async function initSampleData(): Promise<void> {
  const existing = await personDB.getAll()
  // 如果已经有数据，检查是否需要补充"我"
  if (existing.length > 0) {
    const hasMe = existing.some((p) => p.isMe)
    if (!hasMe) {
      // 旧数据没有"我"，添加一个
      const now = Date.now()
      const me: Person = {
        id: generateId(),
        name: '我',
        group: 'other',
        tags: ['本人'],
        gender: 'unknown',
        isMe: true,
        createdAt: now,
        updatedAt: now,
      }
      await personDB.add(me)
    }
    // 同样检查家族成员中的"我"
    const existingFamily = await familyDB.getAll()
    const hasFamilyMe = existingFamily.some((m) => m.isMe)
    if (!hasFamilyMe) {
      // 查找已有的"我"（可能没有 isMe 标记）
      const oldMe = existingFamily.find((m) => m.relation === '本人' || m.name === '我')
      if (oldMe) {
        // 给已有的"我"补上 isMe 标记，避免重复
        await familyDB.update({ ...oldMe, isMe: true })
      } else {
        // 完全没有"我"，新增一个
        const now = Date.now()
        const familyMe: FamilyMember = {
          id: generateId(),
          name: '我',
          gender: 'unknown',
          generation: 'self',
          relation: '本人',
          parentIds: [],
          isMe: true,
          createdAt: now,
        }
        await familyDB.add(familyMe)
      }
    }
    return
  }

  // 没有任何数据，只初始化"我"（不创建示例数据）
  const now = Date.now()

  // 创建"我"的联系人卡片
  const me: Person = {
    id: generateId(),
    name: '我',
    group: 'other',
    tags: ['本人'],
    gender: 'unknown',
    isMe: true,
    createdAt: now,
    updatedAt: now,
  }
  await personDB.add(me)

  // 创建"我"的家族成员
  const familyMe: FamilyMember = {
    id: generateId(),
    name: '我',
    gender: 'unknown',
    generation: 'self',
    relation: '本人',
    parentIds: [],
    isMe: true,
    createdAt: now,
  }
  await familyDB.add(familyMe)
}

// CSV导入
export function parseCSV(csvText: string): Partial<Person>[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const persons: Partial<Person>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const person: Partial<Person> = {
      tags: [],
      gender: 'unknown',
    }

    headers.forEach((header, idx) => {
      const value = values[idx] || ''
      switch (header) {
        case 'name':
        case '姓名':
          person.name = value
          break
        case 'phone':
        case '电话':
          person.phone = value
          break
        case 'group':
        case '分组':
        case 'customgrouplabel':
          person.customGroupLabel = value || '未分组'
          break
        case 'email':
        case '邮箱':
          person.email = value
          break
        case 'wechat':
        case '微信':
          person.wechat = value
          break
        case 'occupation':
        case '职业':
          person.occupation = value
          break
        case 'organization':
        case '单位':
          person.organization = value
          break
        case 'address':
        case '住址':
          person.address = value
          break
        case 'tags':
        case '标签':
          person.tags = value ? value.split(';').map((t) => t.trim()) : []
          break
        case 'note':
        case '备注':
          person.note = value
          break
        case 'birthday':
        case '生日':
          person.birthday = value
          break
        case 'gender':
        case '性别':
          if (value === '男' || value === 'male') person.gender = 'male'
          else if (value === '女' || value === 'female') person.gender = 'female'
          break
      }
    })

    if (person.name) {
      persons.push(person)
    }
  }

  return persons
}

// 解析 vCard 文件内容
export function parseVCard(vcardText: string): Partial<Person>[] {
  const persons: Partial<Person>[] = []
  // 按 BEGIN:VCARD ... END:VCARD 分割
  const blocks = vcardText.split(/BEGIN:VCARD/i).slice(1)

  for (const block of blocks) {
    const endIdx = block.search(/END:VCARD/i)
    const content = endIdx >= 0 ? block.substring(0, endIdx) : block
    const lines = content.split(/\r?\n/).filter((l) => l.trim())

    const person: Partial<Person> = {
      tags: [],
      gender: 'unknown',
      customGroupLabel: '未分组',
    }

    for (const line of lines) {
      // vCard 行格式：PROPERTY;PARAMS:VALUE 或 PROPERTY:VALUE
      const colonIdx = line.indexOf(':')
      if (colonIdx < 0) continue

      const propPart = line.substring(0, colonIdx).toUpperCase()
      const value = line.substring(colonIdx + 1).trim()

      // 处理带参数的属性（如 TEL;TYPE=CELL:13800138000）
      const propName = propPart.split(';')[0]

      switch (propName) {
        case 'FN':
        case 'N':
          if (!person.name) {
            // N 格式：姓;名;中间名;前缀;后缀
            if (propName === 'N') {
              const parts = value.split(';')
              person.name = (parts[0] + parts[1]).trim() || value
            } else {
              person.name = value
            }
          }
          break
        case 'TEL':
          person.phone = value.replace(/[\s\-()]/g, '')
          break
        case 'EMAIL':
          person.email = value
          break
        case 'ADR':
          // ADR 格式：邮编;扩展;街道;城市;省份;邮编;国家
          {
            const parts = value.split(';')
            const addr = [parts[2], parts[3], parts[4], parts[5], parts[6]]
              .filter((p) => p && p.trim())
              .join(' ')
            if (addr) person.address = addr
          }
          break
        case 'BDAY':
          person.birthday = value.replace(/-/g, '-').substring(0, 10)
          break
        case 'NOTE':
          person.note = value
          break
        case 'TITLE':
          person.occupation = value
          break
        case 'ORG':
          person.organization = value.split(';')[0]
          break
        case 'CATEGORIES':
        case 'X-ADDRESSBOOKSERVER-KIND':
          if (propName === 'CATEGORIES') {
            person.tags = value.split(',').map((t) => t.trim())
          }
          break
        case 'X-GENDER':
        case 'GENDER':
          if (value === '男' || value === 'male' || value === 'M') person.gender = 'male'
          else if (value === '女' || value === 'female' || value === 'F') person.gender = 'female'
          break
        case 'X-WECHAT':
        case 'X-WX':
          person.wechat = value
          break
        case 'X-GROUP':
        case 'X-CATEGORY':
          if (value) person.customGroupLabel = value
          break
      }
    }

    if (person.name) {
      persons.push(person)
    }
  }

  return persons
}

export async function importPersons(persons: Partial<Person>[]): Promise<number> {
  const now = Date.now()
  let count = 0

  // 获取"我"用于自动创建关系
  const allPersons = await personDB.getAll()
  const me = allPersons.find((p) => p.isMe)

  for (const p of persons) {
    if (!p.name) continue
    const person: Person = {
      id: generateId(),
      name: p.name,
      phone: p.phone,
      email: p.email,
      wechat: p.wechat,
      occupation: p.occupation,
      organization: p.organization,
      address: p.address,
      group: 'other',
      customGroupLabel: p.customGroupLabel || '未分组',
      tags: p.tags || [],
      note: p.note,
      gender: p.gender || 'unknown',
      birthday: p.birthday,
      createdAt: now,
      updatedAt: now,
    }
    await personDB.add(person)
    count++

    // 自动创建与"我"的关系，关系备注为分组名
    if (me && me.id !== person.id) {
      await relationDB.add({
        id: generateId(),
        fromId: me.id,
        toId: person.id,
        type: 'other',
        note: person.customGroupLabel,
      })
    }
  }

  return count
}

// 导出数据为CSV
export function exportPersonsCSV(persons: Person[]): string {
  const headers = ['姓名', '电话', '分组', '标签', '备注', '生日']
  const rows = persons.map((p) => [
    p.name,
    p.phone || '',
    GROUP_LABELS[p.group],
    p.tags.join(';'),
    p.note || '',
    p.birthday || '',
  ])

  return [headers, ...rows].map((row) => row.join(',')).join('\n')
}
