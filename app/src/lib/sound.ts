// Sonido de "cobro" sintetizado con Web Audio (sin archivo externo): dos notas cortas
// ascendentes, como una moneda o una caja registradora. Suena cuando un Atajo registra un gasto.

let ctx: AudioContext | null = null;

export function playCashSound(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();

    const t0 = ctx.currentTime;
    // Dos notas ascendentes (intervalo de quinta), como una campanita de moneda.
    for (const { freq, at } of [
      { freq: 988, at: 0 },
      { freq: 1480, at: 0.09 },
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0 + at);
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.28, t0 + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.25);
    }
  } catch {
    // Audio bloqueado (autoplay, navegador) o no disponible: se ignora en silencio.
  }
}
