import { useId } from 'react'

export interface TrendPoint {
  label: string
  value: number
}

export interface TrendSeries {
  key: string
  name: string
  color: string
  points: TrendPoint[]
}

export interface TrendChartProps {
  series: TrendSeries[]
  height?: number
  onPointClick?: (seriesKey: string, index: number) => void
}

const W = 640
const PAD_L = 42
const PAD_R = 20
const PAD_T = 18
const PAD_B = 32

/** 手绘 SVG 趋势图（多线 + 可点选数据点）。viewBox 自适应宽度。 */
export function TrendChart({ series, height = 200, onPointClick }: TrendChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  if (series.length === 0) {
    return (
      <div className="jh-empty" style={{ padding: '20px 10px' }}>
        <div className="jh-empty__title" style={{ fontSize: 14 }}>
          暂无趋势数据
        </div>
      </div>
    )
  }

  const labels = series[0].points.map((p) => p.label)
  const allValues = series.flatMap((s) => s.points.map((p) => p.value))
  const maxV = Math.max(...allValues, 1)
  const innerW = W - PAD_L - PAD_R
  const innerH = height - PAD_T - PAD_B

  const xFor = (i: number): number =>
    labels.length <= 1 ? PAD_L + innerW / 2 : PAD_L + (innerW * i) / (labels.length - 1)
  const yFor = (v: number): number => PAD_T + innerH - (v / maxV) * innerH

  const buildPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const cur = pts[i]
      const mx = (prev.x + cur.x) / 2
      const my = (prev.y + cur.y) / 2 + (i % 2 === 0 ? 2 : -2) // 轻微手绘抖动
      d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)} ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`
    }
    return d
  }

  const gridLines = [0, 0.5, 1]

  return (
    <div className="jh-trend">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="趋势图">
        {/* 点阵横向网格 */}
        {gridLines.map((r) => {
          const y = PAD_T + innerH - r * innerH
          return (
            <g key={r}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke="var(--muted)"
                strokeWidth={1.5}
                strokeDasharray="3 6"
                opacity={0.5}
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--muted)"
              >
                {Math.round(maxV * r)}
              </text>
            </g>
          )
        })}

        {/* x 轴标签 */}
        {labels.map((lb, i) => (
          <text
            key={`${lb}-${i}`}
            x={xFor(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize={11}
            fill="var(--sub)"
          >
            {lb}
          </text>
        ))}

        {/* 各序列折线 + 数据点 */}
        {series.map((s) => {
          const pts = s.points.map((p, i) => ({ x: xFor(i), y: yFor(p.value) }))
          const pathId = `trend-${uid}-${s.key}`
          return (
            <g key={s.key}>
              <path
                d={buildPath(pts)}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pts.map((pt, i) => (
                <circle
                  key={i}
                  className="jh-trend__dot"
                  cx={pt.x}
                  cy={pt.y}
                  r={5}
                  fill={s.color}
                  stroke="var(--ink)"
                  strokeWidth={2}
                  tabIndex={onPointClick ? 0 : -1}
                  role={onPointClick ? 'button' : undefined}
                  aria-label={`${s.name} ${s.points[i].label}: ${s.points[i].value}`}
                  onClick={() => onPointClick?.(s.key, i)}
                />
              ))}
              {/* 渐变留白，供后续美化 */}
              <defs>
                <linearGradient id={pathId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              </defs>
            </g>
          )
        })}
      </svg>

      <div className="jh-trend__legend">
        {series.map((s) => (
          <span key={s.key} className="jh-trend__legend-item">
            <span className="jh-trend__swatch" style={{ background: s.color }} aria-hidden />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}
