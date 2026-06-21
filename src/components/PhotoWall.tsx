import { useState, useRef } from 'react'
import type { Photo } from '../types'
import { photoDB, generateId } from '../utils/db'
import { compressImage } from '../utils/helpers'
import { useLanguage } from '../utils/i18n'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'

interface PhotoWallProps {
  ownerId: string // 照片关联的 ID（联系人 ID 或 family_${memberId}）
  photos: Photo[]
  onRefresh: () => void
}

export default function PhotoWall({ ownerId, photos, onRefresh }: PhotoWallProps) {
  const { t } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [viewerPhoto, setViewerPhoto] = useState<Photo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null)
  const [noteTarget, setNoteTarget] = useState<Photo | null>(null)
  const [noteValue, setNoteValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 上传照片（支持多选）
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const compressed = await compressImage(file, 1200, 1200, 75)
        await photoDB.add({
          id: generateId(),
          personId: ownerId,
          data: compressed,
          createdAt: Date.now() + i,
        })
      }
      onRefresh()
    } catch (err) {
      alert(t('photo.compressFail'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await photoDB.remove(deleteTarget.id)
    setDeleteTarget(null)
    onRefresh()
  }

  const handleSaveNote = async () => {
    if (!noteTarget) return
    await photoDB.update({ ...noteTarget, note: noteValue.trim() || undefined })
    setNoteTarget(null)
    setNoteValue('')
    onRefresh()
  }

  return (
    <div className="py-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full py-2.5 mb-3 bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {uploading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('photo.uploading')}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {t('photo.upload')}
          </>
        )}
      </button>

      {photos.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-4xl mb-2">📷</div>
          <p className="text-sm text-gray-400">{t('photo.empty')}</p>
          <p className="text-xs text-gray-300 mt-1">{t('photo.emptyDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
            >
              <img
                src={photo.data}
                alt={photo.note || ''}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setViewerPhoto(photo)}
              />
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setNoteTarget(photo)
                    setNoteValue(photo.note || '')
                  }}
                  className="w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                  title={t('photo.addNote')}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeleteTarget(photo)}
                  className="w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-500"
                  title={t('common.delete')}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {photo.note && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-1 truncate">
                  {photo.note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 全屏查看 */}
      {viewerPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setViewerPhoto(null)}
        >
          <img
            src={viewerPhoto.data}
            alt={viewerPhoto.note || ''}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setViewerPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {viewerPhoto.note && (
            <div className="absolute bottom-8 left-4 right-4 text-center text-white text-sm bg-black/50 rounded-lg p-3">
              {viewerPhoto.note}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('photo.deleteTitle')}
        message={t('photo.deleteConfirm')}
        type="danger"
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal
        open={!!noteTarget}
        onClose={() => setNoteTarget(null)}
        title={t('photo.addNote')}
      >
        {noteTarget && (
          <div className="py-2">
            <img
              src={noteTarget.data}
              alt=""
              className="w-full max-h-40 object-cover rounded-lg mb-3"
            />
            <textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder={t('photo.notePlaceholder')}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveNote}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium"
              >
                {t('photo.save')}
              </button>
              <button
                onClick={() => setNoteTarget(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
