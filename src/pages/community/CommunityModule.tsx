import { useState, useEffect } from 'react'
import { communityApi } from '@/api/client'
import { useToast } from '@/contexts/ToastContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton, ErrorState, EmptyState, LoadingSpinner } from '@/components/ui/Loading'
import { cn } from '@/lib/utils'
import {
  Users, Trophy, PenLine,
  Star, Award, Flame, UserPlus, Sparkles,
} from 'lucide-react'

type TabType = 'groups' | 'peer-review' | 'leaderboard' | 'achievements'

export function CommunityModule() {
  const [tab, setTab] = useState<TabType>('groups')

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">学习社区</h1>
        <p className="text-sm text-gray-400">学习小组 · 写作互评 · 排行榜 · 成就系统</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'groups' as TabType, label: '学习小组', icon: Users },
          { key: 'peer-review' as TabType, label: '写作互评', icon: PenLine },
          { key: 'leaderboard' as TabType, label: '排行榜', icon: Trophy },
          { key: 'achievements' as TabType, label: '成就', icon: Award },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'groups' && <GroupsView />}
      {tab === 'peer-review' && <PeerReviewView />}
      {tab === 'leaderboard' && <LeaderboardView />}
      {tab === 'achievements' && <AchievementsView />}
    </div>
  )
}

function GroupsView() {
  const { toast } = useToast()
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchGroups = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await communityApi.listGroups()
      const data = Array.isArray(res) ? res : (res.groups || res.items || [])
      setGroups(data)
    } catch (err: any) {
      setError(err.message || '加载学习小组失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGroups()
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await communityApi.createGroup({ name: newName, description: newDesc })
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
      fetchGroups()
    } catch (err: any) {
      setError(err.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async (groupId: string) => {
    try {
      await communityApi.joinGroup(groupId)
      toast('已成功加入小组', 'success')
      fetchGroups()
    } catch (err: any) {
      toast(err.message || '加入失败，请稍后重试', 'error')
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

  if (error && groups.length === 0) {
    return <ErrorState message={error} onRetry={fetchGroups} />
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100">
        <CardContent className="pt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">创建学习小组</h3>
              <p className="text-sm text-gray-400">与同学一起练习，共享题库，组内讨论</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)}><UserPlus className="w-4 h-4" />创建小组</Button>
        </CardContent>
      </Card>

      {showCreate && (
        <Card>
          <CardContent className="pt-5">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">小组名称</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="如：雅思口语冲刺组"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">小组描述</label>
                <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="简要描述小组目标和活动"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
              </div>
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? <LoadingSpinner size="sm" /> : null}
                {creating ? '创建中...' : '确认创建'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8 text-gray-300" />} title="暂无学习小组" desc="创建一个小组，邀请同学一起学习" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {groups.map((g) => (
            <Card key={g.id} hover>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">{g.name}</h3>
                    <p className="text-sm text-gray-400">{g.description || '暂无描述'}</p>
                  </div>
                  <Badge variant="default">{g.category || '通用'}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-300 to-purple-300 border-2 border-white flex items-center justify-center text-xs text-white">
                          {String.fromCharCode(64 + i)}
                        </div>
                      ))}
                    </div>
                    <span className="text-sm text-gray-400">{g.member_count || g.memberCount || 0}/{g.max_members || g.maxMembers || 10} 人</span>
                  </div>
                  {g.joined || g.is_member ? (
                    <Badge variant="success">已加入</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleJoin(g.id)}>加入</Button>
                  )}
                </div>
                <Progress value={((g.member_count || g.memberCount || 0) / (g.max_members || g.maxMembers || 10)) * 100} className="mt-3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function PeerReviewView() {
  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-100">
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <PenLine className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">写作互评</h3>
              <p className="text-sm text-gray-400">匿名互评同学作文，AI辅助评分引导，培养批判性思维</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>待评作文</CardTitle>
              <Badge variant="warning">0 篇</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<PenLine className="w-8 h-8 text-gray-300" />}
              title="暂无待评作文"
              desc="当同学提交作文后，将出现在这里"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <CardTitle>评阅指南</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { dim: '内容与切题', desc: '文章是否紧扣主题，论点是否明确' },
                { dim: '逻辑与结构', desc: '论证是否连贯，段落是否有序' },
                { dim: '语言表达', desc: '用词是否准确，句式是否多样' },
                { dim: '语法准确性', desc: '有无语法错误，时态是否一致' },
              ].map((g) => (
                <div key={g.dim} className="p-2 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium text-gray-700">{g.dim}</div>
                  <div className="text-xs text-gray-400">{g.desc}</div>
                </div>
              ))}
              <div className="p-3 bg-indigo-50 rounded-lg">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-indigo-600">AI辅助：</span>评阅时AI将提供参考评分和改进建议，帮助你给出更专业的评价。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function LeaderboardView() {
  const [rankings, setRankings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await communityApi.getLeaderboard()
      const data = Array.isArray(res) ? res : (res.leaderboard || res.items || [])
      setRankings(data)
    } catch (err: any) {
      setError(err.message || '加载排行榜失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (error && rankings.length === 0) {
    return <ErrorState message={error} onRetry={fetchLeaderboard} />
  }

  if (rankings.length === 0) {
    return (
      <EmptyState
        icon={<Trophy className="w-8 h-8 text-gray-300" />}
        title="暂无排行数据"
        desc="完成练习后即可参与排名"
      />
    )
  }

  return (
    <div className="space-y-4">
      {rankings.length >= 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {rankings.slice(0, 3).map((r, idx) => {
            const rank = r.rank || idx + 1
            const avatars = ['🥇', '🥈', '🥉']
            return (
              <Card key={idx} className={cn(
                'p-6 text-center',
                rank === 1 ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200' :
                rank === 2 ? 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200' :
                'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200'
              )}>
                <div className="text-4xl mb-2">{avatars[idx] || r.avatar || '👤'}</div>
                <div className={cn('text-2xl font-bold mb-1',
                  rank === 1 ? 'text-yellow-600' : rank === 2 ? 'text-gray-600' : 'text-orange-600')}>
                  #{rank}
                </div>
                <div className="font-medium text-gray-800">{r.display_name || r.name || r.username || '匿名'}</div>
                <div className="text-sm text-gray-400">{r.total_points || r.points || 0} 积分</div>
                {r.streak > 0 && (
                  <div className="flex items-center justify-center gap-1 mt-1 text-xs text-orange-500">
                    <Flame className="w-3 h-3" />{r.streak}天
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <CardTitle>总排行榜</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rankings.map((r, idx) => {
              const rank = r.rank || idx + 1
              return (
                <div key={idx} className={cn(
                  'flex items-center gap-4 p-3 rounded-xl transition-colors',
                  r.is_current_user ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'hover:bg-gray-50'
                )}>
                  <span className={cn('w-8 text-center font-bold',
                    rank <= 3 ? 'text-yellow-500' : 'text-gray-400')}>#{rank}</span>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-200 to-purple-200 flex items-center justify-center text-xl">
                    {r.avatar || '👤'}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-gray-800">{r.display_name || r.name || r.username || '匿名'}</span>
                    {r.is_current_user && <Badge variant="primary" className="ml-2">你</Badge>}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">{r.total_points || r.points || 0}</div>
                    <div className="text-xs text-gray-400">积分</div>
                  </div>
                  {r.streak > 0 && (
                    <div className="flex items-center gap-1 text-orange-500">
                      <Flame className="w-4 h-4" />
                      <span className="text-sm font-medium">{r.streak}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AchievementsView() {
  const [achievements, setAchievements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAchievements = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await communityApi.getAchievements()
      const data = Array.isArray(res) ? res : (res.achievements || res.items || [])
      setAchievements(data)
    } catch (err: any) {
      setError(err.message || '加载成就失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAchievements()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (error && achievements.length === 0) {
    return <ErrorState message={error} onRetry={fetchAchievements} />
  }

  if (achievements.length === 0) {
    return (
      <EmptyState
        icon={<Award className="w-8 h-8 text-gray-300" />}
        title="暂无成就"
        desc="通过练习和学习来解锁成就"
      />
    )
  }

  const unlocked = achievements.filter(a => a.unlocked_at || a.unlockedAt)

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-100">
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{unlocked.length}</div>
              <div className="text-sm text-gray-400">已解锁</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-600">{achievements.length}</div>
              <div className="text-sm text-gray-400">总成就</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{Math.round(unlocked.length / achievements.length * 100)}%</div>
              <div className="text-sm text-gray-400">完成率</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {achievements.map((a) => {
          const isUnlocked = a.unlocked_at || a.unlockedAt
          return (
            <Card key={a.id} className={cn('p-5 text-center', !isUnlocked && 'opacity-60')}>
              <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3',
                isUnlocked ? 'bg-gradient-to-br from-purple-100 to-indigo-100' : 'bg-gray-100 grayscale')}>
                {a.icon || '🏆'}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{a.title || a.name || '成就'}</h3>
              <p className="text-xs text-gray-400 mb-3">{a.description || ''}</p>
              {isUnlocked ? (
                <Badge variant="success"><Star className="w-3 h-3 inline mr-1" />已解锁</Badge>
              ) : (
                <div>
                  <Progress value={a.progress || 0} max={a.target || 100} className="mb-1" />
                  <span className="text-xs text-gray-400">{a.progress || 0} / {a.target || 100}</span>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
