import { useState, useEffect } from 'react'
import ContactsPage from './pages/ContactsPage'
import GraphPage from './pages/GraphPage'
import FamilyPage from './pages/FamilyPage'
import InteractionsPage from './pages/InteractionsPage'
import ProfilePage from './pages/ProfilePage'
import BottomNav from './components/BottomNav'
import TourGuide from './components/TourGuide'
import SplashScreen from './components/SplashScreen'
import type { TourStep } from './components/TourGuide'
import { initSampleData } from './utils/sampleData'
import { LanguageProvider, useLanguage } from './utils/i18n'
import { useTheme } from './utils/theme'

export type TabKey = 'contacts' | 'graph' | 'family' | 'interactions' | 'profile'

// 教程步骤定义
const TOUR_STEPS: (TourStep & { tab: TabKey })[] = [
  { icon: '👋', titleKey: 'tour.welcomeTitle', descKey: 'tour.welcomeDesc', tab: 'profile' },
  { icon: '📇', titleKey: 'tour.contactsTitle', descKey: 'tour.contactsDesc', tab: 'contacts' },
  { icon: '🕸️', titleKey: 'tour.graphTitle', descKey: 'tour.graphDesc', tab: 'graph' },
  { icon: '🌳', titleKey: 'tour.familyTitle', descKey: 'tour.familyDesc', tab: 'family' },
  { icon: '📋', titleKey: 'tour.todoTitle', descKey: 'tour.todoDesc', tab: 'interactions' },
  { icon: '⚙️', titleKey: 'tour.profileTitle', descKey: 'tour.profileDesc', tab: 'profile' },
  { icon: '🎉', titleKey: 'tour.completeTitle', descKey: 'tour.completeDesc', tab: 'profile' },
]

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('profile')
  const [loading, setLoading] = useState(true)
  const [tourActive, setTourActive] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [showSplash, setShowSplash] = useState(true)
  const { t } = useLanguage()
  // 初始化主题（系统跟随 + 手动切换）
  useTheme()

  useEffect(() => {
    initSampleData().then(() => setLoading(false)).catch(() => setLoading(false))
  }, [])

  // 教程步骤切换时同步 tab
  useEffect(() => {
    if (tourActive && TOUR_STEPS[tourStep]) {
      setActiveTab(TOUR_STEPS[tourStep].tab)
    }
  }, [tourStep, tourActive])

  const startTour = () => {
    setTourStep(0)
    setTourActive(true)
  }

  const nextStep = () => {
    if (tourStep < TOUR_STEPS.length - 1) {
      setTourStep(tourStep + 1)
    } else {
      setTourActive(false)
    }
  }

  const prevStep = () => {
    if (tourStep > 0) {
      setTourStep(tourStep - 1)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">{t('app.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Web 层开屏覆盖（500ms + 跳过按钮） */}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      <main className="flex-1 overflow-hidden">
        {activeTab === 'contacts' && <ContactsPage />}
        {activeTab === 'graph' && <GraphPage />}
        {activeTab === 'family' && <FamilyPage />}
        {activeTab === 'interactions' && <InteractionsPage />}
        {activeTab === 'profile' && <ProfilePage onStartTour={startTour} />}
      </main>
      <BottomNav active={activeTab} onChange={setActiveTab} />

      {/* 新手教程引导 */}
      {tourActive && (
        <TourGuide
          step={tourStep}
          total={TOUR_STEPS.length}
          steps={TOUR_STEPS}
          onNext={nextStep}
          onPrev={prevStep}
          onClose={() => setTourActive(false)}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  )
}

export default App
