import { useState, useEffect } from 'react'
import { teacherApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner, EmptyState } from '@/components/ui/Loading'
import { cn, getScoreColor } from '@/lib/utils'
import {
  Sparkles, AlertTriangle, TrendingUp, Users, Clock, Target,
  FileText, Lightbulb, ChevronRight, RefreshCw, Printer, RotateCcw,
} from 'lucide-react'
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'

const BAND_COLORS: Record<string, string> = {
  '90-100': '#16a34a',
  '80-89': '#4ade80',
  '70-79': '#facc15',
  '60-69': '#fb923c',
  '60以下': '#ef4444',
  '无数据': '#d1d5db',
}

const REPORT_CACHE_MS = 10 * 60 * 1000

export function ClassAnalyticsView({
  classId, className, onOpenStudent,
}: {
  classId: string
  className: string
  onOpenStudent: (studentId: string, name: string) => void
}) {
  const { toast } = useToast()
  const [days, setDays] = useState(30)
  const [overview, setOverview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [focus, setFocus] = useState('')
  const [report, setReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportAt, setReportAt] = useState<number>(0)
  const [reportStale, setReportStale] = useState(false)

  const loadOverview = async () => {
    setLoading(true)
    setError(null)
    try {
      const res: any = await teacherApi.classOverview(classId, days)
      setOverview(res)
      // 若已有报告但基于旧数据，标记为需重新生成
      if (report && reportAt && Date.now() - reportAt > REPORT_CACHE_MS) {
        setReportStale(true)
      }
    } catch (e: any) {
      setError(e.message || '加载学情失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, days])

  const handleGenerateReport = async (force = false) => {
    setReportLoading(true)
    try {
      const res: any = await teacherApi.analysisReport(classId, days, force ? '' : focus)
      setReport(res)
      setReportAt(Date.now())
      setReportStale(false)
      toast('分析报告已生成', 'success')
    } catch (e: any) {
      toast(e.message || '报告生成失败', 'error')
    } finally {
      setReportLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><LoadingSpinner size="lg" /></div>
  }

  if (error) {
    return (
      <Card><CardContent className="pt-6">
        <EmptyState title="加载失败" desc={error} />
      </CardContent></Card>
    )
  }

  if (!overview) return null

  const s = overview.summary || {}
  const radarData = (overview.module_scores || [])
    .filter((m: any) => m.avg_score > 0)
    .map((m: any) => ({ subject: m.label, score: m.avg_score }))
  const bandData = (overview.score_bands || []).filter((b: any) => b.count > 0)
  const hasAnyData = overview.active_student_count > 0

  return (
    <div className="space-y-5">
      {/* 周期切换 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">统计周期</span>
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => { setDays(d); setReport(null); setReportAt(0); setReportStale(false) }}
                className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all',
                  days === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
              >
                近 {d} 天
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={loadOverview}>
          <RotateCcw className="w-3.5 h-3.5" />刷新数据
        </Button>
      </div>

      {!hasAnyData && (
        <Card className="border-orange-100 bg-orange-50/40">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-gray-800 text-sm">该班级近 {days} 天无任何学生练习记录</div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  可能是学生尚未加入班级、或加入后未开展练习。可在「邀请学生」中确认邀请码是否已下发，
                  并检查学生端「我的班级」是否显示本班。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 概览指标 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: '班级人数', value: overview.student_count, icon: Users, color: 'text-indigo-600 bg-indigo-50' },
          { label: '有练习记录', value: overview.active_student_count, icon: Target, color: 'text-green-600 bg-green-50' },
          { label: '班级均分', value: s.class_avg || '—', icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
          { label: '累计时长', value: `${s.total_time || 0}分`, icon: Clock, color: 'text-orange-600 bg-orange-50' },
          { label: '练习总次数', value: s.total_exercises || 0, icon: FileText, color: 'text-blue-600 bg-blue-50' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="p-3.5">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', item.color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold text-gray-900 leading-tight">{item.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{item.label}</div>
            </Card>
          )
        })}
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="text-base">班级能力分布</CardTitle></CardHeader>
          <CardContent>
            {radarData.length < 3 ? (
              <EmptyState title="数据不足" desc="至少需要 3 个模块有评分数据才能生成能力雷达" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">成绩分布</CardTitle></CardHeader>
          <CardContent>
            {bandData.length === 0 ? (
              <EmptyState title="暂无成绩数据" desc="学生完成练习后将显示成绩分布" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={bandData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="band" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    formatter={(v: any) => [`${v} 人`, '人数']} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={44}>
                    {bandData.map((b: any) => (
                      <Cell key={b.band} fill={BAND_COLORS[b.band] || '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 各模块均分 */}
      <Card>
        <CardHeader><CardTitle className="text-base">各模块班级均分</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(overview.module_scores || []).map((m: any) => (
              <div key={m.module} className="p-3 rounded-xl bg-gray-50/70 text-center">
                <div className="text-xs text-gray-500 mb-1.5">{m.label}</div>
                <div className={cn('text-xl font-bold', m.avg_score > 0 ? getScoreColor(m.avg_score) : 'text-gray-300')}>
                  {m.avg_score > 0 ? m.avg_score : '—'}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">{m.study_time} 分钟</div>
              </div>
            ))}
          </div>
          {overview.class_weak_modules?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-50">
              <div className="text-xs font-medium text-gray-600 mb-2">班级共性薄弱模块（均分低于 70）</div>
              <div className="flex flex-wrap gap-2">
                {overview.class_weak_modules.map((w: any) => (
                  <span key={w.module} className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-medium">
                    {w.label} · {w.avg_score}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 预警与优秀 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              需重点关注（{overview.need_attention?.length || 0}）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!overview.need_attention?.length ? (
              <p className="text-xs text-gray-400 py-4 text-center">暂无预警学生</p>
            ) : (
              <div className="space-y-2.5">
                {overview.need_attention.map((a: any) => (
                  <button
                    key={a.student_id}
                    onClick={() => onOpenStudent(a.student_id, a.name)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-orange-50/50 hover:bg-orange-50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-base shrink-0 border border-orange-100">
                      {a.avatar || '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">{a.name}</span>
                        <span className={cn('text-xs font-semibold', a.overall_avg > 0 ? getScoreColor(a.overall_avg) : 'text-gray-400')}>
                          {a.overall_avg > 0 ? a.overall_avg : '无数据'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                        {a.reasons.join(' · ')}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              表现优秀（{overview.top_students?.length || 0}）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!overview.top_students?.length ? (
              <p className="text-xs text-gray-400 py-4 text-center">暂无均分 85 以上的学生</p>
            ) : (
              <div className="space-y-2.5">
                {overview.top_students.map((t: any) => (
                  <button
                    key={t.student_id}
                    onClick={() => onOpenStudent(t.student_id, t.name)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-green-50/50 hover:bg-green-50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-base shrink-0 border border-green-100">
                      {t.avatar || '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{t.name}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{t.total_time} 分钟练习时长</div>
                    </div>
                    <span className={cn('text-sm font-bold shrink-0', getScoreColor(t.overall_avg))}>{t.overall_avg}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 学生明细表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">学生学情明细</CardTitle>
            <span className="text-xs text-gray-400">点击任意学生查看详细学情</span>
          </div>
        </CardHeader>
        <CardContent>
          {!overview.students?.length ? (
            <EmptyState title="班级暂无学生" desc="学生加入班级后将显示在这里" />
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left font-medium py-2.5 px-2">学生</th>
                    <th className="text-center font-medium py-2.5 px-2">综合均分</th>
                    <th className="text-center font-medium py-2.5 px-2">练习时长</th>
                    <th className="text-center font-medium py-2.5 px-2">练习次数</th>
                    <th className="text-left font-medium py-2.5 px-2">薄弱模块</th>
                    <th className="text-center font-medium py-2.5 px-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.students.map((p: any) => (
                    <tr key={p.student_id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-sm shrink-0">
                            {p.avatar || '👤'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800 truncate">{p.name}</div>
                            <div className="text-[11px] text-gray-400">{p.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center py-3 px-2">
                        {p.summary.has_data ? (
                          <span className={cn('font-bold', getScoreColor(p.summary.overall_avg))}>{p.summary.overall_avg}</span>
                        ) : (
                          <span className="text-xs text-gray-300">无数据</span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2 text-gray-600">{p.summary.total_time} 分</td>
                      <td className="text-center py-3 px-2 text-gray-600">{p.summary.total_exercises}</td>
                      <td className="py-3 px-2">
                        {p.weak_modules.length === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {p.weak_modules.slice(0, 3).map((w: any) => (
                              <span key={w.module} className="px-2 py-0.5 rounded bg-red-50 text-red-600 text-[11px]">
                                {w.label}
                              </span>
                            ))}
                            {p.weak_modules.length > 3 && (
                              <span className="text-[11px] text-gray-400">+{p.weak_modules.length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        <Button size="sm" variant="ghost" onClick={() => onOpenStudent(p.student_id, p.name)}>
                          查看学情
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI 分析报告 */}
      <Card className="border-indigo-100">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              针对性分析报告
            </CardTitle>
            {report && (
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />打印 / 导出
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!report ? (
            <div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                基于本班近 {days} 天的真实练习数据，自动生成包含总体诊断、模块分析、学生分层与教学建议的分析报告。
                报告结论严格来自实际数据，数据不足处会明确标注。
              </p>
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  重点关注方向（可选）
                </label>
                <input
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="如：四级备考 / 口语表达 / 写作逻辑，留空则做全面分析"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                />
              </div>
              <Button onClick={() => handleGenerateReport(false)} disabled={reportLoading}>
                {reportLoading ? <LoadingSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
                {reportLoading ? '正在分析班级数据...' : '生成分析报告'}
              </Button>
            </div>
          ) : (
            <div>
              {reportStale && (
                <div className="mb-4 p-3 rounded-xl bg-yellow-50 border border-yellow-100 flex items-center gap-2 text-xs text-yellow-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  数据可能已更新，建议重新生成报告
                  <button className="ml-auto underline shrink-0" onClick={() => handleGenerateReport(true)}>重新生成</button>
                </div>
              )}
              <ReportBody report={report} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReportBody({ report }: { report: any }) {
  const r = report.report || {}
  const layerLabels: Record<string, { label: string; color: string }> = {
    attention: { label: '需要重点关注', color: 'red' },
    improving: { label: '稳步提升', color: 'yellow' },
    excellent: { label: '表现优秀', color: 'green' },
  }

  return (
    <div className="space-y-5">
      <div className="text-xs text-gray-400">
        生成时间：{report.generated_at ? new Date(report.generated_at).toLocaleString('zh-CN') : '—'}
        {' · '}统计周期：近 {report.period_days} 天
      </div>

      {/* 总体诊断 */}
      <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100">
        <div className="font-medium text-gray-800 text-sm mb-2">总体诊断</div>
        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{r.overall_diagnosis}</p>
      </div>

      {/* 模块分析 */}
      {r.module_analysis?.length > 0 && (
        <div>
          <div className="font-medium text-gray-800 text-sm mb-3">模块分析</div>
          <div className="space-y-2.5">
            {r.module_analysis.map((m: any, i: number) => (
              <div key={i} className="p-3.5 rounded-xl bg-gray-50/70">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium text-gray-700">{m.module}</span>
                  <Badge variant={
                    m.status === '优秀' ? 'success'
                      : m.status === '良好' ? 'primary'
                        : m.status === '待提升' ? 'danger' : 'default'
                  }>{m.status}</Badge>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{m.analysis}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 学生分层 */}
      {r.student_layering && (
        <div>
          <div className="font-medium text-gray-800 text-sm mb-3">学生分层</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['attention', 'improving', 'excellent'] as const).map((key) => {
              const layer = r.student_layering[key]
              if (!layer) return null
              const meta = layerLabels[key]
              return (
                <div key={key} className={cn('p-3.5 rounded-xl border', {
                  red: 'bg-red-50/50 border-red-100',
                  yellow: 'bg-yellow-50/50 border-yellow-100',
                  green: 'bg-green-50/50 border-green-100',
                }[meta.color])}>
                  <div className="text-xs font-semibold text-gray-700 mb-1.5">{meta.label}</div>
                  <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{layer.summary}</p>
                  {layer.students?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {layer.students.slice(0, 8).map((n: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-white/80 text-[11px] text-gray-600">{n}</span>
                      ))}
                    </div>
                  )}
                  {layer.actions && (
                    <p className="text-[11px] text-gray-500 leading-relaxed pt-2 border-t border-white/60">
                      <span className="font-medium text-gray-600">干预建议：</span>{layer.actions}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 教学建议 */}
      {r.teaching_suggestions?.length > 0 && (
        <div>
          <div className="font-medium text-gray-800 text-sm mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            针对性教学建议
          </div>
          <div className="space-y-3">
            {r.teaching_suggestions.map((t: any, i: number) => (
              <div key={i} className="p-4 rounded-xl border border-gray-100">
                <div className="flex items-start gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{t.title}</span>
                      <Badge variant={t.priority === '高' ? 'danger' : t.priority === '中' ? 'warning' : 'default'}>
                        {t.priority}优先
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="pl-7 space-y-1.5">
                  <div className="text-xs text-gray-500 leading-relaxed">
                    <span className="font-medium text-gray-600">问题：</span>{t.problem}
                  </div>
                  <div className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-medium text-gray-600">措施：</span>{t.action}
                  </div>
                  {t.target && (
                    <div className="text-xs text-gray-500 leading-relaxed">
                      <span className="font-medium text-gray-600">适用对象：</span>{t.target}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 后续跟进 */}
      {r.follow_up_metrics?.length > 0 && (
        <div className="p-4 rounded-xl bg-gray-50/70">
          <div className="font-medium text-gray-800 text-sm mb-2">下一周期跟进重点</div>
          <ul className="space-y-1.5">
            {r.follow_up_metrics.map((m: string, i: number) => (
              <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                <span className="text-indigo-400 shrink-0">·</span>{m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 数据说明 */}
      {r.data_notes?.length > 0 && (
        <div className="pt-3 border-t border-gray-50">
          <div className="text-[11px] text-gray-400 leading-relaxed">
            <span className="font-medium">数据说明：</span>
            {r.data_notes.join(' ')}
          </div>
        </div>
      )}
    </div>
  )
}
