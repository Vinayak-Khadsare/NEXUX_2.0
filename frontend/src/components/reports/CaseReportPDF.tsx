import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { generateNetworkReportSnapshot } from '@/lib/networkSnapshot';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff'
  },
  header: {
    marginBottom: 10,
    borderBottom: '1pt solid #e5e7eb',
    paddingBottom: 10
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1a1a1a'
  },
  subtitle: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 5
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 4,
    color: '#2563eb',
    borderBottom: '1pt solid #e5e7eb',
    paddingBottom: 2
  },
  text: {
    fontSize: 9,
    color: '#374151',
    lineHeight: 1.2,
    marginBottom: 4
  },
  bold: {
    fontWeight: 'bold'
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: 5
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1pt solid #e5e7eb',
    paddingVertical: 3.5,
    alignItems: 'center'
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1pt solid #9ca3af',
    paddingVertical: 3.5,
    backgroundColor: '#f3f4f6'
  },
  tableCol: {
    width: '25%',
    paddingHorizontal: 4
  },
  tableCell: {
    fontSize: 7.5,
    color: '#374151',
    lineHeight: 1.25
  },
  tableCellHeader: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#111827'
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    fontSize: 8,
    color: '#9ca3af',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1pt solid #e5e7eb',
    paddingTop: 4
  }
});

interface Props {
  caseData: any;
  entities: any[];
  relationships: any[];
  evidence: any[];
  reportData?: any;
  networkSnapshot?: string | null;
}

function getEntityDescription(ent: any, relationships: any[] = [], allEntities: any[] = []): string {
  const directDesc = ent.description || ent.properties?.description || ent.properties?.['Role / Description'] || ent.properties?.role || ent.properties?.notes || ent.properties?.details;

  const entId = String(ent._id || ent.id || '');
  const entName = ent.name ? String(ent.name).toLowerCase() : '';

  // Find connected relationships
  const outgoing = relationships.filter(r => {
    const src = String(r.source_entity_id || r.sourceId || r.source || '');
    return (entId && src === entId) || (entName && src.toLowerCase() === entName);
  });

  const incoming = relationships.filter(r => {
    const tgt = String(r.target_entity_id || r.targetId || r.target || '');
    return (entId && tgt === entId) || (entName && tgt.toLowerCase() === entName);
  });

  const phrases: string[] = [];

  for (const r of outgoing.slice(0, 3)) {
    const tgtId = String(r.target_entity_id || r.targetId || r.target || '');
    const tgtEnt = allEntities.find(e => String(e._id || e.id) === tgtId || String(e.name || '').toLowerCase() === tgtId.toLowerCase());
    const tgtName = tgtEnt?.name || tgtId;
    const relType = String(r.type || r.relationship_type || '').toLowerCase().replace(/_/g, ' ');
    if (relType && tgtName && tgtName !== 'Unknown') {
      if (relType.includes('communicat') || relType.includes('contact')) phrases.push(`communicates with ${tgtName}`);
      else if (relType.includes('control')) phrases.push(`controls ${tgtName}`);
      else if (relType.includes('work')) phrases.push(`works for ${tgtName}`);
      else if (relType.includes('partner')) phrases.push(`partners with ${tgtName}`);
      else if (relType.includes('associat')) phrases.push(`associated with ${tgtName}`);
      else if (relType.includes('visit')) phrases.push(`visited ${tgtName}`);
      else if (relType.includes('locat')) phrases.push(`located at ${tgtName}`);
      else if (relType.includes('operat')) phrases.push(`operates in ${tgtName}`);
      else if (relType.includes('link')) phrases.push(`linked to ${tgtName}`);
      else if (relType.includes('initiat') || relType.includes('transfer')) phrases.push(`initiates transfer to ${tgtName}`);
      else if (relType.includes('pay')) phrases.push(`payment to ${tgtName}`);
      else if (relType.includes('use')) phrases.push(`uses ${tgtName}`);
      else phrases.push(`${relType} ${tgtName}`);
    }
  }

  for (const r of incoming.slice(0, 2)) {
    const srcId = String(r.source_entity_id || r.sourceId || r.source || '');
    const srcEnt = allEntities.find(e => String(e._id || e.id) === srcId || String(e.name || '').toLowerCase() === srcId.toLowerCase());
    const srcName = srcEnt?.name || srcId;
    const relType = String(r.type || r.relationship_type || '').toLowerCase().replace(/_/g, ' ');
    if (relType && srcName && srcName !== 'Unknown') {
      if (relType.includes('control')) phrases.push(`controlled by ${srcName}`);
      else if (relType.includes('communicat') || relType.includes('contact')) phrases.push(`contacted by ${srcName}`);
      else if (relType.includes('work')) phrases.push(`employs ${srcName}`);
      else if (relType.includes('partner')) phrases.push(`partnered with ${srcName}`);
      else if (relType.includes('associat')) phrases.push(`associated with ${srcName}`);
      else if (relType.includes('visit')) phrases.push(`visited by ${srcName}`);
      else if (relType.includes('locat')) phrases.push(`premises of ${srcName}`);
      else if (relType.includes('operat')) phrases.push(`operational hub for ${srcName}`);
      else if (relType.includes('link')) phrases.push(`linked to ${srcName}`);
      else if (relType.includes('initiat')) phrases.push(`initiated by ${srcName}`);
      else if (relType.includes('transfer')) phrases.push(`received transfer from ${srcName}`);
      else if (relType.includes('pay')) phrases.push(`received payment from ${srcName}`);
      else if (relType.includes('use')) phrases.push(`utilized by ${srcName}`);
      else phrases.push(`connected with ${srcName}`);
    }
  }

  const seen = new Set<string>();
  const uniquePhrases: string[] = [];
  for (const p of phrases) {
    const pLow = p.toLowerCase();
    if (!seen.has(pLow)) {
      seen.add(pLow);
      uniquePhrases.push(p);
    }
  }

  const involvementStr = uniquePhrases.slice(0, 3).join('; ');

  if (directDesc && typeof directDesc === 'string' && directDesc.trim()) {
    // Deduplicate any repeated sentences in directDesc
    const rawSentences = directDesc.split(/\.\s*/).map(s => s.trim()).filter(Boolean);
    const uniqueDirectSentences = Array.from(new Set(rawSentences));
    const cleanDirect = uniqueDirectSentences.join('. ');
    if (involvementStr && !cleanDirect.toLowerCase().includes('involvement')) {
      return `${cleanDirect}. Involvement: ${involvementStr}.`;
    }
    return cleanDirect.endsWith('.') ? cleanDirect : `${cleanDirect}.`;
  }

  if (involvementStr) {
    const typeLabel = (ent.type || 'Entity').charAt(0).toUpperCase() + (ent.type || 'entity').slice(1).toLowerCase();
    return `${typeLabel} node. Involvement: ${involvementStr}.`;
  }

  return `Key ${(ent.type || 'investigation').toLowerCase()} entity under review in case evidence.`;
}

function cleanPdfText(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/₹/g, 'INR ')
    .replace(/\*\*/g, '')
    .replace(/`/g, '');
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

interface ChronologicalEvent {
  date: string;
  displayDate: string;
  time: string;
  sortKey: string;
  description: string;
  entities?: string[];
  source?: string;
}

interface DateGroup {
  date: string;
  displayDate: string;
  events: ChronologicalEvent[];
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return 'DATE UNSPECIFIED';
  const m = String(dateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const yr = m[1];
    const mo = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12) {
      return `${day} ${MONTH_NAMES[mo - 1]} ${yr}`;
    }
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }
  return String(dateStr).toUpperCase();
}

function formatDisplayTime(timeStr?: string): string {
  if (!timeStr || !String(timeStr).trim() || ['none', 'null', 'undefined'].includes(String(timeStr).trim().toLowerCase())) {
    return 'Time: Not specified';
  }
  const s = String(timeStr).trim();
  if (s.toLowerCase().includes('not specified')) return 'Time: Not specified';
  if (/\b(AM|PM)\b/i.test(s)) return s.toUpperCase();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) {
    let hr = parseInt(m[1], 10);
    const mn = m[2];
    const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12;
    if (hr === 0) hr = 12;
    const hh = hr < 10 ? `0${hr}` : `${hr}`;
    return `${hh}:${mn} ${ampm}`;
  }
  return s;
}

function parseDateAndTime(val: any): { sortKey: string; date: string; time?: string } | null {
  if (!val) return null;
  const s = String(val).trim();
  const m = s.match(/(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}:\d{2})(?::\d{2})?)?/);
  if (m) {
    const d = m[1];
    const t = m[2];
    return {
      sortKey: `${d} ${t ? t : '00:00:00'}`,
      date: d,
      time: t
    };
  }
  const m2 = s.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})(?:[,\s]+(\d{1,2}:\d{2}(?:\s*[AP]M)?))?/i);
  if (m2) {
    const day = parseInt(m2[1], 10);
    const monStr = m2[2].substring(0, 3).toUpperCase();
    const yr = m2[3];
    const tm = m2[4];
    const moIdx = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(monStr);
    if (moIdx >= 0) {
      const d = `${yr}-${String(moIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        sortKey: `${d} ${tm ? tm : '00:00:00'}`,
        date: d,
        time: tm
      };
    }
  }
  return null;
}

function extractChronologicalEvents(
  reportData: any,
  entities: any[] = [],
  relationships: any[] = [],
  evidence: any[] = [],
  caseData: any = {}
): DateGroup[] {
  const collected: ChronologicalEvent[] = [];

  // 1. From backend compiled reportData.chronological_events
  if (Array.isArray(reportData?.chronological_events) && reportData.chronological_events.length > 0) {
    for (const evt of reportData.chronological_events) {
      if (evt?.date) {
        collected.push({
          date: String(evt.date),
          displayDate: evt.display_date || formatDisplayDate(String(evt.date)),
          time: formatDisplayTime(evt.time),
          sortKey: evt.sort_key || `${evt.date} 00:00:00`,
          description: evt.description || evt.name || '',
          entities: Array.isArray(evt.entities) ? evt.entities : (evt.entity ? [evt.entity] : []),
          source: evt.source || ''
        });
      }
    }
  }

  // 2. From reportData.timeline_summary.events
  if (collected.length === 0 && Array.isArray(reportData?.timeline_summary?.events)) {
    for (const evt of reportData.timeline_summary.events) {
      const parsed = parseDateAndTime(evt.timestamp || evt.date);
      if (parsed) {
        collected.push({
          date: parsed.date,
          displayDate: evt.display_date || formatDisplayDate(parsed.date),
          time: formatDisplayTime(evt.time || parsed.time),
          sortKey: parsed.sortKey,
          description: evt.description || evt.title || evt.name || '',
          entities: Array.isArray(evt.entities) ? evt.entities : (evt.entity ? [evt.entity] : []),
          source: evt.source || (evt.properties?.Evidence ? `EV-${evt.properties.Evidence}` : '')
        });
      }
    }
  }

  // 3. From ai_narrative if events are still missing or from prior case narrative
  const narrative = reportData?.ai_narrative || caseData?.ai_narrative;
  if (collected.length === 0 && typeof narrative === 'string' && narrative.trim()) {
    const lines = narrative.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim().replace(/^[-*•\s]+/, '');
      if (!line) continue;
      // Discard narrative titles like Executive Summary, Conclusion, etc.
      if (/^(Executive Summary|Key Entities|Investigative Findings|Conclusion|Case Overview|Recommendations)/i.test(line)) {
        continue;
      }
      const parsed = parseDateAndTime(line);
      if (parsed) {
        let desc = line
          .replace(new RegExp('^(?:On\\s+)?' + parsed.date + '[:,]?\\s*', 'i'), '')
          .trim();
        if (parsed.time) {
          desc = desc.replace(new RegExp('^(?:at\\s+)?' + parsed.time + '(?:\\s*[AP]M)?[:,]?\\s*', 'i'), '').trim();
        }
        const matchedEnts = entities
          .filter(e => e.name && desc.toLowerCase().includes(String(e.name).toLowerCase()))
          .map(e => e.name)
          .slice(0, 3);

        collected.push({
          date: parsed.date,
          displayDate: formatDisplayDate(parsed.date),
          time: formatDisplayTime(parsed.time),
          sortKey: parsed.sortKey,
          description: desc,
          entities: matchedEnts,
          source: 'Source: Case Investigation Record'
        });
      }
    }
  }

  // 4. From relationships if needed
  if (collected.length === 0 && Array.isArray(relationships)) {
    for (const r of relationships) {
      const rawDate = r.properties?.timestamp || r.properties?.date;
      const parsed = parseDateAndTime(rawDate);
      if (parsed) {
        const srcId = r.source_entity_id || r.sourceId;
        const tgtId = r.target_entity_id || r.targetId;
        const srcName = entities.find(e => e._id === srcId || e.id === srcId)?.name || srcId || 'Entity';
        const tgtName = entities.find(e => e._id === tgtId || e.id === tgtId)?.name || tgtId || 'Entity';
        const relType = String(r.type || r.relationship_type || 'CONNECTED_WITH').replace(/_/g, ' ').toLowerCase();
        const desc = r.properties?.description || `${srcName} ${relType} ${tgtName}.`;
        const sourceStr = r.properties?.evidence || r.properties?.source || 'Communication Record';
        collected.push({
          date: parsed.date,
          displayDate: formatDisplayDate(parsed.date),
          time: formatDisplayTime(parsed.time),
          sortKey: parsed.sortKey,
          description: desc,
          entities: [srcName, tgtName].filter(n => n && n !== 'Entity'),
          source: sourceStr.startsWith('Source:') ? sourceStr : `Source: ${sourceStr}`
        });
      }
    }
  }

  // Deduplicate and combine events describing the same event
  const combinedMap = new Map<string, ChronologicalEvent>();
  for (const ev of collected) {
    const normDesc = ev.description.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 5).sort().join(' ');
    const key = `${ev.date}_${ev.time}_${normDesc}`;
    if (!combinedMap.has(key)) {
      combinedMap.set(key, { ...ev });
    } else {
      const existing = combinedMap.get(key)!;
      if (ev.source && !existing.source?.includes(ev.source)) {
        const cleanNew = ev.source.replace(/^Source:\s*/i, '');
        existing.source = existing.source ? `${existing.source}, ${cleanNew}` : ev.source;
      }
      if (ev.entities && ev.entities.length > 0) {
        const set = new Set([...(existing.entities || []), ...ev.entities]);
        existing.entities = Array.from(set);
      }
    }
  }

  const sortedEvents = Array.from(combinedMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Group by displayDate
  const groupMap = new Map<string, DateGroup>();
  for (const evt of sortedEvents) {
    const gKey = evt.displayDate || 'DATE UNSPECIFIED';
    if (!groupMap.has(gKey)) {
      groupMap.set(gKey, {
        date: evt.date,
        displayDate: gKey,
        events: []
      });
    }
    groupMap.get(gKey)!.events.push(evt);
  }

  return Array.from(groupMap.values());
}

export default function CaseReportPDF({ caseData, entities, relationships, evidence, reportData, networkSnapshot }: Props) {
  const highRiskEntities = entities.filter(e => e.risk_score > 0.7);
  const locations = entities.filter(e => e.type === 'LOCATION');
  
  const ai = reportData?.ai_assessment;
  const hasAI = Boolean(ai && typeof ai === 'object');

  const groupedChronologicalEvents = extractChronologicalEvents(reportData, entities, relationships, evidence, caseData);

  const activeSnapshot = networkSnapshot || reportData?.network_snapshot || (typeof document !== 'undefined' ? generateNetworkReportSnapshot({ entities, relationships }) : null);
  
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={{ fontSize: 10, color: '#2563eb', marginBottom: 2, fontWeight: 'bold' }}>NEXUS</Text>
          <Text style={styles.title}>Investigation Intelligence Report</Text>
          <Text style={styles.subtitle}>{cleanPdfText(caseData?.name || 'Unknown Case')}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.text}><Text style={styles.bold}>Case ID:</Text> {caseData?._id}</Text>
            <Text style={styles.text}><Text style={styles.bold}>Generated:</Text> {new Date().toLocaleDateString()}</Text>
            <Text style={styles.text}>
              <Text style={styles.bold}>Level:</Text> {highRiskEntities.length > 3 ? 'CRITICAL' : 'CONFIDENTIAL'}
            </Text>
          </View>
        </View>

        {/* EXECUTIVE SUMMARY */}
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <Text style={styles.text}>
          {cleanPdfText(reportData?.executive_summary || `AI-synthesized overview of the investigation into ${caseData?.name || 'the case'}. Includes network topologies, risk assessments, geographic intelligence, and extracted evidence summaries.`)}
        </Text>
        
        {/* METRICS */}
        <View style={{ marginTop: 5, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#f8fafc', padding: 8, borderRadius: 3 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0f172a' }}>{entities.length}</Text>
            <Text style={{ fontSize: 8, color: '#64748b' }}>Entities</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0f172a' }}>{relationships.length}</Text>
            <Text style={{ fontSize: 8, color: '#64748b' }}>Relations</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0f172a' }}>{evidence.length}</Text>
            <Text style={{ fontSize: 8, color: '#64748b' }}>Evidence</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#ef4444' }}>{highRiskEntities.length}</Text>
            <Text style={{ fontSize: 8, color: '#64748b' }}>High Risk</Text>
          </View>
        </View>

        {/* AI INVESTIGATIVE ASSESSMENT */}
        <Text style={styles.sectionTitle}>AI Investigative Assessment</Text>
        <View style={{ backgroundColor: '#f8fafc', padding: 10, borderRadius: 3, marginBottom: 10 }}>
          {!hasAI ? (
            <Text style={styles.text}>AI assessment not available for this report.</Text>
          ) : (
            <View>
              {ai.overall_assessment && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>Overall Assessment</Text>
                  <Text style={styles.text}>{cleanPdfText(String(ai.overall_assessment))}</Text>
                </View>
              )}
              
              {ai.network_assessment && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>Network Assessment</Text>
                  <Text style={styles.text}>{cleanPdfText(String(ai.network_assessment))}</Text>
                </View>
              )}

              {ai.risk_assessment && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>Risk Assessment</Text>
                  <Text style={styles.text}>{cleanPdfText(String(ai.risk_assessment))}</Text>
                </View>
              )}

              {ai.geographic_timeline_observations && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>Geo & Timeline</Text>
                  <Text style={styles.text}>{cleanPdfText(String(ai.geographic_timeline_observations))}</Text>
                </View>
              )}

              {Array.isArray(ai.key_findings) && ai.key_findings.length > 0 && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>Key Findings</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {ai.key_findings.map((finding: any, i: number) => (
                      <Text key={i} style={{ ...styles.text, width: '50%' }}>• {cleanPdfText(String(finding))}</Text>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* CHRONOLOGICAL SEQUENCE OF EVENTS */}
        <Text style={styles.sectionTitle}>CHRONOLOGICAL SEQUENCE OF EVENTS</Text>
        {groupedChronologicalEvents.length === 0 ? (
          <Text style={styles.text}>No chronological events recorded for this case.</Text>
        ) : (
          <View style={{ marginTop: 4, marginBottom: 10 }}>
            {groupedChronologicalEvents.map((group, gIdx) => (
              <View key={gIdx} style={{ marginBottom: 9 }} wrap={false}>
                {/* DATE HEADER */}
                <View style={{
                  backgroundColor: '#f1f5f9',
                  paddingVertical: 3,
                  paddingHorizontal: 6,
                  borderRadius: 2,
                  marginBottom: 5,
                  borderLeft: '3pt solid #2563eb'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#0f172a', letterSpacing: 0.5 }}>
                    {group.displayDate}
                  </Text>
                </View>

                {/* EVENTS FOR THIS DATE */}
                <View style={{ paddingLeft: 6, borderLeft: '1pt solid #cbd5e1', marginLeft: 4 }}>
                  {group.events.map((evt, eIdx) => (
                    <View key={eIdx} style={{ marginBottom: 6 }} wrap={false}>
                      {/* TIME */}
                      <Text style={{
                        fontSize: 8,
                        fontWeight: 'bold',
                        color: evt.time.includes('Not specified') ? '#64748b' : '#2563eb',
                        fontStyle: evt.time.includes('Not specified') ? 'italic' : 'normal',
                        marginBottom: 1.5
                      }}>
                        {evt.time}
                      </Text>

                      {/* EVENT DESCRIPTION */}
                      <Text style={{ fontSize: 8.5, color: '#1e293b', lineHeight: 1.25, marginBottom: 1.5 }}>
                        {cleanPdfText(evt.description)}
                      </Text>

                      {/* RELEVANT ENTITIES */}
                      {evt.entities && evt.entities.length > 0 && (
                        <Text style={{ fontSize: 7.5, color: '#475569', marginBottom: 1 }}>
                          <Text style={{ fontWeight: 'bold', color: '#334155' }}>Relevant Entities: </Text>
                          {cleanPdfText(evt.entities.join(', '))}
                        </Text>
                      )}

                      {/* SOURCE / EVIDENCE REFERENCE */}
                      {evt.source && (
                        <Text style={{ fontSize: 7.5, color: '#64748b', fontStyle: 'italic' }}>
                          <Text style={{ fontWeight: 'bold', fontStyle: 'normal', color: '#475569' }}>Source: </Text>
                          {cleanPdfText(evt.source)}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
        
        {/* KEY ENTITIES */}
        <Text style={styles.sectionTitle}>Key Entities & Risk Assessment</Text>
        {entities.length === 0 ? (
          <Text style={styles.text}>No entity data available for this case.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <View style={{...styles.tableCol, width: '25%'}}><Text style={styles.tableCellHeader}>Entity Name</Text></View>
              <View style={{...styles.tableCol, width: '16%'}}><Text style={styles.tableCellHeader}>Type</Text></View>
              <View style={{...styles.tableCol, width: '11%'}}><Text style={styles.tableCellHeader}>Risk Score</Text></View>
              <View style={{...styles.tableCol, width: '48%'}}><Text style={styles.tableCellHeader}>Description & Involvement</Text></View>
            </View>
            {entities.sort((a,b) => b.risk_score - a.risk_score).slice(0, 15).map((ent, i) => (
              <View style={styles.tableRow} key={i} wrap={false}>
                <View style={{...styles.tableCol, width: '25%'}}><Text style={styles.tableCell}>{cleanPdfText(ent.name)}</Text></View>
                <View style={{...styles.tableCol, width: '16%'}}><Text style={styles.tableCell}>{ent.type}</Text></View>
                <View style={{...styles.tableCol, width: '11%'}}><Text style={styles.tableCell}>{ent.risk_score.toFixed(2)}</Text></View>
                <View style={{...styles.tableCol, width: '48%'}}>
                  <Text style={styles.tableCell}>
                    {cleanPdfText(getEntityDescription(ent, relationships, entities))}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* NETWORK ANALYSIS */}
        <Text style={styles.sectionTitle}>Network Analysis</Text>

        {/* Network Visualization */}
        <View style={{ marginTop: 4, marginBottom: 8 }}>
          <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 }}>
            Network Visualization
          </Text>
          {activeSnapshot ? (
            <View style={{ alignItems: 'center', marginBottom: 4 }} wrap={false}>
              <Image
                src={activeSnapshot}
                style={{
                  width: '100%',
                  height: 240,
                  objectFit: 'contain',
                  borderRadius: 3,
                  border: '0.5pt solid #cbd5e1'
                }}
              />
              <Text style={{ fontSize: 7, color: '#64748b', fontStyle: 'italic', marginTop: 3 }}>
                Figure 1: Entity relationship network derived from the active investigation case.
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 8, fontStyle: 'italic', color: '#64748b', marginBottom: 6 }}>
              No network visualization available. No entity relationships were identified in the current case.
            </Text>
          )}

          {/* Network Statistics / Relationship Analysis */}
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1e293b', marginTop: 6, marginBottom: 2 }}>
            Network Statistics & Relationship Analysis
          </Text>
        </View>

        {relationships.length === 0 ? (
          <Text style={styles.text}>No relationship data available for this case.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <View style={{...styles.tableCol, width: '35%'}}><Text style={styles.tableCellHeader}>Source</Text></View>
              <View style={{...styles.tableCol, width: '30%'}}><Text style={styles.tableCellHeader}>Type</Text></View>
              <View style={{...styles.tableCol, width: '35%'}}><Text style={styles.tableCellHeader}>Target</Text></View>
            </View>
            {relationships.slice(0, 15).map((rel, i) => {
              const srcId = rel.source_entity_id || rel.sourceId;
              const tgtId = rel.target_entity_id || rel.targetId;
              const srcName = entities.find(e => e._id === srcId || e.id === srcId)?.name || srcId || 'Unknown';
              const tgtName = entities.find(e => e._id === tgtId || e.id === tgtId)?.name || tgtId || 'Unknown';
              return (
                <View style={styles.tableRow} key={i} wrap={false}>
                  <View style={{...styles.tableCol, width: '35%'}}><Text style={styles.tableCell}>{cleanPdfText(srcName)}</Text></View>
                  <View style={{...styles.tableCol, width: '30%'}}><Text style={styles.tableCell}>{rel.type || rel.relationship_type}</Text></View>
                  <View style={{...styles.tableCol, width: '35%'}}><Text style={styles.tableCell}>{cleanPdfText(tgtName)}</Text></View>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionTitle}>Geographic Intelligence</Text>
        {locations.length === 0 ? (
          <Text style={styles.text}>No geographic data found.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <View style={{...styles.tableCol, width: '30%'}}><Text style={styles.tableCellHeader}>Location</Text></View>
              <View style={{...styles.tableCol, width: '15%'}}><Text style={styles.tableCellHeader}>Risk</Text></View>
              <View style={{...styles.tableCol, width: '55%'}}><Text style={styles.tableCellHeader}>Context</Text></View>
            </View>
            {locations.map((loc, i) => (
              <View style={styles.tableRow} key={i} wrap={false}>
                <View style={{...styles.tableCol, width: '30%'}}><Text style={styles.tableCell}>{cleanPdfText(loc.name)}</Text></View>
                <View style={{...styles.tableCol, width: '15%'}}><Text style={styles.tableCell}>{loc.risk_score.toFixed(2)}</Text></View>
                <View style={{...styles.tableCol, width: '55%'}}><Text style={styles.tableCell}>{cleanPdfText(loc.description || 'Monitored location')}</Text></View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Evidence Summary</Text>
        {evidence.length === 0 ? (
          <Text style={styles.text}>No evidence files uploaded for this case.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <View style={{...styles.tableCol, width: '40%'}}><Text style={styles.tableCellHeader}>File Name</Text></View>
              <View style={{...styles.tableCol, width: '20%'}}><Text style={styles.tableCellHeader}>Type</Text></View>
              <View style={{...styles.tableCol, width: '40%'}}><Text style={styles.tableCellHeader}>Summary</Text></View>
            </View>
            {evidence.map((ev, i) => (
              <View style={styles.tableRow} key={i} wrap={false}>
                <View style={{...styles.tableCol, width: '40%'}}><Text style={styles.tableCell}>{cleanPdfText(ev.filename || ev.title)}</Text></View>
                <View style={{...styles.tableCol, width: '20%'}}><Text style={styles.tableCell}>{ev.file_type || ev.type || 'DOCUMENT'}</Text></View>
                <View style={{...styles.tableCol, width: '40%'}}><Text style={styles.tableCell}>{cleanPdfText(ev.extracted_text?.substring(0, 50) || ev.summary?.substring(0,50) || '-')}</Text></View>
              </View>
            ))}
          </View>
        )}
        
        <View style={styles.footer} fixed>
          <Text>NEXUS Intelligence Platform</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
