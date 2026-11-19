'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './hero-comparison.module.css';

export function HeroComparison() {
  const [split, setSplit] = useState(50);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const splitRef = useRef(50);

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!video || !canvas || !context || video.readyState < 2) return;

    const { width, height } = canvas;
    const sourceHeight = video.videoHeight / 2;
    const divider = Math.round((width * splitRef.current) / 100);

    // Top half of the stacked video is the high-quality source.
    context.drawImage(
      video,
      0,
      0,
      video.videoWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    );

    // Bottom half of the stacked video is the compressed version (left side).
    if (divider > 0) {
      context.save();
      context.beginPath();
      context.rect(0, 0, divider, height);
      context.clip();
      context.drawImage(
        video,
        0,
        sourceHeight,
        video.videoWidth,
        sourceHeight,
        0,
        0,
        width,
        height,
      );
      context.restore();
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Ensure muted is set on the DOM node before attempting autoplay.
    video.defaultMuted = true;
    video.muted = true;

    let frame = 0;
    const tick = () => {
      drawFrame();
      frame = requestAnimationFrame(tick);
    };

    const ensurePlaying = () => {
      drawFrame();
      if (video.paused) {
        void video.play().catch(() => {});
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden) ensurePlaying();
    };

    video.addEventListener('loadeddata', ensurePlaying);
    video.addEventListener('canplay', ensurePlaying);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pointerdown', ensurePlaying, { once: true });

    ensurePlaying();
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('loadeddata', ensurePlaying);
      video.removeEventListener('canplay', ensurePlaying);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointerdown', ensurePlaying);
    };
  }, [drawFrame]);

  return (
    <figure className={styles.demo}>
      <div className={styles.preview}>
        <video
          ref={videoRef}
          src="/branding/quality-comparison.mp4"
          className={styles.sourceVideo}
          preload="auto"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          className={styles.canvas}
          aria-hidden="true"
        />
        <span className={styles.before}>Compressed</span>
        <span className={styles.after}>High quality</span>
        <div
          className={styles.divider}
          style={{ left: `${split}%` }}
          aria-hidden="true"
        >
          <span>‹ ›</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={split}
          aria-label="Compare compressed and high quality video"
          aria-valuetext={`${split}% compressed preview`}
          onChange={(event) => {
            splitRef.current = event.currentTarget.valueAsNumber;
            setSplit(splitRef.current);
            drawFrame();
          }}
        />
      </div>
      <figcaption className={styles.caption}>Drag to compare</figcaption>
    </figure>
  );
}
