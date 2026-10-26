"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildAnalytics, buildOverview, type Dashboard as Model, type Panel } from "@/lib/analytics";
import { compactMoney, date, downloadFile, toCsv } from "@/lib/db/format";
import { useDb } from "@/lib/db/store";
import { useShell } from "../Shell";
import { Bars, DonutChart, Dropdown, Icon, LineChart, StatGrid, Status, useToast } from "../ui";

function csvMenu(name: string, headers: string[], rows: (string | number)[][], toast: (m: string) => void) {
  return (
    <Dropdown trigger={<Icon name="dots" />} className="icon-btn" label={`${name} options`}>
      {(close) => (
        <button
          type="button"
          onClick={() => {
            close();
            downloadFile(`${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, toCsv(headers, rows), "text/csv");
            toast(`${name} data downloaded`);
          }}
        >
          <Icon name="download" size={13} /> Download data (CSV)
        </button>
      )}
    </Dropdown>
  );
}

function PanelView({ panel }: { panel: Panel }) {
  const toast = useToast();
  if (panel.kind === "bars")
    return (
      <article className="panel">
        <div className="panel-title">
          <div>
            <h3>{panel.title}</h3>
            <p>{panel.subtitle}</p>
          </div>
          <div className="rx-panel-tools">
            {panel.legend && (
              <span className="rx-legend-inline">
                <i className="dot blue" />
                {panel.legend[0]}
                <i className="dot green" />
                {panel.legend[1]}
              </span>
            )}
            {csvMenu(panel.title, ["Label", panel.legend?.[0] ?? "Value", ...(panel.secondary ? [panel.legend?.[1] ?? "Value 2"] : [])], panel.labels.map((l, i) => [l, panel.data[i] ?? 0, ...(panel.secondary ? [panel.secondary[i] ?? 0] : [])]), toast)}
          </div>
        </div>
        <Bars data={panel.data} secondary={panel.secondary} labels={panel.labels} format={panel.money ? compactMoney : undefined} />
      </article>
    );
  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <h3>{panel.title}</h3>
          <p>{panel.subtitle}</p>
        </div>
        {panel.href && <Link href={panel.href}>View all</Link>}
      </div>
      <div className="simple-list rx-simple-list">
        {panel.rows.length === 0 && <p className="rx-muted">{panel.empty ?? "Nothing to show."}</p>}
        {panel.rows.map((r, i) => {
          const body = (
            <>
              {r.date ? (
                <span className="date-tile">
                  <b>{new Date(r.date).getDate()}</b>
                  <small>{new Date(r.date).toLocaleString("en-GB", { month: "short" }).toUpperCase()}</small>
                </span>
              ) : (
                <span className={`mini-avatar avatar-${i % 4}`}>{i + 1}</span>
              )}
              <p>
                <b>{r.label}</b>
                {r.sub && <small>{r.sub}</small>}
              </p>
              {r.value && <span className="cost">{r.value}</span>}
              {r.status && <Status>{r.status}</Status>}
            </>
          );
          return r.href ? (
            <Link key={`${r.label}-${i}`} href={r.href} className="rx-list-row" title={r.date ? date(r.date) : undefined}>
              {body}
            </Link>
          ) : (
            <div key={`${r.label}-${i}`} className="rx-list-row">
              {body}
            </div>
          );
        })}
      </div>
    </article>
  );
}

export default function Dashboard({ slug, kind }: { slug: string; kind: "overview" | "analytics" }) {
  const db = useDb();
  const { period } = useShell();
  const toast = useToast();
  const model: Model | null = useMemo(() => (db ? (kind === "overview" ? buildOverview(slug, db, period) : buildAnalytics(slug, db, period)) : null), [db, slug, kind, period]);
  if (!model) return null;
  const { stats, trend, donut, panels } = model;
  return (
    <>
      <StatGrid compact={kind === "analytics"} items={stats.map((s) => ({ ...s, note: s.note ?? "" }))} />
      <div className="chart-grid">
        <article className="panel chart-large">
          <div className="panel-title">
            <div>
              <h3>{trend.title}</h3>
              <p>{trend.subtitle}</p>
            </div>
            <div className="rx-panel-tools">
              {trend.legend && (
                <span className="rx-legend-inline">
                  <i className="dot" style={{ background: trend.color ?? "#1769e8" }} />
                  {trend.legend[0]}
                  {trend.compare && (
                    <>
                      <i className="dot" style={{ background: "#c3cad6" }} />
                      {trend.legend[1]}
                    </>
                  )}
                </span>
              )}
              {csvMenu(trend.title, ["Period", trend.legend?.[0] ?? "Value", ...(trend.compare ? [trend.legend?.[1] ?? "Compare"] : [])], trend.labels.map((l, i) => [l, trend.series[i] ?? 0, ...(trend.compare ? [trend.compare[i] ?? 0] : [])]), toast)}
            </div>
          </div>
          <LineChart series={trend.series} compare={trend.compare} labels={trend.labels} color={trend.color} />
        </article>
        <article className="panel donut-panel">
          <div className="panel-title">
            <div>
              <h3>{donut.title}</h3>
              <p>{donut.subtitle}</p>
            </div>
            {csvMenu(donut.title, ["Segment", "Value"], donut.segments.map((s) => [s.label, s.value]), toast)}
          </div>
          <DonutChart segments={donut.segments} center={donut.center} caption={donut.caption} />
        </article>
      </div>
      <div className="bottom-grid">
        <PanelView panel={panels[0]} />
        <PanelView panel={panels[1]} />
      </div>
    </>
  );
}
