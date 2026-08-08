import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useStore } from '@/store/useStore'

export function Layout() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useStore()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
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
