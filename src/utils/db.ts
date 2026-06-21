import type { Person, Relation, Interaction, FamilyMember, Reminder, Photo } from '../types'
import { encryptFields, decryptFields, decryptFieldsBatch } from './crypto'

const DB_NAME = 'network-ark-db'
const DB_VERSION = 2

const STORES = {
  persons: 'persons',
  relations: 'relations',
  interactions: 'interactions',
  familyMembers: 'familyMembers',
  reminders: 'reminders',
  photos: 'photos',
} as const

let dbInstance: IDBDatabase | null = null

// 打开数据库
export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORES.persons)) {
        const store = db.createObjectStore(STORES.persons, { keyPath: 'id' })
        store.createIndex('group', 'group', { unique: false })
        store.createIndex('name', 'name', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.relations)) {
        const store = db.createObjectStore(STORES.relations, { keyPath: 'id' })
        store.createIndex('fromId', 'fromId', { unique: false })
        store.createIndex('toId', 'toId', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.interactions)) {
        const store = db.createObjectStore(STORES.interactions, { keyPath: 'id' })
        store.createIndex('personId', 'personId', { unique: false })
        store.createIndex('date', 'date', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.familyMembers)) {
        const store = db.createObjectStore(STORES.familyMembers, { keyPath: 'id' })
        store.createIndex('generation', 'generation', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.reminders)) {
        const store = db.createObjectStore(STORES.reminders, { keyPath: 'id' })
        store.createIndex('personId', 'personId', { unique: false })
        store.createIndex('date', 'date', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.photos)) {
        const store = db.createObjectStore(STORES.photos, { keyPath: 'id' })
        store.createIndex('personId', 'personId', { unique: false })
      }
    }
  })
}

// 通用CRUD操作
async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

async function add<T>(storeName: string, data: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.add(data)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function put<T>(storeName: string, data: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.put(data)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ===== Person 操作 =====
// 注意：Person 的敏感字段（phone/email/address/wechat/note/birthday）会自动加密存储
export const personDB = {
  getAll: async () => {
    const data = await getAll<Person>(STORES.persons)
    return decryptFieldsBatch(data)
  },
  getById: async (id: string) => {
    const data = await getById<Person>(STORES.persons, id)
    return data ? decryptFields(data) : undefined
  },
  add: async (person: Person) => {
    const encrypted = await encryptFields(person)
    return add(STORES.persons, encrypted)
  },
  update: async (person: Person) => {
    const encrypted = await encryptFields(person)
    return put(STORES.persons, encrypted)
  },
  remove: (id: string) => remove(STORES.persons, id),
  bulkAdd: async (persons: Person[]) => {
    for (const p of persons) {
      const encrypted = await encryptFields(p)
      await add(STORES.persons, encrypted)
    }
  },
}

// ===== Relation 操作 =====
export const relationDB = {
  getAll: () => getAll<Relation>(STORES.relations),
  getById: (id: string) => getById<Relation>(STORES.relations, id),
  add: (relation: Relation) => add(STORES.relations, relation),
  update: (relation: Relation) => put(STORES.relations, relation),
  remove: (id: string) => remove(STORES.relations, id),
}

// ===== Interaction 操作 =====
export const interactionDB = {
  getAll: () => getAll<Interaction>(STORES.interactions),
  getByPerson: async (personId: string) => {
    const all = await getAll<Interaction>(STORES.interactions)
    return all.filter((i) => i.personId === personId)
  },
  add: (interaction: Interaction) => add(STORES.interactions, interaction),
  update: (interaction: Interaction) => put(STORES.interactions, interaction),
  remove: (id: string) => remove(STORES.interactions, id),
}

// ===== FamilyMember 操作 =====
export const familyDB = {
  getAll: () => getAll<FamilyMember>(STORES.familyMembers),
  getById: (id: string) => getById<FamilyMember>(STORES.familyMembers, id),
  add: (member: FamilyMember) => add(STORES.familyMembers, member),
  update: (member: FamilyMember) => put(STORES.familyMembers, member),
  remove: (id: string) => remove(STORES.familyMembers, id),
}

// ===== Reminder 操作 =====
export const reminderDB = {
  getAll: () => getAll<Reminder>(STORES.reminders),
  getByPerson: async (personId: string) => {
    const all = await getAll<Reminder>(STORES.reminders)
    return all.filter((r) => r.personId === personId)
  },
  add: (reminder: Reminder) => add(STORES.reminders, reminder),
  update: (reminder: Reminder) => put(STORES.reminders, reminder),
  remove: (id: string) => remove(STORES.reminders, id),
}

// ===== Photo 操作 =====
export const photoDB = {
  getAll: () => getAll<Photo>(STORES.photos),
  getByPerson: async (personId: string) => {
    const all = await getAll<Photo>(STORES.photos)
    return all.filter((p) => p.personId === personId).sort((a, b) => b.createdAt - a.createdAt)
  },
  add: (photo: Photo) => add(STORES.photos, photo),
  update: (photo: Photo) => put(STORES.photos, photo),
  remove: (id: string) => remove(STORES.photos, id),
}

// 生成唯一ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

// 清空所有数据
export async function clearAllData(): Promise<void> {
  await clearStore(STORES.persons)
  await clearStore(STORES.relations)
  await clearStore(STORES.interactions)
  await clearStore(STORES.familyMembers)
  await clearStore(STORES.reminders)
  await clearStore(STORES.photos)
}
