import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  Images,
  MapPin,
  Pencil,
  Plus,
  Search,
  Settings,
  Tag,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { inferUnitType, jaText, seedHoldings, seedTrades, starterDeckIds, unitLabels, type Trade, type UnitType } from './data'

type Tab = 'home' | 'transactions' | 'collection' | 'profile'
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
}
type RealizedOverride = { cost?: number; sale?: number }
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
const defaultCategories: CategoryMaster[] = [
  { id: 'cat-card', name: 'カード', unitType: 'card', active: true, sortOrder: 1 },
  { id: 'cat-pack', name: 'パック', unitType: 'pack', active: true, sortOrder: 2 },
  { id: 'cat-box', name: 'ボックス', unitType: 'box', active: true, sortOrder: 3 },
  { id: 'cat-deck', name: 'スタートデッキ', unitType: 'deck', active: true, sortOrder: 4 },
  { id: 'cat-set', name: 'セット', unitType: 'set', active: true, sortOrder: 5 },
  { id: 'cat-goods', name: 'グッズ', unitType: 'goods', active: true, sortOrder: 6 },
  { id: 'cat-other', name: 'その他', unitType: 'unknown', active: true, sortOrder: 7 },
]
const unitTypeOptions: UnitType[] = ['card', 'pack', 'box', 'deck', 'set', 'goods', 'unknown']
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
const localDateString = () => {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}
const sourceLabel = (value: string) => sourceLabels[value] || value
const categoryForName = (categories: CategoryMaster[], name: string) => categories.find(category => normalize(category.name) === normalize(name)) || defaultCategories.find(category => normalize(category.name) === normalize(name))
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
const getUnitType = (trade: Trade) => trade.unitType || inferUnitType(trade.name, trade.category)
const getProductName = (trade: Trade) => {
  const group = jaText(trade.group || '').trim()
  const unit = getUnitType(trade)
  if (trade.category === '팩・박스' && group && !genericGroups.has(group) && ['box', 'pack', 'deck', 'set', 'unknown'].includes(unit)) return group
  if (trade.category !== '팩・박스' && group && !genericGroups.has(group) && group !== trade.source) return group
  return jaText(trade.name).trim()
}
const productCategoryFromTrade = (trade: Trade): ProductCategory => {
  const unit = getUnitType(trade)
  if (unit === 'card' || trade.category === '싱글 카드') return 'カード'
  if (unit === 'pack') return 'パック'
  if (unit === 'box') return 'ボックス'
  if (unit === 'deck') return 'スタートデッキ'
  if (unit === 'set') return 'セット'
  if (unit === 'goods' || trade.category === '굿즈・기타' || trade.category === '포켓몬 외') return 'グッズ'
  return 'その他'
}
const unitFromProduct = (product: Product): UnitType => product.unitType || ({
  カード: 'card', パック: 'pack', ボックス: 'box', スタートデッキ: 'deck', セット: 'set', グッズ: 'goods', その他: 'unknown',
})[product.category] as UnitType
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
    if (saved) return JSON.parse(saved)
    const source: Trade[] = seedTrades
    const migrated = source.map((trade, index) => ({
      ...trade,
      name: jaText(trade.name),
      group: jaText(trade.group || trade.name),
      note: jaText(trade.note || ''),
      unitType: trade.unitType || inferUnitType(jaText(trade.name), trade.category),
      sortOrder: trade.sortOrder ?? index + 1,
    }))
    localStorage.setItem(TRADE_STORAGE, JSON.stringify(migrated))
    return migrated
  } catch {
    return seedTrades
  }
}

function readCategoryMasters(): CategoryMaster[] {
  try {
    const saved = localStorage.getItem(CATEGORY_STORAGE)
    if (!saved) return defaultCategories
    const parsed: CategoryMaster[] = JSON.parse(saved)
    if (!Array.isArray(parsed) || !parsed.length) return defaultCategories
    const merged = [...parsed]
    defaultCategories.forEach(defaultCategory => {
      if (!merged.some(category => category.id === defaultCategory.id || normalize(category.name) === normalize(defaultCategory.name))) merged.push(defaultCategory)
    })
    localStorage.setItem(CATEGORY_STORAGE, JSON.stringify(merged))
    return merged
  } catch {
    return defaultCategories
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
    const result = masters.length ? masters : [{ id: 'source-other', name: 'その他', active: true, sortOrder: 1, aliases: ['기타'] }]
    localStorage.setItem(SOURCE_STORAGE, JSON.stringify(result))
    return result
  } catch {
    return [{ id: 'source-other', name: 'その他', active: true, sortOrder: 1, aliases: ['기타'] }]
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
    const holding = seedHoldings.find(item => item.category === '팩・박스' && category === 'ボックス' && normalize(item.name).startsWith(normalize(name)))
    const master = categoryForName(categories, category)
    products.push({ id: `migrated-product-${products.length + 1}`, name, category, categoryId: master?.id, unitType: master?.unitType || getUnitType(trade), expectedPrice: holding ? Math.round(holding.value / holding.quantity) : 0 })
  })
  starterDeckIds.forEach(name => {
    const key = `スタートデッキ|${normalize(name)}`
    if (seen.has(key)) return
    seen.add(key)
    const master = categoryForName(categories, 'スタートデッキ')
    products.push({ id: `starter-deck-${name}`, name, category: master?.name || 'スタートデッキ', categoryId: master?.id, unitType: 'deck', expectedPrice: 0 })
  })
  return products.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

function readProducts(trades: Trade[], categories: CategoryMaster[]): Product[] {
  try {
    const saved = localStorage.getItem(PRODUCT_STORAGE)
    const savedProducts: Product[] = saved ? JSON.parse(saved) : []
    const migratedProducts: Product[] = savedProducts.map(product => {
      const matchingSetTrade = product.category === 'その他' && trades.find(trade => getUnitType(trade) === 'set' && normalize(getProductName(trade)) === normalize(product.name))
      const categoryName = matchingSetTrade ? 'セット' : product.category
      const master = matchingSetTrade ? categoryForName(categories, 'セット') : categories.find(category => category.id === product.categoryId) || categoryForName(categories, categoryName)
      return { ...product, category: master?.name || categoryName, categoryId: master?.id, unitType: matchingSetTrade ? 'set' : product.unitType || master?.unitType || ('unknown' as UnitType) }
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
    localStorage.setItem(PRODUCT_STORAGE, JSON.stringify(products))
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
      manualCards: seedHoldings.filter(item => item.category === '싱글 카드').map(item => ({
        id: `holding-${item.id}`,
        name: item.name,
        quantity: item.quantity,
        expectedPrice: Math.round(item.value / item.quantity),
      })),
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

export function App() {
  const [trades, setTrades] = useState<Trade[]>(readTrades)
  const [categories, setCategories] = useState<CategoryMaster[]>(readCategoryMasters)
  const [products, setProducts] = useState<Product[]>(() => readProducts(trades, categories))
  const [sources, setSources] = useState<SourceMaster[]>(() => readSourceMasters(trades))
  const [collection, setCollection] = useState<CollectionData>(readCollection)
  const [realizedOverrides, setRealizedOverrides] = useState<Record<string, RealizedOverride>>(readRealizedOverrides)
  const [tab, setTab] = useState<Tab>('home')
  const [transactionSide, setTransactionSide] = useState<'buy' | 'sell'>('buy')
  const [productModal, setProductModal] = useState<Product | 'new' | null>(null)
  const [tradeModal, setTradeModal] = useState<{ product: Product; type: 'buy' | 'sell'; trade: Trade | null } | null>(null)
  const [entryType, setEntryType] = useState<'buy' | 'sell' | null>(null)
  const [collectionModal, setCollectionModal] = useState<ManualCollectionCard | 'new' | null>(null)
  const [realizedModal, setRealizedModal] = useState<ProductStats | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('すべて')
  const [sourceFilter, setSourceFilter] = useState<string>('すべて')
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [showAllSold, setShowAllSold] = useState(false)
  const hasOpenModal = Boolean(productModal || tradeModal || entryType || collectionModal || realizedModal)

  useEffect(() => {
    if (!hasOpenModal) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [hasOpenModal])

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
    localStorage.setItem(TRADE_STORAGE, JSON.stringify(linkedTrades))
  }, [sources, trades])

  const stats = useMemo(() => products.map(product => calculateStats(product, trades)), [products, trades])
  const activeCategories = categories.filter(category => category.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const activeSources = sources.filter(source => source.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const categoryNameForProduct = (product: Product) => categories.find(category => category.id === product.categoryId)?.name || product.category
  const productHasActiveCategory = (product: Product) => activeCategories.some(category => category.id === product.categoryId || (!product.categoryId && normalize(category.name) === normalize(product.category)))
  const realizedValues = (item: ProductStats) => {
    const override = realizedOverrides[item.product.id]
    const cost = override?.cost !== undefined ? override.cost : item.soldCost
    const sale = override?.sale !== undefined ? override.sale : item.saleNet
    return { cost, sale, profit: cost === null ? null : sale - cost, overridden: Boolean(override) }
  }
  const totals = useMemo(() => {
    const soldItems = stats.filter(item => item.sellQty > 0).map(item => ({ item, values: realizedValues(item) }))
    const confirmedSales = soldItems.filter(entry => entry.values.profit !== null)
    const realizedProfit = confirmedSales.reduce((sum, entry) => sum + (entry.values.profit || 0), 0)
    const realizedSales = confirmedSales.reduce((sum, entry) => sum + entry.values.sale, 0)
    const realizedCost = confirmedSales.reduce((sum, entry) => sum + (entry.values.cost || 0), 0)
    const potentialValue = stats.reduce((sum, item) => sum + item.potentialValue, 0)
    const remainingCost = stats.reduce((sum, item) => sum + (item.remainingCost || 0), 0)
    const potentialProfit = stats.filter(item => item.potentialProfit !== null).reduce((sum, item) => sum + (item.potentialProfit || 0), 0)
    return {
      confirmedSales: confirmedSales.length,
      soldProducts: soldItems.length,
      realizedProfit,
      realizedSales,
      realizedCost,
      potentialValue,
      remainingCost,
      potentialProfit,
      estimatedProfit: realizedProfit + potentialProfit,
    }
  }, [stats, realizedOverrides])
  const inStock = stats.filter(item => item.stock > 0)
  const pricedStock = inStock.filter(item => item.product.expectedPrice > 0)
  const soldStats = stats.filter(item => item.sellQty > 0).sort((a, b) => {
    const latestA = Math.max(...a.sellTrades.map(tradeTime))
    const latestB = Math.max(...b.sellTrades.map(tradeTime))
    return latestB - latestA
  })
  const displayedProducts = showAllProducts ? stats : stats.slice(0, 8)
  const displayedSold = showAllSold ? soldStats : soldStats.slice(0, 5)
  const filteredStats = stats.filter(item => {
    const productCategoryId = item.product.categoryId || categoryForName(categories, item.product.category)?.id
    const matchesCategory = categoryFilter === 'すべて' || productCategoryId === categoryFilter
    const target = `${item.product.name} ${categoryNameForProduct(item.product)}`.toLocaleLowerCase('ja-JP')
    return matchesCategory && target.includes(query.toLocaleLowerCase('ja-JP'))
  })

  const persistTrades = (next: Trade[]) => {
    setTrades(next)
    localStorage.setItem(TRADE_STORAGE, JSON.stringify(next))
  }
  const persistProducts = (next: Product[]) => {
    setProducts(next)
    localStorage.setItem(PRODUCT_STORAGE, JSON.stringify(next))
  }
  const persistCategories = (next: CategoryMaster[]) => {
    setCategories(next)
    localStorage.setItem(CATEGORY_STORAGE, JSON.stringify(next))
  }
  const persistSources = (next: SourceMaster[]) => {
    setSources(next)
    localStorage.setItem(SOURCE_STORAGE, JSON.stringify(next))
  }
  const persistCollection = (next: CollectionData) => {
    setCollection(next)
    localStorage.setItem(COLLECTION_STORAGE, JSON.stringify(next))
  }
  const persistRealizedOverrides = (next: Record<string, RealizedOverride>) => {
    setRealizedOverrides(next)
    localStorage.setItem(REALIZED_STORAGE, JSON.stringify(next))
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
    const existing = categories.find(category => normalize(category.name) === normalize(clean))
    if (existing) {
      if (!existing.active) {
        persistCategories(categories.map(category => category.id === existing.id ? { ...category, unitType, active: true } : category))
        persistProducts(products.map(product => product.categoryId === existing.id ? { ...product, unitType } : product))
      } else alert('同名のカテゴリーがすでにあります。')
      return
    }
    persistCategories([...categories, { id: crypto.randomUUID(), name: clean, unitType, active: true, sortOrder: categories.length + 1 }])
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
    const previousProducts = localStorage.getItem(PRODUCT_STORAGE)
    const previousTrades = localStorage.getItem(TRADE_STORAGE)
    try {
      localStorage.setItem(PRODUCT_STORAGE, JSON.stringify(nextProducts))
      localStorage.setItem(TRADE_STORAGE, JSON.stringify(nextTrades))
    } catch {
      if (previousProducts === null) localStorage.removeItem(PRODUCT_STORAGE)
      else localStorage.setItem(PRODUCT_STORAGE, previousProducts)
      if (previousTrades === null) localStorage.removeItem(TRADE_STORAGE)
      else localStorage.setItem(TRADE_STORAGE, previousTrades)
      alert('保存できませんでした。端末の空き容量を確認して、もう一度お試しください。')
      return
    }
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
    const header = ['区分', '商品名', 'カテゴリー', '数量', '現金合計', 'ポイント', '購入・販売先', '日付', 'メモ']
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = target.map(trade => {
      const product = products.find(item => item.id === trade.productId) || products.find(item => belongsToProduct(trade, item))
      return [
        trade.type === 'buy' ? '購入' : '売却', trade.name, product ? categoryNameForProduct(product) : productCategoryFromTrade(trade), trade.quantity,
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
    if (nextTab === 'transactions') {
      setHistoryKey(null)
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><i /></span><strong>Poke Invest</strong></div>
    </header>

    <main>
      {tab === 'home' && <>
        <section className="hero">
          <p className="eyebrow">TOTAL PERFORMANCE</p>
          <span className="hero-label">推定総損益</span>
          <h1 className={totals.estimatedProfit >= 0 ? 'positive' : 'negative'}>{signedYen(totals.estimatedProfit)}</h1>
          <div className="hero-stats">
            <div><span>実現損益</span><strong>{signedYen(totals.realizedProfit)}</strong></div>
            <div><span>潜在価値</span><strong>{yen(totals.potentialValue)}</strong></div>
            <div><span>潜在損益</span><strong>{signedYen(totals.potentialProfit)}</strong></div>
          </div>
        </section>

        <section className="section">
          <div className="section-head"><div><p className="eyebrow">VALUATION</p><h2>潜在価値</h2></div><span className="count-label">{pricedStock.length} / {inStock.length}商品入力済み</span></div>
          <div className="value-grid">
            <div><span>想定売却額</span><strong>{yen(totals.potentialValue)}</strong></div>
            <div><span>残存在庫の原価</span><strong>{yen(totals.remainingCost)}</strong></div>
          </div>
          {inStock.length > pricedStock.length && <p className="info-note">想定売価が未入力の商品は潜在価値に含まれていません。</p>}
        </section>

        <section className="section">
          <div className="section-head"><div><p className="eyebrow">PRODUCT MASTER</p><h2>商品情報</h2></div><span className="count-label">取引登録時に自動作成</span></div>
          <div className="product-master">
            {displayedProducts.map(item => <article className="master-row" key={item.product.id}>
              <button className="master-info" onClick={() => setProductModal(item.product)}>
                <strong>{item.product.name}</strong><small>{categoryNameForProduct(item.product)} · 在庫 {item.stock.toLocaleString()}個</small>
              </button>
              <label className="price-input"><span>想定売価</span><b>¥</b><input aria-label={`${item.product.name}の想定売価`} inputMode="numeric" value={item.product.expectedPrice || ''} placeholder="0" onChange={event => setExpectedPrice(item.product.id, Number(event.target.value.replace(/\D/g, '')) || 0)} /></label>
              <button className="row-edit" aria-label={`${item.product.name}の商品情報を編集`} onClick={() => setProductModal(item.product)}><Pencil size={14} /></button>
            </article>)}
            {!stats.length && <div className="empty">商品情報がありません。</div>}
          </div>
          {stats.length > 8 && <button className="wide-more" onClick={() => setShowAllProducts(value => !value)}>{showAllProducts ? '折りたたむ' : `すべて表示（${stats.length}商品）`} <ChevronDown size={15} /></button>}
        </section>

        <section className="section">
          <div className="section-head"><div><p className="eyebrow">REALIZED PROFIT</p><h2>売却済み商品</h2></div><span className="count-label">原価確認 {totals.confirmedSales}/{totals.soldProducts}</span></div>
          <div className="realized-card">
            <div className="realized-summary">
              <div><span>購入原価</span><strong>{yen(totals.realizedCost)}</strong></div>
              <div><span>売却額</span><strong>{yen(totals.realizedSales)}</strong></div>
              <div><span>実現損益</span><strong className={totals.realizedProfit >= 0 ? 'positive' : 'negative'}>{signedYen(totals.realizedProfit)}</strong></div>
            </div>
            <div className="realized-head"><span>商品</span><span>購入原価</span><span>売却額</span><span>損益</span></div>
            {displayedSold.map(item => { const values = realizedValues(item); return <button className={`realized-row ${values.overridden ? 'overridden' : ''}`} key={item.product.id} onClick={() => setRealizedModal(item)}>
              <span><strong>{item.product.name}</strong><small>{item.sellQty}個売却 · クリックして編集{values.overridden ? ' · 手動設定' : ''}</small></span>
              <b className={values.cost === null ? 'warning' : ''}>{values.cost === null ? '未確認' : yen(values.cost)}</b>
              <b>{yen(values.sale)}</b>
              <b className={values.profit === null ? 'warning' : values.profit >= 0 ? 'positive' : 'negative'}>{values.profit === null ? '—' : signedYen(values.profit)}</b>
            </button> })}
            {!soldStats.length && <div className="empty">売却履歴がありません。</div>}
          </div>
          {soldStats.length > 5 && <button className="wide-more" onClick={() => setShowAllSold(value => !value)}>{showAllSold ? '折りたたむ' : `すべて表示（${soldStats.length}商品）`} <ChevronDown size={15} /></button>}
          <p className="calculation-note">商品をクリックすると売却分の購入原価と売却額を手動設定できます。設定値はこの損益表示だけに使用され、購入・売却履歴の合計金額は変わりません。</p>
        </section>
      </>}

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
      {tab === 'profile' && <SettingsPage categories={categories} sources={sources} onAddCategory={addCategory} onToggleCategory={toggleCategory} onAddSource={addSource} onToggleSource={toggleSource} />}
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

function TransactionPage({
  type, onType, stats, query, categoryFilter, sourceFilter, categories, sources, historyKey,
  onQuery, onCategory, onSource, onHistory, onAdd, onEdit, onDelete, onRegister, onExport,
}: {
  type: 'buy' | 'sell'; onType: (value: 'buy' | 'sell') => void; stats: ProductStats[]; query: string
  categoryFilter: string; sourceFilter: string; categories: CategoryMaster[]; sources: SourceMaster[]; historyKey: string | null
  onQuery: (value: string) => void; onCategory: (value: string) => void; onSource: (value: string) => void
  onHistory: (value: string | null) => void; onAdd: (product: Product, type: 'buy' | 'sell') => void
  onEdit: (product: Product, type: 'buy' | 'sell', trade: Trade) => void; onDelete: (product: Product, trade: Trade) => void
  onRegister: () => void; onExport: () => void
}) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; ignore: boolean } | null>(null)
  const isBuy = type === 'buy'
  const switchType = (next: 'buy' | 'sell') => { onType(next); onHistory(null) }
  const visibleStats = stats.filter(item => {
    if (sourceFilter === 'すべて') return true
    const histories = isBuy ? item.buyTrades : item.sellTrades
    return histories.some(trade => sourceForTrade(trade, sources)?.id === sourceFilter)
  })
  return <section className="page section transaction-page" onTouchStart={event => {
    const touch = event.touches[0]
    if (!touch) return
    const target = event.target as HTMLElement
    setTouchStart({ x: touch.clientX, y: touch.clientY, ignore: Boolean(target.closest('.category-chips, input, select, .page-actions button, .transaction-switch button, .history-toggle, .history-edit, .history-delete, .history-add-row button')) })
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
    <div className={`transaction-panel ${isBuy ? 'slide-buy' : 'slide-sell'}`}>
      <div className={`ledger-head ${isBuy ? 'buy' : 'sell'}`}><span>商品名 / カテゴリー</span>{isBuy ? <><span>購入数</span><span>合計</span></> : <><span>在庫</span><span>売却数</span><span>合計</span></>}<span /></div>
      <div className="ledger-products">
        {visibleStats.map(item => {
          const key = `${type}|${item.product.id}`
          const histories = (isBuy ? item.buyTrades : item.sellTrades).filter(trade => sourceFilter === 'すべて' || sourceForTrade(trade, sources)?.id === sourceFilter)
          const filteredQuantity = histories.reduce((sum, trade) => sum + trade.quantity, 0)
          const filteredAmount = histories.reduce((sum, trade) => sum + trade.amount, 0)
          const activeCategory = categories.find(category => category.id === item.product.categoryId || (!item.product.categoryId && normalize(category.name) === normalize(item.product.category)))
          const canAddTransaction = Boolean(activeCategory)
          const categoryName = activeCategory?.name || `${item.product.category}（削除済み）`
          return <article className="ledger-product" key={item.product.id}>
            <div className={`ledger-main ${isBuy ? 'buy' : 'sell'}`}>
              <button className="ledger-add" disabled={!canAddTransaction} onClick={() => onAdd(item.product, type)}>
                <span className="ledger-name"><strong>{item.product.name}</strong><small>{categoryName}{!isBuy && item.stock <= 0 ? ' · 在庫なし' : ''}</small></span>
                {isBuy ? <><b>{filteredQuantity.toLocaleString()}</b><b>{yen(filteredAmount)}</b></> : <><b>{item.stock.toLocaleString()}</b><b>{filteredQuantity.toLocaleString()}</b><b>{yen(filteredAmount)}</b></>}
              </button>
              <button className={`history-toggle ${historyKey === key ? 'active' : ''}`} aria-label={`${item.product.name}の履歴`} onClick={() => onHistory(historyKey === key ? null : key)}><ChevronDown size={15} /></button>
            </div>
            {historyKey === key && <div className="trade-history">
              <div className="history-add-row"><span>{isBuy ? '購入履歴' : '売却履歴'} · {histories.length}件</span><button disabled={!canAddTransaction} onClick={() => onAdd(item.product, type)}><Plus size={13} /> {isBuy ? '購入履歴を追加' : '売却履歴を追加'}</button></div>
              {histories.map(trade => <div className="trade-history-item" key={trade.id}>
                <button className="history-edit" onClick={() => onEdit(item.product, type, trade)}><span><strong>{trade.date || '日付未入力'}</strong><small>{displaySource(trade, sources)} · {trade.quantity}個 · 単価 {yen((trade.amount + (isBuy ? trade.points : 0)) / trade.quantity)}{trade.points ? ` · ${trade.points.toLocaleString()}p使用` : ''}</small></span><b>{yen(trade.amount)}</b><Pencil size={13} /></button>
                <button className="history-delete" aria-label={`${trade.date || '日付未入力'}の履歴を削除`} onClick={() => onDelete(item.product, trade)}><Trash2 size={13} /></button>
              </div>)}
            </div>}
          </article>
        })}
        {!visibleStats.length && <div className="empty">{isBuy ? '購入履歴がありません。' : '売却履歴がありません。'}<br />上の「履歴登録」から追加できます。</div>}
      </div>
    </div>
    <p className="page-hint">新しい商品は「履歴登録」で商品情報と取引を同時に登録できます。</p>
  </section>
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
  const [allowUnconfirmedSale, setAllowUnconfirmedSale] = useState(false)
  const selectedProduct = products.find(product => product.id === productId)
  const selectedStats = stats.find(item => item.product.id === productId)
  const matchingProducts = products.filter(product => `${product.name} ${product.category}`.toLocaleLowerCase('ja-JP').includes(productQuery.toLocaleLowerCase('ja-JP'))).slice(0, 50)
  const needsUnconfirmedSale = !isBuy && (mode === 'new' || Boolean(selectedStats && Number(quantity) > selectedStats.stock))
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={event => {
    event.preventDefault()
    const qty = Number(quantity) || 0
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
      product = { id: crypto.randomUUID(), name: name.trim(), category: category.name, categoryId: category.id, unitType: category.unitType, expectedPrice: 0 }
      isNewProduct = true
    }
    if (!product) return
    if (!source) { alert(`${isBuy ? '購入先' : '販売先'}を選択してください。`); return }
    onSave(product, {
      id: crypto.randomUUID(), productId: product.id, type, name: product.name, group: product.name,
      category: legacyCategoryFromProduct(product), unitType: unitFromProduct(product), quantity: qty, amount: cash,
      points: usedPoints, unitPrice: Math.round((cash + usedPoints) / qty), date, source: source.name, sourceId: source.id,
      note: note.trim(), fee: 0, shipping: 0, createdAt: new Date().toISOString(), sortOrder: Date.now(),
    }, isNewProduct)
  }}>
    <div className="modal-head"><div><p className="eyebrow">{isBuy ? 'PURCHASE' : 'SALES'} RECORD</p><h2>{isBuy ? '購入履歴を登録' : '売却履歴を登録'}</h2></div><button type="button" onClick={onClose}><X /></button></div>
    <div className="entry-mode"><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>既存商品</button><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>新規商品</button></div>
    {mode === 'existing' ? <div className="existing-product-picker">
      <label className="field">商品検索<div className="entry-search"><Search size={15} /><input value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="商品名・カテゴリーで検索" /></div></label>
      <div className="entry-product-list">{matchingProducts.map(product => <button type="button" className={productId === product.id ? 'active' : ''} key={product.id} onClick={() => setProductId(product.id)}><span><strong>{product.name}</strong><small>{product.category}</small></span>{productId === product.id && <span className="selected-mark">選択中</span>}</button>)}{!matchingProducts.length && <div className="empty">商品が見つかりません。</div>}</div>
      {!isBuy && selectedStats && <small className={`field-help ${Number(quantity) > selectedStats.stock ? 'warning' : ''}`}>現在庫 {selectedStats.stock}個。{Number(quantity) > selectedStats.stock ? '在庫を超える分は原価未確認として記録されます。' : '購入履歴がない販売は原価未確認として記録されます。'}</small>}
    </div> : <div className="new-product-fields"><label className="field">商品名<input required value={name} onChange={event => setName(event.target.value)} placeholder="例：イーブイex SAR" /></label><label className="field">商品カテゴリー<select required value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">選択してください</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>{!isBuy && <small className="field-help warning">購入履歴がないため、購入原価未確認の売却として記録されます。</small>}</div>}
    <div className="form-grid"><label className="field">数量<input required inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} /></label><label className="field">総額（¥）<input inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label></div>
    {needsUnconfirmedSale && <label className="unconfirmed-check"><input type="checkbox" checked={allowUnconfirmedSale} onChange={event => setAllowUnconfirmedSale(event.target.checked)} /><span><strong>在庫外売却として記録</strong><small>購入原価は未確認となり、ホームの売却損益から確認・編集できます。</small></span></label>}
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
      <div className="selected-product"><span>{item.product.category} · {item.sellQty}個売却</span><strong>{item.product.name}</strong></div>
      <div className="form-grid">
        <label className="field">購入原価（売却分）<input inputMode="numeric" value={cost} onChange={event => setCost(event.target.value.replace(/\D/g, ''))} placeholder={automaticCost === null ? '未確認' : String(Math.round(automaticCost))} /></label>
        <label className="field">売却額<input inputMode="numeric" value={sale} onChange={event => setSale(event.target.value.replace(/\D/g, ''))} placeholder={String(Math.round(automaticSale))} /></label>
      </div>
      <div className="profit-preview"><span>実現損益</span><strong className={previewProfit === null ? 'warning' : previewProfit >= 0 ? 'positive' : 'negative'}>{previewProfit === null ? '原価未確認' : signedYen(previewProfit)}</strong></div>
      <p className="modal-note">ここで設定した金額はホームの売却損益だけに反映されます。購入履歴・売却履歴・総購入費用・総売却額は変更されません。</p>
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
          <label className="collection-price"><span>想定売価</span><b>¥</b><input aria-label={`${item.product.name}の想定売価`} inputMode="numeric" value={item.product.expectedPrice || ''} placeholder="0" onChange={event => onEditPrice(item.product.id, Number(event.target.value.replace(/\D/g, '')) || 0)} /></label>
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

function SettingsPage({ categories, sources, onAddCategory, onToggleCategory, onAddSource, onToggleSource }: {
  categories: CategoryMaster[]
  sources: SourceMaster[]
  onAddCategory: (name: string, unitType: UnitType) => void
  onToggleCategory: (id: string) => void
  onAddSource: (name: string) => void
  onToggleSource: (id: string) => void
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
    <p className="page-description">取引登録と絞り込みで使用するカテゴリーを管理できます。</p>

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
      onSave({ id: product?.id || crypto.randomUUID(), name: name.trim(), category: category.name, categoryId: category.id, unitType: category.unitType, expectedPrice: product?.expectedPrice || 0 })
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
  const [quantity, setQuantity] = useState(String(trade?.quantity || 1))
  const [amount, setAmount] = useState(String(trade?.amount || ''))
  const [points, setPoints] = useState(String(trade?.points || ''))
  const [date, setDate] = useState(trade?.date || localDateString())
  const currentSource = trade ? sourceForTrade(trade, sources) : undefined
  const availableSources = sources.filter(source => source.active || source.id === currentSource?.id)
  const [sourceId, setSourceId] = useState(currentSource?.id || '')
  const [note, setNote] = useState(trade?.note || '')
  const editableStock = stats.stock + (trade?.type === 'sell' ? trade.quantity : 0)
  const hasUnconfirmedCost = stats.buyQty < stats.sellQty
  const [allowUnconfirmedSale, setAllowUnconfirmedSale] = useState(false)
  const needsUnconfirmedSale = !isBuy && Number(quantity) > editableStock
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={event => {
      event.preventDefault()
      const qty = Number(quantity) || 0
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
      })
    }}>
      <div className="modal-head"><div><p className="eyebrow">{isBuy ? 'PURCHASE' : 'SALES'} RECORD</p><h2>{trade ? `${isBuy ? '購入' : '売却'}履歴を編集` : `${isBuy ? '購入' : '売却'}を追加`}</h2></div><button type="button" onClick={onClose}><X /></button></div>
      <div className="selected-product"><span>{product.category}</span><strong>{product.name}</strong>{!isBuy && <small>{hasUnconfirmedCost ? '購入原価未確認の売却履歴' : `販売可能在庫 ${editableStock.toLocaleString()}個`}</small>}</div>
      <div className="form-grid"><label className="field">数量<input inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} /></label><label className="field">総額（¥）<input inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label></div>
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
