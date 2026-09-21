"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useCase } from "@/context/CaseContext";

export default function AlertsPage() {
  const { activeCaseId } = useCase();
  const [dbAlerts, setDbAlerts] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "REVIEWED" | "RESOLVED" | "ALL">("ACTIVE");
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Resolution modal state
  const [resolvingAlert, setResolvingAlert] = useState<any | null>(null);
  const [dispositionChoice, setDispositionChoice] = useState<"INNOCENT" | "FALSE_POSITIVE" | "MITIGATED">("INNOCENT");
  const [resolutionNotes, setResolutionNotes] = useState<string>("Subject cleared by investigator. Verified innocent and free to go.");
  const [clearEntityCheckbox, setClearEntityCheckbox] = useState<boolean>(true);
  const [submittingResolution, setSubmittingResolution] = useState(false);

  const getApiUrl = (path: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    return `${baseUrl}${path}`;
  };

  const fetchAlertsAndData = useCallback(async () => {
    if (!activeCaseId) {
      setDbAlerts([]);
      setEntities([]);
      setRelationships([]);
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("token");
    try {
      setLoading(true);
      
      // Fetch Entities
      const entRes = await fetch(getApiUrl(`/api/entities?case_id=${activeCaseId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (entRes.ok) setEntities(await entRes.json());

      // Fetch Relationships
      const relRes = await fetch(getApiUrl(`/api/relationships?case_id=${activeCaseId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (relRes.ok) setRelationships(await relRes.json());

      // Fetch Alerts
      const res = await fetch(getApiUrl(`/api/alerts?case_id=${activeCaseId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setDbAlerts(await res.json());

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeCaseId]);

  useEffect(() => {
    fetchAlertsAndData();
  }, [fetchAlertsAndData]);

  // Helper to test if an entity is cleared / innocent
  const isClearedEntity = useCallback((ent: any) => {
    if (!ent) return false;
    const props = ent.properties || {};
    // If explicitly marked ACTIVE or not cleared, it is NEVER cleared!
    if (
      ent.disposition === "ACTIVE" ||
      props.clearance_status === "ACTIVE" ||
      props.is_cleared === false ||
      props.disposition === "ACTIVE"
    ) {
      return false;
    }
    return (
      ent.disposition === "CLEARED" ||
      props.is_cleared === true ||
      props.clearance_status === "FREE_TO_GO"
    );
  }, []);

  // Quick review status update
  const handleReviewStatus = async (alert: any) => {
    const token = localStorage.getItem("token");
    try {
      if (alert._id.startsWith("generated_")) {
        const res = await fetch(getApiUrl("/api/alerts/resolve"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            case_id: activeCaseId,
            alert_id: alert._id,
            entity_id: alert.entity_id,
            disposition: "REVIEWED",
            resolution_notes: "Alert reviewed by investigator.",
            clear_entity: false,
            message: alert.message,
            type: alert.type,
            severity: alert.severity
          })
        });
        if (res.ok) {
          setMessage({ text: "Alert moved to REVIEWED.", isError: false });
          fetchAlertsAndData();
        }
        return;
      }

      const res = await fetch(getApiUrl(`/api/alerts/${alert._id}/status?status=REVIEWED`), {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setMessage({ text: "Alert marked as REVIEWED.", isError: false });
        fetchAlertsAndData();
      } else {
        setMessage({ text: "Failed to update alert status.", isError: true });
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: "Connection error.", isError: true });
    }
  };

  // Open the resolution dialog
  const openResolveModal = (alert: any) => {
    const ent = entities.find(e => e._id === alert.entity_id);
    const targetName = ent ? ent.name : "Target";
    setResolvingAlert(alert);
    setDispositionChoice("INNOCENT");
    setResolutionNotes(`Subject '${targetName}' cleared by investigator. Verified innocent and free to go.`);
    setClearEntityCheckbox(true);
  };

  // Submit resolution
  const handleConfirmResolve = async () => {
    if (!resolvingAlert || !activeCaseId) return;
    setSubmittingResolution(true);
    const token = localStorage.getItem("token");

    const ent = entities.find(e => e._id === resolvingAlert.entity_id);
    const targetName = ent ? ent.name : "Target";

    try {
      const res = await fetch(getApiUrl("/api/alerts/resolve"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          case_id: activeCaseId,
          alert_id: resolvingAlert._id,
          entity_id: resolvingAlert.entity_id,
          disposition: dispositionChoice,
          resolution_notes: resolutionNotes,
          clear_entity: clearEntityCheckbox,
          message: resolvingAlert.message,
          type: resolvingAlert.type,
          severity: resolvingAlert.severity
        })
      });

      if (res.ok) {
        const dispText = dispositionChoice === "INNOCENT" ? "Innocent / Free to Go" : dispositionChoice;
        setMessage({
          text: `Entity '${targetName}' marked as ${dispText}. Cleared and excluded from active threats.`,
          isError: false
        });
        setResolvingAlert(null);
        await fetchAlertsAndData();
      } else {
        setMessage({ text: "Failed to resolve alert.", isError: true });
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: "Connection error resolving alert.", isError: true });
    } finally {
      setSubmittingResolution(false);
    }
  };

  // Re-open an alert / entity
  const handleReopen = async (alert: any) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(getApiUrl("/api/alerts/reopen"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          case_id: activeCaseId,
          alert_id: alert._id,
          entity_id: alert.entity_id
        })
      });

      if (res.ok) {
        setMessage({ text: "Alert and entity restored to ACTIVE investigation.", isError: false });
        setActiveTab("ACTIVE");
        await fetchAlertsAndData();
      } else {
        setMessage({ text: "Failed to re-open alert.", isError: true });
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: "Connection error re-opening alert.", isError: true });
    }
  };

  // Generate dynamic alerts based on real case data, excluding cleared entities
  const allAlerts = useMemo(() => {
    const generated: any[] = [];
    
    // 1. High Risk Entities (SKIP CLEARED ENTITIES)
    entities.forEach(ent => {
      const cleared = isClearedEntity(ent);

      if (cleared) {
        // If entity is cleared, ensure it appears under RESOLVED tab with its clear status
        const hasDbAlert = dbAlerts.some(a => a.entity_id === ent._id && a.status === "RESOLVED");
        if (!hasDbAlert) {
          generated.push({
            _id: `resolved_ent_${ent._id}`,
            type: "CLEARED / INNOCENT",
            severity: "LOW",
            status: "RESOLVED",
            disposition: ent.properties?.disposition || "INNOCENT",
            resolution_notes: ent.properties?.resolution_notes || "Entity cleared by investigator. Free to go.",
            resolved_at: ent.properties?.cleared_at || ent.updated_at,
            resolved_by: ent.properties?.cleared_by,
            message: `Entity '${ent.name}' is cleared (Innocent / Free to Go). Suspicion removed from active case analysis.`,
            entity_id: ent._id,
            created_at: ent.properties?.cleared_at || ent.updated_at || new Date().toISOString()
          });
        }
        return; // Do NOT generate active high risk alert for cleared entity
      }

      if (ent.risk_score >= 0.7) {
        generated.push({
          _id: `generated_risk_${ent._id}`,
          type: "HIGH RISK",
          severity: "HIGH",
          status: "ACTIVE",
          message: `High risk entity detected: ${ent.name}. Risk Score is ${ent.risk_score.toFixed(2)}. Immediate review recommended.`,
          entity_id: ent._id,
          created_at: ent.created_at || new Date().toISOString()
        });
      }
      
      // 2. Suspicious Activity (Flagged)
      if (ent.properties?.flagged) {
        generated.push({
          _id: `generated_flag_${ent._id}`,
          type: "SUSPICIOUS ACTIVITY",
          severity: "HIGH",
          status: "ACTIVE",
          message: `Entity ${ent.name} was flagged for suspicious activity during extraction.`,
          entity_id: ent._id,
          created_at: ent.created_at || new Date().toISOString()
        });
      }
    });

    // 3. High Threat Relationships
    relationships.forEach(rel => {
      const threatTypes = ["KILLED", "ORDERED", "FINANCED", "SMUGGLED", "TRAFFICKED"];
      if (threatTypes.includes(rel.type?.toUpperCase())) {
        const sourceEnt = entities.find(e => e._id === rel.source_entity_id);
        const targetEnt = entities.find(e => e._id === rel.target_entity_id);
        
        if (sourceEnt && targetEnt) {
          // If both parties are cleared, skip active threat link
          if (isClearedEntity(sourceEnt) && isClearedEntity(targetEnt)) return;

          generated.push({
            _id: `generated_rel_${rel._id}`,
            type: "THREAT LINK DETECTED",
            severity: "HIGH",
            status: "ACTIVE",
            message: `Critical network link established: ${sourceEnt.name} [${rel.type}] ${targetEnt.name}.`,
            entity_id: sourceEnt._id,
            created_at: rel.created_at || new Date().toISOString()
          });
        }
      }
      
      // 4. New Connection Made (General)
      if (!threatTypes.includes(rel.type?.toUpperCase())) {
         const sourceEnt = entities.find(e => e._id === rel.source_entity_id);
         const targetEnt = entities.find(e => e._id === rel.target_entity_id);
         if (sourceEnt && targetEnt && rel.type) {
            generated.push({
              _id: `generated_conn_${rel._id}`,
              type: "NEW CONNECTION",
              severity: "MEDIUM",
              status: "REVIEWED",
              message: `New network connection mapped: ${sourceEnt.name} is connected to ${targetEnt.name} via ${rel.type}.`,
              entity_id: sourceEnt._id,
              created_at: rel.created_at || new Date().toISOString()
            });
         }
      }
    });

    // Filter out dynamic alerts for entities that already have a DB alert
    const dbAlertEntityIds = new Set(dbAlerts.map(a => `${a.entity_id}_${a.type}`));
    const nonDuplicatedGenerated = generated.filter(g => !dbAlertEntityIds.has(`${g.entity_id}_${g.type}`));

    // Combine and deduplicate
    const combined = [...dbAlerts, ...nonDuplicatedGenerated].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return combined;
  }, [dbAlerts, entities, relationships, isClearedEntity]);

  const filteredAlerts = allAlerts.filter((alert: any) => {
    const status = alert.status || "ACTIVE";
    const statusMatch = activeTab === "ALL" || status === activeTab;
    const severityMatch = severityFilter === "ALL" || (alert.severity || "LOW") === severityFilter;
    return statusMatch && severityMatch;
  });

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-20">
      {/* Header */}
      <div className="border-b border-[var(--border-primary)] pb-5 shrink-0 px-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">Intelligence Alerts Center</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Triage anomalous activities, high-risk centrality flags, and direct security risks generated from your case data.
        </p>
      </div>

      {message && (
        <div className={`p-4 mx-2 rounded-xl border text-sm flex justify-between items-center shadow-sm ${
          message.isError ? "bg-[var(--danger)]/10 border-[var(--danger)]/20 text-[var(--danger)]" : "bg-[var(--success)]/10 border-[var(--success)]/20 text-[var(--success)]"
        }`}>
          <div className="flex items-center gap-2">
            <i className={`fa-solid ${message.isError ? "fa-circle-exclamation" : "fa-circle-check"}`}></i>
            <span className="font-bold">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs font-bold hover:opacity-80"><i className="fa-solid fa-xmark"></i></button>
        </div>
      )}

      {!activeCaseId ? (
        <div className="p-16 mx-2 border border-dashed border-[var(--border-primary)] rounded-2xl text-center text-[var(--text-muted)] bg-[var(--surface-secondary)]">
          <i className="fa-solid fa-bell text-4xl mb-3 opacity-50"></i>
          <p>Please select an active Case File from the sidebar to view generated threat alerts.</p>
        </div>
      ) : loading ? (
        <div className="p-16 mx-2 flex flex-col items-center justify-center gap-3 border border-[var(--border-primary)] rounded-2xl bg-[var(--surface-primary)]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--accent-primary)]"></div>
          <span className="text-xs text-[var(--text-secondary)]">Retrieving case threat logs...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6 px-2">
          
          {/* Controls Bar */}
          <div className="flex flex-wrap gap-4 items-center justify-between bg-[var(--surface-secondary)] p-4 border border-[var(--border-primary)] rounded-xl shadow-sm">
            {/* Tabs */}
            <div className="flex gap-2">
              {(["ACTIVE", "REVIEWED", "RESOLVED", "ALL"] as const).map((tab) => {
                const count = tab === "ALL" ? allAlerts.length : allAlerts.filter((a) => (a.status || "ACTIVE") === tab).length;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`filter-tab ${activeTab === tab ? 'active' : 'inactive'}`}
                  >
                    {tab} <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] ${activeTab === tab ? "bg-black/20 text-white" : "bg-[var(--surface-tertiary)] text-[var(--text-muted)]"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Severity:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="input-field py-2 bg-[var(--surface-primary)] min-w-[150px]"
              >
                <option value="ALL">All Severities</option>
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </select>
            </div>
          </div>

          {/* Results list */}
          {filteredAlerts.length === 0 ? (
            <div className="p-16 border border-dashed border-[var(--border-primary)] rounded-2xl text-center text-[var(--text-muted)] bg-[var(--surface-secondary)]">
              <i className="fa-regular fa-face-smile text-4xl mb-3 opacity-50"></i>
              <p>No threat alerts found matching your criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredAlerts.map((alert: any) => {
                const entityMatch = entities.find((e) => e._id === alert.entity_id);
                const isCleared = entityMatch ? isClearedEntity(entityMatch) : (alert.disposition === "INNOCENT" || alert.type?.includes("CLEARED"));
                const isResolved = alert.status === "RESOLVED";

                // Styling based on severity & resolution
                let sevStyle = "bg-[var(--surface-tertiary)] text-[var(--text-muted)] border-[var(--border-primary)]";
                let icon = "fa-bell";

                if (isResolved) {
                  sevStyle = "bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30";
                  icon = "fa-shield-halved";
                } else if (alert.severity === "HIGH") {
                  sevStyle = "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20 shadow-[0_0_10px_var(--danger)]/10";
                  icon = "fa-triangle-exclamation animate-pulse";
                } else if (alert.severity === "MEDIUM") {
                  sevStyle = "bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20";
                  icon = "fa-circle-exclamation";
                }

                return (
                  <div 
                    key={alert._id} 
                    className={`alert-card ${isResolved ? "resolved border-[var(--success)]/30 bg-[var(--surface-primary)]" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex gap-2.5 items-center flex-wrap">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${sevStyle}`}>
                          <i className={`fa-solid ${icon}`}></i>
                        </div>
                        {isResolved ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/30 flex items-center gap-1">
                            <i className="fa-solid fa-check"></i> {alert.disposition === "INNOCENT" || isCleared ? "CLEARED / INNOCENT — FREE TO GO" : "RESOLVED"}
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${sevStyle}`}>
                            {alert.type}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono font-medium bg-[var(--surface-tertiary)] px-2 py-1 rounded">
                        {new Date(alert.created_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <p className="text-[var(--text-primary)] text-sm font-medium leading-relaxed my-2">{alert.message}</p>

                    {/* Resolved Context Banner */}
                    {isResolved && (
                      <div className="bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-xl p-3 my-1 text-xs text-[var(--text-primary)] flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-[var(--success)] font-bold">
                          <i className="fa-solid fa-circle-check"></i>
                          <span>Subject Cleared — Free to Go (Excluded from Active Threats)</span>
                        </div>
                        {alert.resolution_notes && (
                          <p className="text-[11px] text-[var(--text-secondary)] italic">
                            &ldquo;{alert.resolution_notes}&rdquo;
                          </p>
                        )}
                        {alert.resolved_at && (
                          <span className="text-[9px] text-[var(--text-muted)] font-mono">
                            Resolved: {new Date(alert.resolved_at).toLocaleString()} {alert.resolved_by ? `• by ${alert.resolved_by}` : ""}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-auto pt-4 border-t border-[var(--border-primary)]">
                      <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5 flex-wrap">
                        {entityMatch ? (
                          <>
                            Target: <span className="font-bold text-[var(--text-primary)] px-1.5 py-0.5 rounded target-badge">{entityMatch.name}</span>
                            <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider font-mono">({entityMatch.type})</span>
                            {isCleared && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 font-mono">
                                RISK: 0.00 (INNOCENT)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="italic">System Alert</span>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        {!isResolved && alert.status !== "REVIEWED" && (
                          <button
                            onClick={() => handleReviewStatus(alert)}
                            className="px-3 py-1.5 bg-[var(--surface-tertiary)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] text-xs rounded-lg font-bold transition-all shadow-sm"
                          >
                            <i className="fa-solid fa-eye mr-1"></i> Review
                          </button>
                        )}
                        {!isResolved && (
                          <button
                            onClick={() => openResolveModal(alert)}
                            className="px-3 py-1.5 bg-[var(--success)] hover:brightness-110 text-white text-xs rounded-lg font-bold transition-all shadow-sm flex items-center gap-1.5"
                          >
                            <i className="fa-solid fa-check"></i> Resolve
                          </button>
                        )}
                        {isResolved && (
                          <button
                            onClick={() => handleReopen(alert)}
                            className="px-3 py-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs rounded-lg font-bold transition-all shadow-sm flex items-center gap-1.5"
                          >
                            <i className="fa-solid fa-arrow-rotate-left"></i> Re-Open
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* RESOLUTION MODAL */}
      {resolvingAlert && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface-primary)] border border-[var(--border-secondary)] rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-[var(--border-primary)] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--success)]/15 border border-[var(--success)]/30 flex items-center justify-center text-[var(--success)] text-lg">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[var(--text-primary)]">Resolve Intelligence Alert</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Set investigation disposition for this subject/threat</p>
                </div>
              </div>
              <button 
                onClick={() => setResolvingAlert(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm p-1"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Target Summary Card */}
            {(() => {
              const ent = entities.find(e => e._id === resolvingAlert.entity_id);
              return (
                <div className="bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded-xl p-3.5 flex flex-col gap-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)] font-mono uppercase text-[10px]">Subject Target</span>
                    {ent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[var(--danger)]/15 text-[var(--danger)] border border-[var(--danger)]/30">
                        Risk: {ent.risk_score?.toFixed(2) || "0.00"}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-extrabold text-[var(--text-primary)]">
                    {ent ? ent.name : "System Alert Target"}
                    {ent?.type && <span className="ml-2 text-xs font-mono font-normal text-[var(--text-secondary)]">({ent.type})</span>}
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-1">{resolvingAlert.message}</p>
                </div>
              );
            })()}

            {/* Disposition Selector */}
            <div className="flex flex-col gap-2.5">
              <label className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Select Resolution Disposition:
              </label>
              <div className="flex flex-col gap-2">
                <label 
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    dispositionChoice === "INNOCENT" 
                      ? "bg-[var(--success)]/10 border-[var(--success)]/40 shadow-sm" 
                      : "bg-[var(--surface-secondary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)]"
                  }`}
                >
                  <input 
                    type="radio" 
                    name="disposition" 
                    value="INNOCENT" 
                    checked={dispositionChoice === "INNOCENT"} 
                    onChange={() => {
                      setDispositionChoice("INNOCENT");
                      setResolutionNotes("Subject cleared by investigator. Verified innocent and free to go.");
                    }}
                    className="mt-1"
                  />
                  <div className="flex flex-col text-xs">
                    <span className="font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                      <i className="fa-solid fa-circle-check text-[var(--success)]"></i> Innocent / Free to Go (Clear Entity)
                    </span>
                    <span className="text-[var(--text-secondary)] text-[11px] mt-0.5">
                      Subject is verified innocent. Risk score is set to 0.00 and this entity will <strong>not be considered again</strong> in future threat sweeps.
                    </span>
                  </div>
                </label>

                <label 
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    dispositionChoice === "FALSE_POSITIVE" 
                      ? "bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/40 shadow-sm" 
                      : "bg-[var(--surface-secondary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)]"
                  }`}
                >
                  <input 
                    type="radio" 
                    name="disposition" 
                    value="FALSE_POSITIVE" 
                    checked={dispositionChoice === "FALSE_POSITIVE"} 
                    onChange={() => {
                      setDispositionChoice("FALSE_POSITIVE");
                      setResolutionNotes("Alert determined to be a false positive / harmless data artifact.");
                    }}
                    className="mt-1"
                  />
                  <div className="flex flex-col text-xs">
                    <span className="font-extrabold text-[var(--text-primary)]">False Positive / Noise</span>
                    <span className="text-[var(--text-secondary)] text-[11px] mt-0.5">
                      Flagged activity was benign, non-pertinent, or an extraction anomaly.
                    </span>
                  </div>
                </label>

                <label 
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    dispositionChoice === "MITIGATED" 
                      ? "bg-[var(--warning)]/10 border-[var(--warning)]/40 shadow-sm" 
                      : "bg-[var(--surface-secondary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)]"
                  }`}
                >
                  <input 
                    type="radio" 
                    name="disposition" 
                    value="MITIGATED" 
                    checked={dispositionChoice === "MITIGATED"} 
                    onChange={() => {
                      setDispositionChoice("MITIGATED");
                      setResolutionNotes("Security threat mitigated and investigation inquiry closed.");
                    }}
                    className="mt-1"
                  />
                  <div className="flex flex-col text-xs">
                    <span className="font-extrabold text-[var(--text-primary)]">Mitigated / Investigation Closed</span>
                    <span className="text-[var(--text-secondary)] text-[11px] mt-0.5">
                      Action was taken, threat addressed, and inquiry concluded.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Investigator Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Investigator Finding / Notes:
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={2}
                className="input-field py-2 text-xs bg-[var(--surface-secondary)] w-full resize-none"
                placeholder="Enter justification or reason for resolution..."
              />
            </div>

            {/* Clear Entity Checkbox */}
            {resolvingAlert.entity_id && (
              <label className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer bg-[var(--surface-secondary)] p-2.5 rounded-xl border border-[var(--border-primary)]">
                <input
                  type="checkbox"
                  checked={clearEntityCheckbox}
                  onChange={(e) => setClearEntityCheckbox(e.target.checked)}
                  className="rounded text-[var(--success)] focus:ring-[var(--success)]"
                />
                <span className="font-semibold text-[var(--text-primary)]">
                  Persistently clear entity suspicion and exclude from future threat monitoring
                </span>
              </label>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-primary)]">
              <button
                type="button"
                onClick={() => setResolvingAlert(null)}
                disabled={submittingResolution}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] border border-transparent transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResolve}
                disabled={submittingResolution}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[var(--success)] hover:brightness-110 transition-all shadow-md flex items-center gap-2"
              >
                {submittingResolution ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white"></div>
                    <span>Resolving...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check"></i>
                    <span>Confirm Resolution</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
