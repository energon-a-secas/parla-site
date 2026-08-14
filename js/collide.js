// -- Box separation --
// The overlap solver, lifted out of render.js#layoutDiagram so the globe
// overlay and the radial fallback share one implementation and cannot drift
// apart. Boxes are axis-aligned and positioned by their centre.

/**
 * Push boxes apart until they no longer overlap, then clamp them into bounds.
 *
 * @param {Array<{x:number,y:number,w:number,h:number}>} boxes mutated in place
 * @param {{width:number,height:number}} bounds
 * @param {{iterations?:number, gap?:number, pinned?:Array}} [opts]
 *        `pinned` boxes push others away but never move themselves, which is
 *        how the hero card holds its spot.
 */
export function separate(boxes, bounds, { iterations = 50, gap = 12, pinned = [] } = {}) {
  if (!boxes.length) return boxes;

  const pad = boxes.map((b) => ({ w: b.w + gap, h: b.h + gap }));
  const fixed = pinned.map((b) => ({ x: b.x, y: b.y, w: b.w + gap * 2, h: b.h + gap * 2 }));

  for (let iter = 0; iter < iterations; iter++) {
    let overlapped = false;

    // Push away from anything pinned.
    for (let i = 0; i < boxes.length; i++) {
      for (const f of fixed) {
        const dx = boxes[i].x - f.x;
        const dy = boxes[i].y - f.y;
        const reqX = (f.w + pad[i].w) / 2;
        const reqY = (f.h + pad[i].h) / 2;
        if (Math.abs(dx) < reqX && Math.abs(dy) < reqY) {
          overlapped = true;
          // Escape along whichever axis needs the smaller shove.
          if (reqX - Math.abs(dx) < reqY - Math.abs(dy)) {
            boxes[i].x += (reqX - Math.abs(dx) + 4) * (dx >= 0 ? 1 : -1);
          } else {
            boxes[i].y += (reqY - Math.abs(dy) + 4) * (dy >= 0 ? 1 : -1);
          }
        }
      }
    }

    // Push boxes apart from each other.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const dx = boxes[j].x - boxes[i].x;
        const dy = boxes[j].y - boxes[i].y;
        const overlapX = (pad[i].w + pad[j].w) / 2 - Math.abs(dx);
        const overlapY = (pad[i].h + pad[j].h) / 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          overlapped = true;
          if (overlapX < overlapY) {
            const push = (overlapX / 2 + 4) * (dx >= 0 ? 1 : -1);
            boxes[i].x -= push;
            boxes[j].x += push;
          } else {
            const push = (overlapY / 2 + 4) * (dy >= 0 ? 1 : -1);
            boxes[i].y -= push;
            boxes[j].y += push;
          }
        }
      }
    }

    for (let i = 0; i < boxes.length; i++) {
      boxes[i].x = Math.max(pad[i].w / 2, Math.min(bounds.width - pad[i].w / 2, boxes[i].x));
      boxes[i].y = Math.max(pad[i].h / 2, Math.min(bounds.height - pad[i].h / 2, boxes[i].y));
    }

    if (!overlapped) break;
  }

  return boxes;
}
