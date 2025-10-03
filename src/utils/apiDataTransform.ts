import type { FullGameData, ApiBgmData, ApiVndbData, OtherData, RawGameData } from '@/types'

// 简化版：仅接受可选的 appendFields（各子段为 Partial），序列化规则固定为默认字段
export type AppendFields = {
  game?: Partial<RawGameData>
  bgm?: Partial<ApiBgmData>
  vndb?: Partial<ApiVndbData>
  other?: Partial<OtherData>
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function mergeSection<T extends object | undefined>(base: T | undefined, extra: Partial<T> | undefined): T | undefined {
  if (!base && !extra) return undefined
  const b = (base ? deepClone(base) : {}) as any
  if (!extra) return b as T
  Object.keys(extra).forEach((k) => {
    ;(b as any)[k] = (extra as any)[k]
  })
  return b as T
}

function originalHasArrayField(section: any | undefined, field: string) {
  if (!section) return false
  const arrayKey = `${field}_Array`
  return Array.isArray(section[arrayKey]) || Array.isArray(section[field])
}

function serializeArraysToStringsForSection(section: any, fieldsToSerialize?: string[]) {
  if (!section || !fieldsToSerialize?.length) return
  fieldsToSerialize.forEach((field) => {
    const arrayKey = `${field}_Array`
    const stringKey = field
    if (Array.isArray(section[arrayKey])) {
      try {
        section[stringKey] = JSON.stringify(section[arrayKey])
      } catch {
        section[stringKey] = (section[arrayKey] as any[]).join(',')
      }
    } else if (Array.isArray(section[stringKey])) {
      try {
        section[stringKey] = JSON.stringify(section[stringKey])
      } catch {
        section[stringKey] = (section[stringKey] as any[]).join(',')
      }
    }
  })
}

export function transformApiGameData(input: FullGameData, appendFields?: AppendFields): FullGameData {
  const src = deepClone(input || { game: { id_type: 'custom' } }) as FullGameData
  const original = deepClone(input || { game: { id_type: 'custom' } }) as FullGameData
  const append = appendFields

  src.game = mergeSection<RawGameData>(src.game, append?.game) || ({} as RawGameData)
  src.bgm_data = mergeSection<Partial<ApiBgmData>>(src.bgm_data as any, append?.bgm as any) || null
  src.vndb_data = mergeSection<Partial<ApiVndbData>>(src.vndb_data as any, append?.vndb as any) || null
  src.other_data = mergeSection<Partial<OtherData>>(src.other_data as any, append?.other as any) || null

  const defaultSerializeFields = ['tags', 'aliases', 'all_titles']

  if (src.bgm_data) {
    const allowed = defaultSerializeFields.filter((f) => originalHasArrayField(original.bgm_data as any, f))
    serializeArraysToStringsForSection(src.bgm_data, allowed)
  }
  if (src.vndb_data) {
    const allowed = defaultSerializeFields.filter((f) => originalHasArrayField(original.vndb_data as any, f))
    serializeArraysToStringsForSection(src.vndb_data, allowed)
  }
  if (src.other_data) {
    const allowed = defaultSerializeFields.filter((f) => originalHasArrayField(original.other_data as any, f))
    serializeArraysToStringsForSection(src.other_data, allowed)
  }
  if (src.game) {
    const allowed = defaultSerializeFields.filter((f) => originalHasArrayField(original.game as any, f))
    serializeArraysToStringsForSection(src.game as any, allowed)
  }

  return src
}

export default transformApiGameData
