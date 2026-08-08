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
  BarChart3, MessageSquare, Palette, BookMarked, ArrowLeft, Clock,
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

// ===== 写作练习题库 =====
const PRACTICE_TOPICS: Record<string, { title: string; instructions: string; difficulty: string }[]> = {
  chart: [
    { title: 'The chart below shows the changes in global renewable energy consumption from 2010 to 2023.', instructions: 'Write a summary of the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.', difficulty: '中级' },
    { title: 'The bar chart illustrates the percentage of people in different age groups who use social media platforms in 2024.', instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', difficulty: '中级' },
    { title: 'The line graph shows the unemployment rates in three European countries from 2015 to 2024.', instructions: 'Write a report describing the trends shown in the graph. Write at least 150 words.', difficulty: '高级' },
    { title: 'The pie charts compare the household expenditure patterns in two different countries.', instructions: 'Summarise the information by selecting and reporting the main features. Write at least 150 words.', difficulty: '初级' },
    { title: 'The table below shows the results of a survey about the most popular leisure activities among adults.', instructions: 'Write a report summarising the data. Make comparisons where relevant.', difficulty: '中级' },
    { title: 'The diagram illustrates the process of recycling plastic bottles.', instructions: 'Describe the process shown in the diagram. Write at least 150 words.', difficulty: '中级' },
  ],
  argumentative: [
    { title: 'Some people believe that university education should be free for all. To what extent do you agree or disagree?', instructions: 'Write an essay discussing both sides and giving your opinion. Write at least 250 words.', difficulty: '高级' },
    { title: 'In many countries, the amount of crime is increasing. What do you think are the main causes of crime? How can we deal with those causes?', instructions: 'Write an essay addressing both questions. Write at least 250 words.', difficulty: '高级' },
    { title: 'Some people think that social media has a negative impact on interpersonal relationships. Do you agree or disagree?', instructions: 'Present your arguments with examples. Write at least 250 words.', difficulty: '中级' },
    { title: 'Should governments invest more in public transportation rather than building new roads? Discuss both views and give your opinion.', instructions: 'Write at least 250 words with clear arguments and examples.', difficulty: '高级' },
    { title: 'Some people argue that children should not be allowed to use smartphones before the age of 14. To what extent do you agree?', instructions: 'Write an argumentative essay. Write at least 250 words.', difficulty: '中级' },
    { title: 'Is it better for students to study alone or in groups? Discuss the advantages of both approaches and state your preference.', instructions: 'Write at least 250 words.', difficulty: '初级' },
  ],
  creative: [
    { title: 'Write a story that begins with: "The letter arrived on a rainy Tuesday..."', instructions: 'Continue the story in 200-300 words. Focus on vivid descriptions and engaging plot.', difficulty: '初级' },
    { title: 'Imagine you could travel back in time to any historical event. Describe your experience.', instructions: 'Write a creative narrative of 200-300 words.', difficulty: '中级' },
    { title: 'Write a descriptive piece about a place that holds special meaning to you.', instructions: 'Use sensory details and figurative language. 200-300 words.', difficulty: '初级' },
    { title: 'Create a short dialogue between two characters who have just discovered something unexpected.', instructions: 'Focus on natural dialogue and character voice. 150-250 words.', difficulty: '中级' },
    { title: 'Write a letter to your future self, 10 years from now.', instructions: 'Express your hopes, fears, and aspirations. 200-300 words.', difficulty: '初级' },
    { title: 'Describe a world where technology no longer exists. How do people live?', instructions: 'Creative world-building essay. 200-300 words.', difficulty: '高级' },
  ],
  imitation: [
    { title: 'Read the opening of "Pride and Prejudice" by Jane Austen: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife." Write a paragraph imitating this ironic style about a modern topic.', instructions: 'Imitate the tone, sentence structure, and ironic humor. 150-200 words.', difficulty: '高级' },
    { title: 'Imitate the stream-of-consciousness style of Virginia Woolf. Write about a mundane moment (like making coffee) in this style.', instructions: 'Focus on internal monologue and flowing prose. 150-200 words.', difficulty: '高级' },
    { title: 'Read the concise style of Ernest Hemingway. Write a short scene of dialogue between two people, using only simple, direct sentences.', instructions: 'Minimalist style with subtext. 100-150 words.', difficulty: '中级' },
    { title: 'Imitate the descriptive style of Charles Dickens. Write a paragraph describing a busy street scene.', instructions: 'Use elaborate descriptions and character observations. 150-200 words.', difficulty: '高级' },
    { title: 'Read the opening of "1984" by George Orwell. Write a dystopian opening paragraph for a story set in 2050.', instructions: 'Match the cold, observational tone. 150-200 words.', difficulty: '中级' },
    { title: 'Imitate the witty, epigrammatic style of Oscar Wilde. Write a short social commentary.', instructions: 'Use paradoxes and aphorisms. 100-150 words.', difficulty: '高级' },
  ],
}

const PRACTICE_TYPE_META: Record<string, { title: string; icon: any; desc: string; color: string }> = {
  chart: { title: '图表分析题', icon: BarChart3, desc: '根据图表数据撰写分析报告', color: 'from-blue-400 to-blue-600' },
  argumentative: { title: '命题议论文', icon: MessageSquare, desc: '就给定话题展开论述', color: 'from-purple-400 to-purple-600' },
  creative: { title: '趣味写作', icon: Palette, desc: '轻量有趣，贴合时下的创意题目', color: 'from-orange-400 to-orange-600' },
  imitation: { title: '名篇仿写', icon: BookMarked, desc: '赏析经典英文文段并仿写', color: 'from-emerald-400 to-emerald-600' },
}

function DailyPracticeView() {
  const { toast } = useToast()
  const [phase, setPhase] = useState<'overview' | 'topics' | 'writing' | 'result'>('overview')
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedTopic, setSelectedTopic] = useState<{ title: string; instructions: string; difficulty: string } | null>(null)
  const [content, setContent] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSelectType = (type: string) => {
    setSelectedType(type)
    setPhase('topics')
  }

  const handleSelectTopic = (topic: { title: string; instructions: string; difficulty: string }) => {
    setSelectedTopic(topic)
    setContent('')
    setResult(null)
    setError('')
    setPhase('writing')
  }

  const handleGrade = async () => {
    if (!selectedTopic || !content.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await writingApi.grade({
        content,
        type: selectedType,
        prompt: selectedTopic.title,
        title: selectedTopic.title.slice(0, 50),
      })
      setResult(res)
      setPhase('result')
      toast('AI批改完成！', 'success')
    } catch (err: any) {
      setError(err.message || '批改失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (phase === 'topics') setPhase('overview')
    else if (phase === 'writing') setPhase('topics')
    else if (phase === 'result') setPhase('writing')
  }

  // ===== 题目选择视图 =====
  if (phase === 'topics' && selectedType) {
    const meta = PRACTICE_TYPE_META[selectedType]
    const topics = PRACTICE_TOPICS[selectedType] || []
    const Icon = meta.icon
    return (
      <div className="space-y-4">
        <button onClick={handleBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          返回练习类型
        </button>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center', meta.color)}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle>{meta.title}</CardTitle>
                <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
              </div>
            </div>
          </CardHeader>
        </Card>
        <div className="space-y-3">
          {topics.map((topic, i) => (
            <Card key={i} hover>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-medium">
                        {i + 1}
                      </span>
                      <Badge variant={topic.difficulty === '高级' ? 'danger' : topic.difficulty === '中级' ? 'warning' : 'success'}>
                        {topic.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mb-1">{topic.title}</p>
                    <p className="text-xs text-gray-400">{topic.instructions}</p>
                  </div>
                  <Button size="sm" variant="gradient" onClick={() => handleSelectTopic(topic)}>
                    <PenLine className="w-3 h-3" />
                    开始写作
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ===== 写作视图 =====
  if (phase === 'writing' && selectedTopic) {
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length
    return (
      <div className="space-y-4">
        <button onClick={handleBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          返回题目列表
        </button>
        <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="primary">{PRACTICE_TYPE_META[selectedType]?.title}</Badge>
              <Badge variant={selectedTopic.difficulty === '高级' ? 'danger' : selectedTopic.difficulty === '中级' ? 'warning' : 'success'}>
                {selectedTopic.difficulty}
              </Badge>
            </div>
            <p className="text-gray-800 font-medium mb-2">{selectedTopic.title}</p>
            <p className="text-sm text-gray-500">{selectedTopic.instructions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在此输入你的作文..."
              rows={14}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none font-mono"
            />
            <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
              <span>{wordCount} 词</span>
              <span>建议 150-400 词</span>
            </div>
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
              disabled={!content.trim() || loading}
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  AI 批改中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  提交AI批改
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ===== 结果视图 =====
  if (phase === 'result' && result && selectedTopic) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={handleBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            返回修改
          </button>
          <Button size="sm" variant="outline" onClick={() => { setPhase('overview'); setSelectedType(''); setSelectedTopic(null); setResult(null); setContent(''); }}>
            完成练习
          </Button>
        </div>
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
            <CardHeader><CardTitle>多维度评分</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {result.scores.map((dim: any, i: number) => (
                  <div key={i}>
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
      </div>
    )
  }

  // ===== 总览视图 =====
  const todayTopic = PRACTICE_TOPICS.chart[0]
  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              <CardTitle>今日推荐题目</CardTitle>
            </div>
            <Badge variant="primary">图表分析题</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-gray-800 font-medium mb-2">{todayTopic.title}</p>
          <p className="text-sm text-gray-500 mb-4">{todayTopic.instructions}</p>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1 text-sm text-gray-400">
              <Clock className="w-3 h-3" />
              <span className="font-medium text-gray-600">20</span> 分钟限时
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-400">
              建议词数 <span className="font-medium text-gray-600">150-200</span>
            </div>
          </div>
          <Button variant="gradient" size="lg" onClick={() => { setSelectedType('chart'); setSelectedTopic(todayTopic); setContent(''); setResult(null); setPhase('writing'); }}>
            <PenLine className="w-4 h-4" />
            开始写作
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">练习类型</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(PRACTICE_TYPE_META).map(([type, meta]) => {
            const Icon = meta.icon
            const count = PRACTICE_TOPICS[type]?.length || 0
            return (
              <Card key={type} hover className="p-5 cursor-pointer" >
                <div onClick={() => handleSelectType(type)}>
                  <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3', meta.color)}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-1">{meta.title}</h4>
                  <p className="text-xs text-gray-400 mb-3">{meta.desc}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant="default">{count} 题</Badge>
                    <span className="text-xs text-indigo-500 font-medium flex items-center gap-1">
                      开始 <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-gray-400" />
            <CardTitle>题库总览</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(PRACTICE_TYPE_META).flatMap(([type, meta]) =>
              (PRACTICE_TOPICS[type] || []).slice(0, 2).map((topic, i) => (
                <div
                  key={`${type}-${i}`}
                  onClick={() => { setSelectedType(type); handleSelectTopic(topic) }}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{topic.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="default">{meta.title}</Badge>
                      <Badge variant={topic.difficulty === '高级' ? 'danger' : topic.difficulty === '中级' ? 'warning' : 'success'}>
                        {topic.difficulty}
                      </Badge>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 ml-2" />
                </div>
              ))
            )}
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
