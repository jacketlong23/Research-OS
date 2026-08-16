/** 项目主题色 → Tailwind 类名映射(必须写全字面量,Tailwind v4 才能扫描到) */
export interface ProjectColorClasses {
  block: string
  bar: string
  text: string
  border: string
  dot: string
}

const COLORS: Record<string, ProjectColorClasses> = {
  cyan: {
    block: 'bg-cyan-500/15 border-cyan-500/50 text-cyan-100',
    bar: 'bg-cyan-500',
    text: 'text-cyan-400',
    border: 'border-cyan-500/40',
    dot: 'bg-cyan-400',
  },
  emerald: {
    block: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100',
    bar: 'bg-emerald-500',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    dot: 'bg-emerald-400',
  },
  violet: {
    block: 'bg-violet-500/15 border-violet-500/50 text-violet-100',
    bar: 'bg-violet-500',
    text: 'text-violet-400',
    border: 'border-violet-500/40',
    dot: 'bg-violet-400',
  },
  amber: {
    block: 'bg-amber-500/15 border-amber-500/50 text-amber-100',
    bar: 'bg-amber-500',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    dot: 'bg-amber-400',
  },
  rose: {
    block: 'bg-rose-500/15 border-rose-500/50 text-rose-100',
    bar: 'bg-rose-500',
    text: 'text-rose-400',
    border: 'border-rose-500/40',
    dot: 'bg-rose-400',
  },
  sky: {
    block: 'bg-sky-500/15 border-sky-500/50 text-sky-100',
    bar: 'bg-sky-500',
    text: 'text-sky-400',
    border: 'border-sky-500/40',
    dot: 'bg-sky-400',
  },
  slate: {
    block: 'bg-slate-500/15 border-slate-500/50 text-slate-100',
    bar: 'bg-slate-500',
    text: 'text-slate-400',
    border: 'border-slate-500/40',
    dot: 'bg-slate-400',
  },
}

export const COLOR_NAMES = ['cyan', 'emerald', 'violet', 'amber', 'rose', 'sky', 'slate']

export function colorClasses(color?: string | null): ProjectColorClasses {
  return COLORS[color ?? 'slate'] ?? COLORS.slate
}
