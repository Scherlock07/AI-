import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn } from '@/lib/utils'
import { vocabularyApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import {
  BookMarked, Brain, Volume2, Search, Plus, Calendar,
  CheckCircle2, XCircle, Lightbulb, Network, Sparkles,
  PenLine, ChevronRight,
} from 'lucide-react'

type TabType = 'vocabulary' | 'grammar' | 'roots' | 'wrongbook'

export function VocabularyModule() {
  const [tab, setTab] = useState<TabType>('vocabulary')
  const [wrongCount, setWrongCount] = useState(0)

  useEffect(() => {
    vocabularyApi.listWrongAnswers().then((res: any) => {
      const arr = Array.isArray(res) ? res : []
      setWrongCount(arr.filter((w: any) => !w.reviewed).length)
    }).catch(() => {})
  }, [])

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">词汇与语法</h1>
        <p className="text-sm text-gray-400">智能词汇本 · 艾宾浩斯复习 · 语法练习 · 词根词缀分析</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto max-w-full">
        {[
          { key: 'vocabulary' as TabType, label: '词汇本', icon: BookMarked },
          { key: 'grammar' as TabType, label: '语法练习', icon: Brain },
          { key: 'roots' as TabType, label: '词根词缀', icon: Network },
          { key: 'wrongbook' as TabType, label: '错题本', icon: XCircle },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <Icon className="w-4 h-4" />
              {t.label}
              {t.key === 'wrongbook' && wrongCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {wrongCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'vocabulary' && <VocabularyView />}
      {tab === 'grammar' && <GrammarView />}
      {tab === 'roots' && <RootsView />}
      {tab === 'wrongbook' && <WrongBookView />}
    </div>
  )
}

function VocabularyView() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')

  const fetchWords = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await vocabularyApi.listWords()
      setItems(Array.isArray(res) ? res : [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWords() }, [])

  const filtered = items.filter(v =>
    !search || (v.word || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.definition || '').includes(search)
  )

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
  if (error) return <ErrorState message="加载词汇失败" onRetry={fetchWords} />

  const mastered = items.filter(v => (v.mastery || 0) >= 80).length
  const needWork = items.filter(v => (v.mastery || 0) < 50).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-gray-900">{items.length}</div>
          <div className="text-xs text-gray-400">总词汇量</div>
        </Card>
        <Card className="p-4 bg-indigo-50 border-indigo-100">
          <div className="text-2xl font-bold text-indigo-600">{items.filter(v => v.next_review && new Date(v.next_review) <= new Date()).length}</div>
          <div className="text-xs text-gray-400">今日待复习</div>
        </Card>
        <Card className="p-4 bg-emerald-50 border-emerald-100">
          <div className="text-2xl font-bold text-emerald-600">{mastered}</div>
          <div className="text-xs text-gray-400">已掌握</div>
        </Card>
        <Card className="p-4 bg-amber-50 border-amber-100">
          <div className="text-2xl font-bold text-amber-600">{needWork}</div>
          <div className="text-xs text-gray-400">需加强</div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>词汇本</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索单词..."
                  className="pl-8 pr-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-transparent focus:bg-white focus:border-indigo-300 focus:outline-none w-40"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="词汇本为空" desc="在阅读或练习中遇到的生词会自动收录到这里" />
          ) : (
            <div className="space-y-3">
              {filtered.map((v) => (
                <div key={v.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-bold text-gray-900">{v.word}</span>
                      <span className="text-sm text-gray-400">{v.phonetic}</span>
                      {v.part_of_speech && <Badge variant="default">{v.part_of_speech}</Badge>}
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{v.definition}</p>
                    {v.example && <p className="text-xs text-gray-400 italic">"{v.example}"</p>}
                  </div>
                  <div className="w-32">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">掌握度</span>
                      <span className={cn('text-xs font-bold', (v.mastery || 0) >= 80 ? 'text-emerald-600' : (v.mastery || 0) >= 50 ? 'text-indigo-600' : 'text-amber-600')}>{v.mastery || 0}%</span>
                    </div>
                    <Progress value={v.mastery || 0} color={(v.mastery || 0) >= 80 ? 'success' : (v.mastery || 0) >= 50 ? 'primary' : 'warning'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GrammarView() {
  const { toast } = useToast()
  const [exercises, setExercises] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showExplain, setShowExplain] = useState(false)

  const generateExercises = async () => {
    setLoading(true)
    try {
      const res = await vocabularyApi.generateGrammar({
        grammar_point: '',
        type: 'multiple-choice',
        difficulty: 'intermediate',
        count: 5,
      })
      setExercises(Array.isArray(res) ? res : [])
      setCurrentIdx(0)
      setSelectedAnswer(null)
      setShowExplain(false)
    } catch {
      setExercises([])
      toast('生成练习题失败，请稍后重试', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { generateExercises() }, [])

  const exercise = exercises[currentIdx]
  const typeLabels: Record<string, string> = {
    'fill-blank': '填空题', 'multiple-choice': '选择题',
    'error-correction': '改错题', 'sentence-transform': '句型转换',
  }

  const handleNext = () => {
    setCurrentIdx((currentIdx + 1) % exercises.length)
    setSelectedAnswer(null)
    setShowExplain(false)
  }

  const handleCheckAnswer = async () => {
    setShowExplain(true)
    if (exercise?.id && selectedAnswer) {
      try {
        await vocabularyApi.answerGrammar(exercise.id, selectedAnswer)
      } catch {
        // Answer recording failed silently, UI still works
      }
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>语法练习</CardTitle>
              <Button size="sm" variant="outline" onClick={generateExercises} disabled={loading}>
                <Sparkles className="w-3 h-3" />
                重新生成
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
            ) : !exercise ? (
              <EmptyState title="暂无练习题" desc="点击重新生成按钮创建新题目" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="primary">{typeLabels[exercise.type] || '练习题'}</Badge>
                    {exercise.grammar_point && <Badge variant="default">{exercise.grammar_point}</Badge>}
                  </div>
                  <span className="text-sm text-gray-400">{currentIdx + 1} / {exercises.length}</span>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl mb-4">
                  <p className="text-base text-gray-800">{exercise.question}</p>
                </div>

                {exercise.options && exercise.options.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {exercise.options.map((opt: string) => (
                      <button
                        key={opt}
                        onClick={() => !showExplain && setSelectedAnswer(opt)}
                        className={cn(
                          'w-full text-left px-4 py-3 rounded-xl border-2 transition-all',
                          selectedAnswer === opt
                            ? showExplain
                              ? opt === exercise.answer
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-red-500 bg-red-50'
                              : 'border-indigo-500 bg-indigo-50'
                            : showExplain && opt === exercise.answer
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <span className="text-sm text-gray-700">{opt}</span>
                        {showExplain && opt === exercise.answer && <CheckCircle2 className="w-4 h-4 text-emerald-500 inline ml-2" />}
                        {showExplain && selectedAnswer === opt && opt !== exercise.answer && <XCircle className="w-4 h-4 text-red-500 inline ml-2" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mb-4">
                    <input
                      value={selectedAnswer || ''}
                      onChange={(e) => !showExplain && setSelectedAnswer(e.target.value)}
                      placeholder="输入你的答案..."
                      className={cn(
                        'w-full px-4 py-3 text-sm border-2 rounded-xl focus:outline-none transition-all',
                        showExplain
                          ? selectedAnswer === exercise.answer
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-red-500 bg-red-50'
                          : 'border-gray-200 focus:border-indigo-400'
                      )}
                    />
                  </div>
                )}

                {showExplain && (
                  <div className="p-4 bg-indigo-50 rounded-xl mb-4">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">正确答案：{exercise.answer}</p>
                        <p className="text-sm text-gray-600">{exercise.explanation}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {!showExplain ? (
                    <Button onClick={handleCheckAnswer} disabled={!selectedAnswer}>
                      <CheckCircle2 className="w-4 h-4" />
                      检查答案
                    </Button>
                  ) : (
                    <Button onClick={handleNext}>
                      下一题
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <CardTitle className="text-base">AI语法诊断</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">完成练习后，AI将根据你的表现生成诊断报告</p>
            <Button size="sm" variant="outline" className="w-full" onClick={generateExercises}>
              <Sparkles className="w-3 h-3" />
              生成专项练习
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RootsView() {
  const { toast } = useToast()
  const [word, setWord] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleAnalyze = async (wordToAnalyze?: string) => {
    const target = wordToAnalyze || word
    if (!target) return
    setLoading(true)
    try {
      const res = await vocabularyApi.rootAnalysis(target)
      setResult(res)
    } catch {
      setResult(null)
      toast('词根分析失败，请稍后重试', 'error')
    } finally {
      setLoading(false)
    }
  }

  const sampleRoots = [
    { root: 'spect / spic', meaning: '看', origin: '拉丁语 specere', words: ['inspect', 'respect', 'perspective', 'spectator', 'retrospect'] },
    { root: 'port', meaning: '搬运', origin: '拉丁语 portare', words: ['transport', 'import', 'portable', 'important'] },
    { root: 'ject', meaning: '投掷', origin: '拉丁语 jacere', words: ['project', 'reject', 'inject', 'eject'] },
  ]

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-100">
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <Network className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">词根词缀分析</h3>
              <p className="text-sm text-gray-400">输入任意单词，AI自动拆解词根词缀</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="输入英文单词，如 unprecedented"
              className="flex-1 px-4 py-2.5 text-sm bg-white rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-400"
            />
            <Button variant="gradient" onClick={() => handleAnalyze()} disabled={loading || !word}>
              {loading ? <LoadingSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
              分析
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>「{result.word}」词根分析</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.root && (
                <div className="p-3 bg-purple-50 rounded-lg">
                  <span className="text-xs text-gray-400">词根</span>
                  <p className="text-sm font-medium text-purple-700 mt-0.5">{result.root}</p>
                </div>
              )}
              {result.prefix && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <span className="text-xs text-gray-400">前缀</span>
                  <p className="text-sm font-medium text-blue-700 mt-0.5">{result.prefix}</p>
                </div>
              )}
              {result.suffix && (
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <span className="text-xs text-gray-400">后缀</span>
                  <p className="text-sm font-medium text-emerald-700 mt-0.5">{result.suffix}</p>
                </div>
              )}
              {result.analysis && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-400">分析</span>
                  <p className="text-sm text-gray-600 mt-0.5">{result.analysis}</p>
                </div>
              )}
              {result.related_words && result.related_words.length > 0 && (
                <div>
                  <span className="text-xs text-gray-400">相关词汇</span>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {result.related_words.map((w: string) => (
                      <Badge key={w} variant="primary">{w}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {sampleRoots.map((group) => (
        <Card key={group.root}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg font-mono font-bold">
                {group.root}
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">{group.meaning}</span>
                <span className="text-xs text-gray-400 ml-2">来自 {group.origin}</span>
              </div>
              <Badge variant="primary">{group.words.length} 词</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.words.map((w) => (
                <div key={w} className="p-3 border border-gray-100 rounded-xl hover:border-indigo-200 transition-colors cursor-pointer" onClick={() => { setWord(w); handleAnalyze(w) }}>
                  <span className="font-bold text-gray-900">{w}</span>
                  <ChevronRight className="w-3 h-3 text-gray-300 inline ml-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function WrongBookView() {
  const { toast } = useToast()
  const [answers, setAnswers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchAnswers = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await vocabularyApi.listWrongAnswers()
      setAnswers(Array.isArray(res) ? res : [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAnswers() }, [])

  const handleMarkReviewed = async (id: string) => {
    try {
      await vocabularyApi.markReviewed(id)
      setAnswers(answers.map(a => a.id === id ? { ...a, reviewed: true } : a))
      toast('已标记为已掌握', 'success')
    } catch {
      toast('标记失败，请稍后重试', 'error')
    }
  }

  const moduleLabels: Record<string, string> = {
    writing: '写作', vocabulary: '词汇', translation: '翻译',
    listening: '听力', reading: '阅读', speaking: '口语',
  }

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
  if (error) return <ErrorState message="加载错题本失败" onRetry={fetchAnswers} />
  if (answers.length === 0) return <EmptyState title="错题本为空" desc="练习中的错题会自动收录到这里" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4 bg-red-50 border-red-100">
          <div className="text-2xl font-bold text-red-600">{answers.filter(w => !w.reviewed).length}</div>
          <div className="text-xs text-gray-400">待复习</div>
        </Card>
        <Card className="p-4 bg-emerald-50 border-emerald-100">
          <div className="text-2xl font-bold text-emerald-600">{answers.filter(w => w.reviewed).length}</div>
          <div className="text-xs text-gray-400">已复习</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-gray-900">{answers.length}</div>
          <div className="text-xs text-gray-400">总错题</div>
        </Card>
      </div>

      {answers.map((wa) => (
        <Card key={wa.id} className={cn(!wa.reviewed && 'border-l-4 border-l-red-500')}>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge variant={wa.reviewed ? 'success' : 'danger'}>{moduleLabels[wa.module] || wa.module}</Badge>
              </div>
              {wa.reviewed ? (
                <Badge variant="success"><CheckCircle2 className="w-3 h-3 inline mr-1" />已掌握</Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handleMarkReviewed(wa.id)}>标记已掌握</Button>
              )}
            </div>
            <p className="text-sm font-medium text-gray-800 mb-2">{wa.question}</p>
            {wa.user_answer && wa.correct_answer && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-2 bg-red-50 rounded-lg">
                  <div className="text-xs text-gray-400 mb-0.5">你的答案</div>
                  <div className="text-sm text-red-600">{wa.user_answer}</div>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <div className="text-xs text-gray-400 mb-0.5">正确答案</div>
                  <div className="text-sm text-emerald-600">{wa.correct_answer}</div>
                </div>
              </div>
            )}
            {wa.explanation && (
              <div className="mt-2 p-2 bg-indigo-50 rounded-lg flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600">{wa.explanation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
