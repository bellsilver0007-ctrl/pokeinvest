import { useMemo, useState } from 'react'
import { BarChart3, Box, ChevronRight, CircleDollarSign, Download, Home, Pencil, Plus, Search, SlidersHorizontal, Trash2, Wallet, X } from 'lucide-react'
import { categories, declaredTotals, inferUnitType, seedHoldings, seedTrades, sources, unitLabels, type Trade, type UnitType } from './data'

const yen = (value:number) => `¥${Math.abs(value).toLocaleString('ja-JP')}`
const STORAGE='pokeinvest-trades-v4'
const LEGACY_STORAGES=['pokeinvest-trades-v3','pokeinvest-trades-v2']

function readTrades():Trade[]{
  try{
    const saved=localStorage.getItem(STORAGE)
    if(saved)return JSON.parse(saved)
    const legacy=LEGACY_STORAGES.map(key=>localStorage.getItem(key)).find(Boolean)
    const source:Trade[]=legacy?JSON.parse(legacy):seedTrades
    const migrated=source.map((trade,index)=>({...trade,unitType:trade.unitType||inferUnitType(trade.name,trade.category),sortOrder:trade.sortOrder??index+1}))
    localStorage.setItem(STORAGE,JSON.stringify(migrated))
    return migrated
  }catch{return seedTrades}
}

type ProductLine={key:string;name:string;category:string;unitType:UnitType;trades:Trade[];buyQty:number;sellQty:number;buyAmount:number;sellAmount:number;stock:number;profit:number|null}
const genericGroups=new Set(['메르카리','Yahoo!フリマ','카드샵','闲鱼','싱글 판매','한국 굿즈','중국 굿즈','굿즈 판매','포켓몬 외','기타 팩・박스'])
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
  const productLines=useMemo<ProductLine[]>(()=>{const map=new Map<string,{name:string;category:string;unitType:UnitType;trades:Trade[]}>();trades.forEach(trade=>{const name=getProductName(trade);const unitType=getUnitType(trade);const key=`${trade.category}|${name.toLocaleLowerCase()}|${unitType}`;const item=map.get(key)||{name,category:trade.category,unitType,trades:[]};item.trades.push(trade);map.set(key,item)});return [...map.entries()].map(([key,item])=>{const buys=item.trades.filter(t=>t.type==='buy');const sells=item.trades.filter(t=>t.type==='sell');const buyQty=buys.reduce((a,t)=>a+t.quantity,0);const sellQty=sells.reduce((a,t)=>a+t.quantity,0);const buyAmount=buys.reduce((a,t)=>a+t.amount,0);const sellAmount=sells.reduce((a,t)=>a+t.amount,0);const costAmount=buys.reduce((a,t)=>a+t.amount+t.points+(t.fee||0)+(t.shipping||0),0);const saleNet=sells.reduce((a,t)=>a+t.amount-(t.fee||0)-(t.shipping||0),0);const valid=buyQty>0&&buyQty>=sellQty&&item.unitType!=='unknown';const profit=!valid?null:sellQty===0?0:saleNet-(costAmount/buyQty)*sellQty;return {key,...item,buyQty,sellQty,buyAmount,sellAmount,stock:valid?buyQty-sellQty:0,profit}}).sort((a,b)=>b.buyAmount-a.buyAmount||b.sellAmount-a.sellAmount||a.name.localeCompare(b.name,'ko'))},[trades])
  const visibleProducts=productLines.filter(p=>(filter==='전체'||p.category===filter)&&`${p.name} ${p.category} ${unitLabels[p.unitType]} ${p.trades.map(t=>t.source).join(' ')}`.toLowerCase().includes(query.toLowerCase()))

  const persist=(next:Trade[])=>{setTrades(next);localStorage.setItem(STORAGE,JSON.stringify(next))}
  const saveTrade=(trade:Trade)=>{const exists=trades.some(t=>t.id===trade.id);persist(exists?trades.map(t=>t.id===trade.id?trade:t):[trade,...trades]);setModal(false);setEditing(null);setPrefill(null)}
  const addForProduct=(product:ProductLine,type:'buy'|'sell')=>{setEditing(null);setPrefill({type,name:product.name,group:product.name,category:product.category,unitType:product.unitType,quantity:1,source:'기타',date:new Date().toISOString().slice(0,10)});setModal(true)}
  const removeTrade=(id:string)=>{if(confirm('이 거래를 삭제할까요?'))persist(trades.filter(t=>t.id!==id))}
  const exportCsv=()=>{
    const head=['구분','그룹','형태','상품명','수량','단가','현금','포인트','거래처','날짜','메모']
    const esc=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`
    const rows=trades.map(t=>[t.type==='buy'?'매입':'매도',t.group,unitLabels[getUnitType(t)],t.name,t.quantity,t.unitPrice||'',t.amount,t.points,t.source,t.date,t.note||''].map(esc).join(','))
    const blob=new Blob(['\ufeff'+[head.join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pokeinvest-ledger.csv';a.click();URL.revokeObjectURL(url)
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><span/></div><span>Poke Invest</span></div><button className="icon-button" aria-label="거래 검색" onClick={()=>setTab('trades')}><Search size={21}/></button></header>
    <main>
      {tab==='home'&&<>
        <section className="hero"><p className="eyebrow">TOTAL PERFORMANCE · LEDGER</p><div className="hero-row"><div><p className="muted">누적 실현 손익</p><h1 className={totals.profit>=0?'positive':'negative'}>{totals.profit<0?'−':'+'}{yen(totals.profit)}</h1></div><span className="loss-badge">{((totals.profit/totals.buy)*100).toFixed(1)}%</span></div><div className="hero-grid"><div><span>총 매입</span><strong>{yen(totals.buy)}</strong></div><div><span>총 매도</span><strong>{yen(totals.sell)}</strong></div></div></section>
        {(totals.buy!==declaredTotals.buy||totals.sell!==declaredTotals.sell)&&<section className="reconcile"><strong>메모 합계와 대조 필요</strong><p>메모: 매입 {yen(declaredTotals.buy)} / 매도 {yen(declaredTotals.sell)}</p><p>차이: 매입 {totals.buy-declaredTotals.buy>=0?'+':'−'}{yen(totals.buy-declaredTotals.buy)} / 매도 {totals.sell-declaredTotals.sell>=0?'+':'−'}{yen(totals.sell-declaredTotals.sell)}</p></section>}
        <section className="section"><div className="section-head"><div><p className="eyebrow">LEDGER</p><h2>상세 거래 장부</h2></div><button onClick={()=>setTab('trades')}>전체 {trades.length}건 <ChevronRight size={16}/></button></div><div className="ledger-preview"><div><span>개별 거래</span><strong>{trades.length}건</strong></div><div><span>상품 그룹</span><strong>{new Set(trades.map(t=>t.group)).size}개</strong></div><div><span>사용 포인트</span><strong>{totals.points.toLocaleString()}p</strong></div></div></section>
        <section className="section"><div className="section-head"><div><p className="eyebrow">PORTFOLIO</p><h2>보유 자산</h2></div><button onClick={()=>setTab('assets')}>전체 보기 <ChevronRight size={16}/></button></div><div className="asset-card"><div><p>현재 평가액</p><h2>{yen(assetTotal)}</h2><span>메모 기준 · {seedHoldings.length}개 그룹</span></div><div className="donut"><span>84%</span></div></div></section>
        <section className="section"><div className="section-head"><div><p className="eyebrow">BREAKDOWN</p><h2>카테고리별 손익</h2></div></div><div className="category-list">{categories.slice(1).map((cat,i)=>{const rows=trades.filter(t=>t.category===cat);const buy=rows.filter(t=>t.type==='buy').reduce((a,t)=>a+t.amount,0);const sell=rows.filter(t=>t.type==='sell').reduce((a,t)=>a+t.amount,0);const p=sell-buy;return <button key={cat} className="category-row" onClick={()=>{setFilter(cat);setTab('trades')}}><span className={`cat-icon c${i}`}><Box size={18}/></span><span className="cat-main"><strong>{cat}</strong><small>{rows.length}건 · 매입 {yen(buy)}</small></span><span className={p>=0?'positive':'negative'}>{p<0?'−':'+'}{yen(p)}</span><ChevronRight size={17}/></button>})}</div></section>
      </>}

      {tab==='trades'&&<section className="page section ledger-page">
        <div className="ledger-title"><div><p className="eyebrow">SPREADSHEET LEDGER</p><h1 className="page-title">상세 거래 장부</h1></div><button className="export" onClick={exportCsv}><Download size={16}/> CSV</button></div>
        <div className="searchbox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="상품명, 거래처, 메모 검색"/><SlidersHorizontal size={18}/></div>
        <div className="ledger-view-tabs"><button className={ledgerView==='products'?'active':''} onClick={()=>setLedgerView('products')}>상품별 요약</button><button className={ledgerView==='history'?'active':''} onClick={()=>setLedgerView('history')}>개별 거래</button></div>
        {ledgerView==='history'&&<div className="type-tabs"><button className={typeFilter==='all'?'active':''} onClick={()=>setTypeFilter('all')}>전체</button><button className={typeFilter==='buy'?'active':''} onClick={()=>setTypeFilter('buy')}>매입</button><button className={typeFilter==='sell'?'active':''} onClick={()=>setTypeFilter('sell')}>매도</button></div>}
        <div className="chips">{categories.map(c=><button className={filter===c?'active':''} onClick={()=>setFilter(c)} key={c}>{c}</button>)}</div>
        <div className="selected-summary"><div className="selected-summary-title"><strong>{filter}</strong><span>{categoryRows.length}건</span></div><div className="selected-summary-head"><span>매입</span><span>매도</span></div><div className="selected-summary-values"><strong>{yen(categoryBuy)}</strong><strong>{yen(categorySell)}</strong></div><div className="selected-summary-total"><span>총합</span><strong className={categoryBuy-categorySell<=0?'positive':'negative'}>{categoryBuy-categorySell>0?'+':categoryBuy-categorySell<0?'−':''}{yen(categoryBuy-categorySell)}</strong></div></div>
        {ledgerView==='products'?<>
          <div className="product-summary-info"><span>{visibleProducts.length}개 상품</span><small>판매 손익 = 판매금액 − 판매 수량의 평균 매입 원가</small></div>
          <div className="compact-product-head"><span>제품 이름</span><span>매입</span><span>매도</span><span>재고</span><span>손익</span></div>
          <div className="compact-product-table">{visibleProducts.map(p=><article className={`compact-product-row ${expandedProduct===p.key?'expanded':''}`} key={p.key}>
            <button className="compact-product-summary" onClick={()=>setExpandedProduct(expandedProduct===p.key?null:p.key)}><span className="compact-name"><strong>{p.name}</strong><small>{unitLabels[p.unitType]} · {p.category}</small></span><span className="compact-trade buy"><strong>{p.buyQty.toLocaleString()}개</strong><small>{p.buyAmount?yen(p.buyAmount):'—'}</small></span><span className="compact-trade sell"><strong>{p.sellQty.toLocaleString()}개</strong><small>{p.sellAmount?yen(p.sellAmount):'—'}</small></span><span className="compact-stock">{p.profit===null?'확인':p.stock.toLocaleString()}</span><span className={`compact-profit ${p.profit===null?'unknown':p.profit>=0?'positive':'negative'}`}>{p.sellQty===0?'—':p.profit===null?'원가없음':`${p.profit>=0?'+':'−'}${yen(Math.round(p.profit))}`}</span></button>
            {expandedProduct===p.key&&<div className="compact-product-detail"><div className="compact-add-actions"><button className="buy" onClick={()=>addForProduct(p,'buy')}><Plus size={13}/> 매입 추가</button><button className="sell" onClick={()=>addForProduct(p,'sell')}><Plus size={13}/> 매도 추가</button></div><div className="compact-metrics"><div><span>평균 매입가</span><strong>{p.buyQty?yen(Math.round((p.buyAmount+p.trades.reduce((a,t)=>a+t.points,0))/p.buyQty)):'—'}</strong></div><div><span>남은 재고 원가</span><strong>{p.profit!==null&&p.buyQty?yen(Math.round(((p.buyAmount+p.trades.reduce((a,t)=>a+t.points,0))/p.buyQty)*p.stock)):'—'}</strong></div></div><div className="product-history"><div className="product-history-title">매입·매도 이력 · 최신순</div>{[...p.trades].sort(newestFirst).map(t=><div className="product-history-row" key={t.id}><span className={`history-type ${t.type}`}>{t.type==='buy'?'매입':'매도'}</span><span><strong>{t.name}</strong><small>{t.date||'날짜 미입력'} · {t.source} · {t.quantity}개</small></span><b className={t.type==='buy'?'negative':'positive'}>{t.type==='buy'?'−':'+'}{yen(t.amount)}</b><button aria-label={`${t.name} 수정`} onClick={()=>{setEditing(t);setPrefill(null);setModal(true)}}><Pencil size={12}/></button></div>)}</div></div>}
          </article>)}</div>
          {!visibleProducts.length&&<div className="empty">조건에 맞는 상품이 없습니다.</div>}
        </>:<>
          <div className="source-select"><span>거래처</span><select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}>{sources.map(s=><option key={s}>{s}</option>)}</select><span className="result-count">{visible.length}건 · {groups}그룹</span></div>
          <div className="sheet-head"><span>제품 이름</span><span>구매금액</span><span>판매금액</span></div>
          <div className="history-sort-label">날짜 최신순 · 날짜 미입력 항목은 아래에 표시</div><div className="sheet">{sortedVisible.map(t=><article className={`sheet-row ${expanded===t.id?'expanded':''}`} key={t.id}><div className="sheet-summary" role="button" tabIndex={0} onClick={()=>setExpanded(expanded===t.id?null:t.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setExpanded(expanded===t.id?null:t.id)}}}><span className="sheet-name"><strong>{t.name}</strong><small><span className={`inline-type ${t.type}`}>{t.type==='buy'?'매입':'매도'}</span>{t.date||'날짜 미입력'} · {t.source} · {t.quantity.toLocaleString()}개</small></span><span className="buy-cell">{t.type==='buy'?yen(t.amount):'—'}</span><span className="sell-cell">{t.type==='sell'?yen(t.amount):'—'}<button className="quick-edit" aria-label={`${t.name} 수정`} onClick={e=>{e.stopPropagation();setEditing(t);setPrefill(null);setModal(true)}}><Pencil size={12}/></button></span></div>{expanded===t.id&&<div className="row-detail"><dl><div><dt>단가</dt><dd>{t.unitPrice?yen(t.unitPrice):'—'}</dd></div><div><dt>포인트</dt><dd>{t.points.toLocaleString()}p</dd></div><div><dt>날짜</dt><dd>{t.date||'미입력'}</dd></div><div><dt>현금 합계</dt><dd>{yen(t.amount)}</dd></div></dl>{t.note&&<p className="row-note">{t.note}</p>}<div className="row-actions"><button onClick={()=>{setEditing(t);setPrefill(null);setModal(true)}}><Pencil size={14}/> 수정</button><button className="delete" onClick={()=>removeTrade(t.id)}><Trash2 size={14}/> 삭제</button></div></div>}</article>)}{visible.length>0&&<div className="sheet-total"><strong>현재 표시 합계</strong><span>{yen(visible.filter(t=>t.type==='buy').reduce((a,t)=>a+t.amount,0))}</span><span>{yen(visible.filter(t=>t.type==='sell').reduce((a,t)=>a+t.amount,0))}</span></div>}</div>
          {!visible.length&&<div className="empty">조건에 맞는 거래가 없습니다.</div>}
        </>}
      </section>}

      {tab==='assets'&&<section className="page section"><p className="eyebrow">COLLECTION</p><h1 className="page-title">보유 자산</h1><div className="value-banner"><span>총 평가액</span><strong>{yen(assetTotal)}</strong><small>직접 입력한 현재 가치 기준</small></div><div className="holding-grid">{seedHoldings.map(h=><article className="holding" key={h.id}><span className="holding-art">{h.category==='팩・박스'?'BOX':'CARD'}</span><div><small>{h.category}</small><strong>{h.name}</strong><p>{h.quantity.toLocaleString()}개</p></div><b>{yen(h.value)}</b></article>)}</div></section>}
    </main>
    <button className="fab" onClick={()=>{setEditing(null);setPrefill(null);setModal(true)}} aria-label="거래 추가"><Plus/></button>
    <nav className="bottom-nav"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Home/><span>홈</span></button><button className={tab==='trades'?'active':''} onClick={()=>setTab('trades')}><BarChart3/><span>장부</span></button><span className="nav-gap"/><button className={tab==='assets'?'active':''} onClick={()=>setTab('assets')}><Wallet/><span>자산</span></button><button><CircleDollarSign/><span>분석</span></button></nav>
    {modal&&<TradeModal trade={editing} prefill={prefill} onClose={()=>{setModal(false);setEditing(null);setPrefill(null)}} onSave={saveTrade}/>} 
  </div>
}

function TradeModal({trade,prefill,onClose,onSave}:{trade:Trade|null;prefill:Partial<Trade>|null;onClose:()=>void;onSave:(t:Trade)=>void}){
  const initial=trade||prefill
  const [type,setType]=useState<'buy'|'sell'>(initial?.type||'buy');const [name,setName]=useState(initial?.name||'');const [amount,setAmount]=useState(String(initial?.amount||''));const [points,setPoints]=useState(String(initial?.points||''));const [quantity,setQuantity]=useState(String(initial?.quantity||1));const [category,setCategory]=useState(initial?.category||'싱글 카드');const [unitType,setUnitType]=useState<UnitType>(initial?.unitType||inferUnitType(initial?.name||'',initial?.category||'싱글 카드'));const [source,setSource]=useState(initial?.source||'메르카리');const [group,setGroup]=useState(initial?.group||'');const [date,setDate]=useState(trade?trade.date||'':initial?.date||new Date().toISOString().slice(0,10));const [note,setNote]=useState(initial?.note||'')
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal ledger-modal" onSubmit={e=>{e.preventDefault();if(!name||(!amount&&!points))return;const q=Number(quantity)||1;onSave({...trade,id:trade?.id||crypto.randomUUID(),name,amount:Number(amount)||0,points:Number(points)||0,quantity:q,unitPrice:q?Math.round((Number(amount)||0)/q):undefined,type,category,group:group||name,source,date,note,unitType,createdAt:trade?.createdAt||new Date().toISOString()})}}>
    <div className="modal-head"><div><p className="eyebrow">{trade?'EDIT RECORD':'NEW RECORD'}</p><h2>{trade?'거래 수정':'거래 추가'}</h2></div><button type="button" onClick={onClose}><X/></button></div>
    <div className="segmented"><button type="button" className={type==='buy'?'active buy':''} onClick={()=>setType('buy')}>매입</button><button type="button" className={type==='sell'?'active sell':''} onClick={()=>setType('sell')}>매도</button></div>
    <label>상품명<input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 이브이 ex SAR" autoFocus/></label>
    <div className="form-grid"><label>수량<input inputMode="numeric" value={quantity} onChange={e=>setQuantity(e.target.value.replace(/\D/g,''))}/></label><label>현금 합계 (¥)<input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,''))} placeholder="0"/></label></div>
    <div className="form-grid"><label>포인트<input inputMode="numeric" value={points} onChange={e=>setPoints(e.target.value.replace(/\D/g,''))} placeholder="0"/></label><label>날짜<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
    <div className="form-grid"><label>카테고리<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.slice(1).map(c=><option key={c}>{c}</option>)}</select></label><label>상품 형태<select value={unitType} onChange={e=>setUnitType(e.target.value as UnitType)}>{(Object.keys(unitLabels) as UnitType[]).map(value=><option value={value} key={value}>{unitLabels[value]}</option>)}</select></label></div>
    <label>거래처<input value={source} onChange={e=>setSource(e.target.value)}/></label>
    <label>같은 상품 묶기<input value={group} onChange={e=>setGroup(e.target.value)} placeholder="매입·매도에 같은 이름 입력 (예: 메가 드림)"/></label>
    <label>메모<input value={note} onChange={e=>setNote(e.target.value)} placeholder="세트 구성, 상태, 원문 불일치 등"/></label>
    <button className="submit" type="submit">{trade?'수정 저장':'거래 저장'}</button>
  </form></div>
}
