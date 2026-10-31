/**
 * script.js – Sales Dashboard Controller
 * ----------------------------------------
 * Alur kerja:
 *  1. Fetch data dari sales_data.json
 *  2. Populate filter dropdown dari data unik
 *  3. Render KPI & semua chart berdasarkan data terfilter
 *  4. Setiap perubahan filter → re-render semua komponen
 */

/* ============================================================
   KONSTANTA & REFERENSI DOM
   ============================================================ */

/** Palet warna konsisten untuk seluruh dashboard */
const PALETTE = {
  blue:    '#3b82f6',
  violet:  '#8b5cf6',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  sky:     '#0ea5e9',
  teal:    '#14b8a6',
  orange:  '#f97316',
  indigo:  '#6366f1',
  pink:    '#ec4899',
};

/** Urutan warna yang digunakan berurutan untuk multi-series */
const COLOR_SEQUENCE = Object.values(PALETTE);

/** Opsi Chart.js global (font, animasi, tooltip) */
Chart.defaults.font.family = '-apple-system, "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size   = 12;
Chart.defaults.animation   = { duration: 450, easing: 'easeInOutQuart' };
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15,23,42,0.88)';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.titleColor = '#f8fafc';
Chart.defaults.plugins.tooltip.bodyColor  = '#cbd5e1';

/* ============================================================
   STATE APLIKASI
   ============================================================ */

let rawData    = [];   // Data mentah dari JSON
let filtered   = [];   // Data setelah filter diterapkan
let chartRefs  = {};   // Referensi ke semua instance Chart.js

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

/**
 * Menghitung revenue satu transaksi (setelah diskon)
 * @param {Object} row – satu record dari JSON
 * @returns {number}
 */
const calcRevenue = row => row.quantity * row.unit_price * (1 - row.discount);

/**
 * Format angka ke Rupiah ringkas (misal: 1.2M, 450rb)
 * @param {number} val
 * @returns {string}
 */
function formatRupiah(val) {
  if (val >= 1_000_000_000) return 'Rp ' + (val / 1_000_000_000).toFixed(2) + 'M';
  if (val >= 1_000_000)     return 'Rp ' + (val / 1_000_000).toFixed(1) + 'jt';
  if (val >= 1_000)         return 'Rp ' + (val / 1_000).toFixed(0) + 'rb';
  return 'Rp ' + val.toFixed(0);
}

/**
 * Format angka ke Rupiah penuh untuk tooltip
 * @param {number} val
 * @returns {string}
 */
function formatRupiahFull(val) {
  return 'Rp ' + val.toLocaleString('id-ID');
}

/**
 * Mengelompokkan array berdasarkan key tertentu
 * dan menjumlahkan valueExtractor tiap grup
 * @param {Array} arr
 * @param {string|Function} keyFn – field atau fungsi pengambil key
 * @param {Function} valFn – fungsi pengambil value yang dijumlahkan
 * @returns {Object} { key: totalValue }
 */
function groupSum(arr, keyFn, valFn) {
  return arr.reduce((acc, row) => {
    const k = typeof keyFn === 'function' ? keyFn(row) : row[keyFn];
    acc[k] = (acc[k] || 0) + valFn(row);
    return acc;
  }, {});
}

/**
 * Mendapatkan nilai unik dari sebuah field di array data
 * @param {Array} arr
 * @param {string} field
 * @returns {string[]} sorted
 */
function uniqueValues(arr, field) {
  return [...new Set(arr.map(r => r[field]))].sort();
}

/**
 * Menghancurkan chart lama (jika ada) sebelum membuat yang baru
 * @param {string} id – key di chartRefs
 */
function destroyChart(id) {
  if (chartRefs[id]) {
    chartRefs[id].destroy();
    delete chartRefs[id];
  }
}

/* ============================================================
   DATA LOADING
   ============================================================ */

/**
 * Fetch data JSON dan mulai proses inisialisasi dashboard
 */
async function loadData() {
  try {
    const res  = await fetch('sales_data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawData  = await res.json();
    filtered = [...rawData];

    populateFilters();
    renderAll();

    // Tampilkan tanggal update
    document.getElementById('last-updated').textContent =
      'Data: ' + rawData.length + ' transaksi • Diperbarui: ' + new Date().toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
  } catch (err) {
    console.error('Gagal memuat data:', err);
    document.getElementById('last-updated').textContent = '⚠ Gagal memuat data';
  }
}

/* ============================================================
   FILTER LOGIC
   ============================================================ */

/**
 * Isi dropdown filter dengan nilai unik dari data
 */
function populateFilters() {
  const fields = {
    'filter-region':   'region',
    'filter-category': 'category',
    'filter-customer': 'customer_type',
    'filter-channel':  'channel',
  };

  for (const [elId, field] of Object.entries(fields)) {
    const sel = document.getElementById(elId);
    uniqueValues(rawData, field).forEach(val => {
      const opt  = document.createElement('option');
      opt.value  = val;
      opt.textContent = val;
      sel.appendChild(opt);
    });
    // Pasang event listener sekali saja
    sel.addEventListener('change', applyFilters);
  }

  document.getElementById('btn-reset').addEventListener('click', resetFilters);
}

/**
 * Terapkan semua filter aktif ke rawData → update filtered → re-render
 */
function applyFilters() {
  const region   = document.getElementById('filter-region').value;
  const category = document.getElementById('filter-category').value;
  const customer = document.getElementById('filter-customer').value;
  const channel  = document.getElementById('filter-channel').value;

  filtered = rawData.filter(row => {
    if (region   && row.region        !== region)   return false;
    if (category && row.category      !== category) return false;
    if (customer && row.customer_type !== customer) return false;
    if (channel  && row.channel       !== channel)  return false;
    return true;
  });

  renderActiveFilterTags({ region, category, customer, channel });
  renderAll();
}

/**
 * Reset semua dropdown ke nilai default
 */
function resetFilters() {
  ['filter-region','filter-category','filter-customer','filter-channel']
    .forEach(id => { document.getElementById(id).value = ''; });
  applyFilters();
}

/**
 * Tampilkan tag filter yang sedang aktif di bawah filter bar
 */
function renderActiveFilterTags({ region, category, customer, channel }) {
  const container = document.getElementById('active-filters');
  container.innerHTML = '';

  const active = [
    { label: 'Region',   value: region,   id: 'filter-region'   },
    { label: 'Kategori', value: category, id: 'filter-category' },
    { label: 'Tipe',     value: customer, id: 'filter-customer' },
    { label: 'Channel',  value: channel,  id: 'filter-channel'  },
  ].filter(f => f.value);

  active.forEach(f => {
    const tag = document.createElement('span');
    tag.className = 'filter-tag';
    tag.innerHTML =
      `<span>${f.label}: <strong>${f.value}</strong></span>` +
      `<button aria-label="Hapus filter ${f.label}" data-id="${f.id}">✕</button>`;
    tag.querySelector('button').addEventListener('click', e => {
      document.getElementById(e.target.dataset.id).value = '';
      applyFilters();
    });
    container.appendChild(tag);
  });
}

/* ============================================================
   KPI RENDERER
   ============================================================ */

/**
 * Hitung dan tampilkan 4 KPI Card dari data terfilter
 */
function renderKPI() {
  const totalRevenue = filtered.reduce((s, r) => s + calcRevenue(r), 0);
  const totalTx      = filtered.length;
  const totalQty     = filtered.reduce((s, r) => s + r.quantity, 0);
  const avgDiscount  = filtered.length
    ? filtered.reduce((s, r) => s + r.discount, 0) / filtered.length
    : 0;

  document.getElementById('kpi-revenue').textContent      = formatRupiah(totalRevenue);
  document.getElementById('kpi-transactions').textContent = totalTx.toLocaleString('id-ID');
  document.getElementById('kpi-quantity').textContent     = totalQty.toLocaleString('id-ID');
  document.getElementById('kpi-discount').textContent     = (avgDiscount * 100).toFixed(1) + '%';
}

/* ============================================================
   CHART RENDERERS
   ============================================================ */

/* ---- 1. Sales Trend (Line) ---- */
function renderTrend() {
  destroyChart('trend');

  // Ambil bulan unik dan urutkan
  const monthMap = {};
  filtered.forEach(row => {
    const m = row.date.slice(0, 7); // "YYYY-MM"
    monthMap[m] = (monthMap[m] || 0) + calcRevenue(row);
  });
  const months = Object.keys(monthMap).sort();
  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1).toLocaleString('id-ID', { month: 'short', year: '2-digit' });
  });

  const ctx = document.getElementById('chart-trend').getContext('2d');
  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, 'rgba(59,130,246,0.25)');
  grad.addColorStop(1, 'rgba(59,130,246,0)');

  chartRefs.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: months.map(m => monthMap[m]),
        fill: true,
        backgroundColor: grad,
        borderColor: PALETTE.blue,
        borderWidth: 2.5,
        pointBackgroundColor: PALETTE.blue,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            callback: v => formatRupiah(v),
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: { label: ctx => ' ' + formatRupiahFull(ctx.parsed.y) }
        }
      }
    }
  });
}

/* ---- 2. Revenue per Region (Bar) ---- */
function renderRegion() {
  destroyChart('region');
  const agg = groupSum(filtered, 'region', calcRevenue);
  const labels = Object.keys(agg).sort();

  chartRefs.region = new Chart(
    document.getElementById('chart-region').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: labels.map(l => agg[l]),
        backgroundColor: COLOR_SEQUENCE.slice(0, labels.length).map(c => c + 'cc'),
        borderColor:     COLOR_SEQUENCE.slice(0, labels.length),
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b' } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', callback: v => formatRupiah(v) }
        }
      },
      plugins: {
        tooltip: {
          callbacks: { label: ctx => ' ' + formatRupiahFull(ctx.parsed.y) }
        }
      }
    }
  });
}

/* ---- 3. Revenue per Category (Doughnut) ---- */
function renderCategory() {
  destroyChart('category');
  const agg = groupSum(filtered, 'category', calcRevenue);
  const labels = Object.keys(agg).sort();

  chartRefs.category = new Chart(
    document.getElementById('chart-category').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: labels.map(l => agg[l]),
        backgroundColor: COLOR_SEQUENCE.slice(0, labels.length).map(c => c + 'dd'),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#334155', boxWidth: 12, padding: 14, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + formatRupiahFull(ctx.parsed)
          }
        }
      }
    }
  });
}

/* ---- 4. Sales per Representative (Horizontal Bar) ---- */
function renderSalesRep() {
  destroyChart('salesrep');
  const agg = groupSum(filtered, 'sales_rep', calcRevenue);
  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);

  chartRefs.salesrep = new Chart(
    document.getElementById('chart-salesrep').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: PALETTE.violet + 'cc',
        borderColor: PALETTE.violet,
        borderWidth: 1.5,
        borderRadius: 5,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', callback: v => formatRupiah(v) }
        },
        y: { grid: { display: false }, ticks: { color: '#334155' } }
      },
      plugins: {
        tooltip: {
          callbacks: { label: ctx => ' ' + formatRupiahFull(ctx.parsed.x) }
        }
      }
    }
  });
}

/* ---- 5. Customer Type Distribution (Pie) ---- */
function renderCustomer() {
  destroyChart('customer');
  const agg = groupSum(filtered, 'customer_type', r => 1); // hitung frekuensi
  const labels = Object.keys(agg).sort();

  chartRefs.customer = new Chart(
    document.getElementById('chart-customer').getContext('2d'), {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: labels.map(l => agg[l]),
        backgroundColor: [PALETTE.blue + 'dd', PALETTE.emerald + 'dd'],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#334155', boxWidth: 12, padding: 16, font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} transaksi`
          }
        }
      }
    }
  });
}

/* ---- 6. Payment Method Usage (Bar) ---- */
function renderPayment() {
  destroyChart('payment');
  const agg = groupSum(filtered, 'payment_method', r => 1);
  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);

  chartRefs.payment = new Chart(
    document.getElementById('chart-payment').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah Transaksi',
        data: values,
        backgroundColor: COLOR_SEQUENCE.slice(0, labels.length).map(c => c + 'bb'),
        borderColor:     COLOR_SEQUENCE.slice(0, labels.length),
        borderWidth: 1.5,
        borderRadius: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', stepSize: 1 }
        }
      }
    }
  });
}

/* ---- 7. Sales Channel Distribution (Doughnut) ---- */
function renderChannel() {
  destroyChart('channel');
  const agg = groupSum(filtered, 'channel', r => 1);
  const labels = Object.keys(agg).sort();

  chartRefs.channel = new Chart(
    document.getElementById('chart-channel').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: labels.map(l => agg[l]),
        backgroundColor: [PALETTE.sky + 'dd', PALETTE.orange + 'dd'],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#334155', boxWidth: 12, padding: 16, font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} transaksi`
          }
        }
      }
    }
  });
}

/* ---- 8. Discount vs Sales Scatter Plot ---- */
function renderScatter() {
  destroyChart('scatter');

  // Siapkan data scatter: x = diskon (%), y = revenue per transaksi
  const points = filtered.map(row => ({
    x: +(row.discount * 100).toFixed(0),
    y: +calcRevenue(row).toFixed(0),
    label: row.product,
  }));

  chartRefs.scatter = new Chart(
    document.getElementById('chart-scatter').getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Transaksi',
        data: points,
        backgroundColor: PALETTE.rose + '99',
        borderColor:     PALETTE.rose,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => [
              ` Produk: ${ctx.raw.label}`,
              ` Diskon: ${ctx.raw.x}%`,
              ` Revenue: ${formatRupiahFull(ctx.raw.y)}`,
            ]
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Diskon (%)', color: '#64748b', font: { size: 11 } },
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', callback: v => v + '%' }
        },
        y: {
          title: { display: true, text: 'Revenue', color: '#64748b', font: { size: 11 } },
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', callback: v => formatRupiah(v) }
        }
      }
    }
  });
}

/* ---- 9. Top 10 Highest Sales (Horizontal Bar) ---- */
function renderTop10() {
  destroyChart('top10');

  // Ambil 10 transaksi dengan revenue tertinggi
  const top10 = [...filtered]
    .map(row => ({ label: `#${row.id} ${row.product}`, value: calcRevenue(row) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  chartRefs.top10 = new Chart(
    document.getElementById('chart-top10').getContext('2d'), {
    type: 'bar',
    data: {
      labels: top10.map(t => t.label.length > 22 ? t.label.slice(0, 22) + '…' : t.label),
      datasets: [{
        label: 'Revenue',
        data: top10.map(t => t.value),
        backgroundColor: PALETTE.teal + 'cc',
        borderColor:     PALETTE.teal,
        borderWidth: 1.5,
        borderRadius: 5,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', callback: v => formatRupiah(v) }
        },
        y: { grid: { display: false }, ticks: { color: '#334155', font: { size: 10 } } }
      },
      plugins: {
        tooltip: {
          callbacks: { label: ctx => ' ' + formatRupiahFull(ctx.parsed.x) }
        }
      }
    }
  });
}

/* ---- 10. Quantity Sold per Category (Bar) ---- */
function renderQtyCategory() {
  destroyChart('qtyCategory');
  const agg = groupSum(filtered, 'category', r => r.quantity);
  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);

  chartRefs.qtyCategory = new Chart(
    document.getElementById('chart-qty-category').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Qty Terjual',
        data: values,
        backgroundColor: COLOR_SEQUENCE.slice(0, labels.length).map(c => c + 'cc'),
        borderColor:     COLOR_SEQUENCE.slice(0, labels.length),
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b' } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', callback: v => v.toLocaleString('id-ID') + ' unit' }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toLocaleString('id-ID')} unit`
          }
        }
      }
    }
  });
}

/* ============================================================
   RENDER ALL – memanggil semua renderer sekaligus
   ============================================================ */
function renderAll() {
  renderKPI();
  renderTrend();
  renderRegion();
  renderCategory();
  renderSalesRep();
  renderCustomer();
  renderPayment();
  renderChannel();
  renderScatter();
  renderTop10();
  renderQtyCategory();
}

/* ============================================================
   ENTRY POINT – jalankan saat DOM selesai dimuat
   ============================================================ */
document.addEventListener('DOMContentLoaded', loadData);
