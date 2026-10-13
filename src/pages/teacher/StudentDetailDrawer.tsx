import { useState, useEffect } from 'react'
import { teacherApi } from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner, EmptyState } from '@/components/ui/Loading'
import { cn, getScoreColor } from '@/lib/utils'
import {
  X, Clock, Target, TrendingDown, TrendingUp, AlertTriangle,
  BookOpen, Headphones, Mic, PenLine, Languages, BookMarked, Award,
} from 'lucide-react'
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

const MODULE_ICONS: Record<string, any> = {
  listening: Headphones,
  speaking: Mic,
  reading: BookOpen,
  writing: PenLine,
  vocabulary: BookMarked,
  translation: Languages,
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  grammar: '语法错误',
  vocabulary: '词汇误用',
  spelling: '拼写错误',
  punctuation: '标点错误',
  structure: '句式结构',
  collocation: '搭配不当',
  other: '其他',
}

const SPEAKING_TYPE_LABELS: Record<string, string> = {
  presentation: '演讲',
  discussion: '讨论',
  conversation: '人机对话',
  retelling: '复述',
  classroom: '课堂',
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级',
}

export function StudentDetailDrawer({
  studentId, classId, studentName, days = 30, onClose,
}: {
  studentId: string
  classId: string
  studentName: string
  days?: number
  onClose: () => void
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    teacherApi.studentProfile(studentId, classId, days)
      .then((res: any) => { if (alive) setData(res) })
      .catch((e: any) => { if (alive) setError(e.message || '加载学情失败') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [studentId, classId, days])

  const radarData = (data?.module_stats || [])
    .filter((m: any) => m.avg_score > 0)
    .map((m: any) => ({ subject: m.label, score: m.avg_score }))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 animate-fadeIn" onClick={onClose}>
      <div
        className="bg-gray-50 w-full max-w-2xl h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-200 to-purple-200 flex items-center justify-center text-xl shrink-0">
            {data?.avatar || '👤'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 truncate">{studentName}</div>
            <div className="text-xs text-gray-400">
              近 {days} 天学情
              {data?.level ? ` · ${LEVEL_LABELS[data.level] || data.level}` : ''}
              {data?.streak ? ` · 连续学习 ${data.streak} 天` : ''}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {error && !loading && (
          <div className="p-6">
            <Card><CardContent className="pt-6">
              <EmptyState title="加载失败" desc={error} />
            </CardContent></Card>
          </div>
        )}

        {data && !loading && (
          <div className="p-6 space-y-5">
            {/* 概览指标 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '综合均分', value: data.summary.overall_avg || '—', icon: Target, color: 'text-indigo-600 bg-indigo-50' },
                { label: '练习时长', value: `${data.summary.total_time}分`, icon: Clock, color: 'text-green-600 bg-green-50' },
                { label: '练习次数', value: data.summary.total_exercises, icon: BookOpen, color: 'text-purple-600 bg-purple-50' },
                { label: '水平档位', value: data.summary.level_band, icon: Award, color: 'text-orange-600 bg-orange-50' },
              ].map((s) => {
                const Icon = s.icon
                return (
                  <Card key={s.label} className="p-3.5">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', s.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="text-lg font-bold text-gray-900 leading-tight">{s.value}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                  </Card>
                )
              })}
            </div>

            {!data.summary.has_data && (
              <Card className="border-orange-100 bg-orange-50/40">
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-gray-800 text-sm">该学生近 {days} 天无练习记录</div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        建议先确认学生是否已正确使用平台、是否知晓各模块入口，或是否存在登录障碍。
                        以下暂无数据可分析。
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 能力雷达 */}
            {radarData.length >= 3 && (
              <Card>
                <CardHeader><CardTitle className="text-base">能力分布</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={230}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#6b7280' }} />
                      <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* 模块明细 */}
            <Card>
              <CardHeader><CardTitle className="text-base">各模块表现</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {data.module_stats.map((m: any) => {
                    const Icon = MODULE_ICONS[m.module] || BookOpen
                    const hasScore = m.avg_score > 0
                    return (
                      <div key={m.module} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/70">
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 border border-gray-100">
                          <Icon className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">{m.label}</span>
                            {hasScore && m.avg_score < 70 && <Badge variant="danger">薄弱</Badge>}
                            {hasScore && m.avg_score >= 85 && <Badge variant="success">优势</Badge>}
                            {!hasScore && <Badge variant="default">无数据</Badge>}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {m.study_time} 分钟 · {m.exercise_count} 次练习 · 活跃 {m.active_days} 天
                          </div>
                        </div>
                        <div className={cn('text-lg font-bold shrink-0', hasScore ? getScoreColor(m.avg_score) : 'text-gray-300')}>
                          {hasScore ? m.avg_score : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* 薄弱与优势 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />薄弱环节
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.weak_modules.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">无明显薄弱模块</p>
                  ) : (
                    <div className="space-y-2">
                      {data.weak_modules.map((w: any) => (
                        <div key={w.module} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{w.label}</span>
                          <span className="font-semibold text-red-600">{w.avg_score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />优势环节
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.strong_modules.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">暂无突出优势模块</p>
                  ) : (
                    <div className="space-y-2">
                      {data.strong_modules.map((w: any) => (
                        <div key={w.module} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{w.label}</span>
                          <span className="font-semibold text-green-600">{w.avg_score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 写作维度 */}
            {data.writing.count > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">写作维度得分（{data.writing.count} 篇，均分 {data.writing.avg_score}）</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.writing.dimensions.length > 0 && (
                    <ResponsiveContainer width="100%" height={Math.max(160, data.writing.dimensions.length * 34)}>
                      <BarChart data={data.writing.dimensions} layout="vertical" margin={{ left: 8, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="dimension" type="category" width={110} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                        <Bar dataKey="score" name="得分率" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  {data.writing.error_types.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-50">
                      <div className="text-xs font-medium text-gray-600 mb-2">高频错误类型</div>
                      <div className="flex flex-wrap gap-2">
                        {data.writing.error_types.slice(0, 6).map((e: any) => (
                          <span key={e.type} className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-xs">
                            {ERROR_TYPE_LABELS[e.type] || e.type} × {e.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 口语 & 阅读 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">口语练习</CardTitle></CardHeader>
                <CardContent>
                  {data.speaking.count === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">暂无口语练习记录</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-sm mb-3">
                        <span className="text-gray-500">均分</span>
                        <span className={cn('font-bold', getScoreColor(data.speaking.avg_score))}>{data.speaking.avg_score}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                        <span>练习次数</span><span>{data.speaking.count} 次</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                        <span>平均时长</span><span>{data.speaking.avg_duration} 秒</span>
                      </div>
                      {data.speaking.by_type.length > 0 && (
                        <div className="pt-3 border-t border-gray-50 space-y-1.5">
                          {data.speaking.by_type.map((t: any) => (
                            <div key={t.type} className="flex items-center justify-between text-xs">
                              <span className="text-gray-500">{SPEAKING_TYPE_LABELS[t.type] || t.type}</span>
                              <span className="text-gray-700 font-medium">{t.avg_score} 分 · {t.count} 次</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">阅读练习</CardTitle></CardHeader>
                <CardContent>
                  {data.reading.count === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">暂无阅读练习记录</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-sm mb-3">
                        <span className="text-gray-500">理解均分</span>
                        <span className={cn('font-bold', getScoreColor(data.reading.avg_score))}>{data.reading.avg_score}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                        <span>完成篇数</span><span>{data.reading.count} 篇</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>平均用时</span><span>{Math.round(data.reading.avg_time_sec / 60)} 分钟</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
