/**
 * 后端 API 客户端
 * 统一管理所有后端接口调用
 */

// 自动适配：开发环境用当前主机名，生产环境用 VITE_API_BASE 环境变量
const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : (import.meta.env.VITE_API_BASE || '')

// ========== Token 管理 ==========

let accessToken: string | null = localStorage.getItem('access_token')

export function setToken(token: string) {
  accessToken = token
  localStorage.setItem('access_token', token)
}

export function clearToken() {
  accessToken = null
  localStorage.removeItem('access_token')
}

export function getToken(): string | null {
  return accessToken
}

// ========== 请求封装 ==========

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (resp.status === 401) {
    clearToken()
    throw new Error('未登录或登录已过期')
  }

  if (!resp.ok) {
    let msg = `请求失败 (${resp.status})`
    try {
      const err = await resp.json()
      msg = err.detail || err.message || msg
    } catch {}
    throw new Error(msg)
  }

  return resp.json()
}

// ========== 认证 API ==========

export const authApi = {
  register: (data: { username: string; email: string; password: string; display_name: string; role?: string }) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (username: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getMe: () => request('/api/auth/me'),
}

// ========== 听力模块 API ==========

export const listeningApi = {
  listMaterials: () => request('/api/listening/materials'),

  generate: (data: { topic: string; accent: string; speed: number; difficulty: string; duration: number }) =>
    request('/api/listening/generate', { method: 'POST', body: JSON.stringify(data) }),

  import: (data: { title: string; topic: string; content: string; difficulty: string }) =>
    request('/api/listening/import', { method: 'POST', body: JSON.stringify(data) }),

  getMaterial: (id: string) => request(`/api/listening/${id}`),

  uploadAudio: (id: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request(`/api/listening/upload-audio/${id}`, { method: 'POST', body: formData })
  },
}

// ========== 口语模块 API ==========

export const speakingApi = {
  evaluate: (data: { type: string; topic: string; transcript?: string; audio_base64?: string; reference_text?: string }) =>
    request('/api/speaking/evaluate', { method: 'POST', body: JSON.stringify(data) }),

  listRecords: () => request('/api/speaking/records'),

  // 讨论主题推荐
  recommendTopics: (data: { category: string; difficulty: string; count: number }) =>
    request('/api/speaking/recommend-topics', { method: 'POST', body: JSON.stringify(data) }),

  // 讨论房间 — 创建
  createRoom: (data: {
    topic: string
    description?: string
    max_participants?: number
    ai_count?: number
    language?: string
    difficulty?: string
    category?: string
  }) => request('/api/speaking/rooms', { method: 'POST', body: JSON.stringify(data) }),

  // 讨论广场 — 列出房间
  listRooms: (params?: { status?: string; category?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.category) query.set('category', params.category)
    if (params?.search) query.set('search', params.search)
    const qs = query.toString()
    return request(`/api/speaking/rooms${qs ? '?' + qs : ''}`)
  },

  // 获取房间详情
  getRoom: (roomId: string) => request(`/api/speaking/rooms/${roomId}`),

  // 加入房间
  joinRoom: (roomId: string) =>
    request(`/api/speaking/rooms/${roomId}/join`, { method: 'POST' }),

  // 离开房间
  leaveRoom: (roomId: string) =>
    request(`/api/speaking/rooms/${roomId}/leave`, { method: 'POST' }),

  // 关闭房间（仅房主）
  closeRoom: (roomId: string) =>
    request(`/api/speaking/rooms/${roomId}`, { method: 'DELETE' }),

  // 获取房间消息
  getMessages: (roomId: string) =>
    request(`/api/speaking/rooms/${roomId}/messages`),

  // 发送消息
  sendMessage: (roomId: string, content: string) =>
    request(`/api/speaking/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),

  // AI讨论者回复
  aiReply: (roomId: string, data: { ai_name?: string; ai_persona?: string }) =>
    request(`/api/speaking/rooms/${roomId}/ai-reply`, { method: 'POST', body: JSON.stringify(data) }),

  // 邀请用户
  inviteUser: (roomId: string, username: string) =>
    request(`/api/speaking/rooms/${roomId}/invite`, { method: 'POST', body: JSON.stringify({ username }) }),

  // 搜索用户
  searchUsers: (q: string) =>
    request(`/api/speaking/users/search?q=${encodeURIComponent(q)}`),

  // 轮流发言
  nextSpeaker: (roomId: string) =>
    request(`/api/speaking/rooms/${roomId}/next-speaker`, { method: 'POST' }),
}

// ========== 阅读模块 API ==========

export const readingApi = {
  listTexts: () => request('/api/reading/texts'),

  import: (data: { title: string; source: string; content: string; difficulty: string }) =>
    request('/api/reading/import', { method: 'POST', body: JSON.stringify(data) }),

  analyze: (content: string, difficulty: string = 'intermediate') =>
    request('/api/reading/analyze', { method: 'POST', body: JSON.stringify({ content, difficulty }) }),

  analyzeAndSave: (textId: string) =>
    request(`/api/reading/${textId}/analyze`, { method: 'POST' }),

  getText: (id: string) => request(`/api/reading/${id}`),
}

// ========== 写作模块 API ==========

export const writingApi = {
  submit: (data: { title: string; type: string; prompt: string; content: string }) =>
    request('/api/writing/submit', { method: 'POST', body: JSON.stringify(data) }),

  grade: (data: { content: string; type: string; prompt: string; title?: string }) =>
    request('/api/writing/grade', { method: 'POST', body: JSON.stringify(data) }),

  ocr: (image_base64: string) =>
    request('/api/writing/ocr', { method: 'POST', body: JSON.stringify({ image_base64 }) }),

  listSubmissions: () => request('/api/writing/submissions'),

  getSubmission: (id: string) => request(`/api/writing/submissions/${id}`),
}

// ========== 词汇与语法 API ==========

export const vocabularyApi = {
  listWords: () => request('/api/vocabulary/words'),

  getReviewWords: () => request('/api/vocabulary/words/review'),

  addWord: (data: { word: string; phonetic?: string; part_of_speech?: string; definition?: string; example?: string; context?: string }) =>
    request('/api/vocabulary/words', { method: 'POST', body: JSON.stringify(data) }),

  reviewWord: (wordId: string, isCorrect: boolean) =>
    request(`/api/vocabulary/words/${wordId}/review`, { method: 'POST', body: JSON.stringify({ word_id: wordId, is_correct: isCorrect }) }),

  deleteWord: (wordId: string) =>
    request(`/api/vocabulary/words/${wordId}`, { method: 'DELETE' }),

  // 词根分析
  rootAnalysis: (word: string) =>
    request('/api/vocabulary/root-analysis', { method: 'POST', body: JSON.stringify({ word }) }),

  // 语法练习
  generateGrammar: (data: { grammar_point?: string; type: string; difficulty: string; count: number }) =>
    request('/api/vocabulary/grammar/generate', { method: 'POST', body: JSON.stringify(data) }),

  answerGrammar: (exerciseId: string, answer: string) =>
    request(`/api/vocabulary/grammar/${exerciseId}/answer?answer=${encodeURIComponent(answer)}`, { method: 'POST' }),

  // 错题本
  listWrongAnswers: () => request('/api/vocabulary/wrong-answers'),

  markReviewed: (itemId: string) =>
    request(`/api/vocabulary/wrong-answers/${itemId}/reviewed`, { method: 'PUT' }),
}

// ========== 翻译模块 API ==========

export const translationApi = {
  grade: (data: { source_text: string; user_translation: string; direction: string }) =>
    request('/api/translation/grade', { method: 'POST', body: JSON.stringify(data) }),

  listRecords: () => request('/api/translation/records'),
}

// ========== 社区模块 API ==========

export const communityApi = {
  // 学习小组
  listGroups: () => request('/api/community/groups'),

  createGroup: (data: { name: string; description?: string; category?: string; max_members?: number }) =>
    request('/api/community/groups', { method: 'POST', body: JSON.stringify(data) }),

  joinGroup: (groupId: string) =>
    request(`/api/community/groups/${groupId}/join`, { method: 'POST' }),

  // 排行榜
  getLeaderboard: () => request('/api/community/leaderboard'),

  // 成就
  getAchievements: () => request('/api/community/achievements'),
}

// ========== 教师后台 API ==========

export const teacherApi = {
  createClass: (name: string, description: string = '') =>
    request(`/api/teacher/classes?name=${encodeURIComponent(name)}&description=${encodeURIComponent(description)}`, { method: 'POST' }),

  listClasses: () => request('/api/teacher/classes'),

  listStudents: (classId: string) => request(`/api/teacher/classes/${classId}/students`),

  classStats: (classId: string) => request(`/api/teacher/classes/${classId}/stats`),

  createAssignment: (data: { class_id: string; title: string; description: string; module: string; difficulty?: string; due_date?: string }) => {
    const params = new URLSearchParams({
      class_id: data.class_id,
      title: data.title,
      description: data.description,
      module: data.module,
      difficulty: data.difficulty || 'intermediate',
    })
    if (data.due_date) params.set('due_date', data.due_date)
    return request(`/api/teacher/assignments?${params}`, { method: 'POST' })
  },

  listAssignments: (classId: string) => request(`/api/teacher/assignments/${classId}`),
}

// ========== 学习档案与 AI 助教 API ==========

export const profileApi = {
  getStats: () => request('/api/profile/stats'),

  getRecentActivities: () => request('/api/profile/recent-activities'),

  getLearningPath: () => request('/api/profile/learning-path'),

  // AI 助教
  askAssistant: (message: string, context: string = '') =>
    request(`/api/profile/ai-assistant?message=${encodeURIComponent(message)}&context=${encodeURIComponent(context)}`, { method: 'POST' }),
}

// ========== 导出 ==========

export default {
  auth: authApi,
  listening: listeningApi,
  speaking: speakingApi,
  reading: readingApi,
  writing: writingApi,
  vocabulary: vocabularyApi,
  translation: translationApi,
  community: communityApi,
  teacher: teacherApi,
  profile: profileApi,
}
