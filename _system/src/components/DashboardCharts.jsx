import { useEffect, useRef, useMemo } from 'react';
import { formatCurrency } from '../utils';
import { getChartPrefs, THEME_COLORS } from '../utils/chartPrefs';

/**
 * ERPNext/SD-style charts for dashboard home.
 * Loads chart.js dynamically (add dependency: npm install chart.js).
 */
export default function DashboardCharts({ stats }) {
  const lineRef = useRef(null);
  const pieRef = useRef(null);
  const barRef = useRef(null);
  const charts = useRef([]);

  const prefs = useMemo(() => {
    try { return getChartPrefs(); } catch { return { theme: 'blue', salesChart: 'line' }; }
  }, []);
  const colors = THEME_COLORS[prefs.theme] || THEME_COLORS.blue;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Chart, registerables } = await import('chart.js');
        Chart.register(...registerables);
        if (cancelled) return;

        charts.current.forEach(c => { try { c.destroy(); } catch {} });
        charts.current = [];

        const months = stats?.monthKeys || [];
        const salesData = months.map(m => stats.byMonth[m] || 0);

        if (lineRef.current && months.length) {
          const c = new Chart(lineRef.current, {
            type: prefs.salesChart === 'bar' ? 'bar' : 'line',
            data: {
              labels: months.map(m => m.slice(5) + '/' + m.slice(2, 4)),
              datasets: [{
                label: 'Sales',
                data: salesData,
                borderColor: colors[0],
                backgroundColor: prefs.salesChart === 'bar' ? colors[0] + 'cc' : colors[2] + '88',
                fill: prefs.salesChart !== 'bar',
                tension: 0.35,
                borderWidth: 2,
                pointRadius: 4,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => formatCurrency(ctx.parsed.y ?? ctx.parsed),
                  },
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { callback: (v) => (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) },
                },
              },
            },
          });
          charts.current.push(c);
        }

        if (pieRef.current && stats?.aging) {
          const a = stats.aging;
          const c = new Chart(pieRef.current, {
            type: (prefs.agingChart === 'pie' ? 'pie' : prefs.agingChart === 'bar' ? 'bar' : 'doughnut'),
            data: {
              labels: ['Not due', '0–30', '31–60', '61–90', '90+'],
              datasets: [{
                data: [a.notDue || 0, a.d0_30 || 0, a.d31_60 || 0, a.d61_90 || 0, a.d90p || 0],
                backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'],
                borderWidth: 1,
                borderColor: '#fff',
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}`,
                  },
                },
              },
            },
          });
          charts.current.push(c);
        }

        if (barRef.current && stats?.topClients?.length) {
          const top = stats.topClients.slice(0, 5);
          const c = new Chart(barRef.current, {
            type: 'bar',
            data: {
              labels: top.map(([n]) => (n.length > 14 ? n.slice(0, 12) + '…' : n)),
              datasets: [{
                label: 'Revenue',
                data: top.map(([, v]) => v),
                backgroundColor: colors[0],
                borderRadius: 6,
              }],
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: { label: (ctx) => formatCurrency(ctx.parsed.x) },
                },
              },
              scales: {
                x: {
                  beginAtZero: true,
                  ticks: { callback: (v) => (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v) },
                },
              },
            },
          });
          charts.current.push(c);
        }
      } catch (e) {
        console.warn('[DashboardCharts] chart.js not installed — run: npm install chart.js', e);
      }
    })();
    return () => {
      cancelled = true;
      charts.current.forEach(c => { try { c.destroy(); } catch {} });
    };
  }, [stats, prefs.salesChart, prefs.theme, colors]);

  if (!stats?.monthKeys?.length && !stats?.topClients?.length) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
      <div className="glass-panel p-4">
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Sales trend</h3>
        <div style={{ height: 180 }}><canvas ref={lineRef} /></div>
      </div>
      <div className="glass-panel p-4">
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Outstanding aging</h3>
        <div style={{ height: 180 }}><canvas ref={pieRef} /></div>
      </div>
      <div className="glass-panel p-4">
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Top clients</h3>
        <div style={{ height: 180 }}><canvas ref={barRef} /></div>
      </div>
    </div>
  );
}
