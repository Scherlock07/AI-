/**
 * 意见反馈弹窗
 * 入口：Header 右上角反馈按钮
 * 类型：功能异常 / 体验问题 / 功能建议 / 内容问题 / 其他
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { feedbackApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/Loading'
import { cn } from '@/lib/utils'
import { X, MessageSquarePlus, Send, CheckCircle2 } from 'lucide-react'

const CATEGORIES = [
  { value: 'bug', label: '功能异常', desc: '功能报错、无法使用', icon: '🐛' },
  { value: 'ux', label: '体验问题', desc: '卡顿、排版错乱、操作别扭', icon: '📱' },
  { value: 'feature', label: '功能建议', desc: '希望增加的新功能', icon: '💡' },
  { value: 'content', label: '内容问题', desc: '题目/AI反馈内容有误', icon: '📝' },
  { value: 'other', label: '其他', desc: '任何想告诉我们的', icon: '💬' },
]

export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [category, setCategory] = useState('bug')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (!open) return null

  const handleSubmit = async () => {
    if (content.trim().length < 5) {
      toast('请至少填写5个字的反馈内容', 'warning')
      return
    }
    setSubmitting(true)
    try {
      await feedbackApi.submit({
        category,
        content: content.trim(),
        contact: contact.trim(),
        page: window.location.pathname,
      })
      setSubmitted(true)
      toast('反馈已提交，感谢你的建议！', 'success')
    } catch (err: any) {
      toast(err.message || '提交失败，请稍后重试', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    // 关闭时重置状态（下次打开是干净的）
    setTimeout(() => {
      setSubmitted(false)
      setContent('')
      setContact('')
      setCategory('bug')
    }, 200)
    onClose()
  }

  // 用 Portal 渲染到 document.body：
  // 若渲染在 header（带 backdrop-blur）内，backdrop-filter 会把 fixed 元素的
  // 定位基准从视口改为 header 本身，导致弹窗被压进顶栏、无法正常关闭
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50 animate-fadeIn" onClick={handleClose} />

      {/* 弹窗主体：移动端底部抽屉式，桌面居中 */}
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl animate-scaleIn max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <MessageSquarePlus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">意见反馈</h3>
              <p className="text-xs text-gray-400">你的反馈将直接送达开发团队</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          /* 成功态 */
          <div className="p-8 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
            <h4 className="font-semibold text-gray-900 mb-1">提交成功</h4>
            <p className="text-sm text-gray-500 mb-6">
              感谢你的反馈{user?.display_name ? `，${user.display_name}` : ''}！我们会认真阅读每一条建议。
            </p>
            <Button onClick={handleClose}>好的</Button>
          </div>
        ) : (
          /* 表单 */
          <div className="p-5 space-y-4 overflow-y-auto">
            {/* 类型选择 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">反馈类型</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition-all',
                      category === c.value
                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <div className="text-lg leading-none mb-1">{c.icon}</div>
                    <div className="text-sm font-medium text-gray-800">{c.label}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{c.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 反馈内容 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                详细描述 <span className="text-red-400">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={
                  category === 'bug'
                    ? '哪个页面、做了什么操作、出现了什么问题？例：写作批改点击后一直转圈'
                    : '说说你的想法或遇到的问题...'
                }
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400 resize-none"
              />
              <div className="text-right text-xs text-gray-400 mt-1">{content.length}/2000</div>
            </div>

            {/* 联系方式 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                联系方式 <span className="text-gray-400 font-normal text-xs">（选填，便于我们回访）</span>
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="QQ / 微信 / 邮箱"
                maxLength={100}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400"
              />
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              提交时会自动附带：当前页面路径、设备类型（手机/电脑）。不收集任何学习内容和个人数据。
            </p>
          </div>
        )}

        {/* 底部按钮 */}
        {!submitted && (
          <div className="px-5 py-4 border-t border-gray-100 shrink-0">
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || content.trim().length < 5}
            >
              {submitting ? <LoadingSpinner size="sm" /> : <Send className="w-4 h-4" />}
              {submitting ? '提交中...' : '提交反馈'}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
