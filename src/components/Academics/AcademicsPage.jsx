import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { useScrollLock } from '../../hooks/useScrollLock'
import { PlusIcon, TrashIcon, SearchIcon } from '../icons'
import { DashedOutline } from '../Dash'
import { sortAssignments, termsOf, dueWords, formatDeadline } from '../../utils'

/* ============================================================
   Academics

   A term holds courses; a course holds assignments. That is the whole shape,
   and it is the first place in this app where one record points at another.

   The term is not a record. It is a string on each course, and the selector
   at the top of this page is a filter over the distinct ones — so naming a
   term costs nothing and a course is moved between terms by typing. There is
   no "create a semester" step standing between you and writing down a course.

   Nothing here is scheduled. An assignment has a due date and a day count,
   and it never becomes a task on the weekly board: the board is what you
   decided to do this week, a due date is a fact about the world, and keeping
   them apart is the same rule the monthly and yearly layers follow. What this
   page owes the rest of the app is one number per assignment — how long you
   have — and the home page reads exactly that.
   ============================================================ */

const TYPES = ['assignment', 'quiz', 'midterm', 'final', 'lab', 'reading', 'project', 'essay']
const STATUSES = [
  { id: 'todo', label: 'Not started' },
  { id: 'doing', label: 'In progress' },
  { id: 'submitted', label: 'Submitted' },
]
const COLOURS = [1, 2, 3, 4, 5, 6]

const courseLabel = (c) =>
  [c?.code, c?.name].filter(Boolean).join(' · ') || 'Untitled course'

/* ---- Course ---- */
function CourseDialog({ entry, terms, activeTerm, onSave, onClose }) {
  const [code, setCode] = useState(entry?.code || '')
  const [name, setName] = useState(entry?.name || '')
  const [term, setTerm] = useState(entry?.term || activeTerm || '')
  const [instructor, setInstructor] = useState(entry?.instructor || '')
  const [credits, setCredits] = useState(entry?.credits ?? '')
  const [room, setRoom] = useState(entry?.room || '')
  const [colour, setColour] = useState(entry?.colour || 1)

  useScrollLock()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // A code or a name — either one is enough to recognise a course by, and
  // insisting on both is how you end up with "COMP 2401 / COMP 2401"
  const valid = Boolean(code.trim() || name.trim())

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSave({ code, name, term, instructor, credits, room, colour })
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal-card" role="dialog" aria-label="Course" onSubmit={submit}>
        <div className="modal-eyebrow">{entry ? 'EDIT' : 'NEW'}</div>
        <h2 className="modal-title">{entry ? 'Edit course' : 'Add a course'}</h2>
        <div className="modal-divider" />

        <div className="field-row">
          <div className="field-col narrow wide-code">
            <label className="field-label" htmlFor="co-code">Code</label>
            <input
              id="co-code" type="text" className="field-input" value={code} autoFocus
              placeholder="COMP 2401" onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="co-name">Name</label>
            <input
              id="co-name" type="text" className="field-input" value={name}
              placeholder="Systems Programming" onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <label className="field-label" htmlFor="co-term">Term</label>
        <input
          id="co-term" type="text" className="field-input" value={term}
          placeholder="Fall 2026" list="co-terms"
          onChange={(e) => setTerm(e.target.value)}
        />
        <datalist id="co-terms">
          {terms.map((t) => <option key={t} value={t} />)}
        </datalist>

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="co-inst">Instructor</label>
            <input
              id="co-inst" type="text" className="field-input" value={instructor}
              placeholder="Optional" onChange={(e) => setInstructor(e.target.value)}
            />
          </div>
          <div className="field-col narrow">
            <label className="field-label" htmlFor="co-cred">Credits</label>
            <input
              id="co-cred" type="number" min="0" max="20" step="0.5"
              className="field-input" value={credits} placeholder="—"
              onChange={(e) => setCredits(e.target.value)}
            />
          </div>
        </div>

        <label className="field-label" htmlFor="co-room">Where</label>
        <input
          id="co-room" type="text" className="field-input" value={room}
          placeholder="Optional — a room, a building, a link"
          onChange={(e) => setRoom(e.target.value)}
        />

        <span className="field-label">Colour</span>
        <div className="colour-picker" role="radiogroup" aria-label="Course colour">
          {COLOURS.map((n) => (
            <button
              key={n} type="button" role="radio"
              aria-checked={colour === n} aria-label={`Colour ${n}`}
              className={`colour-dot c${n} ${colour === n ? 'selected' : ''}`}
              onClick={() => setColour(n)}
            />
          ))}
        </div>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!valid}>
            {entry ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ---- Assignment ----
   `due` is a plain ISO date and `dueTime` is separate and optional, because
   most things are due "Friday" and only some are due "Friday, 23:59". One
   datetime field would make you answer the second question every time in
   order to answer the first. */
function AssignmentDialog({ entry, courses, defaultCourse, onSave, onClose }) {
  const [title, setTitle] = useState(entry?.title || '')
  const [courseId, setCourseId] = useState(
    entry?.courseId || defaultCourse || courses[0]?.id || '',
  )
  const [type, setType] = useState(entry?.type || 'assignment')
  const [due, setDue] = useState(entry?.due || '')
  const [dueTime, setDueTime] = useState(entry?.dueTime || '')
  const [weight, setWeight] = useState(entry?.weight ?? '')
  const [status, setStatus] = useState(entry?.status || 'todo')
  const [note, setNote] = useState(entry?.note || '')

  useScrollLock()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = Boolean(title.trim() && courseId)

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSave({ title, courseId, type, due, dueTime, weight, status, note })
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal-card" role="dialog" aria-label="Assignment" onSubmit={submit}>
        <div className="modal-eyebrow">{entry ? 'EDIT' : 'NEW'}</div>
        <h2 className="modal-title">{entry ? 'Edit assignment' : 'Add an assignment'}</h2>
        <div className="modal-divider" />

        <label className="field-label" htmlFor="as-title">What</label>
        <input
          id="as-title" type="text" className="field-input" value={title} autoFocus
          placeholder="Assignment 3" onChange={(e) => setTitle(e.target.value)}
        />

        <label className="field-label" htmlFor="as-course">Course</label>
        <select
          id="as-course" className="field-input" value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{courseLabel(c)}</option>
          ))}
        </select>

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="as-type">Kind</label>
            <select
              id="as-type" className="field-input" value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field-col narrow">
            <label className="field-label" htmlFor="as-weight">Weight %</label>
            <input
              id="as-weight" type="number" min="0" max="100" className="field-input"
              value={weight} placeholder="—" onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>

        <div className="field-row sched-deadline-row">
          <div className="field-col">
            <label className="field-label" htmlFor="as-due">Due</label>
            <input
              id="as-due" type="date" className="field-input" value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div className="field-col narrow">
            <label className="field-label" htmlFor="as-time">Time</label>
            <input
              id="as-time" type="time" className="field-input" value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </div>
        </div>

        <label className="field-label" htmlFor="as-status">Status</label>
        <select
          id="as-status" className="field-input" value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        <label className="field-label" htmlFor="as-note">Note</label>
        <input
          id="as-note" type="text" className="field-input" value={note}
          placeholder="Optional" onChange={(e) => setNote(e.target.value)}
        />

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!valid}>
            {entry ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* Deleting a course takes its assignments with it, so it asks first. Every
   other delete here is one row and is not worth a dialog. */
function ConfirmDialog({ title, copy, action, onConfirm, onClose }) {
  useScrollLock()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" role="dialog" aria-label={title}>
        <div className="modal-eyebrow">CONFIRM</div>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-divider" />
        <p className="modal-copy">{copy}</p>
        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-danger" onClick={onConfirm}>{action}</button>
        </div>
      </div>
    </div>
  )
}

/* ---- One assignment ----
   Collapsed it is a line: course, title, when. Open it is that line plus its
   checklist, which is the part this page exists for — "Assignment 3" is not a
   plan, and the four things it breaks into are. */
function AssignmentRow({ row, course, open, onToggleOpen, onEdit }) {
  const {
    addChecklistItem, toggleChecklistItem, deleteChecklistItem,
    updateAssignment, deleteAssignment,
  } = useApp()
  const [draft, setDraft] = useState('')

  const list = row.checklist || []
  const { done, total } = row.progress
  const submitted = row.status === 'submitted'
  const overdue = !submitted && row.days != null && row.days < 0
  const soon = !submitted && row.days != null && row.days >= 0 && row.days <= 2

  const addItem = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    addChecklistItem(row.id, draft)
    setDraft('')
  }

  return (
    <li className={`asg ${submitted ? 'submitted' : ''} ${overdue ? 'overdue' : ''}`}>
      <div className="asg-main">
        <button
          type="button"
          className="asg-disclose"
          onClick={() => onToggleOpen(open ? null : row.id)}
          aria-expanded={open}
          aria-label={open ? 'Hide checklist' : 'Show checklist'}
        >
          <span className={`asg-caret ${open ? 'open' : ''}`} />
        </button>

        <span className={`course-chip c${course?.colour || 1}`} title={courseLabel(course)}>
          {course?.code || course?.name || '—'}
        </span>

        <span className="asg-text">
          <button type="button" className="asg-title" onClick={onEdit} title="Edit">
            {row.title || 'Untitled'}
          </button>
          <span className="asg-meta">
            {row.type}
            {row.weight != null && row.weight !== '' && <> · {row.weight}%</>}
            {row.note && <> · {row.note}</>}
          </span>
        </span>

        <span className="asg-due">
          {row.due ? formatDeadline(row.due) : 'no date'}
          {row.dueTime && <span className="asg-time">{row.dueTime}</span>}
        </span>

        {/* One reading per row: a submitted thing says so and stops, because
            how much of its checklist got ticked is no longer a question. */}
        {submitted ? (
          <span className="asg-when done">Submitted</span>
        ) : (
          <span className={`asg-when ${overdue ? 'late' : ''} ${soon ? 'soon' : ''}`}>
            {dueWords(row.days)}
          </span>
        )}

        <span className={`asg-count ${total && done === total ? 'full' : ''}`}>
          {done}/{total}
        </span>

        <button
          type="button"
          className="row-del"
          onClick={() => deleteAssignment(row.id)}
          aria-label={`Remove ${row.title || 'assignment'}`}
        >
          <TrashIcon />
        </button>
      </div>

      {open && (
        <div className="asg-body">
          {list.length > 0 && (
            <ul className="asg-list">
              {list.map((i) => (
                <li key={i.id} className={`asg-item ${i.done ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    className="task-check"
                    checked={!!i.done}
                    onChange={(e) => toggleChecklistItem(row.id, i.id, e.target.checked)}
                    aria-label={i.text}
                  />
                  <span className="asg-item-text">{i.text}</span>
                  <button
                    type="button"
                    className="row-del"
                    onClick={() => deleteChecklistItem(row.id, i.id)}
                    aria-label={`Remove ${i.text}`}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className="asg-add" onSubmit={addItem}>
            <input
              type="text"
              className="field-input"
              value={draft}
              placeholder="Break it into a step"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={!draft.trim()}>Add</button>
          </form>

          {!submitted && (
            <button
              type="button"
              className="asg-submit"
              onClick={() => updateAssignment(row.id, { status: 'submitted' })}
            >
              Mark submitted
            </button>
          )}
          {submitted && (
            <button
              type="button"
              className="asg-submit undo"
              onClick={() => updateAssignment(row.id, { status: 'doing' })}
            >
              Not submitted after all
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export function AcademicsPage() {
  const {
    academics, setActiveTerm,
    addCourse, updateCourse, deleteCourse,
    addAssignment, updateAssignment,
  } = useApp()
  const now = useToday()

  const [courseDialog, setCourseDialog] = useState(null)
  const [asgDialog, setAsgDialog] = useState(null)
  const [killing, setKilling] = useState(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null)

  const courses = academics.courses || []
  const assignments = academics.assignments || []
  const terms = termsOf(courses)

  // A remembered term that no longer exists is not an error — a course was
  // renamed or removed. Fall through to the newest rather than showing nothing.
  const term = terms.includes(academics.activeTerm) ? academics.activeTerm : (terms[0] || '')

  const shownCourses = term ? courses.filter((c) => (c.term || '').trim() === term) : courses
  const byId = new Map(shownCourses.map((c) => [String(c.id), c]))

  // Orphan-tolerant on purpose: a hand-edited store, or a course deleted in
  // another tab, must not take the page down with it
  const live = assignments.filter((a) => byId.has(String(a.courseId)))
  const rows = sortAssignments(live, now)

  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter((a) => {
      const c = byId.get(String(a.courseId))
      return `${a.title} ${a.note || ''} ${a.type} ${courseLabel(c)}`.toLowerCase().includes(q)
    })
    : rows

  const openCount = rows.filter((a) => a.status !== 'submitted').length
  const dueSoon = rows.filter(
    (a) => a.status !== 'submitted' && a.days != null && a.days >= 0 && a.days <= 7,
  ).length

  const countFor = (id) => assignments.filter((a) => String(a.courseId) === String(id)).length

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">ACADEMICS</div>
          <h1 className="page-title">Courses</h1>
          {terms.length > 0 && (
            <div className="term-row">
              <select
                className="term-select"
                value={term}
                onChange={(e) => setActiveTerm(e.target.value)}
                aria-label="Term"
              >
                {terms.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="term-stat">
                {shownCourses.length} {shownCourses.length === 1 ? 'course' : 'courses'}
                {openCount > 0 && <> · {openCount} open</>}
                {dueSoon > 0 && <b> · {dueSoon} due this week</b>}
              </span>
            </div>
          )}
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn-ghost with-icon" onClick={() => setCourseDialog(true)}>
            <PlusIcon />
            Course
          </button>
          <button
            type="button"
            className="btn-primary with-icon"
            onClick={() => setAsgDialog(true)}
            disabled={!shownCourses.length}
            title={shownCourses.length ? undefined : 'Add a course first'}
          >
            <PlusIcon />
            Assignment
          </button>
        </div>
      </div>

      {/* ---- Courses ---- */}
      {courses.length === 0 ? (
        <button type="button" className="empty-box" onClick={() => setCourseDialog(true)}>
          <DashedOutline r={12} />
          <b>No courses yet</b>
          <span>Add one, give it a term, and its assignments have somewhere to live</span>
        </button>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <span className="eyebrow">{term || 'ALL COURSES'}</span>
            <span className="panel-count">{shownCourses.length}</span>
          </div>
          <ul className="course-grid">
            {shownCourses.map((c) => (
              <li key={c.id} className={`course-card c${c.colour || 1}`}>
                <span className="course-bar" />
                <button
                  type="button"
                  className="course-open"
                  onClick={() => setCourseDialog(c)}
                  title="Edit course"
                >
                  <span className="course-code">{c.code || c.name || 'Untitled'}</span>
                  {c.code && c.name && <span className="course-name">{c.name}</span>}
                </button>
                <span className="course-meta">
                  {c.instructor && <span>{c.instructor}</span>}
                  {c.room && <span>{c.room}</span>}
                  {c.credits != null && c.credits !== '' && <span>{c.credits} cr</span>}
                </span>
                <span className="course-foot">
                  <span className="course-tally">
                    {countFor(c.id)} {countFor(c.id) === 1 ? 'assignment' : 'assignments'}
                  </span>
                  <button
                    type="button"
                    className="row-del"
                    onClick={() => setKilling(c)}
                    aria-label={`Remove ${courseLabel(c)}`}
                  >
                    <TrashIcon />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Assignments ---- */}
      {shownCourses.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span className="eyebrow">ASSIGNMENTS</span>
            {rows.length > 0 && (
              <span className={`panel-count ${openCount === 0 ? 'full' : ''}`}>
                {rows.length - openCount}/{rows.length}
              </span>
            )}
          </div>

          {rows.length > 3 && (
            <div className="list-tools">
              <div className="search-box">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search assignments"
                />
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="home-empty">
              Nothing due in {term || 'this term'} yet. Add an assignment and it
              starts counting down.
            </p>
          ) : (
            <ul className="asg-list-outer">
              {shown.map((row) => (
                <AssignmentRow
                  key={row.id}
                  row={row}
                  course={byId.get(String(row.courseId))}
                  open={open === row.id}
                  onToggleOpen={setOpen}
                  onEdit={() => setAsgDialog(row)}
                />
              ))}
            </ul>
          )}

          {shown.length === 0 && rows.length > 0 && (
            <p className="list-none">Nothing matches “{query}”.</p>
          )}
        </section>
      )}

      {courseDialog && (
        <CourseDialog
          entry={courseDialog === true ? null : courseDialog}
          terms={terms}
          activeTerm={term}
          onSave={(patch) => (courseDialog === true
            ? addCourse(patch)
            : updateCourse(courseDialog.id, patch))}
          onClose={() => setCourseDialog(null)}
        />
      )}

      {asgDialog && (
        <AssignmentDialog
          entry={asgDialog === true ? null : asgDialog}
          courses={shownCourses}
          defaultCourse={shownCourses[0]?.id}
          onSave={(patch) => (asgDialog === true
            ? addAssignment(patch)
            : updateAssignment(asgDialog.id, patch))}
          onClose={() => setAsgDialog(null)}
        />
      )}

      {killing && (
        <ConfirmDialog
          title={`Remove ${courseLabel(killing)}?`}
          copy={countFor(killing.id) > 0
            ? `Its ${countFor(killing.id)} assignment${countFor(killing.id) === 1 ? '' : 's'} go with it. This cannot be undone.`
            : 'This cannot be undone.'}
          action="Remove course"
          onConfirm={() => { deleteCourse(killing.id); setKilling(null) }}
          onClose={() => setKilling(null)}
        />
      )}
    </div>
  )
}
