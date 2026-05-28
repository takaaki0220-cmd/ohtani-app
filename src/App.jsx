import { useEffect, useRef, useState } from 'react'
import './App.css'

const PLAYER_ID = 660271
const API_BASE = 'https://statsapi.mlb.com/api/v1'

const HITTING_CATEGORIES = [
  { api: 'homeRuns', label: '本塁打' },
  { api: 'battingAverage', label: '打率' },
  { api: 'runsBattedIn', label: '打点' },
  { api: 'hits', label: '安打' },
  { api: 'runs', label: '得点' },
  { api: 'stolenBases', label: '盗塁' },
  { api: 'onBasePlusSlugging', label: 'OPS' },
  { api: 'onBasePercentage', label: '出塁率' },
  { api: 'sluggingPercentage', label: '長打率' },
  { api: 'doubles', label: '二塁打' },
  { api: 'walks', label: '四球' },
  { api: 'strikeouts', label: '三振' },
  { api: 'gamesPlayed', label: '試合' },
  { api: 'atBats', label: '打数' },
]

const PITCHING_CATEGORIES = [
  { api: 'strikeouts', label: '奪三振' },
  { api: 'earnedRunAverage', label: '防御率' },
  { api: 'wins', label: '勝利' },
  { api: 'walksAndHitsPerInningPitched', label: 'WHIP' },
  { api: 'inningsPitched', label: '投球回' },
  { api: 'saves', label: 'セーブ' },
  { api: 'losses', label: '敗戦' },
  { api: 'gamesStarted', label: '先発' },
  { api: 'strikeoutsPer9Inn', label: 'K/9' },
]

const LEAGUES = [
  { key: 'all', label: '総合', id: null },
  { key: 'al', label: 'ア・リーグ', id: 103 },
  { key: 'nl', label: 'ナ・リーグ', id: 104 },
]

function getInitialSeason() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return m < 3 ? y - 1 : y
}

async function fetchSeasonStats(season) {
  const url = `${API_BASE}/people/${PLAYER_ID}/stats?stats=season&group=hitting,pitching&season=${season}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('API error')
  const data = await res.json()
  const groups = {}
  for (const g of data.stats || []) {
    const splits = g.splits || []
    if (splits.length > 0) groups[g.group?.displayName] = splits[0].stat
  }
  return groups
}

async function fetchPlayerInfo() {
  const res = await fetch(`${API_BASE}/people/${PLAYER_ID}`)
  if (!res.ok) throw new Error('API error')
  const data = await res.json()
  return data.people?.[0]
}

async function fetchLeaders(category, season, leagueId, group) {
  const leaguePart = leagueId ? `&leagueId=${leagueId}` : ''
  // limit を大きめに取って、大谷の順位を取れるようにする（表示する一覧は別途上位のみに絞る）
  const url = `${API_BASE}/stats/leaders?leaderCategories=${category}&season=${season}&sportId=1${leaguePart}&limit=200&statGroup=${group}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return data.leagueLeaders?.[0]?.leaders || []
}

function findPlayerRank(leadersList) {
  if (!leadersList) return null
  const entry = leadersList.find((l) => String(l.person?.id) === String(PLAYER_ID))
  return entry?.rank ?? null
}

function getRanks(leaders, group, apiKey) {
  if (!leaders || !apiKey) return null
  return {
    all: findPlayerRank(leaders.all?.[group]?.[apiKey]),
    nl: findPlayerRank(leaders.nl?.[group]?.[apiKey]),
  }
}

async function refreshApp() {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) await reg.update() // 新しいバージョンがあれば取得
    }
  } catch {
    // 失敗してもリロードは続行
  }
  window.location.reload()
}

// 自前の引っ張って更新（iOS standalone PWA は標準機能が無いため）
function usePullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const pullRef = useRef(0)
  const active = useRef(false)

  useEffect(() => {
    const THRESHOLD = 70
    const MAX = 120
    const RESIST = 0.5

    function onStart(e) {
      // ドロワーが開いている時やページ最上部でない時は無効
      if (window.scrollY > 0 || document.querySelector('.detail-side.active')) {
        active.current = false
        return
      }
      active.current = true
      startY.current = e.touches[0].clientY
      pullRef.current = 0
    }
    function onMove(e) {
      if (!active.current || refreshing) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0 && window.scrollY <= 0) {
        const dist = Math.min(MAX, dy * RESIST)
        pullRef.current = dist
        setPull(dist)
      } else {
        pullRef.current = 0
        setPull(0)
        active.current = false
      }
    }
    function onEnd() {
      if (!active.current) return
      active.current = false
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true)
        setPull(56)
        refreshApp()
      } else {
        setPull(0)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [refreshing])

  return { pull, refreshing }
}

function PullIndicator({ pull, refreshing }) {
  if (pull <= 0 && !refreshing) return null
  const ready = pull >= 70 || refreshing
  return (
    <div className="ptr" style={{ height: `${pull}px`, opacity: Math.min(1, pull / 50) }}>
      <div className={`ptr-spinner ${refreshing ? 'spin' : ''}`}>
        {refreshing ? '↻' : ready ? '↑' : '↓'}
      </div>
    </div>
  )
}

function App() {
  const { pull, refreshing } = usePullToRefresh()
  const [season, setSeason] = useState(getInitialSeason())
  const [stats, setStats] = useState(null)
  const [player, setPlayer] = useState(null)
  const [leaders, setLeaders] = useState(null)
  const [leagueFilter, setLeagueFilter] = useState('all')
  const [tab, setTab] = useState('hitting')
  const [selected, setSelected] = useState({ hitting: null, pitching: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // PWA standalone モード検出 → html に class を付ける（CSS media query のフォールバック）
  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    document.documentElement.classList.toggle('pwa-standalone', isStandalone)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const info = await fetchPlayerInfo()
        let yr = getInitialSeason()
        let s = await fetchSeasonStats(yr)
        if (!s.hitting && !s.pitching && yr > 2018) {
          yr = yr - 1
          s = await fetchSeasonStats(yr)
        }
        const requests = []
        for (const lg of LEAGUES) {
          for (const c of HITTING_CATEGORIES) {
            requests.push({ league: lg.key, group: 'hitting', cat: c.api, p: fetchLeaders(c.api, yr, lg.id, 'hitting') })
          }
          for (const c of PITCHING_CATEGORIES) {
            requests.push({ league: lg.key, group: 'pitching', cat: c.api, p: fetchLeaders(c.api, yr, lg.id, 'pitching') })
          }
        }
        const results = await Promise.all(requests.map((r) => r.p))
        const built = { all: { hitting: {}, pitching: {} }, al: { hitting: {}, pitching: {} }, nl: { hitting: {}, pitching: {} } }
        requests.forEach((r, i) => { built[r.league][r.group][r.cat] = results[i] })

        if (cancelled) return
        setPlayer(info)
        setStats(s)
        setSeason(yr)
        setLeaders(built)
      } catch (e) {
        if (!cancelled) setError(e.message || '読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const toggleSelect = (group, apiKey) => {
    setSelected((cur) => ({ ...cur, [group]: cur[group] === apiKey ? null : apiKey }))
  }

  return (
    <div className="page">
      <PullIndicator pull={pull} refreshing={refreshing} />
      <div
        className="page-shift"
        style={{ transform: pull > 0 ? `translateY(${pull}px)` : undefined, transition: pull > 0 && !refreshing ? 'none' : 'transform 0.2s ease-out' }}
      >
      <header className="hero">
        <div className="hero-inner">
          <div className="eyebrow">Los Angeles Dodgers · #17</div>
          <h1 className="name">大谷 翔平</h1>
          <div className="name-en">SHOHEI OHTANI</div>
          <div className="meta-row">
            {player?.birthDate && <span>生年月日<strong>{player.birthDate}</strong></span>}
            {player?.height && <span>身長<strong>{player.height}</strong></span>}
            {player?.weight && <span>体重<strong>{player.weight} lb</strong></span>}
            {player?.batSide?.description && <span>打席<strong>{player.batSide.description}</strong></span>}
            {player?.pitchHand?.description && <span>投球<strong>{player.pitchHand.description}</strong></span>}
          </div>
          <div className="season-label">{season} SEASON</div>
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${tab === 'hitting' ? 'active' : ''}`} onClick={() => setTab('hitting')}>打撃</button>
        <button className={`tab ${tab === 'pitching' ? 'active' : ''}`} onClick={() => setTab('pitching')}>投手</button>
      </div>

      <main className="content">
        {loading && <div className="loading">読み込み中...</div>}
        {error && <div className="error">エラー: {error}</div>}
        {!loading && !error && tab === 'hitting' && (
          <StatsView
            group="hitting"
            stats={stats?.hitting}
            items={buildHittingItems(stats?.hitting, leaders)}
            headlineLabel={<>ホームラン<br />HOME RUNS</>}
            leaders={leaders}
            leagueFilter={leagueFilter}
            setLeagueFilter={setLeagueFilter}
            selected={selected.hitting}
            onSelect={(k) => toggleSelect('hitting', k)}
          />
        )}
        {!loading && !error && tab === 'pitching' && (
          <StatsView
            group="pitching"
            stats={stats?.pitching}
            items={buildPitchingItems(stats?.pitching, leaders)}
            headlineLabel={<>奪三振<br />STRIKEOUTS</>}
            leaders={leaders}
            leagueFilter={leagueFilter}
            setLeagueFilter={setLeagueFilter}
            selected={selected.pitching}
            onSelect={(k) => toggleSelect('pitching', k)}
          />
        )}
      </main>

      <div className="footer">Data: MLB Stats API · statsapi.mlb.com</div>
      </div>
    </div>
  )
}

function buildHittingItems(s, leaders) {
  if (!s) return []
  const r = (api) => getRanks(leaders, 'hitting', api)
  return [
    { api: 'homeRuns', label: '本塁打', sub: 'HR', v: s.homeRuns, headline: true, ranks: r('homeRuns') },
    { api: 'battingAverage', label: '打率', sub: 'AVG', v: s.avg, ranks: r('battingAverage') },
    { api: 'runsBattedIn', label: '打点', sub: 'RBI', v: s.rbi, ranks: r('runsBattedIn') },
    { api: 'hits', label: '安打', sub: 'H', v: s.hits, ranks: r('hits') },
    { api: 'runs', label: '得点', sub: 'R', v: s.runs, ranks: r('runs') },
    { api: 'stolenBases', label: '盗塁', sub: 'SB', v: s.stolenBases, ranks: r('stolenBases') },
    { api: 'onBasePlusSlugging', label: 'OPS', sub: '', v: s.ops, ranks: r('onBasePlusSlugging') },
    { api: 'onBasePercentage', label: '出塁率', sub: 'OBP', v: s.obp, ranks: r('onBasePercentage') },
    { api: 'sluggingPercentage', label: '長打率', sub: 'SLG', v: s.slg, ranks: r('sluggingPercentage') },
    { api: 'doubles', label: '二塁打', sub: '2B', v: s.doubles, ranks: r('doubles') },
    { api: 'walks', label: '四球', sub: 'BB', v: s.baseOnBalls, ranks: r('walks') },
    { api: 'strikeouts', label: '三振', sub: 'SO', v: s.strikeOuts, ranks: r('strikeouts') },
    { api: 'gamesPlayed', label: '試合', sub: 'G', v: s.gamesPlayed, ranks: r('gamesPlayed') },
    { api: 'atBats', label: '打数', sub: 'AB', v: s.atBats, ranks: r('atBats') },
  ]
}

function buildPitchingItems(s, leaders) {
  if (!s) return []
  const r = (api) => getRanks(leaders, 'pitching', api)
  return [
    { api: 'strikeouts', label: '奪三振', sub: 'K', v: s.strikeOuts, headline: true, ranks: r('strikeouts') },
    { api: 'earnedRunAverage', label: '防御率', sub: 'ERA', v: s.era, ranks: r('earnedRunAverage') },
    { api: 'wins', label: '勝利', sub: 'W', v: s.wins, ranks: r('wins') },
    { api: 'losses', label: '敗戦', sub: 'L', v: s.losses, ranks: r('losses') },
    { api: 'walksAndHitsPerInningPitched', label: 'WHIP', sub: '', v: s.whip, ranks: r('walksAndHitsPerInningPitched') },
    { api: 'inningsPitched', label: '投球回', sub: 'IP', v: s.inningsPitched, ranks: r('inningsPitched') },
    { api: 'saves', label: 'セーブ', sub: 'SV', v: s.saves, ranks: r('saves') },
    { api: 'gamesStarted', label: '先発', sub: 'GS', v: s.gamesStarted, ranks: r('gamesStarted') },
    { api: 'strikeoutsPer9Inn', label: 'K/9', sub: '', v: s.strikeoutsPer9Inn ?? s.strikeoutsPer9, ranks: r('strikeoutsPer9Inn') },
    { label: '与四球', sub: 'BB', v: s.baseOnBalls },
    { label: '被安打', sub: 'H', v: s.hits },
  ]
}

function StatsView({ group, stats, items, headlineLabel, leaders, leagueFilter, setLeagueFilter, selected, onSelect }) {
  if (!stats) return <div className="empty">この期間の{group === 'hitting' ? '打撃' : '投手'}成績はありません</div>
  const headline = items.find((it) => it.headline)
  const rest = items.filter((it) => !it.headline)

  const drawerRef = useRef(null)
  const backdropRef = useRef(null)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const touchDeltaRef = useRef(0)
  const isSwipingRef = useRef(false)
  const lastSelectedRef = useRef(null)

  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (selected) lastSelectedRef.current = selected
  }, [selected])

  // 閉じるアニメーション中も内容を保持するために displaySelected を使う
  const displaySelected = selected || (closing ? lastSelectedRef.current : null)
  const showDrawer = displaySelected != null
  const selectedItem = items.find((it) => it.api && it.api === displaySelected)

  function resetStyles() {
    if (drawerRef.current) {
      drawerRef.current.style.transition = ''
      drawerRef.current.style.transform = ''
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = ''
      backdropRef.current.style.opacity = ''
    }
  }

  function animateClose() {
    if (closing || !selected) return
    setClosing(true)
    if (drawerRef.current) {
      drawerRef.current.style.transition = 'transform 0.22s ease-in'
      drawerRef.current.style.transform = 'translateX(100%)'
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 0.22s ease-in'
      backdropRef.current.style.opacity = '0'
    }
    setTimeout(() => {
      onSelect(selected) // toggleSelect により null に
      setClosing(false)
      resetStyles()
    }, 220)
  }

  function handleClose() {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 880px)').matches) {
      animateClose()
    } else {
      onSelect(selected)
    }
  }

  function handleTouchStart(e) {
    if (closing) return
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
    touchDeltaRef.current = 0
    isSwipingRef.current = false
    if (drawerRef.current) {
      drawerRef.current.style.transition = 'none'
      drawerRef.current.style.animation = 'none'
    }
  }

  function handleTouchMove(e) {
    if (closing) return
    const dx = e.touches[0].clientX - touchStartXRef.current
    const dy = e.touches[0].clientY - touchStartYRef.current
    if (!isSwipingRef.current) {
      // まだスワイプ方向が確定していないとき: 横優位 & 右方向のときだけ確定
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      if (Math.abs(dx) > Math.abs(dy) && dx > 0) {
        isSwipingRef.current = true
      } else {
        return // 縦スクロールはそのまま許可
      }
    }
    if (dx > 0) {
      touchDeltaRef.current = dx
      if (drawerRef.current) drawerRef.current.style.transform = `translateX(${dx}px)`
      if (backdropRef.current) {
        const op = Math.max(0, 0.4 * (1 - dx / 400))
        backdropRef.current.style.opacity = String(op)
      }
    }
  }

  function handleTouchEnd() {
    if (closing) return
    if (touchDeltaRef.current > 80) {
      animateClose()
    } else {
      // バネで戻す
      if (drawerRef.current) {
        drawerRef.current.style.transition = 'transform 0.2s ease-out'
        drawerRef.current.style.transform = ''
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = 'opacity 0.2s ease-out'
        backdropRef.current.style.opacity = ''
      }
    }
    touchDeltaRef.current = 0
    isSwipingRef.current = false
  }

  return (
    <div className={`detail-layout ${showDrawer ? 'has-selection' : ''}`}>
      <div className="detail-main">
        {headline && (
          <HeadlineStat
            v={headline.v}
            label={headlineLabel}
            apiKey={headline.api}
            selected={selected}
            onSelect={onSelect}
          />
        )}
        <div className="stat-grid">
          {rest.map((it) => (
            <StatCard
              key={it.label + (it.sub || '')}
              v={it.v}
              label={it.label}
              sub={it.sub}
              clickable={!!it.api}
              isSelected={it.api === selected}
              onClick={it.api ? () => onSelect(it.api) : undefined}
              ranks={it.ranks}
            />
          ))}
        </div>
      </div>
      {showDrawer && (
        <div className="rank-backdrop" ref={backdropRef} onClick={animateClose} aria-hidden />
      )}
      <aside
        ref={drawerRef}
        className={`detail-side ${showDrawer ? 'active' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="detail-side-sticky">
          <RankingPanel
            selected={displaySelected}
            selectedItem={selectedItem || (headline && headline.api === displaySelected ? headline : null)}
            group={group}
            leaders={leaders}
            leagueFilter={leagueFilter}
            setLeagueFilter={setLeagueFilter}
            onClose={handleClose}
          />
        </div>
      </aside>
    </div>
  )
}

function HeadlineStat({ v, label, apiKey, selected, onSelect }) {
  const active = selected === apiKey
  return (
    <button
      className={`headline-stat clickable ${active ? 'active' : ''}`}
      onClick={() => onSelect(apiKey)}
    >
      <div className="num">{v ?? '—'}</div>
      <div className="label">{label}</div>
      <span className="reveal-hint">{active ? '選択中' : 'タップでランキング'}</span>
    </button>
  )
}

function StatCard({ v, label, sub, clickable, isSelected, onClick, ranks }) {
  const Tag = clickable ? 'button' : 'div'
  return (
    <Tag
      className={`stat ${clickable ? 'clickable' : ''} ${isSelected ? 'active' : ''}`}
      onClick={onClick}
      type={clickable ? 'button' : undefined}
    >
      <div className="v">{v ?? '—'}</div>
      <div className="k">
        {label}
        {sub && <span className="k-sub"> {sub}</span>}
      </div>
      {ranks && (
        <div className="stat-rank">
          <div className="stat-rank-line">
            <span className="stat-rank-scope">総合</span>
            <span className="stat-rank-val">{ranks.all ? `${ranks.all}位` : '圏外'}</span>
          </div>
          <div className="stat-rank-line">
            <span className="stat-rank-scope">ナ・リーグ</span>
            <span className="stat-rank-val">{ranks.nl ? `${ranks.nl}位` : '圏外'}</span>
          </div>
        </div>
      )}
    </Tag>
  )
}

function RankingPanel({ selected, selectedItem, group, leaders, leagueFilter, setLeagueFilter, onClose }) {
  if (!selected || !selectedItem) {
    return (
      <div className="rank-panel rank-panel-empty">
        <div className="rank-empty-icon" aria-hidden>📊</div>
        <div className="rank-empty-text">
          左の数値カードをタップすると<br />
          MLBランキングが表示されます
        </div>
      </div>
    )
  }
  const data = leaders?.[leagueFilter]?.[group]?.[selected] || []
  return (
    <div className="rank-panel">
      <div className="rank-panel-head">
        <h3 className="rank-panel-title">{selectedItem.label} ランキング</h3>
        <button className="rank-close" onClick={onClose} aria-label="閉じる">×</button>
      </div>
      <div className="subtabs">
        {LEAGUES.map((l) => (
          <button
            key={l.key}
            className={`subtab ${leagueFilter === l.key ? 'active' : ''}`}
            onClick={() => setLeagueFilter(l.key)}
          >
            {l.label}
          </button>
        ))}
      </div>
      {data.length > 0 ? <LeaderList leaders={data} /> : <div className="empty">このランキングはデータがありません</div>}
    </div>
  )
}

function LeaderList({ leaders }) {
  return (
    <div className="rank-list">
      {leaders.slice(0, 10).map((l) => {
        const isOhtani = String(l.person?.id) === String(PLAYER_ID)
        return (
          <div key={`${l.rank}-${l.person?.id}`} className={`rank-row ${isOhtani ? 'highlight' : ''}`}>
            <div className="rank-pos">{l.rank}</div>
            <div className="rank-name">{l.person?.fullName}</div>
            <div className="rank-val">{l.value}</div>
          </div>
        )
      })}
    </div>
  )
}

export default App
