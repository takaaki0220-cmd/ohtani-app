// Cloudflare Worker: 静的アセット配信 + 通知API + Cronによる試合監視/プッシュ送信
import { sendPush } from './webpush.js'

const MLB = 'https://statsapi.mlb.com'
const OHTANI_ID = 660271
const DODGERS_ID = 119

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
const teamJp = (id, fallback) => TEAM_JP[id] || fallback || '相手'

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- YouTube ハイライト取得（YouTube Data API → KVに6時間キャッシュ） ----
const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search'
const HL_CACHE_KEY = 'highlights:v1'
const HL_TTL_MS = 6 * 60 * 60 * 1000 // 6時間
const HL_QUERY = 'Shohei Ohtani' // 後から調整可（例: '大谷翔平 ハイライト'）

async function handleHighlights(env) {
  let cached = null
  try { cached = JSON.parse((await env.KV.get(HL_CACHE_KEY)) || 'null') } catch { cached = null }
  // 新鮮なキャッシュがあればそのまま返す（API消費なし）
  if (cached && Date.now() - cached.fetchedAt < HL_TTL_MS) {
    return json({ videos: cached.videos, cached: true })
  }
  // キー未設定: 古いキャッシュ or 空 を返す（UIは「準備中」表示）
  if (!env.YOUTUBE_API_KEY) {
    return json({ videos: cached?.videos || [], error: 'no_api_key' })
  }
  try {
    const u = `${YT_SEARCH}?part=snippet&type=video&order=date&videoEmbeddable=true&maxResults=12&q=${encodeURIComponent(HL_QUERY)}&key=${env.YOUTUBE_API_KEY}`
    const r = await fetch(u)
    if (!r.ok) throw new Error('youtube ' + r.status)
    const d = await r.json()
    const videos = (d.items || [])
      .filter((it) => it.id?.videoId)
      .map((it) => ({
        id: it.id.videoId,
        title: it.snippet?.title || '',
        channel: it.snippet?.channelTitle || '',
        publishedAt: it.snippet?.publishedAt || '',
        thumb: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || '',
      }))
    await env.KV.put(HL_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), videos }))
    return json({ videos })
  } catch (e) {
    // クォータ超過・障害時は古いキャッシュにフォールバック
    return json({ videos: cached?.videos || [], error: String(e) })
  }
}

// ---- 購読の保存・読み込み（KV） ----
async function loadSubscriptions(env) {
  const out = []
  let cursor
  do {
    const list = await env.KV.list({ prefix: 'sub:', cursor })
    for (const k of list.keys) {
      const v = await env.KV.get(k.name)
      if (v) { const o = JSON.parse(v); o.key = k.name; out.push(o) }
    }
    cursor = list.list_complete ? null : list.cursor
  } while (cursor)
  return out
}

async function sendToAll(subs, ev, env) {
  for (const s of subs) {
    if (s.prefs && s.prefs[ev.type] === false) continue // そのイベントをOFFにしている
    try {
      const res = await sendPush(
        s.subscription,
        { title: ev.title, body: ev.body, tag: ev.tag, url: '/' },
        env,
      )
      if (res.status === 404 || res.status === 410) {
        await env.KV.delete(s.key) // 失効した購読は削除
      }
    } catch (e) {
      console.error('push 送信失敗', e) // 個別失敗はログに残して続行
    }
  }
}

// ---- Cron: 試合監視 ----
async function runScheduled(env) {
  if (!env.VAPID_PRIVATE_JWK) {
    console.warn('VAPID_PRIVATE_JWK 未設定のため通知をスキップ')
    return
  }
  const day = 86400000
  const fmt = (d) => d.toISOString().slice(0, 10)
  const now = new Date()
  const startDate = fmt(new Date(now.getTime() - day))
  const endDate = fmt(new Date(now.getTime() + day))
  const url = `${MLB}/api/v1/schedule?sportId=1&teamId=${DODGERS_ID}&startDate=${startDate}&endDate=${endDate}&hydrate=probablePitcher`
  let sched
  try { sched = await (await fetch(url)).json() } catch { return }

  const games = []
  for (const d of sched.dates || []) for (const g of d.games || []) games.push(g)

  // 購読は必要になった時だけ1回読む
  let subsCache = null
  const getSubs = async () => (subsCache ??= await loadSubscriptions(env))

  for (const g of games) {
    const state = g.status?.abstractGameState // Preview / Live / Final
    if (state === 'Preview') continue

    const pk = g.gamePk
    const key = `game:${pk}`
    const st = JSON.parse((await env.KV.get(key)) || '{}')
    const isHome = g.teams?.home?.team?.id === DODGERS_ID
    const oppTeam = isHome ? g.teams?.away?.team : g.teams?.home?.team
    const oppName = teamJp(oppTeam?.id, oppTeam?.name)
    const dodgersProbable = isHome ? g.teams?.home?.probablePitcher : g.teams?.away?.probablePitcher
    const ohtaniPitching = dodgersProbable?.id === OHTANI_ID

    // ライブ/終了時はフィードを取得（HR・スコア・成績）
    let feed = null
    if (state === 'Live' || state === 'Final') {
      try { feed = await (await fetch(`${MLB}/api/v1.1/game/${pk}/feed/live`)).json() } catch { feed = null }
    }

    const events = []

    // 試合開始
    if (!st.start && state === 'Live') {
      st.start = true
      events.push({ type: 'start', title: '⚾ 試合開始', body: `ドジャース vs ${oppName} が始まりました`, tag: `start-${pk}` })
      if (ohtaniPitching && !st.pitch) {
        st.pitch = true
        events.push({ type: 'pitching', title: '🔥 大谷 先発登板', body: `大谷翔平が先発マウンドへ（vs ${oppName}）`, tag: `pitch-${pk}` })
      }
    }

    // ホームラン
    if (feed) {
      const plays = feed.liveData?.plays?.allPlays || []
      let hrCount = 0
      for (const p of plays) {
        if (p.result?.eventType === 'home_run' && p.matchup?.batter?.id === OHTANI_ID && p.about?.isComplete) hrCount++
      }
      const prev = st.hr || 0
      if (hrCount > prev) {
        st.hr = hrCount
        events.push({
          type: 'hr',
          title: '💥 大谷 ホームラン！',
          body: hrCount > 1 ? `この試合 ${hrCount} 本目！（vs ${oppName}）` : `ホームランを放ちました（vs ${oppName}）`,
          tag: `hr-${pk}-${hrCount}`,
        })
      }
    }

    // 試合終了
    if (!st.final && state === 'Final') {
      st.final = true
      let body = `ドジャース vs ${oppName} 試合終了`
      if (feed) {
        const ls = feed.liveData?.linescore
        const homeR = ls?.teams?.home?.runs ?? 0
        const awayR = ls?.teams?.away?.runs ?? 0
        const dR = isHome ? homeR : awayR
        const oR = isHome ? awayR : homeR
        const wl = dR > oR ? '○ 勝利' : dR < oR ? '● 敗戦' : '△ 引分'
        const side = isHome ? 'home' : 'away'
        const pl = feed.liveData?.boxscore?.teams?.[side]?.players?.[`ID${OHTANI_ID}`]
        const b = pl?.stats?.batting
        const p = pl?.stats?.pitching
        const parts = []
        // 投手として登板した試合は投手成績も（アプリ内の試合詳細と同じ語彙）
        if (p && p.inningsPitched && p.inningsPitched !== '0.0') {
          parts.push(`投${p.inningsPitched}回 ${p.strikeOuts}奪三振 自責${p.earnedRuns}`)
        }
        // 打撃は日本式（米国式「安打-打数」をやめ、5打数1安打 の形に）
        if (b && b.atBats != null) {
          parts.push(`${b.atBats}打数${b.hits}安打${b.homeRuns ? ` 本塁打${b.homeRuns}` : ''}${b.rbi ? ` ${b.rbi}打点` : ''}`)
        }
        const line = parts.length ? ` ／ 大谷 ${parts.join(' ')}` : ''
        body = `${wl} ${dR}-${oR}（vs ${oppName}）${line}`
      }
      events.push({ type: 'final', title: '🏁 試合終了', body, tag: `final-${pk}` })
    }

    if (events.length) {
      await env.KV.put(key, JSON.stringify(st), { expirationTtl: 3 * 86400 })
      const subs = await getSubs()
      if (subs.length) for (const ev of events) await sendToAll(subs, ev, env)
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const p = url.pathname

    if (p === '/api/vapid-public-key') {
      return new Response(env.VAPID_PUBLIC_KEY || '', { headers: { 'content-type': 'text/plain' } })
    }

    if (p === '/api/subscribe' && request.method === 'POST') {
      const { subscription, prefs } = await request.json().catch(() => ({}))
      if (!subscription?.endpoint) return json({ error: 'invalid subscription' }, 400)
      const id = await sha256hex(subscription.endpoint)
      await env.KV.put(`sub:${id}`, JSON.stringify({ subscription, prefs: prefs || {} }))
      return json({ ok: true })
    }

    if (p === '/api/unsubscribe' && request.method === 'POST') {
      const { endpoint } = await request.json().catch(() => ({}))
      if (endpoint) await env.KV.delete(`sub:${await sha256hex(endpoint)}`)
      return json({ ok: true })
    }

    if (p === '/api/highlights') {
      return handleHighlights(env)
    }

    // それ以外は静的アセット（SPAフォールバックは not_found_handling が処理）
    return env.ASSETS.fetch(request)
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env))
  },
}
