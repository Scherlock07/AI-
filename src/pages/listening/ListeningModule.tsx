import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { listeningApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, formatDuration, getDifficultyLabel, getDifficultyColor } from '@/lib/utils'
import { speak, stop, accentToLang } from '@/lib/tts'
import {
  Headphones, Upload, Play, Pause, Volume2,
  Sparkles, FileAudio, BookMarked, Repeat, SkipBack, SkipForward,
  Mic, PenLine, Waves,
} from 'lucide-react'

type TabType = 'library' | 'generate' | 'practice' | 'vocab'

export function ListeningModule() {
  const [tab, setTab] = useState<TabType>('library')

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">听力练习</h1>
        <p className="text-sm text-gray-400">AI生成素材 · 实时转写 · 精听训练 · 语境词汇</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'library' as TabType, label: '素材库', icon: FileAudio },
          { key: 'generate' as TabType, label: 'AI生成', icon: Sparkles },
          { key: 'practice' as TabType, label: '精听训练', icon: Headphones },
          { key: 'vocab' as TabType, label: '词汇练习', icon: BookMarked },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => { stop(); setTab(t.key) }}
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
      {tab === 'generate' && <GenerateView />}
      {tab === 'practice' && <PracticeView />}
      {tab === 'vocab' && <VocabPracticeView />}
    </div>
  )
}

function LibraryView() {
  const { toast } = useToast()
  const [materials, setMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchMaterials = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listeningApi.listMaterials()
      const data = Array.isArray(res) ? res : (res.materials || res.items || [])
      setMaterials(data)
    } catch (err: any) {
      setError(err.message || '加载素材库失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMaterials()
    return () => stop()
  }, [])

  const handlePlay = (m: any) => {
    if (playingId === m.id) {
      stop()
      setPlayingId(null)
      return
    }
    const transcript = m.transcript || ''
    if (!transcript) {
      toast('该素材没有转写文本，无法播放', 'warning')
      return
    }
    const lang = accentToLang(m.accent || 'us')
    const speed = m.speed || 1.0
    const ok = speak({
      text: transcript,
      lang,
      rate: speed,
      onStart: () => setPlayingId(m.id),
      onEnd: () => setPlayingId(null),
      onError: (err) => {
        setPlayingId(null)
        toast(`播放失败：${err}`, 'error')
      },
    })
    if (!ok) {
      toast('当前浏览器不支持语音播放', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchMaterials} />
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100">
        <CardContent className="pt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Upload className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">导入外部音频</h3>
              <p className="text-sm text-gray-400">支持 MP3 / WAV / M4A 格式，AI自动转写与解析</p>
            </div>
          </div>
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" />
            上传音频
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                toast(`已选择文件：${file.name}，上传功能开发中`, 'info')
              }
            }}
          />
        </CardContent>
      </Card>

      {materials.length === 0 ? (
        <EmptyState
          icon={<FileAudio className="w-8 h-8 text-gray-300" />}
          title="暂无听力素材"
          desc="通过AI生成或导入功能添加听力素材"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {materials.map((m: any) => (
            <Card key={m.id} hover>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
                      <Headphones className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{m.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="default">{m.topic || '通用'}</Badge>
                        <Badge variant={m.source === 'ai-generated' ? 'primary' : 'success'}>
                          {m.source === 'ai-generated' ? 'AI生成' : '导入'}
                        </Badge>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full', getDifficultyColor(m.difficulty))}>
                          {getDifficultyLabel(m.difficulty)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                  {(m.transcript || '').slice(0, 120)}...
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <Volume2 className="w-4 h-4" />
                      {m.accent === 'us' ? '美式' : m.accent === 'uk' ? '英式' : '其他'}口音
                    </span>
                    <span className="flex items-center gap-1">
                      <Waves className="w-4 h-4" />
                      {m.speed || 1.0}x 语速
                    </span>
                    <span>{formatDuration(m.duration || 0)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant={playingId === m.id ? 'primary' : 'outline'}
                    onClick={() => handlePlay(m)}
                  >
                    {playingId === m.id ? (
                      <><Pause className="w-3 h-3" />暂停</>
                    ) : (
                      <><Play className="w-3 h-3" />播放</>
                    )}
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

function GenerateView() {
  const { toast } = useToast()
  const [topic, setTopic] = useState('')
  const [accent, setAccent] = useState('us')
  const [speed, setSpeed] = useState(1.0)
  const [difficulty, setDifficulty] = useState('intermediate')
  const [duration, setDuration] = useState(3)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    return () => stop()
  }, [])

  const accentOptions = [
    { value: 'us', label: '美式英语' },
    { value: 'uk', label: '英式英语' },
    { value: 'au', label: '澳式英语' },
  ]

  const topicSuggestions = ['气候变化', '人工智能伦理', '全球化影响', '教育改革', '太空探索', '心理健康']

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await listeningApi.generate({ topic, accent, speed, difficulty, duration })
      setResult(res)
    } catch (err: any) {
      setError(err.message || '生成失败，请稍后重试')
    } finally {
      setGenerating(false)
    }
  }

  const handlePlay = () => {
    if (isPlaying) {
      stop()
      setIsPlaying(false)
      return
    }
    const transcript = result?.transcript || ''
    if (!transcript) {
      toast('没有可播放的文本', 'warning')
      return
    }
    speak({
      text: transcript,
      lang: accentToLang(accent),
      rate: speed,
      onStart: () => setIsPlaying(true),
      onEnd: () => setIsPlaying(false),
      onError: (err) => {
        setIsPlaying(false)
        toast(`播放失败：${err}`, 'error')
      },
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>AI生成听力素材</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">主题</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="输入你想要的主题，如：气候变化对沿海城市的影响"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {topicSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setTopic(s)}
                    className="px-2.5 py-1 text-xs bg-gray-50 text-gray-500 rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">口音</label>
              <div className="flex gap-2">
                {accentOptions.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => setAccent(a.value)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      accent === a.value ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200' : 'bg-gray-50 text-gray-500'
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">语速</label>
                <span className="text-sm text-indigo-600 font-medium">{speed}x</span>
              </div>
              <input
                type="range" min="0.5" max="2.0" step="0.1" value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>慢速 0.5x</span>
                <span>正常 1.0x</span>
                <span>快速 2.0x</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">难度</label>
              <div className="flex gap-2">
                {[
                  { value: 'beginner', label: '初级' },
                  { value: 'intermediate', label: '中级' },
                  { value: 'advanced', label: '高级' },
                ].map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      difficulty === d.value ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200' : 'bg-gray-50 text-gray-500'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">预计时长</label>
                <span className="text-sm text-indigo-600 font-medium">约 {duration} 分钟</span>
              </div>
              <input
                type="range" min="1" max="10" step="1" value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            <Button size="lg" className="w-full" onClick={handleGenerate} disabled={generating || !topic.trim()}>
              {generating ? <LoadingSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'AI生成中...' : '生成听力素材'}
            </Button>

            {error && (
              <div className="mt-3 p-3 bg-red-50 rounded-lg">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-indigo-500" />
              <CardTitle>{result.title || 'AI生成素材'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="primary">AI生成</Badge>
              <Badge variant="default">{accent === 'us' ? '美式' : accent === 'uk' ? '英式' : '澳式'}口音</Badge>
              <span className={cn('text-xs px-2 py-0.5 rounded-full', getDifficultyColor(difficulty))}>
                {getDifficultyLabel(difficulty)}
              </span>
            </div>

            {result.transcript && (
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">转写文本</div>
                <div className="p-3 bg-gray-50 rounded-lg max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-600 leading-relaxed">{result.transcript}</p>
                </div>
              </div>
            )}

            {result.vocabulary && Array.isArray(result.vocabulary) && result.vocabulary.length > 0 && (
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">关键词汇</div>
                <div className="flex flex-wrap gap-2">
                  {result.vocabulary.map((v: any, i: number) => (
                    <Badge key={i} variant="default">{v.word || v}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-4 p-4 bg-gray-50 rounded-xl">
              <button onClick={() => toast('上一段', 'info')} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <SkipBack className="w-5 h-5 text-gray-500" />
              </button>
              <button
                onClick={handlePlay}
                className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center hover:bg-indigo-700 transition-colors"
              >
                {isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-0.5" />}
              </button>
              <button onClick={() => toast('下一段', 'info')} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <SkipForward className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-gray-400">0:00</span>
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: '0%' }}></div>
              </div>
              <span className="text-xs text-gray-400">{duration}:00</span>
            </div>
          </CardContent>
        </Card>
      ) : generating ? (
        <Card className="flex items-center justify-center min-h-[500px]">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <h3 className="font-medium text-gray-700 mt-4 mb-2">AI正在生成听力素材</h3>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              根据你选择的主题、口音、语速和难度，AI正在生成专属听力内容
            </p>
          </div>
        </Card>
      ) : (
        <Card className="flex items-center justify-center min-h-[500px]">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="font-medium text-gray-700 mb-2">AI将为你生成定制听力素材</h3>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              根据你选择的主题、口音、语速和难度，AI将生成专属听力内容，并自动提供转写文本、难点解析和词汇练习
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

// ===== 精听训练主视图 =====

type PracticeMode = 'intensive' | 'fillblank' | 'dictation' | 'keypoints'

function splitSentences(transcript: string): string[] {
  return transcript
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function PracticeView() {
  const { toast } = useToast()
  const [materials, setMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<PracticeMode>('intensive')

  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        const res = await listeningApi.listMaterials()
        const data = Array.isArray(res) ? res : (res.materials || res.items || [])
        setMaterials(data)
        if (data.length > 0) setSelectedId(data[0].id)
      } catch {
        // 静默失败，下方显示空状态
      } finally {
        setLoading(false)
      }
    }
    fetchMaterials()
    return () => stop()
  }, [])

  const selectedMaterial = materials.find(m => m.id === selectedId)
  const sentences = selectedMaterial?.transcript ? splitSentences(selectedMaterial.transcript) : []
  const accent = selectedMaterial?.accent || 'us'

  const modeOptions: { key: PracticeMode; label: string; icon: any; color: string }[] = [
    { key: 'intensive', label: '逐句精听', icon: Headphones, color: 'from-blue-400 to-indigo-600' },
    { key: 'fillblank', label: '填空精听', icon: PenLine, color: 'from-blue-400 to-indigo-600' },
    { key: 'dictation', label: '听写练习', icon: Mic, color: 'from-purple-400 to-purple-600' },
    { key: 'keypoints', label: '要点提取', icon: BookMarked, color: 'from-emerald-400 to-emerald-600' },
  ]

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (materials.length === 0) {
    return (
      <EmptyState
        icon={<Headphones className="w-8 h-8 text-gray-300" />}
        title="精听训练需要听力素材"
        desc="请先在「素材库」或「AI生成」中添加听力素材，然后回到这里进行精听训练"
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* 素材选择器 */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <FileAudio className="w-5 h-5 text-indigo-500" />
              <span className="text-sm font-medium text-gray-700">选择素材</span>
            </div>
            <select
              value={selectedId || ''}
              onChange={(e) => { stop(); setSelectedId(e.target.value) }}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} · {m.accent === 'us' ? '美式' : m.accent === 'uk' ? '英式' : '其他'} · {getDifficultyLabel(m.difficulty)}
                </option>
              ))}
            </select>
            {selectedMaterial && (
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="default">{selectedMaterial.topic || '通用'}</Badge>
                <Badge variant={selectedMaterial.source === 'ai-generated' ? 'primary' : 'success'}>
                  {selectedMaterial.source === 'ai-generated' ? 'AI生成' : '导入'}
                </Badge>
                <span className={cn('text-xs px-2 py-0.5 rounded-full', getDifficultyColor(selectedMaterial.difficulty))}>
                  {getDifficultyLabel(selectedMaterial.difficulty)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 模式切换 */}
      <div className="flex gap-1 mb-2 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto max-w-full">
        {modeOptions.map((m) => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => { stop(); setMode(m.key) }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                mode === m.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* 根据模式渲染 */}
      {sentences.length === 0 ? (
        <EmptyState
          icon={<FileAudio className="w-8 h-8 text-gray-300" />}
          title="该素材没有转写文本"
          desc="精听训练需要素材包含转写文本（transcript），请在AI生成或导入时确保文本完整"
        />
      ) : (
        <>
          {mode === 'intensive' && <IntensiveListenView sentences={sentences} accent={accent} />}
          {mode === 'fillblank' && <FillBlankView sentences={sentences} accent={accent} />}
          {mode === 'dictation' && <DictationView sentences={sentences} accent={accent} />}
          {mode === 'keypoints' && <KeyPointsView sentences={sentences} accent={accent} />}
        </>
      )}
    </div>
  )
}

// ===== 逐句精听 =====

function IntensiveListenView({ sentences, accent }: { sentences: string[]; accent: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSentence, setCurrentSentence] = useState(-1)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [loopMode, setLoopMode] = useState<'none' | 'sentence' | 'ab'>('none')
  const [showTranscript, setShowTranscript] = useState(true)
  const { toast } = useToast()
  const lang = accentToLang(accent)

  useEffect(() => {
    return () => stop()
  }, [])

  const playAll = useCallback(() => {
    if (isPlaying) {
      stop()
      setIsPlaying(false)
      setCurrentSentence(-1)
      return
    }
    setIsPlaying(true)
    let idx = 0
    const playNext = () => {
      if (idx >= sentences.length) {
        setIsPlaying(false)
        setCurrentSentence(-1)
        return
      }
      setCurrentSentence(idx)
      speak({
        text: sentences[idx],
        lang,
        rate: playbackRate,
        onEnd: () => {
          idx++
          if (loopMode === 'sentence') {
            playNext()
          } else {
            playNext()
          }
        },
        onError: () => {
          setIsPlaying(false)
          setCurrentSentence(-1)
        },
      })
    }
    playNext()
  }, [isPlaying, playbackRate, loopMode, sentences, lang])

  const playSentence = (idx: number) => {
    stop()
    setIsPlaying(false)
    setCurrentSentence(idx)
    speak({
      text: sentences[idx],
      lang,
      rate: playbackRate,
      onEnd: () => setCurrentSentence(-1),
      onError: () => setCurrentSentence(-1),
    })
  }

  const handlePrev = () => {
    stop()
    setIsPlaying(false)
    setCurrentSentence(prev => Math.max(0, prev === -1 ? 0 : prev - 1))
    toast('已跳到上一句', 'info')
  }

  const handleNext = () => {
    stop()
    setIsPlaying(false)
    setCurrentSentence(prev => Math.min(sentences.length - 1, prev === -1 ? 0 : prev + 1))
    toast('已跳到下一句', 'info')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
                <Headphones className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">逐句精听模式</h3>
                <p className="text-xs text-gray-400">共 {sentences.length} 句 · {accent === 'us' ? '美式' : accent === 'uk' ? '英式' : '其他'}口音</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-center gap-4 mb-4">
              <button onClick={handlePrev} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <SkipBack className="w-5 h-5 text-gray-500" />
              </button>
              <button
                onClick={playAll}
                className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center hover:bg-indigo-700 transition-colors"
              >
                {isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-0.5" />}
              </button>
              <button onClick={handleNext} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <SkipForward className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-400">
                {currentSentence >= 0 ? `第 ${currentSentence + 1} / ${sentences.length} 句` : '准备播放'}
              </span>
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${currentSentence >= 0 ? ((currentSentence + 1) / sentences.length) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-1">
                {[0.75, 1.0, 1.25, 1.5].map((r) => (
                  <button
                    key={r}
                    onClick={() => { setPlaybackRate(r); toast(`语速已设为 ${r}x`, 'info') }}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      playbackRate === r ? 'bg-indigo-100 text-indigo-600 font-medium' : 'text-gray-400 hover:bg-gray-200'
                    )}
                  >
                    {r}x
                  </button>
                ))}
              </div>

              <div className="w-px h-4 bg-gray-200"></div>

              <button
                onClick={() => setLoopMode(loopMode === 'none' ? 'sentence' : loopMode === 'sentence' ? 'ab' : 'none')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                  loopMode !== 'none' ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:bg-gray-200'
                )}
              >
                <Repeat className="w-3.5 h-3.5" />
                {loopMode === 'none' ? '不循环' : loopMode === 'sentence' ? '逐句' : 'AB段'}
              </button>

              <div className="w-px h-4 bg-gray-200"></div>

              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                  showTranscript ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:bg-gray-200'
                )}
              >
                <PenLine className="w-3.5 h-3.5" />
                转写文本
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showTranscript && (
        <Card>
          <CardHeader>
            <CardTitle>转写文本</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sentences.map((s, i) => (
                <div key={i} className="flex gap-3 group">
                  <button
                    onClick={() => playSentence(i)}
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                      currentSentence === i
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 hover:bg-indigo-100 text-gray-500 group-hover:text-indigo-600'
                    )}
                  >
                    {currentSentence === i ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <p className={cn(
                    'flex-1 text-sm leading-relaxed transition-colors',
                    currentSentence === i ? 'bg-indigo-50 px-2 py-1 rounded text-indigo-700' : 'text-gray-700'
                  )}>
                    {s}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ===== 填空精听 =====

function FillBlankView({ sentences, accent }: { sentences: string[]; accent: string }) {
  const { toast } = useToast()
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [userAnswers, setUserAnswers] = useState<Record<number, string[]>>({})
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const lang = accentToLang(accent)

  const sentence = sentences[currentIdx] || ''

  // 为每个句子预生成填空（去掉较长单词）
  const blanks = useMemo(() => {
    const words = sentence.replace(/[.,!?;:"]/g, '').split(/\s+/).filter(w => w.length >= 5)
    // 选取 1-3 个词作为空缺
    const count = Math.min(words.length, Math.max(1, Math.floor(words.length / 4)))
    const shuffled = [...words].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count).map(w => w.toLowerCase())
  }, [currentIdx, sentence])

  const blankedWords = useMemo(() => {
    const words = sentence.split(/(\s+)/)
    return words.map(w => {
      const clean = w.replace(/[.,!?;:"]/g, '').toLowerCase()
      if (blanks.includes(clean)) {
        return { text: w, isBlank: true, clean }
      }
      return { text: w, isBlank: false, clean }
    })
  }, [sentence, blanks])

  const handlePlay = () => {
    if (isPlaying) {
      stop()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    speak({
      text: sentence,
      lang,
      rate: 1.0,
      onEnd: () => setIsPlaying(false),
      onError: () => { setIsPlaying(false); toast('播放失败', 'error') },
    })
  }

  const handleAnswer = (blankIdx: number, value: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [currentIdx]: { ...(prev[currentIdx] || []), [blankIdx]: value }
    }))
  }

  const handleCheck = () => {
    const answers = userAnswers[currentIdx] || {}
    let allCorrect = true
    blanks.forEach((blank, i) => {
      const userAns = (answers[i] || '').trim().toLowerCase()
      if (userAns !== blank) allCorrect = false
    })
    setChecked(prev => ({ ...prev, [currentIdx]: true }))
    if (allCorrect) {
      toast('全部正确！', 'success')
    } else {
      toast('部分答案不正确，标红的空格需要修改', 'warning')
    }
  }

  const handleNext = () => {
    stop()
    setIsPlaying(false)
    if (currentIdx < sentences.length - 1) {
      setCurrentIdx(currentIdx + 1)
    } else {
      toast('已到达最后一句', 'info')
    }
  }

  const handlePrev = () => {
    stop()
    setIsPlaying(false)
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1)
  }

  let blankCounter = 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
              <PenLine className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">填空精听</h3>
              <p className="text-xs text-gray-400">第 {currentIdx + 1} / {sentences.length} 句</p>
            </div>
          </div>
          <Button size="sm" variant={isPlaying ? 'primary' : 'outline'} onClick={handlePlay}>
            {isPlaying ? <><Pause className="w-3 h-3" />停止</> : <><Play className="w-3 h-3" />播放</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="p-4 bg-gray-50 rounded-xl mb-4">
          <p className="text-sm text-gray-700 leading-loose">
            {blankedWords.map((w, i) => {
              if (w.isBlank) {
                const bIdx = blankCounter++
                const userAns = userAnswers[currentIdx]?.[bIdx] || ''
                const isCorrect = checked[currentIdx] && userAns.trim().toLowerCase() === w.clean
                return (
                  <input
                    key={i}
                    value={userAns}
                    onChange={(e) => handleAnswer(bIdx, e.target.value)}
                    disabled={checked[currentIdx]}
                    className={cn(
                      'inline-block mx-1 px-2 py-0.5 text-sm border-b-2 bg-white rounded-t transition-colors min-w-[80px]',
                      checked[currentIdx]
                        ? isCorrect
                          ? 'border-green-400 text-green-600'
                          : 'border-red-400 text-red-600'
                        : 'border-indigo-300 focus:border-indigo-500 text-indigo-600'
                    )}
                    style={{ width: `${Math.max(80, w.clean.length * 12)}px` }}
                    placeholder="___"
                  />
                )
              }
              return <span key={i}>{w.text}</span>
            })}
          </p>
        </div>

        {/* 正确答案展示（检查后） */}
        {checked[currentIdx] && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-blue-600">正确答案：</span>
              {blanks.join('、')}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button size="sm" variant="ghost" onClick={handlePrev} disabled={currentIdx === 0}>
            <SkipBack className="w-4 h-4" /> 上一句
          </Button>
          <div className="flex gap-2">
            {!checked[currentIdx] ? (
              <Button size="sm" onClick={handleCheck}>
                <PenLine className="w-4 h-4" /> 检查答案
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setChecked(prev => ({ ...prev, [currentIdx]: false }))}>
                重新作答
              </Button>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={handleNext} disabled={currentIdx === sentences.length - 1}>
            下一句 <SkipForward className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ===== 听写练习 =====

function DictationView({ sentences, accent }: { sentences: string[]; accent: string }) {
  const { toast } = useToast()
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [userText, setUserText] = useState('')
  const [showResult, setShowResult] = useState(false)
  const [playCount, setPlayCount] = useState(0)
  const lang = accentToLang(accent)

  const sentence = sentences[currentIdx] || ''

  const handlePlay = () => {
    if (isPlaying) {
      stop()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    setPlayCount(prev => prev + 1)
    speak({
      text: sentence,
      lang,
      rate: 1.0,
      onEnd: () => setIsPlaying(false),
      onError: () => { setIsPlaying(false); toast('播放失败', 'error') },
    })
  }

  const handleCheck = () => {
    if (!userText.trim()) {
      toast('请先输入你听到的内容', 'warning')
      return
    }
    setShowResult(true)
  }

  const handleNext = () => {
    stop()
    setIsPlaying(false)
    setUserText('')
    setShowResult(false)
    setPlayCount(0)
    if (currentIdx < sentences.length - 1) {
      setCurrentIdx(currentIdx + 1)
    } else {
      toast('已到达最后一句', 'info')
    }
  }

  const handlePrev = () => {
    stop()
    setIsPlaying(false)
    setUserText('')
    setShowResult(false)
    setPlayCount(0)
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1)
  }

  // 逐词对比
  const originalWords = sentence.split(/\s+/)
  const userWords = userText.trim().split(/\s+/)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">听写练习</h3>
              <p className="text-xs text-gray-400">第 {currentIdx + 1} / {sentences.length} 句 · 已播放 {playCount} 次</p>
            </div>
          </div>
          <Button size="sm" variant={isPlaying ? 'primary' : 'outline'} onClick={handlePlay}>
            {isPlaying ? <><Pause className="w-3 h-3" />停止</> : <><Play className="w-3 h-3" />播放</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!showResult ? (
          <>
            <div className="mb-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-400">点击播放按钮听句子，然后输入你听到的内容。可重复播放。</p>
            </div>
            <textarea
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              placeholder="在这里输入你听到的英文..."
              className="w-full min-h-[100px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-y"
              autoFocus
            />
          </>
        ) : (
          <div className="space-y-4">
            {/* 对比结果 */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">你的答案 vs 原文（红色为错误/遗漏，绿色为正确）</div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex flex-wrap gap-1 mb-3">
                  {originalWords.map((w, i) => {
                    const userW = userWords[i]?.replace(/[.,!?;:"]/g, '').toLowerCase() || ''
                    const origW = w.replace(/[.,!?;:"]/g, '').toLowerCase()
                    const correct = userW === origW
                    return (
                      <span key={i} className={cn(
                        'px-1.5 py-0.5 rounded text-sm',
                        correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      )}>
                        {w}
                      </span>
                    )
                  })}
                </div>
                <div className="text-xs text-gray-400">你的输入：{userText || '（空）'}</div>
              </div>
            </div>

            {/* 统计 */}
            {(() => {
              const correctCount = originalWords.filter((w, i) => {
                const userW = userWords[i]?.replace(/[.,!?;:"]/g, '').toLowerCase() || ''
                return userW === w.replace(/[.,!?;:"]/g, '').toLowerCase()
              }).length
              const accuracy = Math.round((correctCount / originalWords.length) * 100)
              return (
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', accuracy >= 80 ? 'bg-green-500' : accuracy >= 50 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${accuracy}%` }}></div>
                  </div>
                  <span className={cn('text-sm font-medium', accuracy >= 80 ? 'text-green-600' : accuracy >= 50 ? 'text-yellow-600' : 'text-red-600')}>
                    {accuracy}% ({correctCount}/{originalWords.length})
                  </span>
                </div>
              )
            })()}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-4">
          <Button size="sm" variant="ghost" onClick={handlePrev} disabled={currentIdx === 0}>
            <SkipBack className="w-4 h-4" /> 上一句
          </Button>
          <div className="flex gap-2">
            {!showResult ? (
              <Button size="sm" onClick={handleCheck}>
                <PenLine className="w-4 h-4" /> 提交对比
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setShowResult(false)}>
                重新听写
              </Button>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={handleNext} disabled={currentIdx === sentences.length - 1}>
            下一句 <SkipForward className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ===== 要点提取 =====

function KeyPointsView({ sentences, accent }: { sentences: string[]; accent: string }) {
  const { toast } = useToast()
  const [isPlaying, setIsPlaying] = useState(false)
  const [userPoints, setUserPoints] = useState('')
  const [showResult, setShowResult] = useState(false)
  const [playCount, setPlayCount] = useState(0)
  const lang = accentToLang(accent)
  const fullText = sentences.join(' ')

  const handlePlayAll = () => {
    if (isPlaying) {
      stop()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    setPlayCount(prev => prev + 1)
    let idx = 0
    const playNext = () => {
      if (idx >= sentences.length) {
        setIsPlaying(false)
        return
      }
      speak({
        text: sentences[idx],
        lang,
        rate: 1.0,
        onEnd: () => { idx++; playNext() },
        onError: () => setIsPlaying(false),
      })
    }
    playNext()
  }

  const handlePlaySentence = (idx: number) => {
    if (isPlaying) {
      stop()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    speak({
      text: sentences[idx],
      lang,
      rate: 1.0,
      onEnd: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    })
  }

  const handleSubmit = () => {
    if (!userPoints.trim()) {
      toast('请先输入你提取的要点', 'warning')
      return
    }
    setShowResult(true)
    toast('已生成参考要点，对比看看你遗漏了什么', 'success')
  }

  // 自动生成参考要点（取每句的关键词组）
  const referencePoints = useMemo(() => {
    return sentences.map((s, i) => {
      // 取句子的前几个实词作为要点摘要
      const words = s.split(/\s+/).slice(0, 8).join(' ')
      return `${i + 1}. ${words}${s.split(/\s+/).length > 8 ? '...' : ''}`
    })
  }, [sentences])

  const userPointsList = userPoints.split('\n').filter(p => p.trim())

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <BookMarked className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">要点提取</h3>
              <p className="text-xs text-gray-400">共 {sentences.length} 句 · 已播放 {playCount} 次</p>
            </div>
          </div>
          <Button size="sm" variant={isPlaying ? 'primary' : 'outline'} onClick={handlePlayAll}>
            {isPlaying ? <><Pause className="w-3 h-3" />停止</> : <><Play className="w-3 h-3" />播放全文</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 逐句播放按钮 */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-400 mb-2">也可逐句播放：</p>
          <div className="flex flex-wrap gap-2">
            {sentences.map((_, i) => (
              <button
                key={i}
                onClick={() => handlePlaySentence(i)}
                className="px-2.5 py-1 text-xs bg-white text-gray-500 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-gray-200"
              >
                句 {i + 1}
              </button>
            ))}
          </div>
        </div>

        {!showResult ? (
          <>
            <div className="mb-3 p-3 bg-amber-50 rounded-lg">
              <p className="text-xs text-amber-600">
                听完全文后，在下方输入你提取的关键要点（每行一个要点），然后提交对比参考答案。
              </p>
            </div>
            <textarea
              value={userPoints}
              onChange={(e) => setUserPoints(e.target.value)}
              placeholder={'例：\n1. 全球变暖导致海平面上升\n2. 沿海城市需要重新规划基础设施\n3. ...'}
              className="w-full min-h-[120px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-y"
            />
            <div className="mt-3">
              <Button onClick={handleSubmit} disabled={!userPoints.trim()}>
                <BookMarked className="w-4 h-4" /> 提交并查看参考要点
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {/* 用户答案 */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">你的要点（{userPointsList.length} 条）</div>
              <div className="p-3 bg-indigo-50 rounded-lg space-y-1">
                {userPointsList.map((p, i) => (
                  <p key={i} className="text-sm text-gray-700">{p}</p>
                ))}
              </div>
            </div>

            {/* 参考要点 */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">参考要点（基于原文 {sentences.length} 句）</div>
              <div className="p-3 bg-emerald-50 rounded-lg space-y-1">
                {referencePoints.map((p, i) => (
                  <p key={i} className="text-sm text-gray-700">{p}</p>
                ))}
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">
                提示：参考要点是按原文句子提取的摘要。你可以对比自己的要点，看看遗漏了哪些关键信息。
                完整理解听力内容后，尝试用自己的话概括要点效果更好。
              </p>
            </div>

            <Button variant="ghost" onClick={() => setShowResult(false)}>
              重新作答
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function VocabPracticeView() {
  const { toast } = useToast()

  const vocabItems = [
    { word: 'unprecedented', phonetic: '/ʌnˈpresɪdentɪd/', pos: 'adj.', def: '前所未有的', example: 'The situation is unprecedented in modern history.', context: '听力原文：...unprecedented challenges that climate change poses...' },
    { word: 'precipitation', phonetic: '/prɪˌsɪpɪˈteɪʃn/', pos: 'n.', def: '降水，沉淀', example: 'Changing precipitation patterns affect agriculture.', context: '听力原文：...changing precipitation patterns...' },
    { word: 'infrastructure', phonetic: '/ˈɪnfrəstrʌktʃər/', pos: 'n.', def: '基础设施', example: 'The city needs to upgrade its infrastructure.', context: '听力原文：...rethink traditional infrastructure.' },
  ]

  const handlePronounce = (word: string) => {
    speak({
      text: word,
      lang: 'en-US',
      rate: 0.9,
      onError: (err) => toast(`发音失败：${err}`, 'error'),
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>语境化词汇练习</CardTitle>
          <p className="text-sm text-gray-400 mt-1">基于当前听力素材自动提取的关键词汇</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {vocabItems.map((v) => (
              <div key={v.word} className="p-4 border border-gray-100 rounded-xl hover:border-indigo-200 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-900">{v.word}</span>
                      <span className="text-sm text-gray-400">{v.phonetic}</span>
                      <Badge variant="default">{v.pos}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{v.def}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handlePronounce(v.word)}>
                    <Volume2 className="w-4 h-4" />
                    发音
                  </Button>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 italic">"{v.example}"</p>
                </div>
                <div className="mt-2 p-2 bg-indigo-50 rounded-lg">
                  <p className="text-xs text-gray-500">
                    <span className="font-medium text-indigo-600">语境：</span>
                    {v.context}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { title: '选词填空', desc: '从列表中选择正确单词填入句子' },
              { title: '释义匹配', desc: '将单词与正确释义配对' },
              { title: '造句练习', desc: '用指定词汇造句，AI评分' },
            ].map((ex) => (
              <button key={ex.title} onClick={() => toast(`${ex.title}练习开发中`, 'info')} className="p-3 border border-gray-100 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-left">
                <h4 className="text-sm font-medium text-gray-800">{ex.title}</h4>
                <p className="text-xs text-gray-400 mt-0.5">{ex.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
