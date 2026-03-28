import { useEffect, useMemo, useState } from 'react'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Link, useNavigate } from 'react-router-dom'
import { fetchSkills, type SkillOut } from '../api/skills'
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

/** Template presets; labels become API skill titles when matched, else the default focus name. */
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

/**
 * DB / onboarding may use wording that does not exactly match preset `type`
 * (e.g. "movement" for the basketball ring, "logic" for coding).
 */
const CATEGORY_ALIASES: Record<string, string[]> = {
  [SKILL_TYPES.COOKING]: [
    'cooking',
    'cook',
    'culinary',
    'kitchen',
    'food',
    'chef',
    'baking',
    'bake',
  ],
  [SKILL_TYPES.BASKETBALL]: [
    'basketball',
    'movement',
    'sports',
    'sport',
    'fitness',
    'athletic',
    'athletics',
    'gym',
    'workout',
    'exercise',
  ],
  [SKILL_TYPES.MUSIC]: ['music', 'audio', 'instrument', 'instruments', 'singing', 'vocal'],
  [SKILL_TYPES.ART]: [
    'art',
    'drawing',
    'painting',
    'design',
    'visual',
    'creative',
    'sketch',
    'illustration',
  ],
  [SKILL_TYPES.CODING]: [
    'coding',
    'code',
    'programming',
    'logic',
    'development',
    'software',
    'engineering',
    'computer',
    'computing',
    'tech',
    'developer',
  ],
  [SKILL_TYPES.PHOTOGRAPHY]: [
    'photography',
    'photo',
    'camera',
    'imaging',
    'video',
    'filming',
    'film',
  ],
}

function skillCategoryMatchesPreset(skillCat: unknown, presetType: string): boolean {
  const c = normalizePresetCategory(skillCat)
  if (!c) return false
  const want = normalizePresetCategory(presetType)
  if (!want) return false
  if (c === want) return true
  const aliases = CATEGORY_ALIASES[presetType]
  return aliases?.some((a) => normalizePresetCategory(a) === c) ?? false
}

/** Match skills to a preset ring by stored category (exact or alias). */
function skillForCategory(skills: SkillOut[], presetType: string) {
  const matches = skills.filter((s) =>
    skillCategoryMatchesPreset(s.context?.category, presetType),
  )
  if (matches.length === 0) return undefined
  return matches.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0]
}

const PRESET_RING_TYPES = [
  SKILL_TYPES.COOKING,
  SKILL_TYPES.BASKETBALL,
  SKILL_TYPES.MUSIC,
  SKILL_TYPES.ART,
  SKILL_TYPES.CODING,
  SKILL_TYPES.PHOTOGRAPHY,
] as const

/**
 * When category match fails, infer preset from title/notes. Considers skills with no category,
 * or a non-preset category; skips skills already labeled for a *different* preset ring.
 */
function skillForPresetFallback(skills: SkillOut[], category: string): SkillOut | undefined {
  const want = normalizePresetCategory(category)
  if (!want) return undefined

  const titleHints: Record<string, string[]> = {
    cooking: [
      'cook',
      'chef',
      'knife',
      'bake',
      'baking',
      'recipe',
      'kitchen',
      'culinary',
      'food',
      'saut',
      'grill',
      'pastry',
      'meal',
    ],
    basketball: [
      'basketball',
      'hoop',
      'dribble',
      'nba',
      'movement',
      'running',
      'run',
      'jog',
      'soccer',
      'football',
      'tennis',
      'volleyball',
      'fitness',
      'workout',
      'gym',
      'yoga',
      'stretch',
      'athletic',
    ],
    music: [
      'music',
      'piano',
      'guitar',
      'violin',
      'drum',
      'sing',
      'song',
      'vocal',
      'audio',
      'beat',
      'chord',
      'scale',
    ],
    art: [
      'art',
      'draw',
      'paint',
      'sketch',
      'canvas',
      'illustrat',
      'design',
      'sculpt',
      'creative',
      'color',
    ],
    coding: [
      'code',
      'python',
      'javascript',
      'typescript',
      'react',
      'program',
      'dev',
      'software',
      'algorithm',
      'debug',
      'api',
      'git',
      'engineer',
      'comput',
    ],
    photography: [
      'photo',
      'camera',
      'lens',
      'shoot',
      'exposure',
      'aperture',
      'portrait',
      'lightroom',
      'film',
      'video',
      'cinemat',
    ],
  }
  const hints = titleHints[want]
  if (!hints?.length) return undefined

  const presetCatSet = new Set(PRESET_RING_TYPES.map((t) => t.toLowerCase()))

  const pool = skills.filter((s) => {
    const cat = normalizePresetCategory(s.context?.category)
    if (!cat) return true
    if (cat === want) return true
    if (presetCatSet.has(cat) && cat !== want) return false
    return true
  })
  if (pool.length === 0) return undefined

  const scored = pool.map((s) => {
    const t = `${s.title} ${s.notes ?? ''}`.toLowerCase()
    const score = hints.reduce((acc, h) => acc + (t.includes(h) ? 1 : 0), 0)
    return { s, score }
  })
  const best = scored.sort((a, b) => b.score - a.score || new Date(b.s.updated_at).getTime() - new Date(a.s.updated_at).getTime())[0]
  if (best.score < 1) return undefined
  return best.s
}

/** Category match first, then title/notes hints (same logic everywhere). */
function resolveSkillForPreset(skills: SkillOut[], slotType: string): SkillOut | undefined {
  return skillForCategory(skills, slotType) ?? skillForPresetFallback(skills, slotType)
}

/** True if this skill is the one shown on any preset ring (category or title-hint match). */
function skillClaimedByPresetRing(skills: SkillOut[], skill: SkillOut): boolean {
  for (const slot of ALL_SKILL_SLOTS) {
    if (slot.type === SKILL_TYPES.MORE) continue
    const resolved = resolveSkillForPreset(skills, slot.type)
    if (resolved?.id === skill.id) return true
  }
  return false
}

async function resolvePresetSkill(
  slotType: string,
  currentSkills: SkillOut[],
): Promise<{ id: string; title: string } | null> {
  const tryList = (list: SkillOut[]) => resolveSkillForPreset(list, slotType)

  let skill = tryList(currentSkills)
  if (!skill) {
    try {
      const fresh = await fetchSkills()
      skill = tryList(fresh)
    } catch {
      return null
    }
  }
  if (!skill) return null
  const title = skill.title?.trim() || 'Your skill'
  return { id: skill.id, title }
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
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [apiSkills, setApiSkills] = useState<
    Awaited<ReturnType<typeof fetchSkills>>
  >([])
  const [skillsLoadError, setSkillsLoadError] = useState<string | null>(null)

  useEffect(() => {
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
  }, [])

  const userSlots: SkillSlot[] = useMemo(() => {
    /** Only skills that no preset ring already represents (avoid duplicate bubbles above the arena). */
    const orphans = apiSkills.filter((s) => !skillClaimedByPresetRing(apiSkills, s))
    return orphans.slice(0, 8).map((s, i) => ({
      id: s.id,
      type: `user-${s.id}`,
      label: s.title?.trim() ? s.title.trim() : 'Saved skill',
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
      const assigned = resolveSkillForPreset(apiSkills, slot.type)
      const label =
        assigned?.title?.trim() ? assigned.title.trim() : slot.label
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
      void (async () => {
        if (slot.assignedSkillId) {
          navigate('/dashboard', {
            state: {
              skillId: slot.assignedSkillId,
              skillTitle: slot.label,
            },
          })
          return
        }
        const resolved = await resolvePresetSkill(slot.type, apiSkills)
        if (resolved) {
          void fetchSkills()
            .then(setApiSkills)
            .catch(() => {})
          navigate('/dashboard', {
            state: {
              skillId: resolved.id,
              skillTitle: resolved.title,
            },
          })
          return
        }
        navigate('/onboarding', {
          state: { createSkill: true, category: slot.type },
        })
      })()
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
      void (async () => {
        if (slot.assignedSkillId) {
          navigate('/dashboard', {
            state: {
              skillId: slot.assignedSkillId,
              skillTitle: slot.label,
            },
          })
          return
        }
        const resolved = await resolvePresetSkill(slot.type, apiSkills)
        if (resolved) {
          void fetchSkills()
            .then(setApiSkills)
            .catch(() => {})
          navigate('/dashboard', {
            state: {
              skillId: resolved.id,
              skillTitle: resolved.title,
            },
          })
          return
        }
        navigate('/onboarding', {
          state: { createSkill: true, category: slot.type },
        })
      })()
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
              : 'Shared skills on top; drag onto a focus area or create new'}
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
