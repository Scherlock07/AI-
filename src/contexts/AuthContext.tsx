import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authApi, setToken, clearToken, getToken } from '@/api/client'
import type { User } from '@/types'

interface AuthUser {
  id: string
  username: string
  display_name: string
  email: string
  role: string
  avatar: string
  level: string
  total_points: number
  streak: number
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (data: { username: string; email: string; password: string; display_name: string; role?: string }) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (token) {
      authApi.getMe()
        .then((data: any) => {
          setUser({
            id: data.id,
            username: data.username,
            display_name: data.display_name || data.username,
            email: data.email,
            role: data.role,
            avatar: data.avatar || '🦉',
            level: data.level || 'intermediate',
            total_points: data.total_points || 0,
            streak: data.streak || 0,
          })
        })
        .catch(() => {
          clearToken()
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username: string, password: string) => {
    const data: any = await authApi.login(username, password)
    setToken(data.access_token)
    setUser({
      id: data.user.id,
      username: data.user.username,
      display_name: data.user.display_name || data.user.username,
      email: data.user.email,
      role: data.user.role,
      avatar: data.user.avatar || '🦉',
      level: data.user.level || 'intermediate',
      total_points: data.user.total_points || 0,
      streak: data.user.streak || 0,
    })
  }

  const register = async (data: { username: string; email: string; password: string; display_name: string; role?: string }) => {
    const res: any = await authApi.register(data)
    setToken(res.access_token)
    setUser({
      id: res.user.id,
      username: res.user.username,
      display_name: res.user.display_name || res.user.username,
      email: res.user.email,
      role: res.user.role,
      avatar: res.user.avatar || '🦉',
      level: res.user.level || 'intermediate',
      total_points: res.user.total_points || 0,
      streak: res.user.streak || 0,
    })
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
