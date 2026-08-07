// ===== 核心类型定义 =====

export type ModuleType = 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary' | 'translation'

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'

export interface User {
  id: string
  name: string
  avatar: string
  level: DifficultyLevel
  totalPoints: number
  streak: number
  joinDate: string
}

export interface ScoreDimension {
  name: string
  score: number
  maxScore: number
  feedback: string
}

export interface WritingSubmission {
  id: string
  title: string
  type: 'chart' | 'argumentative' | 'creative' | 'imitation'
  content: string
  wordCount: number
  submittedAt: string
  scores: ScoreDimension[]
  overallScore: number
  aiFeedback: string
  revisedVersion?: string
  status: 'submitted' | 'reviewing' | 'completed'
}

export interface ListeningMaterial {
  id: string
  title: string
  topic: string
  accent: 'us' | 'uk' | 'au' | 'other'
  speed: number
  duration: number
  transcript: string
  source: 'ai-generated' | 'imported'
  difficulty: DifficultyLevel
  vocabulary: VocabularyItem[]
}

export interface SpeakingRecord {
  id: string
  type: 'presentation' | 'discussion' | 'conversation' | 'retelling' | 'classroom'
  topic: string
  duration: number
  audioUrl?: string
  transcript: string
  scores: ScoreDimension[]
  overallScore: number
  feedback: string
  referenceAnswer?: string
  createdAt: string
}

export interface ReadingText {
  id: string
  title: string
  source: string
  content: string
  difficulty: DifficultyLevel
  analysis?: TextAnalysis
  vocabulary: VocabularyItem[]
  translation?: string
  culturalNotes?: CulturalNote[]
}

export interface TextAnalysis {
  summary: string
  structure: LogicNode[]
  keyPoints: string[]
  difficultSentences: { sentence: string; analysis: string }[]
}

export interface LogicNode {
  id: string
  label: string
  type: 'main-idea' | 'argument' | 'evidence' | 'conclusion' | 'transition'
  children?: LogicNode[]
}

export interface VocabularyItem {
  id: string
  word: string
  phonetic: string
  partOfSpeech: string
  definition: string
  example: string
  context?: string
  rootAnalysis?: string
  reviewCount: number
  nextReview: string
  mastery: number // 0-100
}

export interface CulturalNote {
  id: string
  term: string
  explanation: string
  position: { start: number; end: number }
}

export interface GrammarExercise {
  id: string
  type: 'fill-blank' | 'multiple-choice' | 'error-correction' | 'sentence-transform'
  question: string
  options?: string[]
  answer: string
  explanation: string
  grammarPoint: string
}

export interface TranslationExercise {
  id: string
  sourceText: string
  direction: 'en-to-zh' | 'zh-to-en'
  referenceTranslation: string
  difficulty: DifficultyLevel
  tips: string[]
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlockedAt?: string
  progress: number
  target: number
}

export interface StudyGroup {
  id: string
  name: string
  description: string
  memberCount: number
  maxMembers: number
  category: string
  joined: boolean
}

export interface DiscussionRoom {
  id: string
  topic: string
  host: string
  participants: { id: string; name: string; isAI: boolean }[]
  currentSpeaker: string | null
  status: 'waiting' | 'active' | 'completed'
  maxParticipants: number
}

export interface LearningStats {
  totalStudyTime: number // minutes
  totalExercises: number
  weeklyProgress: { date: string; minutes: number; score: number }[]
  abilityRadar: { subject: string; score: number }[]
  weakPoints: string[]
  streak: number
}

export interface WrongAnswer {
  id: string
  module: ModuleType
  question: string
  userAnswer: string
  correctAnswer: string
  explanation: string
  addedAt: string
  reviewed: boolean
}
