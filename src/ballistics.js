// Balística simplificada pero honesta: gravedad, rozamiento y deriva por viento.
// Calibre tipo .308 Win: ~830 m/s en boca.

export const MUZZLE = 830;
export const DRAG = 0.38; // pérdida de velocidad por segundo (fracción)
export const G = 9.81;
export const WIND_K = 0.7; // cuánto empuja el viento lateral a la bala

export function stepBullet(pos, vel, dt, wind) {
  vel.y -= G * dt;
  vel.x += wind.x * wind.speed * WIND_K * dt;
  vel.z += wind.z * wind.speed * WIND_K * dt;
  vel.multiplyScalar(1 - DRAG * dt);
  pos.addScaledVector(vel, dt);
}

// Ángulo de elevación del cañón para que la bala cruce la línea de mira a `dist` metros.
export function zeroAngle(dist) {
  let lo = 0, hi = 0.03;
  for (let i = 0; i < 40; i++) {
    const a = (lo + hi) / 2;
    let x = 0, y = 0;
    let vx = Math.cos(a) * MUZZLE, vy = Math.sin(a) * MUZZLE;
    const dt = 1 / 2000;
    let px = 0, py = 0;
    while (x < dist) {
      px = x; py = y;
      vy -= G * dt;
      vx *= 1 - DRAG * dt;
      vy *= 1 - DRAG * dt;
      x += vx * dt;
      y += vy * dt;
    }
    const yAt = py + ((y - py) * (dist - px)) / (x - px);
    if (yAt > 0) hi = a;
    else lo = a;
  }
  return (lo + hi) / 2;
}
