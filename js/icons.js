// Íconos SVG de trazo (mismo estilo que el menú), creados sin innerHTML.
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  warning: ['M12 3.5 21.5 20h-19z', 'M12 10v4.5', 'M12 17.5h.01'],
  alert: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7.5V13', 'M12 16.5h.01'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  offline: ['M3 3l18 18', 'M8.5 16.4a5 5 0 0 1 7 0', 'M5 12.6a10 10 0 0 1 4.3-2.6', 'M14.9 10a10 10 0 0 1 4.1 2.6', 'M12 20h.01'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
};

export function icon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  for (const d of PATHS[name]) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
