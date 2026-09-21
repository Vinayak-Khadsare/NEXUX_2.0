"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useCase } from "@/context/CaseContext";

export default function EntitiesPage() {
  const { activeCaseId } = useCase();
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL"); // ALL, HIGH (>0.7), MEDIUM (0.4-0.7), LOW (<0.4)
  
  // Real-time processing status
  const [isProcessingEvidence, setIsProcessingEvidence] = useState(false);
  const [hasFailedEvidence, setHasFailedEvidence] = useState(false);
  const pollingRef = useRef<boolean>(false);

  // Selected entity profile state
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileRelationships, setProfileRelationships] = useState<any[]>([]);

  const getApiUrl = (path: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    return `${baseUrl}${path}`;
  };

  const fetchEntities = useCallback(async () => {
    if (!activeCaseId) {
      setEntities([]);
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("token");
    try {
      setLoading(true);
      
      const [entitiesRes, evidenceRes] = await Promise.all([
        fetch(getApiUrl(`/api/entities?case_id=${activeCaseId}`), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(getApiUrl(`/api/evidence/case/${activeCaseId}`), { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      if (entitiesRes.ok) {
        const data = await entitiesRes.json();
        setEntities(data);
      }
      
      if (evidenceRes.ok) {
        const evData = await evidenceRes.json();
        const isProc = evData.some((e: any) => e.processing_status === "PROCESSING");
        const hasFailed = evData.some((e: any) => e.processing_status === "FAILED");
        setIsProcessingEvidence(isProc);
        setHasFailedEvidence(hasFailed);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeCaseId]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  useEffect(() => {
    if (!activeCaseId) {
      setIsProcessingEvidence(false);
      setHasFailedEvidence(false);
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;
    let wasProcessing = false;
    let isMounted = true;
    
    const checkProcessingStatus = async () => {
      if (!isMounted) return;
      if (pollingRef.current) return;
      pollingRef.current = true;
      
      const token = localStorage.getItem("token");
      if (!token) {
        pollingRef.current = false;
        return;
      }
      
      try {
        const res = await fetch(getApiUrl(`/api/evidence/case/${activeCaseId}`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const latestEvidenceList = await res.json();
          if (!isMounted) return;
          
          const isProc = latestEvidenceList.some((e: any) => e.processing_status === "PROCESSING");
          const hasFailed = latestEvidenceList.some((e: any) => e.processing_status === "FAILED");
          
          setIsProcessingEvidence(isProc);
          setHasFailedEvidence(hasFailed);
          
          if (isProc) {
            wasProcessing = true;
          } else {
            if (wasProcessing) {
              wasProcessing = false;
              fetchEntities();
            }
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        }
      } catch (err) {
        console.error("Failed to check evidence processing status:", err);
      } finally {
        if (isMounted) {
          pollingRef.current = false;
        }
      }
    };

    intervalId = setInterval(checkProcessingStatus, 2000);
    checkProcessingStatus();

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [activeCaseId, fetchEntities]);

  // Load detailed profile relationships when selectedEntity changes
  useEffect(() => {
    const fetchProfileRelationships = async () => {
      if (!selectedEntity || !activeCaseId) {
        setProfileRelationships([]);
        return;
      }
      setLoadingProfile(true);
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(getApiUrl(`/api/relationships?case_id=${activeCaseId}`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Filter relationships involving this entity
          const related = data.filter((rel: any) => 
            rel.source_entity_id === selectedEntity._id || 
            rel.target_entity_id === selectedEntity._id
          );
          // Map target names
          const mapped = related.map((rel: any) => {
            const isSource = rel.source_entity_id === selectedEntity._id;
            const targetId = isSource ? rel.target_entity_id : rel.source_entity_id;
            const targetEntity = entities.find((e) => e._id === targetId);
            return {
              ...rel,
              targetName: targetEntity ? targetEntity.name : `Entity ID: ${targetId.slice(0, 8)}...`,
              targetType: targetEntity ? targetEntity.type : "UNKNOWN",
              direction: isSource ? "Outgoing" : "Incoming"
            };
          });
          setProfileRelationships(mapped);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchProfileRelationships();
  }, [selectedEntity, activeCaseId, entities]);

  // Filters & Search
  const filteredEntities = entities.filter((ent: any) => {
    const matchSearch = (ent.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                        JSON.stringify(ent.properties || {}).toLowerCase().includes(searchTerm.toLowerCase());
    
    const entTypeUpper = (ent.type || "").toUpperCase();
    const matchType = typeFilter === "ALL" 
      ? true
      : entTypeUpper === typeFilter.toUpperCase();
    
    let matchRisk = true;
    if (riskFilter === "HIGH") matchRisk = (ent.risk_score || 0) > 0.7;
    else if (riskFilter === "MEDIUM") matchRisk = (ent.risk_score || 0) >= 0.4 && (ent.risk_score || 0) <= 0.7;
    else if (riskFilter === "LOW") matchRisk = (ent.risk_score || 0) < 0.4;

    return matchSearch && matchType && matchRisk;
  });

  return (
    <div className="flex h-full w-full bg-[var(--app-background)] text-[var(--text-primary)] font-sans relative gap-6">
      
      {/* Directory Table Area */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        {/* Header */}
        <div className="border-b border-[var(--border-primary)] pb-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">Investigated Entity Directory</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Access, index, and triage network nodes across communication channels, locations, and suspect lists.
          </p>
        </div>

        {/* Filters control bar */}
        <div className="flex flex-wrap gap-4 items-center justify-between bg-[var(--surface-primary)] p-4 border border-[var(--border-primary)] rounded-2xl shadow-xs">
          <input 
            type="text" 
            placeholder="Search entities by name or attributes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--primary-accent)] placeholder-[var(--text-tertiary)] text-[var(--text-primary)] w-80 transition-all"
          />
          <div className="flex gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary-accent)]"
            >
              <option value="ALL">All Categories</option>
              <option value="PERSON">Persons</option>
              <option value="ORGANIZATION">Organizations</option>
              <option value="LOCATION">Locations</option>
              <option value="PHONE">Communication (Phones)</option>
              <option value="VEHICLE">Vehicles</option>
              <option value="ACCOUNT">Financial Accounts</option>
            </select>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary-accent)]"
            >
              <option value="ALL">All Risk Indices</option>
              <option value="HIGH">High Risk (&gt;0.7)</option>
              <option value="MEDIUM">Medium Risk (0.4-0.7)</option>
              <option value="LOW">Low Risk (&lt;0.4)</option>
            </select>
          </div>
        </div>

        {/* Directory Results */}
        {!activeCaseId ? (
          <div className="p-16 border border-dashed border-[var(--border-primary)] rounded-2xl text-center text-[var(--text-secondary)] bg-[var(--surface-primary)]">
            Please select an active Case File from the sidebar to list investigated entities.
          </div>
        ) : loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--primary-accent)]"></div>
            <span className="text-xs text-[var(--text-secondary)]">Retrieving case entity directory...</span>
          </div>
        ) : isProcessingEvidence && filteredEntities.length === 0 ? (
          <div className="p-16 border border-[var(--border-primary)] bg-[var(--surface-primary)] rounded-2xl flex flex-col items-center justify-center gap-4 text-center">
            <i className="fa-solid fa-database text-3xl text-[var(--primary-accent)] animate-pulse"></i>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Loading entities</h3>
              <p className="text-sm text-[var(--text-secondary)]">Processing investigation evidence and extracting entities...</p>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] max-w-md mt-2">Please wait while NEXUS analyzes the uploaded evidence.</p>
          </div>
        ) : hasFailedEvidence && filteredEntities.length === 0 ? (
          <div className="p-16 border border-dashed border-[var(--danger)]/30 bg-[var(--danger-bg)] rounded-2xl flex flex-col items-center justify-center gap-4 text-center">
            <i className="fa-solid fa-triangle-exclamation text-3xl text-[var(--danger)]"></i>
            <div>
              <h3 className="text-lg font-bold text-[var(--danger)] mb-1">Entity extraction failed</h3>
              <p className="text-sm text-[var(--danger)]/80">Evidence processing could not be completed.</p>
            </div>
            <p className="text-xs text-[var(--danger)]/60 max-w-md mt-2">Please review the evidence processing status.</p>
          </div>
        ) : filteredEntities.length === 0 ? (
          <div className="p-16 border border-dashed border-[var(--border-primary)] rounded-2xl text-center text-[var(--text-secondary)] bg-[var(--surface-primary)]">
            No entities found matching search filters. Upload evidence files to populate case directory.
          </div>
        ) : (
          <div className="overflow-y-auto pr-1 flex-1 flex flex-col gap-4">
            {isProcessingEvidence && (
              <div className="flex items-center gap-3 px-4 py-3 bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl text-[var(--info)] text-sm font-medium animate-pulse">
                <i className="fa-solid fa-database"></i>
                Analyzing newly uploaded evidence...
              </div>
            )}
            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-2xl bg-[var(--surface-primary)] shadow-xs">
              <table className="w-full border-collapse text-left text-sm text-[var(--text-secondary)]">
                <thead>
                  <tr className="border-b border-[var(--border-primary)] text-[var(--text-secondary)] text-xs font-semibold uppercase tracking-wider bg-[var(--surface-secondary)]">
                    <th className="py-4 px-6">Entity Profile Name</th>
                    <th className="py-4 px-6">Classification</th>
                    <th className="py-4 px-6 text-center">Threat Risk Index</th>
                    <th className="py-4 px-6">Attributes</th>
                    <th className="py-4 px-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredEntities.map((ent) => (
                    <tr 
                      key={ent._id} 
                      className={`hover:bg-[var(--surface-secondary)] transition-colors cursor-pointer ${
                        selectedEntity?._id === ent._id ? "bg-[var(--bg-selected)] hover:bg-[var(--bg-selected)]" : "bg-[var(--surface-primary)]"
                      }`}
                      onClick={() => setSelectedEntity(ent)}
                    >
                      <td className="py-4 px-6 font-bold text-[var(--text-primary)] text-sm">{ent.name}</td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 text-xs rounded-full bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-[var(--text-secondary)] font-semibold">
                          {ent.type}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full font-mono border ${
                          ent.risk_score >= 0.7 
                            ? "bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/20" 
                            : ent.risk_score >= 0.4 
                            ? "bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/20" 
                            : "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20"
                        }`}>
                          {(ent.risk_score || 0.0).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-xs max-w-sm truncate text-[var(--text-secondary)]">
                        {(() => {
                            const props = ent.properties || {};
                            if (typeof props === "object" && props !== null) {
                              const priorityKeys = ["description", "summary", "name", "type", "category"];
                              let displayVal = "";
                              for (const key of priorityKeys) {
                                if (props[key]) {
                                  displayVal = String(props[key]);
                                  break;
                                }
                              }
                              if (!displayVal && Object.keys(props).length > 0) {
                                displayVal = String(Object.values(props)[0]);
                              }
                              if (!displayVal) return "No attributes";
                              
                              const isLong = displayVal.length > 50;
                              const truncated = isLong ? displayVal.substring(0, 50) + "..." : displayVal;
                              
                              return (
                                <span title={displayVal} className="truncate max-w-xs inline-block">
                                  {truncated}
                                </span>
                              );
                            }
                            return <span className="truncate max-w-xs inline-block">{String(props)}</span>;
                          })()}
                      </td>
                      <td className="py-4 px-6">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEntity(ent);
                          }}
                          className="px-3 py-1.5 bg-[var(--bg-green-light)] hover:bg-[var(--primary-accent)] text-[var(--primary-accent)] hover:text-white border border-[var(--primary-accent)]/20 hover:border-transparent text-xs rounded-lg transition-all font-bold active:scale-[0.97]"
                        >
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Slide-out Entity Profile Side Panel */}
      {selectedEntity && (
        <aside className="w-full md:w-96 border border-[var(--border-primary)] bg-[var(--surface-primary)] p-6 rounded-2xl flex flex-col gap-6 overflow-y-auto max-h-full shrink-0 shadow-sm relative animate-fade-in absolute md:static inset-y-0 right-0 z-50">
          {/* Close button */}
          <button 
            onClick={() => setSelectedEntity(null)}
            className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] font-bold text-xs"
          >
            ✕ Close
          </button>

          {/* Profile Header */}
          <div className="space-y-3 pb-5 border-b border-[var(--border-primary)]">
            <span className="px-2 py-0.5 text-[9px] font-extrabold bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-[var(--text-secondary)] rounded-full tracking-wider uppercase">
              {selectedEntity.type}
            </span>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)]">{selectedEntity.name}</h2>
            
            {/* Risk gauge */}
            <div className="flex items-center gap-3 bg-[var(--surface-secondary)] p-3 rounded-xl border border-[var(--border-primary)]">
              <span className="text-xs text-[var(--text-tertiary)] font-semibold uppercase">Risk Score</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--border-primary)] overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    selectedEntity.risk_score >= 0.7 ? "bg-[var(--danger)]" : selectedEntity.risk_score >= 0.4 ? "bg-[var(--warning)]" : "bg-[var(--primary-accent)]"
                  }`} 
                  style={{ width: `${Math.min((selectedEntity.risk_score || 0.0) * 100, 100)}%` }} 
                />
              </div>
              <span className={`text-xs font-bold font-mono ${
                selectedEntity.risk_score >= 0.7 ? "text-[var(--danger)]" : selectedEntity.risk_score >= 0.4 ? "text-[var(--warning)]" : "text-[var(--primary-accent)]"
              }`}>
                {(selectedEntity.risk_score || 0.0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Properties List */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Entity Details</h3>
            {Object.keys(selectedEntity.properties || {}).length === 0 ? (
              <p className="text-[var(--text-tertiary)] text-xs italic">No attributes recorded.</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(selectedEntity.properties).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-start text-xs p-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-primary)]">
                    <span className="text-[var(--text-secondary)] font-mono">{key}</span>
                    <span className="text-[var(--text-primary)] font-bold max-w-[180px] text-right break-all">{String(val)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Links / Connections Section */}
          <div className="space-y-4 flex-1 flex flex-col overflow-hidden min-h-[200px]">
            {loadingProfile ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[var(--primary-accent)]"></div>
                <span className="text-[10px] text-[var(--text-tertiary)] font-mono">Loading relationships...</span>
              </div>
            ) : (
              <>
                {(() => {
                  const primaryTypes = ["PERSON", "ORGANIZATION", "LOCATION", "VEHICLE"];
                  const primaryLinks = profileRelationships.filter(rel => primaryTypes.includes(rel.targetType));
                  const secondaryInfo = profileRelationships.filter(rel => !primaryTypes.includes(rel.targetType));
                  
                  return (
                    <div className="flex-1 overflow-y-auto pr-1 space-y-5">
                      
                      {/* Direct Network Links (Primary) */}
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Direct Network Links ({primaryLinks.length})</h3>
                        {primaryLinks.length === 0 ? (
                          <p className="text-[var(--text-tertiary)] text-xs italic flex-1 flex items-center justify-center">No primary connections mapped.</p>
                        ) : (
                          <div className="space-y-2.5">
                            {primaryLinks.map((rel, idx) => (
                              <div key={`prim-${idx}`} className="p-3.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-xs flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-[var(--text-primary)] truncate max-w-[180px]">{rel.targetName}</span>
                                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--bg-green-light)] text-[var(--primary-accent)] font-semibold border border-[var(--primary-accent)]/20">
                                    {rel.type}
                                  </span>
                                </div>
                                {Object.keys(rel.properties || {}).length > 0 && (
                                  <div className="text-[10px] text-[var(--text-secondary)] font-mono border-t border-[var(--border-primary)] pt-2">
                                    {Object.entries(rel.properties).map(([k, v]) => (
                                      <div key={k} className="flex justify-between">
                                        <span>{k}:</span>
                                        <span className="text-[var(--text-primary)]">{String(v)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Supporting Information (Secondary) */}
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Supporting Information ({secondaryInfo.length})</h3>
                        {secondaryInfo.length === 0 ? (
                          <p className="text-[var(--text-tertiary)] text-xs italic flex-1 flex items-center justify-center">No supporting info extracted.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {secondaryInfo.map((rel, idx) => (
                              <div key={`sec-${idx}`} className="p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-xs flex flex-col justify-center">
                                <span className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 truncate">{rel.targetType}</span>
                                <span className="font-mono text-[var(--text-primary)] break-all">{rel.targetName}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </aside>
      )}

    </div>
  );
}
