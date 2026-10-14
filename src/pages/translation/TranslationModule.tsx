import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn, getScoreColor, formatDate } from '@/lib/utils'
import { translationApi } from '@/api/client'
import { dailyIndex } from '@/lib/daily'
import {
  Languages, ArrowRight, Sparkles, CheckCircle2, Lightbulb, History,
  ChevronDown, ChevronRight, Shuffle, TrendingUp,
} from 'lucide-react'

type TabType = 'practice' | 'history'
type Direction = 'en-to-zh' | 'zh-to-en'

/** 素材库按主题分类，每题标注 temas，便于学生按题材挑选 */
const sampleTexts: Record<Direction, { text: string; theme: string }[]> = {
  'en-to-zh': [
    { theme: '科技伦理', text: 'The rapid advancement of artificial intelligence has raised profound ethical questions about the future of human employment.' },
    { theme: '生态环境', text: 'Climate change poses an unprecedented threat to biodiversity, particularly in fragile ecosystems such as coral reefs and Arctic tundra.' },
    { theme: '经济社会', text: 'The concept of universal basic income has gained traction as automation threatens to displace millions of workers globally.' },
    { theme: '教育理念', text: 'Education is not merely about the transmission of knowledge, but about cultivating the critical thinking and creativity that enable students to question what they are taught.' },
    { theme: '公共卫生', text: 'The pandemic exposed deep fractures in global health governance, revealing that no single nation can safeguard its population in isolation.' },
    { theme: '文化交流', text: 'Translation is never a purely linguistic exercise; it is an act of cultural mediation that shapes how one civilization perceives another.' },
    { theme: '城市治理', text: 'As cities expand, urban planners must reconcile the demand for economic growth with the imperative to preserve livable public space.' },
    { theme: '科学精神', text: 'Scientific progress depends not only on brilliant hypotheses but also on the willingness to abandon them when evidence proves them wrong.' },
    { theme: '老龄化社会', text: 'An ageing population places mounting pressure on pension systems, yet it also creates opportunities for innovations in healthcare and assistive technology.' },
    { theme: '媒体素养', text: 'In an age of information abundance, the ability to distinguish verified reporting from persuasive fabrication has become a civic necessity.' },
    { theme: '劳动权益', text: 'Gig economy workers often find themselves caught between the flexibility they value and the protections they lack.' },
    { theme: '数字隐私', text: 'Consumers routinely surrender personal data in exchange for convenience, seldom pausing to consider the long-term implications of that bargain.' },
  ],
  'zh-to-en': [
    { theme: '科技发展', text: '随着人工智能技术的飞速发展，越来越多的人开始关注其对传统就业市场的深远影响。' },
    { theme: '产业政策', text: '中国政府近年来大力推动新能源汽车产业的发展，已成为全球最大的电动汽车市场。' },
    { theme: '教育理念', text: '教育的本质不仅在于传授知识，更在于培养学生的批判性思维和创新能力。' },
    { theme: '文化传承', text: '非物质文化遗产的保护不应停留在静态的记录上，而应通过创造性的转化融入当代生活。' },
    { theme: '城市治理', text: '超大城市在追求经济效率的同时，必须为居民保留足够的公共空间与生态廊道。' },
    { theme: '社会保障', text: '完善的社会保障体系是社会稳定的基石，也是衡量一个国家文明程度的重要标尺。' },
    { theme: '绿色发展', text: '实现碳达峰与碳中和目标，需要产业结构、能源结构与消费模式的全方位变革。' },
    { theme: '科技创新', text: '基础研究是技术创新的源头活水，其价值往往需要数十年才能充分显现。' },
    { theme: '老龄化', text: '人口老龄化既带来了养老负担，也催生了银发经济这一新的增长点。' },
    { theme: '国际关系', text: '多边主义是应对全球性挑战的有效途径，任何国家都无法独善其身。' },
    { theme: '劳动权益', text: '保障劳动者的基本权益，不仅是法律的要求，更是社会公平正义的体现。' },
    { theme: '数字治理', text: '数据作为新型生产要素，其确权、流通与安全保护需要全新的制度设计。' },
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
  // 默认按当天日期从素材库取一题（每日自动换题，零成本）
  const [sampleIdx, setSampleIdx] = useState(() => dailyIndex(sampleTexts['en-to-zh'].length))
  const [sourceText, setSourceText] = useState(sampleTexts['en-to-zh'][dailyIndex(sampleTexts['en-to-zh'].length)].text)
  const [theme, setTheme] = useState(sampleTexts['en-to-zh'][dailyIndex(sampleTexts['en-to-zh'].length)].theme)
  const [userTranslation, setUserTranslation] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const bank = sampleTexts[direction]
  const themeOptions = Array.from(new Set(bank.map(s => s.theme)))

  const applySample = (idx: number) => {
    const s = bank[idx % bank.length]
    setSampleIdx(idx % bank.length)
    setSourceText(s.text)
    setTheme(s.theme)
    setUserTranslation('')
    setResult(null)
    setError('')
  }

  const switchDirection = () => {
    const newDir: Direction = direction === 'en-to-zh' ? 'zh-to-en' : 'en-to-zh'
    setDirection(newDir)
    const b = sampleTexts[newDir]
    const idx = dailyIndex(b.length)
    setSampleIdx(idx)
    setSourceText(b[idx].text)
    setTheme(b[idx].theme)
    setUserTranslation('')
    setResult(null)
    setError('')
  }

  const newSample = () => applySample(sampleIdx + 1)

  /** 随机换一题（避免总是顺序向后） */
  const randomSample = () => {
    if (bank.length <= 1) return applySample(0)
    let next = sampleIdx
    while (next === sampleIdx) next = Math.floor(Math.random() * bank.length)
    applySample(next)
  }

  /** 按题材筛选并换题 */
  const pickTheme = (t: string) => {
    setTheme(t)
    const idx = bank.findIndex(s => s.theme === t)
    if (idx >= 0) applySample(idx)
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  原文
                  {theme && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-normal">
                      {theme}
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={randomSample}
                    className="flex items-center gap-0.5 px-2 py-1 text-xs text-gray-400 hover:text-indigo-600 rounded transition-colors"
                    title="随机换一题"
                  >
                    <Shuffle className="w-3 h-3" />
                    随机
                  </button>
                  <button onClick={newSample} className="text-xs text-indigo-500 hover:text-indigo-600 px-2 py-1">
                    换一题 →
                  </button>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl min-h-[100px]">
                <p className="text-sm text-gray-800 leading-relaxed">{sourceText}</p>
              </div>
              {/* 题材筛选 */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                <span className="text-xs text-gray-400 shrink-0">题材：</span>
                {themeOptions.map(t => (
                  <button
                    key={t}
                    onClick={() => pickTheme(t)}
                    className={cn(
                      'px-2 py-0.5 text-xs rounded-full border transition-all',
                      theme === t
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                        : 'border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-500',
                    )}
                  >
                    {t}
                  </button>
                ))}
                <span className="text-xs text-gray-300 ml-1">共 {bank.length} 题</span>
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

            <p className="text-xs text-gray-400 mt-2 text-center">
              每次评分都会自动存入「历史记录」，之后可随时回看对比
            </p>
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
                  {result.optimal === true && (
                    <Badge variant="success">已达到无需改进的水准</Badge>
                  )}
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
              <p className="text-gray-300 text-xs mt-2">
                素材库现有 {bank.length} 题、{themeOptions.length} 类题材，每天自动更换
              </p>
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
  const [expanded, setExpanded] = useState<string | null>(null)
  // 按原文分组对照：同一句原文的多次尝试聚合展示
  const [groupMode, setGroupMode] = useState(false)

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

  /** 同一原文的多次翻译按时间正序聚为一组，便于对照进步 */
  const groups: { source: string; direction: string; items: any[] }[] = []
  for (const r of records) {
    const key = (r.source_text || '').trim()
    const g = groups.find(x => x.source === key && x.direction === r.direction)
    if (g) g.items.push(r)
    else groups.push({ source: key, direction: r.direction, items: [r] })
  }
  // 每组内按时间正序（最早 → 最近），体现"第 N 次"的顺序
  for (const g of groups) {
    g.items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  }

  const renderDetail = (r: any, attemptNo?: number) => {
    const scores = (() => {
      try {
        return typeof r.scores === 'string' ? JSON.parse(r.scores) : (r.scores || [])
      } catch {
        return []
      }
    })()
    return (
      <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="primary">第 {attemptNo ?? 1} 次尝试</Badge>
          <span className={cn('text-sm font-bold', getScoreColor(r.overall_score))}>
            {r.overall_score} 分
          </span>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">我的译文</div>
          <p className="text-sm text-gray-700 leading-relaxed p-2.5 bg-gray-50 rounded-lg whitespace-pre-wrap">
            {r.user_translation}
          </p>
        </div>

        {scores.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">维度评分</div>
            <div className="space-y-2">
              {scores.map((d: any, i: number) => (
                <div key={`${d.name}-${i}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-gray-600">{d.name}</span>
                    <span className={cn('text-xs font-bold', getScoreColor(d.score))}>{d.score}</span>
                  </div>
                  <Progress value={d.score} color={d.score >= 85 ? 'success' : d.score >= 70 ? 'primary' : 'warning'} />
                  {d.feedback && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{d.feedback}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {r.reference_translation && (
          <div>
            <div className="text-xs font-medium text-emerald-600 mb-1">参考译文</div>
            <p className="text-sm text-gray-700 leading-relaxed p-2.5 bg-emerald-50/60 rounded-lg">
              {r.reference_translation}
            </p>
          </div>
        )}

        {r.improvement_suggestions && (
          <div>
            <div className="text-xs font-medium text-amber-600 mb-1">改进建议</div>
            <p className="text-sm text-gray-600 leading-relaxed">{r.improvement_suggestions}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 视图切换 + 说明 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-gray-400">点击任意记录可展开查看完整译文、维度评分、参考译文与改进建议</p>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setGroupMode(false)}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-all',
              !groupMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500',
            )}
          >
            按时间
          </button>
          <button
            onClick={() => setGroupMode(true)}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-1',
              groupMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500',
            )}
          >
            <TrendingUp className="w-3 h-3" />
            按原文对照
          </button>
        </div>
      </div>

      {groupMode ? (
        <div className="space-y-4">
          {groups.map((g, gi) => {
            const first = g.items[0]?.overall_score ?? 0
            const last = g.items[g.items.length - 1]?.overall_score ?? 0
            const delta = last - first
            const open = expanded === `g-${gi}`
            return (
              <Card key={gi} hover>
                <CardContent className="pt-5">
                  <button
                    className="w-full text-left"
                    onClick={() => setExpanded(open ? null : `g-${gi}`)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={g.direction === 'en-to-zh' ? 'primary' : 'success'}>
                            {g.direction === 'en-to-zh' ? '英→中' : '中→英'}
                          </Badge>
                          <Badge variant="default">共 {g.items.length} 次尝试</Badge>
                          {g.items.length > 1 && (
                            <Badge variant={delta > 0 ? 'success' : delta < 0 ? 'danger' : 'default'}>
                              {delta > 0 ? `提升 ${delta} 分` : delta < 0 ? `下降 ${Math.abs(delta)} 分` : '持平'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{g.source}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className={cn('text-2xl font-bold', getScoreColor(last))}>{last}</div>
                          <div className="text-xs text-gray-400">最新得分</div>
                        </div>
                        {open
                          ? <ChevronDown className="w-4 h-4 text-gray-400" />
                          : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="space-y-3 mt-2">
                      <div className="p-3 bg-indigo-50/50 rounded-lg">
                        <div className="text-xs font-medium text-indigo-600 mb-1">原文</div>
                        <p className="text-sm text-gray-700 leading-relaxed">{g.source}</p>
                      </div>
                      {g.items.map((r: any, i: number) => (
                        <div key={r.id} className="p-3 border border-gray-100 rounded-xl">
                          <div className="text-xs text-gray-400 mb-1">{formatDate(r.created_at)}</div>
                          {renderDetail(r, i + 1)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((r: any) => {
            const open = expanded === r.id
            return (
              <Card key={r.id} hover>
                <CardContent className="pt-5">
                  <button
                    className="w-full text-left"
                    onClick={() => setExpanded(open ? null : r.id)}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={r.direction === 'en-to-zh' ? 'primary' : 'success'}>
                            {r.direction === 'en-to-zh' ? '英→中' : '中→英'}
                          </Badge>
                          <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-1">{r.source_text}</p>
                        {r.user_translation && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">我的译文：{r.user_translation}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {r.overall_score && (
                          <div className={cn('text-2xl font-bold', getScoreColor(r.overall_score))}>{r.overall_score}</div>
                        )}
                        {open
                          ? <ChevronDown className="w-4 h-4 text-gray-400" />
                          : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                  </button>
                  {open && renderDetail(r)}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
