import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, getScoreColor, formatDate } from '@/lib/utils'
import { writingApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import {
  PenLine, Upload, Camera, FileText, Sparkles, TrendingUp,
  CheckCircle2, Lightbulb, ArrowRight, Star, BookOpen,
} from 'lucide-react'

type TabType = 'grading' | 'daily' | 'history'

export function WritingModule() {
  const [tab, setTab] = useState<TabType>('grading')

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">写作练习</h1>
        <p className="text-sm text-gray-400">AI智能批改 · 多维度评分 · 润色建议</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'grading' as TabType, label: '作文批改', icon: PenLine },
          { key: 'daily' as TabType, label: '每日练习', icon: FileText },
          { key: 'history' as TabType, label: '历史记录', icon: TrendingUp },
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

      {tab === 'grading' && <GradingView />}
      {tab === 'daily' && <DailyPracticeView />}
      {tab === 'history' && <HistoryView />}
    </div>
  )
}

function GradingView() {
  const { toast } = useToast()
  const [inputMode, setInputMode] = useState<'type' | 'upload'>('type')
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [content, setContent] = useState('')
  const [writingType, setWritingType] = useState('argumentative')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGrade = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await writingApi.grade({
        content,
        type: writingType,
        prompt: prompt || 'General writing practice',
        title: title || 'Untitled',
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message || '批改失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Input Section */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>提交作文</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInputMode('type')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  inputMode === 'type' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-500'
                )}
              >
                <PenLine className="w-4 h-4" />
                打字输入
              </button>
              <button
                onClick={() => setInputMode('upload')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  inputMode === 'upload' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-500'
                )}
              >
                <Camera className="w-4 h-4" />
                拍照上传
              </button>
            </div>

            {/* Writing Type */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">写作类型</label>
              <select
                value={writingType}
                onChange={(e) => setWritingType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
              >
                <option value="argumentative">议论文</option>
                <option value="chart">图表分析</option>
                <option value="creative">创意写作</option>
                <option value="imitation">名篇仿写</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">写作题目</label>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="请输入或粘贴你的写作题目"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
            </div>

            {inputMode === 'type' ? (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">作文内容</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="在此输入你的作文..."
                  rows={12}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none font-mono"
                />
                <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                  <span>{content.trim().split(/\s+/).filter(Boolean).length} 词</span>
                  <span>建议 250-400 词</span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => toast('OCR图片上传功能开发中，请使用打字输入', 'info')}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-300 transition-colors cursor-pointer"
              >
                <Upload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">点击或拖拽上传手写作文照片</p>
                <p className="text-xs text-gray-400">支持 JPG / PNG，AI将自动识别手写内容</p>
                <Badge variant="warning" className="mt-3">OCR识别后可手动修正</Badge>
              </div>
            )}

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <Button
              variant="gradient"
              className="w-full mt-4"
              size="lg"
              onClick={handleGrade}
              disabled={!content || loading}
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  AI 批改中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI智能批改
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Result Section */}
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
                  <div className="text-right">
                    <div className="text-sm text-gray-500 mb-1">词数</div>
                    <div className="text-2xl font-bold text-gray-700">{content.trim().split(/\s+/).filter(Boolean).length}</div>
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

            {result.ai_feedback && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                    <CardTitle>AI 综合评语</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 leading-relaxed">{result.ai_feedback}</p>
                </CardContent>
              </Card>
            )}

            {result.error_details && result.error_details.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-amber-500" />
                    <CardTitle>逐句纠错</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.error_details.map((imp: any, i: number) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm text-red-500 line-through">{imp.original}</span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="text-sm text-emerald-600 font-medium">{imp.corrected}</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          <Badge variant="default" className="mr-1">{imp.error_type}</Badge>
                          {imp.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.revised_version && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <CardTitle>AI润色版本</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{result.revised_version}</p>
                </CardContent>
              </Card>
            )}
          </>
        ) : loading ? (
          <Card className="h-full flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <LoadingSpinner size="lg" />
              <p className="text-gray-400 text-sm mt-4">AI 正在批改你的作文...</p>
              <p className="text-gray-300 text-xs mt-1">六维度评分 · 逐句纠错 · 润色建议</p>
            </div>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="text-gray-400 text-sm">提交作文后，AI将从流畅度、逻辑性、材料丰富度、<br />地道表达、语法准确性、词汇多样性六大维度<br />进行批改与评分</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function DailyPracticeView() {
  const { toast } = useToast()
  const practiceTypes = [
    { type: 'chart', title: '图表分析题', icon: '📊', desc: '根据图表数据撰写分析报告', color: 'from-blue-400 to-blue-600', topics: 12 },
    { type: 'argumentative', title: '命题议论文', icon: '📝', desc: '就给定话题展开论述', color: 'from-purple-400 to-purple-600', topics: 15 },
    { type: 'creative', title: '趣味写作', icon: '🎨', desc: '轻量有趣，贴合时下的创意题目', color: 'from-orange-400 to-orange-600', topics: 8 },
    { type: 'imitation', title: '名篇仿写', icon: '📖', desc: '赏析经典英文文段并仿写', color: 'from-emerald-400 to-emerald-600', topics: 6 },
  ]

  const todayTopic = {
    type: '图表分析题',
    title: 'The chart below shows the changes in global renewable energy consumption from 2010 to 2023.',
    instructions: 'Write a summary of the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
    timeLimit: 20,
    wordLimit: '150-200',
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              <CardTitle>今日推荐题目</CardTitle>
            </div>
            <Badge variant="primary">{todayTopic.type}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-gray-800 font-medium mb-2">{todayTopic.title}</p>
          <p className="text-sm text-gray-500 mb-4">{todayTopic.instructions}</p>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1 text-sm text-gray-400">
              <span className="font-medium text-gray-600">{todayTopic.timeLimit}</span> 分钟限时
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-400">
              建议词数 <span className="font-medium text-gray-600">{todayTopic.wordLimit}</span>
            </div>
          </div>
          <Button variant="gradient" size="lg" onClick={() => toast('正在跳转到作文批改...', 'info')}>
            <PenLine className="w-4 h-4" />
            开始写作
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">练习类型</h3>
        <div className="grid grid-cols-4 gap-4">
          {practiceTypes.map((pt) => (
            <Card key={pt.type} hover className="p-5">
              <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl mb-3', pt.color)}>
                {pt.icon}
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">{pt.title}</h4>
              <p className="text-xs text-gray-400 mb-3">{pt.desc}</p>
              <div className="flex items-center justify-between">
                <Badge variant="default">{pt.topics} 题</Badge>
                <Button variant="ghost" size="sm" onClick={() => toast(`${pt.title}练习开发中`, 'info')}>开始</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-gray-400" />
            <CardTitle>题库预览</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { title: 'Some people believe that university education should be free for all. To what extent do you agree?', type: '议论文', difficulty: '高级' },
              { title: 'The line graph illustrates the proportion of people using public transport in four cities.', type: '图表分析', difficulty: '中级' },
              { title: 'Write a story that begins with: "The letter arrived on a rainy Tuesday..."', type: '趣味写作', difficulty: '初级' },
            ].map((q, i) => (
              <div key={i} onClick={() => toast('题库练习开发中，请使用作文批改功能', 'info')} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{q.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="default">{q.type}</Badge>
                    <Badge variant={q.difficulty === '高级' ? 'danger' : q.difficulty === '中级' ? 'warning' : 'success'}>{q.difficulty}</Badge>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function HistoryView() {
  const [writings, setWritings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchWritings = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await writingApi.listSubmissions()
      setWritings(Array.isArray(res) ? res : [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWritings() }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    )
  }

  if (error) {
    return <ErrorState message="加载历史记录失败" onRetry={fetchWritings} />
  }

  if (writings.length === 0) {
    return <EmptyState title="还没有写作记录" desc="完成你的第一篇AI批改作文吧！" />
  }

  return (
    <div className="space-y-4">
      {writings.map((w: any) => (
        <Card key={w.id} hover>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">{w.title || '未命名作文'}</h3>
                  <Badge variant={w.type === 'argumentative' ? 'primary' : w.type === 'chart' ? 'success' : w.type === 'creative' ? 'warning' : 'default'}>
                    {w.type === 'argumentative' ? '议论文' : w.type === 'chart' ? '图表分析' : w.type === 'creative' ? '趣味写作' : '名篇仿写'}
                  </Badge>
                </div>
                <p className="text-sm text-gray-400">{formatDate(w.submitted_at || w.created_at)} · {w.word_count || (w.content || '').split(/\s+/).length} 词</p>
              </div>
              {w.overall_score && (
                <div className="text-right">
                  <div className={cn('text-3xl font-bold', getScoreColor(w.overall_score))}>{w.overall_score}</div>
                  <div className="text-xs text-gray-400">综合评分</div>
                </div>
              )}
            </div>

            {w.scores && w.scores.length > 0 && (
              <div className="grid grid-cols-6 gap-3 mb-3">
                {w.scores.map((s: any) => (
                  <div key={s.name} className="text-center">
                    <div className={cn('text-sm font-bold mb-1', getScoreColor(s.score))}>{s.score}</div>
                    <div className="text-xs text-gray-400">{s.name}</div>
                  </div>
                ))}
              </div>
            )}

            {w.ai_feedback && (
              <div className="p-3 bg-indigo-50 rounded-lg flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-sm text-gray-600">{w.ai_feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
