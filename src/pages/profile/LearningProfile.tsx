import { useState, useEffect } from 'react'
import { profileApi } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, getScoreColor, formatDate } from '@/lib/utils'
import {
  Target, TrendingUp, Calendar, Award, Flame,
  BookOpen, Mic, Headphones, PenLine, Sparkles, Brain,
  Clock, Send,
} from 'lucide-react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

export function LearningProfile() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [stats, setStats] = useState<any>(null)
  const [learningPath, setLearningPath] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // AI Assistant
  const [aiInput, setAiInput] = useState('')
  const [aiMessages, setAiMessages] = useState<any[]>([])
  const [aiLoading, setAiLoading] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsRes, pathRes, activitiesRes] = await Promise.all([
        profileApi.getStats().catch(() => null),
        profileApi.getLearningPath().catch(() => null),
        profileApi.getRecentActivities().catch(() => null),
      ])
      setStats(statsRes)
      const pathData = Array.isArray(pathRes) ? pathRes : (pathRes?.learning_path || pathRes?.items || [])
      setLearningPath(pathData)
      const actData = Array.isArray(activitiesRes) ? activitiesRes : (activitiesRes?.activities || activitiesRes?.items || [])
      setActivities(actData)
    } catch (err: any) {
      setError(err.message || '加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const askAI = async () => {
    if (!aiInput.trim()) return
    const userMsg = { role: 'user', text: aiInput }
    setAiMessages(prev => [...prev, userMsg])
    const currentInput = aiInput
    setAiInput('')
    setAiLoading(true)
    try {
      const res = await profileApi.askAssistant(currentInput)
      setAiMessages(prev => [...prev, {
        role: 'ai',
        text: res.response || res.answer || res.message || '抱歉，我暂时无法回答这个问题。',
      }])
    } catch (err: any) {
      setAiMessages(prev => [...prev, {
        role: 'ai',
        text: '抱歉，AI助教暂时不可用。请稍后再试。',
      }])
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl mb-6" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <ErrorState message={error} onRetry={fetchAll} />
      </div>
    )
  }

  const abilityRadar = stats?.ability_radar || stats?.abilityRadar || [
    { subject: '听力', score: 0 },
    { subject: '口语', score: 0 },
    { subject: '阅读', score: 0 },
    { subject: '写作', score: 0 },
    { subject: '翻译', score: 0 },
    { subject: '词汇', score: 0 },
  ]

  const weeklyProgress = stats?.weekly_progress || stats?.weeklyProgress || []
  const weakPoints = stats?.weak_points || stats?.weakPoints || []
  const totalStudyTime = stats?.total_study_time || stats?.totalStudyTime || 0
  const totalExercises = stats?.total_exercises || stats?.totalExercises || 0
  const streak = stats?.streak || user?.streak || 0
  const totalPoints = stats?.total_points || user?.total_points || 0

  const monthlyData = weeklyProgress.length > 0
    ? weeklyProgress.map((w: any, i: number) => ({
        week: `第${i+1}周`,
        minutes: w.minutes || w.study_time || 0,
        score: w.score || w.avg_score || 0,
      }))
    : [
        { week: '第1周', minutes: 0, score: 0 },
        { week: '第2周', minutes: 0, score: 0 },
        { week: '第3周', minutes: 0, score: 0 },
        { week: '第4周', minutes: 0, score: 0 },
      ]

  const moduleStats = [
    { name: '听力练习', icon: Headphones, count: stats?.listening_count || 0, avgScore: abilityRadar[0]?.score || 0, color: 'from-blue-400 to-indigo-600' },
    { name: '口语练习', icon: Mic, count: stats?.speaking_count || 0, avgScore: abilityRadar[1]?.score || 0, color: 'from-purple-400 to-purple-600' },
    { name: '阅读练习', icon: BookOpen, count: stats?.reading_count || 0, avgScore: abilityRadar[2]?.score || 0, color: 'from-emerald-400 to-emerald-600' },
    { name: '写作练习', icon: PenLine, count: stats?.writing_count || 0, avgScore: abilityRadar[3]?.score || 0, color: 'from-orange-400 to-orange-600' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">学习档案</h1>
        <p className="text-sm text-gray-400">学习者画像 · 学习路径 · 数据分析 · AI助教</p>
      </div>

      {/* Profile Header */}
      <Card className="mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 border-0">
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-4xl">
              {user?.avatar || '🎓'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-white">{user?.display_name || user?.username || '学习者'}</h2>
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs text-white">
                  {user?.level || 'intermediate'}
                </span>
              </div>
              <div className="flex gap-6 text-white/80 text-sm">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  加入于 {user?.created_at ? formatDate(user.created_at) : formatDate(new Date().toISOString())}
                </div>
                <div className="flex items-center gap-1">
                  <Flame className="w-4 h-4" />
                  连续 {streak} 天
                </div>
                <div className="flex items-center gap-1">
                  <Award className="w-4 h-4" />
                  {totalPoints} 积分
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {totalStudyTime} 分钟
                </div>
              </div>
            </div>
            <Button variant="secondary" onClick={() => toast('资料编辑功能开发中', 'info')}>编辑资料</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Ability & Trends */}
        <div className="col-span-2 space-y-6">
          {/* Ability Radar */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-500" />
                <CardTitle>能力评估</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={abilityRadar}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 13, fill: '#6b7280' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} strokeWidth={2} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly Progress */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-500" />
                <CardTitle>学习趋势</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="minutes" name="学习时长(分)" stroke="#6366f1" strokeWidth={2} fill="url(#colorMinutes)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Module Stats */}
          <Card>
            <CardHeader>
              <CardTitle>各模块练习统计</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {moduleStats.map((m) => {
                  const Icon = m.icon
                  return (
                    <div key={m.name} className="p-4 border border-gray-100 rounded-xl">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center', m.color)}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">{m.name}</div>
                          <div className="text-xs text-gray-400">{m.count} 次练习</div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className={cn('text-xl font-bold', getScoreColor(m.avgScore))}>{m.avgScore}</div>
                          <div className="text-xs text-gray-400">均分</div>
                        </div>
                      </div>
                      <Progress value={m.avgScore} color={m.avgScore >= 85 ? 'success' : 'primary'} />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* AI Assistant */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <CardTitle>AI助教</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                {aiMessages.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">
                    有任何学习问题都可以问我！<br />
                    如：如何提高口语流利度？下周学习计划建议？
                  </p>
                ) : (
                  aiMessages.map((msg, i) => (
                    <div key={i} className={cn('flex gap-2', msg.role === 'user' && 'flex-row-reverse')}>
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs',
                        msg.role === 'ai' ? 'bg-purple-100' : 'bg-indigo-100'
                      )}>
                        {msg.role === 'ai' ? <Sparkles className="w-4 h-4 text-purple-600" /> : '我'}
                      </div>
                      <div className={cn(
                        'max-w-[80%] p-2.5 rounded-lg text-sm',
                        msg.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-gray-50 text-gray-700'
                      )}>
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
                {aiLoading && (
                  <div className="flex justify-center">
                    <LoadingSpinner size="sm" />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && askAI()}
                  placeholder="向AI助教提问..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                />
                <Button size="sm" onClick={askAI} disabled={aiLoading || !aiInput.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Learning Path & AI Suggestions */}
        <div className="space-y-6">
          {/* AI Learning Path */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <CardTitle>AI学习路径</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {learningPath.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">完成更多练习后<br />AI将为你生成个性化学习路径</p>
              ) : (
                <div className="space-y-4">
                  {learningPath.map((p, i) => (
                    <div key={i} className="relative">
                      {i < learningPath.length - 1 && (
                        <div className="absolute left-3 top-12 bottom-0 w-px bg-gray-200"></div>
                      )}
                      <div className="flex gap-3">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                          p.status === 'active' || p.status === 'current' ? 'bg-indigo-500 text-white' :
                          p.status === 'upcoming' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'
                        )}>
                          {i + 1}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="text-xs text-gray-400 mb-0.5">{p.phase || p.stage || `阶段${i+1}`}</div>
                          <div className="text-sm font-medium text-gray-800">{p.title || p.name || ''}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{p.desc || p.description || ''}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weak Points & AI Suggestions */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-yellow-500" />
                <CardTitle>AI诊断与建议</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {weakPoints.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  继续练习以获取<br />AI个性化诊断和建议
                </p>
              ) : (
                <div className="space-y-3">
                  {weakPoints.map((point: string, i: number) => (
                    <div key={i} className="p-3 bg-yellow-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm font-medium text-gray-700">{point}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => toast('个性化学习计划生成功能开发中', 'info')}>
                <Sparkles className="w-3 h-3" />
                生成个性化计划
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-400" />
                <CardTitle>最近活动</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">暂无活动记录</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((a, i) => {
                    const iconMap: Record<string, any> = {
                      writing: PenLine,
                      speaking: Mic,
                      reading: BookOpen,
                      listening: Headphones,
                    }
                    const Icon = iconMap[a.module || a.type] || Clock
                    const colorMap: Record<string, string> = {
                      writing: 'text-orange-500',
                      speaking: 'text-purple-500',
                      reading: 'text-emerald-500',
                      listening: 'text-blue-500',
                    }
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <Icon className={cn('w-4 h-4 shrink-0', colorMap[a.module || a.type] || 'text-gray-400')} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-700">{a.action || a.title || a.description || ''}</div>
                          <div className="text-xs text-gray-400 truncate">{a.detail || ''}</div>
                        </div>
                        <span className="text-xs text-gray-300 shrink-0">
                          {a.created_at ? new Date(a.created_at).toLocaleDateString('zh-CN') : a.time || ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
