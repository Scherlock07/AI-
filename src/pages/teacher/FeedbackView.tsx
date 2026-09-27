/**
 * 教师后台 — 意见反馈管理视图
 * 查看/筛选学生反馈，更新处理状态
 */

import { useState, useEffect } from 'react'
import { feedbackApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/Loading'
import { cn } from '@/lib/utils'
import { MessageSquarePlus, Smartphone, Monitor } from 'lucide-react'

const CATEGORY_LABEL: Record<string, string> = {
  bug: '功能异常',
  ux: '体验问题',
  feature: '功能建议',
  content: '内容问题',
  other: '其他',
}

const STATUS_META: Record<string, { label: string; variant: 'danger' | 'warning' | 'success' }> = {
  pending: { label: '待处理', variant: 'danger' },
  processing: { label: '处理中', variant: 'warning' },
  resolved: { label: '已解决', variant: 'success' },
}

export function FeedbackView() {
  const { toast } = useToast()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const fetchList = async (status = filter) => {
    setLoading(true)
    setError(null)
    try {
      const res = await feedbackApi.list(status || undefined)
      setItems(Array.isArray(res) ? res : [])
    } catch (err: any) {
      setError(err.message || '加载反馈失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [filter])

  const handleUpdate = async (id: string, status: string, reply = '') => {
    try {
      await feedbackApi.update(id, { status, reply })
      toast('状态已更新', 'success')
      setReplyFor(null)
      setReplyText('')
      fetchList()
    } catch (err: any) {
      toast(err.message || '更新失败', 'error')
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (error && items.length === 0) {
    return <ErrorState message={error} onRetry={() => fetchList()} />
  }

  return (
    <div className="animate-fadeIn">
      {/* 状态筛选 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { value: '', label: '全部' },
          { value: 'pending', label: '待处理' },
          { value: 'processing', label: '处理中' },
          { value: 'resolved', label: '已解决' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              filter === f.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            )}
          >
            {f.label}
            {f.value === 'pending' && items.filter((i) => i.status === 'pending').length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[11px]">
                {items.filter((i) => i.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<MessageSquarePlus className="w-8 h-8 text-gray-300" />}
              title="暂无反馈"
              desc="学生通过页面右上角「意见反馈」按钮提交的建议会显示在这里"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((f) => {
            const meta = STATUS_META[f.status] || STATUS_META.pending
            return (
              <Card key={f.id} className="animate-fadeIn">
                <CardContent className="pt-5">
                  {/* 头部 */}
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="primary">{CATEGORY_LABEL[f.category] || f.category}</Badge>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        {f.device === 'mobile' ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                        {f.device === 'mobile' ? '手机' : '电脑'}
                      </span>
                      {f.page && <span className="text-xs text-gray-400">页面: {f.page}</span>}
                    </div>
                    <span className="text-xs text-gray-400">
                      {f.created_at ? new Date(f.created_at).toLocaleString('zh-CN') : ''}
                    </span>
                  </div>

                  {/* 内容 */}
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{f.content}</p>

                  {/* 元信息 */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                    <span>提交人: {f.user?.display_name || f.user?.username || '匿名'}</span>
                    {f.contact && <span>联系: {f.contact}</span>}
                  </div>

                  {f.reply && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg text-sm text-green-700">
                      <span className="font-medium">回复: </span>{f.reply}
                    </div>
                  )}

                  {/* 操作 */}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-gray-50 flex-wrap">
                    {f.status !== 'processing' && (
                      <Button size="sm" variant="outline" onClick={() => handleUpdate(f.id, 'processing')}>
                        标记处理中
                      </Button>
                    )}
                    {f.status !== 'resolved' && (
                      <Button size="sm" variant="outline" onClick={() => handleUpdate(f.id, 'resolved')}>
                        标记已解决
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReplyFor(replyFor === f.id ? null : f.id)}
                    >
                      {replyFor === f.id ? '取消回复' : '回复'}
                    </Button>
                  </div>

                  {/* 回复输入 */}
                  {replyFor === f.id && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="处理回复（可选，会记录在反馈中）"
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                      />
                      <Button size="sm" onClick={() => handleUpdate(f.id, 'resolved', replyText.trim())}>
                        提交并解决
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
