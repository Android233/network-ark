import type { TabKey } from '../App'
import { useLanguage } from '../utils/i18n'

interface BottomNavProps {
  active: TabKey
  onChange: (tab: TabKey) => void
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  const { t } = useLanguage()
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'contacts', label: t('nav.contacts'), icon: 'M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m6-2.13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z' },
    { key: 'graph', label: t('nav.graph'), icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a3 3 0 1 1-3 3 3 3 0 0 1 3-3Zm0 14a8 8 0 0 1-6-3 4 4 0 0 1 4-3h4a4 4 0 0 1 4 3 8 8 0 0 1-6 3Z' },
    { key: 'family', label: t('nav.family'), icon: 'M12 2L2 7v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7L12 2Zm0 4l6 3v8H6V9l6-3Z' },
    { key: 'interactions', label: t('nav.interactions'), icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
    { key: 'profile', label: t('nav.profile'), icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z' },
  ]

  return (
    <nav className="flex-shrink-0 bg-white border-t border-gray-200 safe-bottom">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = active === tab.key
          return (
            <button
              key={tab.key}
              data-tab={tab.key}
              onClick={() => onChange(tab.key)}
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <svg
                className="w-6 h-6 mb-0.5"
                fill={isActive ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={isActive ? 0 : 2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
