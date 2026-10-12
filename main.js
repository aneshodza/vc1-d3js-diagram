
const FX = "Foreign currency investments";
const fmtBn = v => `${d3.format(",.1f")(v / 1000)} bn`;
const fmtPct = d3.format(".1%");
const parseMonth = d3.timeParse("%Y-%m");
const fmtMonth = d3.timeFormat("%b %Y");

const ASSET_GROUP = {
  [FX]: "Foreign currency investments",
  "Gold": "Gold",
  "CHF securities": "CHF securities",
  "Repo and money market claims": "Repo and money market claims",
  "IMF and international": "Other assets",
  "Stabilisation fund (UBS)": "Other assets",
  "Other assets": "Other assets",
};
const GROUPS = ["Foreign currency investments", "Gold", "CHF securities", "Repo and money market claims", "Other assets"];
const GROUP_COLOR = Object.fromEntries(GROUPS.map((g, i) => [g, `var(--series-${i + 1})`]));

const tooltip = d3.select("#tooltip");
let data, months, current = 0, timer = null;

d3.json("data/snb.json").then(json => {
  data = json;
  months = json.months;
  months.forEach(m => { m.time = parseMonth(m.date); });
  const requested = months.findIndex(m => m.date === new URLSearchParams(location.search).get("date"));
  current = requested >= 0 ? requested : months.length - 1;
  initControls();
  initSankey();
  update(0);
});

function valueOf(m, id) {
  const [kind, name] = id.split(":");
  if (kind === "L") return m.liabilities[name];
  if (kind === "A") return m.assets[name];
  if (kind === "C") return m.assets[FX] * m.currencyShares[name];
  return m.total;
}

function nodeColor(d) {
  if (d.kind === "L") return "var(--neutral-node)";
  if (d.kind === "A") return GROUP_COLOR[ASSET_GROUP[d.name]];
  if (d.kind === "C") return GROUP_COLOR[FX];
  return "var(--text-primary)";
}

function linkColor(d) {
  return d.source.kind === "L" ? "var(--neutral-link)" : nodeColor(d.target);
}

function showTooltip(event, html) {
  tooltip.html(html).attr("hidden", null);
  const { width, height } = tooltip.node().getBoundingClientRect();
  let x = event.clientX + 14, y = event.clientY + 14;
  if (x + width > window.innerWidth - 8) x = event.clientX - width - 14;
  if (y + height > window.innerHeight - 8) y = event.clientY - height - 14;
  tooltip.style("left", `${x}px`).style("top", `${y}px`);
}
const hideTooltip = () => tooltip.attr("hidden", true);
const row = (label, value) =>
  `<div class="tt-row"><span>${label}</span><span>${value}</span></div>`;

function initControls() {
  d3.select("#slider").attr("max", months.length - 1).on("input", function () {
    stop();
    setIndex(+this.value, 120);
  });
  d3.select("#play").on("click", () => (timer ? stop() : play()));
}

function play() {
  if (current === months.length - 1) setIndex(0, 0);
  d3.select("#play").text("❚❚ Pause").attr("aria-label", "Pause animation");
  timer = d3.interval(() => {
    if (current >= months.length - 1) return stop();
    setIndex(current + 1, 80);
  }, 80);
}

function stop() {
  if (timer) timer.stop();
  timer = null;
  d3.select("#play").text("▶ Play").attr("aria-label", "Play animation");
}

function setIndex(i, duration) {
  current = Math.max(0, Math.min(months.length - 1, i));
  update(duration);
}

function update(duration) {
  const m = months[current];
  d3.select("#slider").property("value", current);
  d3.select("#date-label").text(fmtMonth(m.time));
  updateSankey(m, duration);
  updateTable(m, months[current - 12]);
}

const SK = { width: 1100, height: 600, top: 28, bottom: 12, left: 270, right: 130, pad: 14 };
let sankey, sankeySvg, maxTotal, innerMax;

function initSankey() {
  sankeySvg = d3.select("#sankey").attr("viewBox", [0, 0, SK.width, SK.height]);
  sankeySvg.append("g").attr("class", "links");
  sankeySvg.append("g").attr("class", "nodes");
  sankeySvg.append("g").attr("class", "labels");

  sankey = d3.sankey()
    .nodeId(d => d.id)
    .nodeAlign(d3.sankeyLeft)
    .nodeWidth(14)
    .nodePadding(SK.pad)
    .nodeSort(null)
    .linkSort(null)
    .iterations(0);

  maxTotal = d3.max(months, m => Math.max(d3.sum(Object.values(m.liabilities)), d3.sum(Object.values(m.assets))));
  innerMax = SK.height - SK.top - SK.bottom - (data.liabilityNames.length - 1) * SK.pad;
}

function buildGraph(m) {
  const nodes = [
    ...data.liabilityNames.map(name => ({ id: `L:${name}`, kind: "L", name })),
    { id: "SNB", kind: "SNB", name: "Swiss National Bank" },
    ...data.assetNames.map(name => ({ id: `A:${name}`, kind: "A", name })),
    ...data.currencies.map(name => ({ id: `C:${name}`, kind: "C", name })),
  ];
  const links = [
    ...data.liabilityNames.map(name => ({ source: `L:${name}`, target: "SNB", value: m.liabilities[name] })),
    ...data.assetNames.map(name => ({ source: "SNB", target: `A:${name}`, value: m.assets[name] })),
    ...data.currencies.map(name => ({ source: `A:${FX}`, target: `C:${name}`, value: valueOf(m, `C:${name}`) })),
  ];
  links.forEach(l => { l.value = Math.max(0, l.value); });

  const total = Math.max(d3.sum(Object.values(m.liabilities)), d3.sum(Object.values(m.assets)));
  const h = (data.liabilityNames.length - 1) * SK.pad + innerMax * total / maxTotal;
  const y0 = SK.top + (SK.height - SK.top - SK.bottom - h) / 2;
  sankey.extent([[SK.left, y0], [SK.width - SK.right, y0 + h]]);
  return sankey({ nodes, links });
}

function updateSankey(m, duration) {
  const { nodes, links } = buildGraph(m);
  const t = sankeySvg.transition().duration(duration).ease(duration > 200 ? d3.easeCubicInOut : d3.easeLinear);

  sankeySvg.select(".links").selectAll("path")
    .data(links, d => `${d.source.id}>${d.target.id}`)
    .join(enter => enter.append("path")
      .attr("class", "link")
      .style("stroke", linkColor)
      .attr("d", d3.sankeyLinkHorizontal())
      .on("pointermove", (event, d) => showTooltip(event, linkTooltip(d)))
      .on("pointerleave", hideTooltip))
    .transition(t)
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke-width", d => Math.max(d.value > 0 ? 1 : 0, d.width));

  sankeySvg.select(".nodes").selectAll("g.node")
    .data(nodes, d => d.id)
    .join(enter => {
      const g = enter.append("g").attr("class", "node")
        .on("pointermove", (event, d) => { highlight(d); showTooltip(event, nodeTooltip(d)); })
        .on("pointerleave", () => { highlight(null); hideTooltip(); });
      g.append("rect").style("fill", nodeColor);
      g.append("rect").attr("class", "hit").style("fill", "transparent");
      return g;
    })
    .call(g => g.select("rect:not(.hit)").transition(t)
      .attr("x", d => d.x0).attr("y", d => d.y0)
      .attr("width", d => d.x1 - d.x0).attr("height", d => Math.max(d.value > 0 ? 1 : 0, d.y1 - d.y0)))
    .call(g => g.select("rect.hit").transition(t)
      .attr("x", d => d.x0 - 4).attr("y", d => (d.y0 + d.y1) / 2 - Math.max(8, (d.y1 - d.y0) / 2))
      .attr("width", d => d.x1 - d.x0 + 8).attr("height", d => Math.max(16, d.y1 - d.y0)));

  sankeySvg.select(".labels").selectAll("text")
    .data(nodes, d => d.id)
    .join(enter => enter.append("text").attr("class", "halo").attr("dy", "0.35em")
      .attr("text-anchor", d => d.kind === "L" ? "end" : d.kind === "SNB" ? "middle" : "start")
      .call(text => { text.append("tspan").attr("class", "name"); text.append("tspan").attr("class", "muted"); }))
    .attr("opacity", d => (d.value >= 50 ? 1 : 0))
    .call(text => text.select(".name").text(d => d.kind === "SNB" ? "SNB" : d.name === FX ? "FX investments" : d.name))
    .call(text => text.select(".muted").text(d => `  ${fmtBn(d.value)}`))
    .transition(t)
    .attr("x", d => d.kind === "L" ? d.x0 - 6 : d.kind === "SNB" ? (d.x0 + d.x1) / 2 : d.x1 + 6)
    .attr("y", d => d.kind === "SNB" ? d.y0 - 14 : (d.y0 + d.y1) / 2);
}

function highlight(node) {
  sankeySvg.selectAll(".link")
    .classed("hi", d => node && (d.source.id === node.id || d.target.id === node.id))
    .classed("dim", d => node && d.source.id !== node.id && d.target.id !== node.id);
}

function nodeTooltip(d) {
  const m = months[current], prev = months[current - 12];
  let html = `<div class="tt-title">${d.name}</div>`
    + row(fmtMonth(m.time), `CHF ${fmtBn(d.value)}`)
    + row("Share of balance sheet", fmtPct(d.value / m.total));
  if (prev) {
    const before = valueOf(prev, d.id);
    html += row("12 months earlier", `CHF ${fmtBn(before)}`);
  }
  if (d.kind === "C") html += row("Share of FX reserves", fmtPct(m.currencyShares[d.name]));
  if (d.kind === "C" || d.name === FX) {
    html += `<div class="hint">Currency shares from ${m.currencyQuarter}</div>`;
  }
  if (d.name === FX) {
    data.currencies.forEach(c => { html += row(c, fmtPct(m.currencyShares[c])); });
  }
  return html;
}

function linkTooltip(d) {
  const m = months[current];
  return `<div class="tt-title">${d.source.kind === "SNB" ? "SNB" : d.source.name} → ${d.target.kind === "SNB" ? "SNB" : d.target.name}</div>`
    + row(fmtMonth(m.time), `CHF ${fmtBn(d.value)}`)
    + row("Share of balance sheet", fmtPct(d.value / m.total));
}

function updateTable(m, prev) {
  const section = (title, names, kind) => `
    <table>
      <thead><tr><th>${title}</th><th>${fmtMonth(m.time)}</th><th>12 months earlier</th></tr></thead>
      <tbody>${names.map(n => `<tr><td>${n}</td><td>${fmtBn(valueOf(m, `${kind}:${n}`))}</td>
        <td>${prev ? fmtBn(valueOf(prev, `${kind}:${n}`)) : "n/a"}</td></tr>`).join("")}</tbody>
    </table>`;
  d3.select("#table").html(`<div class="tables">
    ${section("Liabilities (CHF)", data.liabilityNames, "L")}
    ${section("Assets (CHF)", data.assetNames, "A")}
    ${section("FX investments by currency (CHF)", data.currencies, "C")}
  </div>`);
}
