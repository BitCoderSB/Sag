/** Avatares de animales: los comparten el servidor (que asigna uno al crear un alumno) y la interfaz (que los dibuja). */
export const ANIMALS = ['fox', 'cat', 'dog', 'bear', 'panda', 'rabbit', 'lion', 'tiger', 'wolf', 'owl', 'penguin', 'frog', 'koala', 'monkey', 'pig', 'elephant', 'deer', 'raccoon', 'chick', 'cow'] as const;
export type AnimalId = typeof ANIMALS[number];
export const isAnimal = (value: unknown): value is AnimalId => ANIMALS.includes(value as AnimalId);

/** El animal menos usado hasta ahora; si hay empate, uno al azar. Así los primeros 20 alumnos no repiten. */
export function pickAnimal(used: (string | undefined)[], random: () => number = Math.random): AnimalId {
  const counts = new Map<AnimalId, number>(ANIMALS.map(a => [a, 0]));
  for (const id of used) if (isAnimal(id)) counts.set(id, counts.get(id)! + 1);
  const least = Math.min(...counts.values());
  const pool = ANIMALS.filter(a => counts.get(a) === least);
  return pool[Math.floor(random() * pool.length)];
}
