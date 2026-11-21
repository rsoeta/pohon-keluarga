import { jsPDF } from 'jspdf';
import { extractBirthYear, formatKodeUnik } from './format.js';

/** Membersihkan karakter non-Latin1 agar font standar PDF tidak rusak. */
function pdfText(value) {
  return String(value || '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateToWidth(doc, text, maxWidth) {
  const clean = pdfText(text);
  if (doc.getTextWidth(clean) <= maxWidth) return clean;
  let cut = clean;
  while (cut.length > 3 && doc.getTextWidth(`${cut}...`) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

/**
 * Membangun dokumen PDF vektor beresolusi penuh untuk cabang pohon aktif (3-4 generasi).
 */
export function buildTreePdfDoc(
  layout,
  { familyName = 'Pohon Keluarga', paper = 'a4', lang = 'id', generatedDate } = {}
) {
  const format = paper === 'a3' ? 'a3' : 'a4';
  const orientation = layout && layout.width >= layout.height ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const headerH = 20;
  const footerH = 12;

  const focusName = pdfText(layout?.focusPerson?.nama_lengkap || '-');
  const title = pdfText(familyName || 'Pohon Keluarga');
  const dateStr = generatedDate || new Date().toISOString().slice(0, 10);
  const subTitle =
    lang === 'en'
      ? `Branch: ${focusName} · ${layout?.maxGenerations || 4} Generations · Printed ${dateStr}`
      : `Cabang: ${focusName} · ${layout?.maxGenerations || 4} Generasi · Dicetak ${dateStr}`;

  // Header PDF
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(truncateToWidth(doc, title, pageW - margin * 2), margin, 8.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(truncateToWidth(doc, subTitle, pageW - margin * 2), margin, 14.2);

  if (!layout || !layout.nodes.length) {
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(11);
    doc.text(lang === 'en' ? 'No family data available.' : 'Belum ada data silsilah.', margin, 36);
    return doc;
  }

  const availW = pageW - margin * 2;
  const availH = pageH - headerH - footerH - 4;
  const scale = Math.min(availW / Math.max(layout.width, 1), availH / Math.max(layout.height, 1), 0.28);

  const drawW = layout.width * scale;
  const drawH = layout.height * scale;
  const offsetX = margin + (availW - drawW) / 2;
  const offsetY = headerH + (availH - drawH) / 2;

  const tx = (x) => offsetX + x * scale;
  const ty = (y) => offsetY + y * scale;

  // 1. Garis Keturunan (solid = Kandung, putus-putus amber = Anak Angkat)
  doc.setLineWidth(Math.max(0.25, 0.45 * (scale / 0.2)));
  for (const edge of layout.childEdges) {
    if (edge.isAngkat) {
      doc.setDrawColor(217, 119, 6);
      doc.setLineDashPattern([1.6, 1.2], 0);
    } else {
      doc.setDrawColor(100, 116, 139);
      doc.setLineDashPattern([], 0);
    }
    for (let i = 0; i < edge.points.length - 1; i++) {
      const [x1, y1] = edge.points[i];
      const [x2, y2] = edge.points[i + 1];
      doc.line(tx(x1), ty(y1), tx(x2), ty(y2));
    }
  }

  // 2. Garis Pernikahan
  for (const mEdge of layout.marriageEdges) {
    if (mEdge.status === 'Cerai') {
      doc.setDrawColor(225, 29, 72);
      doc.setLineDashPattern([1.2, 1.2], 0);
    } else if (mEdge.status === 'Wafat') {
      doc.setDrawColor(100, 116, 139);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setDrawColor(15, 118, 110);
      doc.setLineDashPattern([], 0);
    }
    for (let i = 0; i < mEdge.points.length - 1; i++) {
      const [x1, y1] = mEdge.points[i];
      const [x2, y2] = mEdge.points[i + 1];
      doc.line(tx(x1), ty(y1), tx(x2), ty(y2));
    }
  }
  doc.setLineDashPattern([], 0);

  // 3. Kartu Anggota
  const nameFontPt = Math.max(4.5, Math.min(8.5, 29 * scale));
  const metaFontPt = Math.max(3.8, Math.min(6.8, 22 * scale));

  for (const node of layout.nodes) {
    const x = tx(node.x);
    const y = ty(node.y);
    const w = node.width * scale;
    const h = node.height * scale;
    const p = node.person;

    // Warna latar kartu
    if (node.isFocus) {
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(15, 118, 110);
      doc.setLineWidth(0.5);
    } else if (!p.status_hidup) {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
    }
    doc.roundedRect(x, y, w, h, Math.min(2, w * 0.06), Math.min(2, h * 0.1), 'FD');

    // Strip aksen gender di kiri kartu
    if (p.jenis_kelamin === 'L') doc.setFillColor(13, 148, 136);
    else doc.setFillColor(225, 29, 72);
    doc.rect(x, y, Math.max(1, w * 0.03), h, 'F');

    const padX = x + Math.max(1.8, w * 0.065);
    const innerW = w - Math.max(2.6, w * 0.1);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(nameFontPt);
    doc.text(truncateToWidth(doc, p.nama_lengkap, innerW), padX, y + h * 0.34);

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(metaFontPt);
    const yr = extractBirthYear(p.tgl_lahir);
    const line2 = `${formatKodeUnik(p.kode_unik)}${yr ? ` · ${yr}` : ''}`;
    doc.text(truncateToWidth(doc, line2, innerW), padX, y + h * 0.58);

    const flags = [];
    if (!p.status_hidup) flags.push(lang === 'en' ? '(Deceased)' : '(Alm.)');
    if (p.status_anak === 'Angkat') flags.push(lang === 'en' ? '(Adopted)' : '(Anak Angkat)');
    if (node.marriageStatus && node.marriageStatus !== 'Aktif') flags.push(`[${node.marriageStatus}]`);
    if (flags.length) {
      doc.setTextColor(p.status_anak === 'Angkat' ? 180 : 100, p.status_anak === 'Angkat' ? 83 : 116, p.status_anak === 'Angkat' ? 9 : 139);
      doc.text(truncateToWidth(doc, flags.join(' '), innerW), padX, y + h * 0.82);
    }
  }

  // Footer legenda
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(margin, pageH - footerH, pageW - margin, pageH - footerH);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const legend =
    lang === 'en'
      ? 'Solid line: Biological · Dashed amber: Adopted child · Dashed rose: Divorced · www.altasim.studio-pasti.net'
      : 'Garis solid: Kandung · Garis putus amber: Anak Angkat · Garis putus merah: Cerai · www.altasim.studio-pasti.net';
  doc.text(truncateToWidth(doc, legend, pageW - margin * 2), margin, pageH - 5.5);

  return doc;
}

export function exportTreeToPdf(layout, options = {}) {
  const doc = buildTreePdfDoc(layout, options);
  const slug = String(layout?.focusPerson?.nama_lengkap || 'pohon')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'pohon';
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`pohon-keluarga-${slug}-${dateStr}.pdf`);
}
