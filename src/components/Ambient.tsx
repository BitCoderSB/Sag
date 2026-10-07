import { useEffect, useRef } from 'react';
import { reducedMotion } from '../motion';

/** Fondo vivo: auroras azules que derivan despacio y partículas que se encienden cerca del cursor.
 *  Las auroras son capas CSS que solo se trasladan (las mueve la GPU); el lienzo dibuja únicamente las partículas.
 *  Es decorativo, va detrás de los paneles y se detiene con «reducir movimiento» o con la pestaña oculta. */
export default function Ambient() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!; const ctx = c.getContext('2d');
    if (!ctx) return;
    let w = 0; let h = 0; let frame = 0; let last = 0; let running = true;
    const mouse = { x: -999, y: -999 };
    const dots = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + .3, s: Math.random() * .00012 + .00003, p: Math.random() * Math.PI * 2 }));
    const resize = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.y -= d.s * 16; if (d.y < -.02) { d.y = 1.02; d.x = Math.random(); }
        const x = d.x * w + Math.sin(t / 2400 + d.p) * 14; const y = d.y * h;
        const near = Math.max(0, 1 - Math.hypot(x - mouse.x, y - mouse.y) / 180);
        const a = .18 + .22 * (Math.sin(t / 900 + d.p) + 1) / 2 + near * .6;
        ctx.beginPath(); ctx.arc(x, y, d.r + near * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150,190,255,${a})`; ctx.fill();
      }
    };
    const loop = (t: number) => {
      if (!running) return;
      frame = requestAnimationFrame(loop);
      if (t - last < 33) return; // ~30 fps: suficiente para un movimiento lento
      last = t; draw(t);
    };
    const onMove = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onVisible = () => { cancelAnimationFrame(frame); running = !document.hidden && !reducedMotion(); if (running) frame = requestAnimationFrame(loop); else draw(performance.now()); };
    resize(); onVisible();
    addEventListener('resize', resize); addEventListener('pointermove', onMove, { passive: true }); document.addEventListener('visibilitychange', onVisible);
    return () => { running = false; cancelAnimationFrame(frame); removeEventListener('resize', resize); removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return <div className="ambient" aria-hidden="true"><i className="aurora aurora-1" /><i className="aurora aurora-2" /><i className="aurora aurora-3" /><canvas ref={canvas} /></div>;
}
