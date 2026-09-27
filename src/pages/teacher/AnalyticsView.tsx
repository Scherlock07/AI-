/**
 * 教师后台 — 使用数据视图
 * 模块访问分布 / 每日活跃趋势 / 热门功能 / 模块停留时长 / 设备占比
 */

import { useState, useEffect } from 'react'
import { analyticsApi } from '@/api/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/Loading'
import { cn } from '@/lib/utils'
import { Users, Activity, Clock, Smartphone, Monitor, Flame } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts'

const MODULE_LABEL: Record<string, string> = {
  dashboard: '仪表盘',
  listening: '听力',
  speaking: '口语',
  reading: '阅读',
  writing: '写作',
  vocabulary: '词汇语法',
  translation: '翻译',
  community: '社区',
  teacher: '教师后台',
  profile: '学习档案',
}

const DAYS_OPTIONS = [7, 14, 30]

export function AnalyticsView() {
  const [days, setDays] = useState(14)
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = async (d = days) => {
    setLoading(true)
    setError(null)
    try {
      const res = await analyticsApi.summary(d)
      setSummary(res)
    } catch (err: any) {
      setError(err.message || '加载使用数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSummary()
  }, [days])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchSummary()} />
  }

  if (!summary || summary.total_events === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={<Activity className="w-8 h-8 text-gray-300" />}
            title="暂无使用数据"
            desc="学生学习时自动记录模块访问与功能使用，积累几天后这里会展示分析图表"
          />
        </CardContent>
      </Card>
    )
  }

  const moduleData = (summary.by_module || []).map((m: any) => ({
    name: MODULE_LABEL[m.module] || m.module,
    count: m.count,
  }))
  const dailyData = (summary.daily || []).map((d: any) => ({
    date: String(d.date).slice(5),
    events: d.events,
    users: d.users,
  }))
  const mobileCount = (summary.by_device || []).find((d: any) => d.device === 'mobile')?.count || 0
  const desktopCount = (summary.by_device || []).find((d: any) => d.device === 'desktop')?.count || 0
  const deviceTotal = mobileCount + desktopCount || 1

  const stats = [
    { label: '活跃用户', value: summary.total_users, icon: Users, color: 'text-indigo-600 bg-indigo-50' },
    { label: '事件总量', value: summary.total_events, icon: Activity, color: 'text-purple-600 bg-purple-50' },
    { label: '手机端占比', value: `${Math.round((mobileCount / deviceTotal) * 100)}%`, icon: Smartphone, color: 'text-orange-600 bg-orange-50' },
    { label: '统计范围', value: `${summary.days} 天`, icon: Clock, color: 'text-green-600 bg-green-50' },
  ]

  return (
    <div className="animate-fadeIn space-y-6">
      {/* 时间范围切换 */}
      <div className="flex gap-2">
        {DAYS_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              days === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            )}
          >
            近 {d} 天
          </button>
        ))}
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat) => {
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 每日活跃趋势 */}
        <Card>
          <CardHeader>
            <CardTitle>每日活跃趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="events" name="事件量" stroke="#6366f1" fill="url(#colorEvents)" strokeWidth={2} />
                <Area type="monotone" dataKey="users" name="活跃用户" stroke="#a855f7" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 模块访问分布 */}
        <Card>
          <CardHeader>
            <CardTitle>模块访问分布</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={moduleData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                <Bar dataKey="count" name="访问次数" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 热门功能 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              热门功能 TOP10
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(summary.top_actions || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">暂无功能使用记录</p>
            ) : (
              <div className="space-y-2.5">
                {(summary.top_actions || []).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                      i < 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400',
                    )}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-700 w-16 shrink-0">
                      {MODULE_LABEL[a.module] || a.module}
                    </span>
                    <span className="text-sm text-gray-500 flex-1 truncate">{a.action}</span>
                    <span className="text-sm font-semibold text-indigo-600 shrink-0">{a.count} 次</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 模块平均停留 + 设备 */}
        <Card>
          <CardHeader>
            <CardTitle>模块平均停留</CardTitle>
          </CardHeader>
          <CardContent>
            {(summary.avg_durations || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">暂无停留时长数据</p>
            ) : (
              <div className="space-y-3">
                {(summary.avg_durations || []).map((d: any) => (
                  <div key={d.module} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{MODULE_LABEL[d.module] || d.module}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {d.avg_seconds >= 60
                        ? `${Math.floor(d.avg_seconds / 60)}分${d.avg_seconds % 60}秒`
                        : `${d.avg_seconds}秒`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 pt-4 border-t border-gray-50">
              <div className="text-xs text-gray-400 mb-2">设备分布</div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Smartphone className="w-4 h-4 text-gray-400" /> {Math.round((mobileCount / deviceTotal) * 100)}%
                </span>
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Monitor className="w-4 h-4 text-gray-400" /> {Math.round((desktopCount / deviceTotal) * 100)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
