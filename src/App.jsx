import { useEffect, useState } from 'react'
import './App.css'

const PLAYER_ID = 660271
const API_BASE = 'https://statsapi.mlb.com/api/v1'

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

async function fetchLeaders(category, season) {
  const url = `${API_BASE}/stats/leaders?leaderCategories=${category}&season=${season}&sportId=1&limit=10&statGroup=hitting`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return data.leagueLeaders?.[0]?.leaders || []
}

function App() {
  const [season, setSeason] = useState(getInitialSeason())
  const [stats, setStats] = useState(null)
  const [player, setPlayer] = useState(null)
  const [hrLeaders, setHrLeaders] = useState([])
  const [avgLeaders, setAvgLeaders] = useState([])
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
        const [hr, avg] = await Promise.all([
          fetchLeaders('homeRuns', yr),
          fetchLeaders('battingAverage', yr),
        ])
        if (cancelled) return
        setPlayer(info)
        setStats(s)
        setSeason(yr)
        setHrLeaders(hr)
        setAvgLeaders(avg)
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
          <HittingView stats={stats?.hitting} leaders={{ hr: hrLeaders, avg: avgLeaders }} season={season} />
        )}
        {!loading && !error && tab === 'pitching' && (
          <PitchingView stats={stats?.pitching} season={season} />
        )}
      </main>

      <div className="footer">Data: MLB Stats API · statsapi.mlb.com</div>
    </div>
  )
}

function HittingView({ stats, leaders, season }) {
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

      {leaders.hr.length > 0 && (
        <>
          <h2 className="section-title">{season} MLB 本塁打ランキング</h2>
          <LeaderList leaders={leaders.hr} />
        </>
      )}
      {leaders.avg.length > 0 && (
        <>
          <h2 className="section-title">{season} MLB 打率ランキング</h2>
          <LeaderList leaders={leaders.avg} />
        </>
      )}
    </>
  )
}

function PitchingView({ stats, season }) {
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
      <div className="footer" style={{ paddingTop: 48 }}>※ シーズンによっては投手成績が登録されていない場合があります</div>
    </>
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
