import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { useTuner } from './hooks/useTuner'

const STORAGE_KEY = 'pitchleaf.reference-pitch'
const MIN_PITCH = 430
const MAX_PITCH = 450
const strings = [
  { name: 'E2', midi: 40 }, { name: 'A2', midi: 45 }, { name: 'D3', midi: 50 },
  { name: 'G3', midi: 55 }, { name: 'B3', midi: 59 }, { name: 'E4', midi: 64 },
]
function frequencyForMidi(midi: number, referencePitch: number) { return referencePitch * Math.pow(2, (midi - 69) / 12) }
function formatCents(cents: number) { return (cents > 0 ? '+' : '') + cents.toFixed(1) + ' cent' }

function App() {
  const [referencePitch, setReferencePitch] = useState(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(stored) && stored >= MIN_PITCH && stored <= MAX_PITCH ? stored : 440
  })
  const tuner = useTuner()
  useEffect(() => { localStorage.setItem(STORAGE_KEY, String(referencePitch)) }, [referencePitch])
  const target = useMemo(() => {
    if (!tuner.frequency) return null
    return strings.map(string => ({ ...string, frequency: frequencyForMidi(string.midi, referencePitch) }))
      .map(string => ({ ...string, cents: 1200 * Math.log2(tuner.frequency! / string.frequency) }))
      .sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents))[0]
  }, [referencePitch, tuner.frequency])
  const cents = target?.cents ?? null
  const inTune = cents !== null && Math.abs(cents) <= 4
  const markerPosition = cents === null ? 50 : Math.max(0, Math.min(100, 50 + cents))
  const levelPercent = Math.min(100, Math.round(tuner.level * 950))
  return <div className="app-shell">
    <header className="app-header"><a className="wordmark" href="./">pitchleaf<span>guitar tuner</span></a><div className="header-note">STANDARD · E A D G B E</div></header>
    <main>
      <section className="hero"><p className="eyebrow">CHROMATIC GUITAR TUNER</p><p className="lead">マイクに向かって弦を鳴らしてください。検出はこのブラウザの中だけで行われます。</p></section>
      <section className="tuner-card" aria-label="チューナー">
        <div className="readout"><div className={'status-dot ' + (tuner.running ? 'live' : '')} aria-hidden="true" /><span>{tuner.error ? 'マイクを確認してください' : tuner.running ? (tuner.frequency ? '検出中' : '音を待っています') : 'マイクは停止中'}</span></div>
        <div className={'note-display ' + (inTune ? 'in-tune' : '')} aria-live="polite"><span className="detected-note">{target?.name ?? '--'}</span><span className="target-note">{target ? '目標 ' + target.name : '弦を鳴らすと音名を表示します'}</span></div>
        <div className="measurements" aria-live="polite"><div><span>検出周波数</span><strong>{tuner.frequency ? <>{tuner.frequency.toFixed(1)}<small> Hz</small></> : '--'}</strong></div><div><span>音程のズレ</span><strong className={inTune ? 'good' : ''}>{cents !== null ? formatCents(cents) : '--'}</strong></div></div>
        <div className={'meter ' + (inTune ? 'meter-good' : '')} aria-label={cents === null ? '音程メーター' : formatCents(cents) + '。中央が正しい音程'}><div className="meter-scale"><span>低い</span><span>合っている</span><span>高い</span></div><div className="meter-track"><div className="meter-zone" /><div className="meter-center" /><div className="meter-marker" style={{ left: markerPosition + '%' }} /></div><div className="meter-ticks" aria-hidden="true"><span>−50</span><span>−25</span><span>0</span><span>+25</span><span>+50</span></div></div>
        <button className={'mic-button ' + (tuner.running ? 'stop' : '')} type="button" onClick={() => { void (tuner.running ? tuner.stop() : tuner.start()) }}><span className="mic-icon" aria-hidden="true">{tuner.running ? '■' : '●'}</span>{tuner.running ? 'マイクを停止' : 'マイクを開始'}</button>
        {tuner.error && <p className="error-message" role="alert">{tuner.error}</p>}{tuner.running && <div className="level" aria-label={'入力レベル ' + levelPercent + '%'}><span>入力レベル</span><div><i style={{ width: levelPercent + '%' }} /></div></div>}
      </section>
      <section className="settings-card" aria-labelledby="settings-title"><div className="settings-heading"><div><p className="eyebrow">REFERENCE PITCH</p><h2 id="settings-title">基準ピッチ</h2></div><strong>{referencePitch}<small> Hz</small></strong></div><div className="pitch-controls"><input aria-label="基準ピッチ" type="range" min={MIN_PITCH} max={MAX_PITCH} step="1" value={referencePitch} onChange={event => setReferencePitch(Number(event.target.value))} /><input aria-label="基準ピッチ（数値）" className="pitch-number" type="number" min={MIN_PITCH} max={MAX_PITCH} step="1" value={referencePitch} onChange={event => { const value = Number(event.target.value); if (value >= MIN_PITCH && value <= MAX_PITCH) setReferencePitch(value) }} /><button type="button" onClick={() => setReferencePitch(440)} disabled={referencePitch === 440}>440Hzに戻す</button></div><p className="settings-help">A4 = {referencePitch}Hz · 430〜450Hz · 1Hz刻み</p></section>
      <section className="strings-card" aria-labelledby="strings-title"><div className="strings-heading"><div><p className="eyebrow">STANDARD TUNING</p><h2 id="strings-title">ギターの標準チューニング</h2></div><span>目標周波数</span></div><div className="string-list">{strings.map((string, index) => <div className={'string-row ' + (target?.name === string.name ? 'selected' : '')} key={string.name}><span className="string-number">{index + 1}</span><strong>{string.name}</strong><span>{frequencyForMidi(string.midi, referencePitch).toFixed(2)} Hz</span></div>)}</div></section>
    </main>
    <footer><span>pitchleaf</span><span>音程は端末上で処理され、音声は送信されません。</span></footer>
  </div>
}
export default App
