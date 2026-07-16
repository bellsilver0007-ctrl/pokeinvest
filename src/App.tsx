import { useMemo, useState } from 'react'
import { BarChart3, Box, ChevronRight, CircleDollarSign, Download, Home, Pencil, Plus, Search, SlidersHorizontal, Trash2, Wallet, X } from 'lucide-react'
import { categories, declaredTotals, inferUnitType, jaText, seedHoldings, seedTrades, sources, unitLabels, type Trade, type UnitType } from './data'

const yen = (value:number) => `¥${Math.abs(value).toLocaleString('ja-JP')}`
const categoryLabels:Record<string,string>={'전체':'すべて','팩・박스':'パック・ボックス','싱글 카드':'シングルカード','굿즈・기타':'グッズ・その他','포켓몬 외':'ポケモン以外'}
const sourceLabels:Record<string,string>={'전체':'すべて','기타':'その他','메르카리':'メルカリ','카드샵':'カードショップ','북오프':'ブックオフ','요도바시':'ヨドバシ','요도바시 우메다':'ヨドバシ梅田','편의점':'コンビニ','에디온 당첨':'エディオン当選','포켓몬센터':'ポケモンセンター','포켓몬센터 온라인':'ポケモンセンターオンライン','카드박스 에사카점':'カードボックス江坂店','드래곤스타 니혼바시 3호점':'ドラゴンスター日本橋3号店','플레이즈 난바점':'プレイズなんば店','카드박스 니혼바시점':'カードボックス日本橋店','지라풀':'ジラフル','메르카리・카드샵':'メルカリ・カードショップ','한국':'韓国','한국 포켓몬센터 온라인':'韓国ポケモンセンターオンライン','한국 여행':'韓国旅行','중국・증정':'中国・譲渡','중국 포켓몬센터':'中国ポケモンセンター'}
const categoryLabel=(value:string)=>categoryLabels[value]||value
const sourceLabel=(value:string)=>sourceLabels[value]||value
const STORAGE='pokeinvest-trades-v5'
const LEGACY_STORAGES=['pokeinvest-trades-v4','pokeinvest-trades-v3','pokeinvest-trades-v2']

function readTrades():Trade[]{
  try{
    const saved=localStorage.getItem(STORAGE)
    if(saved)return JSON.parse(saved)
    const legacy=LEGACY_STORAGES.map(key=>localStorage.getItem(key)).find(Boolean)
    const source:Trade[]=legacy?JSON.parse(legacy):seedTrades
    const migrated=source.map((trade,index)=>({...trade,name:jaText(trade.name),group:jaText(trade.group||trade.name),note:jaText(trade.note||''),unitType:trade.unitType||inferUnitType(jaText(trade.name),trade.category),sortOrder:trade.sortOrder??index+1}))
    localStorage.setItem(STORAGE,JSON.stringify(migrated))
    return migrated
  }catch{return seedTrades}
}

type ProductLine={key:string;name:string;category:string;unitType:UnitType;trades:Trade[];buyQty:number;sellQty:number;buyAmount:number;sellAmount:number;saleNet:number;realizedCost:number|null;stock:number;profit:number|null}
const genericGroups=new Set(['메르카리','Yahoo!フリマ','카드샵','闲鱼','싱글 판매','한국 굿즈','중국 굿즈','굿즈 판매','포켓몬 외','기타 팩・박스','シングル売却','韓国グッズ','中国グッズ','グッズ売却','ポケモン以外','その他パック・ボックス'])
const getUnitType=(trade:Trade)=>trade.unitType||inferUnitType(trade.name,trade.category)
const getProductName=(trade:Trade)=>{const unit=getUnitType(trade);const group=trade.group?.trim();if(trade.category==='팩・박스'&&group&&!genericGroups.has(group)&&(unit==='box'||unit==='pack'||unit==='unknown'))return group;if(trade.category!=='팩・박스'&&group&&!genericGroups.has(group)&&group!==trade.source)return group;return trade.name.trim()}
const tradeTime=(trade:Trade)=>{if(trade.date){const value=Date.parse(trade.date);if(Number.isFinite(value))return value}if(trade.createdAt){const value=Date.parse(trade.createdAt);if(Number.isFinite(value))return value}return trade.sortOrder||0}
const newestFirst=(a:Trade,b:Trade)=>Number(Boolean(b.date))-Number(Boolean(a.date))||tradeTime(b)-tradeTime(a)

export function App(){
  const [trades,setTrades]=useState<Trade[]>(readTrades)
  const [tab,setTab]=useState<'home'|'trades'|'assets'>('home')
  const [filter,setFilter]=useState('전체')
  const [sourceFilter,setSourceFilter]=useState('전체')
  const [typeFilter,setTypeFilter]=useState<'all'|'buy'|'sell'>('all')
  const [ledgerView,setLedgerView]=useState<'products'|'history'>('products')
  const [query,setQuery]=useState('')
  const [editing,setEditing]=useState<Trade|null>(null)
  const [prefill,setPrefill]=useState<Partial<Trade>|null>(null)
  const [modal,setModal]=useState(false)
  const [expanded,setExpanded]=useState<string|null>(null)
  const [expandedProduct,setExpandedProduct]=useState<string|null>(null)
  const [showAllSold,setShowAllSold]=useState(false)

  const totals=useMemo(()=>{
    const buy=trades.filter(t=>t.type==='buy').reduce((a,t)=>a+t.amount,0)
    const sell=trades.filter(t=>t.type==='sell').reduce((a,t)=>a+t.amount,0)
    const points=trades.reduce((a,t)=>a+t.points,0)
    return {buy,sell,points,profit:sell-buy}
  },[trades])
  const assetTotal=seedHoldings.reduce((a,h)=>a+h.value,0)
  const categoryRows=trades.filter(t=>filter==='전체'||t.category===filter)
  const categoryBuy=categoryRows.filter(t=>t.type==='buy').reduce((a,t)=>a+t.amount,0)
  const categorySell=categoryRows.filter(t=>t.type==='sell').reduce((a,t)=>a+t.amount,0)
  const visible=trades.filter(t=>(filter==='전체'||t.category===filter)&&(sourceFilter==='전체'||(sourceFilter==='기타'?!['메르카리','Yahoo!フリマ','카드샵','闲鱼','요도바시','포켓몬센터'].some(s=>t.source.includes(s)):t.source.includes(sourceFilter)))&&(typeFilter==='all'||t.type===typeFilter)&&`${t.name} ${t.source} ${t.group} ${t.note||''}`.toLowerCase().includes(query.toLowerCase()))
  const sortedVisible=[...visible].sort(newestFirst)
  const groups=new Set(visible.map(t=>t.group)).size
  const productLines=useMemo<ProductLine[]>(()=>{const map=new Map<string,{name:string;category:string;unitType:UnitType;trades:Trade[]}>();trades.forEach(trade=>{const name=getProductName(trade);const unitType=getUnitType(trade);const key=`${trade.category}|${name.toLocaleLowerCase()}|${unitType}`;const item=map.get(key)||{name,category:trade.category,unitType,trades:[]};item.trades.push(trade);map.set(key,item)});return [...map.entries()].map(([key,item])=>{const buys=item.trades.filter(t=>t.type==='buy');const sells=item.trades.filter(t=>t.type==='sell');const buyQty=buys.reduce((a,t)=>a+t.quantity,0);const sellQty=sells.reduce((a,t)=>a+t.quantity,0);const buyAmount=buys.reduce((a,t)=>a+t.amount,0);const sellAmount=sells.reduce((a,t)=>a+t.amount,0);const costAmount=buys.reduce((a,t)=>a+t.amount+t.points+(t.fee||0)+(t.shipping||0),0);const saleNet=sells.reduce((a,t)=>a+t.amount-(t.fee||0)-(t.shipping||0),0);const valid=buyQty>0&&buyQty>=sellQty&&item.unitType!=='unknown';const realizedCost=valid&&sellQty>0?(costAmount/buyQty)*sellQty:valid?0:null;const profit=realizedCost===null?null:saleNet-realizedCost;return {key,...item,buyQty,sellQty,buyAmount,sellAmount,saleNet,realizedCost,stock:valid?buyQty-sellQty:0,profit}}).sort((a,b)=>b.buyAmount-a.buyAmount||b.sellAmount-a.sellAmount||a.name.localeCompare(b.name,'ja'))},[trades])
  const visibleProducts=productLines.filter(p=>(filter==='전체'||p.category===filter)&&`${p.name} ${p.category} ${unitLabels[p.unitType]} ${p.trades.map(t=>t.source).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const soldProducts=productLines.filter(p=>p.sellQty>0).sort((a,b)=>Math.max(...b.trades.filter(t=>t.type==='sell').map(tradeTime))-Math.max(...a.trades.filter(t=>t.type==='sell').map(tradeTime)))
  const confirmedSold=soldProducts.filter(p=>p.realizedCost!==null)
  const realizedSummary=confirmedSold.reduce((sum,p)=>({cost:sum.cost+(p.realizedCost||0),sale:sum.sale+p.saleNet,profit:sum.profit+(p.profit||0)}),{cost:0,sale:0,profit:0})
  const displayedSold=showAllSold?soldProducts:soldProducts.slice(0,5)

  const persist=(next:Trade[])=>{setTrades(next);localStorage.setItem(STORAGE,JSON.stringify(next))}
  const saveTrade=(trade:Trade)=>{const exists=trades.some(t=>t.id===trade.id);persist(exists?trades.map(t=>t.id===trade.id?trade:t):[trade,...trades]);setModal(false);setEditing(null);setPrefill(null)}
  const addForProduct=(product:ProductLine,type:'buy'|'sell')=>{setEditing(null);setPrefill({type,name:product.name,group:product.name,category:product.category,unitType:product.unitType,quantity:1,source:'기타',date:new Date().toISOString().slice(0,10)});setModal(true)}
  const removeTrade=(id:string)=>{if(confirm('この取引を削除しますか？'))persist(trades.filter(t=>t.id!==id))}
  const exportCsv=()=>{
    const head=['区分','グループ','商品形態','商品名','数量','単価','現金','ポイント','購入・販売先','日付','メモ']
    const esc=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`
    const rows=trades.map(t=>[t.type==='buy'?'購入':'売却',t.group,unitLabels[getUnitType(t)],t.name,t.quantity,t.unitPrice||'',t.amount,t.points,sourceLabel(t.source),t.date,t.note||''].map(esc).join(','))
    const blob=new Blob(['\ufeff'+[head.join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pokeinvest-ledger.csv';a.click();URL.revokeObjectURL(url)
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><span/></div><span>Poke Invest</span></div><button className="icon-button" aria-label="取引を検索" onClick={()=>setTab('trades')}><Search size={21}/></button></header>
    <main>
      {tab==='home'&&<>
        <section className="hero"><p className="eyebrow">TOTAL PERFORMANCE · LEDGER</p><div className="hero-row"><div><p className="muted">累計損益</p><h1 className={totals.profit>=0?'positive':'negative'}>{totals.profit<0?'−':'+'}{yen(totals.profit)}</h1></div><span className="loss-badge">{((totals.profit/totals.buy)*100).toFixed(1)}%</span></div><div className="hero-grid"><div><span>購入総額</span><strong>{yen(totals.buy)}</strong></div><div><span>売却総額</span><strong>{yen(totals.sell)}</strong></div></div></section>
        {(totals.buy!==declaredTotals.buy||totals.sell!==declaredTotals.sell)&&<section className="reconcile"><strong>メモの合計と照合が必要です</strong><p>メモ：購入 {yen(declaredTotals.buy)} / 売却 {yen(declaredTotals.sell)}</p><p>差額：購入 {totals.buy-declaredTotals.buy>=0?'+':'−'}{yen(totals.buy-declaredTotals.buy)} / 売却 {totals.sell-declaredTotals.sell>=0?'+':'−'}{yen(totals.sell-declaredTotals.sell)}</p></section>}
        <section className="section"><div className="section-head"><div><p className="eyebrow">LEDGER</p><h2>取引台帳</h2></div><button onClick={()=>setTab('trades')}>全{trades.length}件 <ChevronRight size={16}/></button></div><div className="ledger-preview"><div><span>取引件数</span><strong>{trades.length}件</strong></div><div><span>商品グループ</span><strong>{new Set(trades.map(t=>t.group)).size}個</strong></div><div><span>使用ポイント</span><strong>{totals.points.toLocaleString()}p</strong></div></div></section>
        <section className="section"><div className="section-head"><div><p className="eyebrow">REALIZED PROFIT</p><h2>売却済みの実現損益</h2></div>{soldProducts.length>5&&<button onClick={()=>setShowAllSold(value=>!value)}>{showAllSold?'折りたたむ':'すべて表示'} <ChevronRight size={16}/></button>}</div><div className="realized-card"><div className="realized-status"><span>原価確認済み</span><strong>{confirmedSold.length} / {soldProducts.length}商品</strong></div><div className="realized-totals"><div><span>売却分の原価</span><strong>{yen(Math.round(realizedSummary.cost))}</strong></div><div><span>売却額</span><strong>{yen(Math.round(realizedSummary.sale))}</strong></div><div><span>実現損益</span><strong className={realizedSummary.profit>=0?'positive':'negative'}>{realizedSummary.profit>=0?'+':'−'}{yen(Math.round(realizedSummary.profit))}</strong></div></div><div className="realized-head"><span>商品</span><span>購入原価</span><span>売却額</span><span>損益</span></div><div className="realized-list">{displayedSold.map(p=><button className="realized-row" key={p.key} onClick={()=>{setQuery(p.name);setLedgerView('products');setFilter('전체');setTab('trades')}}><span className="realized-name"><strong>{p.name}</strong><small>{p.sellQty.toLocaleString()}個売却</small></span><span className={p.realizedCost===null?'unconfirmed':''}>{p.realizedCost===null?'未確認':yen(Math.round(p.realizedCost))}</span><span>{yen(Math.round(p.saleNet))}</span><span className={p.profit===null?'unconfirmed':p.profit>=0?'positive':'negative'}>{p.profit===null?'—':`${p.profit>=0?'+':'−'}${yen(Math.round(p.profit))}`}</span></button>)}</div>{!soldProducts.length&&<div className="realized-empty">売却履歴がありません。</div>}{soldProducts.length>5&&!showAllSold&&<p className="realized-more">ほか {soldProducts.length-5}商品</p>}</div><p className="realized-note">平均購入単価 × 売却数量で原価を計算。購入履歴と結び付かない売却は「未確認」と表示します。</p></section>
        <section className="section"><div className="section-head"><div><p className="eyebrow">PORTFOLIO</p><h2>保有資産</h2></div><button onClick={()=>setTab('assets')}>すべて見る <ChevronRight size={16}/></button></div><div className="asset-card"><div><p>現在の評価額</p><h2>{yen(assetTotal)}</h2><span>メモ基準 · {seedHoldings.length}グループ</span></div><div className="donut"><span>84%</span></div></div></section>
        <section className="section"><div className="section-head"><div><p className="eyebrow">BREAKDOWN</p><h2>カテゴリー別損益</h2></div></div><div className="category-list">{categories.slice(1).map((cat,i)=>{const rows=trades.filter(t=>t.category===cat);const buy=rows.filter(t=>t.type==='buy').reduce((a,t)=>a+t.amount,0);const sell=rows.filter(t=>t.type==='sell').reduce((a,t)=>a+t.amount,0);const p=sell-buy;return <button key={cat} className="category-row" onClick={()=>{setFilter(cat);setTab('trades')}}><span className={`cat-icon c${i}`}><Box size={18}/></span><span className="cat-main"><strong>{categoryLabel(cat)}</strong><small>{rows.length}件 · 購入 {yen(buy)}</small></span><span className={p>=0?'positive':'negative'}>{p<0?'−':'+'}{yen(p)}</span><ChevronRight size={17}/></button>})}</div></section>
      </>}

      {tab==='trades'&&<section className="page section ledger-page">
        <div className="ledger-title"><div><p className="eyebrow">SPREADSHEET LEDGER</p><h1 className="page-title">取引台帳</h1></div><button className="export" onClick={exportCsv}><Download size={16}/> CSV</button></div>
        <div className="searchbox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="商品名・取引先・メモを検索"/><SlidersHorizontal size={18}/></div>
        <div className="ledger-view-tabs"><button className={ledgerView==='products'?'active':''} onClick={()=>setLedgerView('products')}>商品別サマリー</button><button className={ledgerView==='history'?'active':''} onClick={()=>setLedgerView('history')}>取引履歴</button></div>
        {ledgerView==='history'&&<div className="type-tabs"><button className={typeFilter==='all'?'active':''} onClick={()=>setTypeFilter('all')}>すべて</button><button className={typeFilter==='buy'?'active':''} onClick={()=>setTypeFilter('buy')}>購入</button><button className={typeFilter==='sell'?'active':''} onClick={()=>setTypeFilter('sell')}>売却</button></div>}
        <div className="chips">{categories.map(c=><button className={filter===c?'active':''} onClick={()=>setFilter(c)} key={c}>{categoryLabel(c)}</button>)}</div>
        <div className="selected-summary"><div className="selected-summary-title"><strong>{categoryLabel(filter)}</strong><span>{categoryRows.length}件</span></div><div className="selected-summary-head"><span>購入</span><span>売却</span></div><div className="selected-summary-values"><strong>{yen(categoryBuy)}</strong><strong>{yen(categorySell)}</strong></div><div className="selected-summary-total"><span>合計</span><strong className={categoryBuy-categorySell<=0?'positive':'negative'}>{categoryBuy-categorySell>0?'+':categoryBuy-categorySell<0?'−':''}{yen(categoryBuy-categorySell)}</strong></div></div>
        {ledgerView==='products'?<>
          <div className="product-summary-info"><span>{visibleProducts.length}商品</span><small>売却損益 ＝ 売却金額 − 売却分の平均取得原価</small></div>
          <div className="compact-product-head"><span>商品名</span><span>購入</span><span>売却</span><span>在庫</span><span>損益</span></div>
          <div className="compact-product-table">{visibleProducts.map(p=><article className={`compact-product-row ${expandedProduct===p.key?'expanded':''}`} key={p.key}>
            <button className="compact-product-summary" onClick={()=>setExpandedProduct(expandedProduct===p.key?null:p.key)}><span className="compact-name"><strong>{p.name}</strong><small>{unitLabels[p.unitType]} · {categoryLabel(p.category)}</small></span><span className="compact-trade buy"><strong>{p.buyQty.toLocaleString()}個</strong><small>{p.buyAmount?yen(p.buyAmount):'—'}</small></span><span className="compact-trade sell"><strong>{p.sellQty.toLocaleString()}個</strong><small>{p.sellAmount?yen(p.sellAmount):'—'}</small></span><span className="compact-stock">{p.profit===null?'要確認':p.stock.toLocaleString()}</span><span className={`compact-profit ${p.profit===null?'unknown':p.profit>=0?'positive':'negative'}`}>{p.sellQty===0?'—':p.profit===null?'原価なし':`${p.profit>=0?'+':'−'}${yen(Math.round(p.profit))}`}</span></button>
            {expandedProduct===p.key&&<div className="compact-product-detail"><div className="compact-add-actions"><button className="buy" onClick={()=>addForProduct(p,'buy')}><Plus size={13}/> 購入を追加</button><button className="sell" onClick={()=>addForProduct(p,'sell')}><Plus size={13}/> 売却を追加</button></div><div className="compact-metrics"><div><span>平均購入価格</span><strong>{p.buyQty?yen(Math.round((p.buyAmount+p.trades.reduce((a,t)=>a+t.points,0))/p.buyQty)):'—'}</strong></div><div><span>残存在庫の原価</span><strong>{p.profit!==null&&p.buyQty?yen(Math.round(((p.buyAmount+p.trades.reduce((a,t)=>a+t.points,0))/p.buyQty)*p.stock)):'—'}</strong></div></div><div className="product-history"><div className="product-history-title">購入・売却履歴 · 新しい順</div>{[...p.trades].sort(newestFirst).map(t=><div className="product-history-row" key={t.id}><span className={`history-type ${t.type}`}>{t.type==='buy'?'購入':'売却'}</span><span><strong>{t.name}</strong><small>{t.date||'日付未入力'} · {sourceLabel(t.source)} · {t.quantity}個</small></span><b className={t.type==='buy'?'negative':'positive'}>{t.type==='buy'?'−':'+'}{yen(t.amount)}</b><button aria-label={`${t.name}を編集`} onClick={()=>{setEditing(t);setPrefill(null);setModal(true)}}><Pencil size={12}/></button></div>)}</div></div>}
          </article>)}</div>
          {!visibleProducts.length&&<div className="empty">条件に一致する商品がありません。</div>}
        </>:<>
          <div className="source-select"><span>購入・販売先</span><select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}>{sources.map(s=><option key={s} value={s}>{sourceLabel(s)}</option>)}</select><span className="result-count">{visible.length}件 · {groups}グループ</span></div>
          <div className="sheet-head"><span>商品名</span><span>購入金額</span><span>売却金額</span></div>
          <div className="history-sort-label">日付の新しい順 · 日付未入力は下に表示</div><div className="sheet">{sortedVisible.map(t=><article className={`sheet-row ${expanded===t.id?'expanded':''}`} key={t.id}><div className="sheet-summary" role="button" tabIndex={0} onClick={()=>setExpanded(expanded===t.id?null:t.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setExpanded(expanded===t.id?null:t.id)}}}><span className="sheet-name"><strong>{t.name}</strong><small><span className={`inline-type ${t.type}`}>{t.type==='buy'?'購入':'売却'}</span>{t.date||'日付未入力'} · {sourceLabel(t.source)} · {t.quantity.toLocaleString()}個</small></span><span className="buy-cell">{t.type==='buy'?yen(t.amount):'—'}</span><span className="sell-cell">{t.type==='sell'?yen(t.amount):'—'}<button className="quick-edit" aria-label={`${t.name}を編集`} onClick={e=>{e.stopPropagation();setEditing(t);setPrefill(null);setModal(true)}}><Pencil size={12}/></button></span></div>{expanded===t.id&&<div className="row-detail"><dl><div><dt>単価</dt><dd>{t.unitPrice?yen(t.unitPrice):'—'}</dd></div><div><dt>ポイント</dt><dd>{t.points.toLocaleString()}p</dd></div><div><dt>日付</dt><dd>{t.date||'未入力'}</dd></div><div><dt>現金合計</dt><dd>{yen(t.amount)}</dd></div></dl>{t.note&&<p className="row-note">{t.note}</p>}<div className="row-actions"><button onClick={()=>{setEditing(t);setPrefill(null);setModal(true)}}><Pencil size={14}/> 編集</button><button className="delete" onClick={()=>removeTrade(t.id)}><Trash2 size={14}/> 削除</button></div></div>}</article>)}{visible.length>0&&<div className="sheet-total"><strong>表示中の合計</strong><span>{yen(visible.filter(t=>t.type==='buy').reduce((a,t)=>a+t.amount,0))}</span><span>{yen(visible.filter(t=>t.type==='sell').reduce((a,t)=>a+t.amount,0))}</span></div>}</div>
          {!visible.length&&<div className="empty">条件に一致する取引がありません。</div>}
        </>}
      </section>}

      {tab==='assets'&&<section className="page section"><p className="eyebrow">COLLECTION</p><h1 className="page-title">保有資産</h1><div className="value-banner"><span>評価額合計</span><strong>{yen(assetTotal)}</strong><small>入力した現在価値を基準に集計</small></div><div className="holding-grid">{seedHoldings.map(h=><article className="holding" key={h.id}><span className="holding-art">{h.category==='팩・박스'?'BOX':'CARD'}</span><div><small>{categoryLabel(h.category)}</small><strong>{h.name}</strong><p>{h.quantity.toLocaleString()}個</p></div><b>{yen(h.value)}</b></article>)}</div></section>}
    </main>
    <button className="fab" onClick={()=>{setEditing(null);setPrefill(null);setModal(true)}} aria-label="取引を追加"><Plus/></button>
    <nav className="bottom-nav"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Home/><span>ホーム</span></button><button className={tab==='trades'?'active':''} onClick={()=>setTab('trades')}><BarChart3/><span>台帳</span></button><span className="nav-gap"/><button className={tab==='assets'?'active':''} onClick={()=>setTab('assets')}><Wallet/><span>資産</span></button><button><CircleDollarSign/><span>分析</span></button></nav>
    {modal&&<TradeModal trade={editing} prefill={prefill} onClose={()=>{setModal(false);setEditing(null);setPrefill(null)}} onSave={saveTrade}/>} 
  </div>
}

function TradeModal({trade,prefill,onClose,onSave}:{trade:Trade|null;prefill:Partial<Trade>|null;onClose:()=>void;onSave:(t:Trade)=>void}){
  const initial=trade||prefill
  const [type,setType]=useState<'buy'|'sell'>(initial?.type||'buy');const [name,setName]=useState(initial?.name||'');const [amount,setAmount]=useState(String(initial?.amount||''));const [points,setPoints]=useState(String(initial?.points||''));const [quantity,setQuantity]=useState(String(initial?.quantity||1));const [category,setCategory]=useState(initial?.category||'싱글 카드');const [unitType,setUnitType]=useState<UnitType>(initial?.unitType||inferUnitType(initial?.name||'',initial?.category||'싱글 카드'));const [source,setSource]=useState(initial?.source||'메르카리');const [group,setGroup]=useState(initial?.group||'');const [date,setDate]=useState(trade?trade.date||'':initial?.date||new Date().toISOString().slice(0,10));const [note,setNote]=useState(initial?.note||'')
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal ledger-modal" onSubmit={e=>{e.preventDefault();if(!name||(!amount&&!points))return;const q=Number(quantity)||1;onSave({...trade,id:trade?.id||crypto.randomUUID(),name,amount:Number(amount)||0,points:Number(points)||0,quantity:q,unitPrice:q?Math.round((Number(amount)||0)/q):undefined,type,category,group:group||name,source,date,note,unitType,createdAt:trade?.createdAt||new Date().toISOString()})}}>
    <div className="modal-head"><div><p className="eyebrow">{trade?'EDIT RECORD':'NEW RECORD'}</p><h2>{trade?'取引を編集':'取引を追加'}</h2></div><button type="button" onClick={onClose}><X/></button></div>
    <div className="segmented"><button type="button" className={type==='buy'?'active buy':''} onClick={()=>setType('buy')}>購入</button><button type="button" className={type==='sell'?'active sell':''} onClick={()=>setType('sell')}>売却</button></div>
    <label>商品名<input value={name} onChange={e=>setName(e.target.value)} placeholder="例：イーブイex SAR" autoFocus/></label>
    <div className="form-grid"><label>数量<input inputMode="numeric" value={quantity} onChange={e=>setQuantity(e.target.value.replace(/\D/g,''))}/></label><label>現金合計（¥）<input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,''))} placeholder="0"/></label></div>
    <div className="form-grid"><label>ポイント<input inputMode="numeric" value={points} onChange={e=>setPoints(e.target.value.replace(/\D/g,''))} placeholder="0"/></label><label>日付<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
    <div className="form-grid"><label>カテゴリー<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.slice(1).map(c=><option key={c} value={c}>{categoryLabel(c)}</option>)}</select></label><label>商品形態<select value={unitType} onChange={e=>setUnitType(e.target.value as UnitType)}>{(Object.keys(unitLabels) as UnitType[]).map(value=><option value={value} key={value}>{unitLabels[value]}</option>)}</select></label></div>
    <label>購入・販売先<input value={source} onChange={e=>setSource(e.target.value)}/></label>
    <label>同じ商品としてまとめる<input value={group} onChange={e=>setGroup(e.target.value)} placeholder="購入・売却で同じ名前を入力（例：メガドリーム）"/></label>
    <label>メモ<input value={note} onChange={e=>setNote(e.target.value)} placeholder="セット内容・状態・元メモとの差異など"/></label>
    <button className="submit" type="submit">{trade?'変更を保存':'取引を保存'}</button>
  </form></div>
}
