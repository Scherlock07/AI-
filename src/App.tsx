import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { Dashboard } from '@/pages/Dashboard'
import { ListeningModule } from '@/pages/listening/ListeningModule'
import { SpeakingModule } from '@/pages/speaking/SpeakingModule'
import { ReadingModule } from '@/pages/reading/ReadingModule'
import { WritingModule } from '@/pages/writing/WritingModule'
import { VocabularyModule } from '@/pages/vocabulary/VocabularyModule'
import { TranslationModule } from '@/pages/translation/TranslationModule'
import { CommunityModule } from '@/pages/community/CommunityModule'
import { TeacherDashboard } from '@/pages/teacher/TeacherDashboard'
import { LearningProfile } from '@/pages/profile/LearningProfile'
import { Sparkles } from 'lucide-react'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-gray-400 mt-3">加载中...</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/listening" element={<ListeningModule />} />
        <Route path="/speaking" element={<SpeakingModule />} />
        <Route path="/reading" element={<ReadingModule />} />
        <Route path="/writing" element={<WritingModule />} />
        <Route path="/vocabulary" element={<VocabularyModule />} />
        <Route path="/translation" element={<TranslationModule />} />
        <Route path="/community" element={<CommunityModule />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/profile" element={<LearningProfile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
