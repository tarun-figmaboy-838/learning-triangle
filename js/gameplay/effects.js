import { prefersReducedMotion } from '../core/motion.js';

const CONFETTI_COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];

function random(min, max) {
  return min + Math.random() * (max - min);
}

/** Short-lived effects on the fx layer: a splash in the canal (ripple sprites and drops) and confetti. */
export function createEffects({ fxLayer }) {
  function spawn(className, x, y, { tag = 'div', src, lifetime = 1000, vars = {} } = {}) {
    const element = document.createElement(tag);
    element.className = className;
    if (src) {
      element.src = src;
      element.alt = '';
      element.draggable = false;
    }
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
    fxLayer.appendChild(element);
    setTimeout(() => element.remove(), lifetime);
    return element;
  }

  return {
    splash(x, y) {
      spawn('fx-ripple', x, y, { tag: 'img', src: 'assets/images/fx/ripple-1.webp', lifetime: 1000 });
      setTimeout(() => spawn('fx-ripple', x + random(-20, 20), y + 6, { tag: 'img', src: 'assets/images/fx/ripple-2.webp', lifetime: 1000 }), 140);
      if (prefersReducedMotion()) return;
      for (let i = 0; i < 7; i += 1) {
        spawn('fx-drop', x + random(-30, 30), y - 6, { lifetime: 800, vars: { '--dx': `${random(-34, 34)}px` } });
      }
    },
    confetti(count = 110) {
      if (prefersReducedMotion()) return;
      for (let i = 0; i < count; i += 1) {
        const piece = spawn('fx-confetti', random(0, 1920), -30, {
          lifetime: 6200,
          vars: { '--dur': `${random(2600, 4400)}ms`, '--delay': `${random(0, 1600)}ms` },
        });
        piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        piece.style.transform = `rotate(${random(0, 360)}deg)`;
      }
    },
    clear() {
      fxLayer.replaceChildren();
    },
  };
}
