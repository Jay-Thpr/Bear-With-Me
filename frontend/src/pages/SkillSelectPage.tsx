import { startTransition, useEffect, useMemo, useState } from 'react'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Link, useNavigate } from 'react-router-dom'
import { fetchSkills, type SkillOut } from '../api/skills'
import { useAuth } from '../auth/AuthContext'
import {
  Camera,
  ChefHat,
  Code,
  Dumbbell,
  Music,
  Palette,
  Plus,
} from 'lucide-react'
import { Character } from '../components/Character'
import './Page.css'

const DND_TYPE = 'character' as const

const SKILL_TYPES = {
  COOKING: 'cooking',
  BASKETBALL: 'basketball',
  MUSIC: 'music',
  ART: 'art',
  CODING: 'coding',
  PHOTOGRAPHY: 'photography',
  MORE: 'more',
} as const

/** Skills tied to a focus ring are shown only on that preset — not again in the top "saved" row. */
const PRESET_FOCUS_CATEGORIES = new Set<string>([
  SKILL_TYPES.COOKING,
  SKILL_TYPES.BASKETBALL,
  SKILL_TYPES.MUSIC,
  SKILL_TYPES.ART,
  SKILL_TYPES.CODING,
  SKILL_TYPES.PHOTOGRAPHY,
])

type SlotColor = 'primary' | 'secondary' | 'accent' | 'muted'

type IconName =
  | 'chef'
  | 'dumbbell'
  | 'music'
  | 'palette'
  | 'code'
  | 'camera'
  | 'plus'

function SlotIcon({ name, size }: { name: IconName; size: number }) {
  const p = {
    size,
    strokeWidth: 2,
    className: 'skill-select__lucide',
  } as const
  switch (name) {
    case 'chef':
      return <ChefHat {...p} />
    case 'dumbbell':
      return <Dumbbell {...p} />
    case 'music':
      return <Music {...p} />
    case 'palette':
      return <Palette {...p} />
    case 'code':
      return <Code {...p} />
    case 'camera':
      return <Camera {...p} />
    case 'plus':
      return <Plus {...p} />
    default:
      return <ChefHat {...p} />
  }
}

interface SkillSlot {
  id: string
  type: string
  label: string
  icon: IconName
  position: { x: number; y: number }
  color: SlotColor
  popularity: number
  source: 'user' | 'preset'
  /** Preset ring only: skill id when one is assigned to this focus category. */
  assignedSkillId?: string
}

/** Template presets; labels are replaced from the API (or "Unassigned") in `presetSlotsWithLabels`. */
const ALL_SKILL_SLOTS: SkillSlot[] = [
  {
    id: 'cooking',
    type: SKILL_TYPES.COOKING,
    label: 'Cooking',
    icon: 'chef',
    position: { x: -120, y: -80 },
    color: 'primary',
    popularity: 95,
    source: 'preset',
  },
  {
    id: 'basketball',
    type: SKILL_TYPES.BASKETBALL,
    label: 'Movement',
    icon: 'dumbbell',
    position: { x: 120, y: -80 },
    color: 'secondary',
    popularity: 90,
    source: 'preset',
  },
  {
    id: 'music',
    type: SKILL_TYPES.MUSIC,
    label: 'Music',
    icon: 'music',
    position: { x: -160, y: 40 },
    color: 'accent',
    popularity: 85,
    source: 'preset',
  },
  {
    id: 'art',
    type: SKILL_TYPES.ART,
    label: 'Art',
    icon: 'palette',
    position: { x: 160, y: 40 },
    color: 'primary',
    popularity: 80,
    source: 'preset',
  },
  {
    id: 'coding',
    type: SKILL_TYPES.CODING,
    label: 'Logic',
    icon: 'code',
    position: { x: -120, y: 140 },
    color: 'secondary',
    popularity: 75,
    source: 'preset',
  },
  {
    id: 'photography',
    type: SKILL_TYPES.PHOTOGRAPHY,
    label: 'Photography',
    icon: 'camera',
    position: { x: 120, y: 140 },
    color: 'accent',
    popularity: 70,
    source: 'preset',
  },
  {
    id: 'more',
    type: SKILL_TYPES.MORE,
    label: 'More',
    icon: 'plus',
    position: { x: 0, y: 200 },
    color: 'muted',
    popularity: 100,
    source: 'preset',
  },
]

function normalizePresetCategory(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim().toLowerCase()
  return t || null
}

/** Match skills to a preset ring (`cooking`, `music`, …); category may differ by case or spacing in DB. */
function skillForCategory(skills: SkillOut[], category: string) {
  const want = normalizePresetCategory(category)
  if (!want) return undefined
  const matches = skills.filter((s) => normalizePresetCategory(s.context?.category) === want)
  if (matches.length === 0) return undefined
  return matches.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0]
}

function DraggableCharacter({
  onDrag,
  isOverSlot,
}: {
  onDrag: (v: boolean) => void
  isOverSlot: string | null
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DND_TYPE,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }))

  useEffect(() => {
    onDrag(isDragging)
  }, [isDragging, onDrag])

  return (
    <div
      ref={(node) => {
        drag(node)
      }}
      className={`skill-select__bear${isDragging ? ' skill-select__bear--dragging' : ''}${
        isOverSlot ? ' skill-select__bear--over' : ''
      }`}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
      aria-label="Drag the bear onto a skill"
    >
      <Character size="large" />
    </div>
  )
}

function SkillSlotComponent({
  slot,
  onDrop,
  onHover,
  isSelected,
  circleSize,
  iconSize,
}: {
  slot: SkillSlot
  onDrop: (skillId: string) => void
  onHover: (skillId: string | null) => void
  isSelected: boolean
  circleSize: number
  iconSize: number
}) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: DND_TYPE,
    drop: () => onDrop(slot.id),
    hover: () => onHover(slot.id),
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }))

  const hot = isOver || isSelected

  return (
    <div
      ref={(node) => {
        drop(node)
      }}
      className={`skill-select__slot${hot ? ' skill-select__slot--hot' : ''}`}
      style={{
        left: `calc(50% + ${slot.position.x}px)`,
        top: `calc(50% + ${slot.position.y}px)`,
      }}
    >
      <div
        className={`skill-select__disc skill-select__disc--${slot.color}${
          hot ? ' skill-select__disc--ring' : ''
        }`}
        style={{
          width: circleSize,
          height: circleSize,
        }}
      >
        <span className="skill-select__icon-wrap">
          <SlotIcon name={slot.icon} size={iconSize} />
        </span>
      </div>
      <div
        className="skill-select__slot-label"
        style={{
          fontSize: circleSize > 80 ? '1rem' : '0.875rem',
        }}
      >
        {slot.label}
      </div>
    </div>
  )
}

function ArenaHoverClear({ onClear }: { onClear: () => void }) {
  const [, drop] = useDrop(() => ({
    accept: DND_TYPE,
    hover: () => onClear(),
  }))
  return (
    <div
      ref={(node) => {
        drop(node)
      }}
      className="skill-select__arena-clear"
      aria-hidden
    />
  )
}

export function SkillSelectPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [apiSkills, setApiSkills] = useState<
    Awaited<ReturnType<typeof fetchSkills>>
  >([])
  const [skillsLoadError, setSkillsLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      startTransition(() => setApiSkills([]))
      return
    }
    let cancelled = false
    fetchSkills()
      .then((list) => {
        if (!cancelled) {
          setApiSkills(list)
          setSkillsLoadError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSkillsLoadError(e instanceof Error ? e.message : 'Could not load skills')
        }
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const userSlots: SkillSlot[] = useMemo(() => {
    const withoutPresetDuplicates = apiSkills.filter((s) => {
      const cat = normalizePresetCategory(s.context?.category)
      if (!cat) return true
      return !PRESET_FOCUS_CATEGORIES.has(cat)
    })
    return withoutPresetDuplicates.slice(0, 8).map((s, i) => ({
      id: s.id,
      type: `user-${s.id}`,
      label: s.title?.trim() ? s.title.trim() : 'Unassigned',
      icon: 'chef' as IconName,
      position: {
        x: -120 + (i % 4) * 80,
        y: -200,
      },
      color: 'primary' as SlotColor,
      popularity: 100,
      source: 'user' as const,
    }))
  }, [apiSkills])

  const presetSlotsWithLabels: SkillSlot[] = useMemo(() => {
    return ALL_SKILL_SLOTS.map((slot) => {
      if (slot.type === SKILL_TYPES.MORE) return slot
      const assigned = skillForCategory(apiSkills, slot.type)
      const label =
        assigned?.title?.trim() ? assigned.title.trim() : 'Unassigned'
      return {
        ...slot,
        label,
        assignedSkillId: assigned?.id,
      }
    })
  }, [apiSkills])

  const { displayedSkills, circleSize, iconSize } = useMemo(() => {
    const combined = [...userSlots, ...presetSlotsWithLabels]
    const skillsToShow = combined.slice(0, 20)
    const n = skillsToShow.length
    let size = 96
    let iconPx = 32
    if (n <= 4) {
      size = 96
      iconPx = 32
    } else if (n <= 6) {
      size = 80
      iconPx = 28
    } else if (n <= 8) {
      size = 72
      iconPx = 24
    } else {
      size = 64
      iconPx = 20
    }
    return { displayedSkills: skillsToShow, circleSize: size, iconSize: iconPx }
  }, [userSlots, presetSlotsWithLabels])

  const handleDrop = (skillId: string) => {
    setHoveredSlot(null)
    const slot = displayedSkills.find((s) => s.id === skillId)
    if (skillId === 'more') {
      navigate('/onboarding', { state: { createSkill: true } })
      return
    }
    if (slot?.source === 'preset' && slot.id !== 'more') {
      const linkedId = slot.assignedSkillId
      if (linkedId) {
        navigate('/dashboard', {
          state: {
            skillId: linkedId,
            skillTitle:
              slot.label !== 'Unassigned' ? slot.label : 'Your skill',
          },
        })
        return
      }
      navigate('/onboarding', {
        state: { createSkill: true, category: slot.type },
      })
      return
    }
    setSelectedSkill(skillId)
    setShowConfirm(true)
  }

  const handleConfirm = () => {
    if (!selectedSkill) return
    const slot = displayedSkills.find((s) => s.id === selectedSkill)
    if (slot?.source === 'user') {
      navigate('/dashboard', {
        state: { skillId: slot.id, skillTitle: slot.label },
      })
      return
    }
    if (slot?.source === 'preset' && slot.id !== 'more') {
      const linkedId = slot.assignedSkillId
      if (linkedId) {
        navigate('/dashboard', {
          state: {
            skillId: linkedId,
            skillTitle:
              slot.label !== 'Unassigned' ? slot.label : 'Your skill',
          },
        })
        return
      }
      navigate('/onboarding', {
        state: { createSkill: true, category: slot.type },
      })
      return
    }
    navigate('/dashboard')
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="page skill-select">
        <div className="skill-select__glow" aria-hidden />

        <div className="skill-select__header">
          <h1 className="skill-select__title">What would you like to practice?</h1>
          <p className="skill-select__subtitle">
            {selectedSkill
              ? 'Tap to confirm your choice'
              : user
                ? 'Your saved skills are on top; drag onto a focus area or create new'
                : 'Sign in to load your skills — or drag onto a focus area to explore'}
          </p>
          {skillsLoadError ? (
            <p className="skill-select__subtitle" style={{ color: 'var(--destructive)' }}>
              {skillsLoadError}
            </p>
          ) : null}
        </div>

        <div className="skill-select__arena-wrap">
          <div className="skill-select__arena">
            <ArenaHoverClear onClear={() => setHoveredSlot(null)} />

            {displayedSkills.map((slot) => (
              <SkillSlotComponent
                key={slot.id}
                slot={slot}
                onDrop={handleDrop}
                onHover={(id) => setHoveredSlot(id)}
                isSelected={selectedSkill === slot.id}
                circleSize={circleSize}
                iconSize={iconSize}
              />
            ))}

            <DraggableCharacter onDrag={setIsDragging} isOverSlot={hoveredSlot} />

            {showConfirm && selectedSkill ? (
              <div className="skill-select__confirm-scrim">
                <div
                  className="skill-select__confirm-card"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="skill-confirm-title"
                >
                  <p id="skill-confirm-title" className="skill-select__confirm-text">
                    Focus on{' '}
                    <span className="skill-select__confirm-accent">
                      {displayedSkills.find((s) => s.id === selectedSkill)?.label}
                    </span>
                    ?
                  </p>
                  <button
                    type="button"
                    className="btn btn--primary btn--lg skill-select__confirm-btn"
                    onClick={handleConfirm}
                  >
                    Begin journey
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {isDragging && !hoveredSlot ? (
          <div className="skill-select__hint">
            <p className="skill-select__hint-text">Gently place on a focus area</p>
          </div>
        ) : null}

        <div className="skill-select__footer">
          <Link to="/" className="skill-select__home-link">
            Back home
          </Link>
        </div>
      </div>
    </DndProvider>
  )
}
