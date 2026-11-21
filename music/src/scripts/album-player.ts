// The album page's sound (user, 2026-11-20): the album's YouTube Music tracks, played in order by a hidden YouTube
// player that follows the turntable. It starts as the record spins up and fades in to half volume. Browsers may refuse
// sound before the visitor has clicked anything: then the record stops and waits for its play button. A visitor's
// pause is remembered (this browser only), so the next album stays quiet until they press play.
// The player bar (components/PlayerBar.astro, 2026-11-21) shows the track, its progress (drag to seek) and the queue.
// shortcut: the player is hidden, against YouTube's API terms (owner's choice, 2026-11-20); if YouTube blocks it, the
// record simply plays without sound.
import { dropNeedle } from './needle';

const TARGET = 50; // percent: the volume until the visitor picks one with the bar's slider
const FADE_IN_MS = 8000; // autoplay: a slow rise
const RESUME_MS = 2000; // pressing play again
const FADE_OUT_MS = 600;
const KEY = 'album-sound';
const VOLUME_KEY = 'album-volume';
const PLAYING = 1, BUFFERING = 3, ENDED = 0;

type Track = { id: string; title: string };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s);
declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

let api: Promise<any> | null = null;
const loadApi = () => (api ??= new Promise((resolve) => {
  if (window.YT?.Player) return resolve(window.YT);
  const before = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { before?.(); resolve(window.YT); };
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.async = true;
  document.head.append(s);
}));
const remembered = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const remember = (v: 'on' | 'off') => { try { localStorage.setItem(KEY, v); } catch {} };

/** `halt` stops the turntable without asking for sound (blocked autoplay, end of the album). */
export function albumPlayer(tracks: Track[], halt: () => void) {
  let player: any = null;
  let ready: Promise<any> | null = null;
  let wanted = false;
  let fadeMs = 0; // > 0: fade in over this long once sound actually starts
  let fade = 0;
  let failures = 0;
  const title = $('[data-bar-title]'), note = $('[data-bar-note]'), time = $('[data-bar-time]'), length = $('[data-bar-length]');
  const seek = $<HTMLInputElement>('[data-bar-seek]'), next = $<HTMLButtonElement>('[data-bar-next]');
  const items = [...document.querySelectorAll<HTMLElement>('[data-bar-go]')];
  const say = (text: string) => { if (note) note.textContent = text || note.dataset.artist || ''; };
  let current = -1;
  let seeking = false;
  // Repeat the album (the bar's left button): after the last track comes the first, so Next is never off.
  const repeatBtn = $('[data-bar-repeat]');
  const repeat = () => repeatBtn?.getAttribute('aria-pressed') === 'true';
  const canNext = () => { if (next) next.disabled = tracks.length < 2 || (!repeat() && current >= tracks.length - 1); };
  repeatBtn?.addEventListener('click', () => { repeatBtn.setAttribute('aria-pressed', String(!repeat())); canNext(); });
  // Mute (the bar's speaker button, key M): YouTube's own mute, so the fades' volume is kept for unmuting; the needle
  // stays quiet too. This page only.
  let muted = false;
  const muteBtn = $('[data-bar-mute]');
  const setMuted = (on: boolean) => {
    muted = on;
    muteBtn?.setAttribute('aria-pressed', String(on));
    if (muteBtn) muteBtn.title = `${on ? 'Unmute' : 'Mute'} (M)`;
    if (player) on ? player.mute() : player.unMute();
  };
  muteBtn?.addEventListener('click', (e) => { e.stopPropagation(); setMuted(!muted); });
  // Volume (the bar's slider, user 2026-11-21): what the fades rise to, remembered in this browser. Moving it while
  // playing sets it at once (ending a fade-in); moving it while muted unmutes.
  const stored = Number((() => { try { return localStorage.getItem(VOLUME_KEY); } catch { return null; } })() ?? NaN);
  let level = Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : TARGET;
  const volume = $<HTMLInputElement>('[data-bar-volume]');
  const paintVolume = () => volume?.style.setProperty('--p', `${level}%`);
  if (volume) { volume.value = String(level); paintVolume(); }
  volume?.addEventListener('input', () => {
    level = Number(volume.value);
    paintVolume();
    try { localStorage.setItem(VOLUME_KEY, String(level)); } catch {}
    if (muted && level > 0) setMuted(false);
    if (player && wanted) { clearInterval(fade); player.setVolume(level); }
  });
  volume?.addEventListener('click', (e) => e.stopPropagation());
  const show = (i: number) => {
    if (i === current || !tracks[i]) return;
    current = i;
    if (title) title.textContent = tracks[i].title;
    items.forEach((b, j) => b.setAttribute('aria-current', String(i === j)));
    canNext();
  };
  show(0);
  // Which track is playing, by its video: YouTube's getPlaylistIndex() was one ahead (seen 2026-11-21: 1 on the first).
  const playing = () => tracks.findIndex((t) => t.id === player.getVideoData?.()?.video_id);
  // The bar follows the player twice a second: whichever way the track changed (next, the end of one, a skipped error).
  const tick = () => {
    show(playing());
    const d = player.getDuration(), t = player.getCurrentTime();
    if (d && seek && length) { seek.max = String(Math.floor(d)); length.textContent = clock(d); }
    if (!seeking && seek && time) { seek.value = String(Math.floor(t)); time.textContent = clock(t); fill(); }
  };
  // How much of the progress line is filled (the bar's CSS draws it from --p).
  const fill = () => seek?.style.setProperty('--p', `${(100 * Number(seek.value)) / (Number(seek.max) || 1)}%`);
  seek?.addEventListener('input', () => { seeking = true; fill(); if (time) time.textContent = clock(Number(seek.value)); });
  seek?.addEventListener('change', () => { seeking = false; player?.seekTo(Number(seek.value), true); });
  const ramp = (to: number, ms: number, done?: () => void) => {
    clearInterval(fade);
    const from = player.getVolume(), start = performance.now();
    fade = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / ms);
      player.setVolume(Math.round(from + (to - from) * (to > from ? t * t : t))); // rises slowly at first
      if (t >= 1) { clearInterval(fade); done?.(); }
    }, 100);
  };
  const create = () => (ready ??= loadApi().then((YT) => new Promise((resolve) => {
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    const host = document.createElement('div');
    box.append(host);
    document.body.append(box);
    player = new YT.Player(host, {
      host: 'https://www.youtube-nocookie.com', width: 1, height: 1,
      playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0 },
      events: {
        onReady: () => {
          player.setVolume(0);
          if (muted) player.mute();
          player.cuePlaylist(tracks.map((t) => t.id));
          if (seek) seek.disabled = false;
          setInterval(tick, 500);
          resolve(player);
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === PLAYING) {
            failures = 0;
            if (!wanted) return player.pauseVideo();
            say('');
            if (fadeMs) { ramp(level, fadeMs); fadeMs = 0; }
          }
          // The album's end: round again with repeat on; otherwise back to the first track, ready for the next play.
          if (e.data === ENDED && playing() >= tracks.length - 1) {
            if (repeat()) player.playVideoAt(0);
            else { wanted = false; halt(); player.cuePlaylist(tracks.map((t) => t.id)); }
          }
        },
        // A track that can't be embedded: skip it; none playable: the record carries on without sound.
        onError: () => { if (++failures >= tracks.length) { wanted = false; say(''); } else player.nextVideo(); },
      },
    });
  })));

  // Jumps to a track; the caller starts the sound first (the turntable's play), so it plays.
  const go = async (i: number) => {
    if (!tracks[i]) return;
    show(i);
    await create();
    player.playVideoAt(i);
  };

  return {
    go,
    next: () => go(current + 1 < tracks.length ? current + 1 : 0),
    // A few seconds in: back to the start of the track; otherwise the one before.
    prev: () => (player && player.getCurrentTime() > 3 ? player.seekTo(0, true) : go(Math.max(0, current - 1))),
    /** Keyboard ← / →: a few seconds back or forward within the track (not past its end). */
    /** Keyboard ↑ / ↓: moves the bar's volume slider (also when it's hidden on phones), with all its rules. */
    volumeBy: (d: number) => {
      if (!volume) return;
      volume.value = String(Math.max(0, Math.min(100, level + d)));
      volume.dispatchEvent(new Event('input'));
    },
    seekBy: (s: number) => { if (player) player.seekTo(Math.max(0, Math.min(player.getDuration() - 1, player.getCurrentTime() + s)), true); },
    async play(byUser: boolean) {
      if (!byUser && remembered() === 'off') return;
      if (byUser) remember('on');
      // The needle goes down once the platter has spun up (RecordHero: 1.1 s); the album fades in under its crackle.
      if (!muted && level > 0) dropNeedle(700, 0.6 * Math.min(1.5, level / TARGET));
      wanted = true;
      await create();
      if (!wanted) return;
      clearInterval(fade);
      player.setVolume(0);
      fadeMs = byUser ? RESUME_MS : FADE_IN_MS;
      player.playVideo();
      // No sound a few seconds into an autoplay: the browser said no (or YouTube is stuck loading, given up on after
      // 12 s). Stop and wait for a click, so the record and the bar never show playing without sound.
      const asked = performance.now();
      const check = () => {
        const s = player.getPlayerState();
        if (!wanted || s === PLAYING) return;
        if (s === BUFFERING && performance.now() - asked < 12000) return void setTimeout(check, 1000);
        wanted = false;
        clearInterval(fade);
        player.setVolume(0);
        halt();
        say('Press play to hear the album');
      };
      if (!byUser) setTimeout(check, 3000);
    },
    /** False after a remembered pause: then the record stays at rest on arrival instead of spinning in silence. */
    willAutoplay: () => remembered() !== 'off',
    stop(byUser: boolean) {
      wanted = false;
      if (byUser) remember('off');
      if (player) ramp(0, FADE_OUT_MS, () => player.pauseVideo());
    },
  };
}
