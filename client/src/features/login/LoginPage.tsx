import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '../../components'
import { useAuthStore } from '../../stores/auth'

/** 登录页：未登录自动跳到这；登录成功（authed 变 true）自动跳回概览。 */
export function LoginPage() {
  const authed = useAuthStore((s) => s.authed)
  const loading = useAuthStore((s) => s.loading)
  const login = useAuthStore((s) => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      </div>
    )
  }
  if (authed) {
    return <Navigate to="/" replace />
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await login(username.trim(), password)
      // authed 翻 true 后，上方 <Navigate> 会自动跳转，无需手动 navigate
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="jh-login-wrap">
      <form className="jh-login-card" onSubmit={submit}>
        <div className="jh-login-logo">
          <span aria-hidden>💼</span> JobHub
        </div>
        <div className="jh-login-slogan">个人求职工作台 · 把每一步投递都走扎实</div>

        <label className="jh-label" htmlFor="login-username">
          用户名
        </label>
        <input
          id="login-username"
          className="jh-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          placeholder="admin"
        />

        <label className="jh-label" htmlFor="login-password">
          密码
        </label>
        <input
          id="login-password"
          type="password"
          className="jh-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
        />

        {error ? <div className="jh-field__err">{error}</div> : null}

        <Button variant="primary" size="lg" type="submit" loading={submitting} disabled={submitting}>
          登录
        </Button>

        <div className="jh-login-hint">账号与口令由服务端配置，请妥善保管</div>
      </form>
    </div>
  )
}
