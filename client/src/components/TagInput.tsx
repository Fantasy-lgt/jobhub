import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { PillColor } from './Pill'

export interface TagInputProps {
  value: string[]
  onChange: (next: string[]) => void
  /** 可选快捷建议（可点击添加，也可自定义输入）。 */
  suggestions?: string[]
  /** 最多标签数，达到后禁止再添加。 */
  max?: number
  placeholder?: string
  color?: PillColor
  ariaLabel?: string
}

/** 多选标签输入：既有标签可删，回车/逗号添加，Backspace 删最后一个，支持建议快捷添加。 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  max,
  placeholder = '输入后回车添加',
  color = 'brand',
  ariaLabel,
}: TagInputProps) {
  const [text, setText] = useState('')
  const atMax = max !== undefined && value.length >= max

  const add = (raw: string): void => {
    const v = raw.trim()
    if (!v || atMax || value.includes(v)) return
    onChange([...value, v])
    setText('')
  }

  const remove = (index: number): void => {
    onChange(value.filter((_, i) => i !== index))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(text)
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      remove(value.length - 1)
    }
  }

  return (
    <div className="jh-tags">
      {value.map((v, i) => (
        <span key={`${v}-${i}`} className={`jh-tag jh-tag--${color}`}>
          {v}
          <button
            type="button"
            className="jh-tag__x"
            onClick={() => remove(i)}
            aria-label={`删除 ${v}`}
          >
            ×
          </button>
        </span>
      ))}
      {!atMax && (
        <input
          className="jh-tag-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(text)}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-label={ariaLabel}
        />
      )}
      {suggestions.length > 0 && (
        <div className="jh-tag-suggestions">
          {suggestions
            .filter((s) => !value.includes(s))
            .map((s) => (
              <button
                key={s}
                type="button"
                className="jh-tag-add"
                onClick={() => add(s)}
                disabled={atMax}
              >
                ＋ {s}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
