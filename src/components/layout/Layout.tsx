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
      {/* 移动端抽屉：外层容器必须 pointer-events-none，否则侧边栏滑出后
          这个透明 fixed 容器仍覆盖屏幕左侧 288px（z-50 高于 header 的 z-20），
          会拦截汉堡菜单等左侧区域的点击 */}
      <div className="fixed inset-y-0 left-0 z-50 lg:hidden pointer-events-none">
        <div className="h-full pointer-events-auto">
          <Sidebar />
        </div>
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
