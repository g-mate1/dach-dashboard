"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { getCompanies, getCompany } from "@/lib/data";
import { Company, Peer, REGION_LABELS, REGION_COLORS, METRICS, percentile, median } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-slate-800 border border-slate-700 rounded-xl ${className}`}>{children}</div>;
}

function PercentileBar({ label, value, pctDach, pctRegion, suffix, higherBetter }: {
  label: string; value: number; pctDach: number; pctRegion: number; suffix: string; higherBetter: boolean;
}) {
  const effectivePct = higherBetter ? pctDach : 100 - pctDach;
  const color = effectivePct > 66 ? '#34d399' : effectivePct > 33 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <div className="w-32 text-xs text-slate-400 shrink-0">{label}</div>
      <div className="flex-1 h-2 bg-slate-700 rounded-full relative overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctDach}%`, background: color }} />
      </div>
      <div className="w-16 text-xs font-mono text-right">{value.toFixed(1)}{suffix}</div>
      <div className="w-16 text-xs text-slate-500">P{pctDach}</div>
      <div className="w-16 text-xs text-slate-500">P{pctRegion} reg</div>
    </div>
  );
}

function PeerBarChart({ company, peers, metricKey, label, suffix }: {
  company: Company; peers: Peer[]; metricKey: string; label: string; suffix: string;
}) {
  const all = useMemo(() => {
    const items = [
      { name: company.name + ' ★', value: (company as unknown as Record<string, number | undefined>)[metricKey], isCompany: true },
      ...peers.map(p => ({ name: p.name, value: (p as unknown as Record<string, number | undefined>)[metricKey], isCompany: false })),
    ].filter(x => x.value != null);
    items.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return items;
  }, [company, peers, metricKey]);

  if (!all.length) return null;

  return (
    <div>
      <div className="text-xs text-slate-400 mb-2">{label}</div>
      <ResponsiveContainer width="100%" height={Math.max(160, all.length * 32 + 30)}>
        <BarChart data={all} layout="vertical">
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `${v}${suffix}`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120}
            tickFormatter={(v: string) => v.length > 18 ? v.substring(0, 16) + '...' : v} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            formatter={(v) => [`${Number(v).toFixed(1)}${suffix}`, label]} />
          <Bar dataKey="value">
            {all.map((d, i) => <Cell key={i} fill={d.isCompany ? '#3b82f6' : '#475569'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompanyContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const allCompanies = useMemo(() => getCompanies(), []);
  const company = useMemo(() => id ? getCompany(id) : undefined, [id]);

  if (!company) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <Link href="/" className="text-blue-400 hover:underline text-sm">← Back to Dashboard</Link>
        <div className="mt-8 text-center text-slate-400">Company not found. Select one from the dashboard.</div>
      </div>
    );
  }

  const regionCompanies = allCompanies.filter(c => c.region === company.region);

  // Radar data for peer comparison
  const radarData = useMemo(() => {
    if (!company.has_peers || !company.peers?.length) return [];
    const metrics: { key: string; label: string; higherBetter: boolean }[] = [
      { key: 'ebitda_margin', label: 'EBITDA Margin', higherBetter: true },
      { key: 'roe', label: 'ROE', higherBetter: true },
      { key: 'fwd_pe', label: 'Fwd P/E (inv)', higherBetter: false },
      { key: 'fwd_rev_growth', label: 'Rev Growth', higherBetter: true },
      { key: 'debt_equity', label: 'D/E (inv)', higherBetter: false },
    ];

    return metrics.map(m => {
      const compVal = (company as unknown as Record<string, number | undefined>)[m.key] as number | undefined;
      const peerVals = company.peers!.map(p => (p as unknown as Record<string, number | undefined>)[m.key] as number | undefined).filter(v => v != null) as number[];
      const peerMed = peerVals.length ? median(peerVals) : 0;

      // Normalize to 0-100 scale
      const maxVal = Math.max(Math.abs(compVal ?? 0), Math.abs(peerMed), 1);
      let compNorm = compVal != null ? (compVal / maxVal) * 50 + 50 : 50;
      let peerNorm = (peerMed / maxVal) * 50 + 50;
      if (!m.higherBetter) { compNorm = 100 - compNorm; peerNorm = 100 - peerNorm; }

      return { metric: m.label, company: Math.max(0, Math.min(100, compNorm)), peers: Math.max(0, Math.min(100, peerNorm)) };
    });
  }, [company]);

  // Neighbor ranking
  const getNeighbors = (key: keyof Company, n = 2) => {
    const val = company[key] as number | undefined;
    if (val == null) return [];
    const all = allCompanies.filter(c => c[key] != null).sort((a, b) => (b[key] as number) - (a[key] as number));
    const idx = all.findIndex(c => c.id === company.id);
    if (idx < 0) return [];
    const start = Math.max(0, idx - n);
    const end = Math.min(all.length, idx + n + 1);
    return all.slice(start, end).map(c => ({ name: c.name, value: c[key] as number, isTarget: c.id === company.id, rank: all.indexOf(c) + 1, total: all.length }));
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      {/* Back link */}
      <Link href="/" className="text-blue-400 hover:underline text-sm">← Back to Dashboard</Link>

      {/* Company Header */}
      <Card className="p-6 mt-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {REGION_LABELS[company.region]} | Revenue: {company.revenue ? `${Math.round(company.revenue)}M` : '—'} | {company.has_peers ? `${company.peers?.length} peers` : 'No peer data'}
            </p>
          </div>
          <div className="flex gap-6">
            {[
              ['EBIT Margin', company.ebit_margin, '%'],
              ['ROE', company.roe, '%'],
              ['Fwd P/E', company.fwd_pe, 'x'],
              ['Fwd ROE', company.fwd_roe, '%'],
              ['Rev Growth', company.fwd_rev_growth, '%'],
            ].map(([label, val, suffix]) => (
              <div key={label as string} className="text-right">
                <div className="text-xs text-slate-400">{label as string}</div>
                <div className="text-lg font-bold">{val != null ? `${(val as number).toFixed(1)}${suffix}` : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Percentile Positioning */}
      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Percentile Rank — DACH Universe ({allCompanies.length} companies)</h2>
        {METRICS.filter(m => company[m.key] != null).map(m => {
          const val = company[m.key] as number;
          const allVals = allCompanies.filter(c => c[m.key] != null).map(c => c[m.key] as number);
          const regVals = regionCompanies.filter(c => c[m.key] != null).map(c => c[m.key] as number);
          return (
            <PercentileBar key={m.key} label={m.label} value={val} suffix={m.suffix}
              pctDach={percentile(allVals, val)} pctRegion={percentile(regVals, val)} higherBetter={m.higherBetter} />
          );
        })}
      </Card>

      {/* Ranking Neighbors */}
      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">DACH Ranking — Nearest Neighbors</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: 'ebit_margin' as keyof Company, label: 'EBIT Margin', suffix: '%' },
            { key: 'roe' as keyof Company, label: 'ROE', suffix: '%' },
            { key: 'fwd_pe' as keyof Company, label: 'Forward P/E', suffix: 'x' },
            { key: 'fwd_roe' as keyof Company, label: 'Forward ROE', suffix: '%' },
            { key: 'fwd_rev_growth' as keyof Company, label: 'Rev Growth', suffix: '%' },
            { key: 'debt_equity' as keyof Company, label: 'Debt/Equity', suffix: 'x' },
          ].map(({ key, label, suffix }) => {
            const neighbors = getNeighbors(key);
            if (!neighbors.length) return null;
            return (
              <div key={key} className="bg-slate-900/50 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-2">{label}</div>
                {neighbors.map((n, i) => (
                  <div key={i} className={`flex justify-between text-xs py-0.5 ${n.isTarget ? 'text-blue-400 font-bold' : 'text-slate-300'}`}>
                    <span>#{n.rank} {n.name.length > 22 ? n.name.substring(0, 20) + '...' : n.name}</span>
                    <span className="font-mono">{n.value.toFixed(1)}{suffix}</span>
                  </div>
                ))}
                <div className="text-[10px] text-slate-600 mt-1">of {neighbors[0]?.total} companies</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Peer Comparison (if available) */}
      {company.has_peers && company.peers && company.peers.length > 0 && (
        <>
          <Card className="p-6 mb-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Peer Group Comparison</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Radar Chart */}
              <div>
                <div className="text-xs text-slate-400 mb-2">Company Profile vs Peer Median</div>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <PolarRadiusAxis tick={false} domain={[0, 100]} />
                    <Radar name={company.name} dataKey="company" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                    <Radar name="Peer Median" dataKey="peers" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Peer bar charts */}
              <div className="space-y-4">
                <PeerBarChart company={company} peers={company.peers} metricKey="ebitda_margin" label="EBITDA Margin" suffix="%" />
                <PeerBarChart company={company} peers={company.peers} metricKey="roe" label="ROE" suffix="%" />
              </div>
            </div>
          </Card>

          {/* Industry Deep-Dive */}
          <Card className="p-6 mb-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Industry Deep-Dive — KPI Benchmarking</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PeerBarChart company={company} peers={company.peers} metricKey="revenue" label="Revenue Scale (M)" suffix="M" />
              <PeerBarChart company={company} peers={company.peers} metricKey="ebit_margin" label="EBIT Margin" suffix="%" />
              <PeerBarChart company={company} peers={company.peers} metricKey="net_margin" label="Net Margin" suffix="%" />
              <PeerBarChart company={company} peers={company.peers} metricKey="fwd_pe" label="Forward P/E" suffix="x" />
              <PeerBarChart company={company} peers={company.peers} metricKey="fwd_ev_ebitda" label="Forward EV/EBITDA" suffix="x" />
              <PeerBarChart company={company} peers={company.peers} metricKey="rev_growth" label="Revenue Growth" suffix="%" />
              <PeerBarChart company={company} peers={company.peers} metricKey="debt_equity" label="Debt / Equity" suffix="x" />
              <PeerBarChart company={company} peers={company.peers} metricKey="net_debt_ebitda" label="Net Debt / EBITDA" suffix="x" />
            </div>

            {/* Peer group summary stats */}
            {(() => {
              const peerMetrics: { label: string; key: string; suffix: string }[] = [
                { label: 'EBITDA Margin', key: 'ebitda_margin', suffix: '%' },
                { label: 'Net Margin', key: 'net_margin', suffix: '%' },
                { label: 'ROE', key: 'roe', suffix: '%' },
                { label: 'Fwd P/E', key: 'fwd_pe', suffix: 'x' },
                { label: 'Fwd EV/EBITDA', key: 'fwd_ev_ebitda', suffix: 'x' },
                { label: 'D/E', key: 'debt_equity', suffix: 'x' },
              ];
              const allPeers = company.peers!;
              return (
                <div className="mt-6 pt-4 border-t border-slate-700">
                  <h3 className="text-xs text-slate-400 mb-3 font-semibold">Peer Group Summary — Company vs Median</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {peerMetrics.map(({ label, key, suffix }) => {
                      const compVal = (company as unknown as Record<string, number | undefined>)[key];
                      const peerVals = allPeers.map(p => (p as unknown as Record<string, number | undefined>)[key]).filter(v => v != null) as number[];
                      if (!peerVals.length || compVal == null) return null;
                      const med = median(peerVals);
                      const diff = ((compVal - med) / Math.abs(med) * 100);
                      return (
                        <div key={key} className="bg-slate-900/50 rounded-lg p-3">
                          <div className="text-[10px] text-slate-500">{label}</div>
                          <div className="text-lg font-bold text-white">{compVal.toFixed(1)}{suffix}</div>
                          <div className="text-xs text-slate-400">Median: {med.toFixed(1)}{suffix}</div>
                          <div className={`text-xs font-semibold ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(0)}% vs peers
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* Full Peer Table */}
          <Card className="p-6 mb-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Full Peer Metrics</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">EBITDA %</th>
                    <th className="px-3 py-2 text-right">Net %</th>
                    <th className="px-3 py-2 text-right">ROE</th>
                    <th className="px-3 py-2 text-right">D/E</th>
                    <th className="px-3 py-2 text-right">Fwd P/E</th>
                    <th className="px-3 py-2 text-right">Fwd EV/EBITDA</th>
                    <th className="px-3 py-2 text-right">Fwd ROE</th>
                  </tr>
                </thead>
                <tbody>
                  {[company, ...company.peers].map((c, i) => {
                    const isComp = i === 0;
                    const cls = isComp ? 'text-blue-300 font-bold bg-blue-900/20' : '';
                    return (
                      <tr key={c.id || i} className={`border-b border-slate-800 ${cls}`}>
                        <td className="px-3 py-2">{isComp ? `${c.name} ★` : c.name}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.revenue ? `${Math.round(c.revenue)}M` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.ebitda_margin != null ? `${c.ebitda_margin.toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.net_margin != null ? `${c.net_margin.toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.roe != null ? `${c.roe.toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.debt_equity != null ? `${c.debt_equity.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.fwd_pe != null ? `${c.fwd_pe.toFixed(1)}x` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.fwd_ev_ebitda != null ? `${c.fwd_ev_ebitda.toFixed(1)}x` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.fwd_roe != null ? `${c.fwd_roe.toFixed(1)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Regional Distribution */}
      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Position in {REGION_LABELS[company.region]}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { key: 'ebit_margin' as keyof Company, label: 'EBIT Margin Distribution', binSize: 5, rangeMin: -30, rangeMax: 50 },
            { key: 'roe' as keyof Company, label: 'ROE Distribution', binSize: 5, rangeMin: -30, rangeMax: 60 },
          ].map(({ key, label, binSize, rangeMin, rangeMax }) => {
            const vals = regionCompanies.filter(c => c[key] != null && (c[key] as number) >= rangeMin && (c[key] as number) <= rangeMax);
            const nBins = Math.ceil((rangeMax - rangeMin) / binSize);
            const bins = Array(nBins).fill(0);
            vals.forEach(c => { const b = Math.min(nBins - 1, Math.max(0, Math.floor(((c[key] as number) - rangeMin) / binSize))); bins[b]++; });
            const compBin = company[key] != null ? Math.min(nBins - 1, Math.max(0, Math.floor(((company[key] as number) - rangeMin) / binSize))) : -1;
            const histData = bins.map((count, i) => ({ label: `${rangeMin + i * binSize}%`, count, isCompany: i === compBin }));

            return (
              <div key={key}>
                <div className="text-xs text-slate-400 mb-2">{label} — {REGION_LABELS[company.region]} ({vals.length} cos)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={histData}>
                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count">
                      {histData.map((d, i) => <Cell key={i} fill={d.isCompany ? '#3b82f6' : REGION_COLORS[company.region] + '44'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default function CompanyPage() {
  return (
    <Suspense fallback={<div className="max-w-[1400px] mx-auto px-4 py-6 text-slate-400">Loading...</div>}>
      <CompanyContent />
    </Suspense>
  );
}
