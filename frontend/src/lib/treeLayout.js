/**
 * Tata letak deterministik Pohon Keluarga (Mendatar/Horizontal & Menurun/Vertical).
 * Mendukung:
 *  - Pernikahan ganda (poligami / menikah lagi)
 *  - Anak kandung & anak angkat (isAngkat)
 *  - Pernikahan antar-kerabat & anti-looping (isDuplicateRef)
 *  - Kedalaman 3 hingga 7 generasi
 */

export const TREE_METRICS = Object.freeze({
  CARD_W: 196,
  CARD_H: 104,
  SPOUSE_GAP: 26,
  SIBLING_GAP: 24,
  MARRIAGE_GROUP_GAP: 34,
  GEN_GAP: 66,
  PAD: 36
});

export const MAX_TREE_GENERATIONS = 7;
export const TREE_GENERATION_OPTIONS = Object.freeze([3, 4, 5, 6, 7]);

function marriageStatusRank(st) {
  if (st === 'Aktif') return 0;
  if (st === 'Wafat') return 1;
  return 2;
}

function buildActiveMaps(anggotaList, pernikahanList) {
  const byId = new Map();
  for (const a of anggotaList || []) {
    if (a && !a.is_deleted && a.id_anggota) byId.set(a.id_anggota, a);
  }

  const activeMarriages = [];
  const marriagesByPerson = new Map();
  for (const id of byId.keys()) marriagesByPerson.set(id, []);

  for (const m of pernikahanList || []) {
    if (!m || m.is_deleted) continue;
    if (!byId.has(m.id_suami) || !byId.has(m.id_istri)) continue;
    activeMarriages.push(m);
    marriagesByPerson.get(m.id_suami).push({ marriage: m, partner: byId.get(m.id_istri) });
    marriagesByPerson.get(m.id_istri).push({ marriage: m, partner: byId.get(m.id_suami) });
  }

  for (const list of marriagesByPerson.values()) {
    list.sort((a, b) => {
      const ua = Number(a.marriage.urutan_pasangan || 999);
      const ub = Number(b.marriage.urutan_pasangan || 999);
      if (ua !== ub) return ua - ub;
      return marriageStatusRank(a.marriage.status_pernikahan) - marriageStatusRank(b.marriage.status_pernikahan);
    });
  }

  const childrenByParent = new Map();
  for (const id of byId.keys()) childrenByParent.set(id, []);
  for (const a of byId.values()) {
    if (a.id_ayah && byId.has(a.id_ayah)) childrenByParent.get(a.id_ayah).push(a);
    if (a.id_ibu && byId.has(a.id_ibu) && a.id_ibu !== a.id_ayah) childrenByParent.get(a.id_ibu).push(a);
  }

  return { byId, activeMarriages, marriagesByPerson, childrenByParent };
}

/** Memilih fokus pohon bawaan sesuai prioritas PRD. */
export function pickDefaultFocusId(anggotaList, pernikahanList, user, pengaturan) {
  const { byId, childrenByParent } = buildActiveMaps(anggotaList, pernikahanList);
  if (!byId.size) return '';

  const rootSetting = pengaturan?.id_leluhur_utama;
  if (rootSetting && byId.has(rootSetting)) return rootSetting;

  if (user?.id_anggota && byId.has(user.id_anggota)) return user.id_anggota;

  // Leluhur teratas tanpa orang tua dengan keturunan terbanyak
  const roots = [...byId.values()].filter(
    (a) => (!a.id_ayah || !byId.has(a.id_ayah)) && (!a.id_ibu || !byId.has(a.id_ibu))
  );
  if (roots.length) {
    roots.sort((a, b) => {
      const ca = (childrenByParent.get(a.id_anggota) || []).length;
      const cb = (childrenByParent.get(b.id_anggota) || []).length;
      if (cb !== ca) return cb - ca;
      return String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''));
    });
    return roots[0].id_anggota;
  }

  return [...byId.keys()][0];
}

function sortChildren(list) {
  return list.slice().sort((a, b) => {
    const ua = Number(a.urutan_anak || 999);
    const ub = Number(b.urutan_anak || 999);
    if (ua !== ub) return ua - ub;
    return String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''));
  });
}

/** Membangun pohon Family Unit hingga batas `maxGenerations` dengan deteksi duplikat/siklus. */
function buildUnitTree(personId, depth, maxGenerations, maps, visited) {
  const person = maps.byId.get(personId);
  if (!person) return null;

  if (visited.has(personId)) {
    return {
      person,
      depth,
      isDuplicateRef: true,
      spouses: [],
      childGroups: []
    };
  }
  visited.add(personId);

  const rawMarriages = maps.marriagesByPerson.get(personId) || [];
  const spouses = rawMarriages.map((entry) => {
    const pid = entry.partner.id_anggota;
    const isDuplicateRef = visited.has(pid);
    if (!isDuplicateRef) visited.add(pid);
    return {
      marriage: entry.marriage,
      partner: entry.partner,
      isDuplicateRef
    };
  });

  const childGroups = [];
  if (depth + 1 < maxGenerations) {
    const allKids = maps.childrenByParent.get(personId) || [];
    const claimed = new Set();

    // Kelompokkan anak per pernikahan (mendukung poligami / menikah lagi)
    spouses.forEach((sp, spIndex) => {
      const pid = sp.partner.id_anggota;
      const mId = sp.marriage.id_pernikahan;
      const kids = sortChildren(
        allKids.filter((c) => {
          if (claimed.has(c.id_anggota)) return false;
          if (c.id_pernikahan_ortu) return c.id_pernikahan_ortu === mId;
          return (
            (c.id_ayah === personId && c.id_ibu === pid) ||
            (c.id_ibu === personId && c.id_ayah === pid)
          );
        })
      );
      kids.forEach((c) => claimed.add(c.id_anggota));
      if (kids.length) {
        childGroups.push({
          marriageIndex: spIndex,
          marriage: sp.marriage,
          children: kids
            .map((c) => buildUnitTree(c.id_anggota, depth + 1, maxGenerations, maps, visited))
            .filter(Boolean)
        });
      }
    });

    // Anak tanpa pasangan pernikahan tercatat
    const remaining = sortChildren(allKids.filter((c) => !claimed.has(c.id_anggota)));
    if (remaining.length) {
      childGroups.push({
        marriageIndex: -1,
        marriage: null,
        children: remaining
          .map((c) => buildUnitTree(c.id_anggota, depth + 1, maxGenerations, maps, visited))
          .filter(Boolean)
      });
    }
  }

  return {
    person,
    depth,
    isDuplicateRef: false,
    spouses,
    childGroups
  };
}

function measureUnit(unit, orientation) {
  const { CARD_W, CARD_H, SPOUSE_GAP, SIBLING_GAP, MARRIAGE_GROUP_GAP, GEN_GAP } = TREE_METRICS;
  const selfCount = 1 + unit.spouses.length;

  if (orientation === 'horizontal') {
    const selfW = CARD_W;
    const selfH = selfCount * CARD_H + (selfCount - 1) * SPOUSE_GAP;

    let childrenH = 0;
    let maxChildW = 0;
    unit.childGroups.forEach((grp, gIdx) => {
      if (gIdx > 0 && grp.children.length > 0) childrenH += MARRIAGE_GROUP_GAP;
      grp.children.forEach((child, cIdx) => {
        measureUnit(child, orientation);
        if (cIdx > 0) childrenH += SIBLING_GAP;
        childrenH += child._h;
        maxChildW = Math.max(maxChildW, child._w);
      });
    });

    unit._selfW = selfW;
    unit._selfH = selfH;
    unit._childrenH = childrenH;
    unit._w = maxChildW > 0 ? selfW + GEN_GAP + maxChildW : selfW;
    unit._h = Math.max(selfH, childrenH);
    return unit;
  }

  // Vertical (Menurun)
  const selfW = selfCount * CARD_W + (selfCount - 1) * SPOUSE_GAP;
  const selfH = CARD_H;

  let childrenW = 0;
  let maxChildH = 0;
  unit.childGroups.forEach((grp, gIdx) => {
    if (gIdx > 0 && grp.children.length > 0) childrenW += MARRIAGE_GROUP_GAP;
    grp.children.forEach((child, cIdx) => {
      measureUnit(child, orientation);
      if (cIdx > 0) childrenW += SIBLING_GAP;
      childrenW += child._w;
      maxChildH = Math.max(maxChildH, child._h);
    });
  });

  unit._selfW = selfW;
  unit._selfH = selfH;
  unit._childrenW = childrenW;
  unit._w = Math.max(selfW, childrenW);
  unit._h = maxChildH > 0 ? selfH + GEN_GAP + maxChildH : selfH;
  return unit;
}

function pointsToPath(pts) {
  if (!pts.length) return '';
  return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
}

function placeUnit(unit, originX, originY, orientation, focusId, out) {
  const { CARD_W, CARD_H, SPOUSE_GAP, SIBLING_GAP, MARRIAGE_GROUP_GAP, GEN_GAP } = TREE_METRICS;
  const pid = unit.person.id_anggota;

  if (orientation === 'horizontal') {
    const selfX = originX;
    const selfStartY = originY + (unit._h - unit._selfH) / 2;

    const pNode = {
      key: `${pid}__${unit.depth}__self`,
      id_anggota: pid,
      person: unit.person,
      x: selfX,
      y: selfStartY,
      width: CARD_W,
      height: CARD_H,
      generation: unit.depth,
      isFocus: pid === focusId && !unit.isDuplicateRef,
      isDuplicateRef: unit.isDuplicateRef,
      roleInUnit: 'PRIMARY',
      marriageStatus: null
    };
    out.nodes.push(pNode);

    const anchors = new Map();
    anchors.set(-1, [selfX + CARD_W, selfStartY + CARD_H / 2]);

    unit.spouses.forEach((sp, spIdx) => {
      const sy = selfStartY + (spIdx + 1) * (CARD_H + SPOUSE_GAP);
      const sNode = {
        key: `${sp.partner.id_anggota}__${unit.depth}__sp_${spIdx}`,
        id_anggota: sp.partner.id_anggota,
        person: sp.partner,
        x: selfX,
        y: sy,
        width: CARD_W,
        height: CARD_H,
        generation: unit.depth,
        isFocus: false,
        isDuplicateRef: sp.isDuplicateRef,
        roleInUnit: 'SPOUSE',
        marriageStatus: sp.marriage.status_pernikahan,
        marriageId: sp.marriage.id_pernikahan
      };
      out.nodes.push(sNode);

      let mPts;
      let labelX;
      let labelY;
      if (spIdx === 0) {
        const cx = selfX + CARD_W / 2;
        mPts = [
          [cx, selfStartY + CARD_H],
          [cx, sy]
        ];
        labelX = cx;
        labelY = selfStartY + CARD_H + SPOUSE_GAP / 2;
        anchors.set(0, [selfX + CARD_W, labelY]);
      } else {
        const archX = selfX - 14 - (spIdx - 1) * 7;
        mPts = [
          [selfX, selfStartY + CARD_H / 2],
          [archX, selfStartY + CARD_H / 2],
          [archX, sy + CARD_H / 2],
          [selfX, sy + CARD_H / 2]
        ];
        labelX = archX;
        labelY = (selfStartY + sy + CARD_H) / 2;
        anchors.set(spIdx, [selfX + CARD_W, sy + CARD_H / 2]);
      }

      out.marriageEdges.push({
        id: sp.marriage.id_pernikahan,
        status: sp.marriage.status_pernikahan,
        points: mPts,
        path: pointsToPath(mPts),
        labelX,
        labelY
      });
    });

    const childX = originX + CARD_W + GEN_GAP;
    let curY = originY + (unit._h - unit._childrenH) / 2;
    unit.childGroups.forEach((grp, gIdx) => {
      if (gIdx > 0 && grp.children.length > 0) curY += MARRIAGE_GROUP_GAP;
      const anchor = anchors.get(grp.marriageIndex) || anchors.get(-1);
      const midX = originX + CARD_W + GEN_GAP * 0.48 + (gIdx % 3) * 6;

      grp.children.forEach((child, cIdx) => {
        if (cIdx > 0) curY += SIBLING_GAP;
        const cNode = placeUnit(child, childX, curY, orientation, focusId, out);
        const pts = [
          anchor,
          [midX, anchor[1]],
          [midX, cNode.y + CARD_H / 2],
          [cNode.x, cNode.y + CARD_H / 2]
        ];
        out.childEdges.push({
          id: `${pid}__${cNode.id_anggota}__${gIdx}_${cIdx}`,
          parentId: pid,
          childId: cNode.id_anggota,
          isAngkat: child.person.status_anak === 'Angkat',
          points: pts,
          path: pointsToPath(pts)
        });
        curY += child._h;
      });
    });

    return pNode;
  }

  // Vertical (Menurun)
  const selfStartX = originX + (unit._w - unit._selfW) / 2;
  const selfY = originY;

  const pNode = {
    key: `${pid}__${unit.depth}__self`,
    id_anggota: pid,
    person: unit.person,
    x: selfStartX,
    y: selfY,
    width: CARD_W,
    height: CARD_H,
    generation: unit.depth,
    isFocus: pid === focusId && !unit.isDuplicateRef,
    isDuplicateRef: unit.isDuplicateRef,
    roleInUnit: 'PRIMARY',
    marriageStatus: null
  };
  out.nodes.push(pNode);

  const anchors = new Map();
  anchors.set(-1, [selfStartX + CARD_W / 2, selfY + CARD_H]);

  unit.spouses.forEach((sp, spIdx) => {
    const sx = selfStartX + (spIdx + 1) * (CARD_W + SPOUSE_GAP);
    const sNode = {
      key: `${sp.partner.id_anggota}__${unit.depth}__sp_${spIdx}`,
      id_anggota: sp.partner.id_anggota,
      person: sp.partner,
      x: sx,
      y: selfY,
      width: CARD_W,
      height: CARD_H,
      generation: unit.depth,
      isFocus: false,
      isDuplicateRef: sp.isDuplicateRef,
      roleInUnit: 'SPOUSE',
      marriageStatus: sp.marriage.status_pernikahan,
      marriageId: sp.marriage.id_pernikahan
    };
    out.nodes.push(sNode);

    let mPts;
    let labelX;
    let labelY;
    if (spIdx === 0) {
      const cy = selfY + CARD_H / 2;
      mPts = [
        [selfStartX + CARD_W, cy],
        [sx, cy]
      ];
      labelX = selfStartX + CARD_W + SPOUSE_GAP / 2;
      labelY = cy;
      anchors.set(0, [labelX, selfY + CARD_H]);
    } else {
      const archY = selfY - 14 - (spIdx - 1) * 7;
      mPts = [
        [selfStartX + CARD_W / 2, selfY],
        [selfStartX + CARD_W / 2, archY],
        [sx + CARD_W / 2, archY],
        [sx + CARD_W / 2, selfY]
      ];
      labelX = (selfStartX + sx + CARD_W) / 2;
      labelY = archY;
      anchors.set(spIdx, [sx + CARD_W / 2, selfY + CARD_H]);
    }

    out.marriageEdges.push({
      id: sp.marriage.id_pernikahan,
      status: sp.marriage.status_pernikahan,
      points: mPts,
      path: pointsToPath(mPts),
      labelX,
      labelY
    });
  });

  const childY = originY + CARD_H + GEN_GAP;
  let curX = originX + (unit._w - unit._childrenW) / 2;
  unit.childGroups.forEach((grp, gIdx) => {
    if (gIdx > 0 && grp.children.length > 0) curX += MARRIAGE_GROUP_GAP;
    const anchor = anchors.get(grp.marriageIndex) || anchors.get(-1);
    const midY = originY + CARD_H + GEN_GAP * 0.48 + (gIdx % 3) * 6;

    grp.children.forEach((child, cIdx) => {
      if (cIdx > 0) curX += SIBLING_GAP;
      const cNode = placeUnit(child, curX, childY, orientation, focusId, out);
      const pts = [
        anchor,
        [anchor[0], midY],
        [cNode.x + CARD_W / 2, midY],
        [cNode.x + CARD_W / 2, cNode.y]
      ];
      out.childEdges.push({
        id: `${pid}__${cNode.id_anggota}__${gIdx}_${cIdx}`,
        parentId: pid,
        childId: cNode.id_anggota,
        isAngkat: child.person.status_anak === 'Angkat',
        points: pts,
        path: pointsToPath(pts)
      });
      curX += child._w;
    });
  });

  return pNode;
}

export function computeTreeLayout(
  anggotaList,
  pernikahanList,
  { focusId, orientation = 'vertical', maxGenerations = 4 } = {}
) {
  const maps = buildActiveMaps(anggotaList, pernikahanList);
  const gens = Math.max(1, Math.min(MAX_TREE_GENERATIONS, Number(maxGenerations) || 4));
  const orient = orientation === 'horizontal' ? 'horizontal' : 'vertical';

  const resolvedFocusId = focusId && maps.byId.has(focusId) ? focusId : '';
  if (!resolvedFocusId) {
    return {
      width: 0,
      height: 0,
      orientation: orient,
      maxGenerations: gens,
      focusId: '',
      focusPerson: null,
      parentsOfFocus: { ayah: null, ibu: null },
      nodes: [],
      marriageEdges: [],
      childEdges: [],
      totalNodes: 0
    };
  }

  const visited = new Set();
  const rootUnit = buildUnitTree(resolvedFocusId, 0, gens, maps, visited);
  measureUnit(rootUnit, orient);

  const out = { nodes: [], marriageEdges: [], childEdges: [] };
  const padTop = TREE_METRICS.PAD + (orient === 'vertical' && rootUnit.spouses.length > 1 ? 22 : 0);
  const padLeft = TREE_METRICS.PAD + (orient === 'horizontal' && rootUnit.spouses.length > 1 ? 22 : 0);
  placeUnit(rootUnit, padLeft, padTop, orient, resolvedFocusId, out);

  const focusPerson = maps.byId.get(resolvedFocusId);
  const ayah = focusPerson.id_ayah ? maps.byId.get(focusPerson.id_ayah) || null : null;
  const ibu = focusPerson.id_ibu ? maps.byId.get(focusPerson.id_ibu) || null : null;

  return {
    width: Math.ceil(padLeft + rootUnit._w + TREE_METRICS.PAD),
    height: Math.ceil(padTop + rootUnit._h + TREE_METRICS.PAD),
    orientation: orient,
    maxGenerations: gens,
    focusId: resolvedFocusId,
    focusPerson,
    parentsOfFocus: { ayah, ibu },
    nodes: out.nodes,
    marriageEdges: out.marriageEdges,
    childEdges: out.childEdges,
    totalNodes: out.nodes.length
  };
}
