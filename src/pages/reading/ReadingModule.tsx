import { useState, useEffect, useRef, useMemo } from 'react'
import { readingApi, vocabularyApi, writingApi, profileApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, getDifficultyLabel, getDifficultyColor } from '@/lib/utils'
import { speak } from '@/lib/tts'
import {
  BookOpen, Upload, Scan, Sparkles, Brain, BookMarked,
  Languages, Lightbulb, ChevronRight, Eye, Network,
  FileText, Search, X, Plus, Check, Loader2, MessageCircle,
  Highlighter, Type, AlignLeft, Volume2,
} from 'lucide-react'

type TabType = 'library' | 'analyze' | 'import'

// Detect numbered question patterns in text
function extractQuestions(text: string): string[] {
  const lines = text.split('\n')
  const questions: string[] = []
  const qPattern = /^(\d+[\.\)]\s+|Q\d+[\.:]\s*|Question\s+\d+[\.:]\s*)/i
  lines.forEach(line => {
    const trimmed = line.trim()
    if (qPattern.test(trimmed) && trimmed.length > 5) {
      questions.push(trimmed)
    }
  })
  return questions
}

export function ReadingModule() {
  const [tab, setTab] = useState<TabType>('library')
  const [analyzeContent, setAnalyzeContent] = useState('')

  const handleAnalyzeText = (content: string) => {
    setAnalyzeContent(content)
    setTab('analyze')
  }

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

      {tab === 'library' && <LibraryView onAnalyze={handleAnalyzeText} />}
      {tab === 'analyze' && <AnalyzeView initialContent={analyzeContent} />}
      {tab === 'import' && <ImportView />}
    </div>
  )
}

function LibraryView({ onAnalyze }: { onAnalyze: (content: string) => void }) {
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
          <Button variant="outline" onClick={() => toast('请在「导入文本」标签页使用扫描导入功能', 'info')}>
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
                  <Button size="sm" variant="outline" onClick={() => onAnalyze(t.content || '')}>
                    <Brain className="w-3 h-3" />
                    AI分析
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onAnalyze(t.content || '')}>
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

// =================== Import View ===================

function ImportView() {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [content, setContent] = useState('')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [importing, setImporting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeMode, setActiveMode] = useState<'scan' | 'upload' | 'paste' | null>(null)
  const [modeLoading, setModeLoading] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleScanImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast('图片大小不能超过10MB', 'warning')
      e.target.value = ''
      return
    }
    setModeLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      try {
        const res = await writingApi.ocr(base64)
        const text = res.text || res.content || res.result || ''
        if (text) {
          setContent(prev => prev ? prev + '\n' + text : text)
          toast('OCR识别成功，文本已填入', 'success')
        } else {
          toast('OCR未识别到文本，请尝试更清晰的图片', 'warning')
        }
      } catch (err: any) {
        toast('OCR识别失败：' + (err.message || '请稍后重试'), 'error')
      } finally {
        setModeLoading(false)
      }
    }
    reader.onerror = () => {
      setModeLoading(false)
      toast('图片读取失败', 'error')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'txt') {
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        setContent(prev => prev ? prev + '\n' + text : text)
        if (!title) setTitle(file.name.replace(/\.txt$/i, ''))
        toast('TXT文件读取成功', 'success')
      }
      reader.onerror = () => toast('文件读取失败', 'error')
      reader.readAsText(file)
    } else if (ext === 'pdf' || ext === 'docx') {
      toast(`${ext.toUpperCase()}格式暂不支持自动解析，请复制文本内容后使用「粘贴文本」方式导入`, 'warning')
    } else {
      toast('不支持的文件格式，请上传 TXT 文件', 'warning')
    }
    e.target.value = ''
  }

  const handlePasteMode = () => {
    setActiveMode('paste')
    setTimeout(() => textareaRef.current?.focus(), 100)
    toast('请在下方文本框粘贴内容', 'info')
  }

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
      setActiveMode(null)
    } catch (err: any) {
      setError(err.message || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const importModes = [
    { key: 'scan' as const, title: '扫描图片', icon: Scan, desc: 'OCR识别印刷体或手写体文本', color: 'from-blue-400 to-blue-600' },
    { key: 'upload' as const, title: '上传文件', icon: FileText, desc: '支持 TXT 格式，自动填入', color: 'from-purple-400 to-purple-600' },
    { key: 'paste' as const, title: '粘贴文本', icon: Upload, desc: '直接粘贴外刊文章或文本内容', color: 'from-emerald-400 to-emerald-600' },
  ]

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
        className="hidden"
        onChange={handleScanImage}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.pdf,.docx"
        className="hidden"
        onChange={handleUploadFile}
      />

      {/* Import Methods */}
      <div className="grid grid-cols-3 gap-4">
        {importModes.map((mode) => {
          const Icon = mode.icon
          const isActive = activeMode === mode.key
          return (
            <Card
              key={mode.title}
              hover
              className={cn(
                'p-6 text-center cursor-pointer transition-all',
                isActive && 'ring-2 ring-indigo-300 ring-offset-2'
              )}
            >
              <div
                className="flex flex-col items-center"
                onClick={() => {
                  if (mode.key === 'scan') {
                    setActiveMode('scan')
                    imageInputRef.current?.click()
                  } else if (mode.key === 'upload') {
                    setActiveMode('upload')
                    fileInputRef.current?.click()
                  } else {
                    handlePasteMode()
                  }
                }}
              >
                <div className={cn('w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mx-auto mb-3', mode.color)}>
                  {modeLoading && isActive ? (
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                  ) : (
                    <Icon className="w-7 h-7 text-white" />
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{mode.title}</h3>
                <p className="text-xs text-gray-400">{mode.desc}</p>
              </div>
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
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="粘贴英文文章全文..."
                rows={8}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none"
              />
              {content && (
                <p className="mt-1 text-xs text-gray-400">{content.split(/\s+/).filter(Boolean).length} 词</p>
              )}
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

// =================== Analyze View ===================

function AnalyzeView({ initialContent }: { initialContent?: string }) {
  const { toast } = useToast()
  const [content, setContent] = useState(initialContent || '')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)

  // Interaction mode
  const [interactionMode, setInteractionMode] = useState<'word' | 'sentence' | 'question'>('word')

  // Word analysis popup
  const [wordPopup, setWordPopup] = useState<{ word: string; data: any; loading: boolean; added: boolean } | null>(null)

  // Sentence analysis
  const [sentenceResult, setSentenceResult] = useState<any>(null)
  const [sentenceLoading, setSentenceLoading] = useState(false)
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number | null>(null)

  // Question analysis
  const [questionStates, setQuestionStates] = useState<{ loading: boolean; analysis: string | null }[]>([])

  // Highlight keywords (for question mode)
  const [highlightKeywords, setHighlightKeywords] = useState<string[]>([])

  // Sync initialContent prop
  useEffect(() => {
    if (initialContent) {
      setContent(initialContent)
    }
  }, [initialContent])

  // Extract sentences and questions from content
  const sentences = useMemo(() => {
    return content.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5)
  }, [content])

  const extractedQuestions = useMemo(() => extractQuestions(content), [content])

  // Sync question states when questions change
  useEffect(() => {
    setQuestionStates(extractedQuestions.map(() => ({ loading: false, analysis: null })))
  }, [extractedQuestions])

  const handleAnalyze = async () => {
    if (!content.trim()) return
    setAnalyzing(true)
    setError(null)
    try {
      const res = await readingApi.analyze(content, difficulty)
      setResult(res)
      setInteractionMode('word')
    } catch (err: any) {
      setError(err.message || 'AI分析失败，请稍后重试')
    } finally {
      setAnalyzing(false)
    }
  }

  // ===== Word Analysis =====
  const handleWordClick = async (word: string) => {
    setWordPopup({ word, data: null, loading: true, added: false })
    try {
      const res = await readingApi.analyzeWord(word, content.slice(
        Math.max(0, content.toLowerCase().indexOf(word.toLowerCase()) - 100),
        content.toLowerCase().indexOf(word.toLowerCase()) + word.length + 100
      ))
      setWordPopup({ word, data: res, loading: false, added: false })
    } catch (err: any) {
      toast('单词分析失败：' + (err.message || ''), 'error')
      setWordPopup(null)
    }
  }

  const handleAddWord = async () => {
    if (!wordPopup?.data) return
    try {
      await vocabularyApi.addWord({
        word: wordPopup.data.word || wordPopup.word,
        phonetic: wordPopup.data.phonetic || '',
        part_of_speech: wordPopup.data.partOfSpeech || '',
        definition: wordPopup.data.definition || '',
        example: wordPopup.data.examples?.[0] || '',
      })
      setWordPopup({ ...wordPopup, added: true })
      toast('已加入词汇库', 'success')
    } catch (err: any) {
      toast('加入词汇库失败：' + (err.message || ''), 'error')
    }
  }

  // ===== Sentence Analysis =====
  const handleSentenceClick = async (sentence: string, idx: number) => {
    setActiveSentenceIdx(idx)
    setSentenceLoading(true)
    setSentenceResult(null)
    try {
      const res = await readingApi.analyzeSentence(sentence, difficulty)
      setSentenceResult(res)
    } catch (err: any) {
      toast('句子分析失败：' + (err.message || ''), 'error')
    } finally {
      setSentenceLoading(false)
    }
  }

  // ===== Question Analysis =====
  const handleQuestionAnalyze = async (idx: number) => {
    const q = extractedQuestions[idx]
    if (!q) return
    setQuestionStates(prev => prev.map((item, i) => i === idx ? { ...item, loading: true } : item))
    try {
      const res = await profileApi.askAssistant(
        `阅读理解分析任务：\n\n文章内容：\n${content}\n\n问题：${q}\n\n请分析这道阅读理解题，指出原文中对应的区间或关键信息，并给出详细解析。`
      )
      const text = typeof res === 'string' ? res : (res.response || res.reply || res.answer || res.message || '未获取到回复')
      setQuestionStates(prev => prev.map((item, i) => i === idx ? { ...item, loading: false, analysis: text } : item))

      // Extract keywords for highlighting
      const stopWords = new Set(['what', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'and', 'or', 'but', 'how', 'why', 'when', 'where', 'which', 'who', 'whom', 'whose', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'there', 'here', 'about', 'from', 'with', 'for', 'as', 'by', 'not', 'no'])
      const words = q.toLowerCase().match(/[a-z]+/g) || []
      const keywords = words.filter(w => w.length > 3 && !stopWords.has(w))
      setHighlightKeywords(keywords)
    } catch (err: any) {
      toast('问题分析失败：' + (err.message || ''), 'error')
      setQuestionStates(prev => prev.map((item, i) => i === idx ? { ...item, loading: false } : item))
    }
  }

  // ===== Render Interactive Text =====
  const renderInteractiveText = () => {
    if (!content.trim()) return null

    if (interactionMode === 'sentence') {
      return sentences.map((sentence, idx) => (
        <span
          key={idx}
          className={cn(
            'cursor-pointer transition-colors rounded px-0.5',
            activeSentenceIdx === idx ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-indigo-50'
          )}
          onClick={() => handleSentenceClick(sentence, idx)}
        >
          {sentence}{' '}
        </span>
      ))
    }

    // Word mode or question mode: split into word/non-word tokens
    const parts = content.match(/([a-zA-Z][a-zA-Z'-]*|[^a-zA-Z]+)/g) || []
    return parts.map((part, i) => {
      if (/^[a-zA-Z]/.test(part)) {
        const isHighlighted = highlightKeywords.includes(part.toLowerCase())
        if (interactionMode === 'question' && isHighlighted) {
          return (
            <span key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5 font-medium">
              {part}
            </span>
          )
        }
        return (
          <span
            key={i}
            className="cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 rounded px-0.5 transition-colors"
            onClick={() => handleWordClick(part)}
          >
            {part}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  const sampleText = 'Artificial intelligence is rapidly transforming the educational landscape. From personalized learning algorithms to automated grading systems, AI technologies are reshaping how students learn and how teachers teach. However, the widespread adoption of AI in education also raises important ethical questions.\n\n1. What is the main idea of this passage?\n2. How does AI transform the educational landscape?'
  const sampleQText = 'Climate change poses unprecedented challenges to global food security. Rising temperatures, erratic rainfall, and extreme weather events are threatening crop yields across the world. Farmers in developing nations are particularly vulnerable, as they lack the resources to adapt. Moreover, changing pest patterns and the spread of agricultural diseases further compound the crisis.\n\n1. What are the main threats to global food security mentioned in the passage?\n2. Why are farmers in developing nations particularly vulnerable?'
  const sampleQs = [
    { label: '一般文章', text: sampleText },
    { label: '含试题文章', text: sampleQText },
  ]

  return (
    <div className="space-y-4">
      {/* Input Card */}
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
              placeholder="粘贴或输入要分析的英文文本...&#10;如同时包含试题（如 1. What is...?），可在「试题解析」模式中查看"
              rows={5}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none"
            />
            <div className="mt-1 flex gap-2">
              {sampleQs.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setContent(s.text)}
                  className="text-xs text-indigo-500 hover:text-indigo-600"
                >
                  {s.label === '一般文章' ? '使用示例文本' : '使用含试题示例'}
                </button>
              ))}
            </div>
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

      {/* ===== Interactive Article ===== */}
      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-500" />
                <CardTitle>交互式阅读</CardTitle>
              </div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setInteractionMode('word')}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    interactionMode === 'word' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                  )}
                >
                  <Type className="w-3.5 h-3.5" />
                  单词查询
                </button>
                <button
                  onClick={() => setInteractionMode('sentence')}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    interactionMode === 'sentence' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                  )}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  句子分析
                </button>
                <button
                  onClick={() => setInteractionMode('question')}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    interactionMode === 'question' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                  )}
                >
                  <Highlighter className="w-3.5 h-3.5" />
                  试题解析
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Article Text */}
            <div className="p-4 bg-gray-50 rounded-xl max-h-[400px] overflow-y-auto text-sm leading-relaxed text-gray-700">
              {renderInteractiveText()}
            </div>

            {/* Hint text */}
            {interactionMode === 'word' && (
              <p className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                点击文中任意单词查看AI释义，可直接加入词汇库
              </p>
            )}
            {interactionMode === 'sentence' && (
              <p className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                点击任意句子进行长难句分析
              </p>
            )}
            {interactionMode === 'question' && extractedQuestions.length === 0 && (
              <p className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                未检测到试题内容。在文本中添加编号问题（如 1. What is...?）即可在此查看
              </p>
            )}

            {/* Sentence Analysis Result */}
            {interactionMode === 'sentence' && (sentenceLoading || sentenceResult) && (
              <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                {sentenceLoading ? (
                  <div className="flex items-center gap-2 text-indigo-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">AI正在分析句子...</span>
                  </div>
                ) : sentenceResult ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Network className="w-4 h-4 text-purple-500" />
                      <h4 className="text-sm font-semibold text-gray-900">句子分析结果</h4>
                    </div>

                    {sentenceResult.translation && (
                      <div>
                        <span className="text-xs text-indigo-500 font-medium">中文翻译</span>
                        <p className="text-sm text-gray-600 mt-0.5">{sentenceResult.translation}</p>
                      </div>
                    )}

                    {sentenceResult.structure && (
                      <div>
                        <span className="text-xs text-indigo-500 font-medium">语法结构</span>
                        <p className="text-sm text-gray-600 mt-0.5">{sentenceResult.structure}</p>
                      </div>
                    )}

                    {sentenceResult.clauses && sentenceResult.clauses.length > 0 && (
                      <div>
                        <span className="text-xs text-indigo-500 font-medium">分句拆解</span>
                        <div className="mt-1 space-y-1">
                          {sentenceResult.clauses.map((c: any, i: number) => (
                            <div key={i} className="text-sm text-gray-600 pl-3 border-l-2 border-indigo-200">
                              <span className="text-xs text-gray-400">{c.type || `分句${i + 1}`}：</span>
                              {c.text || c.content || ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {sentenceResult.key_phrases && sentenceResult.key_phrases.length > 0 && (
                      <div>
                        <span className="text-xs text-indigo-500 font-medium">重点短语</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {sentenceResult.key_phrases.map((p: any, i: number) => (
                            <span key={i} className="text-xs bg-white px-2 py-1 rounded-md border border-gray-200">
                              {typeof p === 'string' ? p : (p.phrase || p.text || '')}
                              {typeof p === 'object' && p.meaning ? ` (${p.meaning})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {sentenceResult.grammar_points && sentenceResult.grammar_points.length > 0 && (
                      <div>
                        <span className="text-xs text-indigo-500 font-medium">语法要点</span>
                        <ul className="mt-1 space-y-1">
                          {sentenceResult.grammar_points.map((g: string, i: number) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                              <ChevronRight className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                              {g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {sentenceResult.vocabulary && sentenceResult.vocabulary.length > 0 && (
                      <div>
                        <span className="text-xs text-indigo-500 font-medium">重点词汇</span>
                        <div className="mt-1 space-y-1">
                          {sentenceResult.vocabulary.map((v: any, i: number) => (
                            <div key={i} className="text-sm text-gray-600">
                              <span className="font-medium">{v.word || v.term}</span>
                              {v.meaning || v.definition ? `：${v.meaning || v.definition}` : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {sentenceResult.tip && (
                      <div className="p-2 bg-yellow-50 rounded-lg">
                        <span className="text-xs text-yellow-600 font-medium">学习提示</span>
                        <p className="text-sm text-gray-600 mt-0.5">{sentenceResult.tip}</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Question Analysis */}
            {interactionMode === 'question' && extractedQuestions.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-indigo-500" />
                  <h4 className="text-sm font-semibold text-gray-900">检测试题（{extractedQuestions.length}题）</h4>
                </div>
                {extractedQuestions.map((q, idx) => {
                  const qs = questionStates[idx] || { loading: false, analysis: null }
                  return (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-700 flex-1">{q}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuestionAnalyze(idx)}
                          disabled={qs.loading}
                        >
                          {qs.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          {qs.loading ? '分析中' : qs.analysis ? '重新分析' : 'AI解析'}
                        </Button>
                      </div>
                      {qs.analysis && (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-indigo-100">
                          <div className="flex items-start gap-2">
                            <Highlighter className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{qs.analysis}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <p className="text-xs text-gray-400">点击「AI解析」后，文章中的关键词将自动高亮</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== AI Summary ===== */}
      {result?.summary && (
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

      {/* ===== Translation ===== */}
      {result?.translation && (
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

      {/* ===== Vocabulary ===== */}
      {result?.vocabulary && Array.isArray(result.vocabulary) && result.vocabulary.length > 0 && (
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
                <VocabItem key={i} v={v} onAnalyze={() => handleWordClick(v.word)} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Long Sentences ===== */}
      {result?.long_sentences && Array.isArray(result.long_sentences) && result.long_sentences.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-purple-500" />
              <CardTitle>长难句分析</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.long_sentences.map((ls: any, i: number) => {
                const sentenceText = ls.sentence || ls.text || ''
                return (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-700 italic mb-2">{sentenceText}</p>
                    <p className="text-xs text-gray-500 mb-2">{ls.analysis || ls.explanation || ''}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setInteractionMode('sentence')
                        const sIdx = sentences.findIndex(s => s.includes(sentenceText.slice(0, 20)))
                        if (sIdx >= 0) handleSentenceClick(sentenceText, sIdx)
                        else handleSentenceClick(sentenceText, -1)
                      }}
                    >
                      <Sparkles className="w-3 h-3" />
                      详细分析
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Stats ===== */}
      {result && (
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
      )}

      {/* Empty state */}
      {!result && !analyzing && !error && (
        <Card className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-indigo-400" />
            </div>
            <p className="text-gray-400 text-sm">
              粘贴英文文本，AI将自动进行摘要、翻译、词汇提取<br />和长难句分析，帮你深入理解阅读内容<br />
              <span className="text-xs">支持交互式单词查询、句子分析和试题解析</span>
            </p>
          </div>
        </Card>
      )}

      {/* ===== Word Analysis Popup Modal ===== */}
      {wordPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setWordPopup(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between rounded-t-2xl">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-gray-900">{wordPopup.word}</h3>
                  <button
                    onClick={() => speak({ text: wordPopup.word })}
                    className="text-indigo-400 hover:text-indigo-600 transition-colors"
                    title="发音"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                {wordPopup.data?.phonetic && (
                  <p className="text-sm text-gray-400 mt-0.5">/{wordPopup.data.phonetic}/</p>
                )}
              </div>
              <button
                onClick={() => setWordPopup(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4">
              {wordPopup.loading ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                  <span className="text-sm text-gray-400">AI正在分析单词...</span>
                </div>
              ) : wordPopup.data ? (
                <div className="space-y-4">
                  {/* Part of speech + definition */}
                  {wordPopup.data.partOfSpeech && (
                    <div>
                      <span className="text-xs text-indigo-500 font-medium">{wordPopup.data.partOfSpeech}</span>
                      <p className="text-sm text-gray-700 mt-0.5">{wordPopup.data.definition}</p>
                      {wordPopup.data.definition_en && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">{wordPopup.data.definition_en}</p>
                      )}
                    </div>
                  )}

                  {/* Synonyms & Antonyms */}
                  {(wordPopup.data.synonyms?.length > 0 || wordPopup.data.antonyms?.length > 0) && (
                    <div className="grid grid-cols-2 gap-3">
                      {wordPopup.data.synonyms?.length > 0 && (
                        <div>
                          <span className="text-xs text-emerald-500 font-medium">同义词</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {wordPopup.data.synonyms.map((s: string, i: number) => (
                              <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {wordPopup.data.antonyms?.length > 0 && (
                        <div>
                          <span className="text-xs text-red-400 font-medium">反义词</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {wordPopup.data.antonyms.map((a: string, i: number) => (
                              <span key={i} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collocations */}
                  {wordPopup.data.collocations?.length > 0 && (
                    <div>
                      <span className="text-xs text-purple-500 font-medium">常见搭配</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {wordPopup.data.collocations.map((c: string, i: number) => (
                          <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Examples */}
                  {wordPopup.data.examples?.length > 0 && (
                    <div>
                      <span className="text-xs text-blue-500 font-medium">例句</span>
                      <div className="mt-1 space-y-1.5">
                        {wordPopup.data.examples.map((ex: string, i: number) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <ChevronRight className="w-3 h-3 text-blue-300 mt-0.5 shrink-0" />
                            <span className="text-sm text-gray-600 italic">{ex}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Etymology */}
                  {wordPopup.data.etymology && (
                    <div>
                      <span className="text-xs text-gray-500 font-medium">词源</span>
                      <p className="text-sm text-gray-500 mt-0.5">{wordPopup.data.etymology}</p>
                    </div>
                  )}

                  {/* Difficulty & Note */}
                  {(wordPopup.data.difficulty || wordPopup.data.note) && (
                    <div className="flex flex-wrap gap-2">
                      {wordPopup.data.difficulty && (
                        <span className={cn('text-xs px-2 py-1 rounded-full', getDifficultyColor(wordPopup.data.difficulty))}>
                          {getDifficultyLabel(wordPopup.data.difficulty)}
                        </span>
                      )}
                      {wordPopup.data.note && (
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">
                          {wordPopup.data.note}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Add to vocabulary button */}
                  <div className="pt-2 border-t border-gray-100">
                    <Button
                      className="w-full"
                      variant={wordPopup.added ? 'outline' : 'primary'}
                      onClick={handleAddWord}
                      disabled={wordPopup.added}
                    >
                      {wordPopup.added ? (
                        <><Check className="w-4 h-4" /> 已加入词汇库</>
                      ) : (
                        <><Plus className="w-4 h-4" /> 加入词汇库</>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">未获取到分析结果</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== Vocabulary Item with Add Button =====
function VocabItem({ v, onAnalyze }: { v: any; onAnalyze: () => void }) {
  const { toast } = useToast()
  const [added, setAdded] = useState(false)

  const handleAdd = async () => {
    try {
      await vocabularyApi.addWord({
        word: v.word || v.term || '',
        phonetic: v.phonetic || '',
        part_of_speech: v.part_of_speech || v.pos || '',
        definition: v.definition || v.meaning || '',
        example: v.example || '',
      })
      setAdded(true)
      toast('已加入词汇库', 'success')
    } catch (err: any) {
      toast('加入词汇库失败：' + (err.message || ''), 'error')
    }
  }

  return (
    <div className="p-3 border border-gray-100 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={onAnalyze}
          className="text-sm font-bold text-gray-900 hover:text-indigo-600 transition-colors"
        >
          {v.word || v.term}
        </button>
        {v.phonetic && <span className="text-xs text-gray-400">{v.phonetic}</span>}
        <button
          onClick={() => speak({ text: v.word || v.term || '' })}
          className="text-indigo-300 hover:text-indigo-500 transition-colors"
        >
          <Volume2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-2">{v.definition || v.meaning || ''}</p>
      <button
        onClick={handleAdd}
        disabled={added}
        className={cn(
          'text-xs flex items-center gap-1 transition-colors',
          added ? 'text-green-500' : 'text-indigo-500 hover:text-indigo-600'
        )}
      >
        {added ? <><Check className="w-3 h-3" /> 已加入</> : <><Plus className="w-3 h-3" /> 加入词汇库</>}
      </button>
    </div>
  )
}
