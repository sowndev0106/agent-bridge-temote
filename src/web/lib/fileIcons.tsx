import {
  FileText, FileCode2, FileCog, FileType, Braces, Image, Lock,
  Database, GitBranch, Container, Terminal, BookText,
  type LucideIcon
} from 'lucide-react'

export interface FileIconSpec {
  Icon: LucideIcon
  color: string
}

const MUTED = 'var(--color-text-muted)'

// VS Code-ish accent colors per language/file family.
const BY_EXT: Record<string, FileIconSpec> = {
  ts: { Icon: FileCode2, color: '#3178c6' },
  tsx: { Icon: FileCode2, color: '#3178c6' },
  js: { Icon: FileCode2, color: '#e8bf3c' },
  jsx: { Icon: FileCode2, color: '#e8bf3c' },
  mjs: { Icon: FileCode2, color: '#e8bf3c' },
  cjs: { Icon: FileCode2, color: '#e8bf3c' },
  json: { Icon: Braces, color: '#cbcb41' },
  md: { Icon: BookText, color: '#519aba' },
  mdx: { Icon: BookText, color: '#519aba' },
  css: { Icon: FileType, color: '#519aba' },
  scss: { Icon: FileType, color: '#cf649a' },
  sass: { Icon: FileType, color: '#cf649a' },
  less: { Icon: FileType, color: '#cf649a' },
  html: { Icon: FileCode2, color: '#e44d26' },
  py: { Icon: FileCode2, color: '#4b8bbe' },
  go: { Icon: FileCode2, color: '#00add8' },
  rs: { Icon: FileCode2, color: '#dea584' },
  java: { Icon: FileCode2, color: '#cc3e44' },
  rb: { Icon: FileCode2, color: '#cc342d' },
  php: { Icon: FileCode2, color: '#8993be' },
  sh: { Icon: Terminal, color: '#4eaa25' },
  bash: { Icon: Terminal, color: '#4eaa25' },
  zsh: { Icon: Terminal, color: '#4eaa25' },
  yml: { Icon: FileCog, color: '#a074c4' },
  yaml: { Icon: FileCog, color: '#a074c4' },
  toml: { Icon: FileCog, color: '#6d8086' },
  ini: { Icon: FileCog, color: '#6d8086' },
  sql: { Icon: Database, color: '#dad8d8' },
  png: { Icon: Image, color: '#a074c4' },
  jpg: { Icon: Image, color: '#a074c4' },
  jpeg: { Icon: Image, color: '#a074c4' },
  gif: { Icon: Image, color: '#a074c4' },
  webp: { Icon: Image, color: '#a074c4' },
  ico: { Icon: Image, color: '#a074c4' },
  bmp: { Icon: Image, color: '#a074c4' },
  svg: { Icon: Image, color: '#ffb13b' },
  lock: { Icon: Lock, color: '#6d8086' }
}

// Exact-filename matches take priority over extension.
const BY_NAME: Record<string, FileIconSpec> = {
  'package.json': { Icon: Braces, color: '#8bc34a' },
  'package-lock.json': { Icon: Lock, color: '#6d8086' },
  'tsconfig.json': { Icon: Braces, color: '#3178c6' },
  'dockerfile': { Icon: Container, color: '#2496ed' },
  '.gitignore': { Icon: GitBranch, color: '#e44d26' },
  '.gitattributes': { Icon: GitBranch, color: '#e44d26' },
  '.env': { Icon: FileCog, color: '#d4c950' },
  'readme.md': { Icon: BookText, color: '#519aba' }
}

export function fileIconSpec(name: string): FileIconSpec {
  const lower = name.toLowerCase()
  if (BY_NAME[lower]) return BY_NAME[lower]
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  return BY_EXT[ext] ?? { Icon: FileText, color: MUTED }
}
