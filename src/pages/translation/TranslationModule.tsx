import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, getScoreColor, formatDate } from '@/lib/utils'
import { translationApi } from '@/api/client'
import { Languages, ArrowRight, Sparkles, CheckCircle2, Lightbulb, History } from 'lucide-react'

type TabType = 'practice' | 'history'
type Direction = 'en-to-zh' | 'zh-to-en'

const sampleTexts: Record<Direction, string[]> = {
  'en-to-zh': [
    'The rapid advancement of artificial intelligence has raised profound ethical questions about the future of human employment.',
    'Climate change poses an unprecedented threat to biodiversity, particularly in fragile ecosystems such as coral reefs and Arctic tundra.',
    'The concept of universal basic income has gained traction as automation threatens to displace millions of workers globally.',
  ],
  'zh-to-en': [
    '随着人工智能技术的飞速发展，越来越多的人开始关注其对传统就业市场的深远影响。',
    '中国政府近年来大力推动新能源汽车产业的发展，已成为全球最大的电动汽车市场。',
    '教育的本质不仅在于传授知识，更在于培养学生的批判性思维和创新能力。',
  ],
}

export function TranslationModule() {
  const [tab, setTab] = useState<TabType>('practice')

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">翻译练习</h1>
        <p className="text-sm text-gray-400">AI智能评分 · 多维度分析 · 翻译技巧指导</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'practice' as TabType, label: '翻译练习', icon: Languages },
          { key: 'history' as TabType, label: '历史记录', icon: History },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'practice' && <PracticeView />}
      {tab === 'history' && <HistoryView />}
    </div>
  )
}

function PracticeView() {
  const [direction, setDirection] = useState<Direction>('en-to-zh')
  const [sourceText, setSourceText] = useState(sampleTexts['en-to-zh'][0])
  const [userTranslation, setUserTranslation] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const switchDirection = () => {
    const newDir = direction === 'en-to-zh' ? 'zh-to-en' : 'en-to-zh'
    setDirection(newDir)
    setSourceText(sampleTexts[newDir][0])
    setUserTranslation('')
    setResult(null)
  }

  const newSample = () => {
    const samples = sampleTexts[direction]
    const current = samples.indexOf(sourceText)
    const next = samples[(current + 1) % samples.length]
    setSourceText(next)
    setUserTranslation('')
    setResult(null)
  }

  const handleGrade = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await translationApi.grade({
        source_text: sourceText,
        user_translation: userTranslation,
        direction,
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message || '评分失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Input */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>翻译练习</CardTitle>
              <button
                onClick={switchDirection}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <Languages className="w-4 h-4" />
                {direction === 'en-to-zh' ? '英→中' : '中→英'}
                <ArrowRight className={cn('w-3 h-3 transition-transform', direction === 'zh-to-en' && 'rotate-180')} />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Source Text */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">原文</label>
                <button onClick={newSample} className="text-xs text-indigo-500 hover:text-indigo-600">
                  换一题 →
                </button>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl min-h-[100px]">
                <p className="text-sm text-gray-800 leading-relaxed">{sourceText}</p>
              </div>
            </div>

            {/* User Translation */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">你的翻译</label>
              <textarea
                value={userTranslation}
                onChange={(e) => setUserTranslation(e.target.value)}
                placeholder={direction === 'en-to-zh' ? '请输入中文翻译...' : 'Please enter English translation...'}
                rows={6}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <Button variant="gradient" className="w-full" size="lg" onClick={handleGrade} disabled={!userTranslation || loading}>
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  AI 评分中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI智能评分
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Result */}
      <div className="space-y-4">
        {result ? (
          <>
            <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">综合评分</div>
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-bold text-indigo-600">{result.overall_score}</span>
                      <span className="text-sm text-gray-400 mb-1">/ 100</span>
                    </div>
                  </div>
                </div>
                <Progress value={result.overall_score} color="primary" />
              </CardContent>
            </Card>

            {result.scores && (
              <Card>
                <CardHeader>
                  <CardTitle>多维度评分</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.scores.map((dim: any) => (
                      <div key={dim.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{dim.name}</span>
                          <span className={cn('text-sm font-bold', getScoreColor(dim.score))}>{dim.score}</span>
                        </div>
                        <Progress value={dim.score} color={dim.score >= 85 ? 'success' : dim.score >= 70 ? 'primary' : 'warning'} />
                        <p className="text-xs text-gray-400 mt-1">{dim.feedback}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.reference_translation && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <CardTitle>参考译文</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 leading-relaxed">{result.reference_translation}</p>
                </CardContent>
              </Card>
            )}

            {result.improvement_suggestions && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-amber-500" />
                    <CardTitle>改进建议</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">{result.improvement_suggestions}</p>
                </CardContent>
              </Card>
            )}

            {result.translation_tips && result.translation_tips.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <CardTitle>翻译技巧</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.translation_tips.map((tip: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 text-xs flex items-center justify-center font-medium shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-sm text-gray-600">{tip}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : loading ? (
          <Card className="h-full flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <LoadingSpinner size="lg" />
              <p className="text-gray-400 text-sm mt-4">AI 正在评分你的翻译...</p>
            </div>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                <Languages className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="text-gray-400 text-sm">输入你的翻译，AI将从准确性、流畅度、<br />词汇和语法四个维度进行评分</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function HistoryView() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchRecords = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await translationApi.listRecords()
      setRecords(Array.isArray(res) ? res : [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRecords() }, [])

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
  if (error) return <ErrorState message="加载历史记录失败" onRetry={fetchRecords} />
  if (records.length === 0) return <EmptyState title="还没有翻译记录" desc="完成你的第一次翻译练习吧！" />

  return (
    <div className="space-y-4">
      {records.map((r: any) => (
        <Card key={r.id} hover>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={r.direction === 'en-to-zh' ? 'primary' : 'success'}>
                    {r.direction === 'en-to-zh' ? '英→中' : '中→英'}
                  </Badge>
                  <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 mb-1 line-clamp-1">{r.source_text}</p>
              </div>
              {r.overall_score && (
                <div className={cn('text-2xl font-bold', getScoreColor(r.overall_score))}>{r.overall_score}</div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
