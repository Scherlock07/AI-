import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { Sparkles, User, Lock, Mail, GraduationCap, BookOpen, Chrome } from 'lucide-react'

export function LoginPage() {
  const { login, register, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'student' | 'teacher'>('student')

  // 已登录则自动跳转首页
  useEffect(() => {
    if (isAuthenticated) navigate('/')
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        await register({ username, email, password, display_name: displayName, role })
      }
      navigate('/')
    } catch (err: any) {
      setError(err.message || '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = async (user: string) => {
    setLoading(true)
    setError('')
    try {
      await login(user, '123456')
      navigate('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-pink-300/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-indigo-300/20 rounded-full blur-3xl"></div>
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold">AI 外语学习平台</span>
          </div>

          <div className="space-y-8">
            <h1 className="text-4xl font-bold leading-tight">
              用 AI 重新定义<br />语言学习体验
            </h1>
            <p className="text-white/70 text-lg leading-relaxed">
              听力 · 口语 · 阅读 · 写作 · 词汇 · 翻译<br />
              六大模块全面覆盖，AI 智能批改与个性化学习路径
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              {[
                { icon: '🎧', label: 'AI 听力素材生成', desc: '自定义话题与口音' },
                { icon: '🎤', label: '口语发音评估', desc: '音素级精准评分' },
                { icon: '📖', label: '阅读逻辑可视化', desc: '长难句深度解析' },
                { icon: '✍️', label: '写作六维批改', desc: '逐句纠错 + 润色' },
              ].map((f) => (
                <div key={f.label} className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <div className="text-sm font-semibold">{f.label}</div>
                  <div className="text-xs text-white/60 mt-0.5">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-white/50 text-sm">
            © 2026 AI Language Platform · Powered by FastAPI + React
          </div>
        </div>
      </div>

      {/* Right: Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">AI 外语学习平台</span>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {mode === 'login' ? '欢迎回来 👋' : '创建账户 ✨'}
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              {mode === 'login' ? '登录开始今天的学习' : '注册开启你的语言学习之旅'}
            </p>

            {/* Tab Switch */}
            <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setMode('login')}
                className={cn(
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                  mode === 'login' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                )}
              >
                登录
              </button>
              <button
                onClick={() => setMode('register')}
                className={cn(
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                  mode === 'register' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                )}
              >
                注册
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">用户名</label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="输入用户名"
                    required
                    className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 rounded-xl border border-transparent focus:bg-white focus:border-indigo-300 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {mode === 'register' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">邮箱</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                        className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 rounded-xl border border-transparent focus:bg-white focus:border-indigo-300 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">显示名称</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="你的昵称"
                      required
                      className="w-full px-4 py-3 text-sm bg-gray-50 rounded-xl border border-transparent focus:bg-white focus:border-indigo-300 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">角色</label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setRole('student')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all',
                          role === 'student' ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500'
                        )}
                      >
                        <BookOpen className="w-4 h-4" />
                        <span className="text-sm font-medium">学生</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('teacher')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all',
                          role === 'teacher' ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500'
                        )}
                      >
                        <GraduationCap className="w-4 h-4" />
                        <span className="text-sm font-medium">教师</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">密码</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? '输入密码' : '设置密码（至少6位）'}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 rounded-xl border border-transparent focus:bg-white focus:border-indigo-300 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    {mode === 'login' ? '登录中...' : '注册中...'}
                  </span>
                ) : (
                  mode === 'login' ? '登录' : '注册并登录'
                )}
              </Button>
            </form>

            {mode === 'login' && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center mb-3">快速体验（测试账户）</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => quickLogin('student')}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 py-2.5 text-sm bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors font-medium"
                  >
                    <BookOpen className="w-4 h-4" />
                    学生 Demo
                  </button>
                  <button
                    onClick={() => quickLogin('teacher')}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 py-2.5 text-sm bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-colors font-medium"
                  >
                    <GraduationCap className="w-4 h-4" />
                    教师 Demo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
