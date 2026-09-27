import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useStore } from '@/store/useStore'
import { trackPageView } from '@/lib/tracker'

export function Layout() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useStore()
  const location = useLocation()

  // 使用数据埋点：路由变化自动记录模块访问与停留时长
  useEffect(() => {
    trackPageView(location.pathname)
  }, [location.pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar - desktop inline, mobile drawer */}
      <div className="relative hidden lg:block">
        <Sidebar />
      </div>
      <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
