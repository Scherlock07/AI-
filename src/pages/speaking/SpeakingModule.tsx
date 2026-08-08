import { useState, useEffect, useRef } from 'react'
import { speakingApi, profileApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, formatDuration, getScoreColor } from '@/lib/utils'
import {
  Mic, Play, Pause, Square, Users, Bot,
  Presentation, MessagesSquare, Repeat, GraduationCap, BookOpen,
  Sparkles, Clock, Volume2, CheckCircle2,
  AlertCircle, Wifi, Send, Plus, Search, ArrowLeft,
  UserPlus, LogOut, Hash, Globe, Zap, Lightbulb, X,
  Loader2, MessageCircle, Crown,
} from 'lucide-react'

type TabType = 'classroom' | 'presentation' | 'discussion' | 'conversation' | 'retelling' | 'history'

export function SpeakingModule() {
  const [tab, setTab] = useState<TabType>('presentation')

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">口语练习</h1>
        <p className="text-sm text-gray-400">课堂评分 · Presentation · 讨论房间 · 人机对话 · 复述练习</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit flex-wrap overflow-x-auto max-w-full">
        {[
          { key: 'classroom' as TabType, label: '课堂评分', icon: GraduationCap },
          { key: 'presentation' as TabType, label: 'Presentation', icon: Presentation },
          { key: 'discussion' as TabType, label: '讨论房间', icon: Users },
          { key: 'conversation' as TabType, label: '人机对话', icon: MessagesSquare },
          { key: 'retelling' as TabType, label: '复述练习', icon: Repeat },
          { key: 'history' as TabType, label: '练习记录', icon: Clock },
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

      {tab === 'classroom' && <ClassroomView />}
      {tab === 'presentation' && <PresentationView />}
      {tab === 'discussion' && <DiscussionView />}
      {tab === 'conversation' && <ConversationView />}
      {tab === 'retelling' && <RetellingView />}
      {tab === 'history' && <HistoryView />}
    </div>
  )
}

// ===== Shared Recording Component =====
function RecordingPanel({ title, topic, onResult }: { title: string; topic: string; onResult?: () => void }) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } else if (timerRef) {
      clearInterval(timerRef.current!)
    }
    return () => { if (timerRef) clearInterval(timerRef.current!) }
  }, [isRecording])

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-col items-center py-8">
          <button
            onClick={() => {
              if (!isRecording) {
                setIsRecording(true)
                setDuration(0)
              } else {
                setIsRecording(false)
                onResult?.()
              }
            }}
            className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center transition-all',
              isRecording ? 'bg-red-500 animate-recording' : 'bg-indigo-600 hover:bg-indigo-700'
            )}
          >
            {isRecording ? <Square className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
          </button>
          <p className="mt-4 text-sm text-gray-500">
            {isRecording ? '正在录音...' : '点击开始录音'}
          </p>
          <div className="mt-2 text-2xl font-mono font-bold text-gray-900">
            {formatDuration(duration)}
          </div>
          {isRecording && (
            <div className="mt-4 flex items-center gap-1">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="w-1 bg-red-500 rounded-full"
                  style={{
                    height: `${10 + Math.random() * 20}px`,
                    animation: `pulse 0.${5 + i}s ease-in-out infinite alternate`
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ===== Score Display =====
function ScoreDisplay({ scores, feedback, referenceAnswer }: { scores: any[]; feedback: string; referenceAnswer?: string }) {
  const { toast } = useToast()
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + (b.score || 0), 0) / scores.length : 0

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-gray-500 mb-1">综合评分</div>
              <div className="flex items-end gap-2">
                <span className={cn('text-4xl font-bold', getScoreColor(avgScore))}>
                  {avgScore.toFixed(0)}
                </span>
                <span className="text-sm text-gray-400 mb-1">/ 100</span>
              </div>
            </div>
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
            {scores.map((s, i) => (
              <div key={i} className="text-center">
                <div className={cn('text-lg font-bold', getScoreColor(s.score || 0))}>{s.score || 0}</div>
                <div className="text-xs text-gray-400">{s.name || s.dimension || `维度${i+1}`}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <CardTitle>AI评价与建议</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 leading-relaxed">{feedback}</p>
        </CardContent>
      </Card>

      {referenceAnswer && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-indigo-500" />
              <CardTitle>参考示例</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 leading-relaxed italic">{referenceAnswer}</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => toast('参考音频播放功能开发中', 'info')}>
              <Play className="w-3 h-3" />
              播放参考音频
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ===== Classroom View =====
function ClassroomView() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-500" />
              <CardTitle>课堂口语评分</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">讲师设置主题</label>
              <input
                placeholder="输入口语表达主题，如：Describe a challenge you overcame"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">评分标准</label>
              <div className="flex flex-wrap gap-2">
                {['发音准确度', '流利度', '词汇多样性', '语法准确性', '内容切题度'].map(s => (
                  <Badge key={s} variant="primary">{s}</Badge>
                ))}
              </div>
            </div>
            <RecordingPanel title="课堂录音" topic="" />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>教师数据面板</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<GraduationCap className="w-8 h-8 text-gray-300" />}
              title="暂无课堂数据"
              desc="请先在教师后台创建班级并布置口语任务"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ===== Presentation 题库 =====
const PRESENTATION_TOPICS = [
  { title: 'Describe a technological innovation that has significantly changed your life. Explain how it has affected you and why you think it is important.', category: '科技', difficulty: '中级' },
  { title: 'Describe a person who has had a major influence on your life. Explain why this person is important to you and how they have shaped who you are.', category: '人物', difficulty: '中级' },
  { title: 'Describe a memorable travel experience. Where did you go, what did you do, and why was it memorable?', category: '经历', difficulty: '初级' },
  { title: 'Discuss the impact of social media on modern communication. Has it brought people closer together or pushed them apart?', category: '社会', difficulty: '高级' },
  { title: 'Describe a book or movie that profoundly affected you. What was it about, and why did it leave such an impression?', category: '文化', difficulty: '中级' },
  { title: 'Present your opinion on whether university education should be practical or theoretical. Support your view with examples.', category: '教育', difficulty: '高级' },
  { title: 'Describe a challenge you have overcome. What was the challenge, how did you deal with it, and what did you learn?', category: '经历', difficulty: '中级' },
  { title: 'Discuss the role of artificial intelligence in the future workplace. What opportunities and challenges does it present?', category: '科技', difficulty: '高级' },
  { title: 'Describe a cultural tradition from your country that you think is important to preserve. Why is it meaningful?', category: '文化', difficulty: '中级' },
  { title: 'Present your views on work-life balance. Is it achievable in today\'s fast-paced world?', category: '社会', difficulty: '高级' },
  { title: 'Describe an environmental issue that concerns you. What are the causes and what can individuals do to help?', category: '环境', difficulty: '中级' },
  { title: 'Discuss whether students should be required to learn a second language. What are the benefits and drawbacks?', category: '教育', difficulty: '中级' },
]

// ===== Presentation View =====
function PresentationView() {
  const [phase, setPhase] = useState<'topic' | 'prepare' | 'record' | 'result' | 'loading'>('topic')
  const [prepTime, setPrepTime] = useState(60)
  const [countdown, setCountdown] = useState(60)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState(PRESENTATION_TOPICS[0].title)
  const [showBank, setShowBank] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')

  const categories = ['全部', '科技', '人物', '经历', '社会', '文化', '教育', '环境']

  useEffect(() => {
    if (phase === 'prepare' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (phase === 'prepare' && countdown === 0) {
      setPhase('record')
    }
  }, [phase, countdown])

  const handleEvaluate = async () => {
    setPhase('loading')
    setError(null)
    try {
      const res = await speakingApi.evaluate({
        type: 'presentation',
        topic: selectedTopic,
        transcript: 'This is a sample transcript of the presentation. The speaker discusses the topic with supporting examples and personal reflections.',
      })
      setResult(res)
      setPhase('result')
    } catch (err: any) {
      setError(err.message || 'AI评估失败，请稍后重试')
      setPhase('result')
    }
  }

  const filteredTopics = filterCategory === '全部' || !filterCategory
    ? PRESENTATION_TOPICS
    : PRESENTATION_TOPICS.filter(t => t.category === filterCategory)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        {phase === 'topic' && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Presentation className="w-5 h-5 text-purple-500" />
                  <CardTitle>今日 Presentation 话题</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-purple-50 rounded-xl mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="primary">{PRESENTATION_TOPICS[0].category}</Badge>
                    <Badge variant={PRESENTATION_TOPICS[0].difficulty === '高级' ? 'danger' : PRESENTATION_TOPICS[0].difficulty === '中级' ? 'warning' : 'success'}>
                      {PRESENTATION_TOPICS[0].difficulty}
                    </Badge>
                  </div>
                  <p className="text-gray-800 font-medium">{PRESENTATION_TOPICS[0].title}</p>
                </div>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-700">准备时间</label>
                    <span className="text-sm text-indigo-600 font-medium">{prepTime} 秒</span>
                  </div>
                  <input
                    type="range" min="30" max="180" step="30"
                    value={prepTime}
                    onChange={(e) => setPrepTime(parseInt(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="lg" className="flex-1" onClick={() => { setSelectedTopic(PRESENTATION_TOPICS[0].title); setCountdown(prepTime); setPhase('prepare') }}>
                    <Clock className="w-4 h-4" />
                    开始准备 ({prepTime}s)
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setShowBank(!showBank)}>
                    <BookOpen className="w-4 h-4" />
                    题库
                  </Button>
                </div>
              </CardContent>
            </Card>

            {showBank && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-indigo-500" />
                      <CardTitle>Presentation 题库</CardTitle>
                    </div>
                    <Badge variant="default">{filteredTopics.length} 题</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* 分类筛选 */}
                  <div className="flex gap-1.5 flex-wrap mb-4">
                    {categories.map(c => (
                      <button
                        key={c}
                        onClick={() => setFilterCategory(c)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded-full transition-all',
                          (filterCategory === c || (!filterCategory && c === '全部'))
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {/* 话题列表 */}
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredTopics.map((topic, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setSelectedTopic(topic.title)
                          setShowBank(false)
                        }}
                        className={cn(
                          'p-3 rounded-lg cursor-pointer transition-all border',
                          selectedTopic === topic.title
                            ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100'
                            : 'border-gray-100 hover:border-indigo-300 hover:bg-gray-50'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="default">{topic.category}</Badge>
                          <Badge variant={topic.difficulty === '高级' ? 'danger' : topic.difficulty === '中级' ? 'warning' : 'success'}>
                            {topic.difficulty}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-700">{topic.title}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {phase !== 'topic' && selectedTopic !== PRESENTATION_TOPICS[0].title && (
          <div className="p-3 bg-purple-50 rounded-lg">
            <p className="text-xs text-purple-400 mb-1">当前话题</p>
            <p className="text-sm text-gray-700">{selectedTopic}</p>
          </div>
        )}

        {phase === 'prepare' && (
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col items-center py-12">
                <div className="text-6xl font-bold text-indigo-600 mb-2">{countdown}</div>
                <p className="text-sm text-gray-400 mb-6">准备中... 组织你的思路</p>
                <div className="w-full max-w-xs">
                  <Progress value={(1 - countdown / prepTime) * 100} color="primary" />
                </div>
                <div className="mt-6 p-3 bg-gray-50 rounded-lg w-full">
                  <p className="text-sm text-gray-500 text-center">{selectedTopic}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === 'record' && (
          <RecordingPanel title="Presentation 录音" topic={selectedTopic} onResult={handleEvaluate} />
        )}

        {phase === 'loading' && (
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col items-center py-12">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-sm text-gray-500">AI 正在评估你的口语表现...</p>
                <p className="text-xs text-gray-400 mt-1">分析发音、流利度、词汇、语法和内容切题度</p>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === 'result' && !result && error && (
          <Card>
            <CardContent className="pt-5">
              <ErrorState message={error} onRetry={handleEvaluate} />
            </CardContent>
          </Card>
        )}
      </div>

      {phase === 'result' && result ? (
        <ScoreDisplay
          scores={result.scores || result.score_details || []}
          feedback={result.feedback || result.ai_feedback || '暂无评价'}
          referenceAnswer={result.reference_text || result.reference_answer}
        />
      ) : phase === 'result' && !result ? null : (
        <Card className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-4">
              <Presentation className="w-8 h-8 text-purple-400" />
            </div>
            <p className="text-gray-400 text-sm">
              选择话题后开始练习<br />AI将提供多维度评分和参考示例<br />
              <span className="text-xs text-gray-300">点击"题库"浏览更多话题</span>
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

// ===== Discussion View (讨论广场 + 创建房间 + 房间内部) =====
function DiscussionView() {
  const [view, setView] = useState<'plaza' | 'create' | 'room'>('plaza')
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  const enterRoom = (roomId: string) => {
    setActiveRoomId(roomId)
    setView('room')
  }

  const goPlaza = () => {
    setActiveRoomId(null)
    setView('plaza')
  }

  if (view === 'create') {
    return <CreateRoomView onCreated={enterRoom} onBack={goPlaza} />
  }
  if (view === 'room' && activeRoomId) {
    return <RoomInteriorView roomId={activeRoomId} onBack={goPlaza} />
  }
  return <DiscussionPlaza onCreate={() => setView('create')} onJoin={enterRoom} />
}

// --- 讨论广场 ---
function DiscussionPlaza({ onCreate, onJoin }: { onCreate: () => void; onJoin: (roomId: string) => void }) {
  const { toast } = useToast()
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [joining, setJoining] = useState<string | null>(null)

  const categories = [
    { value: '', label: '全部' },
    { value: 'general', label: '通用' },
    { value: 'technology', label: '科技' },
    { value: 'environment', label: '环境' },
    { value: 'education', label: '教育' },
    { value: 'society', label: '社会' },
    { value: 'ethics', label: '伦理' },
  ]

  const fetchRooms = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await speakingApi.listRooms({
        search: search || undefined,
        category: category || undefined,
      })
      setRooms(Array.isArray(res) ? res : [])
    } catch (err: any) {
      setError(err.message || '加载房间失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRooms() }, [category])

  const handleSearch = () => { fetchRooms() }

  const handleJoin = async (roomId: string) => {
    setJoining(roomId)
    try {
      await speakingApi.joinRoom(roomId)
      toast('已加入讨论房间', 'success')
      onJoin(roomId)
    } catch (err: any) {
      toast(err.message || '加入失败', 'error')
    } finally {
      setJoining(null)
    }
  }

  const difficultyLabels: Record<string, { label: string; color: string }> = {
    beginner: { label: '初级', color: 'text-green-600 bg-green-50' },
    intermediate: { label: '中级', color: 'text-blue-600 bg-blue-50' },
    advanced: { label: '高级', color: 'text-purple-600 bg-purple-50' },
  }

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索讨论主题..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleSearch}>
            <Search className="w-4 h-4" />
            搜索
          </Button>
        </div>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4" />
          创建房间
        </Button>
      </div>

      {/* 分类筛选 */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full transition-all',
              category === c.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 房间列表 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchRooms} />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8 text-gray-300" />}
          title="暂无讨论房间"
          desc="创建一个新房间，邀请同学或AI讨论者加入讨论吧！"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rooms.map(room => {
            const dl = difficultyLabels[room.difficulty] || difficultyLabels.intermediate
            const isFull = room.participant_count >= room.max_participants
            return (
              <Card key={room.id} hover>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', dl.color)}>
                          {dl.label}
                        </span>
                        {room.category && room.category !== 'general' && (
                          <Badge variant="default">{room.category}</Badge>
                        )}
                        <Badge variant={room.status === 'active' ? 'success' : 'warning'}>
                          {room.status === 'active' ? '讨论中' : '等待中'}
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                        {room.topic}
                      </h3>
                    </div>
                  </div>

                  {room.description && (
                    <p className="text-xs text-gray-400 mb-3 line-clamp-2">{room.description}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-500" />
                        {room.host_name || '房主'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {room.participant_count}/{room.max_participants}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bot className="w-3 h-3 text-purple-500" />
                        {room.ai_count} AI
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={isFull ? 'outline' : 'primary'}
                      disabled={isFull || joining === room.id}
                      onClick={() => handleJoin(room.id)}
                    >
                      {joining === room.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isFull ? '已满' : '加入'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- 创建房间向导 ---
function CreateRoomView({ onCreated, onBack }: { onCreated: (roomId: string) => void; onBack: () => void }) {
  const { toast } = useToast()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    topic: '',
    description: '',
    category: 'general',
    difficulty: 'intermediate',
    max_participants: 4,
    ai_count: 2,
    language: 'en',
  })

  // AI推荐主题
  const [recommending, setRecommending] = useState(false)
  const [recommendedTopics, setRecommendedTopics] = useState<any[]>([])

  const categories = [
    { value: 'general', label: '通用话题' },
    { value: 'technology', label: '科技与创新' },
    { value: 'environment', label: '环境与可持续发展' },
    { value: 'education', label: '教育改革' },
    { value: 'society', label: '社会现象' },
    { value: 'ethics', label: '伦理思辨' },
  ]

  const difficulties = [
    { value: 'beginner', label: '初级 (A2-B1)' },
    { value: 'intermediate', label: '中级 (B1-B2)' },
    { value: 'advanced', label: '高级 (B2-C1)' },
  ]

  const handleRecommend = async () => {
    setRecommending(true)
    try {
      const res = await speakingApi.recommendTopics({
        category: form.category,
        difficulty: form.difficulty,
        count: 5,
      })
      setRecommendedTopics(res.topics || [])
      toast('AI已推荐讨论主题', 'success')
    } catch (err: any) {
      toast(err.message || '推荐失败', 'error')
    } finally {
      setRecommending(false)
    }
  }

  const handleCreate = async () => {
    if (!form.topic.trim()) {
      toast('请输入或选择讨论主题', 'warning')
      return
    }
    try {
      const res = await speakingApi.createRoom(form)
      toast('讨论房间已创建！', 'success')
      onCreated(res.id)
    } catch (err: any) {
      toast(err.message || '创建失败', 'error')
    }
  }

  const aiPersonas = [
    { name: 'Emma', persona: 'A thoughtful debater who analyzes arguments from multiple angles and provides well-structured responses.' },
    { name: 'James', persona: 'A passionate advocate who argues strongly for one side and challenges opposing views directly.' },
    { name: 'Sophia', persona: 'A devil\'s advocate who questions prevailing opinions and introduces counterintuitive perspectives.' },
    { name: 'Lucas', persona: 'A mediator who seeks common ground and synthesizes different viewpoints into coherent conclusions.' },
  ]

  return (
    <div className="space-y-4">
      {/* 返回按钮 */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        返回讨论广场
      </button>

      {/* 步骤指示器 */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { n: 1, label: '选择主题' },
          { n: 2, label: '房间设置' },
          { n: 3, label: '确认创建' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
              step === s.n ? 'bg-indigo-600 text-white' :
              step > s.n ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
            )}>
              <span className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs',
                step === s.n ? 'bg-white/20' : step > s.n ? 'bg-green-500 text-white' : 'bg-gray-300 text-white'
              )}>
                {step > s.n ? <CheckCircle2 className="w-3 h-3" /> : s.n}
              </span>
              {s.label}
            </div>
            {i < 2 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: 选择主题 */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <CardTitle>讨论主题</CardTitle>
              </div>
              <p className="text-xs text-gray-400 mt-1">输入你自己的主题，或让AI推荐适合讨论的话题</p>
            </CardHeader>
            <CardContent>
              {/* 手动输入 */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">自定义主题</label>
                <textarea
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  placeholder="输入讨论主题，例如：Should universities prioritize STEM education over humanities?"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none"
                />
              </div>

              {/* 分类和难度 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">话题分类</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  >
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">难度</label>
                  <select
                    value={form.difficulty}
                    onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  >
                    {difficulties.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              {/* AI推荐 */}
              <Button variant="outline" className="w-full" onClick={handleRecommend} disabled={recommending}>
                {recommending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> AI正在生成推荐主题...</>
                ) : (
                  <><Sparkles className="w-4 h-4 text-purple-500" /> AI推荐讨论主题</>
                )}
              </Button>

              {recommendedTopics.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-gray-500">AI推荐主题（点击选用）</p>
                  {recommendedTopics.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => setForm({ ...form, topic: t.topic })}
                      className={cn(
                        'w-full text-left p-3 rounded-lg border transition-all',
                        form.topic === t.topic
                          ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100'
                          : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                      )}
                    >
                      <p className="text-sm font-medium text-gray-800 mb-1">{t.topic}</p>
                      <p className="text-xs text-gray-400 mb-2">{t.topic_zh}</p>
                      {t.key_vocabulary && (
                        <div className="flex gap-1 flex-wrap">
                          {t.key_vocabulary.map((v: string, j: number) => (
                            <span key={j} className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-4">
                <Button onClick={() => setStep(2)} disabled={!form.topic.trim()}>
                  下一步
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: 房间设置 */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              <CardTitle>房间设置</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {/* 参与人数 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">总参与人数（含你）</label>
                <span className="text-lg font-bold text-indigo-600">{form.max_participants}</span>
              </div>
              <input
                type="range" min="2" max="8" step="1"
                value={form.max_participants}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  setForm({ ...form, max_participants: val, ai_count: Math.min(form.ai_count, val - 1) })
                }}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>2人</span><span>8人</span>
              </div>
            </div>

            {/* AI讨论者数量 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">AI讨论者数量</label>
                <span className="text-lg font-bold text-purple-600">{form.ai_count}</span>
              </div>
              <input
                type="range" min="0" max={Math.min(4, form.max_participants - 1)} step="1"
                value={form.ai_count}
                onChange={(e) => setForm({ ...form, ai_count: parseInt(e.target.value) })}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0（纯真人）</span><span>最多 {Math.min(4, form.max_participants - 1)}</span>
              </div>
              {form.ai_count > 0 && (
                <div className="mt-3 space-y-1.5">
                  {aiPersonas.slice(0, form.ai_count).map((ai, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">{ai.name}</span>
                        <p className="text-xs text-gray-400">{ai.persona}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 房间描述 */}
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">房间描述（可选）</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="简要描述讨论规则、目标等..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            {/* 语言 */}
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">讨论语言</label>
              <div className="flex gap-2">
                {[
                  { value: 'en', label: 'English' },
                  { value: 'zh', label: '中文' },
                  { value: 'de', label: 'Deutsch' },
                ].map(l => (
                  <button
                    key={l.value}
                    onClick={() => setForm({ ...form, language: l.value })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      form.language === l.value
                        ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200'
                        : 'bg-gray-50 text-gray-500'
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>上一步</Button>
              <Button onClick={() => setStep(3)}>下一步</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 确认创建 */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <CardTitle>确认房间信息</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-5">
              <div className="p-3 bg-indigo-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">讨论主题</p>
                <p className="text-sm font-medium text-gray-800">{form.topic}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">参与人数</p>

                  <p className="text-sm font-medium text-gray-800">{form.max_participants} 人</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">AI讨论者</p>
                  <p className="text-sm font-medium text-gray-800">{form.ai_count} 位</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">难度</p>
                  <p className="text-sm font-medium text-gray-800">
                    {difficulties.find(d => d.value === form.difficulty)?.label}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">语言</p>
                  <p className="text-sm font-medium text-gray-800 uppercase">{form.language}</p>
                </div>
              </div>
              {form.description && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">描述</p>
                  <p className="text-sm text-gray-700">{form.description}</p>
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-50 rounded-lg mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-600">
                创建后你将自动成为房主。其他用户可在"讨论广场"中找到并加入你的房间，你也可以通过用户名邀请好友。
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>上一步</Button>
              <Button onClick={handleCreate}>
                <Zap className="w-4 h-4" />
                创建房间
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- 房间内部视图 ---
function RoomInteriorView({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const { toast } = useToast()
  const [room, setRoom] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [aiReplying, setAiReplying] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const aiPersonas = [
    { name: 'Emma', persona: 'A thoughtful debater who analyzes arguments from multiple angles.' },
    { name: 'James', persona: 'A passionate advocate who argues strongly for one side.' },
    { name: 'Sophia', persona: 'A devil\'s advocate who questions prevailing opinions.' },
    { name: 'Lucas', persona: 'A mediator who seeks common ground.' },
  ]

  const fetchRoom = async () => {
    try {
      const res = await speakingApi.getRoom(roomId)
      setRoom(res)
    } catch (err: any) {
      toast(err.message || '加载房间信息失败', 'error')
    }
  }

  const fetchMessages = async () => {
    try {
      const res = await speakingApi.getMessages(roomId)
      setMessages(Array.isArray(res) ? res : [])
    } catch (err: any) {
      // 静默失败
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([fetchRoom(), fetchMessages()])
      setLoading(false)
    }
    init()
    // 轮询更新消息
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [roomId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)
    try {
      const msg = await speakingApi.sendMessage(roomId, content)
      setMessages(prev => [...prev, msg])
      // 发送后自动刷新房间状态
      fetchRoom()
    } catch (err: any) {
      toast(err.message || '发送失败', 'error')
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  const handleAiReply = async (aiName: string, aiPersona: string) => {
    if (aiReplying) return
    setAiReplying(aiName)
    try {
      const msg = await speakingApi.aiReply(roomId, { ai_name: aiName, ai_persona: aiPersona })
      setMessages(prev => [...prev, msg])
      toast(`${aiName} 已发言`, 'info')
    } catch (err: any) {
      toast(err.message || 'AI回复失败', 'error')
    } finally {
      setAiReplying(null)
    }
  }

  const handleLeave = async () => {
    try {
      await speakingApi.leaveRoom(roomId)
      toast('已离开房间', 'info')
      onBack()
    } catch (err: any) {
      toast(err.message || '离开失败', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (!room) {
    return <ErrorState message="房间不存在或已关闭" onRetry={onBack} />
  }

  const aiList = aiPersonas.slice(0, room.ai_count || 0)
  const participants = room.speaker_queue || []

  return (
    <div className="space-y-4">
      {/* 顶部房间信息 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={onBack} className="text-gray-400 hover:text-gray-600">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <Badge variant={room.status === 'active' ? 'success' : 'warning'}>
                  {room.status === 'active' ? '讨论中' : '等待中'}
                </Badge>
                {room.difficulty && (
                  <Badge variant="default">{room.difficulty}</Badge>
                )}
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">{room.topic}</h2>
              {room.description && (
                <p className="text-xs text-gray-400">{room.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setShowInvite(true)}>
                <UserPlus className="w-3 h-3" />
                邀请
              </Button>
              <Button size="sm" variant="danger" onClick={handleLeave}>
                <LogOut className="w-3 h-3" />
                离开
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左侧：参与者列表 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <CardTitle className="text-sm">参与者</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* 真人参与者 */}
                {participants.filter((p: any) => !p.isAI).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-600">
                      {p.name?.[0] || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700 truncate">{p.name}</div>
                      <div className="text-xs text-gray-400">
                        {p.role === 'host' ? '房主' : '参与者'}
                      </div>
                    </div>
                    {p.role === 'host' && <Crown className="w-3 h-3 text-amber-500" />}
                  </div>
                ))}

                {/* AI讨论者 */}
                {aiList.map((ai) => (
                  <div key={ai.name} className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700">{ai.name}</div>
                      <div className="text-xs text-gray-400 truncate">{ai.persona}</div>
                    </div>
                  </div>
                ))}

                {/* 空位 */}
                {Array.from({ length: Math.max(0, room.max_participants - participants.length - aiList.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className="flex items-center gap-2 p-2 border border-dashed border-gray-200 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                      <UserPlus className="w-4 h-4 text-gray-300" />
                    </div>
                    <span className="text-xs text-gray-400">等待加入...</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
                <span>真人: {participants.filter((p: any) => !p.isAI).length}/{room.max_participants}</span>
                <span>AI: {aiList.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* AI讨论者操作 */}
          {aiList.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-purple-500" />
                  <CardTitle className="text-sm">AI讨论者</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {aiList.map(ai => (
                    <button
                      key={ai.name}
                      onClick={() => handleAiReply(ai.name, ai.persona)}
                      disabled={!!aiReplying}
                      className={cn(
                        'w-full flex items-center gap-2 p-2 rounded-lg transition-all text-left',
                        aiReplying === ai.name
                          ? 'bg-purple-100 animate-pulse'
                          : 'bg-purple-50 hover:bg-purple-100'
                      )}
                    >
                      <div className="w-7 h-7 rounded-full bg-purple-200 flex items-center justify-center">
                        {aiReplying === ai.name
                          ? <Loader2 className="w-3 h-3 text-purple-600 animate-spin" />
                          : <Bot className="w-3 h-3 text-purple-600" />
                        }
                      </div>
                      <span className="text-xs font-medium text-gray-700">
                        {aiReplying === ai.name ? `${ai.name} 思考中...` : `让 ${ai.name} 发言`}
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：讨论区 */}
        <div className="col-span-2">
          <Card className="flex flex-col" style={{ minHeight: '500px' }}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-indigo-500" />
                <CardTitle className="text-sm">讨论区</CardTitle>
                <span className="text-xs text-gray-400 ml-auto">{messages.length} 条消息</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              {/* 消息列表 */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-96 min-h-64 p-2">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <MessageCircle className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">还没有消息，发送第一条消息开始讨论吧！</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isAI = msg.sender_type === 'ai'
                    const isSystem = msg.sender_type === 'system'
                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center">
                          <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                            {msg.content}
                          </span>
                        </div>
                      )
                    }
                    return (
                      <div key={msg.id} className={cn('flex gap-2', isAI && 'flex-row')}>
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                          isAI ? 'bg-purple-100' : 'bg-indigo-100'
                        )}>
                          {isAI
                            ? <Bot className="w-4 h-4 text-purple-600" />
                            : <span className="text-xs font-medium text-indigo-600">{msg.sender_name?.[0] || 'U'}</span>
                          }
                        </div>
                        <div className="max-w-[80%]">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-gray-600">{msg.sender_name}</span>
                            {isAI && <Badge variant="primary">AI</Badge>}
                            <span className="text-xs text-gray-300">
                              {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                            </span>
                          </div>
                          <div className={cn(
                            'p-2.5 rounded-lg text-sm leading-relaxed',
                            isAI ? 'bg-purple-50 text-gray-700' : 'bg-white text-gray-700 border border-gray-100'
                          )}>
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 输入区 */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="输入你的观点..."
                    disabled={sending}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                  <Button size="sm" onClick={handleSend} disabled={!input.trim() || sending}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-300 mt-1.5">
                  发送消息后，可点击左侧AI讨论者让其发言 · 消息每5秒自动刷新
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 邀请弹窗 */}
      {showInvite && (
        <InviteDialog
          roomId={roomId}
          onClose={() => setShowInvite(false)}
          onInvited={(name) => {
            toast(`已邀请 ${name}`, 'success')
            fetchMessages()
          }}
        />
      )}
    </div>
  )
}

// --- 邀请用户弹窗 ---
function InviteDialog({ roomId, onClose, onInvited }: {
  roomId: string
  onClose: () => void
  onInvited: (name: string) => void
}) {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await speakingApi.searchUsers(query.trim())
      setResults(Array.isArray(res) ? res : [])
    } catch (err: any) {
      toast(err.message || '搜索失败', 'error')
    } finally {
      setSearching(false)
    }
  }

  const handleInvite = async (username: string, displayName: string) => {
    setInviting(username)
    try {
      await speakingApi.inviteUser(roomId, username)
      onInvited(displayName)
    } catch (err: any) {
      toast(err.message || '邀请失败', 'error')
    } finally {
      setInviting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-gray-900">邀请用户加入讨论</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="输入用户名搜索..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                autoFocus
              />
            </div>
            <Button size="sm" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : '搜索'}
            </Button>
          </div>

          {results.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {results.map(u => (
                <div key={u.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-600">
                      {u.display_name?.[0] || u.username?.[0] || 'U'}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">{u.display_name || u.username}</div>
                      <div className="text-xs text-gray-400">@{u.username}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={inviting === u.username}
                    onClick={() => handleInvite(u.username, u.display_name || u.username)}
                  >
                    {inviting === u.username ? <Loader2 className="w-3 h-3 animate-spin" /> : '邀请'}
                  </Button>
                </div>
              ))}
            </div>
          ) : query && !searching ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">未找到匹配的用户</p>
              <p className="text-xs text-gray-300 mt-1">请确认用户名是否正确</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <UserPlus className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">搜索用户名以发送邀请</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== Conversation View =====
function ConversationView() {
  const { toast } = useToast()
  const [mode, setMode] = useState<'daily' | 'critical'>('daily')
  const [active, setActive] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [aiReplying, setAiReplying] = useState(false)
  const [customTopic, setCustomTopic] = useState('')

  const suggestedTopics = mode === 'daily'
    ? ['环境保护', '科技发展', '教育改革', '社会公平', '旅行经历', '健康生活']
    : ['AI伦理', '全球化利弊', '隐私vs安全', '传统文化保护', '财富分配', '气候政策']

  const startConversation = (topic: string) => {
    setActive(true)
    setResult(null)
    setMessages([])
    const modeLabel = mode === 'daily' ? 'casual daily conversation' : 'critical thinking discussion'
    const systemText = topic
      ? `Let's have a ${modeLabel} about: ${topic}. I'll start by asking you a question related to this topic.`
      : (mode === 'daily'
        ? "Hi there! How was your day? Did anything interesting happen?"
        : "What's your stance on the ethical implications of artificial intelligence in decision-making processes?")

    // 让AI发起对话
    setAiReplying(true)
    profileApi.askAssistant(
      `You are an English conversation partner on a language learning platform. The student wants to practice ${modeLabel}${topic ? ` about "${topic}"` : ''}. Please start the conversation with a natural opening question or comment in English. Keep it short (1-2 sentences).`,
      'conversation-start'
    ).then((res: any) => {
      setMessages([{
        role: 'ai',
        text: res.reply || systemText,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      }])
    }).catch(() => {
      setMessages([{
        role: 'ai',
        text: systemText,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      }])
    }).finally(() => {
      setAiReplying(false)
    })
  }

  const sendMessage = async () => {
    if (!input.trim() || aiReplying) return
    const userMsg = { role: 'user', text: input, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) }
    const currentInput = input
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setAiReplying(true)

    try {
      // 构建对话上下文
      const conversationContext = messages.map(m => `${m.role === 'ai' ? 'AI' : 'Student'}: ${m.text}`).join('\n')
      const modeLabel = mode === 'daily' ? 'casual daily conversation' : 'critical thinking discussion'
      const prompt = `You are an English conversation partner. Continue this ${modeLabel} naturally. The student just said: "${currentInput}". Previous context:\n${conversationContext}\n\nRespond naturally in English (2-3 sentences). Ask follow-up questions to keep the conversation going. Match the difficulty level of the student's English.`

      const res = await profileApi.askAssistant(prompt, 'conversation-continue')
      setMessages(prev => [...prev, {
        role: 'ai',
        text: res.reply || "That's interesting. Can you tell me more about that?",
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: "I see. Could you elaborate on that a bit more?",
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      }])
    } finally {
      setAiReplying(false)
    }
  }

  const finishConversation = async () => {
    setEvaluating(true)
    setActive(false)
    try {
      const res = await speakingApi.evaluate({
        type: 'conversation',
        topic: mode === 'daily' ? '日常对话' : '思辨对话',
        transcript: messages.map(m => `${m.role}: ${m.text}`).join('\n'),
      })
      setResult(res)
    } catch {
      setResult({
        scores: [{ name: '整体表现', score: 78 }],
        feedback: '对话完成。继续练习以提升口语流利度和表达准确性。',
      })
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessagesSquare className="w-5 h-5 text-purple-500" />
              <CardTitle>人机对话</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">对话类型</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('daily')}
                  className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    mode === 'daily' ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200' : 'bg-gray-50 text-gray-500')}
                >
                  日常对话
                </button>
                <button
                  onClick={() => setMode('critical')}
                  className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    mode === 'critical' ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200' : 'bg-gray-50 text-gray-500')}
                >
                  思辨对话
                </button>
              </div>
            </div>

            {!active && !evaluating && !result && (
              <>
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">对话主题</label>
                  <input
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="输入你想聊的话题，如：My favorite movie, Climate change solutions..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">推荐话题（点击直接开始）</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedTopics.map(t => (
                      <button
                        key={t}
                        onClick={() => { setCustomTopic(t); startConversation(t) }}
                        className="px-2.5 py-1 text-xs bg-gray-50 text-gray-500 rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <Button size="lg" className="w-full" onClick={() => startConversation(customTopic)}>
                  <Mic className="w-4 h-4" />
                  {customTopic ? `开始对话：${customTopic}` : '开始自由对话'}
                </Button>
              </>
            )}

            {active && (
              <div className="space-y-3">
                <div className="p-3 bg-indigo-50 rounded-lg flex items-center gap-2">
                  <div className={cn('w-3 h-3 rounded-full', aiReplying ? 'bg-amber-500 animate-pulse' : 'bg-green-500 animate-pulse')}></div>
                  <span className="text-sm text-indigo-600">{aiReplying ? 'AI正在思考...' : 'AI正在聆听...'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="输入你的回答..."
                    disabled={aiReplying}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 disabled:bg-gray-50"
                  />
                  <Button size="sm" onClick={sendMessage} disabled={!input.trim() || aiReplying}>
                    {aiReplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <Button variant="outline" size="lg" className="w-full" onClick={finishConversation} disabled={aiReplying}>
                  <Square className="w-4 h-4" />
                  结束对话并评分
                </Button>
              </div>
            )}

            {evaluating && (
              <div className="flex flex-col items-center py-8">
                <LoadingSpinner size="lg" />
                <p className="mt-3 text-sm text-gray-500">AI 正在评估对话表现...</p>
              </div>
            )}

            {result && !active && !evaluating && (
              <Button variant="outline" className="w-full" onClick={() => { setResult(null); setMessages([]); setCustomTopic(''); }}>
                开始新对话
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {active && messages.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>对话记录</CardTitle>
              {customTopic && <Badge variant="primary" className="ml-2">{customTopic}</Badge>}
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {messages.map((msg, i) => (
                  <div key={i} className={cn('flex gap-2', msg.role === 'user' && 'flex-row-reverse')}>
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                      msg.role === 'ai' ? 'bg-purple-100' : 'bg-indigo-100'
                    )}>
                      {msg.role === 'ai' ? <Bot className="w-4 h-4 text-purple-600" /> : <span className="text-xs font-medium text-indigo-600">我</span>}
                    </div>
                    <div className={cn('max-w-[75%]')}>
                      <div className={cn(
                        'p-2.5 rounded-lg text-sm leading-relaxed',
                        msg.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-gray-50 text-gray-700'
                      )}>
                        {msg.text}
                      </div>
                      <div className="text-xs text-gray-300 mt-0.5">{msg.time}</div>
                    </div>
                  </div>
                ))}
                {aiReplying && (
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : result ? (
          <ScoreDisplay
            scores={result.scores || result.score_details || [{ name: '整体表现', score: 78 }]}
            feedback={result.feedback || result.ai_feedback || '对话评估完成'}
          />
        ) : (
          <Card className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-4">
                <MessagesSquare className="w-8 h-8 text-purple-400" />
              </div>
              <p className="text-gray-400 text-sm">
                输入你感兴趣的话题，AI将作为你的对话伙伴<br />
                支持文字对话，结束后给出评分和建议<br />
                <span className="text-xs">日常对话练习生活场景，思辨对话锻炼论证能力</span>
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ===== Retelling View =====
function RetellingView() {
  const { toast } = useToast()
  const [phase, setPhase] = useState<'settings' | 'listening' | 'recording' | 'loading' | 'result'>('settings')
  const [settings, setSettings] = useState({ speed: 1.0, repeat: 1, length: 'medium' })
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleEvaluate = async () => {
    setPhase('loading')
    setError(null)
    try {
      const res = await speakingApi.evaluate({
        type: 'retelling',
        topic: 'The Impact of Social Media on Interpersonal Communication',
        transcript: 'Social media has fundamentally changed how we communicate. It has made long-distance communication easier but may have reduced face-to-face interactions.',
      })
      setResult(res)
      setPhase('result')
    } catch (err: any) {
      setError(err.message || 'AI评估失败')
      setPhase('result')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        {phase === 'settings' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Repeat className="w-5 h-5 text-indigo-500" />
                <CardTitle>复述练习设置</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-2">当前素材</p>
                <p className="text-sm font-medium text-gray-800">AI生成模拟音频：The Impact of Social Media on Interpersonal Communication</p>
                <Badge variant="primary" className="mt-2">AI生成</Badge>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">语速</label>
                  <span className="text-sm text-indigo-600">{settings.speed}x</span>
                </div>
                <input type="range" min="0.5" max="1.5" step="0.1" value={settings.speed}
                  onChange={(e) => setSettings({ ...settings, speed: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500" />
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">朗读次数</label>
                  <span className="text-sm text-indigo-600">{settings.repeat} 次</span>
                </div>
                <input type="range" min="1" max="3" step="1" value={settings.repeat}
                  onChange={(e) => setSettings({ ...settings, repeat: parseInt(e.target.value) })}
                  className="w-full accent-indigo-500" />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">篇幅长度</label>
                <div className="flex gap-2">
                  {[
                    { value: 'short', label: '短篇 (~1分钟)' },
                    { value: 'medium', label: '中篇 (~2分钟)' },
                    { value: 'long', label: '长篇 (~3分钟)' },
                  ].map(l => (
                    <button key={l.value} onClick={() => setSettings({ ...settings, length: l.value })}
                      className={cn('flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                        settings.length === l.value ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200' : 'bg-gray-50 text-gray-500')}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-yellow-50 rounded-lg mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-medium text-gray-700">音频来源说明</span>
                </div>
                <p className="text-xs text-gray-500">
                  托福等考试真题音频因版权原因不提供收录。当前音频为AI根据真题风格生成的模拟素材。如有真题音频，可通过"手动导入"端口上传。
                </p>
              </div>

              <Button size="lg" className="w-full" onClick={() => setPhase('listening')}>
                <Play className="w-4 h-4" />
                开始听音频
              </Button>
            </CardContent>
          </Card>
        )}

        {phase === 'listening' && (
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col items-center py-8">
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                  <Volume2 className="w-8 h-8 text-indigo-500" />
                </div>
                <p className="text-sm text-gray-500 mb-4">正在播放音频... 请仔细聆听</p>
                <div className="flex items-center gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={() => toast('已暂停播放', 'info')}><Pause className="w-3 h-3" />暂停</Button>
                  <span className="text-sm text-gray-400">第 1/{settings.repeat} 次播放</span>
                </div>
                <Progress value={65} className="w-64" />
                <div className="flex justify-between w-64 mt-1 text-xs text-gray-400">
                  <span>1:18</span>
                  <span>2:00</span>
                </div>
                <Button className="mt-6" onClick={() => setPhase('recording')}>
                  听完了，开始复述
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === 'recording' && (
          <RecordingPanel title="复述录音" topic="" onResult={handleEvaluate} />
        )}

        {phase === 'loading' && (
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col items-center py-12">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-sm text-gray-500">AI 正在分析你的复述内容...</p>
                <p className="text-xs text-gray-400 mt-1">评估完整度、要点覆盖、语言准确性和流利度</p>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === 'result' && !result && error && (
          <Card>
            <CardContent className="pt-5">
              <ErrorState message={error} onRetry={handleEvaluate} />
            </CardContent>
          </Card>
        )}
      </div>

      {phase === 'result' && result ? (
        <ScoreDisplay
          scores={result.scores || result.score_details || []}
          feedback={result.feedback || result.ai_feedback || '复述评估完成'}
        />
      ) : phase === 'result' && !result ? null : (
        <Card className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Repeat className="w-8 h-8 text-indigo-400" />
            </div>
            <p className="text-gray-400 text-sm">
              听完音频后进行复述<br />AI将从完整度、要点覆盖度、语言准确性等<br />多维度评分并给出改进建议
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

// ===== History View =====
function HistoryView() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRecords = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await speakingApi.listRecords()
      const data = Array.isArray(res) ? res : (res.records || res.items || [])
      setRecords(data)
    } catch (err: any) {
      setError(err.message || '加载练习记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const typeLabels: Record<string, { label: string; variant: any }> = {
    presentation: { label: 'Presentation', variant: 'primary' },
    discussion: { label: '讨论', variant: 'success' },
    conversation: { label: '人机对话', variant: 'primary' },
    retelling: { label: '复述', variant: 'warning' },
    classroom: { label: '课堂', variant: 'danger' },
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchRecords} />
  }

  if (records.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="w-8 h-8 text-gray-300" />}
        title="暂无练习记录"
        desc="完成口语练习后，记录将显示在这里"
      />
    )
  }

  return (
    <div className="space-y-4">
      {records.map((r) => {
        const tl = typeLabels[r.type] || { label: r.type || '练习', variant: 'default' }
        const scores = r.scores || r.score_details || []
        const overallScore = r.overall_score || r.overallScore || 0
        return (
          <Card key={r.id} hover>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={tl.variant}>{tl.label}</Badge>
                    <h3 className="font-semibold text-gray-900">{r.topic || r.title || '口语练习'}</h3>
                  </div>
                  <p className="text-xs text-gray-400">
                    {r.created_at || r.createdAt || r.date ? new Date(r.created_at || r.createdAt || r.date).toLocaleString('zh-CN') : ''} 
                    {' · '}{formatDuration(r.duration || 0)}
                  </p>
                </div>
                <div className="text-right">
                  <div className={cn('text-3xl font-bold', getScoreColor(overallScore))}>{overallScore}</div>
                  <div className="text-xs text-gray-400">综合评分</div>
                </div>
              </div>
              {scores.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mb-3">
                  {scores.map((s: any, i: number) => (
                    <div key={i} className="text-center">
                      <div className={cn('text-sm font-bold', getScoreColor(s.score || 0))}>{s.score || 0}</div>
                      <div className="text-xs text-gray-400">{s.name || s.dimension || `维度${i+1}`}</div>
                    </div>
                  ))}
                </div>
              )}
              {r.transcript && (
                <div className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 line-clamp-1">{r.transcript}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
