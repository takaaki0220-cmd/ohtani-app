import { useEffect, useState } from 'react'
import './App.css'

const PLAYER_ID = 660271
const API_BASE = 'https://statsapi.mlb.com/api/v1'

// label = カード/見出しに出す日本語、api = MLB API の leaderCategory キー
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
]

const PITCHING_CATEGORIES = [
  { api: 'strikeouts', label: '奪三振' },
  { api: 'earnedRunAverage', label: '防御率' },
  { api: 'wins', label: '勝利' },
  { api: 'walksAndHitsPerInningPitched', label: 'WHIP' },
  { api: 'inningsPitched', label: '投球回' },
  { api: 'saves', label: 'セーブ' },
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
  const url = `${API_BASE}/stats/leaders?leaderCategories=${category}&season=${season}&sportId=1${leaguePart}&limit=10&statGroup=${group}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return data.leagueLeaders?.[0]?.leaders || []
}

function App() {
  const [season, setSeason] = useState(getInitialSeason())
  const [stats, setStats] = useState(null)
  const [player, setPlayer] = useState(null)
  const [leaders, setLeaders] = useState(null)
  const [leagueFilter, setLeagueFilter] = useState('all')
  const [tab, setTab] = useState('hitting')
  const [selected, setSelected] = useState({ hitting: null, pitching: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
          <HittingView
            stats={stats?.hitting}
            leaders={leaders}
            leagueFilter={leagueFilter}
            setLeagueFilter={setLeagueFilter}
            selected={selected.hitting}
            onSelect={(k) => toggleSelect('hitting', k)}
          />
        )}
        {!loading && !error && tab === 'pitching' && (
          <PitchingView
            stats={stats?.pitching}
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
  )
}

function HittingView({ stats, leaders, leagueFilter, setLeagueFilter, selected, onSelect }) {
  if (!stats) return <div className="empty">この期間の打撃成績はありません</div>
  // 表示する打撃指標 — ランキングがあるものは api キーを設定
  const items = [
    { v: stats.avg, k: '打率 AVG', api: 'battingAverage' },
    { v: stats.rbi, k: '打点 RBI', api: 'runsBattedIn' },
    { v: stats.hits, k: '安打 H', api: 'hits' },
    { v: stats.runs, k: '得点 R', api: 'runs' },
    { v: stats.stolenBases, k: '盗塁 SB', api: 'stolenBases' },
    { v: stats.ops, k: 'OPS', api: 'onBasePlusSlugging' },
    { v: stats.obp, k: '出塁率 OBP', api: 'onBasePercentage' },
    { v: stats.slg, k: '長打率 SLG', api: 'sluggingPercentage' },
    { v: stats.doubles, k: '二塁打 2B', api: 'doubles' },
    { v: stats.gamesPlayed, k: '試合 G' },
    { v: stats.atBats, k: '打数 AB' },
    { v: stats.strikeOuts, k: '三振 SO' },
    { v: stats.baseOnBalls, k: '四球 BB' },
  ]
  return (
    <>
      <HeadlineStat
        v={stats.homeRuns}
        label={<>ホームラン<br />HOME RUNS</>}
        apiKey="homeRuns"
        selected={selected}
        onSelect={onSelect}
      />
      <RankingPanel
        show={selected === 'homeRuns'}
        title="本塁打"
        leaders={leaders}
        group="hitting"
        apiKey="homeRuns"
        leagueFilter={leagueFilter}
        setLeagueFilter={setLeagueFilter}
        onClose={() => onSelect('homeRuns')}
      />
      <StatGrid
        items={items}
        group="hitting"
        leaders={leaders}
        selected={selected}
        onSelect={onSelect}
        leagueFilter={leagueFilter}
        setLeagueFilter={setLeagueFilter}
      />
    </>
  )
}

function PitchingView({ stats, leaders, leagueFilter, setLeagueFilter, selected, onSelect }) {
  if (!stats) return <div className="empty">この期間の投手成績はありません</div>
  const items = [
    { v: stats.era, k: '防御率 ERA', api: 'earnedRunAverage' },
    { v: stats.wins, k: '勝利 W', api: 'wins' },
    { v: stats.losses, k: '敗戦 L' },
    { v: stats.whip, k: 'WHIP', api: 'walksAndHitsPerInningPitched' },
    { v: stats.inningsPitched, k: '投球回 IP', api: 'inningsPitched' },
    { v: stats.saves, k: 'セーブ SV', api: 'saves' },
    { v: stats.gamesStarted, k: '先発 GS' },
    { v: stats.strikeoutsPer9Inn ?? stats.strikeoutsPer9, k: 'K/9' },
    { v: stats.baseOnBalls, k: '与四球 BB' },
    { v: stats.hits, k: '被安打 H' },
  ]
  return (
    <>
      <HeadlineStat
        v={stats.strikeOuts}
        label={<>奪三振<br />STRIKEOUTS</>}
        apiKey="strikeouts"
        selected={selected}
        onSelect={onSelect}
      />
      <RankingPanel
        show={selected === 'strikeouts'}
        title="奪三振"
        leaders={leaders}
        group="pitching"
        apiKey="strikeouts"
        leagueFilter={leagueFilter}
        setLeagueFilter={setLeagueFilter}
        onClose={() => onSelect('strikeouts')}
      />
      <StatGrid
        items={items}
        group="pitching"
        leaders={leaders}
        selected={selected}
        onSelect={onSelect}
        leagueFilter={leagueFilter}
        setLeagueFilter={setLeagueFilter}
      />
    </>
  )
}

// stat-grid を行ごとに描画し、選択された行の直下にランキングを挿入する
function StatGrid({ items, group, leaders, selected, onSelect, leagueFilter, setLeagueFilter }) {
  const PER_ROW = 3
  const rows = []
  for (let i = 0; i < items.length; i += PER_ROW) rows.push(items.slice(i, i + PER_ROW))
  return (
    <div className="stat-rows">
      {rows.map((row, ri) => {
        const selectedInRow = row.find((it) => it.api && it.api === selected)
        return (
          <div key={ri}>
            <div className="stat-grid">
              {row.map((it) => (
                <StatCard
                  key={it.k}
                  v={it.v}
                  k={it.k}
                  clickable={!!it.api}
                  isSelected={it.api === selected}
                  onClick={it.api ? () => onSelect(it.api) : undefined}
                />
              ))}
            </div>
            {selectedInRow && (
              <RankingPanel
                show={true}
                title={selectedInRow.k.split(' ')[0]}
                leaders={leaders}
                group={group}
                apiKey={selectedInRow.api}
                leagueFilter={leagueFilter}
                setLeagueFilter={setLeagueFilter}
                onClose={() => onSelect(selectedInRow.api)}
              />
            )}
          </div>
        )
      })}
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
      <span className="reveal-hint">{active ? 'ランキングを閉じる' : 'タップでランキング'}</span>
    </button>
  )
}

function StatCard({ v, k, clickable, isSelected, onClick }) {
  const Tag = clickable ? 'button' : 'div'
  return (
    <Tag
      className={`stat ${clickable ? 'clickable' : ''} ${isSelected ? 'active' : ''}`}
      onClick={onClick}
      type={clickable ? 'button' : undefined}
    >
      <div className="v">{v ?? '—'}</div>
      <div className="k">{k}</div>
      {clickable && <span className="card-caret" aria-hidden>{isSelected ? '▴' : '▾'}</span>}
    </Tag>
  )
}

function RankingPanel({ show, title, leaders, group, apiKey, leagueFilter, setLeagueFilter, onClose }) {
  if (!show) return null
  const data = leaders?.[leagueFilter]?.[group]?.[apiKey] || []
  return (
    <div className="rank-panel">
      <div className="rank-panel-head">
        <h3 className="rank-panel-title">{title} ランキング</h3>
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
      {leaders.map((l) => {
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
