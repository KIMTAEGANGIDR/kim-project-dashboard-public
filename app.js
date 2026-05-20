const number = new Intl.NumberFormat("ko-KR");
const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const seenKey = "projectDashboard.seenTriggerKeys.v2";
const sessionNewKeys = new Set();
let selectedKey = null;
let currentData = null;
let currentItems = [];
let currentGraph = { nodes: [], edges: [] };

const choseong = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const jungseong = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const jongseong = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const choseongIndex = new Map([...choseong].map((char, index) => [char, index]));
const jungseongIndex = new Map([...jungseong].map((char, index) => [char, index]));
const jongseongIndex = new Map(jongseong.filter(Boolean).map((char, index) => [char, index + 1]));
const compoundJungseong = new Map([
  ["ㅗㅏ", "ㅘ"],
  ["ㅗㅐ", "ㅙ"],
  ["ㅗㅣ", "ㅚ"],
  ["ㅜㅓ", "ㅝ"],
  ["ㅜㅔ", "ㅞ"],
  ["ㅜㅣ", "ㅟ"],
  ["ㅡㅣ", "ㅢ"]
]);
const compoundJongseong = new Map([
  ["ㄱㅅ", "ㄳ"],
  ["ㄴㅈ", "ㄵ"],
  ["ㄴㅎ", "ㄶ"],
  ["ㄹㄱ", "ㄺ"],
  ["ㄹㅁ", "ㄻ"],
  ["ㄹㅂ", "ㄼ"],
  ["ㄹㅅ", "ㄽ"],
  ["ㄹㅌ", "ㄾ"],
  ["ㄹㅍ", "ㄿ"],
  ["ㄹㅎ", "ㅀ"],
  ["ㅂㅅ", "ㅄ"]
]);

function $(id) {
  return document.getElementById(id);
}

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace("Z", "+00:00"));
  if (Number.isNaN(date.getTime())) return value;
  return dateFmt.format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = normalizeText(value);
}

function normalizeText(value) {
  return composeCompatJamo(String(value ?? "").normalize("NFC")).normalize("NFC");
}

function composeCompatJamo(value) {
  const chars = [...value];
  const result = [];
  let i = 0;
  while (i < chars.length) {
    const initial = chars[i];
    if (!choseongIndex.has(initial) || i + 1 >= chars.length || !jungseongIndex.has(chars[i + 1])) {
      result.push(initial);
      i += 1;
      continue;
    }

    let vowel = chars[i + 1];
    i += 2;
    const compoundVowel = i < chars.length ? compoundJungseong.get(vowel + chars[i]) : null;
    if (compoundVowel) {
      vowel = compoundVowel;
      i += 1;
    }

    let final = "";
    if (i < chars.length && jongseongIndex.has(chars[i])) {
      const compoundFinal = i + 1 < chars.length ? compoundJongseong.get(chars[i] + chars[i + 1]) : null;
      if (compoundFinal && (i + 2 >= chars.length || !jungseongIndex.has(chars[i + 2]))) {
        final = compoundFinal;
        i += 2;
      }
      if (!final && (i + 1 >= chars.length || !jungseongIndex.has(chars[i + 1]))) {
        final = chars[i];
        i += 1;
      }
    }

    const codepoint = 0xac00 + (choseongIndex.get(initial) * 21 + jungseongIndex.get(vowel)) * 28 + (jongseongIndex.get(final) || 0);
    result.push(String.fromCharCode(codepoint));
  }
  return result.join("");
}

function normalizeData(value) {
  if (Array.isArray(value)) return value.map(normalizeData);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [normalizeText(key), normalizeData(item)])
    );
  }
  return typeof value === "string" ? normalizeText(value) : value;
}

function getSeenKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey) || "[]"));
  } catch {
    return new Set();
  }
}

function triggerKey(item) {
  return [item.id, item.dueAt || "", item.why || ""].join("|");
}

function saveSeenTriggers(items) {
  try {
    localStorage.setItem(seenKey, JSON.stringify(items.map(triggerKey)));
  } catch {
    // localStorage can be unavailable in some privacy modes.
  }
}

function priorityText(priority) {
  return { high: "긴급", medium: "중요", low: "관찰" }[priority] || "중요";
}

function typeText(type) {
  return type === "time" ? "시간" : "변화";
}

function importance(item, isNew) {
  const base = { high: 14, medium: 8, low: 4 }[item.priority] || 6;
  const timeBoost = item.triggerType === "time" ? 2 : 0;
  const newBoost = isNew ? 4 : 0;
  return base + timeBoost + newBoost;
}

function prepareItems(items) {
  const seen = getSeenKeys();
  const hasSeen = seen.size > 0;
  const prepared = items.map((item) => {
    const key = triggerKey(item);
    const isNew = hasSeen && !seen.has(key);
    if (isNew) sessionNewKeys.add(key);
    return { ...item, key, isNew: sessionNewKeys.has(key) };
  });
  return prepared
    .map((item) => ({ ...item, value: importance(item, item.isNew) }))
    .sort((a, b) => b.value - a.value);
}

function layoutTreemap(nodes, x, y, w, h) {
  if (!nodes.length) return [];
  if (nodes.length === 1) return [{ ...nodes[0], x, y, w, h }];

  const total = nodes.reduce((sum, node) => sum + node.value, 0);
  let acc = 0;
  let split = 0;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    if (Math.abs(total / 2 - (acc + nodes[i].value)) <= Math.abs(total / 2 - acc)) {
      acc += nodes[i].value;
      split = i + 1;
    } else {
      break;
    }
  }
  split = Math.max(1, split);
  const left = nodes.slice(0, split);
  const right = nodes.slice(split);
  const leftTotal = left.reduce((sum, node) => sum + node.value, 0);

  if (w >= h) {
    const leftWidth = Math.max(120, Math.round((w * leftTotal) / total));
    return [
      ...layoutTreemap(left, x, y, Math.min(leftWidth, w), h),
      ...layoutTreemap(right, x + leftWidth, y, Math.max(0, w - leftWidth), h)
    ];
  }

  const topHeight = Math.max(100, Math.round((h * leftTotal) / total));
  return [
    ...layoutTreemap(left, x, y, w, Math.min(topHeight, h)),
    ...layoutTreemap(right, x, y + topHeight, w, Math.max(0, h - topHeight))
  ];
}

function renderTreemap(items) {
  const canvas = $("treemapCanvas");
  const width = Math.max(320, canvas.clientWidth);
  const height = Math.max(440, canvas.clientHeight);
  const laidOut = layoutTreemap(items, 0, 0, width, height);

  canvas.innerHTML = laidOut.map((item) => {
    const areaClass = item.priority === "high" ? "urgent" : item.triggerType === "time" ? "time" : "change";
    const compact = item.w < 220 || item.h < 150 ? "compact" : "";
    return `
      <button class="map-tile ${areaClass} ${compact} ${item.isNew ? "is-new" : ""} ${selectedKey === item.key ? "is-selected" : ""}"
        style="left:${item.x}px; top:${item.y}px; width:${Math.max(0, item.w - 8)}px; height:${Math.max(0, item.h - 8)}px"
        data-trigger-key="${escapeHtml(item.key)}"
        type="button">
        <span class="tile-type">${escapeHtml(typeText(item.triggerType))}</span>
        ${item.isNew ? `<span class="tile-new">NEW</span>` : ""}
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.area)} · ${escapeHtml(item.timeLabel || "-")}</small>
        <span class="tile-signal">${escapeHtml((item.signals || [])[0] || priorityText(item.priority))}</span>
      </button>
    `;
  }).join("");

  canvas.querySelectorAll("[data-trigger-key]").forEach((tile) => {
    tile.addEventListener("click", () => {
      selectedKey = tile.dataset.triggerKey;
      const item = currentItems.find((candidate) => candidate.key === selectedKey);
      renderDetail(item);
      renderTreemap(currentItems);
      renderGraph();
    });
  });
}

function shortLabel(value, max = 16) {
  const text = normalizeText(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function makeNode(id, kind, label, weight = 1, ref = null) {
  return { id, kind, label, weight, ref };
}

function buildGraph(data, triggers) {
  const nodes = new Map();
  const edges = [];
  const addNode = (item) => {
    if (!nodes.has(item.id)) nodes.set(item.id, item);
  };
  const addEdge = (source, target, kind) => {
    if (source && target) edges.push({ source, target, kind });
  };

  triggers.slice(0, 9).forEach((trigger) => {
    const triggerId = `trigger:${trigger.key}`;
    addNode(makeNode(triggerId, "trigger", trigger.title, trigger.value, trigger.key));

    const areaId = `area:${trigger.area}`;
    addNode(makeNode(areaId, "area", trigger.area, 4));
    addEdge(triggerId, areaId, "area");

    (trigger.signals || []).slice(0, 3).forEach((signal) => {
      const signalId = `signal:${signal}`;
      addNode(makeNode(signalId, "signal", signal, 2));
      addEdge(triggerId, signalId, "signal");
    });
  });

  (data.reviewItems || []).slice(0, 6).forEach((item) => {
    const reviewId = `review:${item.id}`;
    addNode(makeNode(reviewId, "check", item.title, item.priority === "high" ? 5 : 3));
    addNode(makeNode(`area:${item.area}`, "area", item.area, 4));
    addEdge(reviewId, `area:${item.area}`, "area");
    (item.signals || []).slice(0, 2).forEach((signal) => {
      addNode(makeNode(`signal:${signal}`, "signal", signal, 2));
      addEdge(reviewId, `signal:${signal}`, "signal");
    });
  });

  (data.workSummaries || []).slice(0, 6).forEach((item) => {
    const workId = `work:${item.id}`;
    addNode(makeNode(workId, "work", item.title, Math.max(2, item.total || 1)));
    addNode(makeNode(`area:${item.folderLabel}`, "area", item.folderLabel, 4));
    addEdge(workId, `area:${item.folderLabel}`, "area");
    (item.signals || []).slice(0, 2).forEach((signal) => {
      addNode(makeNode(`signal:${signal}`, "signal", signal, 2));
      addEdge(workId, `signal:${signal}`, "signal");
    });
  });

  return { nodes: [...nodes.values()].slice(0, 34), edges };
}

function connectedNodeIds(graph, selectedTriggerId) {
  const connected = new Set([selectedTriggerId]);
  graph.edges.forEach((edge) => {
    if (edge.source === selectedTriggerId) connected.add(edge.target);
    if (edge.target === selectedTriggerId) connected.add(edge.source);
  });
  graph.edges.forEach((edge) => {
    if (connected.has(edge.source)) connected.add(edge.target);
    if (connected.has(edge.target)) connected.add(edge.source);
  });
  return connected;
}

function graphPositions(nodes, width, height, selectedId) {
  const selected = nodes.find((item) => item.id === selectedId) || nodes.find((item) => item.kind === "trigger") || nodes[0];
  const rest = nodes.filter((item) => item.id !== selected?.id);
  const center = { x: width / 2, y: height / 2 };
  const radius = Math.max(120, Math.min(width, height) * 0.38);
  const positions = new Map();
  if (selected) positions.set(selected.id, center);
  rest.forEach((item, index) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / Math.max(1, rest.length);
    const kindRadius = item.kind === "area" ? radius * 0.58 : item.kind === "signal" ? radius * 0.85 : radius;
    positions.set(item.id, {
      x: center.x + Math.cos(angle) * kindRadius,
      y: center.y + Math.sin(angle) * kindRadius
    });
  });
  return positions;
}

function renderGraph() {
  const svg = $("relationGraph");
  if (!svg || !currentGraph.nodes.length) return;
  const width = Math.max(320, svg.clientWidth || 960);
  const height = Math.max(360, svg.clientHeight || 460);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const selectedId = `trigger:${selectedKey}`;
  const nodesById = new Map(currentGraph.nodes.map((item) => [item.id, item]));
  const connected = connectedNodeIds(currentGraph, selectedId);
  const positions = graphPositions(currentGraph.nodes, width, height, selectedId);

  const edgeMarkup = currentGraph.edges
    .filter((edge) => nodesById.has(edge.source) && nodesById.has(edge.target))
    .map((edge) => {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      const active = connected.has(edge.source) && connected.has(edge.target);
      return `<line class="${active ? "active" : ""}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
    }).join("");

  const nodeMarkup = currentGraph.nodes.map((item) => {
    const pos = positions.get(item.id);
    const active = connected.has(item.id);
    const selected = item.id === selectedId;
    const r = selected ? 30 : item.kind === "trigger" ? 23 : item.kind === "area" ? 20 : 17;
    return `
      <g class="graph-node ${escapeHtml(item.kind)} ${active ? "active" : ""} ${selected ? "selected" : ""}" transform="translate(${pos.x},${pos.y})" data-node-id="${escapeHtml(item.id)}">
        <circle r="${r}"></circle>
        <text y="${r + 16}" text-anchor="middle">${escapeHtml(shortLabel(item.label, selected ? 18 : 13))}</text>
      </g>
    `;
  }).join("");

  svg.innerHTML = `<g class="graph-edges">${edgeMarkup}</g><g class="graph-nodes">${nodeMarkup}</g>`;
  setText("graphTotal", `${number.format(currentGraph.nodes.length)}개 노드`);

  svg.querySelectorAll(".graph-node").forEach((el) => {
    el.addEventListener("click", () => {
      const item = nodesById.get(el.dataset.nodeId);
      if (item?.kind === "trigger" && item.ref) {
        selectedKey = item.ref;
        const trigger = currentItems.find((candidate) => candidate.key === selectedKey);
        renderDetail(trigger);
        renderTreemap(currentItems);
        renderGraph();
      }
    });
  });
}

function renderDetail(item) {
  const detail = item || currentItems[0] || {
    triggerType: "change",
    priority: "medium",
    title: "박스를 선택하세요",
    why: "박스를 선택하면 필요한 맥락만 표시됩니다.",
    nextAction: "-",
    signals: []
  };
  $("detailPanel").className = `detail-panel priority-${detail.priority || "medium"}`;
  setText("detailKind", typeText(detail.triggerType));
  setText("detailPriority", priorityText(detail.priority));
  setText("detailTitle", detail.title);
  setText("detailWhy", detail.why);
  setText("detailAction", detail.nextAction);
  $("detailSignals").innerHTML = (detail.signals || [])
    .map((signal) => `<span>${escapeHtml(signal)}</span>`)
    .join("");
}

function renderSignals(data, items) {
  const summary = data.triggerSummary || {};
  setText("triggerTotal", `${number.format(summary.total || items.length || 0)}개`);
  setText("changeTriggerTotal", number.format(summary.changeTotal || 0));
  setText("timeTriggerTotal", number.format(summary.timeTotal || 0));
  setText("highTriggerTotal", number.format(summary.highTotal || 0));
  setText("newTriggerTotal", number.format(items.filter((item) => item.isNew).length));
  setText("nextTrigger", summary.nextTrigger || "-");
  setText("nextTriggerTime", summary.nextTriggerTime || "-");
}

function renderSummary(data) {
  const s = data.summary;
  setText("latestTotal", number.format(s.latestTotal));
  setText("latestAdded", number.format(s.latestAdded));
  setText("latestModified", number.format(s.latestModified));
  setText("latestDeleted", number.format(s.latestDeleted));
  setText("latestTime", `${fmtDate(s.latestTime)} 기준`);
  setText("recentTotal", number.format(s.recentTotal));
  setText("generatedAt", `데이터 생성 ${fmtDate(data.generatedAt)}`);
  setText("privacyMode", data.privacy.mode === "public_summary" ? "세부 경로 숨김" : "내부 상세");
}

function renderBackup(backup) {
  const badge = $("backupBadge");
  const errors = backup.errors || 0;
  const state = backup.state || "unknown";
  badge.textContent = errors ? "검토 필요" : state === "running" ? "진행 중" : state;
  badge.className = `badge ${errors ? "danger" : "neutral"}`;
  const progress = backup.filesTotal ? `${number.format(backup.filesDone || 0)} / ${number.format(backup.filesTotal)} (${backup.filePercent || 0}%)` : "-";
  setText("backupProgress", progress);
  setText("backupErrors", errors ? `${number.format(errors)}건` : "없음");
  setText("backupUpdated", fmtDate(backup.logUpdated));
}

function renderTrend(reports) {
  const max = Math.max(...reports.map((r) => r.total), 1);
  $("trendBars").innerHTML = reports.slice().reverse().map((r) => {
    const h = Math.max(8, Math.round((r.total / max) * 100));
    return `<div class="bar" title="${fmtDate(r.time)} ${r.total}건" style="height:${h}%"></div>`;
  }).join("");

  $("timeline").innerHTML = reports.map((r) => `
    <div class="timeline-row">
      <time>${escapeHtml(fmtDate(r.time))}</time>
      <div class="timeline-topics">
        ${(r.topics || []).slice(0, 3).map((topic) => `<span>${escapeHtml(topic)}</span>`).join("")}
      </div>
    </div>
  `).join("");
}

function renderReviewItems(items) {
  setText("reviewTotal", `${number.format(items.length)}개`);
  $("reviewItems").innerHTML = items.slice(0, 6).map((item) => `
    <article class="compact-row priority-${escapeHtml(item.priority)}">
      <span>${escapeHtml(item.area)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.nextAction)}</small>
    </article>
  `).join("");
}

function renderWorkSummaries(items) {
  setText("workSummaryTotal", `${number.format(items.length)}개`);
  $("workCards").innerHTML = items.slice(0, 6).map((item) => `
    <article class="compact-row">
      <span>${escapeHtml(item.folderLabel)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml((item.signals || []).join(" · "))}</small>
    </article>
  `).join("");
}

async function refreshDashboard() {
  const res = await fetch("./data.json", { cache: "no-store" });
  const data = normalizeData(await res.json());
  currentData = data;
  currentItems = prepareItems(data.triggerItems || []);
  if (!selectedKey || !currentItems.some((item) => item.key === selectedKey)) {
    selectedKey = currentItems[0]?.key || null;
  }

  renderSignals(data, currentItems);
  renderSummary(data);
  renderTreemap(currentItems);
  currentGraph = buildGraph(data, currentItems);
  renderDetail(currentItems.find((item) => item.key === selectedKey) || currentItems[0]);
  renderGraph();
  renderReviewItems(data.reviewItems || []);
  renderWorkSummaries(data.workSummaries || []);
  renderTrend(data.recentReports || []);
  renderBackup(data.backup || {});
  saveSeenTriggers(data.triggerItems || []);
}

async function boot() {
  await refreshDashboard();
  window.addEventListener("resize", () => {
    if (currentItems.length) {
      renderTreemap(currentItems);
      renderGraph();
    }
  });
  window.setInterval(refreshDashboard, 60_000);
}

boot().catch((err) => {
  document.body.innerHTML = `<main class="shell"><section class="panel"><h1>대시보드 데이터를 불러오지 못했습니다</h1><p>${escapeHtml(err.message)}</p></section></main>`;
});
