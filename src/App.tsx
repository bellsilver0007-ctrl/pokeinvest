import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Download,
  Home,
  Images,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import { inferUnitType, jaText, seedHoldings, seedTrades, starterDeckIds, type Trade, type UnitType } from './data'

type Tab = 'home' | 'buy' | 'sell' | 'collection'
type ProductCategory = 'カード' | 'パック' | 'ボックス' | 'スタートデッキ' | 'グッズ' | 'その他'
type Product = {
  id: string
  name: string
  category: ProductCategory
  expectedPrice: number
  manualUnitCost?: number
}
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
const productCategories: ProductCategory[] = ['カード', 'パック', 'ボックス', 'スタートデッキ', 'グッズ', 'その他']
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
const sourceLabel = (value: string) => sourceLabels[value] || value
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
  if (unit === 'goods' || trade.category === '굿즈・기타' || trade.category === '포켓몬 외') return 'グッズ'
  return 'その他'
}
const unitFromProduct = (product: Product): UnitType => ({
  カード: 'card', パック: 'pack', ボックス: 'box', スタートデッキ: 'deck', グッズ: 'goods', その他: 'unknown',
})[product.category] as UnitType
const legacyCategoryFromProduct = (product: Product) => {
  if (product.category === 'カード') return '싱글 카드'
  if (['パック', 'ボックス', 'スタートデッキ'].includes(product.category)) return '팩・박스'
  if (product.category === 'グッズ') return '굿즈・기타'
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

function createProductsFromTrades(trades: Trade[]): Product[] {
  const seen = new Set<string>()
  const products: Product[] = []
  trades.forEach(trade => {
    const name = getProductName(trade)
    const category = productCategoryFromTrade(trade)
    const key = `${category}|${normalize(name)}`
    if (!name || seen.has(key)) return
    seen.add(key)
    const holding = seedHoldings.find(item => item.category === '팩・박스' && category === 'ボックス' && normalize(item.name).startsWith(normalize(name)))
    products.push({ id: `migrated-product-${products.length + 1}`, name, category, expectedPrice: holding ? Math.round(holding.value / holding.quantity) : 0 })
  })
  starterDeckIds.forEach(name => {
    const key = `スタートデッキ|${normalize(name)}`
    if (seen.has(key)) return
    seen.add(key)
    products.push({ id: `starter-deck-${name}`, name, category: 'スタートデッキ', expectedPrice: 0 })
  })
  return products.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

function readProducts(trades: Trade[]): Product[] {
  try {
    const saved = localStorage.getItem(PRODUCT_STORAGE)
    const savedProducts: Product[] = saved ? JSON.parse(saved) : []
    const savedIds = new Set(savedProducts.map(product => product.id))
    const unlinkedTrades = trades.filter(trade => !trade.productId || !savedIds.has(trade.productId))
    const derivedProducts = createProductsFromTrades(unlinkedTrades)
    const merged = [...savedProducts]
    derivedProducts.forEach(product => {
      const alreadyExists = merged.some(savedProduct => savedProduct.category === product.category && normalize(savedProduct.name) === normalize(product.name))
      if (!alreadyExists) merged.push({ ...product, id: `migrated-product-${merged.length + 1}` })
    })
    const products = merged.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    localStorage.setItem(PRODUCT_STORAGE, JSON.stringify(products))
    return products
  } catch {
    return createProductsFromTrades(trades)
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
  const automaticAverageCost = buyQty > 0 ? buyCost / buyQty : null
  const averageCost = product.manualUnitCost && product.manualUnitCost > 0 ? product.manualUnitCost : automaticAverageCost
  const validCost = Boolean(product.manualUnitCost && product.manualUnitCost > 0) || (buyQty > 0 && buyQty >= sellQty)
  const soldCost = validCost && averageCost !== null ? averageCost * sellQty : null
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
  const [products, setProducts] = useState<Product[]>(() => readProducts(trades))
  const [collection, setCollection] = useState<CollectionData>(readCollection)
  const [tab, setTab] = useState<Tab>('home')
  const [productModal, setProductModal] = useState<Product | 'new' | null>(null)
  const [tradeModal, setTradeModal] = useState<{ product: Product; type: 'buy' | 'sell'; trade: Trade | null } | null>(null)
  const [pickerType, setPickerType] = useState<'buy' | 'sell' | null>(null)
  const [collectionModal, setCollectionModal] = useState<ManualCollectionCard | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'すべて'>('すべて')
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [showAllSold, setShowAllSold] = useState(false)

  const stats = useMemo(() => products.map(product => calculateStats(product, trades)), [products, trades])
  const totals = useMemo(() => {
    const confirmedSales = stats.filter(item => item.sellQty > 0 && item.realizedProfit !== null)
    const realizedProfit = confirmedSales.reduce((sum, item) => sum + (item.realizedProfit || 0), 0)
    const realizedSales = confirmedSales.reduce((sum, item) => sum + item.saleNet, 0)
    const realizedCost = confirmedSales.reduce((sum, item) => sum + (item.soldCost || 0), 0)
    const potentialValue = stats.reduce((sum, item) => sum + item.potentialValue, 0)
    const remainingCost = stats.reduce((sum, item) => sum + (item.remainingCost || 0), 0)
    const potentialProfit = stats.filter(item => item.potentialProfit !== null).reduce((sum, item) => sum + (item.potentialProfit || 0), 0)
    return {
      confirmedSales: confirmedSales.length,
      soldProducts: stats.filter(item => item.sellQty > 0).length,
      realizedProfit,
      realizedSales,
      realizedCost,
      potentialValue,
      remainingCost,
      potentialProfit,
      estimatedProfit: realizedProfit + potentialProfit,
    }
  }, [stats])
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
    const matchesCategory = categoryFilter === 'すべて' || item.product.category === categoryFilter
    const target = `${item.product.name} ${item.product.category}`.toLocaleLowerCase('ja-JP')
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
  const persistCollection = (next: CollectionData) => {
    setCollection(next)
    localStorage.setItem(COLLECTION_STORAGE, JSON.stringify(next))
  }
  const saveProduct = (product: Product) => {
    const existing = products.find(item => item.id === product.id)
    if (products.some(item => item.id !== product.id && item.category === product.category && normalize(item.name) === normalize(product.name))) {
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
  const setManualUnitCost = (productId: string, value?: number) => {
    persistProducts(products.map(product => product.id === productId ? { ...product, manualUnitCost: value && value > 0 ? value : undefined } : product))
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
    const rows = target.map(trade => [
      trade.type === 'buy' ? '購入' : '売却', trade.name, productCategoryFromTrade(trade), trade.quantity,
      trade.amount, trade.points, sourceLabel(trade.source), trade.date, trade.note || '',
    ].map(escape).join(','))
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
    if (nextTab === 'buy' || nextTab === 'sell') {
      setQuery('')
      setCategoryFilter('すべて')
      setHistoryKey(null)
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><i /></span><strong>Poke Invest</strong></div>
      {tab === 'home' && <button className="top-add" onClick={() => setProductModal('new')}><Plus size={17} /> 商品追加</button>}
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
          <div className="section-head"><div><p className="eyebrow">PRODUCT MASTER</p><h2>商品情報</h2></div><button className="text-button" onClick={() => setProductModal('new')}><Plus size={15} /> 商品追加</button></div>
          <div className="product-master">
            {displayedProducts.map(item => <article className="master-row" key={item.product.id}>
              <button className="master-info" onClick={() => setProductModal(item.product)}>
                <strong>{item.product.name}</strong><small>{item.product.category} · 在庫 {item.stock.toLocaleString()}個</small>
              </button>
              <button className="row-edit" aria-label={`${item.product.name}の商品情報を編集`} onClick={() => setProductModal(item.product)}><Pencil size={14} /></button>
              <div className="master-prices">
                <label className="price-input cost-input"><span>手動原価（1個）</span><b>¥</b><input aria-label={`${item.product.name}の手動原価`} inputMode="numeric" value={item.product.manualUnitCost || ''} placeholder={item.buyQty ? Math.round(item.buyCost / item.buyQty).toLocaleString('ja-JP') : '自動計算'} onChange={event => { const raw = event.target.value.replace(/\D/g, ''); setManualUnitCost(item.product.id, raw ? Number(raw) : undefined) }} /></label>
                <label className="price-input"><span>想定売価（1個）</span><b>¥</b><input aria-label={`${item.product.name}の想定売価`} inputMode="numeric" value={item.product.expectedPrice || ''} placeholder="0" onChange={event => setExpectedPrice(item.product.id, Number(event.target.value.replace(/\D/g, '')) || 0)} /></label>
              </div>
            </article>)}
            {!stats.length && <div className="empty">商品情報がありません。</div>}
          </div>
          {stats.length > 8 && <button className="wide-more" onClick={() => setShowAllProducts(value => !value)}>{showAllProducts ? '折りたたむ' : `すべて表示（${stats.length}商品）`} <ChevronDown size={15} /></button>}
          <p className="calculation-note">手動原価は損益計算だけに使用され、購入履歴の金額や総支出額には反映されません。空欄にすると購入履歴から自動計算します。</p>
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
            {displayedSold.map(item => <button className="realized-row" key={item.product.id} onClick={() => { setQuery(item.product.name); setCategoryFilter('すべて'); setTab('sell') }}>
              <span><strong>{item.product.name}</strong><small>{item.sellQty}個売却</small></span>
              <b className={item.soldCost === null ? 'warning' : ''}>{item.soldCost === null ? '未確認' : yen(item.soldCost)}</b>
              <b>{yen(item.saleNet)}</b>
              <b className={item.realizedProfit === null ? 'warning' : item.realizedProfit >= 0 ? 'positive' : 'negative'}>{item.realizedProfit === null ? '—' : signedYen(item.realizedProfit)}</b>
            </button>)}
            {!soldStats.length && <div className="empty">売却履歴がありません。</div>}
          </div>
          {soldStats.length > 5 && <button className="wide-more" onClick={() => setShowAllSold(value => !value)}>{showAllSold ? '折りたたむ' : `すべて表示（${soldStats.length}商品）`} <ChevronDown size={15} /></button>}
          <p className="calculation-note">購入原価は加重平均単価 × 売却数量で計算します。</p>
        </section>
      </>}

      {(tab === 'buy' || tab === 'sell') && <TransactionPage
        type={tab}
        stats={filteredStats.filter(item => tab === 'buy' ? item.buyTrades.length > 0 : item.sellTrades.length > 0)}
        query={query}
        categoryFilter={categoryFilter}
        historyKey={historyKey}
        onQuery={setQuery}
        onCategory={setCategoryFilter}
        onHistory={setHistoryKey}
        onAdd={(product, type) => setTradeModal({ product, type, trade: null })}
        onEdit={(product, type, trade) => setTradeModal({ product, type, trade })}
        onDelete={(product, trade) => deleteTrade(trade, product)}
        onRegister={() => setPickerType(tab)}
        onExport={() => exportCsv(tab)}
      />}

      {tab === 'collection' && <CollectionPage
        stats={stats.filter(item => item.product.category === 'カード' && !collection.hiddenProductIds.includes(item.product.id))}
        manualCards={collection.manualCards}
        onEditPrice={setExpectedPrice}
        onAdd={() => setCollectionModal('new')}
        onEditManual={setCollectionModal}
        onHideProduct={hideCollectionProduct}
      />}
    </main>

    <nav className="bottom-nav">
      <button className={tab === 'home' ? 'active' : ''} onClick={() => openTab('home')}><Home /><span>ホーム</span></button>
      <button className={tab === 'buy' ? 'active' : ''} onClick={() => openTab('buy')}><ShoppingBag /><span>購入</span></button>
      <button className={tab === 'sell' ? 'active' : ''} onClick={() => openTab('sell')}><CircleDollarSign /><span>売却</span></button>
      <button className={tab === 'collection' ? 'active' : ''} onClick={() => openTab('collection')}><Images /><span>コレクション</span></button>
    </nav>

    {productModal && <ProductModal
      product={productModal === 'new' ? null : productModal}
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
    />}
    {pickerType && <ProductPickerModal
      type={pickerType}
      stats={stats}
      onClose={() => setPickerType(null)}
      onSelect={product => {
        const type = pickerType
        setPickerType(null)
        setTradeModal({ product, type, trade: null })
      }}
    />}
    {collectionModal && <CollectionModal
      card={collectionModal === 'new' ? null : collectionModal}
      hiddenProducts={stats.filter(item => item.product.category === 'カード' && collection.hiddenProductIds.includes(item.product.id)).map(item => item.product)}
      onClose={() => setCollectionModal(null)}
      onSave={saveManualCard}
      onDelete={deleteManualCard}
      onRestore={restoreCollectionProduct}
    />}
  </div>
}

function TransactionPage({
  type, stats, query, categoryFilter, historyKey, onQuery, onCategory, onHistory, onAdd, onEdit, onDelete, onRegister, onExport,
}: {
  type: 'buy' | 'sell'
  stats: ProductStats[]
  query: string
  categoryFilter: ProductCategory | 'すべて'
  historyKey: string | null
  onQuery: (value: string) => void
  onCategory: (value: ProductCategory | 'すべて') => void
  onHistory: (value: string | null) => void
  onAdd: (product: Product, type: 'buy' | 'sell') => void
  onEdit: (product: Product, type: 'buy' | 'sell', trade: Trade) => void
  onDelete: (product: Product, trade: Trade) => void
  onRegister: () => void
  onExport: () => void
}) {
  const isBuy = type === 'buy'
  return <section className="page section transaction-page">
    <div className="page-title-row"><div><p className="eyebrow">{isBuy ? 'PURCHASE HISTORY' : 'SALES HISTORY'}</p><h1>{isBuy ? '購入履歴' : '売却履歴'}</h1></div><div className="page-actions"><button className="register-button" onClick={onRegister}><Plus size={15} /> 履歴登録</button><button className="export-button" onClick={onExport}><Download size={15} /> CSV</button></div></div>
    <p className="page-description">{isBuy ? '登録済みの商品を選んで購入履歴を登録・管理します。' : '在庫のある商品を選んで売却履歴を登録・管理します。'}</p>
    <div className="search-box"><Search size={17} /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="商品名を検索" /></div>
    <div className="category-chips">{(['すべて', ...productCategories] as const).map(category => <button className={categoryFilter === category ? 'active' : ''} key={category} onClick={() => onCategory(category)}>{category}</button>)}</div>
    <div className={`ledger-head ${isBuy ? 'buy' : 'sell'}`}><span>商品名 / カテゴリー</span>{isBuy ? <><span>購入数</span><span>合計</span></> : <><span>在庫</span><span>売却数</span><span>合計</span></>}<span /></div>
    <div className="ledger-products">
      {stats.map(item => {
        const key = `${type}|${item.product.id}`
        const histories = isBuy ? item.buyTrades : item.sellTrades
        const canSell = item.stock > 0
        return <article className="ledger-product" key={item.product.id}>
          <div className={`ledger-main ${isBuy ? 'buy' : 'sell'}`}>
            <button className="ledger-add" disabled={!isBuy && !canSell} onClick={() => onAdd(item.product, type)}>
              <span className="ledger-name"><strong>{item.product.name}</strong><small>{item.product.category}{!isBuy && !canSell ? ' · 在庫なし' : ''}</small></span>
              {isBuy ? <><b>{item.buyQty.toLocaleString()}</b><b>{yen(item.buyAmount)}</b></> : <><b>{item.stock.toLocaleString()}</b><b>{item.sellQty.toLocaleString()}</b><b>{yen(item.sellAmount)}</b></>}
            </button>
            <button className={`history-toggle ${historyKey === key ? 'active' : ''}`} aria-label={`${item.product.name}の履歴`} disabled={!histories.length} onClick={() => onHistory(historyKey === key ? null : key)}><ChevronDown size={15} /></button>
          </div>
          {historyKey === key && <div className="trade-history">
            <div className="history-add-row"><span>{isBuy ? '購入履歴' : '売却履歴'} · {histories.length}件</span><button disabled={!isBuy && !canSell} onClick={() => onAdd(item.product, type)}><Plus size={13} /> {isBuy ? '購入履歴を追加' : '売却履歴を追加'}</button></div>
            {histories.map(trade => <div className="trade-history-item" key={trade.id}>
              <button className="history-edit" onClick={() => onEdit(item.product, type, trade)}>
                <span><strong>{trade.date || '日付未入力'}</strong><small>{sourceLabel(trade.source)} · {trade.quantity}個 · 単価 {yen((trade.amount + (isBuy ? trade.points : 0)) / trade.quantity)}{trade.points ? ` · ${trade.points.toLocaleString()}p使用` : ''}</small></span>
                <b>{yen(trade.amount)}</b><Pencil size={13} />
              </button>
              <button className="history-delete" aria-label={`${trade.date || '日付未入力'}の履歴を削除`} onClick={() => onDelete(item.product, trade)}><Trash2 size={13} /></button>
            </div>)}
          </div>}
        </article>
      })}
      {!stats.length && <div className="empty">{isBuy ? '購入履歴がありません。' : '売却履歴がありません。'}<br />上の「履歴登録」から追加できます。</div>}
    </div>
    <p className="page-hint">履歴を登録する商品がない場合は、ホームの「商品追加」から先に商品情報を登録してください。</p>
  </section>
}

function ProductPickerModal({ type, stats, onClose, onSelect }: {
  type: 'buy' | 'sell'
  stats: ProductStats[]
  onClose: () => void
  onSelect: (product: Product) => void
}) {
  const [query, setQuery] = useState('')
  const isBuy = type === 'buy'
  const available = stats.filter(item => isBuy || item.stock > 0).filter(item => `${item.product.name} ${item.product.category}`.toLocaleLowerCase('ja-JP').includes(query.toLocaleLowerCase('ja-JP')))
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="modal picker-modal">
      <div className="modal-head"><div><p className="eyebrow">SELECT PRODUCT</p><h2>{isBuy ? '購入する商品を選択' : '売却する商品を選択'}</h2></div><button type="button" onClick={onClose}><X /></button></div>
      <div className="search-box"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="商品名を検索" autoFocus /></div>
      <div className="picker-list">{available.map(item => <button key={item.product.id} onClick={() => onSelect(item.product)}>
        <span><strong>{item.product.name}</strong><small>{item.product.category}{isBuy ? ` · 購入累計 ${item.buyQty}個` : ` · 在庫 ${item.stock}個`}</small></span><ChevronRight size={16} />
      </button>)}</div>
      {!available.length && <div className="empty">{isBuy ? '商品が見つかりません。' : '売却可能な在庫がありません。'}</div>}
    </section>
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

function ProductModal({ product, onClose, onSave, onDelete }: {
  product: Product | null
  onClose: () => void
  onSave: (product: Product) => boolean
  onDelete: (product: Product) => void
}) {
  const [name, setName] = useState(product?.name || '')
  const [category, setCategory] = useState<ProductCategory>(product?.category || 'カード')
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={event => {
      event.preventDefault()
      if (!name.trim()) return
      onSave({ id: product?.id || crypto.randomUUID(), name: name.trim(), category, expectedPrice: product?.expectedPrice || 0, manualUnitCost: product?.manualUnitCost })
    }}>
      <div className="modal-head"><div><p className="eyebrow">PRODUCT INFO</p><h2>{product ? '商品情報を編集' : '商品を追加'}</h2></div><button type="button" onClick={onClose}><X /></button></div>
      <label className="field">商品名<input value={name} onChange={event => setName(event.target.value)} placeholder="例：イーブイex SAR" autoFocus /></label>
      <label className="field">カテゴリー<select value={category} onChange={event => setCategory(event.target.value as ProductCategory)}>{productCategories.map(item => <option key={item}>{item}</option>)}</select></label>
      <p className="modal-note">購入・売却は商品登録後に各タブから追加できます。</p>
      <button className="submit-button" type="submit">{product ? '変更を保存' : '商品を登録'}</button>
      {product && <button className="delete-button" type="button" onClick={() => onDelete(product)}><Trash2 size={15} /> 商品を削除</button>}
    </form>
  </div>
}

function TradeModal({ product, stats, type, trade, onClose, onSave, onDelete }: {
  product: Product
  stats: ProductStats
  type: 'buy' | 'sell'
  trade: Trade | null
  onClose: () => void
  onSave: (trade: Trade) => void
  onDelete: (trade: Trade) => void
}) {
  const isBuy = type === 'buy'
  const [quantity, setQuantity] = useState(String(trade?.quantity || 1))
  const [amount, setAmount] = useState(String(trade?.amount || ''))
  const [points, setPoints] = useState(String(trade?.points || ''))
  const [date, setDate] = useState(trade?.date || new Date().toISOString().slice(0, 10))
  const [source, setSource] = useState(trade?.source || '')
  const [note, setNote] = useState(trade?.note || '')
  const editableStock = stats.stock + (trade?.type === 'sell' ? trade.quantity : 0)
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={event => {
      event.preventDefault()
      const qty = Number(quantity) || 0
      const cash = Number(amount) || 0
      const usedPoints = isBuy ? Number(points) || 0 : 0
      if (qty <= 0 || (cash <= 0 && usedPoints <= 0)) return
      if (!isBuy && qty > editableStock) {
        alert(`現在の在庫は${editableStock}個です。在庫を超えて売却できません。`)
        return
      }
      if (isBuy && trade && stats.buyQty - trade.quantity + qty < stats.sellQty) {
        alert('購入数を販売済み数量より少なく変更することはできません。')
        return
      }
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
        source: source.trim() || 'その他',
        note: note.trim(),
        fee: trade?.fee || 0,
        shipping: trade?.shipping || 0,
        createdAt: trade?.createdAt || new Date().toISOString(),
        sortOrder: trade?.sortOrder || Date.now(),
      })
    }}>
      <div className="modal-head"><div><p className="eyebrow">{isBuy ? 'PURCHASE' : 'SALES'} RECORD</p><h2>{trade ? `${isBuy ? '購入' : '売却'}履歴を編集` : `${isBuy ? '購入' : '売却'}を追加`}</h2></div><button type="button" onClick={onClose}><X /></button></div>
      <div className="selected-product"><span>{product.category}</span><strong>{product.name}</strong>{!isBuy && <small>販売可能在庫 {editableStock.toLocaleString()}個</small>}</div>
      <div className="form-grid"><label className="field">数量<input inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} /></label><label className="field">総額（¥）<input inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label></div>
      {isBuy && <label className="field">使用ポイント<input inputMode="numeric" value={points} onChange={event => setPoints(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label>}
      <label className="field">日付<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="field">{isBuy ? '購入先' : '販売先'}<input value={source} onChange={event => setSource(event.target.value)} placeholder={isBuy ? '例：ポケモンセンター' : '例：メルカリ'} /></label>
      <label className="field">メモ<input value={note} onChange={event => setNote(event.target.value)} placeholder="状態・セット内容など" /></label>
      <button className="submit-button" type="submit">{trade ? '変更を保存' : `${isBuy ? '購入' : '売却'}履歴を追加`}</button>
      {trade && <button className="delete-button" type="button" onClick={() => onDelete(trade)}><Trash2 size={15} /> 履歴を削除</button>}
    </form>
  </div>
}
