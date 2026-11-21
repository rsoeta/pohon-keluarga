/**
 * Kalkulator hubungan kekerabatan sisi klien (BFS + LCA).
 * Cerminan identik dari `backend-gas/Nasab.gs` agar berjalan instan & offline
 * menggunakan cache Dexie.js.
 */

function nodeDto(a) {
  return {
    id_anggota: a.id_anggota,
    nama_lengkap: a.nama_lengkap,
    kode_unik: a.kode_unik || '',
    jenis_kelamin: a.jenis_kelamin,
    status_hidup: a.status_hidup !== false,
    status_anak: a.status_anak || 'Kandung',
    foto_file_id: a.foto_file_id || ''
  };
}

function statusOrder(st) {
  if (st === 'Aktif') return 0;
  if (st === 'Wafat') return 1;
  return 2;
}

function buildGraph(anggotaRows, pernikahanRows) {
  const byId = new Map();
  for (const a of anggotaRows || []) {
    if (a && !a.is_deleted && a.id_anggota) byId.set(a.id_anggota, a);
  }

  const childrenByParent = new Map();
  const marriagesByPerson = new Map();
  for (const id of byId.keys()) {
    childrenByParent.set(id, []);
    marriagesByPerson.set(id, []);
  }

  for (const a of byId.values()) {
    if (a.id_ayah && byId.has(a.id_ayah)) childrenByParent.get(a.id_ayah).push(a);
    if (a.id_ibu && byId.has(a.id_ibu) && a.id_ibu !== a.id_ayah) {
      childrenByParent.get(a.id_ibu).push(a);
    }
  }

  for (const list of childrenByParent.values()) {
    list.sort((x, y) => {
      const ax = x.status_anak === 'Angkat' ? 1 : 0;
      const ay = y.status_anak === 'Angkat' ? 1 : 0;
      if (ax !== ay) return ax - ay;
      const ux = x.urutan_anak || 999;
      const uy = y.urutan_anak || 999;
      if (ux !== uy) return ux - uy;
      return String(x.nama_lengkap || '').localeCompare(String(y.nama_lengkap || ''));
    });
  }

  for (const m of pernikahanRows || []) {
    if (!m || m.is_deleted) continue;
    if (!byId.has(m.id_suami) || !byId.has(m.id_istri)) continue;
    marriagesByPerson.get(m.id_suami).push({
      spouseId: m.id_istri,
      status_pernikahan: m.status_pernikahan || 'Aktif',
      urutan_pasangan: m.urutan_pasangan || 999,
      id_pernikahan: m.id_pernikahan
    });
    marriagesByPerson.get(m.id_istri).push({
      spouseId: m.id_suami,
      status_pernikahan: m.status_pernikahan || 'Aktif',
      urutan_pasangan: m.urutan_pasangan || 999,
      id_pernikahan: m.id_pernikahan
    });
  }

  for (const list of marriagesByPerson.values()) {
    list.sort((x, y) => {
      const sx = statusOrder(x.status_pernikahan);
      const sy = statusOrder(y.status_pernikahan);
      if (sx !== sy) return sx - sy;
      return (x.urutan_pasangan || 999) - (y.urutan_pasangan || 999);
    });
  }

  return { byId, childrenByParent, marriagesByPerson };
}

function neighbors(graph, id, includeSpouse) {
  const node = graph.byId.get(id);
  const list = [];
  if (!node) return list;

  // Urutan prioritas identik dengan Nasab.gs: UP -> SPOUSE -> DOWN
  if (node.id_ayah && graph.byId.has(node.id_ayah)) {
    list.push({
      to: node.id_ayah,
      dir: 'UP',
      role: 'FATHER',
      is_angkat: node.status_anak === 'Angkat',
      status_pernikahan: null
    });
  }
  if (node.id_ibu && graph.byId.has(node.id_ibu)) {
    list.push({
      to: node.id_ibu,
      dir: 'UP',
      role: 'MOTHER',
      is_angkat: node.status_anak === 'Angkat',
      status_pernikahan: null
    });
  }
  if (includeSpouse) {
    for (const m of graph.marriagesByPerson.get(id) || []) {
      list.push({
        to: m.spouseId,
        dir: 'SPOUSE',
        role: 'SPOUSE',
        is_angkat: false,
        status_pernikahan: m.status_pernikahan
      });
    }
  }
  for (const c of graph.childrenByParent.get(id) || []) {
    list.push({
      to: c.id_anggota,
      dir: 'DOWN',
      role: 'CHILD',
      is_angkat: c.status_anak === 'Angkat',
      status_pernikahan: null
    });
  }
  return list;
}

function bfsPath(graph, fromId, toId, includeSpouse) {
  if (!graph.byId.has(fromId) || !graph.byId.has(toId)) return null;
  if (fromId === toId) return { nodeIds: [fromId], edges: [] };

  const queue = [fromId];
  let head = 0;
  const visited = new Set([fromId]);
  const prev = new Map();

  while (head < queue.length) {
    const u = queue[head++];
    for (const edge of neighbors(graph, u, includeSpouse)) {
      const v = edge.to;
      if (visited.has(v)) continue;
      visited.add(v);
      prev.set(v, { from: u, edge });
      if (v === toId) {
        const edges = [];
        const nodeIds = [toId];
        let cur = toId;
        while (cur !== fromId) {
          const step = prev.get(cur);
          edges.unshift({
            from: step.from,
            to: cur,
            dir: step.edge.dir,
            role: step.edge.role,
            is_angkat: step.edge.is_angkat,
            status_pernikahan: step.edge.status_pernikahan
          });
          nodeIds.unshift(step.from);
          cur = step.from;
        }
        return { nodeIds, edges };
      }
      queue.push(v);
    }
  }
  return null;
}

function edgeLabels(edge, toNode) {
  const male = toNode && toNode.jenis_kelamin === 'L';
  if (edge.dir === 'UP') {
    if (edge.is_angkat) {
      return {
        label_id: male ? 'Ayah Angkat' : 'Ibu Angkat',
        label_en: male ? 'Adoptive Father' : 'Adoptive Mother'
      };
    }
    return {
      label_id: male ? 'Ayah' : 'Ibu',
      label_en: male ? 'Father' : 'Mother'
    };
  }
  if (edge.dir === 'DOWN') {
    if (edge.is_angkat) return { label_id: 'Anak Angkat', label_en: 'Adopted Child' };
    return {
      label_id: male ? 'Anak Laki-laki' : 'Anak Perempuan',
      label_en: male ? 'Son' : 'Daughter'
    };
  }
  if (edge.status_pernikahan === 'Cerai') {
    return {
      label_id: male ? 'Mantan Suami' : 'Mantan Istri',
      label_en: male ? 'Ex-Husband' : 'Ex-Wife'
    };
  }
  return {
    label_id: male ? 'Suami' : 'Istri',
    label_en: male ? 'Husband' : 'Wife'
  };
}

function ordinalEn(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pureCounts(edges) {
  let u = 0;
  let d = 0;
  let seenDown = false;
  for (const e of edges) {
    if (e.dir === 'SPOUSE') return null;
    if (e.dir === 'UP') {
      if (seenDown) return null;
      u++;
    } else if (e.dir === 'DOWN') {
      seenDown = true;
      d++;
    }
  }
  return { u, d };
}

function classifyPure(u, d, fromNode, toNode) {
  const m = toNode && toNode.jenis_kelamin === 'L';
  if (u === 0 && d === 0) return { label_id: 'Diri Sendiri', label_en: 'Self' };

  if (d === 0) {
    if (u === 1) return { label_id: m ? 'Ayah' : 'Ibu', label_en: m ? 'Father' : 'Mother' };
    if (u === 2) return { label_id: m ? 'Kakek' : 'Nenek', label_en: m ? 'Grandfather' : 'Grandmother' };
    if (u === 3) return { label_id: 'Buyut', label_en: m ? 'Great-Grandfather' : 'Great-Grandmother' };
    if (u === 4) return { label_id: 'Canggah', label_en: '2nd Great-Grandparent' };
    if (u === 5) return { label_id: 'Wareng', label_en: '3rd Great-Grandparent' };
    return { label_id: `Leluhur (Gen +${u})`, label_en: `Ancestor (Gen +${u})` };
  }

  if (u === 0) {
    if (d === 1) return { label_id: 'Anak', label_en: m ? 'Son' : 'Daughter' };
    if (d === 2) return { label_id: 'Cucu', label_en: 'Grandchild' };
    if (d === 3) return { label_id: 'Cicit', label_en: 'Great-Grandchild' };
    if (d === 4) return { label_id: 'Piut', label_en: '2nd Great-Grandchild' };
    return { label_id: `Keturunan (Gen -${d})`, label_en: `Descendant (Gen -${d})` };
  }

  if (u === 1 && d === 1) {
    const sameAyah = Boolean(fromNode.id_ayah && toNode.id_ayah && fromNode.id_ayah === toNode.id_ayah);
    const sameIbu = Boolean(fromNode.id_ibu && toNode.id_ibu && fromNode.id_ibu === toNode.id_ibu);
    if (sameAyah && sameIbu) return { label_id: 'Saudara Kandung', label_en: 'Sibling' };
    if (sameAyah) return { label_id: 'Saudara Seayah', label_en: 'Paternal Half-Sibling' };
    if (sameIbu) return { label_id: 'Saudara Seibu', label_en: 'Maternal Half-Sibling' };
    return { label_id: 'Saudara', label_en: 'Sibling' };
  }

  if (u === 2 && d === 1) return { label_id: m ? 'Paman' : 'Bibi', label_en: m ? 'Uncle' : 'Aunt' };
  if (u === 1 && d === 2) return { label_id: 'Keponakan', label_en: m ? 'Nephew' : 'Niece' };
  if (u === 2 && d === 2) return { label_id: 'Sepupu', label_en: '1st Cousin' };
  if (u === 3 && d === 1) return { label_id: m ? 'Kakek Paman' : 'Nenek Bibi', label_en: m ? 'Great-Uncle' : 'Great-Aunt' };
  if (u >= 4 && d === 1) return { label_id: `Kerabat Leluhur (Gen +${u - 1})`, label_en: `Ancestor Relative (Gen +${u - 1})` };
  if (u === 1 && d === 3) return { label_id: 'Cucu Keponakan', label_en: m ? 'Grand-Nephew' : 'Grand-Niece' };
  if (u === 1 && d >= 4) return { label_id: 'Keturunan Saudara', label_en: "Sibling's Descendant" };

  const deg = Math.min(u, d) - 1;
  const rem = Math.abs(u - d);
  if (rem === 0) return { label_id: `Sepupu ke-${deg}`, label_en: `${ordinalEn(deg)} Cousin` };
  if (u === 3 && d === 2) return { label_id: m ? 'Paman Sepupu' : 'Bibi Sepupu', label_en: '1st Cousin Once Removed (Up)' };
  if (u === 2 && d === 3) return { label_id: 'Keponakan Sepupu', label_en: '1st Cousin Once Removed (Down)' };
  const sign = u > d ? '+' : '-';
  return {
    label_id: `Sepupu ke-${deg} (Gen ${sign}${rem})`,
    label_en: `${ordinalEn(deg)} Cousin (${sign}${rem} Gen)`
  };
}

function classifySemenda(edges, nodeIds, graph) {
  const sig = edges.map((e) => e.dir).join(',');
  const fromNode = graph.byId.get(nodeIds[0]);
  const toNode = graph.byId.get(nodeIds[nodeIds.length - 1]);
  const m = toNode && toNode.jenis_kelamin === 'L';

  if (sig === 'SPOUSE') {
    if (edges[0].status_pernikahan === 'Cerai') {
      return { label_id: m ? 'Mantan Suami' : 'Mantan Istri', label_en: m ? 'Ex-Husband' : 'Ex-Wife' };
    }
    return { label_id: m ? 'Suami' : 'Istri', label_en: m ? 'Husband' : 'Wife' };
  }
  if (sig === 'SPOUSE,UP') return { label_id: m ? 'Ayah Mertua' : 'Ibu Mertua', label_en: m ? 'Father-in-Law' : 'Mother-in-Law' };
  if (sig === 'DOWN,SPOUSE') return { label_id: 'Menantu', label_en: m ? 'Son-in-Law' : 'Daughter-in-Law' };
  if (sig === 'SPOUSE,DOWN') return { label_id: 'Anak Tiri', label_en: m ? 'Stepson' : 'Stepdaughter' };
  if (sig === 'UP,SPOUSE') return { label_id: m ? 'Ayah Tiri' : 'Ibu Tiri', label_en: m ? 'Stepfather' : 'Stepmother' };
  if (sig === 'SPOUSE,UP,DOWN' || sig === 'UP,DOWN,SPOUSE') {
    return { label_id: 'Saudara Ipar', label_en: m ? 'Brother-in-Law' : 'Sister-in-Law' };
  }
  if (sig === 'DOWN,SPOUSE,UP') return { label_id: 'Besan', label_en: 'Co-Parent-in-Law' };
  if (sig === 'UP,UP,DOWN,SPOUSE' || sig === 'SPOUSE,UP,UP,DOWN') {
    return { label_id: m ? 'Paman (Ipar)' : 'Bibi (Ipar)', label_en: m ? 'Uncle by Marriage' : 'Aunt by Marriage' };
  }
  if (sig === 'SPOUSE,UP,UP') return { label_id: m ? 'Kakek Mertua' : 'Nenek Mertua', label_en: m ? 'Grandfather-in-Law' : 'Grandmother-in-Law' };
  if (sig === 'DOWN,DOWN,SPOUSE') return { label_id: 'Cucu Menantu', label_en: 'Grandchild-in-Law' };
  if (sig === 'SPOUSE,UP,DOWN,SPOUSE') return { label_id: 'Biras', label_en: 'Co-Sibling-in-Law' };

  if (edges[0].dir === 'SPOUSE') {
    const tailCounts = pureCounts(edges.slice(1));
    if (tailCounts) {
      const subTail = classifyPure(tailCounts.u, tailCounts.d, graph.byId.get(nodeIds[1]), toNode);
      return { label_id: `${subTail.label_id} Pasangan`, label_en: `Spouse's ${subTail.label_en}` };
    }
  }
  if (edges[edges.length - 1].dir === 'SPOUSE') {
    const headCounts = pureCounts(edges.slice(0, edges.length - 1));
    if (headCounts) {
      const partnerNode = graph.byId.get(nodeIds[nodeIds.length - 2]);
      const subHead = classifyPure(headCounts.u, headCounts.d, fromNode, partnerNode);
      return {
        label_id: `${m ? 'Suami ' : 'Istri '}${subHead.label_id}`,
        label_en: `${m ? 'Husband of ' : 'Wife of '}${subHead.label_en}`
      };
    }
  }

  return {
    label_id: `Kerabat Semenda (${edges.length} langkah)`,
    label_en: `Relative by Marriage (${edges.length} steps)`
  };
}

function classifyPath(edges, nodeIds, graph) {
  const hasSpouse = edges.some((e) => e.dir === 'SPOUSE');
  const hasAngkat = edges.some((e) => Boolean(e.is_angkat));
  const fromNode = graph.byId.get(nodeIds[0]);
  const toNode = graph.byId.get(nodeIds[nodeIds.length - 1]);
  let lcaId = null;
  let lbl;

  if (!hasSpouse) {
    const counts = pureCounts(edges);
    if (counts) {
      lcaId = nodeIds[counts.u] || null;
      lbl = classifyPure(counts.u, counts.d, fromNode, toNode);
    } else if (edges.length === 2 && edges[0].dir === 'DOWN' && edges[1].dir === 'UP') {
      lbl = { label_id: 'Orang Tua Anak Bersama', label_en: 'Co-Parent' };
    } else {
      lbl = {
        label_id: `Kerabat (${edges.length} langkah)`,
        label_en: `Relative (${edges.length} steps)`
      };
    }
  } else {
    lbl = classifySemenda(edges, nodeIds, graph);
  }

  let labelId = lbl.label_id;
  let labelEn = lbl.label_en;
  if (hasAngkat) {
    if (!labelId.includes('(Anak Angkat)')) labelId += ' (Anak Angkat)';
    if (!labelEn.includes('(Adopted)')) labelEn += ' (Adopted)';
  }

  return {
    label_id: labelId,
    label_en: labelEn,
    has_angkat: hasAngkat,
    is_semenda: hasSpouse,
    lca_id: lcaId
  };
}

export function findRelationshipLocal(anggotaList, pernikahanList, fromId, toId) {
  const graph = buildGraph(anggotaList, pernikahanList);
  const fromNode = graph.byId.get(fromId);
  const toNode = graph.byId.get(toId);
  if (!fromNode || !toNode) return null;

  if (fromId === toId) {
    return {
      found: true,
      from_id: fromId,
      to_id: toId,
      distance: 0,
      label_id: 'Diri Sendiri',
      label_en: 'Self',
      has_angkat: false,
      is_semenda: false,
      lca_id: fromId,
      also_blood: null,
      nodes: [nodeDto(fromNode)],
      edges: []
    };
  }

  const path = bfsPath(graph, fromId, toId, true);
  if (!path) {
    return {
      found: false,
      from_id: fromId,
      to_id: toId,
      distance: -1,
      label_id: 'Tidak Terhubung',
      label_en: 'Not Connected',
      has_angkat: false,
      is_semenda: false,
      lca_id: null,
      also_blood: null,
      nodes: [nodeDto(fromNode), nodeDto(toNode)],
      edges: []
    };
  }

  const info = classifyPath(path.edges, path.nodeIds, graph);
  const edgesOut = path.edges.map((e) => {
    const lbl = edgeLabels(e, graph.byId.get(e.to));
    return {
      from: e.from,
      to: e.to,
      dir: e.dir,
      role: e.role,
      is_angkat: Boolean(e.is_angkat),
      status_pernikahan: e.status_pernikahan || null,
      label_id: lbl.label_id,
      label_en: lbl.label_en
    };
  });

  let alsoBlood = null;
  if (info.is_semenda) {
    const bloodPath = bfsPath(graph, fromId, toId, false);
    if (bloodPath) {
      const bInfo = classifyPath(bloodPath.edges, bloodPath.nodeIds, graph);
      alsoBlood = {
        label_id: bInfo.label_id,
        label_en: bInfo.label_en,
        distance: bloodPath.edges.length,
        has_angkat: bInfo.has_angkat
      };
    }
  }

  return {
    found: true,
    from_id: fromId,
    to_id: toId,
    distance: edgesOut.length,
    label_id: info.label_id,
    label_en: info.label_en,
    has_angkat: info.has_angkat,
    is_semenda: info.is_semenda,
    lca_id: info.lca_id,
    also_blood: alsoBlood,
    nodes: path.nodeIds.map((id) => nodeDto(graph.byId.get(id))),
    edges: edgesOut
  };
}
