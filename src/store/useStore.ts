import { create } from 'zustand'

// Store now only manages UI state
interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
}

export const useStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (open: boolean) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
}))

// ========== Fallback mock data (used when API fails) ==========

export const fallbackUser = {
  id: 'guest',
  name: '访客',
  avatar: '🦉',
  level: 'intermediate' as const,
  totalPoints: 0,
  streak: 0,
  joinDate: new Date().toISOString().split('T')[0],
}

export const fallbackStats = {
  totalStudyTime: 0,
  totalExercises: 0,
  weeklyProgress: [
    { date: '周一', minutes: 0, score: 0 },
    { date: '周二', minutes: 0, score: 0 },
    { date: '周三', minutes: 0, score: 0 },
    { date: '周四', minutes: 0, score: 0 },
    { date: '周五', minutes: 0, score: 0 },
    { date: '周六', minutes: 0, score: 0 },
    { date: '周日', minutes: 0, score: 0 },
  ],
  abilityRadar: [
    { subject: '听力', score: 0 },
    { subject: '口语', score: 0 },
    { subject: '阅读', score: 0 },
    { subject: '写作', score: 0 },
    { subject: '翻译', score: 0 },
    { subject: '词汇', score: 0 },
  ],
  weakPoints: [],
  streak: 0,
}
