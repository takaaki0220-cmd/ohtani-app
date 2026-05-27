import { useEffect, useMemo, useState } from 'react'
import './App.css'

const PLAYER_ID = 660271
const API_BASE = 'https://statsapi.mlb.com/api/v1'

const HITTING_CATEGORIES = [
  { key: 'homeRuns', label: '本塁打' },
  { key: 'battingAverage', label: '打率' },
  { key: 'runsBattedIn', label: '打点' },
  { key: 'hits', label: '安打' },
  { key: 'runs', label: '得点' },
  { key: 'onBasePercentage', label: '出塁率' },
  { key: 'sluggingPercentage', label: '長打率' },
  { key: 'onBasePlusSlugging', label: 'OPS' },
  { key: 'stolenBases', label: '盗塁' },
  { key: 'doubles', label: '二塁打' },
]

const PITCHING_CATEGORIES = [
  { key: 'wins', label: '勝利' },
  { key: 'earnedRunAverage', label: '防御率' },
  { key: 'strikeouts', label: '奪三振' },
  { key: 'walksAndHitsPerInningPitched', label: 'WHIP' },
  { key: 'inningsPitched', label: '投球回' },
  { key: 'saves', label: 'セーブ' },
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
        // 全リーグ × 全カテゴリ × 両グループ をまとめて取得
        const requests = []
        for (const lg of LEAGUES) {
          for (const c of HITTING_CATEGORIES) {
            requests.push({ league: lg.key, group: 'hitting', cat: c.key, p: fetchLeaders(c.key, yr, lg.id, 'hitting') })
          }
          for (const c of PITCHING_CATEGORIES) {
            requests.push({ league: lg.key, group: 'pitching', cat: c.key, p: fetchLeaders(c.key, yr, lg.id, 'pitching') })
          }
        }
        const results = await Promise.all(requests.map((r) => r.p))
        const built = { all: { hitting: {}, pitching: {} }, al: { hitting: {}, pitching: {} }, nl: { hitting: {}, pitching: {} } }
        requests.forEach((r, i) => {
          built[r.league][r.group][r.cat] = results[i]
        })

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
            season={season}
          />
        )}
        {!loading && !error && tab === 'pitching' && (
          <PitchingView
            stats={stats?.pitching}
            leaders={leaders}
            leagueFilter={leagueFilter}
            setLeagueFilter={setLeagueFilter}
            season={season}
          />
        )}
      </main>

      <div className="footer">Data: MLB Stats API · statsapi.mlb.com</div>
    </div>
  )
}

function HittingView({ stats, leaders, leagueFilter, setLeagueFilter, season }) {
  if (!stats) return <div className="empty">この期間の打撃成績はありません</div>
  return (
    <>
      <div className="headline-stat">
        <div className="num">{stats.homeRuns ?? '—'}</div>
        <div className="label">ホームラン<br />HOME RUNS</div>
      </div>

      <div className="stat-grid">
        <Stat v={stats.avg} k="打率 AVG" />
        <Stat v={stats.rbi} k="打点 RBI" />
        <Stat v={stats.hits} k="安打 H" />
        <Stat v={stats.runs} k="得点 R" />
        <Stat v={stats.stolenBases} k="盗塁 SB" />
        <Stat v={stats.ops} k="OPS" />
        <Stat v={stats.obp} k="出塁率 OBP" />
        <Stat v={stats.slg} k="長打率 SLG" />
        <Stat v={stats.gamesPlayed} k="試合 G" />
        <Stat v={stats.atBats} k="打数 AB" />
        <Stat v={stats.strikeOuts} k="三振 SO" />
        <Stat v={stats.baseOnBalls} k="四球 BB" />
      </div>

      <RankingsBlock
        title="ランキング"
        season={season}
        categories={HITTING_CATEGORIES}
        group="hitting"
        leaders={leaders}
        leagueFilter={leagueFilter}
        setLeagueFilter={setLeagueFilter}
      />
    </>
  )
}

function PitchingView({ stats, leaders, leagueFilter, setLeagueFilter, season }) {
  if (!stats) return <div className="empty">この期間の投手成績はありません</div>
  return (
    <>
      <div className="headline-stat">
        <div className="num">{stats.strikeOuts ?? '—'}</div>
        <div className="label">奪三振<br />STRIKEOUTS</div>
      </div>

      <div className="stat-grid">
        <Stat v={stats.era} k="防御率 ERA" />
        <Stat v={`${stats.wins ?? 0}-${stats.losses ?? 0}`} k="勝敗 W-L" />
        <Stat v={stats.whip} k="WHIP" />
        <Stat v={stats.inningsPitched} k="投球回 IP" />
        <Stat v={stats.gamesStarted} k="先発 GS" />
        <Stat v={stats.strikeoutsPer9Inn ?? stats.strikeoutsPer9} k="K/9" />
        <Stat v={stats.baseOnBalls} k="与四球 BB" />
        <Stat v={stats.hits} k="被安打 H" />
      </div>

      <RankingsBlock
        title="ランキング"
        season={season}
        categories={PITCHING_CATEGORIES}
        group="pitching"
        leaders={leaders}
        leagueFilter={leagueFilter}
        setLeagueFilter={setLeagueFilter}
      />
    </>
  )
}

function RankingsBlock({ title, season, categories, group, leaders, leagueFilter, setLeagueFilter }) {
  const data = leaders?.[leagueFilter]?.[group] || {}
  const visibleCats = useMemo(() => categories.filter((c) => (data[c.key] || []).length > 0), [categories, data])
  if (visibleCats.length === 0) return null
  const leagueLabel = LEAGUES.find((l) => l.key === leagueFilter)?.label || ''
  return (
    <>
      <h2 className="section-title">{season} {title}</h2>
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
      <div className="rank-sections">
        {visibleCats.map((c) => (
          <CollapsibleRanking key={c.key} title={c.label} scope={leagueLabel} leaders={data[c.key]} />
        ))}
      </div>
    </>
  )
}

function CollapsibleRanking({ title, scope, leaders }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="rank-section">
      <button className="rank-section-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="rank-section-title">{title}</span>
        <span className="rank-section-scope">{scope}</span>
        <span className={`rank-caret ${open ? 'open' : ''}`} aria-hidden>▾</span>
      </button>
      {open && <LeaderList leaders={leaders} />}
    </section>
  )
}

function Stat({ v, k }) {
  return (
    <div className="stat">
      <div className="v">{v ?? '—'}</div>
      <div className="k">{k}</div>
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
