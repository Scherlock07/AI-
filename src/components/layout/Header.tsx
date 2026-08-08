import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useStore } from '@/store/useStore'
import { useNavigate } from 'react-router-dom'
import { Flame, Bell, Search, MessageCircle, Menu } from 'lucide-react'

export function Header() {
  const { user } = useAuth()
  const { toggleMobileSidebar } = useStore()
  const { toast } = useToast()
  const navigate = useNavigate()

  return (
    <header className="h-14 lg:h-16 border-b border-gray-100 bg-white/80 backdrop-blur-md flex items-center justify-between px-3 sm:px-4 lg:px-6 z-20 sticky top-0">
      <div className="flex items-center gap-2 sm:gap-4">
        <button onClick={toggleMobileSidebar} className="p-2 rounded-lg hover:bg-gray-50 transition-colors lg:hidden">
          <Menu className="w-5 h-5 text-gray-500" />
        </button>
        <div className="relative hidden sm:block">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索练习题、词汇、文章..."
            className="w-48 md:w-72 pl-9 pr-4 py-2 text-sm bg-gray-50 rounded-xl border border-transparent focus:bg-white focus:border-indigo-300 focus:outline-none transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Streak */}
        <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-orange-50 rounded-xl">
          <Flame className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-orange-600">{user?.streak || 0} 天</span>
        </div>

        {/* AI Assistant */}
        <button onClick={() => navigate('/profile')} className="relative p-2 rounded-xl hover:bg-gray-50 transition-colors group shrink-0">
          <MessageCircle className="w-5 h-5 text-gray-500 group-hover:text-indigo-500 transition-colors" />
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">AI</span>
        </button>

        {/* Notifications */}
        <button onClick={() => toast('暂无新通知', 'info')} className="relative p-2 rounded-xl hover:bg-gray-50 transition-colors shrink-0">
          <Bell className="w-5 h-5 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-lg shadow-md shrink-0">
          {user?.avatar || '🦉'}
        </div>
      </div>
    </header>
  )
}
