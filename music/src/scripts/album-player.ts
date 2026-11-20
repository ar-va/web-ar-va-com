// The album page's sound (user, 2026-11-20): the album's YouTube Music tracks, played in order by a hidden YouTube
// player that follows the turntable. It starts as the record spins up and fades in to half volume. Browsers may refuse
// sound before the visitor has clicked anything: then the record stops and waits for its play button. A visitor's
// pause is remembered (this browser only), so the next album stays quiet until they press play.
// shortcut: the player is hidden, against YouTube's API terms (owner's choice, 2026-11-20); if YouTube blocks it, the
// record simply plays without sound.
const TARGET = 50; // percent
const FADE_IN_MS = 8000; // autoplay: a slow rise
const RESUME_MS = 2000; // pressing play again
const FADE_OUT_MS = 600;
const KEY = 'album-sound';
const PLAYING = 1, BUFFERING = 3, ENDED = 0;

type Track = { id: string; title: string };
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
export function albumPlayer(tracks: Track[], status: HTMLElement | null, halt: () => void) {
  let player: any = null;
  let ready: Promise<any> | null = null;
  let wanted = false;
  let fadeMs = 0; // > 0: fade in over this long once sound actually starts
  let fade = 0;
  let failures = 0;
  const say = (text: string) => { if (status) status.textContent = text; };
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
        onReady: () => { player.setVolume(0); player.cuePlaylist(tracks.map((t) => t.id)); resolve(player); },
        onStateChange: (e: { data: number }) => {
          if (e.data === PLAYING) {
            failures = 0;
            if (!wanted) return player.pauseVideo();
            const t = tracks[player.getPlaylistIndex()];
            if (t) say(`Playing “${t.title}” from YouTube Music`);
            if (fadeMs) { ramp(TARGET, fadeMs); fadeMs = 0; }
          }
          if (e.data === ENDED && player.getPlaylistIndex() >= tracks.length - 1) { wanted = false; say(''); halt(); }
        },
        // A track that can't be embedded: skip it; none playable: the record carries on without sound.
        onError: () => { if (++failures >= tracks.length) { wanted = false; say(''); } else player.nextVideo(); },
      },
    });
  })));

  return {
    async play(byUser: boolean) {
      if (!byUser && remembered() === 'off') return;
      if (byUser) remember('on');
      wanted = true;
      await create();
      if (!wanted) return;
      clearInterval(fade);
      player.setVolume(0);
      fadeMs = byUser ? RESUME_MS : FADE_IN_MS;
      player.playVideo();
      // No sound after a few seconds of an autoplay (and not just loading): the browser said no. Stop and wait for a click.
      if (!byUser) setTimeout(() => {
        const s = player.getPlayerState();
        if (wanted && s !== PLAYING && s !== BUFFERING) {
          wanted = false;
          clearInterval(fade);
          player.setVolume(0);
          halt();
          say('Press play to hear the album');
        }
      }, 3000);
    },
    stop(byUser: boolean) {
      wanted = false;
      if (byUser) remember('off');
      say('');
      if (player) ramp(0, FADE_OUT_MS, () => player.pauseVideo());
    },
  };
}
