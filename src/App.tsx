import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  ArrowLeftRight,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  Home,
  Images,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { inferUnitType, jaText, unitLabels, type Trade, type UnitType } from './domain'
import { loadPortfolioSnapshot, PortfolioRepositoryError, savePortfolioSnapshot } from './portfolioRepository'
import { supabase, supabaseConfigError } from './supabase'

type Tab = 'home' | 'transactions' | 'collection' | 'profile'
type TransactionSort = 'latest' | 'oldest' | 'amount-desc' | 'amount-asc' | 'unit-desc' | 'quantity-desc' | 'name'
type ProductCategory = string
type CategoryMaster = { id: string; name: string; unitType: UnitType; active: boolean; sortOrder: number }
type SourceMaster = { id: string; name: string; active: boolean; sortOrder: number; aliases: string[] }
type Product = {
  id: string
  name: string
  category: ProductCategory
  categoryId?: string
  unitType?: UnitType
  expectedPrice: number
  createdAt?: string
}
type EntryUnit = 'pack' | 'box'
type RealizedOverride = { cost?: number; sale?: number }
type RealizedDisplay = { cost: number | null; sale: number; profit: number | null; overridden: boolean }
type ManualCollectionCard = {
  id: string
  name: string
  quantity: number
  expectedPrice: number
}
type CollectionData = {
  hiddenProductIds: string[]
  manualCards: ManualCollectionCard[]
}
type PortfolioState = {
  schemaVersion: 2
  trades: Trade[]
  categories: CategoryMaster[]
  products: Product[]
  sources: SourceMaster[]
  collection: CollectionData
  realizedOverrides: Record<string, RealizedOverride>
}
type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict'
type ProductStats = {
  product: Product
  trades: Trade[]
  buyTrades: Trade[]
  sellTrades: Trade[]
  buyQty: number
  sellQty: number
  stock: number
  buyAmount: number
  buyCost: number
  sellAmount: number
  saleNet: number
  averageCost: number | null
  soldCost: number | null
  remainingCost: number | null
  realizedProfit: number | null
  potentialValue: number
  potentialProfit: number | null
}

const TRADE_STORAGE = 'pokeinvest-trades-v6'
const PRODUCT_STORAGE = 'pokeinvest-products-v2'
const COLLECTION_STORAGE = 'pokeinvest-collection-v2'
const REALIZED_STORAGE = 'pokeinvest-realized-overrides-v1'
const CATEGORY_STORAGE = 'pokeinvest-category-master-v1'
const SOURCE_STORAGE = 'pokeinvest-source-master-v1'
const LEGACY_CLAIM_STORAGE = 'pokeinvest-legacy-claimed-by-v1'
const CLOUD_DRAFT_PREFIX = 'pokeinvest-cloud-draft-v1:'
const legacyStorageKeys = [
  TRADE_STORAGE,
  PRODUCT_STORAGE,
  COLLECTION_STORAGE,
  REALIZED_STORAGE,
  CATEGORY_STORAGE,
  SOURCE_STORAGE,
]
const defaultCategories: CategoryMaster[] = [
  { id: 'cat-card', name: 'カード', unitType: 'card', active: true, sortOrder: 1 },
  { id: 'cat-pack', name: 'パック', unitType: 'pack', active: true, sortOrder: 2 },
  { id: 'cat-deck', name: 'スタートデッキ', unitType: 'deck', active: true, sortOrder: 3 },
  { id: 'cat-set', name: 'セット', unitType: 'set', active: true, sortOrder: 4 },
  { id: 'cat-goods', name: 'グッズ', unitType: 'goods', active: true, sortOrder: 5 },
  { id: 'cat-other', name: 'その他', unitType: 'unknown', active: true, sortOrder: 6 },
]
const defaultSources: SourceMaster[] = [
  { id: 'source-other', name: 'その他', active: true, sortOrder: 1, aliases: ['기타'] },
]
const legacyCollectionFallback: ManualCollectionCard[] = [
  { id: 'holding-h1', name: 'CHRまで', quantity: 1, expectedPrice: 262812 },
  { id: 'holding-h2', name: '御三家コレクション', quantity: 1, expectedPrice: 62000 },
  { id: 'holding-h3', name: 'ARカード', quantity: 196, expectedPrice: 700 },
  { id: 'holding-h4', name: 'ブイズ', quantity: 1, expectedPrice: 154000 },
  { id: 'holding-h7', name: 'トウホク', quantity: 1, expectedPrice: 20000 },
  { id: 'holding-h8', name: 'ヒロシマ', quantity: 1, expectedPrice: 25000 },
]
const officialBoxPackRules = [
  { aliases: ['ニンジャスピナー'], packs: 30 },
  { aliases: ['ムニキスゼロ'], packs: 30 },
  { aliases: ['メガドリーム', 'MEGAドリームex'], packs: 10 },
  { aliases: ['テラスタルフェス', 'テラスタルフェスex'], packs: 10 },
  { aliases: ['ブラックボルト・ホワイトフレア', 'ブラックボルト', 'ホワイトフレア'], packs: 20 },
  { aliases: ['インフェルノ', 'インフェルノX'], packs: 30 },
  { aliases: ['メガブレイブ'], packs: 30 },
  { aliases: ['メガシンフォニア'], packs: 30 },
  { aliases: ['アビスアイ'], packs: 30 },
  { aliases: ['ストームエメラルド', 'ストームエメラルダ'], packs: 30 },
  { aliases: ['熱風のアリーナ'], packs: 30 },
  { aliases: ['ロケット団の栄光'], packs: 30 },
] as const
const legacyOriginalBoxPrices = [
  { aliases: ['ニンジャスピナー'], price: 11000, packs: 30 },
  { aliases: ['メガドリーム', 'MEGAドリームex'], price: 15000, packs: 10 },
] as const
const legacyMemoBoxPacks = new Map<string, number>([
  ['memo-2', 30],
  ['memo-7', 30], ['memo-8', 30], ['memo-9', 30],
  ['memo-12', 30],
  ['memo-16', 10], ['memo-17', 10], ['memo-18', 10], ['memo-20', 10],
  ['memo-24', 10],
  ['memo-26', 20], ['memo-27', 20],
  ['memo-28', 30],
  ['memo-30', 30],
  ['memo-32', 30],
])
const legacyUnitTypes: UnitType[] = ['card', 'pack', 'box', 'deck', 'set', 'goods', 'unknown']
const unitTypeOptions: UnitType[] = ['card', 'pack', 'deck', 'set', 'goods', 'unknown']
const genericGroups = new Set([
  'メルカリ', 'Yahoo!フリマ', 'カードショップ', '闲鱼', 'シングル売却', '韓国グッズ',
  '中国グッズ', 'グッズ売却', 'ポケモン以外', 'その他パック・ボックス',
  '메르카리', '카드샵', '싱글 판매', '한국 굿즈', '중국 굿즈', '굿즈 판매', '포켓몬 외', '기타 팩・박스',
])
const sourceLabels: Record<string, string> = {
  기타: 'その他', 메르카리: 'メルカリ', 카드샵: 'カードショップ', 북오프: 'ブックオフ',
  요도바시: 'ヨドバシ', '요도바시 우메다': 'ヨドバシ梅田', 편의점: 'コンビニ',
  '에디온 당첨': 'エディオン当選', 포켓몬센터: 'ポケモンセンター',
  '포켓몬센터 온라인': 'ポケモンセンターオンライン', '카드박스 에사카점': 'カードボックス江坂店',
  '드래곤스타 니혼바시 3호점': 'ドラゴンスター日本橋3号店', '플레이즈 난바점': 'プレイズなんば店',
  '카드박스 니혼바시점': 'カードボックス日本橋店', 지라풀: 'ジラフル',
  '메르카리・카드샵': 'メルカリ・カードショップ', 한국: '韓国',
  '한국 포켓몬센터 온라인': '韓国ポケモンセンターオンライン', '한국 여행': '韓国旅行',
  '중국・증정': '中国・譲渡', '중국 포켓몬센터': '中国ポケモンセンター',
}

const yen = (value: number) => `¥${Math.abs(Math.round(value)).toLocaleString('ja-JP')}`
const signedYen = (value: number) => `${value >= 0 ? '+' : '−'}${yen(value)}`
const normalize = (value: string) => value.trim().toLocaleLowerCase('ja-JP')
const compactProductName = (value: string) => normalize(value).replace(/[\s・･]/g, '')
const isSpecialPackSet = (...values: Array<string | undefined>) => values.some(value =>
  typeof value === 'string' && /スペシャル(?:カード)?セット/.test(compactProductName(value)),
)
const boxLookupName = (value: string) => compactProductName(value)
  .replace(/(?:未開封)?(?:ボックス|box)$/i, '')
  .replace(/(?:バラ)?パック$/i, '')
const officialPacksPerBox = (...values: Array<string | undefined>) => {
  if (isSpecialPackSet(...values)) return undefined
  const names = values.filter((value): value is string => Boolean(value)).map(boxLookupName)
  const rule = officialBoxPackRules.find(item =>
    item.aliases.some(alias => names.some(name => name === boxLookupName(alias))),
  )
  return rule?.packs
}
const legacyPackPriceForProduct = (name: string) => {
  const normalizedName = boxLookupName(name)
  const price = legacyOriginalBoxPrices.find(item => item.aliases.some(alias => normalizedName === boxLookupName(alias)))
  return price ? price.price / price.packs : 0
}
const normalizeLegacyExpectedPrice = (name: string, value: number) => {
  const normalizedName = boxLookupName(name)
  const legacy = legacyOriginalBoxPrices.find(item =>
    item.price === value
    && item.aliases.some(alias => normalizedName === boxLookupName(alias)),
  )
  return legacy ? legacy.price / legacy.packs : value
}
const canonicalUnitType = (unitType: UnitType | undefined): UnitType | undefined => unitType === 'box' ? 'pack' : unitType
const isLegacyBoxCategory = (category: Pick<CategoryMaster, 'id' | 'name'>) => category.id === 'cat-box' || normalize(category.name) === normalize('ボックス')
const isPackCategory = (category: Pick<CategoryMaster, 'id' | 'name'>) => category.id === 'cat-pack' || normalize(category.name) === normalize('パック')
const canonicalCategoryName = (name: string) => normalize(name) === normalize('ボックス') ? 'パック' : name
const mergePackAndBoxCategories = (categories: CategoryMaster[]) => {
  const packEntries = categories.filter(category => isPackCategory(category) || isLegacyBoxCategory(category))
  const packFallback = defaultCategories.find(category => category.id === 'cat-pack')!
  const packBase = packEntries.find(category => isPackCategory(category)) || packFallback
  const mergedPack: CategoryMaster = {
    ...packBase,
    id: 'cat-pack',
    name: 'パック',
    unitType: 'pack',
    active: packEntries.length ? packEntries.some(category => category.active) : packFallback.active,
    sortOrder: Math.min(packBase.sortOrder, ...packEntries.map(category => category.sortOrder)),
  }
  const merged = categories
    .filter(category => !isPackCategory(category) && !isLegacyBoxCategory(category))
    .map(category => ({ ...category, unitType: canonicalUnitType(category.unitType) || 'unknown' }))
  merged.push(mergedPack)
  return merged
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category, index) => ({ ...category, sortOrder: index + 1 }))
}
const localDateString = () => {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}
const sourceLabel = (value: string) => sourceLabels[value] || value
const categoryForName = (categories: CategoryMaster[], name: string) => {
  const canonicalName = canonicalCategoryName(name)
  return categories.find(category => normalize(category.name) === normalize(canonicalName))
    || defaultCategories.find(category => normalize(category.name) === normalize(canonicalName))
}
const sourceMatches = (source: SourceMaster, value: string) => [source.name, ...source.aliases].some(alias => normalize(alias) === normalize(sourceLabel(value)))
const sourceForTrade = (trade: Trade, sources: SourceMaster[]) => {
  const idMatch = sources.find(source => source.id === trade.sourceId)
  if (idMatch && sourceMatches(idMatch, trade.source)) return idMatch
  return sources.find(source => sourceMatches(source, trade.source)) || idMatch
}
const displaySource = (trade: Trade, sources: SourceMaster[]) => sourceForTrade(trade, sources)?.name || sourceLabel(trade.source)
const stableSourceId = (name: string) => {
  let hash = 2166136261
  for (const character of normalize(name)) {
    hash ^= character.codePointAt(0) || 0
    hash = Math.imul(hash, 16777619)
  }
  return `source-${(hash >>> 0).toString(36)}`
}
const getUnitType = (trade: Trade) => canonicalUnitType(trade.unitType || inferUnitType(trade.name, trade.category)) || 'unknown'
const getProductName = (trade: Trade) => {
  const group = jaText(trade.group || '').trim()
  const unit = getUnitType(trade)
  if (trade.category === '팩・박스' && group && !genericGroups.has(group) && ['box', 'pack', 'deck', 'set', 'unknown'].includes(unit)) return group
  if (trade.category !== '팩・박스' && group && !genericGroups.has(group) && group !== trade.source) return group
  return jaText(trade.name).trim()
}
const productCategoryFromTrade = (trade: Trade): ProductCategory => {
  const unit = getUnitType(trade)
  const directCategory = canonicalCategoryName(trade.category)
  if (unit === 'card' || trade.category === '싱글 카드') return 'カード'
  if (unit === 'pack' || unit === 'box' || directCategory === 'パック') return 'パック'
  if (unit === 'deck') return 'スタートデッキ'
  if (unit === 'set') return 'セット'
  if (unit === 'goods' || trade.category === '굿즈・기타' || trade.category === '포켓몬 외') return 'グッズ'
  return 'その他'
}
const unitFromProduct = (product: Product): UnitType => canonicalUnitType(product.unitType || ({
  カード: 'card', パック: 'pack', ボックス: 'box', スタートデッキ: 'deck', セット: 'set', グッズ: 'goods', その他: 'unknown',
})[product.category] as UnitType) || 'unknown'
const productQuantityUnit = (product: Product) => {
  const unitType = unitFromProduct(product)
  if (unitType === 'pack') return 'パック'
  if (unitType === 'card') return '枚'
  return '個'
}
const legacyCategoryFromProduct = (product: Product) => {
  const unitType = unitFromProduct(product)
  if (unitType === 'card') return '싱글 카드'
  if (['pack', 'box', 'deck', 'set'].includes(unitType)) return '팩・박스'
  if (unitType === 'goods') return '굿즈・기타'
  return '포켓몬 외'
}
const tradeTime = (trade: Trade) => {
  if (trade.date) {
    const parsed = Date.parse(trade.date)
    if (Number.isFinite(parsed)) return parsed
  }
  if (trade.createdAt) {
    const parsed = Date.parse(trade.createdAt)
    if (Number.isFinite(parsed)) return parsed
  }
  return trade.sortOrder || 0
}
const newestFirst = (a: Trade, b: Trade) => Number(Boolean(b.date)) - Number(Boolean(a.date)) || tradeTime(b) - tradeTime(a)

function readTrades(): Trade[] {
  try {
    const saved = localStorage.getItem(TRADE_STORAGE)
    if (!saved) return []
    const parsed: Trade[] = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    return parsed.map((trade, index) => {
      const name = jaText(trade.name)
      return {
        ...trade,
        name,
        category: trade.category,
        group: jaText(trade.group || trade.name),
        note: jaText(trade.note || ''),
        unitType: trade.unitType || inferUnitType(name, trade.category),
        sortOrder: trade.sortOrder ?? index + 1,
      }
    })
  } catch {
    return []
  }
}

function readCategoryMasters(): CategoryMaster[] {
  try {
    const saved = localStorage.getItem(CATEGORY_STORAGE)
    if (!saved) return defaultCategories.map(category => ({ ...category }))
    const parsed: CategoryMaster[] = JSON.parse(saved)
    if (!Array.isArray(parsed) || !parsed.length) return defaultCategories.map(category => ({ ...category }))
    const merged = [...parsed]
    defaultCategories.forEach(defaultCategory => {
      if (!merged.some(category => category.id === defaultCategory.id || normalize(category.name) === normalize(defaultCategory.name))) merged.push(defaultCategory)
    })
    return mergePackAndBoxCategories(merged)
  } catch {
    return defaultCategories.map(category => ({ ...category }))
  }
}

function readSourceMasters(trades: Trade[]): SourceMaster[] {
  try {
    const saved = localStorage.getItem(SOURCE_STORAGE)
    const names = [...new Set(['その他', ...trades.map(trade => sourceLabel(trade.source))])]
    const parsed: SourceMaster[] = saved ? JSON.parse(saved) : []
    const masters = Array.isArray(parsed) ? parsed.map(source => ({ ...source, aliases: source.aliases || [] })) : []
    names.forEach(name => {
      const existing = masters.find(source => sourceMatches(source, name))
      if (existing) return
      masters.push({
        id: stableSourceId(name),
        name,
        active: true,
        sortOrder: masters.length + 1,
        aliases: Object.entries(sourceLabels).filter(([, label]) => label === name).map(([alias]) => alias),
      })
    })
    return masters.length ? masters : defaultSources
  } catch {
    return defaultSources
  }
}

function createProductsFromTrades(trades: Trade[], categories: CategoryMaster[] = defaultCategories): Product[] {
  const seen = new Set<string>()
  const products: Product[] = []
  trades.forEach(trade => {
    const name = getProductName(trade)
    const category = productCategoryFromTrade(trade)
    const key = `${category}|${normalize(name)}`
    if (!name || seen.has(key)) return
    seen.add(key)
    const master = categoryForName(categories, category)
    products.push({
      id: `migrated-product-${products.length + 1}`,
      name,
      category,
      categoryId: master?.id,
      unitType: master?.unitType || getUnitType(trade),
      expectedPrice: legacyPackPriceForProduct(name),
    })
  })
  return products.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

function readProducts(trades: Trade[], categories: CategoryMaster[]): Product[] {
  try {
    const saved = localStorage.getItem(PRODUCT_STORAGE)
    const savedProducts: Product[] = saved ? JSON.parse(saved) : []
    const migratedProducts: Product[] = savedProducts.map(product => {
      const matchingSetTrade = product.category === 'その他' && trades.find(trade => getUnitType(trade) === 'set' && normalize(getProductName(trade)) === normalize(product.name))
      const legacyBox = product.categoryId === 'cat-box' || normalize(product.category) === normalize('ボックス') || product.unitType === 'box'
      const categoryName = matchingSetTrade ? 'セット' : product.category
      const master = matchingSetTrade
        ? categoryForName(categories, 'セット')
        : legacyBox
          ? undefined
          : categories.find(category => category.id === product.categoryId) || categoryForName(categories, categoryName)
      return {
        ...product,
        category: master?.name || categoryName,
        categoryId: master?.id || product.categoryId,
        unitType: matchingSetTrade ? 'set' : legacyBox ? 'box' : product.unitType || master?.unitType || 'unknown',
      }
    })
    const savedIds = new Set(migratedProducts.map(product => product.id))
    const unlinkedTrades = trades.filter(trade => !trade.productId || !savedIds.has(trade.productId))
    const derivedProducts = createProductsFromTrades(unlinkedTrades, categories)
    const merged = [...migratedProducts]
    derivedProducts.forEach(product => {
      const alreadyExists = merged.some(savedProduct => savedProduct.category === product.category && normalize(savedProduct.name) === normalize(product.name))
      if (!alreadyExists) merged.push({ ...product, id: `migrated-product-${merged.length + 1}` })
    })
    const products = merged.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    return products
  } catch {
    return createProductsFromTrades(trades, categories)
  }
}

function readCollection(): CollectionData {
  try {
    const saved = localStorage.getItem(COLLECTION_STORAGE)
    if (saved) return JSON.parse(saved)
    return {
      hiddenProductIds: [],
      manualCards: localStorage.getItem(TRADE_STORAGE)
        ? legacyCollectionFallback.map(card => ({ ...card }))
        : [],
    }
  } catch {
    return { hiddenProductIds: [], manualCards: [] }
  }
}

function readRealizedOverrides(): Record<string, RealizedOverride> {
  try {
    const saved = localStorage.getItem(REALIZED_STORAGE)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isUnitType = (value: unknown): value is UnitType => legacyUnitTypes.includes(value as UnitType)
const readBoxConversion = (value: unknown): Trade['boxConversion'] => {
  if (
    !isRecord(value)
    || value.version !== 1
    || typeof value.originalQuantity !== 'number'
    || value.originalQuantity <= 0
    || typeof value.packsPerBox !== 'number'
    || value.packsPerBox <= 0
  ) return undefined
  return {
    version: 1,
    originalQuantity: value.originalQuantity,
    packsPerBox: value.packsPerBox,
  }
}

class LegacyImportError extends Error {
  constructor() {
    super('legacy_data_invalid')
    this.name = 'LegacyImportError'
  }
}

function assertLegacyStorageReadable() {
  const arrayKeys = new Set([TRADE_STORAGE, PRODUCT_STORAGE, CATEGORY_STORAGE, SOURCE_STORAGE])
  for (const key of legacyStorageKeys) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new LegacyImportError()
    }
    if (arrayKeys.has(key) && !Array.isArray(parsed)) throw new LegacyImportError()
    if (!arrayKeys.has(key) && !isRecord(parsed)) throw new LegacyImportError()
    if (key === TRADE_STORAGE && (parsed as unknown[]).some(item =>
      !isRecord(item)
      || typeof item.id !== 'string'
      || typeof item.name !== 'string'
      || typeof item.category !== 'string'
      || !['buy', 'sell'].includes(String(item.type))
      || typeof item.amount !== 'number'
      || typeof item.quantity !== 'number'
      || typeof item.source !== 'string',
    )) throw new LegacyImportError()
    if (key === PRODUCT_STORAGE && (parsed as unknown[]).some(item =>
      !isRecord(item)
      || typeof item.id !== 'string'
      || typeof item.name !== 'string'
      || typeof item.category !== 'string',
    )) throw new LegacyImportError()
    if (key === CATEGORY_STORAGE && (parsed as unknown[]).some(item =>
      !isRecord(item)
      || typeof item.id !== 'string'
      || typeof item.name !== 'string'
      || !isUnitType(item.unitType),
    )) throw new LegacyImportError()
    if (key === SOURCE_STORAGE && (parsed as unknown[]).some(item =>
      !isRecord(item)
      || typeof item.id !== 'string'
      || typeof item.name !== 'string',
    )) throw new LegacyImportError()
    if (key === COLLECTION_STORAGE && isRecord(parsed)) {
      if (!Array.isArray(parsed.hiddenProductIds) || !Array.isArray(parsed.manualCards)) throw new LegacyImportError()
      if (parsed.manualCards.some(item =>
        !isRecord(item)
        || typeof item.id !== 'string'
        || typeof item.name !== 'string'
        || typeof item.quantity !== 'number'
        || typeof item.expectedPrice !== 'number',
      )) throw new LegacyImportError()
    }
  }
}

function emptyPortfolio(): PortfolioState {
  return {
    schemaVersion: 2,
    trades: [],
    categories: defaultCategories.map(category => ({ ...category })),
    products: [],
    sources: defaultSources.map(source => ({ ...source, aliases: [...source.aliases] })),
    collection: { hiddenProductIds: [], manualCards: [] },
    realizedOverrides: {},
  }
}

function isPristinePortfolio(portfolio: PortfolioState) {
  const categoriesAreDefault = portfolio.categories.length === defaultCategories.length
    && portfolio.categories.every((category, index) => {
      const fallback = defaultCategories[index]
      return Boolean(fallback)
        && category.id === fallback.id
        && category.name === fallback.name
        && category.unitType === fallback.unitType
        && category.active === fallback.active
        && category.sortOrder === fallback.sortOrder
    })
  const sourcesAreDefault = portfolio.sources.length === defaultSources.length
    && portfolio.sources.every((source, index) => {
      const fallback = defaultSources[index]
      return Boolean(fallback)
        && source.id === fallback.id
        && source.name === fallback.name
        && source.active === fallback.active
        && source.sortOrder === fallback.sortOrder
        && source.aliases.length === fallback.aliases.length
        && source.aliases.every((alias, aliasIndex) => alias === fallback.aliases[aliasIndex])
    })

  return portfolio.trades.length === 0
    && portfolio.products.length === 0
    && portfolio.collection.manualCards.length === 0
    && portfolio.collection.hiddenProductIds.length === 0
    && Object.keys(portfolio.realizedOverrides).length === 0
    && categoriesAreDefault
    && sourcesAreDefault
}

function normalizePortfolio(value: unknown): PortfolioState {
  if (!isRecord(value)) return emptyPortfolio()

  const categories: CategoryMaster[] = Array.isArray(value.categories)
    ? value.categories.filter(isRecord).flatMap((item, index) => {
        if (typeof item.id !== 'string' || typeof item.name !== 'string') return []
        return [{
          id: item.id,
          name: item.name,
          unitType: isUnitType(item.unitType) ? item.unitType : 'unknown',
          active: item.active !== false,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index + 1,
        }]
      })
    : []
  const safeCategories = mergePackAndBoxCategories(categories.length ? categories : defaultCategories.map(category => ({ ...category })))

  const sources: SourceMaster[] = Array.isArray(value.sources)
    ? value.sources.filter(isRecord).flatMap((item, index) => {
        if (typeof item.id !== 'string' || typeof item.name !== 'string') return []
        return [{
          id: item.id,
          name: item.name,
          active: item.active !== false,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index + 1,
          aliases: Array.isArray(item.aliases) ? item.aliases.filter(alias => typeof alias === 'string') : [],
        }]
      })
    : []
  const safeSources = sources.length ? sources : defaultSources.map(source => ({ ...source, aliases: [...source.aliases] }))

  type MigratingProduct = Product & { migrationOrigin: 'pack' | 'box' | 'other'; originalIndex: number }
  const packCategory = categoryForName(safeCategories, 'パック')
  const hasMappedBoxTrade = (productId: string, productName: string) => Array.isArray(value.trades) && value.trades.some(rawTrade => {
    if (
      !isRecord(rawTrade)
      || rawTrade.packQuantityVersion === 1
      || readBoxConversion(rawTrade.boxConversion)
      || typeof rawTrade.id !== 'string'
      || !legacyMemoBoxPacks.has(rawTrade.id)
      || isSpecialPackSet(
        typeof rawTrade.group === 'string' ? rawTrade.group : undefined,
        typeof rawTrade.name === 'string' ? rawTrade.name : undefined,
      )
    ) return false
    if (rawTrade.productId === productId) return true
    if (typeof rawTrade.productId === 'string') return false
    if (rawTrade.id !== 'memo-2') return false
    const tradeNames = [
      typeof rawTrade.group === 'string' ? rawTrade.group : '',
      typeof rawTrade.name === 'string' ? rawTrade.name : '',
    ].map(boxLookupName)
    const targetName = boxLookupName(productName)
    return tradeNames.includes(targetName)
  })
  const productCandidates: MigratingProduct[] = Array.isArray(value.products)
    ? value.products.filter(isRecord).flatMap((item, index) => {
        if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.category !== 'string') return []
        const rawCategoryId = typeof item.categoryId === 'string' ? item.categoryId : undefined
        const rawUnitType = isUnitType(item.unitType) ? item.unitType : undefined
        const canUseMappedBoxTrade = !['card', 'deck', 'set', 'goods'].includes(rawUnitType || 'unknown')
          && !['カード', 'スタートデッキ', 'セット', 'グッズ'].includes(item.category)
        const legacyBox = rawCategoryId === 'cat-box'
          || normalize(item.category) === normalize('ボックス')
          || rawUnitType === 'box'
          || (canUseMappedBoxTrade && hasMappedBoxTrade(item.id, item.name))
        const explicitPack = rawCategoryId === 'cat-pack' || normalize(item.category) === normalize('パック')
        const currentCategory = rawCategoryId
          ? safeCategories.find(category => category.id === rawCategoryId)
          : categoryForName(safeCategories, item.category)
        const targetCategory = legacyBox || explicitPack ? packCategory : currentCategory
        const migrationOrigin = legacyBox ? 'box' : explicitPack || rawUnitType === 'pack' ? 'pack' : 'other'
        const rawExpectedPrice = typeof item.expectedPrice === 'number' && Number.isFinite(item.expectedPrice) ? Math.max(0, item.expectedPrice) : 0
        const packsPerBox = migrationOrigin === 'box' ? officialPacksPerBox(item.name) : undefined
        return [{
          id: item.id,
          name: item.name,
          category: targetCategory?.name || canonicalCategoryName(item.category),
          categoryId: targetCategory?.id || (rawCategoryId === 'cat-box' ? 'cat-pack' : rawCategoryId),
          unitType: canonicalUnitType(rawUnitType || targetCategory?.unitType),
          expectedPrice: packsPerBox ? rawExpectedPrice / packsPerBox : rawExpectedPrice,
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
          migrationOrigin,
          originalIndex: index,
        }]
      })
    : []
  const productGroups = new Map<string, { firstIndex: number; candidates: MigratingProduct[] }>()
  productCandidates.forEach(product => {
    const key = product.categoryId === 'cat-pack' || normalize(product.category) === normalize('パック')
      ? `cat-pack|${normalize(product.name)}`
      : `product|${product.id}`
    const group = productGroups.get(key)
    if (group) group.candidates.push(product)
    else productGroups.set(key, { firstIndex: product.originalIndex, candidates: [product] })
  })
  const hasUnconvertedBoxPriceEvidence = (productName: string) => Array.isArray(value.trades) && value.trades.some(item => {
    if (
      !isRecord(item)
      || item.packQuantityVersion === 1
      || readBoxConversion(item.boxConversion)
      || typeof item.name !== 'string'
    ) return false
    const group = typeof item.group === 'string' ? item.group : ''
    const relatedName = [group, item.name].some(name => {
      const tradeName = compactProductName(name)
      const targetName = compactProductName(productName)
      return tradeName.includes(targetName) || targetName.includes(tradeName)
    })
    if (!relatedName) return false
    return (typeof item.id === 'string' && legacyMemoBoxPacks.has(item.id))
      || item.unitType === 'box'
      || item.category === 'ボックス'
      || /박스|ボックス|(?:^|\s)box(?:\s|$)/i.test(item.name)
  })
  const productIdMap = new Map<string, string>()
  const products: Product[] = [...productGroups.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map(group => {
      const survivor = group.candidates.find(product => product.migrationOrigin === 'pack')
        || group.candidates.find(product => product.migrationOrigin === 'other')
        || group.candidates[0]
      group.candidates.forEach(product => productIdMap.set(product.id, survivor.id))
      const fallbackPrice = group.candidates.find(product => product.expectedPrice > 0)?.expectedPrice || 0
      const fallbackCreatedAt = group.candidates.find(product => product.createdAt)?.createdAt
      const { migrationOrigin: _migrationOrigin, originalIndex: _originalIndex, ...product } = survivor
      const mergedExpectedPrice = product.expectedPrice || fallbackPrice
      return {
        ...product,
        expectedPrice: hasUnconvertedBoxPriceEvidence(product.name)
          ? normalizeLegacyExpectedPrice(product.name, mergedExpectedPrice)
          : mergedExpectedPrice,
        createdAt: product.createdAt || fallbackCreatedAt,
      }
    })
  const productOriginById = new Map(productCandidates.map(product => [product.id, product.migrationOrigin] as const))

  const rawTrades: Trade[] = Array.isArray(value.trades)
    ? value.trades.filter(isRecord).flatMap((item, index) => {
        if (
          typeof item.id !== 'string'
          || typeof item.name !== 'string'
          || typeof item.category !== 'string'
          || typeof item.type !== 'string'
          || !['buy', 'sell'].includes(item.type)
        ) return []
        const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1
        const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? Math.max(0, item.amount) : 0
        const points = typeof item.points === 'number' && Number.isFinite(item.points) ? Math.max(0, item.points) : 0
        const rawUnitType = isUnitType(item.unitType) ? item.unitType : undefined
        const existingConversion = readBoxConversion(item.boxConversion)
        const packQuantityVersion = item.packQuantityVersion === 1 ? 1 : undefined
        const trade: Trade = {
          id: item.id,
          productId: typeof item.productId === 'string' ? item.productId : undefined,
          name: item.name,
          category: canonicalCategoryName(item.category),
          group: typeof item.group === 'string' ? item.group : item.name,
          type: item.type as 'buy' | 'sell',
          amount,
          points,
          quantity,
          unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : undefined,
          date: typeof item.date === 'string' ? item.date : '',
          source: typeof item.source === 'string' ? item.source : 'その他',
          sourceId: typeof item.sourceId === 'string' ? item.sourceId : undefined,
          note: typeof item.note === 'string' ? item.note : '',
          unitType: canonicalUnitType(rawUnitType),
          fee: typeof item.fee === 'number' ? Math.max(0, item.fee) : 0,
          shipping: typeof item.shipping === 'number' ? Math.max(0, item.shipping) : 0,
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index + 1,
          boxConversion: existingConversion,
          packQuantityVersion: existingConversion ? 1 : packQuantityVersion,
        }
        if (existingConversion || packQuantityVersion === 1) return [trade]

        const memoPacksPerBox = isSpecialPackSet(trade.group, trade.name) ? undefined : legacyMemoBoxPacks.get(trade.id)
        const packsPerBox = memoPacksPerBox || officialPacksPerBox(trade.group, trade.name)
        const productWasBox = trade.productId ? productOriginById.get(trade.productId) === 'box' : false
        const boxNamedTrade = /박스|ボックス|(?:^|\s)box(?:\s|$)/i.test(trade.name)
        const legacyMemoBox = (
          Boolean(memoPacksPerBox)
          || (
            officialPacksPerBox(trade.group, trade.name) === 30
            && [trade.group, trade.name].some(name => /ストームエメラルド|ストームエメラルダ/.test(name))
            && trade.type === 'buy'
            && trade.quantity === 2
            && trade.amount === 12000
          )
        )
        const shouldConvertBox = Boolean(
          packsPerBox
          && (rawUnitType === 'box' || item.category === 'ボックス' || productWasBox || boxNamedTrade || legacyMemoBox),
        )
        if (!shouldConvertBox || !packsPerBox) return [trade]

        const convertedQuantity = quantity * packsPerBox
        return [{
          ...trade,
          category: canonicalCategoryName(trade.category),
          unitType: 'pack',
          quantity: convertedQuantity,
          unitPrice: Math.round((amount + points) / convertedQuantity),
          boxConversion: {
            version: 1,
            originalQuantity: quantity,
            packsPerBox,
          },
          packQuantityVersion: 1,
        }]
      })
    : []
  const trades = rawTrades.map(trade => ({
    ...trade,
    productId: trade.productId ? productIdMap.get(trade.productId) || trade.productId : undefined,
  }))

  const linkedTrades = trades.map(trade => {
    const source = sourceForTrade(trade, safeSources)
    const directProduct = trade.productId ? products.find(product => product.id === trade.productId) : undefined
    const matchedProduct = directProduct || products.find(product =>
      normalize(getProductName(trade)) === normalize(product.name)
      && productCategoryFromTrade(trade) === product.category,
    )
    return {
      ...trade,
      productId: matchedProduct?.id || trade.productId,
      sourceId: source?.id || trade.sourceId,
    }
  })

  const collectionValue = isRecord(value.collection) ? value.collection : {}
  const manualCards: ManualCollectionCard[] = Array.isArray(collectionValue.manualCards)
    ? collectionValue.manualCards.filter(isRecord).flatMap(item => {
        if (typeof item.id !== 'string' || typeof item.name !== 'string') return []
        return [{
          id: item.id,
          name: item.name,
          quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
          expectedPrice: typeof item.expectedPrice === 'number' ? Math.max(0, item.expectedPrice) : 0,
        }]
      })
    : []

  const rawOverrides: Record<string, RealizedOverride> = {}
  if (isRecord(value.realizedOverrides)) {
    Object.entries(value.realizedOverrides).forEach(([productId, override]) => {
      if (!isRecord(override)) return
      const cost = typeof override.cost === 'number' && override.cost >= 0 ? override.cost : undefined
      const sale = typeof override.sale === 'number' && override.sale >= 0 ? override.sale : undefined
      if (cost === undefined && sale === undefined) return
      rawOverrides[productId] = { cost, sale }
    })
  }
  const overrides: Record<string, RealizedOverride> = {}
  productGroups.forEach(group => {
    const survivorId = productIdMap.get(group.candidates[0].id) || group.candidates[0].id
    if (group.candidates.length === 1) {
      const override = rawOverrides[group.candidates[0].id]
      if (override) overrides[survivorId] = override
      return
    }
    const hasAmbiguousUnlinkedTrade = rawTrades.some(trade =>
      !trade.productId && group.candidates.some(product => belongsToProduct(trade, product)),
    )
    if (hasAmbiguousUnlinkedTrade) return
    const statsByProductId = new Map(group.candidates.map(product => [product.id, calculateStats(product, rawTrades)]))
    const hasCostOverride = group.candidates.some(product => rawOverrides[product.id]?.cost !== undefined)
    const hasSaleOverride = group.candidates.some(product => rawOverrides[product.id]?.sale !== undefined)
    const costParts = group.candidates.map(product => rawOverrides[product.id]?.cost ?? statsByProductId.get(product.id)?.soldCost ?? null)
    const cost = hasCostOverride && costParts.every((part): part is number => part !== null)
      ? costParts.reduce((sum, part) => sum + part, 0)
      : undefined
    const sale = hasSaleOverride
      ? group.candidates.reduce((sum, product) => sum + (rawOverrides[product.id]?.sale ?? statsByProductId.get(product.id)?.saleNet ?? 0), 0)
      : undefined
    if (cost !== undefined || sale !== undefined) overrides[survivorId] = { cost, sale }
  })
  Object.entries(rawOverrides).forEach(([productId, override]) => {
    if (!productIdMap.has(productId)) overrides[productId] = override
  })

  return {
    schemaVersion: 2,
    trades: linkedTrades,
    categories: safeCategories,
    products,
    sources: safeSources,
    collection: {
      hiddenProductIds: Array.isArray(collectionValue.hiddenProductIds)
        ? [...new Set(collectionValue.hiddenProductIds.filter((id): id is string => typeof id === 'string').map(id => productIdMap.get(id) || id))]
        : [],
      manualCards,
    },
    realizedOverrides: overrides,
  }
}

function hasLegacyBoxPortfolioData(value: unknown) {
  if (!isRecord(value)) return false
  const legacyBoxProductIds = new Set(
    Array.isArray(value.products)
      ? value.products.filter(item =>
          isRecord(item)
          && typeof item.id === 'string'
          && (
            item.categoryId === 'cat-box'
            || item.category === 'ボックス'
            || item.unitType === 'box'
          ),
        ).map(item => String((item as Record<string, unknown>).id))
      : [],
  )
  const hasLegacyCategory = Array.isArray(value.categories) && value.categories.some(item =>
    isRecord(item)
    && (
      item.id === 'cat-box'
      || item.name === 'ボックス'
      || item.unitType === 'box'
    ),
  )
  const hasLegacyProduct = Array.isArray(value.products) && value.products.some(item =>
    isRecord(item)
    && (
      item.categoryId === 'cat-box'
      || item.category === 'ボックス'
      || item.unitType === 'box'
    ),
  )
  const hasLegacyTrade = Array.isArray(value.trades) && value.trades.some(item =>
    isRecord(item)
    && (
      item.category === 'ボックス'
      || item.unitType === 'box'
    ),
  )
  const hasKnownUnconvertedBoxTrade = Array.isArray(value.trades) && value.trades.some(item => {
    if (!isRecord(item) || item.packQuantityVersion === 1 || readBoxConversion(item.boxConversion)) return false
    const name = typeof item.name === 'string' ? item.name : ''
    const group = typeof item.group === 'string' ? item.group : ''
    const memoPacksPerBox = isSpecialPackSet(group, name) || typeof item.id !== 'string'
      ? undefined
      : legacyMemoBoxPacks.get(item.id)
    const packsPerBox = memoPacksPerBox || officialPacksPerBox(group, name)
    if (!packsPerBox) return false
    const legacyMemoBox = (
      Boolean(memoPacksPerBox)
      || (
        [group, name].some(valueName => /ストームエメラルド|ストームエメラルダ/.test(valueName))
        && item.type === 'buy'
        && item.quantity === 2
        && item.amount === 12000
      )
    )
    return item.unitType === 'box'
      || item.category === 'ボックス'
      || (typeof item.productId === 'string' && legacyBoxProductIds.has(item.productId))
      || /박스|ボックス|(?:^|\s)box(?:\s|$)/i.test(name)
      || legacyMemoBox
  })
  return hasLegacyCategory || hasLegacyProduct || hasLegacyTrade || hasKnownUnconvertedBoxTrade
}

type PortfolioDraft = {
  baseRevision: number
  state: PortfolioState
  updatedAt: string
}

function readPortfolioDraft(userId: string): PortfolioDraft | null {
  try {
    const raw = localStorage.getItem(`${CLOUD_DRAFT_PREFIX}${userId}`)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || typeof parsed.baseRevision !== 'number' || !isRecord(parsed.state)) return null
    return {
      baseRevision: parsed.baseRevision,
      state: normalizePortfolio(parsed.state),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    }
  } catch {
    return null
  }
}

function writePortfolioDraft(userId: string, baseRevision: number, state: PortfolioState) {
  try {
    localStorage.setItem(`${CLOUD_DRAFT_PREFIX}${userId}`, JSON.stringify({
      baseRevision,
      state,
      updatedAt: new Date().toISOString(),
    }))
  } catch {
    // Remote saving and the unload warning remain available without local storage.
  }
}

function removePortfolioDraft(userId: string) {
  try {
    localStorage.removeItem(`${CLOUD_DRAFT_PREFIX}${userId}`)
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readLegacyPortfolio(): PortfolioState {
  assertLegacyStorageReadable()
  const trades = readTrades()
  const categories = readCategoryMasters()
  const products = readProducts(trades, categories)
  const sources = readSourceMasters(trades)
  return normalizePortfolio({
    schemaVersion: 1,
    trades,
    categories,
    products,
    sources,
    collection: readCollection(),
    realizedOverrides: readRealizedOverrides(),
  })
}

function hasLegacyData() {
  try {
    return legacyStorageKeys.some(key => localStorage.getItem(key) !== null)
  } catch {
    return false
  }
}

function hasImportableLegacyData() {
  if (!hasLegacyData()) return false
  try {
    const portfolio = readLegacyPortfolio()
    const hasSavedCollection = localStorage.getItem(COLLECTION_STORAGE) !== null
    return portfolio.trades.length > 0
      || portfolio.products.length > 0
      || (hasSavedCollection && portfolio.collection.manualCards.length > 0)
  } catch {
    return false
  }
}

function legacyAvailability(userId: string) {
  try {
    const hasData = hasLegacyData()
    const claimedBy = localStorage.getItem(LEGACY_CLAIM_STORAGE)
    return {
      available: hasData && (!claimedBy || claimedBy === userId),
      claimedByAnotherAccount: hasData && Boolean(claimedBy && claimedBy !== userId),
    }
  } catch {
    return { available: false, claimedByAnotherAccount: false }
  }
}

function markLegacyClaimed(userId: string) {
  try {
    localStorage.setItem(LEGACY_CLAIM_STORAGE, userId)
  } catch {
    // The cloud copy is already saved even when browser storage is unavailable.
  }
}

function getLegacyPreview() {
  try {
    const state = readLegacyPortfolio()
    return {
      readable: true,
      trades: state.trades.length,
      products: state.products.length,
      cards: state.collection.manualCards.length,
    }
  } catch {
    return { readable: false, trades: 0, products: 0, cards: 0 }
  }
}

function belongsToProduct(trade: Trade, product: Product) {
  if (trade.productId) return trade.productId === product.id
  return normalize(getProductName(trade)) === normalize(product.name) && productCategoryFromTrade(trade) === product.category
}

function calculateStats(product: Product, trades: Trade[]): ProductStats {
  const linked = trades.filter(trade => belongsToProduct(trade, product))
  const buyTrades = linked.filter(trade => trade.type === 'buy').sort(newestFirst)
  const sellTrades = linked.filter(trade => trade.type === 'sell').sort(newestFirst)
  const buyQty = buyTrades.reduce((sum, trade) => sum + trade.quantity, 0)
  const sellQty = sellTrades.reduce((sum, trade) => sum + trade.quantity, 0)
  const buyAmount = buyTrades.reduce((sum, trade) => sum + trade.amount, 0)
  const buyCost = buyTrades.reduce((sum, trade) => sum + trade.amount + trade.points + (trade.fee || 0) + (trade.shipping || 0), 0)
  const sellAmount = sellTrades.reduce((sum, trade) => sum + trade.amount, 0)
  const saleNet = sellTrades.reduce((sum, trade) => sum + trade.amount - (trade.fee || 0) - (trade.shipping || 0), 0)
  const validCost = buyQty > 0 && buyQty >= sellQty
  const averageCost = buyQty > 0 ? buyCost / buyQty : null
  const soldCost = validCost ? (averageCost || 0) * sellQty : null
  const stock = Math.max(0, buyQty - sellQty)
  const remainingCost = validCost ? (averageCost || 0) * stock : null
  const realizedProfit = soldCost === null ? null : saleNet - soldCost
  const potentialValue = product.expectedPrice * stock
  const potentialProfit = remainingCost === null ? null : potentialValue - remainingCost
  return {
    product, trades: linked, buyTrades, sellTrades, buyQty, sellQty, stock, buyAmount, buyCost,
    sellAmount, saleNet, averageCost, soldCost, remainingCost, realizedProfit, potentialValue, potentialProfit,
  }
}

const userDisplayName = (user: User) => {
  const metadataName = user.user_metadata.full_name || user.user_metadata.name
  return typeof metadataName === 'string' && metadataName.trim() ? metadataName.trim() : 'Poke Invest ユーザー'
}
const userAvatar = (user: User) => {
  const value = user.user_metadata.avatar_url || user.user_metadata.picture
  return typeof value === 'string' && /^https:\/\//.test(value) ? value : null
}
const friendlyPortfolioError = (error: unknown) => {
  if (error instanceof LegacyImportError) {
    return '端末の既存データの一部を読み取れませんでした。データを上書きせず、元の画面からCSVを保存してからもう一度お試しください。'
  }
  if (error instanceof PortfolioRepositoryError) {
    if (error.code === 'UNSUPPORTED_SCHEMA') {
      return 'この帳簿は新しいバージョンで保存されています。アプリを最新版に更新してから開いてください。'
    }
    if (['42P01', 'PGRST205', 'PGRST202'].includes(error.code || '')) {
      return 'クラウド保存の初期設定が完了していません。Supabaseで付属のSQLを実行してから、もう一度お試しください。'
    }
    if (error.message.includes('portfolio_revision_conflict') || ['40001', 'PT409'].includes(error.code || '')) {
      return '別の端末で新しい変更が保存されています。クラウドから最新データを読み直してください。'
    }
  }
  return 'クラウド帳簿を読み込めませんでした。通信状態を確認して、もう一度お試しください。'
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }

    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError('ログイン状態を確認できませんでした。もう一度お試しください。')
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setAuthReady(true)
      setAuthBusy(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    if (!supabase) return
    setAuthBusy(true)
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setAuthBusy(false)
      setAuthError('Googleログインを開始できませんでした。Supabaseの設定を確認してください。')
    }
  }

  if (!authReady) return <CenteredStatus title="ログイン状態を確認中" />
  if (supabaseConfigError) return <LoginScreen busy={false} error={supabaseConfigError} onLogin={() => undefined} configured={false} />
  if (!session) return <LoginScreen busy={authBusy} error={authError} onLogin={signInWithGoogle} configured />

  return <PortfolioSession key={session.user.id} session={session} />
}

function PortfolioSession({ session }: { session: Session }) {
  const user = session.user
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [legacyState, setLegacyState] = useState(() => legacyAvailability(user.id))
  const [conflictingDraft, setConflictingDraft] = useState<PortfolioDraft | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [ledgerVersion, setLedgerVersion] = useState(0)
  const revisionRef = useRef(0)
  const pendingRef = useRef<PortfolioState | null>(null)
  const timerRef = useRef<number | null>(null)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const flushRef = useRef<() => Promise<boolean>>(async () => true)
  const generationRef = useRef(0)
  const mountedRef = useRef(true)
  const conflictRef = useRef(false)
  const legacyImportRef = useRef(false)

  const clearSaveTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const scheduleSave = (delay = 500) => {
    clearSaveTimer()
    if (conflictRef.current) return
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void flushRef.current()
    }, delay)
  }

  flushRef.current = async () => {
    clearSaveTimer()
    if (inFlightRef.current) {
      const currentSaved = await inFlightRef.current
      if (!currentSaved) return false
      return pendingRef.current ? flushRef.current() : true
    }

    const next = pendingRef.current
    if (!next || conflictRef.current) return !conflictRef.current
    pendingRef.current = null
    if (mountedRef.current) {
      setSaveStatus('saving')
      setSaveError(null)
    }

    const request = (async () => {
      try {
        const result = await savePortfolioSnapshot(user.id, next, revisionRef.current)
        revisionRef.current = result.revision
        return true
      } catch (error) {
        if (!pendingRef.current) pendingRef.current = next
        const conflict = error instanceof PortfolioRepositoryError
          && (['40001', 'PT409'].includes(error.code || '') || error.message.includes('portfolio_revision_conflict'))
        conflictRef.current = conflict
        if (mountedRef.current) {
          setSaveStatus(conflict ? 'conflict' : 'error')
          setSaveError(friendlyPortfolioError(error))
        }
        return false
      }
    })()
    inFlightRef.current = request
    const saved = await request
    inFlightRef.current = null

    if (saved && mountedRef.current) {
      if (pendingRef.current) {
        writePortfolioDraft(user.id, revisionRef.current, pendingRef.current)
        setSaveStatus('pending')
        scheduleSave(120)
      } else {
        removePortfolioDraft(user.id)
        setSaveStatus('saved')
      }
    }
    return saved
  }

  async function refreshCloud(confirmDiscard = false) {
    const hasUnsavedChanges = Boolean(pendingRef.current || inFlightRef.current || conflictRef.current)
    if (confirmDiscard && hasUnsavedChanges && !confirm('未保存の変更を破棄して、クラウドの最新データを読み込みますか？')) return
    if (inFlightRef.current) await inFlightRef.current
    if (!mountedRef.current) return

    const generation = ++generationRef.current
    clearSaveTimer()
    pendingRef.current = null
    conflictRef.current = false
    if (confirmDiscard) {
      removePortfolioDraft(user.id)
      setConflictingDraft(null)
    }
    setLoading(true)
    setLoadError(null)
    setSaveError(null)

    try {
      const snapshot = await loadPortfolioSnapshot<PortfolioState>()
      if (generation !== generationRef.current || !mountedRef.current) return
      if (!snapshot) {
        revisionRef.current = 0
        const draft = confirmDiscard ? null : readPortfolioDraft(user.id)
        if (draft) {
          setPortfolio(emptyPortfolio())
          setSetupRequired(false)
          setConflictingDraft(draft)
          setSaveStatus('conflict')
          setSaveError('クラウドと異なる未保存データがこの端末に残っています。使用するデータを選んでください。')
        } else {
          setPortfolio(null)
          setLegacyState(legacyAvailability(user.id))
          setSetupRequired(true)
          setConflictingDraft(null)
          setSaveStatus('saved')
        }
      } else {
        if (snapshot.schemaVersion > 2) {
          throw new PortfolioRepositoryError('unsupported_portfolio_schema', 'UNSUPPORTED_SCHEMA')
        }
        revisionRef.current = snapshot.revision
        const draft = confirmDiscard ? null : readPortfolioDraft(user.id)
        const recoverDraft = draft?.baseRevision === snapshot.revision
        const requiresPackMigration = !recoverDraft && hasLegacyBoxPortfolioData(snapshot.state)
        const nextPortfolio = recoverDraft && draft ? draft.state : normalizePortfolio(snapshot.state)
        setPortfolio(nextPortfolio)
        setSetupRequired(false)
        setLedgerVersion(version => version + 1)
        if (recoverDraft) {
          setConflictingDraft(null)
          pendingRef.current = nextPortfolio
          setSaveStatus('pending')
          scheduleSave(150)
        } else if (draft) {
          setConflictingDraft(draft)
          setSaveStatus('conflict')
          setSaveError('クラウドと異なる未保存データがこの端末に残っています。使用するデータを選んでください。')
        } else if (requiresPackMigration) {
          setConflictingDraft(null)
          pendingRef.current = nextPortfolio
          writePortfolioDraft(user.id, revisionRef.current, nextPortfolio)
          setSaveStatus('pending')
          scheduleSave(150)
        } else {
          setConflictingDraft(null)
          setSaveStatus('saved')
        }
      }
    } catch (error) {
      if (generation !== generationRef.current || !mountedRef.current) return
      setLoadError(friendlyPortfolioError(error))
    } finally {
      if (generation === generationRef.current && mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    void refreshCloud()
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      clearSaveTimer()
    }
  }, [user.id])

  useEffect(() => {
    if (saveStatus === 'saved') return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [saveStatus])

  const initializePortfolio = async (useLegacy: boolean) => {
    setSetupBusy(true)
    setLoadError(null)
    try {
      const initialPortfolio = useLegacy ? readLegacyPortfolio() : emptyPortfolio()
      const result = await savePortfolioSnapshot(user.id, initialPortfolio, 0)
      revisionRef.current = result.revision
      if (legacyState.available) markLegacyClaimed(user.id)
      removePortfolioDraft(user.id)
      setConflictingDraft(null)
      setPortfolio(initialPortfolio)
      setSetupRequired(false)
      setSaveStatus('saved')
      setLedgerVersion(version => version + 1)
    } catch (error) {
      if (
        error instanceof PortfolioRepositoryError
        && (['40001', 'PT409'].includes(error.code || '') || error.message.includes('portfolio_revision_conflict'))
      ) {
        await refreshCloud()
      } else {
        setLoadError(friendlyPortfolioError(error))
      }
    } finally {
      setSetupBusy(false)
    }
  }

  const handlePortfolioChange = (next: PortfolioState) => {
    setPortfolio(next)
    pendingRef.current = next
    writePortfolioDraft(user.id, revisionRef.current, next)
    if (conflictRef.current) return
    setSaveStatus('pending')
    setSaveError(null)
    scheduleSave()
  }

  const retrySave = () => {
    if (conflictRef.current) {
      void refreshCloud(true)
      return
    }
    void flushRef.current()
  }

  const signOut = async () => {
    clearSaveTimer()
    let saved = true
    if ((pendingRef.current || inFlightRef.current) && !conflictRef.current) saved = await flushRef.current()
    if (conflictRef.current) saved = false
    if (!saved && !confirm('クラウドに保存できていない変更があります。このままログアウトしますか？')) return
    const { error } = await supabase?.auth.signOut({ scope: 'local' }) || {}
    if (error) alert('ログアウトできませんでした。通信状態を確認して、もう一度お試しください。')
  }

  if (loading) return <CenteredStatus title="クラウド帳簿を読み込み中" />
  if (loadError) {
    return <CloudErrorScreen
      message={loadError}
      onRetry={() => void refreshCloud()}
      onSignOut={signOut}
    />
  }
  if (conflictingDraft) {
    return <DraftRecoveryScreen
      draft={conflictingDraft}
      hasCloudSnapshot={revisionRef.current > 0}
      onUseCloud={() => void refreshCloud(true)}
      onRecover={() => {
        if (!confirm('この端末の未保存データでクラウド帳簿を更新しますか？')) return
        const recovered = conflictingDraft.state
        writePortfolioDraft(user.id, revisionRef.current, recovered)
        pendingRef.current = recovered
        setPortfolio(recovered)
        setConflictingDraft(null)
        setSaveError(null)
        setSaveStatus('pending')
        setSetupRequired(false)
        setLedgerVersion(version => version + 1)
        scheduleSave(100)
      }}
      onSignOut={signOut}
    />
  }
  if (setupRequired || !portfolio) {
    return <PortfolioSetupScreen
      user={user}
      legacyAvailable={legacyState.available}
      claimedByAnotherAccount={legacyState.claimedByAnotherAccount}
      legacyPreview={legacyState.available ? getLegacyPreview() : null}
      busy={setupBusy}
      onImport={() => void initializePortfolio(true)}
      onStart={() => {
        if (
          legacyState.available
          && !confirm('この端末の既存データを取り込まず、空の帳簿を作成しますか？\n\n既存データは端末に残り、帳簿が空の間はホーム上部から読み込めます。')
        ) return
        void initializePortfolio(false)
      }}
      onSignOut={signOut}
    />
  }

  const restoreLegacy = async () => {
    if (legacyImportRef.current) return
    if (
      saveStatus !== 'saved'
      || pendingRef.current
      || inFlightRef.current
      || conflictRef.current
    ) {
      alert('クラウド保存が完了してから、もう一度お試しください。')
      return
    }
    if (!hasImportableLegacyData()) {
      alert('このブラウザに既存データが見つかりませんでした。\n\n以前の帳簿を使用していたブラウザ・同じURLから、もう一度お試しください。')
      return
    }
    const overwriteWarning = isPristinePortfolio(portfolio)
      ? '現在の空の帳簿は既存データで置き換わります。'
      : '現在の取引・商品・カテゴリーなど、帳簿の内容はすべて既存データで置き換わります。この操作は元に戻せません。'
    if (!confirm(`このブラウザの既存データを、現在のGoogleアカウントに読み込みますか？\n\n${overwriteWarning}`)) return
    legacyImportRef.current = true
    clearSaveTimer()
    setLoading(true)
    setLoadError(null)
    try {
      const legacyPortfolio = readLegacyPortfolio()
      const result = await savePortfolioSnapshot(user.id, legacyPortfolio, revisionRef.current)
      revisionRef.current = result.revision
      markLegacyClaimed(user.id)
      removePortfolioDraft(user.id)
      setPortfolio(legacyPortfolio)
      setSaveStatus('saved')
      setLedgerVersion(version => version + 1)
    } catch (error) {
      setLoadError(friendlyPortfolioError(error))
    } finally {
      legacyImportRef.current = false
      setLoading(false)
    }
  }

  return <LedgerApp
    key={`${user.id}-${ledgerVersion}`}
    initialPortfolio={portfolio}
    user={user}
    saveStatus={saveStatus}
    saveError={saveError}
    onPortfolioChange={handlePortfolioChange}
    onRetrySave={retrySave}
    onReloadCloud={() => void refreshCloud(true)}
    onSignOut={signOut}
    onRestoreLegacy={() => void restoreLegacy()}
  />
}

function CenteredStatus({ title }: { title: string }) {
  return <div className="auth-shell">
    <div className="auth-status" role="status">
      <LoaderCircle className="spin" size={25} />
      <strong>{title}</strong>
    </div>
  </div>
}

function LoginScreen({ busy, error, configured, onLogin }: {
  busy: boolean
  error: string | null
  configured: boolean
  onLogin: () => void
}) {
  return <div className="auth-shell">
    <main className="auth-card">
      <div className="auth-brand"><span className="brand-mark"><i /></span><strong>Poke Invest</strong></div>
      <div className="auth-copy">
        <span className="auth-badge"><ShieldCheck size={14} /> 個人用ポートフォリオ</span>
        <h1>コレクション投資を、<br />ひとつの場所で。</h1>
        <p>購入・売却・在庫・コレクションを、あなた専用のクラウド帳簿で管理できます。</p>
      </div>
      {error && <div className="auth-error" role="alert"><CloudOff size={17} /><span>{error}</span></div>}
      <button className="google-login" disabled={busy || !configured} onClick={onLogin}>
        {busy ? <LoaderCircle className="spin" size={19} /> : <LogIn size={19} />}
        {busy ? 'Googleに接続中…' : 'Googleでログイン'}
      </button>
      <small className="auth-privacy">ログインにはGoogleのメールアドレスと基本プロフィールのみを使用します。</small>
    </main>
  </div>
}

function PortfolioSetupScreen({ user, legacyAvailable, claimedByAnotherAccount, legacyPreview, busy, onImport, onStart, onSignOut }: {
  user: User
  legacyAvailable: boolean
  claimedByAnotherAccount: boolean
  legacyPreview: ReturnType<typeof getLegacyPreview> | null
  busy: boolean
  onImport: () => void
  onStart: () => void
  onSignOut: () => void
}) {
  return <div className="auth-shell">
    <main className="auth-card setup-card">
      <AccountIdentity user={user} />
      <div className="auth-copy">
        <span className="auth-badge"><Cloud size={14} /> 初回設定</span>
        <h1>このアカウントの<br />帳簿を準備します。</h1>
        <p>一度作成すると、このGoogleアカウントでログインした端末から同じデータを確認できます。</p>
      </div>
      {legacyPreview?.readable && <div className="legacy-preview">
        <span><b>{legacyPreview.trades.toLocaleString()}</b><small>取引履歴</small></span>
        <span><b>{legacyPreview.products.toLocaleString()}</b><small>商品</small></span>
        <span><b>{legacyPreview.cards.toLocaleString()}</b><small>手動カード</small></span>
      </div>}
      {legacyAvailable && legacyPreview && !legacyPreview.readable && <p className="setup-warning">既存データの一部を読み取れません。元の画面からCSVを保存してから、データを確認してください。</p>}
      {legacyAvailable && <button className="setup-primary" disabled={busy || !legacyPreview?.readable} onClick={onImport}>
        {busy ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}
        この端末の既存データを取り込む
      </button>}
      <button className={legacyAvailable ? 'setup-secondary' : 'setup-primary'} disabled={busy} onClick={onStart}>
        {busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
        新しい空の帳簿を始める
      </button>
      {claimedByAnotherAccount && <p className="setup-warning">このブラウザの既存データは別のアカウントに取り込み済みです。空の帳簿を作成すると、ホーム上部から同じデータを読み込めます。</p>}
      {legacyAvailable && <p className="setup-note">既存データは、クラウド保存が確認できるまで端末から削除しません。</p>}
      <button className="auth-signout" disabled={busy} onClick={onSignOut}><LogOut size={15} /> 別のアカウントを使う</button>
    </main>
  </div>
}

function CloudErrorScreen({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return <div className="auth-shell">
    <main className="auth-card compact-auth-card">
      <span className="cloud-error-icon"><CloudOff size={26} /></span>
      <div className="auth-copy"><h1>帳簿を開けませんでした。</h1><p>{message}</p></div>
      <button className="setup-primary" onClick={onRetry}><RefreshCw size={17} /> もう一度読み込む</button>
      <button className="auth-signout" onClick={onSignOut}><LogOut size={15} /> ログアウト</button>
    </main>
  </div>
}

function DraftRecoveryScreen({ draft, hasCloudSnapshot, onUseCloud, onRecover, onSignOut }: {
  draft: PortfolioDraft
  hasCloudSnapshot: boolean
  onUseCloud: () => void
  onRecover: () => void
  onSignOut: () => void
}) {
  const updatedAt = Date.parse(draft.updatedAt)
  return <div className="auth-shell">
    <main className="auth-card compact-auth-card draft-recovery-card">
      <span className="cloud-error-icon draft-icon"><RefreshCw size={26} /></span>
      <div className="auth-copy">
        <h1>未保存データが見つかりました。</h1>
        <p>アプリ終了前の変更がこの端末に残っています。内容を確認して、使用するデータを選んでください。</p>
      </div>
      <div className="draft-summary">
        <span><b>{draft.state.trades.length.toLocaleString()}</b><small>取引履歴</small></span>
        <span><b>{draft.state.products.length.toLocaleString()}</b><small>商品</small></span>
        <span><b>{draft.state.collection.manualCards.length.toLocaleString()}</b><small>手動カード</small></span>
      </div>
      {Number.isFinite(updatedAt) && <p className="draft-time">端末保存：{new Date(updatedAt).toLocaleString('ja-JP')}</p>}
      <button className="setup-primary" onClick={onRecover}><RefreshCw size={17} /> この端末の未保存データを復元</button>
      <button className="setup-secondary" onClick={onUseCloud}><Cloud size={17} /> {hasCloudSnapshot ? 'クラウドの最新データを使う' : '未保存データを破棄して新規作成'}</button>
      <button className="auth-signout" onClick={onSignOut}><LogOut size={15} /> ログアウト</button>
    </main>
  </div>
}

function AccountIdentity({ user }: { user: User }) {
  const avatar = userAvatar(user)
  return <div className="account-identity">
    {avatar
      ? <img src={avatar} alt="" referrerPolicy="no-referrer" />
      : <span><UserRound size={19} /></span>}
    <div><strong>{userDisplayName(user)}</strong><small>{user.email || 'Googleアカウント'}</small></div>
  </div>
}

function LedgerApp({ initialPortfolio, user, saveStatus, saveError, onPortfolioChange, onRetrySave, onReloadCloud, onSignOut, onRestoreLegacy }: {
  initialPortfolio: PortfolioState
  user: User
  saveStatus: SaveStatus
  saveError: string | null
  onPortfolioChange: (next: PortfolioState) => void
  onRetrySave: () => void
  onReloadCloud: () => void
  onSignOut: () => void
  onRestoreLegacy?: () => void
}) {
  const [trades, setTrades] = useState<Trade[]>(initialPortfolio.trades)
  const [categories, setCategories] = useState<CategoryMaster[]>(initialPortfolio.categories)
  const [products, setProducts] = useState<Product[]>(initialPortfolio.products)
  const [sources, setSources] = useState<SourceMaster[]>(initialPortfolio.sources)
  const [collection, setCollection] = useState<CollectionData>(initialPortfolio.collection)
  const [realizedOverrides, setRealizedOverrides] = useState<Record<string, RealizedOverride>>(initialPortfolio.realizedOverrides)
  const lastPortfolioRef = useRef(initialPortfolio)
  const [tab, setTab] = useState<Tab>('home')
  const [transactionSide, setTransactionSide] = useState<'buy' | 'sell'>('buy')
  const [productModal, setProductModal] = useState<Product | 'new' | null>(null)
  const [tradeModal, setTradeModal] = useState<{ product: Product; type: 'buy' | 'sell'; trade: Trade | null } | null>(null)
  const [entryType, setEntryType] = useState<'buy' | 'sell' | null>(null)
  const [collectionModal, setCollectionModal] = useState<ManualCollectionCard | 'new' | null>(null)
  const [realizedModal, setRealizedModal] = useState<ProductStats | null>(null)
  const [showProductManager, setShowProductManager] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('すべて')
  const [sourceFilter, setSourceFilter] = useState<string>('すべて')
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const hasOpenModal = Boolean(productModal || tradeModal || entryType || collectionModal || realizedModal)

  useEffect(() => {
    if (!hasOpenModal) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [hasOpenModal])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [tab, showProductManager])

  useEffect(() => {
    const previous = lastPortfolioRef.current
    if (
      previous.trades === trades
      && previous.categories === categories
      && previous.products === products
      && previous.sources === sources
      && previous.collection === collection
      && previous.realizedOverrides === realizedOverrides
    ) return
    const next: PortfolioState = {
      schemaVersion: 2,
      trades,
      categories,
      products,
      sources,
      collection,
      realizedOverrides,
    }
    lastPortfolioRef.current = next
    onPortfolioChange(next)
  }, [categories, collection, onPortfolioChange, products, realizedOverrides, sources, trades])

  useEffect(() => {
    let changed = false
    const linkedTrades = trades.map(trade => {
      const source = sourceForTrade(trade, sources)
      if (!source || trade.sourceId === source.id) return trade
      changed = true
      return { ...trade, sourceId: source.id }
    })
    if (!changed) return
    setTrades(linkedTrades)
  }, [sources, trades])

  const stats = useMemo(() => products.map(product => calculateStats(product, trades)), [products, trades])
  const activeCategories = categories.filter(category => category.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const activeSources = sources.filter(source => source.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const categoryNameForProduct = (product: Product) => categories.find(category => category.id === product.categoryId)?.name || product.category
  const productHasActiveCategory = (product: Product) => activeCategories.some(category => category.id === product.categoryId || (!product.categoryId && normalize(category.name) === normalize(product.category)))
  const realizedValues = (item: ProductStats): RealizedDisplay => {
    const override = realizedOverrides[item.product.id]
    const cost = override?.cost !== undefined ? override.cost : item.soldCost
    const sale = override?.sale !== undefined ? override.sale : item.saleNet
    return { cost, sale, profit: cost === null ? null : sale - cost, overridden: Boolean(override) }
  }
  const totals = useMemo(() => {
    const totalPurchase = trades
      .filter(trade => trade.type === 'buy')
      .reduce((sum, trade) => sum + trade.amount, 0)
    const totalSale = trades
      .filter(trade => trade.type === 'sell')
      .reduce((sum, trade) => sum + trade.amount, 0)
    return {
      totalPurchase,
      totalSale,
      transactionBalance: totalSale - totalPurchase,
    }
  }, [trades])
  const newestProductStats = stats.slice().reverse().sort((a, b) => {
    const aTime = a.product.createdAt ? Date.parse(a.product.createdAt) : Number.NaN
    const bTime = b.product.createdAt ? Date.parse(b.product.createdAt) : Number.NaN
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime
    if (Number.isFinite(aTime)) return -1
    if (Number.isFinite(bTime)) return 1
    return 0
  })
  const recentProductStats = newestProductStats.slice(0, 5)
  const filteredStats = stats.filter(item => {
    const productCategoryId = item.product.categoryId || categoryForName(categories, item.product.category)?.id
    const matchesCategory = categoryFilter === 'すべて' || productCategoryId === categoryFilter
    const target = `${item.product.name} ${categoryNameForProduct(item.product)}`.toLocaleLowerCase('ja-JP')
    return matchesCategory && target.includes(query.toLocaleLowerCase('ja-JP'))
  })

  const persistTrades = (next: Trade[]) => {
    setTrades(next)
  }
  const persistProducts = (next: Product[]) => {
    setProducts(next)
  }
  const persistCategories = (next: CategoryMaster[]) => {
    setCategories(next)
  }
  const persistSources = (next: SourceMaster[]) => {
    setSources(next)
  }
  const persistCollection = (next: CollectionData) => {
    setCollection(next)
  }
  const persistRealizedOverrides = (next: Record<string, RealizedOverride>) => {
    setRealizedOverrides(next)
  }
  const saveProduct = (product: Product) => {
    const existing = products.find(item => item.id === product.id)
    if (products.some(item => item.id !== product.id && (item.categoryId || item.category) === (product.categoryId || product.category) && normalize(item.name) === normalize(product.name))) {
      alert('同じカテゴリーに同名の商品がすでにあります。')
      return false
    }
    if (existing && (existing.name !== product.name || existing.category !== product.category)) {
      persistTrades(trades.map(trade => belongsToProduct(trade, existing) ? { ...trade, productId: product.id } : trade))
    }
    persistProducts(existing ? products.map(item => item.id === product.id ? product : item) : [...products, product])
    setProductModal(null)
    return true
  }
  const addCategory = (name: string, unitType: UnitType) => {
    const clean = name.trim()
    if (!clean) return
    if (normalize(clean) === normalize('ボックス')) {
      alert('「ボックス」は「パック」に統合されています。「パック」を使用してください。')
      return
    }
    const canonicalType = canonicalUnitType(unitType) || 'unknown'
    const existing = categories.find(category => normalize(category.name) === normalize(clean))
    if (existing) {
      if (!existing.active) {
        persistCategories(categories.map(category => category.id === existing.id ? { ...category, unitType: canonicalType, active: true } : category))
        persistProducts(products.map(product => product.categoryId === existing.id ? { ...product, unitType: canonicalType } : product))
      } else alert('同名のカテゴリーがすでにあります。')
      return
    }
    persistCategories([...categories, { id: crypto.randomUUID(), name: clean, unitType: canonicalType, active: true, sortOrder: categories.length + 1 }])
  }
  const toggleCategory = (id: string) => {
    const target = categories.find(category => category.id === id)
    if (!target) return
    if (target.active && activeCategories.length <= 1) {
      alert('最低1つの有効なカテゴリーが必要です。')
      return
    }
    persistCategories(categories.map(category => category.id === id ? { ...category, active: !category.active } : category))
    if (categoryFilter === id) setCategoryFilter('すべて')
  }
  const addSource = (name: string) => {
    const clean = name.trim()
    if (!clean) return
    const existing = sources.find(source => sourceMatches(source, clean))
    if (existing) {
      if (!existing.active) persistSources(sources.map(source => source.id === existing.id ? { ...source, active: true } : source))
      else alert('同名の取引先がすでにあります。')
      return
    }
    persistSources([...sources, { id: crypto.randomUUID(), name: clean, active: true, sortOrder: sources.length + 1, aliases: [] }])
  }
  const toggleSource = (id: string) => {
    const target = sources.find(source => source.id === id)
    if (!target) return
    if (target.active && activeSources.length <= 1) {
      alert('最低1つの有効な取引先が必要です。')
      return
    }
    persistSources(sources.map(source => source.id === id ? { ...source, active: !source.active } : source))
    if (sourceFilter === id) setSourceFilter('すべて')
  }
  const deleteProduct = (product: Product) => {
    const item = stats.find(stat => stat.product.id === product.id)
    if (item?.trades.length) {
      alert('購入・売却履歴がある商品は削除できません。先に履歴を削除してください。')
      return
    }
    if (confirm(`「${product.name}」を削除しますか？`)) {
      persistProducts(products.filter(item => item.id !== product.id))
      setProductModal(null)
    }
  }
  const setExpectedPrice = (productId: string, value: number) => {
    persistProducts(products.map(product => product.id === productId ? { ...product, expectedPrice: value } : product))
  }
  const saveRealizedOverride = (productId: string, value: RealizedOverride) => {
    const next = { ...realizedOverrides }
    if (value.cost === undefined && value.sale === undefined) delete next[productId]
    else next[productId] = value
    persistRealizedOverrides(next)
    setRealizedModal(null)
  }
  const hideCollectionProduct = (product: Product) => {
    if (confirm(`「${product.name}」をコレクションから外しますか？\n購入・売却履歴は削除されません。`)) {
      persistCollection({ ...collection, hiddenProductIds: [...new Set([...collection.hiddenProductIds, product.id])] })
    }
  }
  const restoreCollectionProduct = (productId: string) => {
    persistCollection({ ...collection, hiddenProductIds: collection.hiddenProductIds.filter(id => id !== productId) })
    setCollectionModal(null)
  }
  const saveManualCard = (card: ManualCollectionCard) => {
    const exists = collection.manualCards.some(item => item.id === card.id)
    persistCollection({ ...collection, manualCards: exists ? collection.manualCards.map(item => item.id === card.id ? card : item) : [...collection.manualCards, card] })
    setCollectionModal(null)
  }
  const deleteManualCard = (card: ManualCollectionCard) => {
    if (confirm(`「${card.name}」をコレクションから削除しますか？`)) {
      persistCollection({ ...collection, manualCards: collection.manualCards.filter(item => item.id !== card.id) })
      setCollectionModal(null)
    }
  }
  const saveTrade = (trade: Trade) => {
    const existing = trades.some(item => item.id === trade.id)
    persistTrades(existing ? trades.map(item => item.id === trade.id ? trade : item) : [trade, ...trades])
    setTradeModal(null)
  }
  const saveTradeEntry = (product: Product, trade: Trade, isNewProduct: boolean) => {
    const nextProducts = isNewProduct ? [...products, product] : products
    const nextTrades = [trade, ...trades]
    setProducts(nextProducts)
    setTrades(nextTrades)
    setEntryType(null)
  }
  const deleteTrade = (trade: Trade, product: Product) => {
    const item = calculateStats(product, trades)
    if (trade.type === 'buy' && item.buyQty - trade.quantity < item.sellQty) {
      alert('この購入履歴を削除すると販売数が在庫数を超えるため、削除できません。')
      return
    }
    if (confirm('この履歴を削除しますか？')) {
      persistTrades(trades.filter(item => item.id !== trade.id))
      setTradeModal(null)
    }
  }
  const exportCsv = (type?: 'buy' | 'sell') => {
    const target = type ? trades.filter(trade => trade.type === type) : trades
    const header = ['区分', '商品名', 'カテゴリー', '換算後数量', '単位', '元のBOX数', '1BOXパック数', '現金合計', 'ポイント', '購入・販売先', '日付', 'メモ']
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = target.map(trade => {
      const product = products.find(item => item.id === trade.productId) || products.find(item => belongsToProduct(trade, item))
      return [
        trade.type === 'buy' ? '購入' : '売却', trade.name, product ? categoryNameForProduct(product) : productCategoryFromTrade(trade), trade.quantity,
        product ? productQuantityUnit(product) : '個', trade.boxConversion?.originalQuantity || '', trade.boxConversion?.packsPerBox || '',
        trade.amount, trade.points, displaySource(trade, sources), trade.date, trade.note || '',
      ].map(escape).join(',')
    })
    const blob = new Blob(['\ufeff' + [header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `pokeinvest-${type || 'all'}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const openTab = (nextTab: Tab) => {
    setTab(nextTab)
    if (nextTab === 'home') setShowProductManager(false)
    if (nextTab === 'transactions') {
      setHistoryKey(null)
    }
  }
  const saveLabel: Record<SaveStatus, string> = {
    saved: '保存済み',
    pending: '未保存',
    saving: '保存中',
    error: '保存失敗',
    conflict: '更新あり',
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><i /></span><strong>Poke Invest</strong></div>
      <div className={`sync-pill ${saveStatus}`} role="status">
        {saveStatus === 'saving'
          ? <LoaderCircle className="spin" size={13} />
          : saveStatus === 'error' || saveStatus === 'conflict'
            ? <CloudOff size={13} />
            : <Cloud size={13} />}
        <span>{saveLabel[saveStatus]}</span>
      </div>
    </header>
    {saveError && <div className={`sync-banner ${saveStatus === 'conflict' ? 'conflict' : ''}`} role="alert">
      <span>{saveError}</span>
      <div>
        {saveStatus !== 'conflict' && <button onClick={onRetrySave}><RefreshCw size={13} /> 再保存</button>}
        <button onClick={onReloadCloud}><Cloud size={13} /> 最新を読込</button>
      </div>
    </div>}

    <main>
      {tab === 'home' && (showProductManager ? <ProductManagementPage
        stats={newestProductStats}
        categoryNameForProduct={categoryNameForProduct}
        onBack={() => setShowProductManager(false)}
        onEdit={setProductModal}
      /> : <>
        {onRestoreLegacy && <button type="button" className="legacy-home-import" onClick={onRestoreLegacy}>
          <span className="legacy-home-icon"><Download size={18} /></span>
          <span><strong>既存データを読み込む</strong><small>このブラウザに残っている以前の帳簿を、このアカウントへコピーします。</small></span>
          <ChevronRight size={18} />
        </button>}
        <section className="hero">
          <p className="eyebrow">TRANSACTION BALANCE</p>
          <span className="hero-label">取引収支</span>
          <h1 className={totals.transactionBalance >= 0 ? 'positive' : 'negative'}>{signedYen(totals.transactionBalance)}</h1>
          <div className="hero-stats">
            <div><span>購入総額</span><strong>{yen(totals.totalPurchase)}</strong></div>
            <div><span>売却総額</span><strong>{yen(totals.totalSale)}</strong></div>
            <div><span>差額</span><strong>{signedYen(totals.transactionBalance)}</strong></div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div><p className="eyebrow">PRODUCT MASTER</p><h2>商品情報</h2><span className="count-label">最近追加した商品 · 最大5件</span></div>
            <button className="product-manage-button" onClick={() => setShowProductManager(true)}>商品管理 <ChevronRight size={15} /></button>
          </div>
          <div className="product-master">
            <ProductMasterRows
              stats={recentProductStats}
              categoryNameForProduct={categoryNameForProduct}
              onEdit={setProductModal}
              emptyText="商品情報がありません。"
            />
          </div>
        </section>

      </>)}

      {tab === 'transactions' && <TransactionPage
        type={transactionSide}
        onType={setTransactionSide}
        stats={filteredStats.filter(item => transactionSide === 'buy' ? item.buyTrades.length > 0 : item.sellTrades.length > 0)}
        query={query}
        categoryFilter={categoryFilter}
        sourceFilter={sourceFilter}
        categories={activeCategories}
        sources={activeSources}
        historyKey={historyKey}
        onQuery={setQuery}
        onCategory={setCategoryFilter}
        onSource={setSourceFilter}
        onHistory={setHistoryKey}
        onAdd={(product, type) => setTradeModal({ product, type, trade: null })}
        onEdit={(product, type, trade) => setTradeModal({ product, type, trade })}
        onDelete={(product, trade) => deleteTrade(trade, product)}
        getRealizedValues={realizedValues}
        onEditRealized={setRealizedModal}
        onRegister={() => setEntryType(transactionSide)}
        onExport={() => exportCsv(transactionSide)}
      />}

      {tab === 'collection' && <CollectionPage
        stats={stats.filter(item => unitFromProduct(item.product) === 'card' && !collection.hiddenProductIds.includes(item.product.id))}
        manualCards={collection.manualCards}
        onEditPrice={setExpectedPrice}
        onAdd={() => setCollectionModal('new')}
        onEditManual={setCollectionModal}
        onHideProduct={hideCollectionProduct}
      />}
      {tab === 'profile' && <SettingsPage
        user={user}
        categories={categories}
        sources={sources}
        onAddCategory={addCategory}
        onToggleCategory={toggleCategory}
        onAddSource={addSource}
        onToggleSource={toggleSource}
        onSignOut={onSignOut}
      />}
    </main>

    <nav className="bottom-nav">
      <button className={tab === 'home' ? 'active' : ''} onClick={() => openTab('home')}><Home /><span>ホーム</span></button>
      <button className={tab === 'transactions' ? 'active' : ''} onClick={() => openTab('transactions')}><ArrowLeftRight /><span>取引履歴</span></button>
      <button className={tab === 'collection' ? 'active' : ''} onClick={() => openTab('collection')}><Images /><span>コレクション</span></button>
      <button className={tab === 'profile' ? 'active' : ''} onClick={() => openTab('profile')}><UserRound /><span>マイページ</span></button>
    </nav>

    {productModal && <ProductModal
      product={productModal === 'new' ? null : productModal}
      categories={categories}
      onClose={() => setProductModal(null)}
      onSave={saveProduct}
      onDelete={deleteProduct}
    />}
    {tradeModal && <TradeModal
      product={tradeModal.product}
      stats={calculateStats(tradeModal.product, trades)}
      type={tradeModal.type}
      trade={tradeModal.trade}
      onClose={() => setTradeModal(null)}
      onSave={saveTrade}
      onDelete={trade => deleteTrade(trade, tradeModal.product)}
      sources={sources}
    />}
    {entryType && <TradeEntryModal
      type={entryType}
      products={products.filter(productHasActiveCategory)}
      stats={stats}
      categories={activeCategories}
      sources={activeSources}
      onClose={() => setEntryType(null)}
      onSave={saveTradeEntry}
    />}
    {collectionModal && <CollectionModal
      card={collectionModal === 'new' ? null : collectionModal}
      hiddenProducts={stats.filter(item => unitFromProduct(item.product) === 'card' && collection.hiddenProductIds.includes(item.product.id)).map(item => item.product)}
      onClose={() => setCollectionModal(null)}
      onSave={saveManualCard}
      onDelete={deleteManualCard}
      onRestore={restoreCollectionProduct}
    />}
    {realizedModal && <RealizedProfitModal
      item={realizedModal}
      override={realizedOverrides[realizedModal.product.id]}
      onClose={() => setRealizedModal(null)}
      onSave={value => saveRealizedOverride(realizedModal.product.id, value)}
    />}
  </div>
}

function ProductMasterRows({ stats, categoryNameForProduct, onEdit, emptyText }: {
  stats: ProductStats[]
  categoryNameForProduct: (product: Product) => string
  onEdit: (product: Product) => void
  emptyText: string
}) {
  return <>
    {stats.map(item => <article className="master-row" key={item.product.id}>
      <button className="master-info" onClick={() => onEdit(item.product)}>
        <strong>{item.product.name}</strong><small>{categoryNameForProduct(item.product)} · 在庫 {item.stock.toLocaleString()}{productQuantityUnit(item.product)}</small>
      </button>
      <button className="row-edit" aria-label={`${item.product.name}の商品情報を編集`} onClick={() => onEdit(item.product)}><Pencil size={14} /></button>
    </article>)}
    {!stats.length && <div className="empty">{emptyText}</div>}
  </>
}

function ProductManagementPage({ stats, categoryNameForProduct, onBack, onEdit }: {
  stats: ProductStats[]
  categoryNameForProduct: (product: Product) => string
  onBack: () => void
  onEdit: (product: Product) => void
}) {
  const [query, setQuery] = useState('')
  const matchingStats = stats
    .filter(item => `${item.product.name} ${categoryNameForProduct(item.product)}`.toLocaleLowerCase('ja-JP').includes(query.trim().toLocaleLowerCase('ja-JP')))
  return <section className="page section product-management-page">
    <button className="product-management-back" onClick={onBack}><ChevronLeft size={17} /> ホームに戻る</button>
    <div className="page-title-row product-management-title"><div><p className="eyebrow">PRODUCT MASTER</p><h1>商品管理</h1></div><span className="count-label">{stats.length}商品</span></div>
    <p className="page-description">商品の検索と商品情報の編集ができます。</p>
    <div className="search-box"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="商品名・カテゴリーで検索" /></div>
    <div className="product-manager-meta"><span>新しい商品は取引履歴の登録時に追加できます。</span><b>{matchingStats.length} / {stats.length}商品</b></div>
    <div className="product-master product-manager-list">
      <ProductMasterRows
        stats={matchingStats}
        categoryNameForProduct={categoryNameForProduct}
        onEdit={onEdit}
        emptyText={query ? '条件に一致する商品がありません。' : '商品情報がありません。'}
      />
    </div>
  </section>
}

function TransactionPage({
  type, onType, stats, query, categoryFilter, sourceFilter, categories, sources, historyKey,
  onQuery, onCategory, onSource, onHistory, onAdd, onEdit, onDelete, getRealizedValues, onEditRealized, onRegister, onExport,
}: {
  type: 'buy' | 'sell'; onType: (value: 'buy' | 'sell') => void; stats: ProductStats[]; query: string
  categoryFilter: string; sourceFilter: string; categories: CategoryMaster[]; sources: SourceMaster[]; historyKey: string | null
  onQuery: (value: string) => void; onCategory: (value: string) => void; onSource: (value: string) => void
  onHistory: (value: string | null) => void; onAdd: (product: Product, type: 'buy' | 'sell') => void
  onEdit: (product: Product, type: 'buy' | 'sell', trade: Trade) => void; onDelete: (product: Product, trade: Trade) => void
  getRealizedValues: (item: ProductStats) => RealizedDisplay; onEditRealized: (item: ProductStats) => void
  onRegister: () => void; onExport: () => void
}) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; ignore: boolean } | null>(null)
  const [sortBySide, setSortBySide] = useState<Record<'buy' | 'sell', TransactionSort>>({ buy: 'latest', sell: 'latest' })
  const isBuy = type === 'buy'
  const sortBy = sortBySide[type]
  const switchType = (next: 'buy' | 'sell') => { onType(next); onHistory(null) }
  const visibleStats = stats.filter(item => {
    if (sourceFilter === 'すべて') return true
    const histories = isBuy ? item.buyTrades : item.sellTrades
    return histories.some(trade => sourceForTrade(trade, sources)?.id === sourceFilter)
  })
  const historiesFor = (item: ProductStats) => (isBuy ? item.buyTrades : item.sellTrades).filter(trade => sourceFilter === 'すべて' || sourceForTrade(trade, sources)?.id === sourceFilter)
  const saleValuesFor = (item: ProductStats, histories: Trade[]): RealizedDisplay => {
    if (sourceFilter === 'すべて') return getRealizedValues(item)
    const quantity = histories.reduce((sum, trade) => sum + trade.quantity, 0)
    const sale = histories.reduce((sum, trade) => sum + trade.amount - (trade.fee || 0) - (trade.shipping || 0), 0)
    const cost = item.soldCost === null || item.averageCost === null ? null : item.averageCost * quantity
    return { cost, sale, profit: cost === null ? null : sale - cost, overridden: false }
  }
  const sortValues = new Map(visibleStats.map(item => {
    const histories = historiesFor(item)
    const quantity = histories.reduce((sum, trade) => sum + trade.quantity, 0)
    const amount = isBuy
      ? histories.reduce((sum, trade) => sum + trade.amount, 0)
      : saleValuesFor(item, histories).sale
    return [item.product.id, {
      newest: histories.length ? Math.max(...histories.map(tradeTime)) : 0,
      quantity,
      amount,
      unitPrice: quantity > 0 ? amount / quantity : 0,
    }] as const
  }))
  visibleStats.sort((a, b) => {
    const aValues = sortValues.get(a.product.id)!
    const bValues = sortValues.get(b.product.id)!
    const byName = a.product.name.localeCompare(b.product.name, 'ja')
    if (sortBy === 'oldest') return aValues.newest - bValues.newest || byName
    if (sortBy === 'amount-desc') return bValues.amount - aValues.amount || bValues.newest - aValues.newest || byName
    if (sortBy === 'amount-asc') return aValues.amount - bValues.amount || bValues.newest - aValues.newest || byName
    if (sortBy === 'unit-desc') return bValues.unitPrice - aValues.unitPrice || bValues.newest - aValues.newest || byName
    if (sortBy === 'quantity-desc') return bValues.quantity - aValues.quantity || bValues.newest - aValues.newest || byName
    if (sortBy === 'name') return byName
    return bValues.newest - aValues.newest || byName
  })
  const saleEntries = isBuy ? [] : visibleStats.map(item => ({ item, values: saleValuesFor(item, historiesFor(item)) }))
  const confirmedSaleEntries = saleEntries.filter(entry => entry.values.profit !== null)
  const saleSummary = {
    cost: confirmedSaleEntries.reduce((sum, entry) => sum + (entry.values.cost || 0), 0),
    sale: confirmedSaleEntries.reduce((sum, entry) => sum + entry.values.sale, 0),
    profit: confirmedSaleEntries.reduce((sum, entry) => sum + (entry.values.profit || 0), 0),
  }
  return <section className="page section transaction-page" onTouchStart={event => {
    const touch = event.touches[0]
    if (!touch) return
    const target = event.target as HTMLElement
    setTouchStart({ x: touch.clientX, y: touch.clientY, ignore: Boolean(target.closest('.category-chips, input, select, .page-actions button, .transaction-switch button, .sale-table-scroll, .history-toggle, .history-edit, .history-delete, .history-add-row button')) })
  }} onTouchEnd={event => {
    if (!touchStart) return
    const touch = event.changedTouches[0]
    const distanceX = (touch?.clientX ?? touchStart.x) - touchStart.x
    const distanceY = (touch?.clientY ?? touchStart.y) - touchStart.y
    if (!touchStart.ignore && Math.abs(distanceX) > 70 && Math.abs(distanceX) > Math.abs(distanceY) * 1.25) switchType(distanceX < 0 ? 'sell' : 'buy')
    setTouchStart(null)
  }}>
    <div className="page-title-row"><div><p className="eyebrow">TRANSACTION HISTORY</p><h1>取引履歴</h1></div><div className="page-actions"><button className="register-button" onClick={onRegister}><Plus size={15} /> 履歴登録</button><button className="export-button" onClick={onExport}><Download size={15} /> CSV</button></div></div>
    <div className="transaction-switch"><button aria-label="購入へ" disabled={isBuy} onClick={() => switchType('buy')}><ChevronLeft size={18} /></button><div><button className={isBuy ? 'active buy' : ''} onClick={() => switchType('buy')}>購入</button><button className={!isBuy ? 'active sell' : ''} onClick={() => switchType('sell')}>売却</button></div><button aria-label="売却へ" disabled={!isBuy} onClick={() => switchType('sell')}><ChevronRight size={18} /></button></div>
    <p className="page-description">左右のボタンまたはスワイプで購入・売却を切り替えられます。</p>
    <div className="search-box"><Search size={17} /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="商品名を検索" /></div>
    <div className="filter-label"><Tag size={12} /> 商品カテゴリー</div>
    <div className="category-chips"><button className={categoryFilter === 'すべて' ? 'active' : ''} onClick={() => onCategory('すべて')}>すべて</button>{categories.map(category => <button className={categoryFilter === category.id ? 'active' : ''} key={category.id} onClick={() => onCategory(category.id)}>{category.name}</button>)}</div>
    <div className="filter-label"><MapPin size={12} /> {isBuy ? '購入先' : '販売先'}</div>
    <div className="category-chips source-chips"><button className={sourceFilter === 'すべて' ? 'active' : ''} onClick={() => onSource('すべて')}>すべて</button>{sources.map(source => <button className={sourceFilter === source.id ? 'active' : ''} key={source.id} onClick={() => onSource(source.id)}>{source.name}</button>)}</div>
    <div className="transaction-list-controls">
      <span>{visibleStats.length.toLocaleString()}商品</span>
      <label className="transaction-sort"><ArrowUpDown size={13} /><span>並び順</span><select aria-label={`${isBuy ? '購入' : '売却'}一覧の並び順`} value={sortBy} onChange={event => setSortBySide(current => ({ ...current, [type]: event.target.value as TransactionSort }))}>
        <option value="latest">最新順</option>
        <option value="oldest">古い順</option>
        <option value="amount-desc">取引金額が高い順</option>
        <option value="amount-asc">取引金額が低い順</option>
        <option value="unit-desc">平均単価が高い順</option>
        <option value="quantity-desc">数量が多い順</option>
        <option value="name">商品名順</option>
      </select></label>
    </div>
    {!isBuy && <div className="sale-performance-card">
      <div className="sale-performance-head"><span>売却済み商品の損益</span><b>原価確認 {confirmedSaleEntries.length}/{saleEntries.length}</b></div>
      <div className="realized-summary">
        <div><span>購入原価</span><strong>{yen(saleSummary.cost)}</strong></div>
        <div><span>売却額</span><strong>{yen(saleSummary.sale)}</strong></div>
        <div><span>実現損益</span><strong className={saleSummary.profit >= 0 ? 'positive' : 'negative'}>{signedYen(saleSummary.profit)}</strong></div>
      </div>
      {sourceFilter !== 'すべて' && <p>販売先で絞り込み中は自動計算値を表示します。手動設定の編集は「すべて」に戻して行えます。</p>}
    </div>}
    <div className={`transaction-panel ${isBuy ? 'slide-buy' : 'slide-sell'}`}>
      {isBuy ? <>
        <div className="ledger-head buy"><span>商品名 / カテゴリー</span><span>購入数</span><span>合計</span><span /></div>
        <div className="ledger-products">
          {visibleStats.map(item => {
            const key = `${type}|${item.product.id}`
            const histories = historiesFor(item)
            const filteredQuantity = histories.reduce((sum, trade) => sum + trade.quantity, 0)
            const filteredAmount = histories.reduce((sum, trade) => sum + trade.amount, 0)
            const activeCategory = categories.find(category => category.id === item.product.categoryId || (!item.product.categoryId && normalize(category.name) === normalize(item.product.category)))
            const canAddTransaction = Boolean(activeCategory)
            const categoryName = activeCategory?.name || `${item.product.category}（削除済み）`
            return <article className="ledger-product" key={item.product.id}>
              <div className="ledger-main buy">
                <button className="ledger-add" disabled={!canAddTransaction} onClick={() => onAdd(item.product, type)}>
                  <span className="ledger-name"><strong>{item.product.name}</strong><small>{categoryName}</small></span>
                  <b>{filteredQuantity.toLocaleString()}</b><b>{yen(filteredAmount)}</b>
                </button>
                <button className={`history-toggle ${historyKey === key ? 'active' : ''}`} aria-label={`${item.product.name}の履歴`} onClick={() => onHistory(historyKey === key ? null : key)}><ChevronDown size={15} /></button>
              </div>
              {historyKey === key && <TradeHistory product={item.product} type={type} histories={histories} sources={sources} canAddTransaction={canAddTransaction} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />}
            </article>
          })}
          {!visibleStats.length && <div className="empty">購入履歴がありません。<br />上の「履歴登録」から追加できます。</div>}
        </div>
      </> : <div className="sale-table-scroll" role="region" aria-label="売却商品一覧。横にスクロールできます。" tabIndex={0}>
        <table className="sale-table">
          <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
          <thead><tr><th scope="col">商品 / カテゴリー</th><th scope="col">販売数</th><th scope="col">購入原価</th><th scope="col">売却純額</th><th scope="col">利益</th><th scope="col"><span className="sr-only">履歴</span></th></tr></thead>
          {visibleStats.map(item => {
            const key = `${type}|${item.product.id}`
            const histories = historiesFor(item)
            const filteredQuantity = histories.reduce((sum, trade) => sum + trade.quantity, 0)
            const saleValues = saleValuesFor(item, histories)
            const activeCategory = categories.find(category => category.id === item.product.categoryId || (!item.product.categoryId && normalize(category.name) === normalize(item.product.category)))
            const canAddTransaction = Boolean(activeCategory)
            const categoryName = activeCategory?.name || `${item.product.category}（削除済み）`
            const canEditProfit = sourceFilter === 'すべて'
            return <tbody className={saleValues.overridden ? 'overridden' : ''} key={item.product.id}>
              <tr>
                <th scope="row" className="sale-product-cell"><button disabled={!canAddTransaction} onClick={() => onAdd(item.product, type)}><strong>{item.product.name}</strong><small>{categoryName}{canAddTransaction ? ' · ＋売却' : ''}</small>{saleValues.overridden && <em>手動設定</em>}</button></th>
                <td>{filteredQuantity.toLocaleString()}</td>
                <td className={`sale-editable-cell ${saleValues.cost === null ? 'warning' : ''}`}><button className="sale-value-button" disabled={!canEditProfit} onClick={() => onEditRealized(item)} aria-label={`${item.product.name}の購入原価を編集`}>{saleValues.cost === null ? '未確認' : yen(saleValues.cost)}</button></td>
                <td className="sale-editable-cell"><button className="sale-value-button" disabled={!canEditProfit} onClick={() => onEditRealized(item)} aria-label={`${item.product.name}の売却額を編集`}>{yen(saleValues.sale)}</button></td>
                <td className={`sale-editable-cell ${saleValues.profit === null ? 'warning' : saleValues.profit >= 0 ? 'positive' : 'negative'}`}><button className="sale-value-button sale-profit-button" disabled={!canEditProfit} onClick={() => onEditRealized(item)} aria-label={`${item.product.name}の売却損益を編集`}>{saleValues.profit === null ? '—' : signedYen(saleValues.profit)}{canEditProfit && <Pencil size={11} />}</button></td>
                <td className="sale-history-cell"><button className={`history-toggle ${historyKey === key ? 'active' : ''}`} aria-label={`${item.product.name}の履歴`} aria-expanded={historyKey === key} aria-controls={`sale-history-${item.product.id}`} onClick={() => onHistory(historyKey === key ? null : key)}><ChevronDown size={15} /></button></td>
              </tr>
              {historyKey === key && <tr className="sale-history-row"><td colSpan={6}><TradeHistory id={`sale-history-${item.product.id}`} product={item.product} type={type} histories={histories} sources={sources} canAddTransaction={canAddTransaction} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} /></td></tr>}
            </tbody>
          })}
          {!visibleStats.length && <tbody><tr><td colSpan={6}><div className="empty">売却履歴がありません。<br />上の「履歴登録」から追加できます。</div></td></tr></tbody>}
        </table>
      </div>}
    </div>
    <p className="page-hint">{isBuy ? '新しい商品は「履歴登録」で商品情報と取引を同時に登録できます。' : '表は横にスクロールできます。購入原価・売却純額・利益のセルを押すと、売却損益だけを手動設定できます。取引履歴の金額は変更されません。'}</p>
  </section>
}

function TradeHistory({ id, product, type, histories, sources, canAddTransaction, onAdd, onEdit, onDelete }: {
  id?: string; product: Product; type: 'buy' | 'sell'; histories: Trade[]; sources: SourceMaster[]; canAddTransaction: boolean
  onAdd: (product: Product, type: 'buy' | 'sell') => void
  onEdit: (product: Product, type: 'buy' | 'sell', trade: Trade) => void
  onDelete: (product: Product, trade: Trade) => void
}) {
  const isBuy = type === 'buy'
  return <div className="trade-history" id={id}>
    <div className="history-add-row"><span>{isBuy ? '購入履歴' : '売却履歴'} · {histories.length}件</span><button disabled={!canAddTransaction} onClick={() => onAdd(product, type)}><Plus size={13} /> {isBuy ? '購入履歴を追加' : '売却履歴を追加'}</button></div>
    {histories.map(trade => {
      const conversion = trade.boxConversion
      const quantityLabel = conversion
        ? `${trade.quantity.toLocaleString()}パック（${conversion.originalQuantity.toLocaleString()}BOX）`
        : `${trade.quantity.toLocaleString()}${productQuantityUnit(product)}`
      const unitQuantity = conversion?.originalQuantity || trade.quantity
      const unitLabel = conversion ? 'BOX単価' : '単価'
      return <div className="trade-history-item" key={trade.id}>
        <button className="history-edit" onClick={() => onEdit(product, type, trade)}><span><strong>{trade.date || '日付未入力'}</strong><small>{displaySource(trade, sources)} · {quantityLabel} · {unitLabel} {yen((trade.amount + (isBuy ? trade.points : 0)) / unitQuantity)}{trade.points ? ` · ${trade.points.toLocaleString()}p使用` : ''}</small></span><b>{yen(trade.amount)}</b><Pencil size={13} /></button>
        <button className="history-delete" aria-label={`${trade.date || '日付未入力'}の履歴を削除`} onClick={() => onDelete(product, trade)}><Trash2 size={13} /></button>
      </div>
    })}
  </div>
}

function TradeEntryModal({ type, products, stats, categories, sources, onClose, onSave }: {
  type: 'buy' | 'sell'; products: Product[]; stats: ProductStats[]; categories: CategoryMaster[]; sources: SourceMaster[]
  onClose: () => void; onSave: (product: Product, trade: Trade, isNewProduct: boolean) => void
}) {
  const isBuy = type === 'buy'
  const [mode, setMode] = useState<'existing' | 'new'>(products.length ? 'existing' : 'new')
  const [productId, setProductId] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState('')
  const [points, setPoints] = useState('')
  const [date, setDate] = useState(localDateString)
  const [sourceId, setSourceId] = useState('')
  const [note, setNote] = useState('')
  const [entryUnit, setEntryUnit] = useState<EntryUnit>('pack')
  const [allowUnconfirmedSale, setAllowUnconfirmedSale] = useState(false)
  const selectedProduct = products.find(product => product.id === productId)
  const selectedStats = stats.find(item => item.product.id === productId)
  const selectedCategory = categories.find(category => category.id === categoryId)
  const packProduct = mode === 'existing'
    ? Boolean(selectedProduct && unitFromProduct(selectedProduct) === 'pack')
    : canonicalUnitType(selectedCategory?.unitType) === 'pack'
  const packsPerBox = packProduct ? officialPacksPerBox(mode === 'existing' ? selectedProduct?.name : name) : undefined
  const usingBox = entryUnit === 'box' && Boolean(packsPerBox)
  const requestedQuantity = (Number(quantity) || 0) * (usingBox ? packsPerBox || 1 : 1)
  const changeEntryUnit = (nextUnit: EntryUnit) => {
    setEntryUnit(nextUnit)
    setQuantity('1')
    setAllowUnconfirmedSale(false)
  }
  const matchingProducts = products.filter(product => `${product.name} ${product.category}`.toLocaleLowerCase('ja-JP').includes(productQuery.toLocaleLowerCase('ja-JP'))).slice(0, 50)
  const needsUnconfirmedSale = !isBuy && (mode === 'new' || Boolean(selectedStats && requestedQuantity > selectedStats.stock))
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={event => {
    event.preventDefault()
    const enteredQuantity = Number(quantity) || 0
    const qty = enteredQuantity * (usingBox ? packsPerBox || 1 : 1)
    const cash = Number(amount) || 0
    const usedPoints = isBuy ? Number(points) || 0 : 0
    if (qty <= 0) { alert('数量を入力してください。'); return }
    if (cash <= 0 && usedPoints <= 0) { alert('取引金額または使用ポイントを入力してください。'); return }
    if (mode === 'existing' && !selectedProduct) { alert('商品を選択してください。'); return }
    if (needsUnconfirmedSale && !allowUnconfirmedSale) { alert('在庫外売却として記録することを確認してください。'); return }
    const category = categories.find(item => item.id === categoryId)
    const source = sources.find(item => item.id === sourceId)
    let product = selectedProduct
    let isNewProduct = false
    if (mode === 'new') {
      if (!name.trim()) { alert('商品名を入力してください。'); return }
      if (!category) { alert('商品カテゴリーを選択してください。'); return }
      if (products.some(item => (item.categoryId === category.id || (!item.categoryId && normalize(item.category) === normalize(category.name))) && normalize(item.name) === normalize(name))) { alert('同じカテゴリーに同名の商品があります。'); return }
      product = { id: crypto.randomUUID(), name: name.trim(), category: category.name, categoryId: category.id, unitType: category.unitType, expectedPrice: 0, createdAt: new Date().toISOString() }
      isNewProduct = true
    }
    if (!product) return
    if (!source) { alert(`${isBuy ? '購入先' : '販売先'}を選択してください。`); return }
    onSave(product, {
      id: crypto.randomUUID(), productId: product.id, type, name: product.name, group: product.name,
      category: legacyCategoryFromProduct(product), unitType: unitFromProduct(product), quantity: qty, amount: cash,
      points: usedPoints, unitPrice: Math.round((cash + usedPoints) / qty), date, source: source.name, sourceId: source.id,
      note: note.trim(), fee: 0, shipping: 0, createdAt: new Date().toISOString(), sortOrder: Date.now(),
      boxConversion: usingBox && packsPerBox ? { version: 1, originalQuantity: enteredQuantity, packsPerBox } : undefined,
      packQuantityVersion: packProduct ? 1 : undefined,
    }, isNewProduct)
  }}>
    <div className="modal-head"><div><p className="eyebrow">{isBuy ? 'PURCHASE' : 'SALES'} RECORD</p><h2>{isBuy ? '購入履歴を登録' : '売却履歴を登録'}</h2></div><button type="button" onClick={onClose}><X /></button></div>
    <div className="entry-mode"><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => { setMode('existing'); setEntryUnit('pack') }}>既存商品</button><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => { setMode('new'); setEntryUnit('pack') }}>新規商品</button></div>
    {mode === 'existing' ? <div className="existing-product-picker">
      <label className="field">商品検索<div className="entry-search"><Search size={15} /><input value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="商品名・カテゴリーで検索" /></div></label>
      <div className="entry-product-list">{matchingProducts.map(product => <button type="button" className={productId === product.id ? 'active' : ''} key={product.id} onClick={() => { setProductId(product.id); setEntryUnit('pack') }}><span><strong>{product.name}</strong><small>{product.category}</small></span>{productId === product.id && <span className="selected-mark">選択中</span>}</button>)}{!matchingProducts.length && <div className="empty">商品が見つかりません。</div>}</div>
      {!isBuy && selectedStats && <small className={`field-help ${requestedQuantity > selectedStats.stock ? 'warning' : ''}`}>現在庫 {selectedStats.stock.toLocaleString()}{productQuantityUnit(selectedStats.product)}。{requestedQuantity > selectedStats.stock ? '在庫を超える分は原価未確認として記録されます。' : '購入履歴がない販売は原価未確認として記録されます。'}</small>}
    </div> : <div className="new-product-fields"><label className="field">商品名<input required value={name} onChange={event => setName(event.target.value)} placeholder="例：イーブイex SAR" /></label><label className="field">商品カテゴリー<select required value={categoryId} onChange={event => { setCategoryId(event.target.value); setEntryUnit('pack') }}><option value="">選択してください</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>{!isBuy && <small className="field-help warning">購入履歴がないため、購入原価未確認の売却として記録されます。</small>}</div>}
    {packsPerBox && <label className="field">登録単位<select value={entryUnit} onChange={event => changeEntryUnit(event.target.value as EntryUnit)}><option value="pack">パック</option><option value="box">BOX（1BOX＝{packsPerBox}パック）</option></select></label>}
    <div className="form-grid"><label className="field">{usingBox ? 'BOX数' : packProduct ? 'パック数' : '数量'}<input required inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} />{usingBox && <small>{requestedQuantity.toLocaleString()}パックとして在庫計算</small>}</label><label className="field">総額（¥）<input inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label></div>
    {needsUnconfirmedSale && <label className="unconfirmed-check"><input type="checkbox" checked={allowUnconfirmedSale} onChange={event => setAllowUnconfirmedSale(event.target.checked)} /><span><strong>在庫外売却として記録</strong><small>購入原価は未確認となり、取引履歴の販売リストから確認・編集できます。</small></span></label>}
    {isBuy && <label className="field">使用ポイント<input inputMode="numeric" value={points} onChange={event => setPoints(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label>}
    <label className="field">日付<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="field">{isBuy ? '購入先' : '販売先'}<select required value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">選択してください</option>{sources.map(source => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
    <label className="field">メモ<input value={note} onChange={event => setNote(event.target.value)} placeholder="状態・セット内容など" /></label>
    {mode === 'new' && <p className="modal-note">保存すると商品情報と取引履歴が同時に作成されます。</p>}
    <button className="submit-button" type="submit">{mode === 'new' ? `商品と${isBuy ? '購入' : '売却'}履歴を保存` : `${isBuy ? '購入' : '売却'}履歴を保存`}</button>
  </form></div>
}

function RealizedProfitModal({ item, override, onClose, onSave }: {
  item: ProductStats
  override?: RealizedOverride
  onClose: () => void
  onSave: (value: RealizedOverride) => void
}) {
  const [cost, setCost] = useState(override?.cost !== undefined ? String(override.cost) : '')
  const [sale, setSale] = useState(override?.sale !== undefined ? String(override.sale) : '')
  const automaticCost = item.soldCost
  const automaticSale = item.saleNet
  const previewCost = cost === '' ? automaticCost : Number(cost)
  const previewSale = sale === '' ? automaticSale : Number(sale)
  const previewProfit = previewCost === null ? null : previewSale - previewCost
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={event => {
      event.preventDefault()
      onSave({ cost: cost === '' ? undefined : Number(cost), sale: sale === '' ? undefined : Number(sale) })
    }}>
      <div className="modal-head"><div><p className="eyebrow">REALIZED PROFIT</p><h2>売却損益を編集</h2></div><button type="button" onClick={onClose}><X /></button></div>
      <div className="selected-product"><span>{item.product.category} · {item.sellQty}{productQuantityUnit(item.product)}売却</span><strong>{item.product.name}</strong></div>
      <div className="form-grid">
        <label className="field">購入原価（売却分）<input inputMode="numeric" value={cost} onChange={event => setCost(event.target.value.replace(/\D/g, ''))} placeholder={automaticCost === null ? '未確認' : String(Math.round(automaticCost))} /></label>
        <label className="field">売却額<input inputMode="numeric" value={sale} onChange={event => setSale(event.target.value.replace(/\D/g, ''))} placeholder={String(Math.round(automaticSale))} /></label>
      </div>
      <div className="profit-preview"><span>実現損益</span><strong className={previewProfit === null ? 'warning' : previewProfit >= 0 ? 'positive' : 'negative'}>{previewProfit === null ? '原価未確認' : signedYen(previewProfit)}</strong></div>
      <p className="modal-note">ここで設定した金額は販売リストの実現損益だけに反映されます。購入履歴・売却履歴・ホームの取引収支は変更されません。</p>
      <button className="submit-button" type="submit">損益設定を保存</button>
      {override && <button className="secondary-button" type="button" onClick={() => onSave({})}>自動計算に戻す</button>}
    </form>
  </div>
}

function CollectionPage({ stats, manualCards, onEditPrice, onAdd, onEditManual, onHideProduct }: {
  stats: ProductStats[]
  manualCards: ManualCollectionCard[]
  onEditPrice: (id: string, value: number) => void
  onAdd: () => void
  onEditManual: (card: ManualCollectionCard) => void
  onHideProduct: (product: Product) => void
}) {
  const totalValue = stats.reduce((sum, item) => sum + item.potentialValue, 0) + manualCards.reduce((sum, item) => sum + item.expectedPrice * item.quantity, 0)
  const owned = stats.reduce((sum, item) => sum + item.stock, 0) + manualCards.reduce((sum, item) => sum + item.quantity, 0)
  return <section className="page section collection-page">
    <div className="page-title-row"><div><p className="eyebrow">CARD COLLECTION</p><h1>カードコレクション</h1></div><button className="register-button" onClick={onAdd}><Plus size={15} /> カード登録</button></div>
    <div className="collection-summary"><div><span>保有カード</span><strong>{owned.toLocaleString()}枚</strong></div><div><span>想定価値</span><strong>{yen(totalValue)}</strong></div></div>
    <p className="page-description">購入カテゴリーが「カード」の商品は自動で表示されます。</p>
    <div className="collection-grid">{stats.map(item => {
      const soldOut = item.sellQty > 0 && item.stock === 0
      return <article className="collection-card" key={item.product.id}>
        <div className="card-photo"><Images size={23} /><span>PHOTO</span><small>後日対応</small></div>
        <div className="card-content">
          <div className="card-tags"><span className="category-tag">カード</span>{item.sellQty > 0 && <span className={soldOut ? 'sold-tag sold-out' : 'sold-tag'}>{soldOut ? '売却完了' : `${item.sellQty}枚売却`}</span>}<button className="collection-remove" aria-label={`${item.product.name}をコレクションから外す`} onClick={() => onHideProduct(item.product)}><Trash2 size={12} /></button></div>
          <h3>{item.product.name}</h3><p>保有 {item.stock.toLocaleString()}枚 · 購入 {item.buyQty.toLocaleString()}枚</p>
          <label className="collection-price"><span>想定売価（1{productQuantityUnit(item.product)}）</span><b>¥</b><input aria-label={`${item.product.name}の想定売価`} inputMode="numeric" value={item.product.expectedPrice ? Math.round(item.product.expectedPrice) : ''} placeholder="0" onChange={event => onEditPrice(item.product.id, Number(event.target.value.replace(/\D/g, '')) || 0)} /></label>
        </div>
      </article>
    })}{manualCards.map(card => <article className="collection-card" key={card.id}>
      <div className="card-photo"><Images size={23} /><span>PHOTO</span><small>後日対応</small></div>
      <div className="card-content">
        <div className="card-tags"><span className="manual-tag">手動登録</span><button className="collection-remove" aria-label={`${card.name}を編集`} onClick={() => onEditManual(card)}><Pencil size={12} /></button></div>
        <h3>{card.name}</h3><p>保有 {card.quantity.toLocaleString()}枚</p>
        <div className="manual-value"><span>想定売価</span><strong>{yen(card.expectedPrice)}</strong><small>合計 {yen(card.expectedPrice * card.quantity)}</small></div>
      </div>
    </article>)}</div>
    {!stats.length && !manualCards.length && <div className="empty">カードがありません。<br />「カード登録」から追加できます。</div>}
  </section>
}

function CollectionModal({ card, hiddenProducts, onClose, onSave, onDelete, onRestore }: {
  card: ManualCollectionCard | null
  hiddenProducts: Product[]
  onClose: () => void
  onSave: (card: ManualCollectionCard) => void
  onDelete: (card: ManualCollectionCard) => void
  onRestore: (productId: string) => void
}) {
  const [name, setName] = useState(card?.name || '')
  const [quantity, setQuantity] = useState(String(card?.quantity || 1))
  const [expectedPrice, setExpectedPrice] = useState(String(card?.expectedPrice || ''))
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={event => {
      event.preventDefault()
      if (!name.trim() || Number(quantity) <= 0) return
      onSave({ id: card?.id || crypto.randomUUID(), name: name.trim(), quantity: Number(quantity), expectedPrice: Number(expectedPrice) || 0 })
    }}>
      <div className="modal-head"><div><p className="eyebrow">COLLECTION CARD</p><h2>{card ? 'カードを編集' : 'カードを登録'}</h2></div><button type="button" onClick={onClose}><X /></button></div>
      {!card && hiddenProducts.length > 0 && <div className="restore-panel"><strong>コレクションから外したカード</strong><p>購入履歴と連携した状態で再登録できます。</p>{hiddenProducts.map(product => <button type="button" key={product.id} onClick={() => onRestore(product.id)}><span>{product.name}</span><Plus size={14} /></button>)}</div>}
      <label className="field">カード名<input value={name} onChange={event => setName(event.target.value)} placeholder="例：イーブイex SAR" autoFocus /></label>
      <div className="form-grid"><label className="field">保有枚数<input inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} /></label><label className="field">想定売価（1枚）<input inputMode="numeric" value={expectedPrice} onChange={event => setExpectedPrice(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label></div>
      <p className="modal-note">手動登録したカードは購入・売却履歴には影響しません。</p>
      <button className="submit-button" type="submit">{card ? '変更を保存' : 'コレクションに登録'}</button>
      {card && <button className="delete-button" type="button" onClick={() => onDelete(card)}><Trash2 size={15} /> コレクションから削除</button>}
    </form>
  </div>
}

function SettingsPage({ user, categories, sources, onAddCategory, onToggleCategory, onAddSource, onToggleSource, onSignOut }: {
  user: User
  categories: CategoryMaster[]
  sources: SourceMaster[]
  onAddCategory: (name: string, unitType: UnitType) => void
  onToggleCategory: (id: string) => void
  onAddSource: (name: string) => void
  onToggleSource: (id: string) => void
  onSignOut: () => void
}) {
  const [categoryName, setCategoryName] = useState('')
  const [categoryUnitType, setCategoryUnitType] = useState<UnitType>('unknown')
  const [sourceName, setSourceName] = useState('')
  const sortedCategories = [...categories].sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
  const sortedSources = [...sources].sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
  const confirmCategoryToggle = (category: CategoryMaster) => {
    if (category.active && !confirm(`「${category.name}」を本当に削除しますか？\n\n新しい取引では選択できなくなりますが、過去の取引履歴は削除されません。`)) return
    onToggleCategory(category.id)
  }
  const confirmSourceToggle = (source: SourceMaster) => {
    if (source.active && !confirm(`「${source.name}」を本当に削除しますか？\n\n新しい取引では選択できなくなりますが、過去の取引履歴は削除されません。`)) return
    onToggleSource(source.id)
  }
  return <section className="page section settings-page">
    <div className="page-title-row"><div><p className="eyebrow">MY PAGE</p><h1>マイページ</h1></div><span className="settings-icon"><Settings size={19} /></span></div>
    <p className="page-description">アカウントと、取引登録で使用するカテゴリーを管理できます。</p>

    <div className="account-panel">
      <AccountIdentity user={user} />
      <div className="account-cloud"><Cloud size={14} /><span>このアカウントにクラウド保存中</span></div>
      <button className="account-signout" onClick={onSignOut}><LogOut size={15} /> ログアウト</button>
    </div>

    <details className="settings-panel">
      <summary className="settings-heading"><span className="settings-heading-icon"><Tag size={15} /></span><div><h2>商品カテゴリー</h2><p>商品登録時の分類と取引履歴の絞り込みに使用します。</p></div><span className="settings-heading-meta"><b>有効 {categories.filter(category => category.active).length}/{categories.length}</b><ChevronDown className="settings-heading-chevron" size={17} /></span></summary>
      <div className="settings-content"><form className="settings-add category-settings-add" onSubmit={event => {
        event.preventDefault()
        if (!categoryName.trim()) return
        onAddCategory(categoryName, categoryUnitType)
        setCategoryName('')
        setCategoryUnitType('unknown')
      }}><input value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="新しいカテゴリー名" /><select aria-label="商品の種類" value={categoryUnitType} onChange={event => setCategoryUnitType(event.target.value as UnitType)}>{unitTypeOptions.map(unitType => <option value={unitType} key={unitType}>{unitLabels[unitType]}</option>)}</select><button type="submit"><Plus size={15} /> 追加</button></form>
      <div className="settings-list">{sortedCategories.map(category => <div className={`settings-item ${category.active ? '' : 'inactive'}`} key={category.id}>
        <span><strong>{category.name}</strong><small>{unitLabels[category.unitType]} · {category.active ? '使用中' : '削除済み'}</small></span>
        <button className={category.active ? 'archive-button' : 'restore-button'} onClick={() => confirmCategoryToggle(category)}>{category.active ? <><Trash2 size={13} /> 削除</> : <><Plus size={13} /> 復元</>}</button>
      </div>)}</div></div>
    </details>

    <details className="settings-panel">
      <summary className="settings-heading"><span className="settings-heading-icon"><MapPin size={15} /></span><div><h2>購入・販売先</h2><p>ヨドバシやメルカリなど、取引先別の絞り込みに使用します。</p></div><span className="settings-heading-meta"><b>有効 {sources.filter(source => source.active).length}/{sources.length}</b><ChevronDown className="settings-heading-chevron" size={17} /></span></summary>
      <div className="settings-content"><form className="settings-add" onSubmit={event => {
        event.preventDefault()
        if (!sourceName.trim()) return
        onAddSource(sourceName)
        setSourceName('')
      }}><input value={sourceName} onChange={event => setSourceName(event.target.value)} placeholder="新しい購入・販売先" /><button type="submit"><Plus size={15} /> 追加</button></form>
      <div className="settings-list">{sortedSources.map(source => <div className={`settings-item ${source.active ? '' : 'inactive'}`} key={source.id}>
        <span><strong>{source.name}</strong><small>{source.active ? '使用中' : '削除済み'}</small></span>
        <button className={source.active ? 'archive-button' : 'restore-button'} onClick={() => confirmSourceToggle(source)}>{source.active ? <><Trash2 size={13} /> 削除</> : <><Plus size={13} /> 復元</>}</button>
      </div>)}</div></div>
    </details>
    <p className="settings-note">削除した項目は新しい取引で選べなくなりますが、過去の取引履歴はそのまま残ります。必要なときはここから復元できます。</p>
  </section>
}

function ProductModal({ product, categories, onClose, onSave, onDelete }: {
  product: Product | null
  categories: CategoryMaster[]
  onClose: () => void
  onSave: (product: Product) => boolean
  onDelete: (product: Product) => void
}) {
  const [name, setName] = useState(product?.name || '')
  const productCategory = categories.find(category => category.id === product?.categoryId) || categories.find(category => category.name === product?.category)
  const availableCategories = categories.filter(category => category.active || category.id === productCategory?.id)
  const [categoryId, setCategoryId] = useState(productCategory?.id || availableCategories[0]?.id || '')
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={event => {
      event.preventDefault()
      const category = categories.find(item => item.id === categoryId)
      if (!name.trim() || !category) return
      onSave({ id: product?.id || crypto.randomUUID(), name: name.trim(), category: category.name, categoryId: category.id, unitType: category.unitType, expectedPrice: product?.expectedPrice || 0, createdAt: product ? product.createdAt : new Date().toISOString() })
    }}>
      <div className="modal-head"><div><p className="eyebrow">PRODUCT INFO</p><h2>{product ? '商品情報を編集' : '商品を追加'}</h2></div><button type="button" onClick={onClose}><X /></button></div>
      <label className="field">商品名<input value={name} onChange={event => setName(event.target.value)} placeholder="例：イーブイex SAR" autoFocus /></label>
      <label className="field">カテゴリー<select value={categoryId} onChange={event => setCategoryId(event.target.value)}>{availableCategories.map(category => <option value={category.id} key={category.id}>{category.name}{category.active ? '' : '（削除済み）'}</option>)}</select></label>
      <p className="modal-note">新しい商品は取引履歴の「履歴登録」から取引と同時に作成できます。</p>
      <button className="submit-button" type="submit">{product ? '変更を保存' : '商品を登録'}</button>
      {product && <button className="delete-button" type="button" onClick={() => onDelete(product)}><Trash2 size={15} /> 商品を削除</button>}
    </form>
  </div>
}

function TradeModal({ product, stats, type, trade, sources, onClose, onSave, onDelete }: {
  product: Product
  stats: ProductStats
  type: 'buy' | 'sell'
  trade: Trade | null
  sources: SourceMaster[]
  onClose: () => void
  onSave: (trade: Trade) => void
  onDelete: (trade: Trade) => void
}) {
  const isBuy = type === 'buy'
  const productPacksPerBox = officialPacksPerBox(product.name)
  const initialBoxConversion = trade?.boxConversion
  const [entryUnit, setEntryUnit] = useState<EntryUnit>(initialBoxConversion ? 'box' : 'pack')
  const [quantity, setQuantity] = useState(String(initialBoxConversion?.originalQuantity || trade?.quantity || 1))
  const [amount, setAmount] = useState(String(trade?.amount || ''))
  const [points, setPoints] = useState(String(trade?.points || ''))
  const [date, setDate] = useState(trade?.date || localDateString())
  const currentSource = trade ? sourceForTrade(trade, sources) : undefined
  const availableSources = sources.filter(source => source.active || source.id === currentSource?.id)
  const [sourceId, setSourceId] = useState(currentSource?.id || '')
  const [note, setNote] = useState(trade?.note || '')
  const packsPerBox = initialBoxConversion?.packsPerBox || productPacksPerBox
  const usingBox = entryUnit === 'box' && Boolean(packsPerBox)
  const convertedQuantity = (Number(quantity) || 0) * (usingBox ? packsPerBox || 1 : 1)
  const editableStock = stats.stock + (trade?.type === 'sell' ? trade.quantity : 0)
  const hasUnconfirmedCost = stats.buyQty < stats.sellQty
  const [allowUnconfirmedSale, setAllowUnconfirmedSale] = useState(false)
  const needsUnconfirmedSale = !isBuy && convertedQuantity > editableStock
  const changeEntryUnit = (nextUnit: EntryUnit) => {
    if (nextUnit === entryUnit) return
    if (!trade) {
      setEntryUnit(nextUnit)
      setQuantity('1')
      setAllowUnconfirmedSale(false)
      return
    }
    if (nextUnit === 'pack') {
      setQuantity(String(convertedQuantity))
      setEntryUnit('pack')
      setAllowUnconfirmedSale(false)
      return
    }
    if (!packsPerBox || convertedQuantity % packsPerBox !== 0) {
      alert(`現在の${convertedQuantity.toLocaleString()}パックは、${packsPerBox || 0}パック入りBOXの整数個に換算できません。`)
      return
    }
    setQuantity(String(convertedQuantity / packsPerBox))
    setEntryUnit('box')
    setAllowUnconfirmedSale(false)
  }
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={event => {
      event.preventDefault()
      const enteredQuantity = Number(quantity) || 0
      const qty = enteredQuantity * (usingBox ? packsPerBox || 1 : 1)
      const cash = Number(amount) || 0
      const usedPoints = isBuy ? Number(points) || 0 : 0
      if (qty <= 0) { alert('数量を入力してください。'); return }
      if (cash <= 0 && usedPoints <= 0) { alert('取引金額または使用ポイントを入力してください。'); return }
      if (needsUnconfirmedSale && !allowUnconfirmedSale) { alert('在庫外売却として記録することを確認してください。'); return }
      if (isBuy && trade && stats.buyQty - trade.quantity + qty < stats.sellQty) {
        alert('購入数を販売済み数量より少なく変更することはできません。')
        return
      }
      const source = sources.find(item => item.id === sourceId)
      if (!source) return
      onSave({
        ...trade,
        id: trade?.id || crypto.randomUUID(),
        productId: product.id,
        type,
        name: product.name,
        group: product.name,
        category: legacyCategoryFromProduct(product),
        unitType: unitFromProduct(product),
        quantity: qty,
        amount: cash,
        points: usedPoints,
        unitPrice: Math.round((cash + usedPoints) / qty),
        date,
        source: source.name,
        sourceId: source.id,
        note: note.trim(),
        fee: trade?.fee || 0,
        shipping: trade?.shipping || 0,
        createdAt: trade?.createdAt || new Date().toISOString(),
        sortOrder: trade?.sortOrder || Date.now(),
        boxConversion: usingBox && packsPerBox ? { version: 1, originalQuantity: enteredQuantity, packsPerBox } : undefined,
        packQuantityVersion: unitFromProduct(product) === 'pack' ? 1 : trade?.packQuantityVersion,
      })
    }}>
      <div className="modal-head"><div><p className="eyebrow">{isBuy ? 'PURCHASE' : 'SALES'} RECORD</p><h2>{trade ? `${isBuy ? '購入' : '売却'}履歴を編集` : `${isBuy ? '購入' : '売却'}を追加`}</h2></div><button type="button" onClick={onClose}><X /></button></div>
      <div className="selected-product"><span>{product.category}</span><strong>{product.name}</strong>{!isBuy && <small>{hasUnconfirmedCost ? '購入原価未確認の売却履歴' : `販売可能在庫 ${editableStock.toLocaleString()}${productQuantityUnit(product)}`}</small>}</div>
      {packsPerBox && unitFromProduct(product) === 'pack' && <label className="field">登録単位<select value={entryUnit} onChange={event => changeEntryUnit(event.target.value as EntryUnit)}><option value="pack">パック</option><option value="box">BOX（1BOX＝{packsPerBox}パック）</option></select></label>}
      <div className="form-grid"><label className="field">{usingBox ? 'BOX数' : unitFromProduct(product) === 'pack' ? 'パック数' : '数量'}<input inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} />{usingBox && <small>{convertedQuantity.toLocaleString()}パックとして在庫計算</small>}</label><label className="field">総額（¥）<input inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label></div>
      {needsUnconfirmedSale && <label className="unconfirmed-check"><input type="checkbox" checked={allowUnconfirmedSale} onChange={event => setAllowUnconfirmedSale(event.target.checked)} /><span><strong>在庫外売却として記録</strong><small>在庫を超える分の購入原価は未確認となります。</small></span></label>}
      {isBuy && <label className="field">使用ポイント<input inputMode="numeric" value={points} onChange={event => setPoints(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label>}
      <label className="field">日付<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="field">{isBuy ? '購入先' : '販売先'}<select required value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">選択してください</option>{availableSources.map(source => <option value={source.id} key={source.id}>{source.name}{source.active ? '' : '（削除済み）'}</option>)}</select></label>
      <label className="field">メモ<input value={note} onChange={event => setNote(event.target.value)} placeholder="状態・セット内容など" /></label>
      <button className="submit-button" type="submit">{trade ? '変更を保存' : `${isBuy ? '購入' : '売却'}履歴を追加`}</button>
      {trade && <button className="delete-button" type="button" onClick={() => onDelete(trade)}><Trash2 size={15} /> 履歴を削除</button>}
    </form>
  </div>
}
