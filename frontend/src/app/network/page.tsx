"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCase } from "@/context/CaseContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getEdgeColorByType,
  formatEdgeLabel,
  RELATIONSHIP_CATEGORIES,
} from "../../three/networkColorUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilter,
  faUser,
  faBuilding,
  faMapMarkerAlt,
  faCar,
  faFileInvoice,
  faEnvelope,
  faCalendarAlt,
  faPhone,
  faShieldHalved,
  faRotateRight,
  faMouse,
  faArrowsUpDownLeftRight,
  faArrowPointer,
  faNetworkWired,
  faRoute,
  faTimes,
  faChevronDown,
  faChevronUp,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";

// Dynamically import the 3D scene to prevent SSR issues with Three.js
const NetworkScene = dynamic(() => import("../../three/NetworkScene"), { ssr: false });

function NetworkView() {
  const { activeCaseId, activeCase } = useCase();
  const { theme } = useTheme();
  const [graphData, setGraphData] = useState<any>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusParam = searchParams.get("focus");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(focusParam);

  // Network Depth Control (Requirement 9: 1 HOP, 2 HOPS, 3 HOPS, ALL)
  const [networkDepth, setNetworkDepth] = useState<"1" | "2" | "3" | "ALL">("2");

  // Relationship Filter (Requirement 10: ALL, COMMUNICATION, FINANCIAL, etc.)
  const [relationshipCategory, setRelationshipCategory] = useState<string>("ALL");

  // Legend visibility toggle
  const [legendOpen, setLegendOpen] = useState(true);

  // Connection Pathfinding (Requirement 14)
  const [isPathFinderOpen, setIsPathFinderOpen] = useState(false);
  const [pathStartNodeId, setPathStartNodeId] = useState<string>("");
  const [pathEndNodeId, setPathEndNodeId] = useState<string>("");
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [pathNotFound, setPathNotFound] = useState(false);

  useEffect(() => {
    if (focusParam) {
      setSelectedNodeId(focusParam);
    }
  }, [focusParam]);

  const [filters, setFilters] = useState({
    person: true,
    organization: true,
    location: true,
    phone: true,
    vehicle: true,
    account: true,
    email: true,
    event: true,
    alerts: true,
  });

  // API helper
  const getApiUrl = (path: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    return `${baseUrl}${path}`;
  };

  const getToken = useCallback(() => {
    return localStorage.getItem("token");
  }, []);

  // Fetch graph data for the active case
  const fetchGraphData = useCallback(
    async (caseId: string, silent: boolean = false) => {
      if (!caseId) return;
      const token = getToken();
      if (!token) return;

      try {
        if (!silent) setLoading(true);
        const res = await fetch(getApiUrl(`/api/network/${caseId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setGraphData(data);
        }
      } catch (err) {
        console.error("Failed to load network graph:", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [getToken]
  );

  useEffect(() => {
    if (activeCaseId) {
      fetchGraphData(activeCaseId);
    }
  }, [activeCaseId, fetchGraphData]);

  // Polling mechanism to auto-update graph when evidence finishes processing
  const wasProcessing = useRef<boolean>(false);
  const isPolling = useRef<boolean>(false);

  useEffect(() => {
    if (!activeCaseId) return;

    let intervalId: NodeJS.Timeout;

    const checkProcessingStatus = async () => {
      if (isPolling.current) return;
      isPolling.current = true;

      const token = getToken();
      if (!token) {
        isPolling.current = false;
        return;
      }

      try {
        const res = await fetch(getApiUrl(`/api/evidence/case/${activeCaseId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const evidenceList = await res.json();
          const processingCount = evidenceList.filter((e: any) => e.processing_status === "PROCESSING").length;

          if (processingCount > 0) {
            wasProcessing.current = true;
          } else if (processingCount === 0 && wasProcessing.current) {
            wasProcessing.current = false;
            fetchGraphData(activeCaseId, true);
          }
        }
      } catch (err) {
        console.error("Failed to check evidence processing status:", err);
      } finally {
        isPolling.current = false;
      }
    };

    wasProcessing.current = false;
    isPolling.current = false;
    intervalId = setInterval(checkProcessingStatus, 3000);
    checkProcessingStatus();

    return () => {
      clearInterval(intervalId);
    };
  }, [activeCaseId, fetchGraphData, getToken]);

  const handleFilterToggle = (key: keyof typeof filters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter nodes & links before passing to the 3D scene
  const filteredGraphData = React.useMemo(() => {
    if (!graphData || !graphData.nodes) return { nodes: [], links: [] };

    const filteredNodes = graphData.nodes.filter((node: any) => {
      const type = (node.type || "").toLowerCase();

      if (type === "person" && !filters.person) return false;
      if (type === "organization" && !filters.organization) return false;
      if (type === "location" && !filters.location) return false;
      if (type === "phone_number" && !filters.phone) return false;
      if (type === "phone" && !filters.phone) return false;
      if (type === "communication" && !filters.phone) return false;
      if (type === "vehicle" && !filters.vehicle) return false;
      if (type === "account" && !filters.account) return false;
      if (type === "email" && !filters.email) return false;
      if (type === "event" && !filters.event) return false;

      if (node.risk_score > 0.7 && !filters.alerts) return false;

      return true;
    });

    const nodeIds = new Set(filteredNodes.map((n: any) => String(n.id || n._id || "")));
    const rawLinks = graphData.links || graphData.edges || [];
    const filteredLinks = rawLinks.filter((link: any) => {
      const getLinkId = (val: any) =>
        typeof val === "object" && val ? String(val.id || val._id || "") : String(val || "");
      const sId = getLinkId(link.source);
      const tId = getLinkId(link.target);
      return nodeIds.has(sId) && nodeIds.has(tId);
    });

    return {
      nodes: filteredNodes,
      links: filteredLinks,
    };
  }, [graphData, filters]);

  // Count entities from graphData
  const counts = React.useMemo(() => {
    const counts = {
      person: 0,
      organization: 0,
      location: 0,
      phone: 0,
      vehicle: 0,
      account: 0,
      email: 0,
      event: 0,
      alerts: 0,
    };
    if (graphData && graphData.nodes) {
      graphData.nodes.forEach((node: any) => {
        const type = (node.type || "").toLowerCase();
        if (type === "person") counts.person++;
        else if (type === "organization") counts.organization++;
        else if (type === "location") counts.location++;
        else if (type === "phone" || type === "phone_number" || type === "communication") counts.phone++;
        else if (type === "vehicle") counts.vehicle++;
        else if (type === "account") counts.account++;
        else if (type === "email") counts.email++;
        else if (type === "event") counts.event++;

        if (node.risk_score > 0.7) counts.alerts++;
      });
    }
    return counts;
  }, [graphData]);

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  const selectedNode = React.useMemo(() => {
    if (!selectedNodeId || !graphData?.nodes) return null;
    return graphData.nodes.find((n: any) => String(n.id || n._id) === String(selectedNodeId)) || null;
  }, [selectedNodeId, graphData]);

  // Direct connections of the selected node (Requirement 12)
  const directConnections = React.useMemo(() => {
    if (!selectedNodeId || !graphData?.links || !graphData?.nodes) return [];
    const nodeMap = new Map<string, any>();
    graphData.nodes.forEach((n: any) => nodeMap.set(String(n.id || n._id), n));

    const connections: { entity: any; relationship: string; rawType: string; isOutgoing: boolean }[] = [];
    const sId = String(selectedNodeId);

    graphData.links.forEach((l: any) => {
      const src = typeof l.source === "object" ? String(l.source.id || l.source._id) : String(l.source);
      const tgt = typeof l.target === "object" ? String(l.target.id || l.target._id) : String(l.target);
      const rel = formatEdgeLabel(l.type || "LINKED");

      if (src === sId && nodeMap.has(tgt)) {
        connections.push({ entity: nodeMap.get(tgt), relationship: rel, rawType: l.type || "", isOutgoing: true });
      } else if (tgt === sId && nodeMap.has(src)) {
        connections.push({ entity: nodeMap.get(src), relationship: rel, rawType: l.type || "", isOutgoing: false });
      }
    });
    return connections;
  }, [selectedNodeId, graphData]);

  // Ensure category filter is enabled for focused entity if selected
  useEffect(() => {
    if (selectedNode) {
      const t = (selectedNode.type || "").toLowerCase();
      if (t === "person" && !filters.person) setFilters((f) => ({ ...f, person: true }));
      else if (t === "organization" && !filters.organization) setFilters((f) => ({ ...f, organization: true }));
      else if (t === "location" && !filters.location) setFilters((f) => ({ ...f, location: true }));
      else if ((t === "phone" || t === "phone_number" || t === "communication") && !filters.phone)
        setFilters((f) => ({ ...f, phone: true }));
      else if (t === "vehicle" && !filters.vehicle) setFilters((f) => ({ ...f, vehicle: true }));
      else if (t === "account" && !filters.account) setFilters((f) => ({ ...f, account: true }));
      else if (t === "email" && !filters.email) setFilters((f) => ({ ...f, email: true }));
      else if (t === "event" && !filters.event) setFilters((f) => ({ ...f, event: true }));
    }
  }, [selectedNode]);

  const handleClearHighlight = useCallback(() => {
    setSelectedNodeId(null);
    setHighlightedPath([]);
    router.replace("/network", { scroll: false });
    window.dispatchEvent(new CustomEvent("network:reset"));
  }, [router]);

  // Shortest Path Finder (Requirement 14)
  const handleFindConnection = useCallback(() => {
    if (!pathStartNodeId || !pathEndNodeId || pathStartNodeId === pathEndNodeId) return;

    const adj = new Map<string, string[]>();
    (graphData?.links || []).forEach((l: any) => {
      const s = typeof l.source === "object" ? String(l.source.id || l.source._id) : String(l.source);
      const t = typeof l.target === "object" ? String(l.target.id || l.target._id) : String(l.target);
      if (!adj.has(s)) adj.set(s, []);
      if (!adj.has(t)) adj.set(t, []);
      adj.get(s)!.push(t);
      adj.get(t)!.push(s);
    });

    const queue: string[][] = [[pathStartNodeId]];
    const visited = new Set<string>([pathStartNodeId]);
    let foundPath: string[] = [];

    while (queue.length > 0) {
      const path = queue.shift()!;
      const curr = path[path.length - 1];
      if (curr === pathEndNodeId) {
        foundPath = path;
        break;
      }
      const nbrs = adj.get(curr) || [];
      for (const nbr of nbrs) {
        if (!visited.has(nbr)) {
          visited.add(nbr);
          queue.push([...path, nbr]);
        }
      }
    }

    if (foundPath.length > 0) {
      setHighlightedPath(foundPath);
      setPathNotFound(false);
      setSelectedNodeId(pathStartNodeId);
    } else {
      setHighlightedPath([]);
      setPathNotFound(true);
    }
  }, [pathStartNodeId, pathEndNodeId, graphData]);

  const totalFilters = Object.keys(filters).length;

  return (
    <div className="flex h-full w-full bg-[var(--app-background)] text-[var(--text-primary)] font-sans relative gap-5">
      {/* Sidebar Controls */}
      <aside className="w-[340px] shrink-0 overflow-y-auto custom-scrollbar border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5 flex flex-col z-10 rounded-2xl shadow-xl flex-none gap-5">
        {/* HEADER */}
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--primary-accent)] transition-colors mb-3"
          >
            &larr; Back to Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              <FontAwesomeIcon icon={faNetworkWired} />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">3D LINK MAP</h1>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Investigation-focused visual intelligence topology.
          </p>
        </div>

        {/* Action: Find Connection Button (Requirement 14) */}
        <button
          onClick={() => setIsPathFinderOpen(!isPathFinderOpen)}
          className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between shadow-sm ${
            isPathFinderOpen
              ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
              : "bg-[var(--surface-secondary)]/60 text-[var(--text-primary)] border-[var(--border-primary)] hover:border-cyan-500/40 hover:text-cyan-400"
          }`}
        >
          <span className="flex items-center gap-2">
            <FontAwesomeIcon icon={faRoute} className="text-cyan-400" />
            FIND CONNECTION
          </span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/30 border border-white/10">
            {isPathFinderOpen ? "Close" : "Open"}
          </span>
        </button>

        {/* Pathfinding Modal / Dropdown Panel */}
        {isPathFinderOpen && (
          <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)] border border-cyan-500/30 flex flex-col gap-2.5 animate-fade-in shadow-lg">
            <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
              <span>Trace Shortest Relationship Path</span>
              <button onClick={() => setIsPathFinderOpen(false)} className="text-slate-400 hover:text-white">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Entity A (Start)</label>
              <select
                value={pathStartNodeId}
                onChange={(e) => setPathStartNodeId(e.target.value)}
                className="w-full text-xs p-2 rounded-lg bg-[var(--app-background)] border border-[var(--border-primary)] text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="">Select starting entity...</option>
                {graphData.nodes?.map((n: any) => (
                  <option key={String(n.id || n._id)} value={String(n.id || n._id)}>
                    {n.name} ({n.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Entity B (Target)</label>
              <select
                value={pathEndNodeId}
                onChange={(e) => setPathEndNodeId(e.target.value)}
                className="w-full text-xs p-2 rounded-lg bg-[var(--app-background)] border border-[var(--border-primary)] text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="">Select target entity...</option>
                {graphData.nodes?.map((n: any) => (
                  <option key={String(n.id || n._id)} value={String(n.id || n._id)}>
                    {n.name} ({n.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleFindConnection}
                disabled={!pathStartNodeId || !pathEndNodeId || pathStartNodeId === pathEndNodeId}
                className="flex-1 py-1.5 px-3 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
              >
                Trace Path
              </button>
              {highlightedPath.length > 0 && (
                <button
                  onClick={() => {
                    setHighlightedPath([]);
                    setPathNotFound(false);
                  }}
                  className="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-slate-300 rounded-lg text-xs font-bold"
                >
                  Clear
                </button>
              )}
            </div>

            {pathNotFound && (
              <p className="text-[11px] text-amber-400 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                No direct or indirect relationship found between these two entities.
              </p>
            )}

            {highlightedPath.length > 0 && (
              <div className="mt-1 p-2 rounded bg-cyan-500/10 border border-cyan-500/30 text-[11px] space-y-1">
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-widest block font-bold">
                  Connection Path ({highlightedPath.length} Nodes)
                </span>
                <div className="space-y-1 text-slate-200 font-mono text-[10px]">
                  {highlightedPath.map((id, idx) => {
                    const node = graphData.nodes?.find((n: any) => String(n.id || n._id) === id);
                    return (
                      <div key={id} className="flex items-center gap-1.5 truncate">
                        <span className="text-cyan-400">{idx + 1}.</span>
                        <span className="font-bold text-white truncate">{node?.name || id}</span>
                        <span className="text-[9px] text-slate-400 uppercase">({node?.type})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selected Entity Information Panel (Requirement 12) */}
        {selectedNode && (
          <div className="p-4 rounded-xl bg-gradient-to-b from-[#0B132B] to-[var(--surface-primary)] border border-cyan-500/40 flex flex-col gap-3 shadow-xl animate-fade-in">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  {selectedNode.type}
                </span>
                <h3 className="text-sm font-extrabold text-white mt-0.5 truncate max-w-[200px]">
                  {selectedNode.name}
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${
                  (selectedNode.risk_score || 0) >= 0.85
                    ? "bg-red-500/20 text-red-400 border-red-500/40"
                    : (selectedNode.risk_score || 0) >= 0.7
                    ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                    : (selectedNode.risk_score || 0) >= 0.4
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                }`}
              >
                Risk: {((selectedNode.risk_score || 0) * 100).toFixed(0)}%
              </span>
            </div>

            {/* Direct Connections List (Requirement 12) */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 uppercase tracking-wider border-b border-white/10 pb-1">
                <span>DIRECT CONNECTIONS</span>
                <span className="text-cyan-400 font-bold">{directConnections.length}</span>
              </div>
              <div className="max-h-[140px] overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                {directConnections.length === 0 ? (
                  <div className="text-[10px] text-slate-500 italic py-1">No direct links found.</div>
                ) : (
                  directConnections.map((conn, i) => {
                    const edgeStyle = getEdgeColorByType(conn.rawType, theme);
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedNodeId(String(conn.entity.id || conn.entity._id))}
                        className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-cyan-500/30 transition-all cursor-pointer flex flex-col"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-white truncate max-w-[150px]">
                            {conn.entity.name}
                          </span>
                          <span className="text-[8px] uppercase text-slate-400 font-mono">
                            {conn.entity.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: edgeStyle.line }}
                          ></span>
                          <span className="text-[9px] font-mono font-semibold" style={{ color: edgeStyle.line }}>
                            {conn.relationship}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick Action Buttons (Requirement 12) */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
              <Link
                href={`/evidence?case=${activeCaseId}`}
                className="py-1.5 px-2 text-center text-[10px] font-bold rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all"
              >
                View Evidence
              </Link>
              <Link
                href={`/timeline?case=${activeCaseId}`}
                className="py-1.5 px-2 text-center text-[10px] font-bold rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all"
              >
                View Timeline
              </Link>
              <button
                onClick={() => setNetworkDepth("ALL")}
                className="py-1.5 px-2 text-center text-[10px] font-bold rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 transition-all"
              >
                Expand Network
              </button>
              <button
                onClick={handleClearHighlight}
                className="py-1.5 px-2 text-center text-[10px] font-bold rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-all"
              >
                Clear Focus
              </button>
            </div>
          </div>
        )}

        {/* Category Filters */}
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <h2 className="text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
              <FontAwesomeIcon icon={faFilter} className="opacity-70" /> FILTER NODES
            </h2>
            <span className="text-[9px] font-mono text-[var(--text-secondary)] bg-[var(--surface-secondary)] px-2 py-0.5 rounded-full border border-[var(--border-primary)]">
              {activeFiltersCount} / {totalFilters}
            </span>
          </div>

          <div className="space-y-1.5">
            {[
              { id: "person", label: "Persons", color: "bg-blue-500", icon: faUser },
              { id: "organization", label: "Organizations", color: "bg-emerald-500", icon: faBuilding },
              { id: "location", label: "Locations", color: "bg-amber-500", icon: faMapMarkerAlt },
              { id: "vehicle", label: "Vehicles", color: "bg-orange-500", icon: faCar },
              { id: "account", label: "Accounts", color: "bg-cyan-500", icon: faFileInvoice },
              { id: "email", label: "Emails", color: "bg-pink-500", icon: faEnvelope },
              { id: "event", label: "Events", color: "bg-yellow-500", icon: faCalendarAlt },
              { id: "phone", label: "Communications", color: "bg-violet-500", icon: faPhone },
            ].map((f) => (
              <label
                key={f.id}
                className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer group ${
                  filters[f.id as keyof typeof filters]
                    ? "bg-[var(--surface-secondary)]/50 border-[var(--border-primary)] hover:border-cyan-500/50 hover:bg-[var(--surface-hover)]"
                    : "bg-[var(--surface-primary)] border-transparent opacity-60 hover:opacity-100 hover:bg-[var(--surface-secondary)]/30"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={filters[f.id as keyof typeof filters]}
                    onChange={() => handleFilterToggle(f.id as keyof typeof filters)}
                    className="rounded bg-[var(--surface-primary)] border-[var(--border-primary)] text-cyan-400 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 transition-colors"
                  />
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                    <span className={`h-2 w-2 rounded-full ${f.color} shadow-sm`}></span>
                    <FontAwesomeIcon icon={f.icon} className="text-[var(--text-muted)] text-[10px] w-3" />
                    {f.label}
                  </div>
                </div>
                {counts[f.id as keyof typeof counts] > 0 && (
                  <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--app-background)] px-1.5 py-0.5 rounded border border-[var(--border-primary)] shadow-sm">
                    {counts[f.id as keyof typeof counts]}
                  </span>
                )}
              </label>
            ))}

            {/* High Risk Separator */}
            <div className="h-px w-full bg-[var(--border-primary)] my-2"></div>

            <label
              className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer group ${
                filters.alerts
                  ? "bg-red-500/10 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.05)]"
                  : "bg-[var(--surface-primary)] border-transparent opacity-60 hover:opacity-100 hover:bg-red-500/5"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={filters.alerts}
                  onChange={() => handleFilterToggle("alerts")}
                  className="rounded bg-[var(--surface-primary)] border-red-500/50 text-red-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5"
                />
                <div
                  className={`flex items-center gap-2 text-xs font-bold transition-colors ${
                    filters.alerts ? "text-red-500" : "text-[var(--text-primary)]"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full transition-colors ${
                      filters.alerts ? "bg-red-500 animate-pulse" : "bg-red-500"
                    }`}
                  ></span>
                  <FontAwesomeIcon
                    icon={faShieldHalved}
                    className={
                      filters.alerts
                        ? "text-red-500 text-[10px] w-3 transition-colors"
                        : "text-[var(--text-muted)] text-[10px] w-3 transition-colors"
                    }
                  />
                  High Risk Flagged
                </div>
              </div>
              {counts.alerts > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shadow-sm transition-colors ${
                    filters.alerts
                      ? "text-red-400 bg-red-500/10 border-red-500/20"
                      : "text-[var(--text-muted)] bg-[var(--app-background)] border-[var(--border-primary)]"
                  }`}
                >
                  {counts.alerts}
                </span>
              )}
            </label>
          </div>
        </div>

        {/* Footer Navigation Tips */}
        <div className="mt-auto space-y-3 pt-3 border-t border-[var(--border-primary)]">
          <div className="bg-[var(--surface-secondary)]/50 rounded-xl border border-[var(--border-primary)] p-3 flex flex-col gap-2 shadow-inner">
            <h3 className="text-[9px] font-black text-[var(--text-tertiary)] uppercase tracking-widest">
              Camera Controls
            </h3>
            <div className="flex items-center gap-2.5 text-[11px] text-[var(--text-secondary)]">
              <FontAwesomeIcon icon={faArrowPointer} className="text-cyan-400 text-[10px]" />
              <span>Left Click + Drag: Rotate</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-[var(--text-secondary)]">
              <FontAwesomeIcon icon={faArrowsUpDownLeftRight} className="text-cyan-400 text-[10px]" />
              <span>Right Click + Drag: Pan</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-[var(--text-secondary)]">
              <FontAwesomeIcon icon={faMouse} className="text-cyan-400 text-[10px]" />
              <span>Scroll: Zoom In / Out</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 3D Canvas Visualizer & Control Bars */}
      <main className="flex-1 relative bg-[var(--surface-secondary)] dark:bg-[#111111] rounded-2xl overflow-hidden border border-[var(--border-primary)] dark:border-[#303030] shadow-inner flex flex-col">
        {/* Top Control Bar: Network Depth + Relationship Filter (Requirements 9 & 10) */}
        <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
          {/* Left: Depth Control & Active Entity Tag */}
          <div className="flex items-center gap-2 pointer-events-auto bg-white/90 dark:bg-[#1C1C1C]/95 backdrop-blur-md p-1.5 rounded-xl border border-[var(--border-primary)] dark:border-[#454545] shadow-xl">
            <span className="text-[9px] font-black text-slate-500 dark:text-[#A1A1AA] uppercase tracking-widest px-2 font-mono">
              DEPTH
            </span>
            {(["1", "2", "3", "ALL"] as const).map((depth) => (
              <button
                key={depth}
                onClick={() => setNetworkDepth(depth)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all tracking-wider font-mono ${
                  networkDepth === depth
                    ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 dark:bg-[#C7CDD4] dark:text-[#101010] dark:shadow-none"
                    : "text-slate-600 dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-[#222222] hover:text-black dark:hover:text-[#F5F5F5]"
                }`}
              >
                {depth === "ALL" ? "ALL" : `${depth} HOP`}
              </button>
            ))}
          </div>

          {/* Right: Relationship Category Filter (Requirement 10) */}
          <div className="flex items-center gap-1.5 pointer-events-auto bg-white/90 dark:bg-[#1C1C1C]/95 backdrop-blur-md p-1.5 rounded-xl border border-[var(--border-primary)] dark:border-[#454545] shadow-xl overflow-x-auto max-w-[620px] custom-scrollbar">
            <span className="text-[9px] font-black text-slate-500 dark:text-[#A1A1AA] uppercase tracking-widest px-2 font-mono shrink-0">
              RELATIONS
            </span>
            {RELATIONSHIP_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setRelationshipCategory(cat.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap tracking-wider font-mono shrink-0 flex items-center gap-1.5 ${
                  relationshipCategory === cat.id
                    ? "bg-slate-200 text-slate-900 dark:bg-[#292929] dark:text-[#F5F5F5] border border-slate-300 dark:border-[#454545] shadow-sm"
                    : "text-slate-500 dark:text-[#A1A1AA] hover:text-slate-800 dark:hover:text-[#F5F5F5] hover:bg-black/5 dark:hover:bg-[#222222]"
                }`}
              >
                {cat.id !== "ALL" && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }}></span>
                )}
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3D Scene */}
        {!activeCaseId ? (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-secondary)] text-sm italic z-10 bg-[var(--surface-primary)]">
            Please select an active Case File from the sidebar to visualize the 3D network topology.
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--surface-primary)] z-10">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-400 dark:border-[#C7CDD4]"></div>
            <span className="text-sm text-[var(--text-secondary)] font-mono">
              Rendering 3D graph structures...
            </span>
          </div>
        ) : (
          <div className="w-full h-full">
            <NetworkScene
              data={filteredGraphData}
              selectedNodeId={selectedNodeId}
              networkDepth={networkDepth}
              relationshipCategory={relationshipCategory}
              highlightedPath={highlightedPath}
              onNodeClick={(node: any) => {
                setSelectedNodeId(String(node.id || node._id));
              }}
            />
          </div>
        )}

        {/* Compact Bottom-Right Graph Legend (Requirement 11) */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end">
          {legendOpen ? (
            <div className="p-3 rounded-xl bg-white/95 dark:bg-[#1C1C1C]/95 backdrop-blur-md border border-[var(--border-primary)] dark:border-[#454545] shadow-2xl w-[260px] animate-fade-in font-sans text-xs">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-[#303030] pb-1.5 mb-2">
                <span className="text-[10px] font-black text-cyan-600 dark:text-[#C7CDD4] uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faInfoCircle} /> GRAPH LEGEND
                </span>
                <button
                  onClick={() => setLegendOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:text-[#858B93] dark:hover:text-[#F5F5F5] text-[10px] p-0.5"
                  title="Minimize legend"
                >
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>
              </div>

              {/* Entity Types (Requirement 11) */}
              <div className="mb-2">
                <span className="text-[9px] font-mono text-slate-500 dark:text-[#858B93] uppercase tracking-wider block mb-1">
                  Entity Types
                </span>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-700 dark:text-[#D4D4D8]">
                  <span className="flex items-center gap-1.5">
                    <span className="text-blue-400">●</span> Person
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-emerald-400">■</span> Organization
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-amber-400">◆</span> Location
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-orange-400">⬡</span> Vehicle
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-cyan-400">▣</span> Account
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-yellow-400">★</span> Event
                  </span>
                </div>
              </div>

              {/* Relationships (Requirement 11) */}
              <div className="border-t border-slate-200 dark:border-[#303030] pt-1.5">
                <span className="text-[9px] font-mono text-slate-500 dark:text-[#858B93] uppercase tracking-wider block mb-1">
                  Relationships
                </span>
                <div className="space-y-0.5 text-[10px] font-mono">
                  <div className="flex justify-between items-center text-[#22D3EE]">
                    <span>Communication</span>
                    <span className="tracking-tighter font-bold">──────</span>
                  </div>
                  <div className="flex justify-between items-center text-[#A78BFA]">
                    <span>Employment</span>
                    <span className="tracking-tighter font-bold">──────</span>
                  </div>
                  <div className="flex justify-between items-center text-[#FBBF24]">
                    <span>Vehicle</span>
                    <span className="tracking-tighter font-bold">- - - -</span>
                  </div>
                  <div className="flex justify-between items-center text-[#34D399]">
                    <span>Location</span>
                    <span className="tracking-tighter font-bold">──────</span>
                  </div>
                  <div className="flex justify-between items-center text-[#737B84]">
                    <span>Association</span>
                    <span className="tracking-tighter font-bold">- - - -</span>
                  </div>
                  <div className="flex justify-between items-center text-[#FB923C]">
                    <span>Financial</span>
                    <span className="tracking-tighter font-bold">══════</span>
                  </div>
                  <div className="flex justify-between items-center text-[#F472B6]">
                    <span>Ownership</span>
                    <span className="tracking-tighter font-bold">- - - -</span>
                  </div>
                  <div className="flex justify-between items-center text-[#2DD4BF]">
                    <span>Movement</span>
                    <span className="tracking-tighter font-bold">────▶</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLegendOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white/90 hover:bg-white dark:bg-[#1C1C1C]/95 dark:hover:bg-[#222222] backdrop-blur-md border border-[var(--border-primary)] dark:border-[#454545] text-cyan-600 dark:text-[#C7CDD4] text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2 shadow-xl"
            >
              <FontAwesomeIcon icon={faInfoCircle} />
              <span>Legend</span>
              <FontAwesomeIcon icon={faChevronUp} className="text-[10px]" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export default function NetworkPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-[var(--app-background)] text-[var(--text-secondary)]">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-400"></div>
        </div>
      }
    >
      <NetworkView />
    </React.Suspense>
  );
}
