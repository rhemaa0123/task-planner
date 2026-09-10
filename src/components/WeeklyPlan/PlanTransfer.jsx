import React, { useState, useEffect, useRef } from 'react'
import { encodePlan, decodePlan, materializePlan, formatWeekRange, weekLabel, fromISODate, toISODate } from '../../utils'

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

function WeekHeading({ eyebrow, weekStart }) {
  return (
    <>
      <div className="modal-eyebrow">{eyebrow}</div>
      <h2 className="modal-title">
        {weekLabel(weekStart)}
        <span className="modal-title-dates">{formatWeekRange(weekStart)}</span>
      </h2>
      <div className="modal-divider" />
    </>
  )
}

const countLabel = (n) => (n === 0 ? 'No tasks' : n === 1 ? '1 task' : `${n} tasks`)

export function CopyPlanDialog({ weekStart, projects, onClose }) {
  // Everything starts selected - the common case is copying the whole week
  const [selected, setSelected] = useState(() => new Set(projects.map(p => String(p.id))))
  const [fallbackCode, setFallbackCode] = useState('')
  const fallbackRef = useRef(null)
  useEscape(onClose)

  useEffect(() => {
    if (fallbackCode && fallbackRef.current) fallbackRef.current.select()
  }, [fallbackCode])

  const allSelected = selected.size === projects.length && projects.length > 0
  const chosen = projects.filter(p => selected.has(String(p.id)))
  const taskTotal = chosen.reduce((n, p) => n + (p.tasks || []).length, 0)

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      const key = String(id)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(projects.map(p => String(p.id))))
  }

  const handleCopy = async () => {
    const code = encodePlan(toISODate(weekStart), chosen)
    try {
      await navigator.clipboard.writeText(code)
      onClose({ copied: true, projects: chosen.length, tasks: taskTotal })
    } catch {
      // Clipboard is blocked outside a secure context - show the code instead
      setFallbackCode(code)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card wide" role="dialog" aria-label="Copy plan">
        <WeekHeading eyebrow="COPY PLAN" weekStart={weekStart} />

        {projects.length === 0 ? (
          <div className="transfer-empty">There are no projects in this week to copy.</div>
        ) : (
          <>
            <div className="transfer-list-head">
              <span className="eyebrow">PROJECTS</span>
              <button type="button" className="select-all-btn" onClick={toggleAll}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <ul className="transfer-list">
              {projects.map(p => {
                const id = String(p.id)
                return (
                  <li key={id}>
                    <label className="transfer-row">
                      <input
                        type="checkbox"
                        className="task-check"
                        checked={selected.has(id)}
                        onChange={() => toggle(p.id)}
                      />
                      <span className="transfer-name">{p.name || 'Untitled project'}</span>
                      <span className="transfer-count">{countLabel((p.tasks || []).length)}</span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <div className={`transfer-summary ${selected.size ? 'ok' : 'muted'}`}>
              {allSelected
                ? 'All projects are selected'
                : selected.size === 0
                  ? 'No projects selected'
                  : `${selected.size} of ${projects.length} projects selected`}
            </div>
          </>
        )}

        {fallbackCode && (
          <div className="transfer-fallback">
            <div className="transfer-hint">Copy this plan manually:</div>
            <textarea ref={fallbackRef} className="transfer-code" readOnly value={fallbackCode} rows={8} />
          </div>
        )}

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={() => onClose()}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleCopy}
            disabled={selected.size === 0}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}

export function PastePlanDialog({ weekStart, onPaste, onClose }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  useEscape(onClose)

  const trimmed = code.trim()
  const plan = trimmed ? decodePlan(trimmed) : null
  const invalid = trimmed.length > 0 && plan === null

  const handlePaste = async () => {
    if (!plan || busy) return
    setBusy(true)
    await onPaste(materializePlan(plan, toISODate(weekStart)), plan)
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card wide" role="dialog" aria-label="Paste plan">
        <WeekHeading eyebrow="PASTE PLAN" weekStart={weekStart} />

        <textarea
          className={`transfer-code input ${invalid ? 'invalid' : ''}`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder='Paste a plan here, e.g. { "format": "taskplanner.week.v1", … }'
          rows={8}
          autoFocus
        />

        <div className={`transfer-summary ${plan ? 'ok' : invalid ? 'bad' : 'muted'}`}>
          {plan
            ? `${plan.projectCount} ${plan.projectCount === 1 ? 'project' : 'projects'} · ${plan.taskCount} ${plan.taskCount === 1 ? 'task' : 'tasks'} from ${formatWeekRange(fromISODate(plan.weekStart))}`
            : invalid
              ? 'That is not a valid plan code'
              : 'Paste a code copied from another week'}
        </div>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handlePaste} disabled={!plan || busy}>
            {busy ? 'Pasting…' : 'Paste'}
          </button>
        </div>
      </div>
    </div>
  )
}
