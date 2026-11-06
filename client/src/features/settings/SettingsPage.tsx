import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../../components'
import { authApi, exportApi } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'

/** 设置：外观 / 账号 / 离线导出 / 修改密码。AI Key 只在后端配置，前端不接触。 */
export function SettingsPage() {
  const navigate = useNavigate()
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const pushToast = useUiStore((s) => s.pushToast)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [exporting, setExporting] = useState(false)
  const [changing, setChanging] = useState(false)
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [pwdErr, setPwdErr] = useState('')

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    try {
      const filename = await exportApi.download()
      pushToast({ message: `已导出 ${filename}`, kind: 'success' })
    } catch (err) {
      pushToast({
        message: err instanceof Error ? err.message : '导出失败，请稍后重试',
        kind: 'error',
      })
    } finally {
      setExporting(false)
    }
  }

  const handleChangePassword = async (): Promise<void> => {
    if (!pwd.oldPassword) {
      setPwdErr('请输入原密码')
      return
    }
    if (pwd.newPassword.length < 6) {
      setPwdErr('新密码至少 6 位')
      return
    }
    if (pwd.newPassword !== pwd.confirm) {
      setPwdErr('两次输入的新密码不一致')
      return
    }
    setPwdErr('')
    setChanging(true)
    try {
      await authApi.changePassword({
        oldPassword: pwd.oldPassword,
        newPassword: pwd.newPassword,
      })
      pushToast({ message: '密码已修改，请重新登录', kind: 'success' })
      setPwd({ oldPassword: '', newPassword: '', confirm: '' })
      // 后端 pwd 绑定变化会使所有旧 token 立即失效，主动清态避免卡在「已登录但全 401」
      logout()
      navigate('/login', { replace: true })
    } catch {
      // 错误已由 http 层 toast
    } finally {
      setChanging(false)
    }
  }

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">⚙️ 设置</h1>
        <p className="jh-page-desc">偏好、账号与离线备份（AI Key 仅在服务端 .env 配置）</p>
      </header>

      <div className="jh-grid jh-grid--2">
        <Card>
          <div className="jh-sec-title">🎨 外观</div>
          <div style={{ marginTop: 12 }}>
            <button
              className={[
                'jh-theme-toggle',
                theme === 'dark' ? 'jh-theme-toggle--dark' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={toggleTheme}
              aria-label="切换浅色/深色主题"
            >
              <span>{theme === 'dark' ? '🌙 深色模式' : '☀️ 浅色模式'}</span>
              <span className="jh-theme-toggle__track">
                <span className="jh-theme-toggle__knob" />
              </span>
            </button>
          </div>
        </Card>

        <Card>
          <div className="jh-sec-title">👤 账号</div>
          <div style={{ fontSize: 14, marginTop: 12 }}>
            {user ? `已登录：${user.username}` : '未登录'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.7 }}>
            JWT 走 httpOnly cookie，前端无感携带；AI Key 不进浏览器。数据保存在服务器，支持跨设备访问。
          </div>
          <Button variant="danger" size="sm" style={{ marginTop: 14 }} onClick={() => logout()}>
            退出登录
          </Button>
        </Card>

        <Card>
          <div className="jh-sec-title">📦 导出全部数据</div>
          <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 10, lineHeight: 1.8 }}>
            把岗位、面试、题库、Offer、复盘等全部数据打包成一份离线 JSON 文件（不含登录凭据），
            文件名带导出日期。本期只支持导出，暂不支持导入恢复。
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.7 }}>
            数据保存在服务器上，导出仅用于你自己留一份离线备份，不会上传给第三方。
          </div>
          <Button
            variant="primary"
            style={{ marginTop: 14 }}
            loading={exporting}
            onClick={() => void handleExport()}
          >
            ⬇️ 导出全部数据（JSON）
          </Button>
        </Card>

        <Card>
          <div className="jh-sec-title">🔑 修改密码</div>
          <div className="jh-form" style={{ marginTop: 10 }}>
            <div className="jh-field">
              <label className="jh-label" htmlFor="jh-old-pwd">原密码</label>
              <input
                id="jh-old-pwd"
                className="jh-input"
                type="password"
                autoComplete="current-password"
                value={pwd.oldPassword}
                onChange={(e) => setPwd((p) => ({ ...p, oldPassword: e.target.value }))}
                placeholder="当前登录密码"
              />
            </div>
            <div className="jh-field">
              <label className="jh-label" htmlFor="jh-new-pwd">新密码</label>
              <input
                id="jh-new-pwd"
                className="jh-input"
                type="password"
                autoComplete="new-password"
                value={pwd.newPassword}
                onChange={(e) => setPwd((p) => ({ ...p, newPassword: e.target.value }))}
                placeholder="至少 6 位"
              />
            </div>
            <div className="jh-field">
              <label className="jh-label" htmlFor="jh-confirm-pwd">确认新密码</label>
              <input
                id="jh-confirm-pwd"
                className="jh-input"
                type="password"
                autoComplete="new-password"
                value={pwd.confirm}
                onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                placeholder="再输一次"
              />
              <span className="jh-field__hint">改密成功后所有旧会话失效，会自动退出并回到登录页。</span>
            </div>
            {pwdErr ? <div className="jh-field__err">{pwdErr}</div> : null}
            <Button
              variant="secondary"
              loading={changing}
              onClick={() => void handleChangePassword()}
            >
              保存新密码
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
