export type UnitType = 'box' | 'pack' | 'card' | 'deck' | 'set' | 'goods' | 'unknown'

export type Trade = {
  id: string
  productId?: string
  name: string
  category: string
  group: string
  type: 'buy' | 'sell'
  amount: number
  points: number
  quantity: number
  unitPrice?: number
  date: string
  source: string
  sourceId?: string
  note?: string
  unitType?: UnitType
  fee?: number
  shipping?: number
  createdAt?: string
  sortOrder?: number
}

export const unitLabels: Record<UnitType, string> = {
  box: 'ボックス',
  pack: 'バラパック',
  card: 'カード',
  deck: 'スタートデッキ',
  set: 'セット',
  goods: 'グッズ',
  unknown: '未分類',
}

export const inferUnitType = (name: string, category: string): UnitType => {
  const value = name.toLowerCase()
  if (/낱팩|(?:^|\s)팩|パック/.test(value)) return 'pack'
  if (/박스|ボックス|box|宝石包|宝石宝/.test(value)) return 'box'
  if (/덱|デッキ|スタデ|スターター/.test(value)) return 'deck'
  if (/세트|セット|아카데미/.test(value)) return 'set'
  if (category === '싱글 카드') return 'card'
  if (category === '굿즈・기타' || category === '포켓몬 외') return 'goods'
  return 'unknown'
}

// Version 6 local data was already saved in Japanese. These small replacements
// keep the oldest compatible records readable without bundling a personal seed ledger.
export const jaText = (value: string) => value
  .replace(/^카드 매입 /, 'カード購入 ')
  .replace(/엔/g, '円')
