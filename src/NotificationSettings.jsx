import { useEffect, useState } from 'react'
import {
  DEFAULT_PREFS, pushSupported, isStandalone, permissionState,
  getExistingSubscription, enablePush, savePrefs, disablePush,
} from './notifications'

const EVENTS = [
  { key: 'hr', label: 'ホームラン', desc: '大谷がHRを打った時' },
  { key: 'start', label: '試合開始', desc: '大谷の試合が始まった時' },
  { key: 'pitching', label: '登板（先発）', desc: '投手として先発する時' },
  { key: 'final', label: '試合終了・結果', desc: '試合終了時に結果と成績' },
]

function loadPrefs() {
  try {
    const s = localStorage.getItem('notif-prefs')
    if (s) return { ...DEFAULT_PREFS, ...JSON.parse(s) }
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS }
}

export default function NotificationSettings({ onClose }) {
  const supported = pushSupported()
  const standalone = isStandalone()
  const [enabled, setEnabled] = useState(false)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getExistingSubscription().then((sub) => {
      setEnabled(!!sub && permissionState() === 'granted')
    })
  }, [])

  const persist = (p) => {
    setPrefs(p)
    try { localStorage.setItem('notif-prefs', JSON.stringify(p)) } catch { /* ignore */ }
  }

  const handleEnable = async () => {
    setBusy(true); setMsg('')
    try {
      await enablePush(prefs)
      setEnabled(true)
      setMsg('通知を有効にしました')
    } catch (e) {
      setMsg(e.message || '有効化に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async () => {
    setBusy(true); setMsg('')
    try {
      await disablePush()
      setEnabled(false)
      setMsg('通知を無効にしました')
    } catch {
      setMsg('無効化に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const toggleEvent = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] }
    persist(next)
    if (enabled) {
      try { await savePrefs(next) } catch { /* ignore */ }
    }
  }

  return (
    <div className="ns-overlay" onClick={onClose}>
      <div className="ns-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ns-head">
          <h2 className="ns-title">通知設定</h2>
          <button className="ns-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        {!supported && (
          <p className="ns-note">この端末・ブラウザは通知に対応していません。</p>
        )}

        {supported && !standalone && (
          <p className="ns-note">
            通知を使うには、まず<strong>ホーム画面に追加</strong>したアプリから開いてください。
            （Safariの共有ボタン →「ホーム画面に追加」）
          </p>
        )}

        {supported && (
          <>
            <button
              className={`ns-main-btn ${enabled ? 'on' : ''}`}
              onClick={enabled ? handleDisable : handleEnable}
              disabled={busy || (!standalone && !enabled)}
            >
              {enabled ? '通知をオフにする' : '通知をオンにする'}
            </button>

            <div className={`ns-events ${enabled ? '' : 'dim'}`}>
              {EVENTS.map((ev) => (
                <button
                  key={ev.key}
                  className="ns-event"
                  onClick={() => toggleEvent(ev.key)}
                  disabled={!enabled}
                >
                  <span className="ns-event-text">
                    <span className="ns-event-label">{ev.label}</span>
                    <span className="ns-event-desc">{ev.desc}</span>
                  </span>
                  <span className={`ns-switch ${prefs[ev.key] ? 'on' : ''}`} aria-hidden>
                    <span className="ns-knob" />
                  </span>
                </button>
              ))}
            </div>

            {msg && <p className="ns-msg">{msg}</p>}
            <p className="ns-fine">
              ※ 通知は最大1〜2分の遅れがあります。試合監視はシーズン中の試合日のみ動作します。
            </p>
          </>
        )}
      </div>
    </div>
  )
}
