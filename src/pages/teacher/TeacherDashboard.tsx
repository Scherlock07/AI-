import { useState, useEffect } from 'react'
import { teacherApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, getScoreColor } from '@/lib/utils'
import { FeedbackView } from './FeedbackView'
import { AnalyticsView } from './AnalyticsView'
import {
  GraduationCap, Users, FileText, TrendingUp, Download,
  Bell, ClipboardList, BarChart3, Settings, Plus,
  MessageSquarePlus, Activity, LayoutGrid,
  Copy, Check, Pencil, Trash2, RefreshCw, X, KeyRound,
  AlertTriangle, Link2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'

type ViewType = 'classes' | 'feedback' | 'analytics'

export function TeacherDashboard() {
  const { toast } = useToast()
  const [view, setView] = useState<ViewType>('classes')
  const [classes, setClasses] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [creating, setCreating] = useState(false)

  // 班级管理：邀请 / 改名 / 删除
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingClass, setEditingClass] = useState<{ id: string; name: string; description: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; member_count: number } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)

  const currentClass = classes.find((c) => c.id === selectedClass) || null

  const handleCopyInvite = async () => {
    if (!currentClass) return
    const code = currentClass.invite_code || ''
    const text = `邀请你加入「${currentClass.name}」班级\n邀请码：${code}\n加入方式：登录 AI 外语学习平台 → 我的班级 → 输入邀请码`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast('邀请信息已复制，可发送给学生', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      try {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        toast('邀请码已复制', 'success')
        setTimeout(() => setCopied(false), 2000)
      } catch {
        toast('复制失败，请手动记录邀请码：' + code, 'info')
      }
    }
  }

  const handleRegenerateCode = async () => {
    if (!currentClass) return
    setRegenLoading(true)
    try {
      const res: any = await teacherApi.regenerateInviteCode(currentClass.id)
      await fetchClasses()
      toast(res?.message || '邀请码已重置', 'success')
    } catch (err: any) {
      toast(err.message || '重置邀请码失败', 'error')
    } finally {
      setRegenLoading(false)
    }
  }

  const handleOpenEdit = () => {
    if (!currentClass) return
    setEditingClass({ id: currentClass.id, name: currentClass.name, description: currentClass.description || '' })
    setEditName(currentClass.name)
    setEditDesc(currentClass.description || '')
  }

  const handleSaveEdit = async () => {
    if (!editingClass) return
    const trimmed = editName.trim()
    if (!trimmed) {
      toast('班级名称不能为空', 'error')
      return
    }
    if (trimmed === editingClass.name && editDesc === editingClass.description) {
      setEditingClass(null)
      return
    }
    setSavingEdit(true)
    try {
      await teacherApi.updateClass(editingClass.id, trimmed, editDesc)
      setEditingClass(null)
      await fetchClasses()
      toast('班级信息已更新', 'success')
    } catch (err: any) {
      toast(err.message || '修改失败', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteClass = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await teacherApi.deleteClass(deleteTarget.id)
      setDeleteTarget(null)
      if (selectedClass === deleteTarget.id) setSelectedClass(null)
      setStudents([])
      setAssignments([])
      await fetchClasses()
      toast('班级已解散', 'success')
    } catch (err: any) {
      toast(err.message || '删除失败', 'error')
    } finally {
      setDeleting(false)
    }
  }

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
        {view === 'classes' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="w-4 h-4" />创建班级
            </Button>
          </div>
        )}
      </div>

      {/* 视图切换 */}
      <div className="flex gap-1 mb-6 p-1 bg-gray-100 rounded-xl w-fit">
        {[
          { value: 'classes' as ViewType, label: '班级管理', icon: LayoutGrid },
          { value: 'feedback' as ViewType, label: '意见反馈', icon: MessageSquarePlus },
          { value: 'analytics' as ViewType, label: '使用数据', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.value}
              onClick={() => setView(tab.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all',
                view === tab.value ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {view === 'feedback' && <FeedbackView />}
      {view === 'analytics' && <AnalyticsView />}
      {view === 'classes' && (
        <>
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

      {/* 班级管理操作区：邀请学生 / 改名 / 解散 */}
      {currentClass && (
        <Card className="mb-5 border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white">
          <CardContent className="pt-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{currentClass.name}</span>
                    <Badge variant="primary">{currentClass.member_count || 0} 名学生</Badge>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {currentClass.description || '暂无班级简介'}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap shrink-0">
                <Button size="sm" onClick={() => { setShowInvite(!showInvite); setCopied(false) }}>
                  <Link2 className="w-3.5 h-3.5" />邀请学生
                </Button>
                <Button size="sm" variant="outline" onClick={handleOpenEdit}>
                  <Pencil className="w-3.5 h-3.5" />改名
                </Button>
                <Button size="sm" variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setDeleteTarget(currentClass)}>
                  <Trash2 className="w-3.5 h-3.5" />解散班级
                </Button>
              </div>
            </div>

            {/* 邀请面板 */}
            {showInvite && (
              <div className="mt-4 p-4 rounded-xl bg-white border border-indigo-100">
                <div className="flex items-start gap-2 mb-3">
                  <KeyRound className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-gray-500 leading-relaxed">
                    将邀请码发给学生，学生在<strong className="text-gray-700">「我的班级」</strong>页面输入即可加入。
                    邀请码为班级唯一凭证，重置后原邀请码立即失效。
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100">
                    <span className="text-2xl font-bold tracking-[0.2em] text-indigo-700 font-mono">
                      {currentClass.invite_code}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant={copied ? 'outline' : 'primary'} onClick={handleCopyInvite}>
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? '已复制' : '复制邀请信息'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleRegenerateCode} disabled={regenLoading}>
                      {regenLoading ? <LoadingSpinner size="sm" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      重置邀请码
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
        </>
      )}

      {/* 修改班级信息弹窗 */}
      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fadeIn"
          onClick={() => !savingEdit && setEditingClass(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-500" />
                <h3 className="font-semibold text-gray-900">修改班级信息</h3>
              </div>
              <button onClick={() => !savingEdit && setEditingClass(null)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  班级名称 <span className="text-red-500">*</span>
                </label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  maxLength={50}
                  placeholder="如：2026级英语A班"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                <div className="text-xs text-gray-400 mt-1 text-right">{editName.length}/50</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">班级简介（可选）</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                  rows={3} maxLength={500}
                  placeholder="如：本班面向 2026 级英语专业学生，主攻四级备考"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setEditingClass(null)} disabled={savingEdit}>取消</Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? <LoadingSpinner size="sm" /> : null}
                {savingEdit ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 解散班级确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fadeIn"
          onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">确认解散该班级？</h3>
                <p className="text-xs text-gray-400 mt-0.5">此操作不可撤销</p>
              </div>
            </div>
            <div className="p-5">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 mb-3">
                <div className="text-sm font-medium text-gray-800">{deleteTarget.name}</div>
                <div className="text-xs text-gray-400 mt-1">
                  当前班级人数：{deleteTarget.member_count || 0} 人
                </div>
              </div>
              <ul className="text-xs text-gray-500 space-y-1.5 leading-relaxed">
                <li>· 班级内全部学生成员关系将被移除</li>
                <li>· 已布置的作业与课堂评分记录将一并删除</li>
                <li>· 学生端「我的班级」中将不再显示该班级</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
              <Button variant="danger" onClick={handleDeleteClass} disabled={deleting}>
                {deleting ? <LoadingSpinner size="sm" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleting ? '解散中...' : '确认解散'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
