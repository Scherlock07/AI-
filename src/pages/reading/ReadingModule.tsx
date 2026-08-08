import { useState, useEffect } from 'react'
import { readingApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, getDifficultyLabel, getDifficultyColor } from '@/lib/utils'
import {
  BookOpen, Upload, Scan, Sparkles, Brain, BookMarked,
  Languages, Lightbulb, ChevronRight, Eye, Network,
  FileText, Search,
} from 'lucide-react'

type TabType = 'library' | 'analyze' | 'import'

export function ReadingModule() {
  const [tab, setTab] = useState<TabType>('library')

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">阅读练习</h1>
        <p className="text-sm text-gray-400">文本导入 · AI释义 · 逻辑可视化 · 长难句分析 · 双语对照</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'library' as TabType, label: '文本库', icon: BookOpen },
          { key: 'analyze' as TabType, label: '阅读分析', icon: Brain },
          { key: 'import' as TabType, label: '导入文本', icon: Upload },
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

      {tab === 'library' && <LibraryView />}
      {tab === 'analyze' && <AnalyzeView />}
      {tab === 'import' && <ImportView />}
    </div>
  )
}

function LibraryView() {
  const { toast } = useToast()
  const [texts, setTexts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTexts = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await readingApi.listTexts()
      const data = Array.isArray(res) ? res : (res.texts || res.items || [])
      setTexts(data)
    } catch (err: any) {
      setError(err.message || '加载文本库失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTexts()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchTexts} />
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100">
        <CardContent className="pt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Upload className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">导入阅读文本</h3>
              <p className="text-sm text-gray-400">支持扫描图片、PDF、文本文件，AI自动解析</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => toast('扫描导入功能开发中，请使用下方手动导入', 'info')}>
            <Scan className="w-4 h-4" />
            扫描导入
          </Button>
        </CardContent>
      </Card>

      {texts.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8 text-gray-300" />}
          title="暂无阅读文本"
          desc="通过导入功能添加阅读材料，AI将自动进行分析"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {texts.map((t) => (
            <Card key={t.id} hover>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{t.title}</h3>
                    <p className="text-xs text-gray-400">{t.source || '用户导入'}</p>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', getDifficultyColor(t.difficulty))}>
                    {getDifficultyLabel(t.difficulty)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-3 mb-3">{(t.content || '').slice(0, 200)}...</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => toast('正在跳转到阅读分析...', 'info')}>
                    <Brain className="w-3 h-3" />
                    AI分析
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toast('双语对照功能开发中', 'info')}>
                    <Languages className="w-3 h-3" />
                    双语对照
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function AnalyzeView() {
  const [content, setContent] = useState('')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)

  const handleAnalyze = async () => {
    if (!content.trim()) return
    setAnalyzing(true)
    setError(null)
    try {
      const res = await readingApi.analyze(content, difficulty)
      setResult(res)
    } catch (err: any) {
      setError(err.message || 'AI分析失败，请稍后重试')
    } finally {
      setAnalyzing(false)
    }
  }

  const sampleText = 'Artificial intelligence is rapidly transforming the educational landscape. From personalized learning algorithms to automated grading systems, AI technologies are reshaping how students learn and how teachers teach. However, the widespread adoption of AI in education also raises important ethical questions.'

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-500" />
            <CardTitle>AI阅读分析</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">阅读文本</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴或输入要分析的英文文本..."
              rows={5}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none"
            />
            <button
              onClick={() => setContent(sampleText)}
              className="mt-1 text-xs text-indigo-500 hover:text-indigo-600"
            >
              使用示例文本
            </button>
          </div>

          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">难度级别</label>
            <div className="flex gap-2">
              {[
                { value: 'beginner', label: '初级' },
                { value: 'intermediate', label: '中级' },
                { value: 'advanced', label: '高级' },
              ].map(d => (
                <button key={d.value} onClick={() => setDifficulty(d.value)}
                  className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    difficulty === d.value ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200' : 'bg-gray-50 text-gray-500')}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <Button size="lg" className="w-full" onClick={handleAnalyze} disabled={analyzing || !content.trim()}>
            {analyzing ? <LoadingSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
            {analyzing ? 'AI分析中...' : '开始AI分析'}
          </Button>

          {error && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <div className="grid grid-cols-1 gap-4">
          {/* AI Summary */}
          {result.summary && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                  <CardTitle>AI摘要 & 要点</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3">{result.summary}</p>
                {result.key_points && Array.isArray(result.key_points) && (
                  <div className="space-y-2">
                    {result.key_points.map((point: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-medium shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-sm text-gray-600">{point}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Translation */}
          {result.translation && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Languages className="w-5 h-5 text-purple-500" />
                  <CardTitle>双语对照</CardTitle>
                  <button onClick={() => setShowTranslation(!showTranslation)}
                    className={cn('ml-auto px-2 py-1 rounded text-xs font-medium',
                      showTranslation ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-400')}>
                    {showTranslation ? '隐藏' : '显示'}译文
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-800 leading-relaxed mb-2">{content}</p>
                {showTranslation && (
                  <p className="text-sm text-gray-500 leading-relaxed border-l-2 border-indigo-200 pl-3 italic">
                    {result.translation}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Vocabulary */}
          {result.vocabulary && Array.isArray(result.vocabulary) && result.vocabulary.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BookMarked className="w-5 h-5 text-emerald-500" />
                  <CardTitle>关键词汇</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {result.vocabulary.map((v: any, i: number) => (
                    <div key={i} className="p-3 border border-gray-100 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-gray-900">{v.word}</span>
                        {v.phonetic && <span className="text-xs text-gray-400">{v.phonetic}</span>}
                      </div>
                      <p className="text-xs text-gray-500">{v.definition || v.meaning || ''}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Long Sentences */}
          {result.long_sentences && Array.isArray(result.long_sentences) && result.long_sentences.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Network className="w-5 h-5 text-purple-500" />
                  <CardTitle>长难句分析</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.long_sentences.map((ls: any, i: number) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700 italic mb-2">{ls.sentence || ls.text || ''}</p>
                      <p className="text-xs text-gray-500">{ls.analysis || ls.explanation || ''}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reading Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">文本数据</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{content.split(/\s+/).filter(Boolean).length}</div>
                  <div className="text-xs text-gray-400">总词数</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{content.split(/[.!?]+/).filter(Boolean).length}</div>
                  <div className="text-xs text-gray-400">句子数</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-indigo-600">{getDifficultyLabel(difficulty)}</div>
                  <div className="text-xs text-gray-400">难度</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{result.reading_time || Math.ceil(content.split(/\s+/).length / 200)}</div>
                  <div className="text-xs text-gray-400">预估分钟</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!result && !analyzing && !error && (
        <Card className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-indigo-400" />
            </div>
            <p className="text-gray-400 text-sm">
              粘贴英文文本，AI将自动进行摘要、翻译、词汇提取<br />和长难句分析，帮你深入理解阅读内容
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

function ImportView() {
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [content, setContent] = useState('')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [importing, setImporting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    if (!title.trim() || !content.trim()) return
    setImporting(true)
    setError(null)
    setSuccess(false)
    try {
      await readingApi.import({ title, source, content, difficulty })
      setSuccess(true)
      setTitle('')
      setSource('')
      setContent('')
    } catch (err: any) {
      setError(err.message || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Import Methods */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { title: '扫描图片', icon: Scan, desc: 'OCR识别印刷体或手写体文本', color: 'from-blue-400 to-blue-600' },
          { title: '上传文件', icon: FileText, desc: '支持 PDF / TXT / DOCX 格式', color: 'from-purple-400 to-purple-600' },
          { title: '粘贴文本', icon: Upload, desc: '直接粘贴外刊文章或文本内容', color: 'from-emerald-400 to-emerald-600' },
        ].map((mode) => {
          const Icon = mode.icon
          return (
            <Card key={mode.title} hover className="p-6 text-center">
              <div className={cn('w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mx-auto mb-3', mode.color)}>
                <Icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{mode.title}</h3>
              <p className="text-xs text-gray-400 mb-4">{mode.desc}</p>
            </Card>
          )
        })}
      </div>

      {/* Import Form */}
      <Card>
        <CardHeader>
          <CardTitle>手动导入文本</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">标题</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入文章标题"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">来源</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="如：The Economist"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">难度</label>
              <div className="flex gap-2">
                {[
                  { value: 'beginner', label: '初级' },
                  { value: 'intermediate', label: '中级' },
                  { value: 'advanced', label: '高级' },
                ].map(d => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      difficulty === d.value ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200' : 'bg-gray-50 text-gray-500')}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">文本内容</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="粘贴英文文章全文..."
                rows={8}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            {success && (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600">导入成功！文本已添加到文本库。</p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            <Button size="lg" className="w-full" onClick={handleImport} disabled={importing || !title.trim() || !content.trim()}>
              {importing ? <LoadingSpinner size="sm" /> : <Upload className="w-4 h-4" />}
              {importing ? '导入中...' : '导入文本'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* External Journal Import Note */}
      <Card className="bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200">
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-700">外刊文本导入端口</h3>
              <p className="text-sm text-gray-400">
                支持手动导入外刊文章全文。平台不提供自动爬取功能，用户可通过粘贴文本或上传文件方式导入阅读材料。导入后AI将自动进行释义、分析和词汇提取。
              </p>
            </div>
            <Badge variant="default">手动导入</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
