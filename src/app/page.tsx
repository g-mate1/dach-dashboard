"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getCompanies } from "@/lib/data";
import { Company, REGION_LABELS, REGION_COLORS, METRICS, median, q1, q3 } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, Legend,
} from "recharts";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-slate-800 border border-slate-700 rounded-xl ${className}`}>{children}</div>;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-300">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </Card>
  );
}

function RegionBoxChart({ data, metricKey, label, suffix }: { data: Company[]; metricKey: keyof Company; label: string; suffix: string }) {
  const chartData = useMemo(() => {
    return (['vienna', 'germany', 'switzerland'] as const).map(r => {
      const vals = data.filter(c => c.region === r && c[metricKey] != null).map(c => c[metricKey] as number);
      return {
        region: REGION_LABELS[r],
        n: vals.length,
        q1: q1(vals),
        median: median(vals),
        q3: q3(vals),
        color: REGION_COLORS[r],
      };
    });
  }, [data, metricKey]);

  return (
    <Card className="p-4">
      <div className="text-xs text-slate-400 mb-2">{label} by Region</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} layout="vertical">
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `${v}${suffix}`} />
          <YAxis type="category" dataKey="region" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            formatter={(v, name) => [`${Number(v).toFixed(1)}${suffix}`, name]}
            labelFormatter={(label) => {
              const d = chartData.find(c => c.region === label);
              return `${label} (n=${d?.n})`;
            }}
          />
          <Bar dataKey="q1" stackId="box" fill="transparent" />
          <Bar dataKey="median" stackId="box" name="Q1→Median">
            {chartData.map((d, i) => <Cell key={i} fill={d.color + '66'} />)}
          </Bar>
          <Bar dataKey="q3" stackId="box" name="Median→Q3" fill="#888">
            {chartData.map((d, i) => <Cell key={i} fill={d.color + 'aa'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default function Dashboard() {
  const companies = useMemo(() => getCompanies(), []);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [sortKey, setSortKey] = useState<keyof Company>("name");

  const filtered = useMemo(() => {
    let d = companies;
    if (search) d = d.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search.toLowerCase()));
    if (regionFilter !== "all") d = d.filter(c => c.region === regionFilter);
    d = [...d].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      const av = (a[sortKey] as number) ?? -Infinity;
      const bv = (b[sortKey] as number) ?? -Infinity;
      return bv - av;
    });
    return d;
  }, [companies, search, regionFilter, sortKey]);

  // Summary stats
  const withEbit = companies.filter(c => c.ebit_margin != null);
  const withRoe = companies.filter(c => c.roe != null);
  const withPe = companies.filter(c => c.fwd_pe != null && c.fwd_pe > 0 && c.fwd_pe < 200);
  const profitable = companies.filter(c => c.net_income != null && c.net_income > 0);
  const withGrowth = companies.filter(c => c.fwd_rev_growth != null && c.fwd_rev_growth > 0);

  // Scatter data
  const scatterMargin = useMemo(() =>
    companies.filter(c => c.revenue && c.revenue > 0 && c.ebit_margin != null && c.ebit_margin > -30 && c.ebit_margin < 50)
      .map(c => ({ x: Math.log10(c.revenue!), y: c.ebit_margin!, name: c.name, region: c.region, rev: c.revenue! })),
    [companies]
  );

  const scatterPe = useMemo(() =>
    companies.filter(c => c.revenue && c.revenue > 0 && c.fwd_pe != null && c.fwd_pe > 0 && c.fwd_pe < 80)
      .map(c => ({ x: Math.log10(c.revenue!), y: c.fwd_pe!, name: c.name, region: c.region, rev: c.revenue! })),
    [companies]
  );

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">DACH Financial Analytics</h1>
          <p className="text-sm text-slate-400">468 listed companies across Austria, Germany & Switzerland</p>
        </div>
        <div className="flex gap-4 items-center text-xs text-slate-500">
          {Object.entries(REGION_LABELS).map(([k, v]) => (
            <span key={k}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: REGION_COLORS[k] }} />{v}</span>
          ))}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Companies" value={companies.length} sub={`AT:${companies.filter(c => c.region === 'vienna').length} DE:${companies.filter(c => c.region === 'germany').length} CH:${companies.filter(c => c.region === 'switzerland').length}`} />
        <StatCard label="Median EBIT Margin" value={`${median(withEbit.map(c => c.ebit_margin!)).toFixed(1)}%`} sub={`n=${withEbit.length}`} />
        <StatCard label="Median ROE" value={`${median(withRoe.map(c => c.roe!)).toFixed(1)}%`} sub={`n=${withRoe.length}`} />
        <StatCard label="Median Fwd P/E" value={`${median(withPe.map(c => c.fwd_pe!)).toFixed(1)}x`} sub={`n=${withPe.length}`} />
        <StatCard label="% Profitable" value={`${(100 * profitable.length / companies.filter(c => c.net_income != null).length).toFixed(0)}%`} sub={`${profitable.length} of ${companies.filter(c => c.net_income != null).length}`} />
        <StatCard label="% Revenue Growth" value={`${(100 * withGrowth.length / companies.filter(c => c.fwd_rev_growth != null).length).toFixed(0)}%`} sub={`${withGrowth.length} growing`} />
      </div>

      {/* Regional Comparison */}
      <h2 className="text-lg font-bold mb-1">Regional KPI Comparison</h2>
      <p className="text-xs text-slate-400 mb-4">How does each region compare? Bars show IQR (Q1 to Q3) with median split.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <RegionBoxChart data={companies} metricKey="ebit_margin" label="EBIT Margin (%)" suffix="%" />
        <RegionBoxChart data={companies} metricKey="net_margin" label="Net Margin (%)" suffix="%" />
        <RegionBoxChart data={companies} metricKey="roe" label="ROE (%)" suffix="%" />
        <RegionBoxChart data={companies} metricKey="fwd_pe" label="Forward P/E" suffix="x" />
        <RegionBoxChart data={companies} metricKey="fwd_rev_growth" label="Revenue Growth (%)" suffix="%" />
        <RegionBoxChart data={companies} metricKey="debt_equity" label="Debt/Equity" suffix="x" />
      </div>

      {/* Size Effects */}
      <h2 className="text-lg font-bold mb-1">Does Size Matter?</h2>
      <p className="text-xs text-slate-400 mb-4">Revenue (log scale) vs profitability and valuation. Each dot is a company.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {[
          { data: scatterMargin, yLabel: 'EBIT Margin (%)', id: 'margin' },
          { data: scatterPe, yLabel: 'Forward P/E (x)', id: 'pe' },
        ].map(({ data: sData, yLabel, id }) => (
          <Card key={id} className="p-4">
            <div className="text-xs text-slate-400 mb-2">Revenue vs {yLabel}</div>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart>
                <XAxis type="number" dataKey="x" tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={v => { const r = Math.pow(10, v); return r >= 1000 ? `${(r / 1000).toFixed(0)}B` : `${r.toFixed(0)}M`; }}
                  label={{ value: 'Revenue (log)', position: 'bottom', fill: '#64748b', fontSize: 11 }} />
                <YAxis type="number" dataKey="y" tick={{ fill: '#64748b', fontSize: 10 }}
                  label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => Number(v).toFixed(1)} labelFormatter={() => ''} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(['vienna', 'germany', 'switzerland'] as const).map(r => (
                  <Scatter key={r} name={REGION_LABELS[r]} data={sData.filter(d => d.region === r)} fill={REGION_COLORS[r] + '88'}>
                    {sData.filter(d => d.region === r).map((_, i) => <Cell key={i} />)}
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </div>

      {/* Screening Table */}
      <h2 className="text-lg font-bold mb-1">Company Screening</h2>
      <p className="text-xs text-slate-400 mb-3">Click any company to see detailed analysis with peer comparison.</p>

      <div className="flex gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company or ticker..."
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-blue-500" />
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="all">All Regions</option>
          <option value="vienna">Austria</option>
          <option value="germany">Germany</option>
          <option value="switzerland">Switzerland</option>
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as keyof Company)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="name">Sort: Name</option>
          <option value="revenue">Sort: Revenue</option>
          <option value="ebit_margin">Sort: EBIT Margin</option>
          <option value="roe">Sort: ROE</option>
          <option value="fwd_pe">Sort: Forward P/E</option>
          <option value="fwd_roe">Sort: Forward ROE</option>
        </select>
        <span className="text-sm text-slate-400 ml-auto self-center">{filtered.length} companies</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
                <th className="px-4 py-3">Company</th>
                <th className="px-3 py-3">Region</th>
                <th className="px-3 py-3 text-right">Revenue</th>
                <th className="px-3 py-3 text-right">EBIT %</th>
                <th className="px-3 py-3 text-right">ROE %</th>
                <th className="px-3 py-3 text-right">Fwd P/E</th>
                <th className="px-3 py-3 text-right">Fwd ROE</th>
                <th className="px-3 py-3 text-right">Rev Growth</th>
                <th className="px-3 py-3 text-right">D/E</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-700/50 cursor-pointer">
                  <td className="px-4 py-2.5">
                    <Link href={`/company?id=${c.id}`} className="hover:text-blue-400">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.id}</div>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background: REGION_COLORS[c.region] + '22', color: REGION_COLORS[c.region] }}>
                      {REGION_LABELS[c.region].substring(0, 2).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.revenue ? `${Math.round(c.revenue)}M` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.ebit_margin != null ? `${c.ebit_margin.toFixed(1)}%` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.roe != null ? `${c.roe.toFixed(1)}%` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.fwd_pe != null ? `${c.fwd_pe.toFixed(1)}x` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.fwd_roe != null ? `${c.fwd_roe.toFixed(1)}%` : '—'}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${(c.fwd_rev_growth ?? 0) < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {c.fwd_rev_growth != null ? `${c.fwd_rev_growth > 0 ? '+' : ''}${c.fwd_rev_growth.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.debt_equity != null ? `${c.debt_equity.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
