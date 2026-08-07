import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard, Headphones, Mic, BookOpen, PenLine,
  BookMarked, Languages, Users, GraduationCap, User,
  ChevronLeft, Sparkles, LogOut,
} from 'lucide-react'

const navItems = [
  { to: '/', label: '学习仪表盘', icon: LayoutDashboard, group: 'main' },
  { to: '/listening', label: '听力练习', icon: Headphones, group: 'practice' },
  { to: '/speaking', label: '口语练习', icon: Mic, group: 'practice' },
  { to: '/reading', label: '阅读练习', icon: BookOpen, group: 'practice' },
  { to: '/writing', label: '写作练习', icon: PenLine, group: 'practice' },
  { to: '/vocabulary', label: '词汇与语法', icon: BookMarked, group: 'tools' },
  { to: '/translation', label: '翻译练习', icon: Languages, group: 'tools' },
  { to: '/community', label: '学习社区', icon: Users, group: 'social' },
  { to: '/teacher', label: '教师后台', icon: GraduationCap, group: 'social' },
  { to: '/profile', label: '学习档案', icon: User, group: 'social' },
]

const groupLabels: Record<string, string> = {
  main: '',
  practice: '核心练习',
  tools: '学习工具',
  social: '社区与管理',
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useStore()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'flex flex-col bg-white border-r border-gray-100 transition-all duration-300 z-30',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-16 border-b border-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-200">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <span className="font-bold text-gray-900 text-sm whitespace-nowrap">AI外语学习平台</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {Object.entries(
          navItems.reduce((acc, item) => {
            if (!acc[item.group]) acc[item.group] = []
            acc[item.group].push(item)
            return acc
          }, {} as Record<string, typeof navItems>)
        ).map(([group, items]) => (
          <div key={group} className="mb-4">
            {!sidebarCollapsed && groupLabels[group] && (
              <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                {groupLabels[group]}
              </div>
            )}
            {items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5',
                      isActive
                        ? 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      sidebarCollapsed && 'justify-center'
                    )
                  }
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!sidebarCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User info */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3 border-t border-gray-50">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-lg shadow-md">
              {user?.avatar || '🦉'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{user?.display_name || '用户'}</div>
              <div className="text-xs text-gray-400">{user?.role === 'teacher' ? '教师' : '学生'} · {user?.total_points || 0} 积分</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-red-500 transition-colors"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Collapse button */}
      <button
        onClick={toggleSidebar}
        className="absolute top-7 -right-3 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
      >
        <ChevronLeft className={cn('w-4 h-4 text-gray-400 transition-transform', sidebarCollapsed && 'rotate-180')} />
      </button>
    </aside>
  )
}
