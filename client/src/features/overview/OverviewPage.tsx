import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { overviewApi } from '../../api/endpoints'
import { Card, ProgressBar, ErrorRetry } from '../../components'
import type { ProgressColor } from '../../components'
import type { OverviewData, WeekCell, TodoType } from '../../types'

/** 待办类型 → 圆点配色（纯展示，映射只写在这一处）。 */
const TODO_DOT_COLOR: Record<TodoType, string> = {
  follow_up: 'var(--amber)',
  prepare_interview: 'var(--blue)',
  offer_deadline: 'var(--green)',
  review_due: 'var(--pink)',
  checkin: 'var(--green)',
  resume: 'var(--brand)',
  target: 'var(--brand-2)',
}

/** 待办类型 → 目标路由：箭头 `›` 必须真的能跳，否则就是误导。 */
const TODO_ROUTE: Record<TodoType, string> = {
  follow_up: '/apps', // 跟进岗位 → 岗位池
  prepare_interview: '/interviews', // 准备面试 → 面试复盘
  offer_deadline: '/offers', // Offer 截止 → Offer 决策
  review_due: '/qbank', // 该做复盘 → 题库（失分点 / 弱点）
  checkin: '/roadmap', // 今日打卡 → 路线图（本期标注「未开放」）
  resume: '/profile', // 简历 → 求职定位（含简历管理）
  target: '/profile', // 目标推进 → 求职定位
}

interface WeekCellProps {
  label: string
  cell: WeekCell
  max: number
  color: ProgressColor
}

function WeekCellCard({ label, cell, max, color }: WeekCellProps) {
  const diff = cell.now - cell.last
  return (
    <div>
      <div className="jh-week-cell__top">
        <span>{label}</span>
        <span>
          {cell.now}/{max}
        </span>
      </div>
      <ProgressBar value={cell.now} max={max} color={color} label={`${label}进度`} />
      <div className="jh-week-cell__diff">
        {diff >= 0 ? `▲ 较上周 +${diff}` : `▼ 较上周 ${diff}`}
      </div>
    </div>
  )
}

/** 概览页：Hero（阶段徽章 + 今日提示）+ 4 指标 + 今天要做 + 本周节奏 + 冲刺进度。 */
export function OverviewPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useQuery<OverviewData>({
    queryKey: ['overview'],
    queryFn: overviewApi.get,
  })

  if (isLoading) {
    return (
      <div className="jh-loading">
        <span className="jh-spinner" aria-hidden /> 加载中…
      </div>
    )
  }
  if (isError || !data) {
    return <ErrorRetry onRetry={() => void refetch()} />
  }

  const { hero, metrics, todos, week, sprint } = data

  return (
    <div className="jh-page">
      {/* Hero */}
      <div className="jh-hero">
        <div className="jh-hero__greet">
          {hero.greeting}
          <span className="jh-hero__badge">{hero.stage_label}</span>
        </div>
        <div className="jh-hero__slogan">{hero.slogan}</div>
        <div className="jh-hero__today">💡 {hero.today_tip}</div>
        <div className="jh-hero__actions">
          <Link className="jh-btn jh-btn--md" to="/apps">
            ＋ 记一个新岗位
          </Link>
          <Link className="jh-btn jh-btn--md" to="/profile">
            改定位
          </Link>
        </div>
      </div>

      {/* 4 指标卡 */}
      <div className="jh-block">
        <div className="jh-grid jh-grid--4">
          <div className="jh-kpi">
            <div className="jh-kpi__ic">🗂️</div>
            <div className="jh-kpi__v">{metrics.active}</div>
            <div className="jh-kpi__l">在投岗位数</div>
            <div className="jh-kpi__x">不含已拒/已挂/已放弃与回收站</div>
          </div>
          <div className="jh-kpi">
            <div className="jh-kpi__ic">🎤</div>
            <div className="jh-kpi__v">{metrics.interviewing}</div>
            <div className="jh-kpi__l">面试中</div>
            <div className="jh-kpi__x">停在一面/二面/三面/HR 面</div>
          </div>
          <div className="jh-kpi">
            <div className="jh-kpi__ic">🎉</div>
            <div className="jh-kpi__v">{metrics.offers}</div>
            <div className="jh-kpi__l">Offer 数</div>
            <div className="jh-kpi__x">拿到过 Offer 的岗位</div>
          </div>
          <div className="jh-kpi">
            <div className="jh-kpi__ic">📈</div>
            <div className="jh-kpi__v">{metrics.hit_rate.rate}%</div>
            <div className="jh-kpi__l">面试命中率</div>
            <div className="jh-kpi__x">
              面试 ÷ 已投（{metrics.hit_rate.interviewed}/{metrics.hit_rate.applied}）
            </div>
          </div>
        </div>
      </div>

      {/* 今天要做 + 本周节奏 */}
      <div className="jh-block">
        <div className="jh-grid jh-grid--23">
          <Card>
            <div className="jh-sec-title">
              📌 今天要做 <span className="sub">按数据算出来的，不是鸡汤</span>
            </div>
            <div className="jh-todo-list">
              {todos.map((t) => (
                <button
                  key={t.id}
                  className="jh-todo"
                  onClick={() => navigate(TODO_ROUTE[t.type])}
                  aria-label={`${t.title}，前往对应模块`}
                >
                  <span className="jh-todo__dot" style={{ background: TODO_DOT_COLOR[t.type] }} aria-hidden />
                  <span className="jh-todo__tx">
                    <span className="jh-todo__t">{t.title}</span>
                    {t.note ? <span className="jh-todo__n">{t.note}</span> : null}
                  </span>
                  <span className="jh-todo__arrow" aria-hidden>
                    ›
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="jh-sec-title">
              📆 本周节奏 <span className="sub">每周比一次</span>
            </div>
            <div className="jh-week-grid">
              <WeekCellCard label="投递" cell={week.applications} max={10} color="brand" />
              <WeekCellCard label="面试" cell={week.interviews} max={3} color="green" />
              <WeekCellCard label="复盘" cell={week.reviews} max={3} color="amber" />
              <WeekCellCard label="打卡" cell={week.checkins} max={7} color="blue" />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
              进度条上限：投递 10 / 面试 3 / 复盘 3 / 打卡 7。差值对比上一周同口径。
            </div>
          </Card>
        </div>
      </div>

      {/* 冲刺进度 */}
      <div className="jh-block">
        <Card>
          <div className="jh-sec-title">
            🧱 冲刺进度 <span className="sub">路线图任务完成情况</span>
            <span style={{ marginLeft: 'auto' }}>
              <Link className="jh-btn jh-btn--ghost jh-btn--sm" to="/roadmap">
                看路线图（下一期开放）→
              </Link>
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              margin: '10px 0 8px',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <span>
              已完成 <b>{sprint.done}</b> / {sprint.total} 个任务
            </span>
            <span style={{ color: 'var(--muted)' }}>
              连续打卡 {sprint.streak.current} 天 · 最长 {sprint.streak.best} 天
            </span>
          </div>
          <ProgressBar value={sprint.done} max={sprint.total || 1} />
        </Card>
      </div>
    </div>
  )
}
