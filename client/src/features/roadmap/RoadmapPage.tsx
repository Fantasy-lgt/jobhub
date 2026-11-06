import { Card, EmptyState } from '../../components'

/**
 * 冲刺路线图：本期只做「未开放」止血，不补 5 阶段任务/打卡/streak 的完整功能。
 * 用静态说明取代原来的 FeatureShell 假 CTA（点了只弹「M6 落地」toast）。
 */
export function RoadmapPage() {
  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">🧱 冲刺路线图</h1>
        <p className="jh-page-desc">5 阶段任务清单 + 每日打卡 + 连续 streak</p>
      </header>

      <Card>
        <EmptyState
          icon="🧱"
          title="冲刺路线图 · 下一期开放"
          description="5 阶段任务清单、每日打卡与连续 streak 将在下一期上线，本期不提供编辑与打卡入口。概览页的「冲刺进度」仍按现有数据展示，不受影响。"
          action={
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              该模块下一期开放，当前仅作占位
            </span>
          }
        />
      </Card>
    </div>
  )
}
