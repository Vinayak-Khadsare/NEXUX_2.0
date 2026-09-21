import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

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

function renderCleanNarrative(text: string) {
  if (!text) return null;
  // Replace rupee symbol so standard Helvetica does not render it as corrupt superscript ¹
  const sanitized = text
    .replace(/₹/g, 'INR ')
    .replace(/\*\*/g, '')
    .replace(/`/g, '');
  const lines = sanitized.split('\n');

  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <View key={idx} style={{ height: 3 }} />;
    }

    // Check if it's a section header like '### 1. Executive Summary', '1. Executive Summary', or 'Conclusion'
    const isHeading = trimmed.startsWith('#') || 
      /^[1-5]\.\s+[A-Za-z]/.test(trimmed) || 
      /^(Executive Summary|Chronological Sequence|Key Entities|Investigative Findings|Conclusion)/i.test(trimmed);
    
    const cleanText = trimmed
      .replace(/^#+\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/^\s*[-*]\s*/, '• ')
      .trim();

    if (isHeading) {
      return (
        <Text key={idx} style={{ fontSize: 9.5, fontWeight: 'bold', color: '#1e293b', marginTop: 6, marginBottom: 2 }}>
          {cleanText}
        </Text>
      );
    }

    const isBullet = cleanText.startsWith('•');

    return (
      <Text key={idx} style={{ ...styles.text, paddingLeft: isBullet ? 6 : 0, marginBottom: isBullet ? 2 : 4 }}>
        {cleanText}
      </Text>
    );
  });
}

export default function CaseReportPDF({ caseData, entities, relationships, evidence, reportData }: Props) {
  const highRiskEntities = entities.filter(e => e.risk_score > 0.7);
  const locations = entities.filter(e => e.type === 'LOCATION');
  
  const ai = reportData?.ai_assessment;
  const hasAI = Boolean(ai && typeof ai === 'object');
  
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

        {/* CASE CHRONOLOGICAL NARRATIVE (Only included if generated by investigator) */}
        {reportData?.ai_narrative && (
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.sectionTitle}>Case Chronological Narrative</Text>
            {renderCleanNarrative(reportData.ai_narrative)}
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

        {/* NETWORK / RELATIONSHIPS */}
        <Text style={styles.sectionTitle}>Network Analysis</Text>
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
