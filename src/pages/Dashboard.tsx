import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Button } from '@/components/ui/Button'
import { Skeleton, ErrorState } from '@/components/ui/Loading'
import { cn } from '@/lib/utils'
import { profileApi, communityApi, vocabularyApi, writingApi } from '@/api/client'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from 'recharts'
import {
  Headphones, Mic, BookOpen, PenLine, TrendingUp,
  Target, Clock, Award, ChevronRight, AlertCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [stats, setStats] = useState<any>(null)
  const [achievements, setAchievements] = useState<any[]>([])
  const [wrongCount, setWrongCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(false)
    try {
      const [statsRes, achRes, wrongRes] = await Promise.all([
        profileApi.getStats().catch(() => null),
        communityApi.getAchievements().catch(() => []),
        vocabularyApi.listWrongAnswers().catch(() => []),
      ])
      setStats(statsRes)
      setAchievements(Array.isArray(achRes) ? achRes : [])
      const wrongArr = Array.isArray(wrongRes) ? wrongRes : []
      setWrongCount(wrongArr.filter((w: any) => !w.reviewed).length)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const todayTasks = [
    { id: 1, module: 'writing', title: '每日写作练习', icon: PenLine, color: 'text-indigo-600', bgColor: 'bg-indigo-50', route: '/writing' },
    { id: 2, module: 'speaking', title: 'Presentation 练习', icon: Mic, color: 'text-purple-600', bgColor: 'bg-purple-50', route: '/speaking' },
    { id: 3, module: 'listening', title: '精听训练', icon: Headphones, color: 'text-emerald-600', bgColor: 'bg-emerald-50', route: '/listening' },
    { id: 4, module: 'reading', title: '阅读分析', icon: BookOpen, color: 'text-amber-600', bgColor: 'bg-amber-50', route: '/reading' },
  ]

  const moduleCards = [
    { name: '听力练习', icon: Headphones, color: 'from-blue-400 to-blue-600', score: stats?.ability_radar?.find((a:any)=>a.subject==='听力')?.score || 0, route: '/listening', desc: 'AI生成素材 · 精听训练 · 转写解析' },
    { name: '口语练习', icon: Mic, color: 'from-purple-400 to-purple-600', score: stats?.ability_radar?.find((a:any)=>a.subject==='口语')?.score || 0, route: '/speaking', desc: '课堂评分 · 人机对话 · 讨论房间' },
    { name: '阅读练习', icon: BookOpen, color: 'from-emerald-400 to-emerald-600', score: stats?.ability_radar?.find((a:any)=>a.subject==='阅读')?.score || 0, route: '/reading', desc: '文本分析 · 逻辑可视化 · 长难句' },
    { name: '写作练习', icon: PenLine, color: 'from-orange-400 to-orange-600', score: stats?.ability_radar?.find((a:any)=>a.subject==='写作')?.score || 0, route: '/writing', desc: 'AI批改 · 多维评分 · 润色建议' },
  ]

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '凌晨好' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  const weeklyData = stats?.weekly_progress || stats?.weeklyProgress || []
  const abilityRadar = stats?.ability_radar || stats?.abilityRadar || []
  const weakPoints = stats?.weak_points || stats?.weakPoints || []

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState message="加载数据失败，请检查后端服务是否运行" onRetry={fetchData} />
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Welcome Banner */}
      <div className="mb-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-2">{greeting}，{user?.display_name || '同学'} 👋</h1>
          <p className="text-white/80 text-sm mb-4">今天是连续学习的第 <span className="font-bold text-lg">{stats?.streak || 0}</span> 天，继续保持！</p>
          <div className="flex gap-6">
            <div>
              <div className="text-3xl font-bold">{stats?.total_study_time || 0}</div>
              <div className="text-xs text-white/70">累计学习（分钟）</div>
            </div>
            <div className="w-px bg-white/20"></div>
            <div>
              <div className="text-3xl font-bold">{stats?.total_exercises || 0}</div>
              <div className="text-xs text-white/70">完成练习数</div>
            </div>
            <div className="w-px bg-white/20"></div>
            <div>
              <div className="text-3xl font-bold">{user?.total_points || 0}</div>
              <div className="text-xs text-white/70">总积分</div>
            </div>
          </div>
        </div>
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
        <div className="absolute right-20 bottom-0 w-40 h-40 bg-white/5 rounded-full -mb-20"></div>
      </div>

      {/* Module Quick Access */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {moduleCards.map((mod) => {
          const Icon = mod.icon
          return (
            <Card key={mod.name} hover onClick={() => navigate(mod.route)} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md', mod.color)}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <Badge variant="primary">{mod.score}分</Badge>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{mod.name}</h3>
              <p className="text-xs text-gray-400 mb-3">{mod.desc}</p>
              <Progress value={mod.score} color={mod.score >= 85 ? 'success' : 'primary'} />
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="col-span-2 space-y-6">
          {/* Today's Tasks */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>今日任务</CardTitle>
                <Badge variant="primary">0/{todayTasks.length} 已完成</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {todayTasks.map((task) => {
                  const Icon = task.icon
                  return (
                    <div
                      key={task.id}
                      onClick={() => navigate(task.route)}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group"
                    >
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', task.bgColor)}>
                        <Icon className={cn('w-5 h-5', task.color)} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{task.title}</div>
                        <div className="text-xs text-gray-400">待完成</div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Weekly Progress */}
          {weeklyData.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>本周学习进度</CardTitle>
                  <div className="flex items-center gap-1 text-sm text-gray-400">
                    <TrendingUp className="w-4 h-4" />
                    学习时长统计
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} labelStyle={{ fontWeight: 600 }} />
                    <Bar dataKey="minutes" name="学习时长(分)" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Score Trend */}
          {weeklyData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>得分趋势</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="score" name="平均得分" stroke="#a855f7" strokeWidth={2} dot={{ r: 4, fill: '#a855f7' }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Ability Radar */}
          {abilityRadar.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>能力雷达图</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={abilityRadar}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#6b7280' }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} strokeWidth={2} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Weak Points */}
          {weakPoints.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-amber-500" />
                  <CardTitle>薄弱点</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {weakPoints.map((point: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{point}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => navigate('/profile')}>
                  查看个性化建议
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Achievements */}
          {achievements.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-500" />
                  <CardTitle>成就进度</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {achievements.slice(0, 4).map((ach: any) => (
                    <div key={ach.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{ach.icon || '🏆'}</span>
                          <div>
                            <div className="text-sm font-medium text-gray-800">{ach.title}</div>
                            <div className="text-xs text-gray-400">{ach.description}</div>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">{ach.progress}/{ach.target}</span>
                      </div>
                      <Progress value={ach.progress} max={ach.target} color={ach.progress >= ach.target ? 'success' : 'primary'} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Wrong Answers Reminder */}
          <Card className="bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-100">
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">错题待复习</span>
              </div>
              <div className="text-2xl font-bold text-orange-600 mb-1">{wrongCount} 道</div>
              <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => navigate('/vocabulary')}>
                去复习
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
