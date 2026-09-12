import React, { useState } from 'react'
import { DIFFICULTY_LEVELS, difficultyLabel } from '../../utils'

// Three dots filled up to the level. The grid shows a unit's difficulty with
// these; hovering the row of dots names the level in a pill above them.
export function DifficultyDots({ level, className = '' }) {
  const label = difficultyLabel(level)
  return (
    <span className={`diff-dots static ${className}`} aria-label={`Difficulty: ${label}`}>
      {DIFFICULTY_LEVELS.map(d => (
        <i key={d.level} className={`diff-dot ${d.level <= level ? 'on' : ''}`} aria-hidden="true" />
      ))}
      <span className="diff-tip" aria-hidden="true">{label}</span>
    </span>
  )
}

// The same dots as buttons. The pill names whichever dot is under the cursor
// - what a click would set - rather than the level already chosen, so the
// three levels can be read off without clicking through them.
export function DifficultyPicker({ value, onChange, disabled }) {
  const [hover, setHover] = useState(null)
  const shown = hover ?? null
  return (
    <span
      className="diff-dots pick"
      role="radiogroup"
      aria-label="Difficulty"
      onMouseLeave={() => setHover(null)}
    >
      {DIFFICULTY_LEVELS.map(d => (
        <button
          key={d.level}
          type="button"
          role="radio"
          aria-checked={d.level === value}
          aria-label={d.label}
          className={`diff-dot ${d.level <= value ? 'on' : ''}`}
          disabled={disabled}
          onMouseEnter={() => setHover(d.level)}
          onFocus={() => setHover(d.level)}
          onBlur={() => setHover(null)}
          onClick={() => onChange(d.level)}
        />
      ))}
      <span className={`diff-tip ${shown ? 'show' : ''}`} aria-hidden="true">
        {difficultyLabel(shown ?? value)}
      </span>
    </span>
  )
}
