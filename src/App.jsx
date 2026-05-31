import { useEffect, useRef, useState } from 'react'
import './App.css'
import NotificationSettings from './NotificationSettings.jsx'

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

// 初回に取得するリーグ（カードの順位表示は総合とナ・リーグのみ使用）。
// ア・リーグ(al)はランキングのサブタブを開いた時に遅延取得する。
const INITIAL_LEAGUE_KEYS = ['all', 'nl']

// 指定リーグ1つ分の全カテゴリ(打撃+投手)のリーダーをまとめて取得
async function fetchLeagueLeaders(leagueId, season) {
  const reqs = [
    ...HITTING_CATEGORIES.map((c) => ({ group: 'hitting', cat: c.api, p: fetchLeaders(c.api, season, leagueId, 'hitting') })),
    ...PITCHING_CATEGORIES.map((c) => ({ group: 'pitching', cat: c.api, p: fetchLeaders(c.api, season, leagueId, 'pitching') })),
  ]
  const results = await Promise.all(reqs.map((r) => r.p))
  const out = { hitting: {}, pitching: {} }
  reqs.forEach((r, i) => { out[r.group][r.cat] = results[i] })
  return out
}

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

// ドジャース(119)のチーム試合数を取得（規定投球回の計算用）
async function fetchTeamGamesPlayed(season) {
  try {
    const res = await fetch(`${API_BASE}/standings?leagueId=103,104&season=${season}`)
    if (!res.ok) return null
    const data = await res.json()
    for (const rec of data.records || []) {
      for (const t of rec.teamRecords || []) {
        if (t.team?.id === 119) {
          return t.gamesPlayed ?? ((t.wins || 0) + (t.losses || 0))
        }
      }
    }
  } catch {
    // ignore
  }
  return null
}

// "55.1" 形式の投球回を実数に（.1=1/3, .2=2/3イニング）
function ipToNumber(ip) {
  if (ip == null) return 0
  const [whole, frac] = String(ip).split('.')
  const w = parseInt(whole, 10) || 0
  const f = frac === '1' ? 1 / 3 : frac === '2' ? 2 / 3 : 0
  return w + f
}

// 実数の投球回を "55.1" 形式に戻す
function numberToIp(n) {
  const whole = Math.floor(n + 1e-9)
  const outs = Math.round((n - whole) * 3)
  if (outs >= 3) return `${whole + 1}.0`
  return `${whole}.${outs}`
}

// MLB全30球団の日本語短縮名
const TEAM_JP = {
  108: 'エンゼルス', 109: 'Dバックス', 110: 'オリオールズ', 111: 'レッドソックス',
  112: 'カブス', 113: 'レッズ', 114: 'ガーディアンズ', 115: 'ロッキーズ',
  116: 'タイガース', 117: 'アストロズ', 118: 'ロイヤルズ', 119: 'ドジャース',
  120: 'ナショナルズ', 121: 'メッツ', 133: 'アスレチックス', 134: 'パイレーツ',
  135: 'パドレス', 136: 'マリナーズ', 137: 'ジャイアンツ', 138: 'カージナルス',
  139: 'レイズ', 140: 'レンジャーズ', 141: 'ブルージェイズ', 142: 'ツインズ',
  143: 'フィリーズ', 144: 'ブレーブス', 145: 'ホワイトソックス', 146: 'マーリンズ',
  147: 'ヤンキース', 158: 'ブルワーズ',
}

function teamName(id, fallback) {
  return TEAM_JP[id] || fallback || ''
}

// 日本時間（JST）に変換して表示用の文字列を作る
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
function toJst(iso) {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value || ''
  return {
    md: `${get('month')}/${get('day')}`,
    wd: get('weekday'),
    time: `${get('hour')}:${get('minute')}`,
    ymd: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
  }
}

// ドジャースの試合日程（過去7日〜先14日）
async function fetchSchedule() {
  const fmt = (d) => d.toISOString().slice(0, 10)
  const now = new Date()
  const start = new Date(now.getTime() - 7 * 86400000)
  const end = new Date(now.getTime() + 14 * 86400000)
  try {
    const res = await fetch(`${API_BASE}/schedule?sportId=1&teamId=119&startDate=${fmt(start)}&endDate=${fmt(end)}&hydrate=team,probablePitcher`)
    if (!res.ok) return []
    const data = await res.json()
    const games = []
    for (const day of data.dates || []) {
      for (const g of day.games || []) {
        const home = g.teams?.home
        const away = g.teams?.away
        const isHome = home?.team?.id === 119
        const opp = isHome ? away?.team : home?.team
        const dodgersProbable = isHome ? home?.probablePitcher : away?.probablePitcher
        games.push({
          pk: g.gamePk,
          dateUTC: g.gameDate,
          oppId: opp?.id,
          oppName: teamName(opp?.id, opp?.name),
          isHome,
          state: g.status?.abstractGameState, // Preview / Live / Final
          dodgersScore: isHome ? home?.score : away?.score,
          oppScore: isHome ? away?.score : home?.score,
          ohtaniPitching: dodgersProbable?.id === PLAYER_ID,
        })
      }
    }
    return games
  } catch {
    return []
  }
}

// wRC+ / WAR / FIP などのセイバー指標
async function fetchSabermetrics(season, group) {
  try {
    const res = await fetch(`${API_BASE}/people/${PLAYER_ID}/stats?stats=sabermetrics&group=${group}&season=${season}`)
    if (!res.ok) return null
    const data = await res.json()
    const sp = data.stats?.[0]?.splits
    return sp && sp.length ? sp[0].stat : null
  } catch {
    return null
  }
}

// 身長 (例 "6' 4\"") → cm
function heightToCm(h) {
  if (!h) return null
  const m = String(h).match(/(\d+)'\s*(\d+)/)
  if (!m) return null
  const feet = Number(m[1])
  const inch = Number(m[2])
  return Math.round((feet * 12 + inch) * 2.54)
}

// 体重 (lb) → kg
function lbToKg(lb) {
  if (lb == null || isNaN(lb)) return null
  return Math.round(Number(lb) * 0.453592)
}

// 数値フォーマッタ
const f1 = (n) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(1))
const f2 = (n) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(2))
const fInt = (n) => (n == null || isNaN(n) ? '—' : String(Math.round(Number(n))))

// 162試合換算（カウント系指標のみ）
function paceOf(v, teamGames) {
  const num = Number(v)
  if (!teamGames || teamGames <= 0 || isNaN(num)) return null
  return Math.round((num / teamGames) * 162)
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
  const [teamGames, setTeamGames] = useState(null)
  const [saber, setSaber] = useState({ hitting: null, pitching: null })
  const [schedule, setSchedule] = useState(null)
  const [leagueFilter, setLeagueFilter] = useState('all')
  const [tab, setTab] = useState('hitting')
  const [selected, setSelected] = useState({ hitting: null, pitching: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showNotif, setShowNotif] = useState(false)
  const [reloadKey, setReloadKey] = useState(0) // 再試行ボタンで増分して再読み込み

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
        // カード表示に必要な総合(all)とナ・リーグ(nl)だけを初回取得（al は遅延）
        const initialLeagues = await Promise.all(
          INITIAL_LEAGUE_KEYS.map((k) => fetchLeagueLeaders(LEAGUES.find((l) => l.key === k).id, yr)),
        )
        const built = {}
        INITIAL_LEAGUE_KEYS.forEach((k, i) => { built[k] = initialLeagues[i] })

        const [tg, saberHit, saberPit, sched] = await Promise.all([
          fetchTeamGamesPlayed(yr),
          fetchSabermetrics(yr, 'hitting'),
          fetchSabermetrics(yr, 'pitching'),
          fetchSchedule(),
        ])

        if (cancelled) return
        setPlayer(info)
        setStats(s)
        setSeason(yr)
        setLeaders(built)
        setTeamGames(tg)
        setSaber({ hitting: saberHit, pitching: saberPit })
        setSchedule(sched)
      } catch (e) {
        if (!cancelled) setError(e.message || '読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [reloadKey])

  const toggleSelect = (group, apiKey) => {
    setSelected((cur) => ({ ...cur, [group]: cur[group] === apiKey ? null : apiKey }))
  }

  // ランキングのサブタブで未取得リーグ(al)が選ばれたら遅延取得
  const loadingLeagueRef = useRef({})
  const ensureLeague = (key) => {
    setLeagueFilter(key)
    const lg = LEAGUES.find((l) => l.key === key)
    if (!lg || lg.id == null) return // 'all' はID無し＝取得済み扱い
    if (leaders?.[key] || loadingLeagueRef.current[key]) return // 取得済み or 取得中
    loadingLeagueRef.current[key] = true
    fetchLeagueLeaders(lg.id, season).then((data) => {
      setLeaders((cur) => ({ ...cur, [key]: data }))
    })
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
          <div className="eyebrow-row">
            <div className="eyebrow">Los Angeles Dodgers · #17</div>
            <button className="bell-btn" onClick={() => setShowNotif(true)} aria-label="通知設定">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </div>
          <h1 className="name">大谷 翔平</h1>
          <div className="name-en">SHOHEI OHTANI</div>
          <div className="meta-row">
            {player?.birthDate && <span>生年月日<strong>{player.birthDate}</strong></span>}
            {player?.height && <span>身長<strong>{heightToCm(player.height) ? `${heightToCm(player.height)} cm` : player.height}</strong></span>}
            {player?.weight && <span>体重<strong>{lbToKg(player.weight) ? `${lbToKg(player.weight)} kg` : `${player.weight} lb`}</strong></span>}
            {player?.batSide?.description && <span>打席<strong>{player.batSide.description}</strong></span>}
            {player?.pitchHand?.description && <span>投球<strong>{player.pitchHand.description}</strong></span>}
          </div>
          {(saber.hitting?.war != null || saber.pitching?.war != null) && (
            <div className="twoway">
              <div className="twoway-item">
                <span className="twoway-v">{f1(saber.hitting?.war)}</span>
                <span className="twoway-k">打者 WAR</span>
              </div>
              <span className="twoway-plus">+</span>
              <div className="twoway-item">
                <span className="twoway-v">{f1(saber.pitching?.war)}</span>
                <span className="twoway-k">投手 WAR</span>
              </div>
              <span className="twoway-eq">=</span>
              <div className="twoway-item total">
                <span className="twoway-v">{f1((saber.hitting?.war || 0) + (saber.pitching?.war || 0))}</span>
                <span className="twoway-k">二刀流 総合WAR</span>
                {teamGames > 0 && (
                  <span className="twoway-pace">162試合ペース {f1(((saber.hitting?.war || 0) + (saber.pitching?.war || 0)) / teamGames * 162)} WAR</span>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="content">
        {!loading && !error && (
          <div className="season-row">
            <div className="season-label">{season} SEASON</div>
            <a className="watch-btn" href="https://www.primevideo.com/-/ja/sports" target="_blank" rel="noopener noreferrer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
              Prime Video
            </a>
          </div>
        )}
        {loading && <div className="loading">読み込み中...</div>}
        {error && (
          <div className="error">
            <p className="error-text">読み込みに失敗しました</p>
            <button className="retry-btn" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
              再試行
            </button>
          </div>
        )}
        {!loading && !error && tab === 'hitting' && (
          <StatsView
            group="hitting"
            stats={stats?.hitting}
            data={buildHittingData(stats?.hitting, saber.hitting, leaders, teamGames)}
            headlineLabel={<>ホームラン<br />HOME RUNS</>}
            leaders={leaders}
            leagueFilter={leagueFilter}
            setLeagueFilter={ensureLeague}
            selected={selected.hitting}
            onSelect={(k) => toggleSelect('hitting', k)}
            teamGames={teamGames}
          />
        )}
        {!loading && !error && tab === 'pitching' && (
          <StatsView
            group="pitching"
            stats={stats?.pitching}
            data={buildPitchingData(stats?.pitching, saber.pitching, leaders, teamGames)}
            headlineLabel={<>奪三振<br />STRIKEOUTS</>}
            leaders={leaders}
            leagueFilter={leagueFilter}
            setLeagueFilter={ensureLeague}
            selected={selected.pitching}
            onSelect={(k) => toggleSelect('pitching', k)}
            teamGames={teamGames}
          />
        )}
        {!loading && !error && tab === 'schedule' && (
          <ScheduleView games={schedule} />
        )}
      </main>

      <div className="footer">Data: MLB Stats API · statsapi.mlb.com</div>
      </div>
      <nav className="tabbar">
        <div className="tabbar-inner">
          <button className={`tabbar-btn ${tab === 'hitting' ? 'active' : ''}`} onClick={() => setTab('hitting')}>打者</button>
          <button className={`tabbar-btn ${tab === 'pitching' ? 'active' : ''}`} onClick={() => setTab('pitching')}>投手</button>
          <button className={`tabbar-btn ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>日程</button>
        </div>
      </nav>
      {showNotif && <NotificationSettings onClose={() => setShowNotif(false)} />}
    </div>
  )
}

// data = { headline, groups: [{ title, items: [...] }] }
// item: { label, sub, v, api?, desc?, key?(重要指標), pace?(162換算) }
function buildHittingData(s, saber, leaders, teamGames) {
  if (!s) return null
  const r = (api) => getRanks(leaders, 'hitting', api)
  return {
    headline: { api: 'homeRuns', label: '本塁打', sub: 'HR', v: s.homeRuns, ranks: r('homeRuns'), pace: true, desc: '本塁打数。長打力の象徴。' },
    groups: [
      { title: 'Production', items: [
        { api: 'onBasePlusSlugging', label: 'OPS', sub: '', v: s.ops, ranks: r('onBasePlusSlugging'), feature: true, desc: '出塁率＋長打率。打者の総合打撃力を表す代表指標。' },
        { label: 'wRC+', sub: '', v: fInt(saber?.wRcPlus), feature: true, desc: 'リーグ平均(100)と球場補正を加味した得点創出力。150なら平均より50%優秀。MLBで最重要級の打撃指標。' },
        { label: 'WAR', sub: '', v: f1(saber?.war), desc: '控え選手と比べ何勝分チームに上乗せしたかを示す総合指標。打撃・走塁・守備を統合。' },
        { label: 'wOBA', sub: '', v: saber?.woba != null ? Number(saber.woba).toFixed(3).replace(/^0/, '') : '—', desc: '出塁の「質」を加重平均した出塁率系の発展指標。' },
      ]},
      { title: 'Power', items: [
        { api: 'sluggingPercentage', label: '長打率', sub: 'SLG', v: s.slg, ranks: r('sluggingPercentage'), desc: '1打数あたりの塁打数。長打力を示す。' },
        { api: 'doubles', label: '二塁打', sub: '2B', v: s.doubles, ranks: r('doubles'), desc: '二塁打の数。' },
      ]},
      { title: 'On Base', items: [
        { api: 'onBasePercentage', label: '出塁率', sub: 'OBP', v: s.obp, ranks: r('onBasePercentage'), desc: '出塁能力を示す指標。現代MLBで非常に重視される。' },
        { api: 'walks', label: '四球', sub: 'BB', v: s.baseOnBalls, ranks: r('walks'), desc: '四球数。選球眼の指標。' },
      ]},
      { title: 'Contact', items: [
        { api: 'battingAverage', label: '打率', sub: 'AVG', v: s.avg, ranks: r('battingAverage'), desc: '安打 ÷ 打数。伝統的な打撃指標。' },
        { api: 'hits', label: '安打', sub: 'H', v: s.hits, ranks: r('hits'), desc: '安打数。' },
      ]},
      { title: 'Speed & Runs', items: [
        { api: 'stolenBases', label: '盗塁', sub: 'SB', v: s.stolenBases, ranks: r('stolenBases'), desc: '盗塁成功数。走力の指標。' },
        { api: 'runs', label: '得点', sub: 'R', v: s.runs, ranks: r('runs'), desc: '生還した回数。打順・チームに依存。' },
        { api: 'runsBattedIn', label: '打点', sub: 'RBI', v: s.rbi, ranks: r('runsBattedIn'), desc: '自分の打撃で生還させた走者数。前後の打者に依存するため個人能力評価には向かない。' },
      ]},
    ],
    teamGames,
  }
}

function buildPitchingData(s, saber, leaders, teamGames) {
  if (!s) return null
  const r = (api) => getRanks(leaders, 'pitching', api)
  return {
    headline: { api: 'strikeouts', label: '奪三振', sub: 'K', v: s.strikeOuts, ranks: r('strikeouts'), pace: true, desc: '奪三振数。' },
    groups: [
      { title: 'Run Prevention', items: [
        { api: 'earnedRunAverage', label: '防御率', sub: 'ERA', v: s.era, ranks: r('earnedRunAverage'), feature: true, desc: '9イニングあたりの自責点。低いほど良い。' },
        { label: 'FIP', sub: '', v: f2(saber?.fip), feature: true, desc: '被本塁打・四球・三振だけで評価する指標。守備の影響を除いた投手の実力値。低いほど良い。' },
        { label: 'xFIP', sub: '', v: f2(saber?.xfip), desc: 'FIPの被本塁打を平均化した予測指標。運の影響をさらに除く。' },
        { label: 'ERA-', sub: '', v: fInt(saber?.eraMinus), desc: 'リーグ平均を100とした防御率。100未満が平均より優秀（低いほど良い）。' },
      ]},
      { title: 'Value', items: [
        { label: 'WAR', sub: '', v: f1(saber?.war), desc: '投球による勝利貢献度の総合指標。控え投手と比べ何勝分上乗せしたか。' },
      ]},
      { title: 'Rate', items: [
        { api: 'walksAndHitsPerInningPitched', label: 'WHIP', sub: '', v: s.whip, ranks: r('walksAndHitsPerInningPitched'), desc: '1イニングあたりの被安打＋与四球。低いほど良い。' },
        { api: 'strikeoutsPer9Inn', label: 'K/9', sub: '', v: s.strikeoutsPer9Inn ?? s.strikeoutsPer9, ranks: r('strikeoutsPer9Inn'), desc: '9イニングあたりの奪三振数。' },
      ]},
      { title: 'Counting', items: [
        { api: 'wins', label: '勝利', sub: 'W', v: s.wins, ranks: r('wins'), desc: '勝利数。' },
        { api: 'losses', label: '敗戦', sub: 'L', v: s.losses, ranks: r('losses'), desc: '敗戦数。' },
        { api: 'inningsPitched', label: '投球回', sub: 'IP', v: s.inningsPitched, ranks: r('inningsPitched'), desc: '投球したイニング数。' },
        { api: 'saves', label: 'セーブ', sub: 'SV', v: s.saves, ranks: r('saves'), desc: 'セーブ数。' },
        { api: 'gamesStarted', label: '先発', sub: 'GS', v: s.gamesStarted, ranks: r('gamesStarted'), desc: '先発登板数。' },
      ]},
    ],
    teamGames,
  }
}

function StatsView({ group, stats, data, headlineLabel, leaders, leagueFilter, setLeagueFilter, selected, onSelect, teamGames }) {
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

  if (!stats || !data) return <div className="empty">この期間の{group === 'hitting' ? '打者' : '投手'}成績はありません</div>
  const headline = data.headline
  const groups = data.groups
  const idOf = (it) => it.api || it.label
  const allItems = [headline, ...groups.flatMap((g) => g.items)]

  // 閉じるアニメーション中も内容を保持するために displaySelected を使う
  const displaySelected = selected || (closing ? lastSelectedRef.current : null)
  const showDrawer = displaySelected != null
  const selectedItem = allItems.find((it) => idOf(it) === displaySelected)

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
            apiKey={idOf(headline)}
            selected={selected}
            onSelect={onSelect}
            pace={headline.pace ? paceOf(headline.v, teamGames) : null}
          />
        )}
        {group === 'pitching' && teamGames > 0 && (
          <QualifierCard ip={stats.inningsPitched} teamGames={teamGames} />
        )}
        {groups.map((g) => (
          <div className="metric-group" key={g.title}>
            <h3 className="metric-group-title">{g.title}</h3>
            <div className="stat-grid">
              {g.items.map((it) => (
                <StatCard
                  key={it.label + (it.sub || '')}
                  v={it.v}
                  label={it.label}
                  sub={it.sub}
                  feature={it.feature}
                  isSelected={idOf(it) === selected}
                  onClick={() => onSelect(idOf(it))}
                  ranks={it.ranks}
                />
              ))}
            </div>
          </div>
        ))}
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
            selectedItem={selectedItem}
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

// 同じ相手・同じ本拠地区分の連戦をまとめる
function groupSeries(games) {
  const out = []
  for (const g of games) {
    const last = out[out.length - 1]
    if (last && last.oppId === g.oppId && last.isHome === g.isHome) last.games.push(g)
    else out.push({ oppId: g.oppId, oppName: g.oppName, isHome: g.isHome, games: [g] })
  }
  return out
}

// 打席結果の英語イベント名 → 日本語
const EVENT_JP = {
  'Single': '単打', 'Double': '二塁打', 'Triple': '三塁打', 'Home Run': '本塁打',
  'Strikeout': '三振', 'Strikeout Double Play': '三振併殺',
  'Walk': '四球', 'Intent Walk': '敬遠', 'Hit By Pitch': '死球',
  'Groundout': 'ゴロ', 'Bunt Groundout': 'バントゴロ', 'Grounded Into DP': '併殺打',
  'Flyout': 'フライ', 'Lineout': 'ライナー', 'Pop Out': 'ポップフライ',
  'Forceout': '封殺', 'Fielders Choice': '野選', 'Fielders Choice Out': '野選',
  'Sac Fly': '犠飛', 'Sac Bunt': '犠打', 'Field Error': '失策出塁',
  'Catcher Interference': '打撃妨害', 'Double Play': '併殺',
}
const eventJp = (e) => EVENT_JP[e] || e || '—'
// ヒット系（ネイビー強調する打席）
const HIT_EVENTS = new Set(['Single', 'Double', 'Triple', 'Home Run'])

// 1試合の打撃成績を1行テキストに（最近の結果の行表示用）
function fmtBattingLine(b) {
  const parts = [`${b.atBats}打数${b.hits}安打`]
  if (b.homeRuns > 0) parts.push(`本塁打${b.homeRuns}`)
  if (b.rbi > 0) parts.push(`${b.rbi}打点`)
  if (b.baseOnBalls > 0) parts.push(`四球${b.baseOnBalls}`)
  if (b.strikeOuts > 0) parts.push(`三振${b.strikeOuts}`)
  return parts.join(' ')
}
// 1試合の投球成績を1行テキストに（最近の結果の行表示用）
function fmtPitchingLine(p) {
  return `${p.inningsPitched}回 被安打${p.hits} 自責${p.earnedRuns} 奪三振${p.strikeOuts} 与四球${p.baseOnBalls}`
}

// リスト表示用: boxscore だけ取って大谷の打撃/投球サマリーを返す（軽量・playByPlayは取らない）
async function fetchGameBoxSummary(pk) {
  const res = await fetch(`${API_BASE}/game/${pk}/boxscore`)
  if (!res.ok) return null
  const box = await res.json()
  let batting = null
  let pitching = null
  for (const side of ['home', 'away']) {
    const pl = box.teams?.[side]?.players?.[`ID${PLAYER_ID}`]
    if (pl) {
      const b = pl.stats?.batting
      const p = pl.stats?.pitching
      if (b && (b.atBats > 0 || b.baseOnBalls > 0 || b.plateAppearances > 0)) batting = b
      if (p && p.inningsPitched && p.inningsPitched !== '0.0') pitching = p
    }
  }
  return { batting, pitching }
}

// 1試合の大谷の成績（打撃サマリー・投手サマリー・各打席）を取得
async function fetchGameDetail(pk) {
  const [boxRes, pbpRes] = await Promise.all([
    fetch(`${API_BASE}/game/${pk}/boxscore`),
    fetch(`${API_BASE}/game/${pk}/playByPlay`),
  ])
  const box = await boxRes.json()
  const pbp = await pbpRes.json()
  let batting = null
  let pitching = null
  for (const side of ['home', 'away']) {
    const pl = box.teams?.[side]?.players?.[`ID${PLAYER_ID}`]
    if (pl) {
      const b = pl.stats?.batting
      const p = pl.stats?.pitching
      if (b && (b.atBats > 0 || b.baseOnBalls > 0 || b.plateAppearances > 0)) batting = b
      if (p && p.inningsPitched && p.inningsPitched !== '0.0') pitching = p
    }
  }
  const pas = []
  for (const play of pbp.allPlays || []) {
    if (play.matchup?.batter?.id === PLAYER_ID && play.about?.isComplete) {
      pas.push({ inning: play.about.inning, event: play.result?.event, rbi: play.result?.rbi })
    }
  }
  return { batting, pitching, pas }
}

function ScheduleView({ games }) {
  const [detail, setDetail] = useState(null)
  const [view, setView] = useState('upcoming') // upcoming / recent
  const [summaries, setSummaries] = useState({}) // pk -> { batting, pitching }

  // 「最近の結果」を開いたら、完了した各試合の大谷成績(boxscore)を取得
  useEffect(() => {
    if (view !== 'recent' || !games) return
    const finals = games.filter((g) => g.state === 'Final')
    let cancelled = false
    Promise.all(
      finals.map(async (g) => [g.pk, await fetchGameBoxSummary(g.pk).catch(() => null)])
    ).then((entries) => {
      if (cancelled) return
      setSummaries((prev) => {
        const next = { ...prev }
        for (const [pk, s] of entries) if (s) next[pk] = s
        return next
      })
    })
    return () => { cancelled = true }
  }, [view, games])

  if (!games) return <div className="loading">読み込み中...</div>
  if (games.length === 0) return <div className="empty">日程が取得できませんでした</div>

  const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const upcoming = groupSeries(games.filter((g) => g.state !== 'Final'))
  const recent = groupSeries(games.filter((g) => g.state === 'Final')).reverse()

  const openGame = async (g, oppName) => {
    if (g.state !== 'Final' && g.state !== 'Live') return // 予定試合は成績なし
    setDetail({ game: g, oppName, loading: true })
    try {
      const d = await fetchGameDetail(g.pk)
      setDetail({ game: g, oppName, loading: false, ...d })
    } catch {
      setDetail({ game: g, oppName, loading: false, error: true })
    }
  }

  const renderGameRow = (g, oppName) => {
    const t = toJst(g.dateUTC)
    const isToday = t.ymd === todayYmd
    const live = g.state === 'Live'
    const final = g.state === 'Final'
    const tappable = final || live
    let right
    if (final && g.dodgersScore != null && g.oppScore != null) {
      const win = g.dodgersScore > g.oppScore
      right = <span className={`game-result ${win ? 'win' : 'lose'}`}>{win ? '○' : '●'} {g.dodgersScore}-{g.oppScore}</span>
    } else {
      right = <span className={`game-time ${live ? 'live' : ''}`}>{live ? 'LIVE' : t.time}</span>
    }
    const sum = summaries[g.pk]
    const Tag = tappable ? 'button' : 'div'
    return (
      <Tag
        key={g.pk}
        type={tappable ? 'button' : undefined}
        className={`game-row ${isToday ? 'today' : ''} ${g.ohtaniPitching ? 'pitch' : ''} ${tappable ? 'tappable' : ''}`}
        onClick={tappable ? () => openGame(g, oppName) : undefined}
      >
        <span className="game-row-main">
          <span className="game-date">{t.md}<span className="game-wd">（{t.wd}）</span></span>
          {isToday && <span className="game-today-tag">今日</span>}
          {g.ohtaniPitching && <span className="game-pitch-tag">先発登板</span>}
          <span className="game-right">{right}{tappable && <span className="game-chevron" aria-hidden>›</span>}</span>
        </span>
        {sum && (sum.pitching || sum.batting) && (
          <span className="game-ohtani">
            {sum.pitching && (
              <span className="game-oh-line">
                <span className="game-oh-tag pitch">投</span>{fmtPitchingLine(sum.pitching)}
              </span>
            )}
            {sum.batting && (
              <span className="game-oh-line">
                <span className="game-oh-tag bat">打</span>{fmtBattingLine(sum.batting)}
              </span>
            )}
          </span>
        )}
      </Tag>
    )
  }

  const renderSeries = (s) => (
    <div className="series" key={`${s.oppId}-${s.isHome}-${s.games[0]?.pk}`}>
      <div className="series-head">
        <span className="series-opp">{s.oppName}</span>
        <span className={`series-where ${s.isHome ? 'home' : 'away'}`}>{s.isHome ? 'ホーム' : 'ビジター'}</span>
        {s.games.length > 1 && <span className="series-count">{s.games.length}連戦</span>}
      </div>
      <div className="series-games">{s.games.map((g) => renderGameRow(g, s.oppName))}</div>
    </div>
  )

  const list = view === 'upcoming' ? upcoming : recent
  return (
    <div className="schedule">
      <div className="subtabs sch-subtabs">
        <button className={`subtab ${view === 'upcoming' ? 'active' : ''}`} onClick={() => setView('upcoming')}>今後の予定</button>
        <button className={`subtab ${view === 'recent' ? 'active' : ''}`} onClick={() => setView('recent')}>最近の結果</button>
      </div>
      {list.length > 0
        ? list.map(renderSeries)
        : <div className="empty">{view === 'upcoming' ? '今後の予定はありません' : '最近の結果はありません'}</div>}
      {detail && <GameDetailSheet detail={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function GameDetailSheet({ detail, onClose }) {
  const { game, oppName, loading, error, batting, pitching, pas } = detail
  const t = toJst(game.dateUTC)
  const hasResult = game.dodgersScore != null && game.oppScore != null
  const win = hasResult && game.dodgersScore > game.oppScore

  // 右ドロワー: スワイプで閉じる（ランキングと同じ挙動）
  const drawerRef = useRef(null)
  const backdropRef = useRef(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const dxRef = useRef(0)
  const swiping = useRef(false)
  const closingRef = useRef(false)

  const animateClose = () => {
    if (closingRef.current) return
    closingRef.current = true
    if (drawerRef.current) {
      drawerRef.current.style.transition = 'transform 0.22s ease-in'
      drawerRef.current.style.transform = 'translateX(100%)'
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 0.22s ease-in'
      backdropRef.current.style.opacity = '0'
    }
    setTimeout(onClose, 220)
  }
  const onTouchStart = (e) => {
    if (closingRef.current) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    dxRef.current = 0
    swiping.current = false
    if (drawerRef.current) { drawerRef.current.style.transition = 'none'; drawerRef.current.style.animation = 'none' }
  }
  const onTouchMove = (e) => {
    if (closingRef.current) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (!swiping.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      if (Math.abs(dx) > Math.abs(dy) && dx > 0) swiping.current = true
      else return
    }
    if (dx > 0) {
      dxRef.current = dx
      if (drawerRef.current) drawerRef.current.style.transform = `translateX(${dx}px)`
      if (backdropRef.current) backdropRef.current.style.opacity = String(Math.max(0, 0.45 * (1 - dx / 400)))
    }
  }
  const onTouchEnd = () => {
    if (closingRef.current) return
    if (dxRef.current > 80) {
      animateClose()
    } else {
      if (drawerRef.current) { drawerRef.current.style.transition = 'transform 0.2s ease-out'; drawerRef.current.style.transform = '' }
      if (backdropRef.current) { backdropRef.current.style.transition = 'opacity 0.2s ease-out'; backdropRef.current.style.opacity = '' }
    }
    dxRef.current = 0
    swiping.current = false
  }

  return (
    <>
      <div className="gd-backdrop" ref={backdropRef} onClick={animateClose} aria-hidden />
      <aside
        className="gd-drawer"
        ref={drawerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="gd-panel">
        <div className="gd-head">
          <div>
            <div className="gd-title">ドジャース {game.isHome ? 'vs' : '@'} {oppName}</div>
            <div className="gd-sub">
              {t.md}（{t.wd}）{game.state === 'Live' && ' ・ LIVE'}
              {hasResult && <> ・ <span className={win ? 'gd-win' : 'gd-lose'}>{win ? '○ 勝' : '● 負'} {game.dodgersScore}-{game.oppScore}</span></>}
            </div>
          </div>
          <button className="gd-close" onClick={animateClose} aria-label="閉じる">×</button>
        </div>

        {loading && <div className="gd-loading">読み込み中...</div>}
        {error && <div className="gd-loading">成績を取得できませんでした</div>}

        {!loading && !error && (
          <>
            {pitching && (
              <div className="gd-block">
                <div className="gd-line-label">投手</div>
                <div className="gd-line">
                  {pitching.inningsPitched}回 被安打{pitching.hits} 自責{pitching.earnedRuns} 奪三振{pitching.strikeOuts} 与四球{pitching.baseOnBalls}
                </div>
              </div>
            )}

            {batting && (
              <div className="gd-block">
                <div className="gd-line-label">打者</div>
                <div className="gd-line">
                  {batting.atBats}打数{batting.hits}安打
                  {batting.homeRuns > 0 && <em> 本塁打{batting.homeRuns}</em>}
                  {batting.rbi > 0 && <span> {batting.rbi}打点</span>}
                  {batting.baseOnBalls > 0 && <span> 四球{batting.baseOnBalls}</span>}
                  {batting.strikeOuts > 0 && <span> 三振{batting.strikeOuts}</span>}
                </div>
              </div>
            )}

            {pas && pas.length > 0 && (
              <div className="gd-block">
                <div className="gd-line-label">打席ごとの結果</div>
                <div className="gd-pas">
                  {pas.map((pa, i) => (
                    <div className="gd-pa" key={i}>
                      <span className="gd-pa-no">{i + 1}打席目</span>
                      <span className="gd-pa-inn">{pa.inning}回</span>
                      <span className={`gd-pa-ev ${HIT_EVENTS.has(pa.event) ? 'hit' : ''}`}>
                        {eventJp(pa.event)}{pa.rbi > 0 ? ` (${pa.rbi}打点)` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!batting && !pitching && (!pas || pas.length === 0) && (
              <div className="gd-loading">この試合の大谷の出場記録はありません</div>
            )}
          </>
        )}
        </div>
      </aside>
    </>
  )
}

// 規定投球回（チーム試合数 × 1.0イニング）の到達状況
function QualifierCard({ ip, teamGames }) {
  const current = ipToNumber(ip)
  const qualifier = teamGames // 1試合につき1.0イニング
  const reached = current >= qualifier
  const remaining = Math.max(0, qualifier - current)
  const pct = Math.min(100, qualifier > 0 ? (current / qualifier) * 100 : 0)
  return (
    <div className="qual-card">
      <div className="qual-head">
        <span className="qual-title">規定投球回</span>
        {reached ? (
          <span className="qual-badge reached">到達 ✓</span>
        ) : (
          <span className="qual-badge">あと {numberToIp(remaining)} イニング</span>
        )}
      </div>
      <div className="qual-bar">
        <div className="qual-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="qual-meta">
        <span>現在 <strong>{numberToIp(current)}</strong></span>
        <span>規定 <strong>{qualifier.toFixed(1)}</strong></span>
      </div>
      <div className="qual-note">規定 = チーム試合数 {teamGames} × 1.0 イニング（防御率などのタイトル資格）</div>
    </div>
  )
}

function HeadlineStat({ v, label, apiKey, selected, onSelect, pace }) {
  const active = selected === apiKey
  return (
    <button type="button" className={`headline-stat ${active ? 'active' : ''}`} onClick={() => onSelect(apiKey)}>
      <div className="num">{v ?? '—'}</div>
      <div className="headline-body">
        <div className="label">{label}</div>
        {pace != null && <div className="headline-pace">162試合換算 {pace}</div>}
      </div>
    </button>
  )
}

function StatCard({ v, label, sub, feature, isSelected, onClick, ranks }) {
  // 順位は3階層目として控えめに。NLを主、総合を従に1行で。
  const rankText = ranks
    ? [ranks.nl ? `NL ${ranks.nl}位` : null, ranks.all ? `全${ranks.all}位` : null].filter(Boolean).join(' · ')
    : null
  return (
    <button
      type="button"
      className={`stat ${isSelected ? 'active' : ''} ${feature ? 'feature' : ''}`}
      onClick={onClick}
    >
      <div className="v">{v ?? '—'}</div>
      <div className="k">
        {label}
        {sub && <span className="k-sub"> {sub}</span>}
      </div>
      {rankText && <div className="stat-rank">{rankText}</div>}
    </button>
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
  const apiKey = selectedItem.api
  const leagueLoaded = !!leaders?.[leagueFilter]
  const data = apiKey ? (leaders?.[leagueFilter]?.[group]?.[apiKey] || []) : []
  // この指標にランキングが存在するか（apiKeyがあり、いずれかの取得済みリーグにデータがある）
  const rankingExists = !!apiKey && Object.values(leaders || {}).some((lg) => (lg?.[group]?.[apiKey] || []).length > 0)
  const ohtani = data.find((l) => String(l.person?.id) === String(PLAYER_ID))
  const leagueLabel = LEAGUES.find((l) => l.key === leagueFilter)?.label || ''
  return (
    <div className="rank-panel">
      <div className="rank-panel-head">
        <h3 className="rank-panel-title">{selectedItem.label}{selectedItem.sub ? ` (${selectedItem.sub})` : ''}</h3>
        <button className="rank-close" onClick={onClose} aria-label="閉じる">×</button>
      </div>
      {selectedItem.desc && <p className="rank-desc">{selectedItem.desc}</p>}
      {rankingExists && (
        <>
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
          {!leagueLoaded ? (
            <div className="rank-loading">読み込み中...</div>
          ) : (
            <>
              {ohtani && (
                <div className="rank-summary">
                  <span className="rank-summary-pos">{leagueLabel} <strong>{ohtani.rank}位</strong>（{data.length}人中）</span>
                </div>
              )}
              <LeaderList leaders={data} />
            </>
          )}
        </>
      )}
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
