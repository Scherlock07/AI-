import { useState, useEffect } from 'react'
import { classroomApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, LoadingSpinner, ErrorState } from '@/components/ui/Loading'
import { cn } from '@/lib/utils'
import {
  Users, KeyRound, LogOut, GraduationCap, ClipboardList,
  AlertTriangle, X, BookOpen, Headphones, Mic, PenLine,
} from 'lucide-react'

const MODULE_META: Record<string, { label: string; icon: any; color: string }> = {
  listening: { label: '听力', icon: Headphones, color: 'text-blue-600 bg-blue-50' },
  speaking: { label: '口语', icon: Mic, color: 'text-purple-600 bg-purple-50' },
  reading: { label: '阅读', icon: BookOpen, color: 'text-green-600 bg-green-50' },
  writing: { label: '写作', icon: PenLine, color: 'text-orange-600 bg-orange-50' },
}

export function MyClasses() {
  const { toast } = useToast()
  const [classes, setClasses] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [leaveTarget, setLeaveTarget] = useState<any>(null)
  const [leaving, setLeaving] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [clsRes, asgRes] = await Promise.all([
        classroomApi.myClasses().catch(() => []),
        classroomApi.myAssignments().catch(() => []),
      ])
      setClasses(Array.isArray(clsRes) ? clsRes : [])
      setAssignments(Array.isArray(asgRes) ? asgRes : [])
    } catch (err: any) {
      setError(err.message || '加载班级信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase()
    if (!code) {
      toast('请输入老师提供的邀请码', 'error')
      return
    }
    setJoining(true)
    try {
      const res: any = await classroomApi.join(code)
      toast(res?.message || '加入成功', res?.already_member ? 'info' : 'success')
      setInviteCode('')
      await fetchData()
    } catch (err: any) {
      toast(err.message || '加入失败，请检查邀请码', 'error')
    } finally {
      setJoining(false)
    }
  }

  const handleLeave = async () => {
    if (!leaveTarget) return
    setLeaving(true)
    try {
      await classroomApi.leave(leaveTarget.id)
      setLeaveTarget(null)
      await fetchData()
      toast('已退出该班级', 'success')
    } catch (err: any) {
      toast(err.message || '退出失败', 'error')
    } finally {
      setLeaving(false)
    }
  }

  const formatDate = (s: string) => {
    if (!s) return '未设置'
    try {
      return new Date(s).toLocaleDateString('zh-CN')
    } catch {
      return s
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-6"><LoadingSpinner /></Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card><CardContent className="pt-6"><ErrorState message={error} onRetry={fetchData} /></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">我的班级</h1>
        <p className="text-sm text-gray-400">输入老师提供的邀请码加入班级，查看老师布置的学习任务</p>
      </div>

      {/* 加入班级 */}
      <Card className="mb-6 border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">加入班级</div>
              <div className="text-xs text-gray-400 mt-0.5">
                邀请码由任课老师在教师后台生成，通常为 8 位字母数字组合
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
              placeholder="请输入 8 位邀请码，如 A1B2C3D4"
              maxLength={20}
              className="flex-1 px-4 py-2.5 text-sm font-mono tracking-widest border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <Button onClick={handleJoin} disabled={joining || !inviteCode.trim()}>
              {joining ? <LoadingSpinner size="sm" /> : null}
              {joining ? '加入中...' : '加入班级'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 我的班级列表 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-800">已加入的班级</h2>
          <Badge variant="primary">{classes.length}</Badge>
        </div>

        {classes.length === 0 ? (
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={<Users className="w-8 h-8 text-gray-300" />}
                title="尚未加入任何班级"
                desc="向老师索取邀请码，在上方输入框输入即可加入班级"
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classes.map((c) => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{c.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {c.teacher_name ? `任课老师：${c.teacher_name}` : '任课老师：—'}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="text-gray-400 hover:text-red-600 shrink-0"
                      onClick={() => setLeaveTarget(c)}>
                      <LogOut className="w-3.5 h-3.5" />退出
                    </Button>
                  </div>

                  {c.description && (
                    <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-2">{c.description}</p>
                  )}

                  <div className="flex items-center gap-4 pt-3 border-t border-gray-50 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />{c.member_count || 0} 人
                    </span>
                    <span className="flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" />{c.assignment_count || 0} 项作业
                    </span>
                    <span className="ml-auto">加入于 {formatDate(c.joined_at)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 班级作业 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-800">老师布置的任务</h2>
          <Badge variant="warning">{assignments.length}</Badge>
        </div>

        {assignments.length === 0 ? (
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={<ClipboardList className="w-8 h-8 text-gray-300" />}
                title="暂无学习任务"
                desc="老师布置作业后，将在这里显示"
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => {
              const meta = MODULE_META[a.module] || { label: a.module || '综合', icon: BookOpen, color: 'text-gray-600 bg-gray-50' }
              const Icon = meta.icon
              return (
                <Card key={a.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-4">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', meta.color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{a.title}</span>
                          <Badge variant="primary">{meta.label}</Badge>
                          {a.class_name && <Badge variant="success">{a.class_name}</Badge>}
                        </div>
                        {a.description && (
                          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{a.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span>截止：{a.due_date ? formatDate(a.due_date) : '未设置'}</span>
                          <span>难度：{a.difficulty || '中级'}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* 退出班级确认 */}
      {leaveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fadeIn"
          onClick={() => !leaving && setLeaveTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">确认退出该班级？</h3>
                <p className="text-xs text-gray-400 mt-0.5">退出后作业列表将不再显示该班级任务</p>
              </div>
              <button onClick={() => !leaving && setLeaveTarget(null)}
                className="ml-auto p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-800">
                {leaveTarget.name}
              </div>
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                退出后如需重新加入，需再次向老师索取邀请码。
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setLeaveTarget(null)} disabled={leaving}>取消</Button>
              <Button variant="danger" onClick={handleLeave} disabled={leaving}>
                {leaving ? <LoadingSpinner size="sm" /> : <LogOut className="w-3.5 h-3.5" />}
                {leaving ? '退出中...' : '确认退出'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
