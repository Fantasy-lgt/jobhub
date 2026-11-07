import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ConfirmDialog } from '../../components'
import {
  authApi,
  exportApi,
  importApi,
  IMPORT_STAT_KEYS,
  IMPORT_STAT_LABEL,
  type ImportPayloadData,
  type ImportResult,
  type ImportMode,
} from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'

/** 导入结果汇总：新增 / 更新 / 跳过 的总数 + 分节明细（只列 >0 的）。 */
function ImportStatSummary({ result }: { result: ImportResult }) {
  const sumOf = (group: 'created' | 'updated' | 'skipped'): number =>
    IMPORT_STAT_KEYS.reduce((n, k) => n + result[group][k], 0)

  const rows = (group: 'created' | 'updated' | 'skipped') =>
    IMPORT_STAT_KEYS.filter((k) => result[group][k] > 0).map((k) => (
      <span key={`${group}-${k}`} style={{ fontSize: 12, color: 'var(--sub)' }}>
        {IMPORT_STAT_LABEL[k]} {result[group][k]}
      </span>
    ))

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: '1px dashed var(--muted)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <b style={{ color: 'var(--green)' }}>新增 {sumOf('created')}</b>
        <b style={{ color: 'var(--blue)' }}>更新 {sumOf('updated')}</b>
        <b style={{ color: 'var(--muted)' }}>跳过 {sumOf('skipped')}</b>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{rows('created')}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{rows('updated')}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{rows('skipped')}</div>
    </div>
  )
}

/** 设置：外观 / 账号 / 离线导出 / 导入数据 / 修改密码。AI Key 只在后端配置，前端不接触。 */
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

  // 导入相关状态
  const [fileName, setFileName] = useState('')
  const [fileData, setFileData] = useState<ImportPayloadData | null>(null)
  const [parseErr, setParseErr] = useState('')
  const [dryResult, setDryResult] = useState<ImportResult | null>(null)
  const [running, setRunning] = useState(false) // 演练中
  const [writing, setWriting] = useState(false) // 实写中
  const [confirmReplace, setConfirmReplace] = useState(false) // 覆盖写二次确认

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    // 允许重复选择同一文件：重置后再触发 onChange
    e.target.value = ''
    if (!file) return
    setParseErr('')
    setDryResult(null)
    setFileData(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as ImportPayloadData
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('文件根节点必须是 JSON 对象（如导出备份的结构）')
      }
      setFileName(file.name)
      setFileData(parsed)
    } catch (err) {
      setFileName('')
      const msg = err instanceof Error ? err.message : '无法读取文件'
      setParseErr(msg)
      pushToast({ message: `文件解析失败：${msg}`, kind: 'error' })
    }
  }

  const handleDryRun = async (): Promise<void> => {
    if (!fileData) return
    setRunning(true)
    try {
      const result = await importApi.dryRun(fileData)
      setDryResult(result)
      if (result.errors.length > 0) {
        pushToast({ message: `演练发现 ${result.errors.length} 处问题，请先修正`, kind: 'error' })
      } else {
        pushToast({ message: '演练通过，可写入', kind: 'success' })
      }
    } catch (err) {
      // 网络/401 等已由 importApi 抛出文案
      pushToast({
        message: err instanceof Error ? err.message : '演练失败',
        kind: 'error',
      })
    } finally {
      setRunning(false)
    }
  }

  const handleRun = async (mode: ImportMode): Promise<void> => {
    if (!fileData || !dryResult || dryResult.errors.length > 0) return
    setWriting(true)
    try {
      const result = await importApi.run({ mode, data: fileData })
      setDryResult(result)
      pushToast({ message: mode === 'replace' ? '已覆盖写入' : '已追加写入', kind: 'success' })
    } catch (err) {
      pushToast({
        message: err instanceof Error ? err.message : '写入失败',
        kind: 'error',
      })
    } finally {
      setWriting(false)
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

  const hasErrors = dryResult !== null && dryResult.errors.length > 0

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
            文件名带导出日期。需要恢复时到下方「导入数据」卡片操作。
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
          <div className="jh-sec-title">📥 导入数据</div>
          <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 10, lineHeight: 1.8 }}>
            把此前导出的离线 JSON 重新导入。默认先「演练」预览将要写入的内容与问题，确认无误后
            再选择「追加」（按业务键去重）或「覆盖」（清空现有业务数据后全量写入）实写。
          </div>

          <label
            className="jh-btn jh-btn--secondary jh-btn--md"
            style={{ marginTop: 14, display: 'inline-flex', cursor: 'pointer' }}
          >
            📂 选择 JSON 文件
            <input
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => void handleFileChange(e)}
            />
          </label>

          {fileName ? (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              已选择：<b>{fileName}</b>
              <Button
                variant="secondary"
                size="sm"
                style={{ marginLeft: 10 }}
                loading={running}
                onClick={() => void handleDryRun()}
              >
                🔍 演练
              </Button>
            </div>
          ) : null}

          {parseErr ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                color: 'var(--pink)',
                lineHeight: 1.7,
              }}
            >
              ⚠️ {parseErr}
            </div>
          ) : null}

          {dryResult ? (
            <div style={{ marginTop: 12 }}>
              {hasErrors ? (
                <div
                  style={{
                    padding: 12,
                    border: '1px solid var(--pink)',
                    borderRadius: 10,
                    background: 'color-mix(in srgb, var(--pink) 8%, transparent)',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--pink)', marginBottom: 8 }}>
                    ⚠️ 演练发现 {dryResult.errors.length} 处问题（未写入，请修正后重试）
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
                    {dryResult.errors.map((err, i) => (
                      <li key={i}>
                        <code style={{ color: 'var(--pink)' }}>{err.path}</code>：{err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <ImportStatSummary result={dryResult} />
                  {dryResult.warnings.length > 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.7 }}>
                      {dryResult.warnings.map((w, i) => (
                        <div key={i}>ℹ️ {w}</div>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={writing}
                      onClick={() => void handleRun('append')}
                    >
                      ＋ 写入（追加）
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={writing}
                      onClick={() => setConfirmReplace(true)}
                    >
                      ♻️ 覆盖写入
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
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

      <ConfirmDialog
        open={confirmReplace}
        title="覆盖写入"
        description="覆盖会先清空现有岗位 / 面试 / 题库 / Offer / 复盘 / 打卡等业务数据（不含账号与路线图模板），再全量写入文件内容。此操作不可恢复，确定继续吗？"
        confirmText="确认覆盖"
        danger
        onConfirm={() => {
          setConfirmReplace(false)
          void handleRun('replace')
        }}
        onCancel={() => setConfirmReplace(false)}
      />
    </div>
  )
}
