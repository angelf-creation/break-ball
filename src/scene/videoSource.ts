import * as THREE from 'three';
import type { VideoKind, VideoStatus } from '../state/types';

const BASE = import.meta.env.BASE_URL;
export const VIDEO_SRC: Record<VideoKind, string> = {
  desktop: `${BASE}assets/intro-desktop.mp4`,
  phone: `${BASE}assets/intro-phone.mp4`,
};

/**
 * Where the glowing disc sits inside each video frame (uv space, measured
 * from the supplied files). The phone file is 720×1280 with the disc centred.
 */
export const VIDEO_DISC: Record<VideoKind, { center: [number, number]; radius: [number, number] }> = {
  desktop: { center: [0.497, 0.497], radius: [0.472, 0.472] },
  phone: { center: [0.496, 0.5], radius: [0.374, 0.374 * (720 / 1280)] },
};

/**
 * Owns the <video> element and its texture. Phone falls back to desktop if
 * missing; if both are missing the scene runs the procedural Op-Cell instead.
 */
export class VideoSource {
  readonly el: HTMLVideoElement;
  readonly texture: THREE.VideoTexture;
  kind: VideoKind | null = null;
  /** the file actually playing (may differ from kind after fallback) */
  playing: VideoKind | null = null;
  status: VideoStatus = 'loading';
  private onStatus: (s: VideoStatus, playing: VideoKind | null) => void;
  private disposed = false;

  constructor(onStatus: (s: VideoStatus, playing: VideoKind | null) => void) {
    this.onStatus = onStatus;
    const el = document.createElement('video');
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('muted', '');
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    this.el = el;
    this.texture = new THREE.VideoTexture(el);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    el.addEventListener('canplay', this.handleCanPlay);
    el.addEventListener('error', this.handleError);
  }

  load(kind: VideoKind) {
    this.kind = kind;
    this.setFile(kind);
  }

  private setFile(file: VideoKind) {
    this.playing = file;
    this.setStatus('loading');
    this.el.src = VIDEO_SRC[file];
    this.el.load();
  }

  private handleCanPlay = () => {
    if (this.disposed) return;
    this.el.play().catch(() => {
      /* autoplay can be blocked (e.g. iOS low-power); resumeOnGesture() retries */
    });
    this.setStatus(this.kind !== this.playing ? 'fallback' : 'ready');
  };

  private handleError = () => {
    if (this.disposed) return;
    if (this.playing === 'phone') {
      this.setFile('desktop');
      return;
    }
    this.playing = null;
    this.setStatus('missing');
  };

  private setStatus(s: VideoStatus) {
    this.status = s;
    this.onStatus(s, this.playing);
  }

  isLive(): boolean {
    return (this.status === 'ready' || this.status === 'fallback') && this.el.readyState >= 2;
  }

  resumeOnGesture() {
    if (this.el.paused && this.isLive()) this.el.play().catch(() => {});
  }

  setRate(r: number) {
    if (Math.abs(this.el.playbackRate - r) > 0.01) this.el.playbackRate = r;
  }

  dispose() {
    this.disposed = true;
    this.el.removeEventListener('canplay', this.handleCanPlay);
    this.el.removeEventListener('error', this.handleError);
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    this.texture.dispose();
  }
}
