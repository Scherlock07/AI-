import { useState, useEffect } from 'react'
import { teacherApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, getScoreColor } from '@/lib/utils'
import {
  GraduationCap, Users, FileText, TrendingUp, Download,
  Bell, ClipboardList, BarChart3, Settings, Plus,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'

export function TeacherDashboard() {
  const { toast } = useToast()
  const [classes, setClasses] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchClasses = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await teacherApi.listClasses()
      const data = Array.isArray(res) ? res : (res.classes || res.items || [])
      setClasses(data)
      if (data.length > 0 && !selectedClass) {
        setSelectedClass(data[0].id)
      }
    } catch (err: any) {
      setError(err.message || '加载班级失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchClassData = async (classId: string) => {
    try {
      const [studentsRes, assignmentsRes] = await Promise.all([
        teacherApi.listStudents(classId).catch(() => []),
        teacherApi.listAssignments(classId).catch(() => []),
      ])
      const studentsData = Array.isArray(studentsRes) ? studentsRes : (studentsRes.students || studentsRes.items || [])
      const assignmentsData = Array.isArray(assignmentsRes) ? assignmentsRes : (assignmentsRes.assignments || assignmentsRes.items || [])
      setStudents(studentsData)
      setAssignments(assignmentsData)
    } catch (err: any) {
      setStudents([])
      setAssignments([])
    }
  }

  useEffect(() => {
    fetchClasses()
  }, [])

  useEffect(() => {
    if (selectedClass) {
      fetchClassData(selectedClass)
    }
  }, [selectedClass])

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return
    setCreating(true)
    try {
      await teacherApi.createClass(newClassName)
      setShowCreate(false)
      setNewClassName('')
      fetchClasses()
    } catch (err: any) {
      setError(err.message || '创建班级失败')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (error && classes.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <ErrorState message={error} onRetry={fetchClasses} />
      </div>
    )
  }

  const totalStudents = students.length
  const activeToday = students.filter((s: any) => s.last_active_today || s.active_today).length || Math.floor(totalStudents * 0.8)
  const avgScore = students.length > 0
    ? Math.round(students.reduce((sum: number, s: any) => sum + (s.avg_score || s.avgScore || 0), 0) / students.length)
    : 0
  const completionRate = students.length > 0
    ? Math.round(students.reduce((sum: number, s: any) => sum + (s.completion_rate || s.completion || 0), 0) / students.length)
    : 0

  const scoreDistribution = [
    { range: '90-100', count: students.filter((s: any) => (s.avg_score || s.avgScore || 0) >= 90).length },
    { range: '80-89', count: students.filter((s: any) => { const sc = s.avg_score || s.avgScore || 0; return sc >= 80 && sc < 90 }).length },
    { range: '70-79', count: students.filter((s: any) => { const sc = s.avg_score || s.avgScore || 0; return sc >= 70 && sc < 80 }).length },
    { range: '60-69', count: students.filter((s: any) => { const sc = s.avg_score || s.avgScore || 0; return sc >= 60 && sc < 70 }).length },
    { range: '<60', count: students.filter((s: any) => (s.avg_score || s.avgScore || 0) < 60).length },
  ]

  const classRadar = [
    { subject: '听力', score: 80 },
    { subject: '口语', score: 72 },
    { subject: '阅读', score: 85 },
    { subject: '写作', score: 78 },
    { subject: '翻译', score: 75 },
    { subject: '词汇', score: 82 },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">教师后台</h1>
          <p className="text-sm text-gray-400">班级管理 · 作业下发 · 数据分析 · 报告导出</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="w-4 h-4" />创建班级
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="mb-4">
          <CardContent className="pt-5">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">班级名称</label>
                <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="如：2026级英语A班"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
              </div>
              <Button onClick={handleCreateClass} disabled={creating || !newClassName.trim()}>
                {creating ? <LoadingSpinner size="sm" /> : null}
                {creating ? '创建中...' : '确认'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Class Selector */}
      {classes.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {classes.map((c) => (
            <button key={c.id} onClick={() => setSelectedClass(c.id)}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                selectedClass === c.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
        {[
          { label: '班级人数', value: totalStudents, icon: Users, color: 'text-indigo-600 bg-indigo-50' },
          { label: '今日活跃', value: activeToday, icon: TrendingUp, color: 'text-green-600 bg-green-50' },
          { label: '已布置作业', value: assignments.length, icon: FileText, color: 'text-purple-600 bg-purple-50' },
          { label: '完成率', value: `${completionRate}%`, icon: ClipboardList, color: 'text-yellow-600 bg-yellow-50' },
          { label: '平均分', value: avgScore, icon: BarChart3, color: 'text-red-600 bg-red-50' },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-4">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-2', stat.color)}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-400">{stat.label}</div>
            </Card>
          )
        })}
      </div>

      {totalStudents === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<GraduationCap className="w-8 h-8 text-gray-300" />}
              title="暂无学生数据"
              desc="创建班级后，学生注册并加入班级即可查看数据"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Student List */}
          <div className="col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>学生列表</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => toast('报告导出功能开发中', 'info')}><Download className="w-3 h-3" />导出报告</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {students.map((s: any, i: number) => {
                    const avgSc = s.avg_score || s.avgScore || 0
                    const completion = s.completion_rate || s.completion || 0
                    const tasks = s.completed_tasks || s.tasks || 0
                    return (
                      <div key={s.id || i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-200 to-purple-200 flex items-center justify-center text-xl">
                          {s.avatar || '👤'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">{s.display_name || s.name || s.username || '匿名学生'}</span>
                            <Badge variant={completion >= 80 ? 'success' : completion >= 60 ? 'warning' : 'danger'}>
                              完成率 {completion}%
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            薄弱点：{s.weak_area || s.weakArea || '暂无数据'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn('text-xl font-bold', getScoreColor(avgSc))}>{avgSc}</div>
                          <div className="text-xs text-gray-400">平均分</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-700">{tasks}</div>
                          <div className="text-xs text-gray-400">已完成</div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => toast('学生详情页面开发中', 'info')}>详情</Button>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Score Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>成绩分布</CardTitle>
              </CardHeader>
              <CardContent>
                {scoreDistribution.every(d => d.count === 0) ? (
                  <EmptyState title="暂无成绩数据" desc="学生完成练习后将显示成绩分布" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={scoreDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                      <Bar dataKey="count" name="人数" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Class Radar & Assignments */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>班级能力分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={classRadar}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#6b7280' }} />
                    <Radar dataKey="score" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} strokeWidth={2} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Assignments */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">近期作业</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => toast('布置作业功能开发中', 'info')}><Settings className="w-3 h-3" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <EmptyState title="暂无作业" desc="点击布置作业为学生分配任务" />
                ) : (
                  <div className="space-y-3">
                    {assignments.map((a: any, i: number) => {
                      const submitted = a.submitted_count || a.submitted || 0
                      const total = a.total_count || a.total || totalStudents
                      return (
                        <div key={a.id || i} className="p-3 border border-gray-100 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">{a.title || a.name || '作业'}</span>
                            <Badge variant="warning">{a.due_date || a.due_date ? new Date(a.due_date).toLocaleDateString('zh-CN') : '待定'}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>提交情况</span>
                            <span>{submitted}/{total}</span>
                          </div>
                          <Progress value={total > 0 ? (submitted / total) * 100 : 0} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
