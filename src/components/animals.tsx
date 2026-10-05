import type { ReactNode } from 'react';
import type { AnimalId } from '../../shared/avatars';

/* Veinte caras de animales en 64×64. Fondo de color pleno (sin pasteles) y formas planas; el círculo lo recorta el CSS. */
const INK = '#17171c';
const eyes = (y: number, gap = 9, r = 2.6) => <><circle cx={32 - gap} cy={y} r={r} fill={INK} /><circle cx={32 + gap} cy={y} r={r} fill={INK} /></>;
const stroke = { fill: 'none', stroke: INK, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const ANIMAL_ART: Record<AnimalId, { name: string; bg: string; art: ReactNode }> = {
  fox: { name: 'Zorro', bg: '#1971c2', art: <>
    <path d="M9 25 17 7l11 13q4-.8 8 0L47 7l8 18q0 20-23 32Q9 45 9 25Z" fill="#f76707" />
    <path d="M9 33q15 0 23 24Q12 47 9 33ZM55 33Q40 33 32 57q20-10 23-24Z" fill="#fff" />
    <path d="m17 11 7 9-9 4ZM47 11l-7 9 9 4Z" fill={INK} />
    {eyes(33)}<ellipse cx="32" cy="50" rx="3.4" ry="2.6" fill={INK} /></> },
  cat: { name: 'Gato', bg: '#f08c00', art: <>
    <path d="M10 28 12 8l15 10q5-1 10 0L52 8l2 20q2 22-22 26Q8 50 10 28Z" fill="#6c757d" />
    <path d="m14 13 8 6-8 5ZM50 13l-8 6 8 5Z" fill="#e64980" />
    <ellipse cx="23" cy="32" rx="3.4" ry="3.8" fill="#ffd43b" /><ellipse cx="41" cy="32" rx="3.4" ry="3.8" fill="#ffd43b" />
    <ellipse cx="23" cy="32" rx="1.2" ry="3" fill={INK} /><ellipse cx="41" cy="32" rx="1.2" ry="3" fill={INK} />
    <path d="M29 40h6l-3 4Z" fill="#e64980" /><path d="M32 44q-3 4-6 2M32 44q3 4 6 2" {...stroke} />
    <path d="M6 40l14 2M6 46l14-1M58 40l-14 2M58 46l-14-1" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></> },
  dog: { name: 'Perro', bg: '#2f9e44', art: <>
    <ellipse cx="14" cy="30" rx="8" ry="15" fill="#6f4518" transform="rotate(10 14 30)" /><ellipse cx="50" cy="30" rx="8" ry="15" fill="#6f4518" transform="rotate(-10 50 30)" />
    <ellipse cx="32" cy="34" rx="19" ry="21" fill="#d9a066" /><ellipse cx="32" cy="43" rx="10" ry="8" fill="#f8e7cc" />
    {eyes(30, 8)}<ellipse cx="32" cy="40" rx="4" ry="3" fill={INK} />
    <path d="M32 43v3M32 46q-4 3-7 0M32 46q4 3 7 0" {...stroke} /><path d="M29 47q3 8 6 0Z" fill="#e03131" /></> },
  bear: { name: 'Oso', bg: '#5f3dc4', art: <>
    <circle cx="15" cy="16" r="7.5" fill="#8a5a2b" /><circle cx="49" cy="16" r="7.5" fill="#8a5a2b" />
    <circle cx="15" cy="16" r="3.5" fill="#d9a066" /><circle cx="49" cy="16" r="3.5" fill="#d9a066" />
    <circle cx="32" cy="35" r="21" fill="#8a5a2b" /><ellipse cx="32" cy="43" rx="9.5" ry="7.5" fill="#e0b27a" />
    {eyes(31, 8)}<ellipse cx="32" cy="39" rx="3.8" ry="2.7" fill={INK} /><path d="M32 41.5v3M32 44.5q-3 3-6 .5M32 44.5q3 3 6 .5" {...stroke} /></> },
  panda: { name: 'Panda', bg: '#0b7285', art: <>
    <circle cx="14" cy="18" r="8" fill={INK} /><circle cx="50" cy="18" r="8" fill={INK} />
    <circle cx="32" cy="36" r="21" fill="#fff" />
    <ellipse cx="22" cy="33" rx="5" ry="6.6" fill={INK} transform="rotate(20 22 33)" /><ellipse cx="42" cy="33" rx="5" ry="6.6" fill={INK} transform="rotate(-20 42 33)" />
    <circle cx="23" cy="33" r="1.9" fill="#fff" /><circle cx="41" cy="33" r="1.9" fill="#fff" />
    <ellipse cx="32" cy="43" rx="3.6" ry="2.6" fill={INK} /><path d="M32 45.5q-3 4-6 1M32 45.5q3 4 6 1" {...stroke} /></> },
  rabbit: { name: 'Conejo', bg: '#d6336c', art: <>
    <ellipse cx="22" cy="15" rx="6.5" ry="15" fill="#f1f3f5" /><ellipse cx="42" cy="15" rx="6.5" ry="15" fill="#f1f3f5" />
    <ellipse cx="22" cy="16" rx="3" ry="10.5" fill="#e64980" /><ellipse cx="42" cy="16" rx="3" ry="10.5" fill="#e64980" />
    <ellipse cx="32" cy="41" rx="18" ry="16" fill="#f1f3f5" />
    {eyes(38, 8)}<path d="M29.5 43h5L32 46Z" fill="#e64980" /><path d="M32 46q-3 3-6 .5M32 46q3 3 6 .5" {...stroke} />
    <rect x="29.5" y="48" width="5" height="5.5" rx="1.4" fill="#fff" stroke="#adb5bd" strokeWidth="1" /></> },
  lion: { name: 'León', bg: '#087f5b', art: <>
    <circle cx="32" cy="33" r="27" fill="#c2410c" /><circle cx="15" cy="17" r="5.5" fill="#f59f00" /><circle cx="49" cy="17" r="5.5" fill="#f59f00" />
    <circle cx="32" cy="36" r="18" fill="#fab005" /><ellipse cx="32" cy="43.5" rx="9" ry="6.5" fill="#ffe066" />
    {eyes(32, 8)}<path d="M29 39h6l-3 4Z" fill="#7a3a0a" /><path d="M32 43q-3 4-6 1M32 43q3 4 6 1" {...stroke} /></> },
  tiger: { name: 'Tigre', bg: '#7048e8', art: <>
    <circle cx="14" cy="17" r="7" fill="#f76707" /><circle cx="50" cy="17" r="7" fill="#f76707" />
    <circle cx="14" cy="17" r="3" fill="#fff" /><circle cx="50" cy="17" r="3" fill="#fff" />
    <circle cx="32" cy="36" r="22" fill="#f76707" />
    <path d="M32 15v8M25 16l2 7M39 16l-2 7M10 32l8 1M10 40l8-2M54 32l-8 1M54 40l-8-2" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
    <ellipse cx="32" cy="45" rx="10.5" ry="7.5" fill="#fff" />{eyes(32, 9)}
    <path d="M29 40h6l-3 4Z" fill={INK} /><path d="M32 44q-3 3-6 .5M32 44q3 3 6 .5" {...stroke} /></> },
  wolf: { name: 'Lobo', bg: '#a61e4d', art: <>
    <path d="m10 26 4-20 13 13q5-1 10 0L50 6l4 20q0 18-22 32Q10 44 10 26Z" fill="#868e96" />
    <path d="M18 38q14-6 28 0L32 58Z" fill="#dee2e6" /><path d="m15 12 7 8-7 5ZM49 12l-7 8 7 5Z" fill="#495057" />
    <ellipse cx="23.5" cy="32" rx="3.6" ry="2.4" fill="#ffd43b" transform="rotate(14 23.5 32)" /><ellipse cx="40.5" cy="32" rx="3.6" ry="2.4" fill="#ffd43b" transform="rotate(-14 40.5 32)" />
    <circle cx="24" cy="32" r="1.2" fill={INK} /><circle cx="40" cy="32" r="1.2" fill={INK} />
    <ellipse cx="32" cy="50" rx="3.6" ry="2.7" fill={INK} /></> },
  owl: { name: 'Búho', bg: '#1864ab', art: <>
    <path d="m12 24 2-16 12 9ZM52 24l-2-16-12 9Z" fill="#6f4518" />
    <ellipse cx="32" cy="36" rx="21" ry="22" fill="#8b5a2b" /><ellipse cx="32" cy="48" rx="11" ry="8" fill="#e0b27a" />
    <circle cx="23" cy="31" r="9.5" fill="#fff" /><circle cx="41" cy="31" r="9.5" fill="#fff" />
    <circle cx="23" cy="31" r="5.6" fill="#fab005" /><circle cx="41" cy="31" r="5.6" fill="#fab005" />
    <circle cx="23" cy="31" r="2.8" fill={INK} /><circle cx="41" cy="31" r="2.8" fill={INK} />
    <path d="M28.5 38h7L32 46Z" fill="#f76707" /></> },
  penguin: { name: 'Pingüino', bg: '#1098ad', art: <>
    <ellipse cx="32" cy="36" rx="21" ry="23" fill="#212529" /><ellipse cx="32" cy="40" rx="14" ry="17" fill="#fff" />
    <circle cx="25.5" cy="30" r="4.3" fill="#fff" stroke="#212529" strokeWidth="1" /><circle cx="38.5" cy="30" r="4.3" fill="#fff" stroke="#212529" strokeWidth="1" />
    <circle cx="26" cy="30.5" r="2" fill={INK} /><circle cx="38" cy="30.5" r="2" fill={INK} />
    <path d="M26.5 36h11L32 44Z" fill="#f76707" /></> },
  frog: { name: 'Rana', bg: '#e8590c', art: <>
    <ellipse cx="32" cy="39" rx="23" ry="18" fill="#37b24d" /><circle cx="19" cy="23" r="10" fill="#37b24d" /><circle cx="45" cy="23" r="10" fill="#37b24d" />
    <circle cx="19" cy="23" r="6.2" fill="#fff" /><circle cx="45" cy="23" r="6.2" fill="#fff" />
    <circle cx="19.8" cy="23.5" r="3.2" fill={INK} /><circle cx="44.2" cy="23.5" r="3.2" fill={INK} />
    <circle cx="29" cy="37" r="1.1" fill="#2b8a3e" /><circle cx="35" cy="37" r="1.1" fill="#2b8a3e" />
    <path d="M14 44q18 12 36 0" {...stroke} strokeWidth="2" /><circle cx="16" cy="43" r="3" fill="#f03e3e" opacity=".85" /><circle cx="48" cy="43" r="3" fill="#f03e3e" opacity=".85" /></> },
  koala: { name: 'Koala', bg: '#364fc7', art: <>
    <circle cx="12" cy="24" r="11" fill="#868e96" /><circle cx="52" cy="24" r="11" fill="#868e96" />
    <circle cx="12" cy="24" r="5.5" fill="#f1f3f5" /><circle cx="52" cy="24" r="5.5" fill="#f1f3f5" />
    <ellipse cx="32" cy="36" rx="19" ry="20" fill="#adb5bd" />{eyes(32, 9, 2.4)}
    <ellipse cx="32" cy="39" rx="5.2" ry="7.6" fill="#343a40" /></> },
  monkey: { name: 'Mono', bg: '#c92a2a', art: <>
    <circle cx="11" cy="34" r="8" fill="#7f4f24" /><circle cx="53" cy="34" r="8" fill="#7f4f24" />
    <circle cx="11" cy="34" r="4" fill="#e9c79b" /><circle cx="53" cy="34" r="4" fill="#e9c79b" />
    <circle cx="32" cy="31" r="21" fill="#7f4f24" />
    <ellipse cx="25.5" cy="36" rx="9" ry="8.5" fill="#e9c79b" /><ellipse cx="38.5" cy="36" rx="9" ry="8.5" fill="#e9c79b" /><ellipse cx="32" cy="45" rx="11" ry="8.5" fill="#e9c79b" />
    {eyes(34, 7)}<circle cx="30" cy="43" r="1" fill={INK} /><circle cx="34" cy="43" r="1" fill={INK} /><path d="M26 49q6 4 12 0" {...stroke} /></> },
  pig: { name: 'Cerdo', bg: '#3b5bdb', art: <>
    <path d="m13 22-3-14 15 6ZM51 22l3-14-15 6Z" fill="#e64980" />
    <ellipse cx="32" cy="36" rx="22" ry="20" fill="#f06595" /><ellipse cx="32" cy="42" rx="10" ry="7.5" fill="#e64980" />
    <ellipse cx="28.5" cy="42" rx="1.7" ry="2.7" fill="#a61e4d" /><ellipse cx="35.5" cy="42" rx="1.7" ry="2.7" fill="#a61e4d" />{eyes(31, 10)}</> },
  elephant: { name: 'Elefante', bg: '#c2255c', art: <>
    <circle cx="12" cy="32" r="13" fill="#868e96" /><circle cx="52" cy="32" r="13" fill="#868e96" />
    <circle cx="12" cy="32" r="7" fill="#adb5bd" /><circle cx="52" cy="32" r="7" fill="#adb5bd" />
    <ellipse cx="32" cy="32" rx="16" ry="19" fill="#868e96" />
    <path d="M32 38v12q0 6 7 5" stroke="#868e96" strokeWidth="10" strokeLinecap="round" fill="none" /><path d="M29 52h6M29 48h6" stroke="#6c757d" strokeWidth="1.2" strokeLinecap="round" />
    {eyes(29, 8)}</> },
  deer: { name: 'Ciervo', bg: '#862e9c', art: <>
    <path d="M24 20 18 6M21 12l-9-2M40 20l6-14M43 12l9-2" stroke="#e8c39e" strokeWidth="3.2" strokeLinecap="round" fill="none" />
    <ellipse cx="12" cy="26" rx="8" ry="4.2" fill="#b5651d" transform="rotate(-28 12 26)" /><ellipse cx="52" cy="26" rx="8" ry="4.2" fill="#b5651d" transform="rotate(28 52 26)" />
    <path d="M17 28q0-12 15-12t15 12q0 10-7 20-3 6-8 6t-8-6q-7-10-7-20Z" fill="#b5651d" />
    <ellipse cx="32" cy="48" rx="8.5" ry="6.5" fill="#f1d9b5" />{eyes(32, 8)}
    <ellipse cx="32" cy="51" rx="3.2" ry="2.4" fill={INK} /><circle cx="26" cy="22" r="1.2" fill="#f1d9b5" /><circle cx="38" cy="22" r="1.2" fill="#f1d9b5" /></> },
  raccoon: { name: 'Mapache', bg: '#e67700', art: <>
    <path d="m11 26 1-17 14 10ZM53 26l-1-17-14 10Z" fill="#6c757d" />
    <ellipse cx="32" cy="37" rx="22" ry="19" fill="#868e96" /><ellipse cx="32" cy="46" rx="10" ry="7" fill="#f1f3f5" />
    <ellipse cx="22.5" cy="34" rx="9" ry="6.2" fill="#212529" transform="rotate(-12 22.5 34)" /><ellipse cx="41.5" cy="34" rx="9" ry="6.2" fill="#212529" transform="rotate(12 41.5 34)" />
    <circle cx="23" cy="34" r="2.5" fill="#fff" /><circle cx="41" cy="34" r="2.5" fill="#fff" /><circle cx="23.4" cy="34.2" r="1.1" fill={INK} /><circle cx="40.6" cy="34.2" r="1.1" fill={INK} />
    <ellipse cx="32" cy="43.5" rx="3.4" ry="2.5" fill={INK} /><path d="M32 46q-3 3-6 .5M32 46q3 3 6 .5" {...stroke} /></> },
  chick: { name: 'Pollito', bg: '#9c36b5', art: <>
    <path d="M32 15q-6-8-9-4M32 15q0-9 0-9M32 15q6-8 9-4" stroke="#fcc419" strokeWidth="3.2" strokeLinecap="round" fill="none" />
    <circle cx="32" cy="37" r="23" fill="#fcc419" />{eyes(32, 10, 2.8)}
    <circle cx="17.5" cy="42" r="3.4" fill="#ff6b6b" /><circle cx="46.5" cy="42" r="3.4" fill="#ff6b6b" />
    <path d="M26 39h12l-6 9Z" fill="#f76707" /></> },
  cow: { name: 'Vaca', bg: '#e03131', art: <>
    <path d="M22 15Q20 6 13 8M42 15q2-9 9-7" stroke="#f2c94c" strokeWidth="3.4" strokeLinecap="round" fill="none" />
    <ellipse cx="10" cy="27" rx="8" ry="4.6" fill="#f8f9fa" transform="rotate(-20 10 27)" /><ellipse cx="54" cy="27" rx="8" ry="4.6" fill="#f8f9fa" transform="rotate(20 54 27)" />
    <ellipse cx="32" cy="35" rx="18" ry="21" fill="#f8f9fa" /><ellipse cx="23" cy="19.5" rx="6.5" ry="5.5" fill="#212529" />
    <ellipse cx="32" cy="47" rx="12.5" ry="9" fill="#f06595" /><ellipse cx="27" cy="47" rx="1.9" ry="2.7" fill="#a61e4d" /><ellipse cx="37" cy="47" rx="1.9" ry="2.7" fill="#a61e4d" />
    {eyes(32, 8)}</> },
};

/** Cara de animal lista para usar dentro de un contenedor circular. */
export function AnimalFace({ id }: { id: AnimalId }) {
  const { bg, art } = ANIMAL_ART[id];
  return <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false"><rect width="64" height="64" fill={bg} />{art}</svg>;
}
