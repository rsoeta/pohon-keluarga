/**
 * Nasab.gs — Algoritma graf kekerabatan (BFS + LCA), deteksi siklus nasab,
 * dukungan pernikahan ganda (poligami/menikah lagi), pernikahan antar-kerabat,
 * dan pelabelan eksplisit (Anak Angkat).
 */

var Nasab = (function () {
  function nodeDto_(a) {
    return {
      id_anggota: a.id_anggota,
      nama_lengkap: a.nama_lengkap,
      kode_unik: a.kode_unik || '',
      jenis_kelamin: a.jenis_kelamin,
      status_hidup: !!a.status_hidup,
      status_anak: a.status_anak || 'Kandung',
      foto_file_id: a.foto_file_id || ''
    };
  }

  /** Membangun map id -> anggota aktif (tidak terhapus). */
  function activeMap_(anggotaRows) {
    var byId = {};
    (anggotaRows || []).forEach(function (a) {
      if (a && !a.is_deleted && a.id_anggota) byId[a.id_anggota] = a;
    });
    return byId;
  }

  /**
   * Mengecek apakah candidateId merupakan keturunan dari ancestorId (BFS ke atas).
   * Tahan terhadap loop yang mungkin sudah ada di data mentah.
   */
  function isDescendant(anggotaRows, ancestorId, candidateId) {
    if (!ancestorId || !candidateId || ancestorId === candidateId) return false;
    var byId = activeMap_(anggotaRows);
    if (!byId[candidateId]) return false;

    var queue = [candidateId];
    var visited = {};
    visited[candidateId] = true;

    while (queue.length > 0) {
      var currId = queue.shift();
      var node = byId[currId];
      if (!node) continue;
      var parents = [node.id_ayah, node.id_ibu];
      for (var i = 0; i < parents.length; i++) {
        var pid = parents[i];
        if (!pid) continue;
        if (pid === ancestorId) return true;
        if (byId[pid] && !visited[pid]) {
          visited[pid] = true;
          queue.push(pid);
        }
      }
    }
    return false;
  }

  function statusOrder_(st) {
    if (st === 'Aktif') return 0;
    if (st === 'Wafat') return 1;
    return 2;
  }

  function buildGraph_(anggotaRows, pernikahanRows) {
    var byId = activeMap_(anggotaRows);
    var childrenByParent = {};
    var marriagesByPerson = {};

    Object.keys(byId).forEach(function (id) {
      childrenByParent[id] = [];
      marriagesByPerson[id] = [];
    });

    Object.keys(byId).forEach(function (id) {
      var a = byId[id];
      if (a.id_ayah && byId[a.id_ayah]) childrenByParent[a.id_ayah].push(a);
      if (a.id_ibu && byId[a.id_ibu] && a.id_ibu !== a.id_ayah) childrenByParent[a.id_ibu].push(a);
    });

    Object.keys(childrenByParent).forEach(function (pid) {
      childrenByParent[pid].sort(function (x, y) {
        var ax = x.status_anak === 'Angkat' ? 1 : 0;
        var ay = y.status_anak === 'Angkat' ? 1 : 0;
        if (ax !== ay) return ax - ay;
        var ux = x.urutan_anak || 999;
        var uy = y.urutan_anak || 999;
        if (ux !== uy) return ux - uy;
        return String(x.nama_lengkap || '').localeCompare(String(y.nama_lengkap || ''));
      });
    });

    (pernikahanRows || []).forEach(function (m) {
      if (!m || m.is_deleted) return;
      if (!byId[m.id_suami] || !byId[m.id_istri]) return;
      marriagesByPerson[m.id_suami].push({
        spouseId: m.id_istri,
        status_pernikahan: m.status_pernikahan || 'Aktif',
        urutan_pasangan: m.urutan_pasangan || 999,
        id_pernikahan: m.id_pernikahan
      });
      marriagesByPerson[m.id_istri].push({
        spouseId: m.id_suami,
        status_pernikahan: m.status_pernikahan || 'Aktif',
        urutan_pasangan: m.urutan_pasangan || 999,
        id_pernikahan: m.id_pernikahan
      });
    });

    Object.keys(marriagesByPerson).forEach(function (pid) {
      marriagesByPerson[pid].sort(function (x, y) {
        var sx = statusOrder_(x.status_pernikahan);
        var sy = statusOrder_(y.status_pernikahan);
        if (sx !== sy) return sx - sy;
        return (x.urutan_pasangan || 999) - (y.urutan_pasangan || 999);
      });
    });

    return {
      byId: byId,
      childrenByParent: childrenByParent,
      marriagesByPerson: marriagesByPerson
    };
  }

  function neighbors_(graph, id, includeSpouse) {
    var node = graph.byId[id];
    var list = [];
    if (!node) return list;

    if (node.id_ayah && graph.byId[node.id_ayah]) {
      list.push({
        to: node.id_ayah,
        dir: 'UP',
        role: 'FATHER',
        is_angkat: node.status_anak === 'Angkat',
        status_pernikahan: null
      });
    }
    if (node.id_ibu && graph.byId[node.id_ibu]) {
      list.push({
        to: node.id_ibu,
        dir: 'UP',
        role: 'MOTHER',
        is_angkat: node.status_anak === 'Angkat',
        status_pernikahan: null
      });
    }
    if (includeSpouse) {
      (graph.marriagesByPerson[id] || []).forEach(function (m) {
        list.push({
          to: m.spouseId,
          dir: 'SPOUSE',
          role: 'SPOUSE',
          is_angkat: false,
          status_pernikahan: m.status_pernikahan
        });
      });
    }
    (graph.childrenByParent[id] || []).forEach(function (c) {
      list.push({
        to: c.id_anggota,
        dir: 'DOWN',
        role: 'CHILD',
        is_angkat: c.status_anak === 'Angkat',
        status_pernikahan: null
      });
    });
    return list;
  }

  function bfsPath_(graph, fromId, toId, includeSpouse) {
    if (!graph.byId[fromId] || !graph.byId[toId]) return null;
    if (fromId === toId) return { nodeIds: [fromId], edges: [] };

    var queue = [fromId];
    var head = 0;
    var visited = {};
    var prev = {};
    visited[fromId] = true;

    while (head < queue.length) {
      var u = queue[head++];
      var adj = neighbors_(graph, u, includeSpouse);
      for (var i = 0; i < adj.length; i++) {
        var edge = adj[i];
        var v = edge.to;
        if (visited[v]) continue;
        visited[v] = true;
        prev[v] = { from: u, edge: edge };
        if (v === toId) {
          var edges = [];
          var nodeIds = [toId];
          var cur = toId;
          while (cur !== fromId) {
            var step = prev[cur];
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
          return { nodeIds: nodeIds, edges: edges };
        }
        queue.push(v);
      }
    }
    return null;
  }

  function edgeLabels_(edge, toNode) {
    var male = toNode && toNode.jenis_kelamin === 'L';
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

  function ordinalEn_(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /** Mengecek apakah daftar edge mengikuti pola murni UP^u diikuti DOWN^d. */
  function pureCounts_(edges) {
    var u = 0;
    var d = 0;
    var seenDown = false;
    for (var i = 0; i < edges.length; i++) {
      if (edges[i].dir === 'SPOUSE') return null;
      if (edges[i].dir === 'UP') {
        if (seenDown) return null;
        u++;
      } else if (edges[i].dir === 'DOWN') {
        seenDown = true;
        d++;
      }
    }
    return { u: u, d: d };
  }

  function classifyPure_(u, d, fromNode, toNode) {
    var m = toNode && toNode.jenis_kelamin === 'L';
    if (u === 0 && d === 0) return { label_id: 'Diri Sendiri', label_en: 'Self' };

    if (d === 0) {
      if (u === 1) return { label_id: m ? 'Ayah' : 'Ibu', label_en: m ? 'Father' : 'Mother' };
      if (u === 2) return { label_id: m ? 'Kakek' : 'Nenek', label_en: m ? 'Grandfather' : 'Grandmother' };
      if (u === 3) return { label_id: 'Buyut', label_en: m ? 'Great-Grandfather' : 'Great-Grandmother' };
      if (u === 4) return { label_id: 'Canggah', label_en: '2nd Great-Grandparent' };
      if (u === 5) return { label_id: 'Wareng', label_en: '3rd Great-Grandparent' };
      return { label_id: 'Leluhur (Gen +' + u + ')', label_en: 'Ancestor (Gen +' + u + ')' };
    }

    if (u === 0) {
      if (d === 1) return { label_id: 'Anak', label_en: m ? 'Son' : 'Daughter' };
      if (d === 2) return { label_id: 'Cucu', label_en: 'Grandchild' };
      if (d === 3) return { label_id: 'Cicit', label_en: 'Great-Grandchild' };
      if (d === 4) return { label_id: 'Piut', label_en: '2nd Great-Grandchild' };
      return { label_id: 'Keturunan (Gen -' + d + ')', label_en: 'Descendant (Gen -' + d + ')' };
    }

    if (u === 1 && d === 1) {
      var sameAyah = !!(fromNode.id_ayah && toNode.id_ayah && fromNode.id_ayah === toNode.id_ayah);
      var sameIbu = !!(fromNode.id_ibu && toNode.id_ibu && fromNode.id_ibu === toNode.id_ibu);
      if (sameAyah && sameIbu) return { label_id: 'Saudara Kandung', label_en: 'Sibling' };
      if (sameAyah) return { label_id: 'Saudara Seayah', label_en: 'Paternal Half-Sibling' };
      if (sameIbu) return { label_id: 'Saudara Seibu', label_en: 'Maternal Half-Sibling' };
      return { label_id: 'Saudara', label_en: 'Sibling' };
    }

    if (u === 2 && d === 1) return { label_id: m ? 'Paman' : 'Bibi', label_en: m ? 'Uncle' : 'Aunt' };
    if (u === 1 && d === 2) return { label_id: 'Keponakan', label_en: m ? 'Nephew' : 'Niece' };
    if (u === 2 && d === 2) return { label_id: 'Sepupu', label_en: '1st Cousin' };
    if (u === 3 && d === 1) return { label_id: m ? 'Kakek Paman' : 'Nenek Bibi', label_en: m ? 'Great-Uncle' : 'Great-Aunt' };
    if (u >= 4 && d === 1) return { label_id: 'Kerabat Leluhur (Gen +' + (u - 1) + ')', label_en: 'Ancestor Relative (Gen +' + (u - 1) + ')' };
    if (u === 1 && d === 3) return { label_id: 'Cucu Keponakan', label_en: m ? 'Grand-Nephew' : 'Grand-Niece' };
    if (u === 1 && d >= 4) return { label_id: 'Keturunan Saudara', label_en: "Sibling's Descendant" };

    var deg = Math.min(u, d) - 1;
    var rem = Math.abs(u - d);
    if (rem === 0) return { label_id: 'Sepupu ke-' + deg, label_en: ordinalEn_(deg) + ' Cousin' };
    if (u === 3 && d === 2) return { label_id: m ? 'Paman Sepupu' : 'Bibi Sepupu', label_en: '1st Cousin Once Removed (Up)' };
    if (u === 2 && d === 3) return { label_id: 'Keponakan Sepupu', label_en: '1st Cousin Once Removed (Down)' };
    var sign = u > d ? '+' : '-';
    return {
      label_id: 'Sepupu ke-' + deg + ' (Gen ' + sign + rem + ')',
      label_en: ordinalEn_(deg) + ' Cousin (' + sign + rem + ' Gen)'
    };
  }

  function classifySemenda_(edges, nodeIds, graph) {
    var sig = edges.map(function (e) { return e.dir; }).join(',');
    var fromNode = graph.byId[nodeIds[0]];
    var toNode = graph.byId[nodeIds[nodeIds.length - 1]];
    var m = toNode && toNode.jenis_kelamin === 'L';

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
      var tailCounts = pureCounts_(edges.slice(1));
      if (tailCounts) {
        var subTail = classifyPure_(tailCounts.u, tailCounts.d, graph.byId[nodeIds[1]], toNode);
        return { label_id: subTail.label_id + ' Pasangan', label_en: "Spouse's " + subTail.label_en };
      }
    }
    if (edges[edges.length - 1].dir === 'SPOUSE') {
      var headCounts = pureCounts_(edges.slice(0, edges.length - 1));
      if (headCounts) {
        var partnerNode = graph.byId[nodeIds[nodeIds.length - 2]];
        var subHead = classifyPure_(headCounts.u, headCounts.d, fromNode, partnerNode);
        return {
          label_id: (m ? 'Suami ' : 'Istri ') + subHead.label_id,
          label_en: (m ? 'Husband of ' : 'Wife of ') + subHead.label_en
        };
      }
    }
    return {
      label_id: 'Kerabat Semenda (' + edges.length + ' langkah)',
      label_en: 'Relative by Marriage (' + edges.length + ' steps)'
    };
  }

  function classifyPath_(edges, nodeIds, graph) {
    var hasSpouse = edges.some(function (e) { return e.dir === 'SPOUSE'; });
    var hasAngkat = edges.some(function (e) { return !!e.is_angkat; });
    var fromNode = graph.byId[nodeIds[0]];
    var toNode = graph.byId[nodeIds[nodeIds.length - 1]];
    var lcaId = null;
    var lbl;

    if (!hasSpouse) {
      var counts = pureCounts_(edges);
      if (counts) {
        lcaId = nodeIds[counts.u] || null;
        lbl = classifyPure_(counts.u, counts.d, fromNode, toNode);
      } else if (edges.length === 2 && edges[0].dir === 'DOWN' && edges[1].dir === 'UP') {
        lbl = { label_id: 'Orang Tua Anak Bersama', label_en: 'Co-Parent' };
      } else {
        lbl = {
          label_id: 'Kerabat (' + edges.length + ' langkah)',
          label_en: 'Relative (' + edges.length + ' steps)'
        };
      }
    } else {
      lbl = classifySemenda_(edges, nodeIds, graph);
    }

    var labelId = lbl.label_id;
    var labelEn = lbl.label_en;
    if (hasAngkat) {
      if (labelId.indexOf('(Anak Angkat)') === -1) labelId += ' (Anak Angkat)';
      if (labelEn.indexOf('(Adopted)') === -1) labelEn += ' (Adopted)';
    }

    return {
      label_id: labelId,
      label_en: labelEn,
      has_angkat: hasAngkat,
      is_semenda: hasSpouse,
      lca_id: lcaId
    };
  }

  /**
   * Mencari hubungan kekerabatan terpendek antara fromId dan toId via BFS.
   */
  function findRelationship(anggotaRows, pernikahanRows, fromId, toId) {
    var graph = buildGraph_(anggotaRows, pernikahanRows);
    var fromNode = graph.byId[fromId];
    var toNode = graph.byId[toId];
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
        nodes: [nodeDto_(fromNode)],
        edges: []
      };
    }

    var path = bfsPath_(graph, fromId, toId, true);
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
        nodes: [nodeDto_(fromNode), nodeDto_(toNode)],
        edges: []
      };
    }

    var info = classifyPath_(path.edges, path.nodeIds, graph);
    var edgesOut = path.edges.map(function (e) {
      var lbl = edgeLabels_(e, graph.byId[e.to]);
      return {
        from: e.from,
        to: e.to,
        dir: e.dir,
        role: e.role,
        is_angkat: !!e.is_angkat,
        status_pernikahan: e.status_pernikahan || null,
        label_id: lbl.label_id,
        label_en: lbl.label_en
      };
    });

    // Pernikahan antar-kerabat: jika jalur terpendek melewati SPOUSE, cek pula jalur nasab murni.
    var alsoBlood = null;
    if (info.is_semenda) {
      var bloodPath = bfsPath_(graph, fromId, toId, false);
      if (bloodPath) {
        var bInfo = classifyPath_(bloodPath.edges, bloodPath.nodeIds, graph);
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
      nodes: path.nodeIds.map(function (id) { return nodeDto_(graph.byId[id]); }),
      edges: edgesOut
    };
  }

  return {
    isDescendant: isDescendant,
    findRelationship: findRelationship
  };
})();

/** Handler endpoint `nasab.hubungan`: { from_id?, to_id } */
function Nasab_hubungan_(ctx, p) {
  var fromId = p.from_id ? String(p.from_id) : (ctx.user.id_anggota || '');
  var toId = String(p.to_id || '');
  var errors = [];
  if (!isUuid_(fromId)) errors.push({ field: 'from_id', rule: 'uuid' });
  if (!isUuid_(toId)) errors.push({ field: 'to_id', rule: 'uuid' });
  if (errors.length) throw ERR.validation(errors);

  var idx = loadIndex_();
  var from = idx.anggotaById[fromId];
  var to = idx.anggotaById[toId];
  if (!from || from.is_deleted || !to || to.is_deleted) throw ERR.notFound();

  return Nasab.findRelationship(idx.anggota, idx.pernikahan, fromId, toId);
}
