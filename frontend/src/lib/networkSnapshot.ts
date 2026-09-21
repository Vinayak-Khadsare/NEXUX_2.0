import { getEdgeColorByType, formatEdgeLabel, EdgeColorConfig } from "../three/networkColorUtils";

export interface SnapshotEntity {
  _id?: string;
  id?: string;
  name: string;
  type?: string;
  risk_score?: number;
  risk?: number;
  properties?: any;
}

export interface SnapshotRelationship {
  _id?: string;
  id?: string;
  source_entity_id?: string;
  target_entity_id?: string;
  sourceId?: string;
  targetId?: string;
  source?: any;
  target?: any;
  type?: string;
  relationship_type?: string;
  properties?: any;
}

export interface GraphSnapshotInput {
  nodes?: any[];
  links?: any[];
  edges?: any[];
  entities?: SnapshotEntity[];
  relationships?: SnapshotRelationship[];
}

interface LayoutNode {
  id: string;
  name: string;
  type: string;
  riskScore: number;
  degree: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface LayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceNode: LayoutNode;
  targetNode: LayoutNode;
  type: string;
  edgeConfig: EdgeColorConfig;
}

function linkId(val: any): string {
  if (!val) return "";
  if (typeof val === "object") {
    return String(val._id || val.id || val.name || "");
  }
  return String(val);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getNodeFillColor(type: string): string {
  switch ((type || "").toUpperCase()) {
    case "PERSON":
      return "#3B82F6"; // Blue
    case "ORGANIZATION":
      return "#10B981"; // Emerald Green
    case "LOCATION":
      return "#F59E0B"; // Amber
    case "VEHICLE":
      return "#8B5CF6"; // Purple
    case "PHONE":
    case "PHONE_NUMBER":
    case "COMMUNICATION":
      return "#06B6D4"; // Cyan
    case "ACCOUNT":
      return "#0EA5E9"; // Sky Blue
    case "EMAIL":
      return "#6366F1"; // Indigo
    case "EVENT":
      return "#F97316"; // Orange
    default:
      return "#64748B"; // Slate
  }
}

/**
 * Generates an ultra-high resolution (minimum 2000px+, default 2600x1500) 2D static
 * network snapshot image from the active investigation case graph data.
 * Returns a data URL (PNG) suitable for PDF reports and web preview.
 */
export function generateNetworkReportSnapshot(
  input: GraphSnapshotInput | any,
  options?: { width?: number; height?: number }
): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  // 1. Extract raw nodes & links
  let rawNodes: any[] = [];
  let rawLinks: any[] = [];

  if (Array.isArray(input?.nodes) && input.nodes.length > 0) {
    rawNodes = input.nodes;
    rawLinks = input.links || input.edges || [];
  }
  
  if (rawNodes.length === 0 && Array.isArray(input?.entities) && input.entities.length > 0) {
    rawNodes = input.entities;
    rawLinks = input.relationships || [];
  } else if (rawNodes.length === 0 && Array.isArray(input)) {
    rawNodes = input;
  }

  if (!rawNodes || rawNodes.length === 0) {
    return null;
  }

  // 2. Build internal node map
  const nodeMap = new Map<string, LayoutNode>();
  for (const n of rawNodes) {
    const id = String(n._id || n.id || n.name || "");
    if (!id) continue;
    const name = String(n.name || id);
    const type = String(n.type || "PERSON").toUpperCase();
    const riskScore = Number(n.risk_score ?? n.risk ?? 0);
    const nodeObj: LayoutNode = {
      id,
      name,
      type,
      riskScore,
      degree: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 26,
    };
    nodeMap.set(id, nodeObj);
    nodeMap.set(id.toLowerCase(), nodeObj);
    if (n._id) {
      nodeMap.set(String(n._id), nodeObj);
      nodeMap.set(String(n._id).toLowerCase(), nodeObj);
    }
    if (n.id) {
      nodeMap.set(String(n.id), nodeObj);
      nodeMap.set(String(n.id).toLowerCase(), nodeObj);
    }
    if (name) {
      nodeMap.set(name, nodeObj);
      nodeMap.set(name.toLowerCase(), nodeObj);
    }
  }

  // 3. Build internal edges
  const layoutEdges: LayoutEdge[] = [];
  for (const l of rawLinks) {
    const srcId = linkId(l.source_entity_id || l.sourceId || l.source);
    const tgtId = linkId(l.target_entity_id || l.targetId || l.target);
    const srcNode = nodeMap.get(srcId) || nodeMap.get(srcId.toLowerCase());
    const tgtNode = nodeMap.get(tgtId) || nodeMap.get(tgtId.toLowerCase());

    if (srcNode && tgtNode && srcNode.id !== tgtNode.id) {
      srcNode.degree += 1;
      tgtNode.degree += 1;
      const relType = String(l.type || l.relationship_type || "CONNECTED_WITH");
      const edgeConfig = getEdgeColorByType(relType, "light");
      layoutEdges.push({
        id: String(l._id || l.id || `${srcNode.id}-${tgtNode.id}`),
        sourceId: srcNode.id,
        targetId: tgtNode.id,
        sourceNode: srcNode,
        targetNode: tgtNode,
        type: relType,
        edgeConfig,
      });
    }
  }

  // Unique list of nodes
  const layoutNodes: LayoutNode[] = Array.from(new Set(Array.from(nodeMap.values())));
  if (layoutNodes.length === 0) {
    return null;
  }

  // Adjust node radius based on connectivity degree (range 24 - 36px)
  for (const n of layoutNodes) {
    n.radius = Math.min(36, Math.max(24, 24 + n.degree * 1.5));
  }

  // 4. Setup Canvas Resolution (Default 2600 x 1500 landscape)
  const width = options?.width || 2600;
  const height = options?.height || 1500;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 5. Initial Positions (Circle / Spiral layout around center)
  const centerX = width / 2;
  const centerY = (height - 60) / 2;
  const count = layoutNodes.length;

  if (count === 1) {
    layoutNodes[0].x = centerX;
    layoutNodes[0].y = centerY;
  } else {
    const initialRadius = Math.min(width, height) * 0.32;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      layoutNodes[i].x = centerX + initialRadius * Math.cos(angle) + (Math.random() - 0.5) * 40;
      layoutNodes[i].y = centerY + initialRadius * Math.sin(angle) + (Math.random() - 0.5) * 40;
    }
  }

  // 6. Force-Directed Layout Simulation (180 iterations)
  const kRepulsion = 260000;
  const idealDistance = 240;
  const kSpring = 0.045;
  const kGravity = 0.025;

  for (let iter = 0; iter < 180; iter++) {
    const alpha = (1 - iter / 180) * 0.95;

    // Node-node repulsion
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        let dx = layoutNodes[i].x - layoutNodes[j].x;
        let dy = layoutNodes[i].y - layoutNodes[j].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          dist = Math.sqrt(dx * dx + dy * dy);
        }
        const force = (kRepulsion / (dist * dist)) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        layoutNodes[i].vx += fx;
        layoutNodes[i].vy += fy;
        layoutNodes[j].vx -= fx;
        layoutNodes[j].vy -= fy;
      }
    }

    // Edge spring attraction
    for (const e of layoutEdges) {
      const s = e.sourceNode;
      const t = e.targetNode;
      let dx = t.x - s.x;
      let dy = t.y - s.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const delta = dist - idealDistance;
      const force = delta * kSpring * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // Gravity to center + velocity integration
    for (const n of layoutNodes) {
      n.vx += (centerX - n.x) * kGravity * alpha;
      n.vy += (centerY - n.y) * kGravity * alpha;

      n.x += n.vx * 0.6;
      n.y += n.vy * 0.6;
      n.vx *= 0.5;
      n.vy *= 0.5;
    }
  }

  // 7. Auto-fit to Canvas Bounds
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of layoutNodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const padLeft = 140;
  const padRight = 140;
  const padTop = 110;
  const padBottom = 200; // room for legend at bottom

  const targetW = width - (padLeft + padRight);
  const targetH = height - (padTop + padBottom);

  const scale = Math.min(targetW / spanX, targetH / spanY, 1.8);
  const graphMidX = (minX + maxX) / 2;
  const graphMidY = (minY + maxY) / 2;
  const canvasMidX = padLeft + targetW / 2;
  const canvasMidY = padTop + targetH / 2;

  for (const n of layoutNodes) {
    n.x = canvasMidX + (n.x - graphMidX) * scale;
    n.y = canvasMidY + (n.y - graphMidY) * scale;
  }

  // 8. RENDER TO CANVAS
  // Background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  // Subtle grid dot pattern
  ctx.fillStyle = "#F1F5F9";
  for (let gx = 40; gx < width; gx += 40) {
    for (let gy = 40; gy < height; gy += 40) {
      ctx.fillRect(gx, gy, 2, 2);
    }
  }

  // Outer border
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // Header Banner
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  ctx.fillText("NEXUS INVESTIGATION NETWORK ANALYSIS", 50, 56);

  ctx.fillStyle = "#64748B";
  ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  const metricsText = `Entities: ${layoutNodes.length}  |  Relationships: ${layoutEdges.length}  |  Generated: ${new Date().toLocaleDateString()}`;
  const mw = ctx.measureText(metricsText).width;
  ctx.fillText(metricsText, width - mw - 50, 56);

  // Top header divider
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 75);
  ctx.lineTo(width - 50, 75);
  ctx.stroke();

  // 9. DRAW EDGES
  for (const e of layoutEdges) {
    const s = e.sourceNode;
    const t = e.targetNode;

    const angle = Math.atan2(t.y - s.y, t.x - s.x);
    const startX = s.x + Math.cos(angle) * (s.radius + 2);
    const startY = s.y + Math.sin(angle) * (s.radius + 2);
    const endX = t.x - Math.cos(angle) * (t.radius + 8);
    const endY = t.y - Math.sin(angle) * (t.radius + 8);

    ctx.save();
    ctx.strokeStyle = e.edgeConfig.line;
    ctx.lineWidth = 2.8;

    if (e.edgeConfig.style === "dashed") {
      ctx.setLineDash([8, 5]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead for directional edges
    if (e.edgeConfig.isDirectional) {
      ctx.setLineDash([]);
      ctx.fillStyle = e.edgeConfig.line;
      const arrLen = 14;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrLen * Math.cos(angle - Math.PI / 6),
        endY - arrLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        endX - arrLen * Math.cos(angle + Math.PI / 6),
        endY - arrLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Edge Label at midpoint
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const labelText = formatEdgeLabel(e.type);

    ctx.save();
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    const tw = ctx.measureText(labelText).width;
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, midX - tw / 2 - 6, midY - 9, tw + 12, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = e.edgeConfig.labelColor || "#334155";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, midX, midY);
    ctx.restore();
  }

  // 10. DRAW NODES
  for (const n of layoutNodes) {
    const { x, y, radius, type, riskScore } = n;
    const isHighRisk = riskScore >= 0.7;
    const isMedRisk = riskScore >= 0.4 && riskScore < 0.7;

    ctx.save();

    // Outer Risk Rings / Halo
    if (isHighRisk) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.28)";
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#EF4444";
      ctx.lineWidth = 3.5;
      ctx.stroke();
    } else if (isMedRisk) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = 2.8;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#CBD5E1";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Node Body Fill & Shape
    ctx.fillStyle = getNodeFillColor(type);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2.5;

    switch (type) {
      case "ORGANIZATION": {
        // Rounded rectangle
        const w = radius * 2.1;
        const h = radius * 1.7;
        drawRoundedRect(ctx, x - w / 2, y - h / 2, w, h, 6);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "LOCATION": {
        // Diamond
        const d = radius * 1.35;
        ctx.beginPath();
        ctx.moveTo(x, y - d);
        ctx.lineTo(x + d, y);
        ctx.lineTo(x, y + d);
        ctx.lineTo(x - d, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "VEHICLE": {
        // Hexagon
        const hRad = radius * 1.25;
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = (Math.PI / 3) * s - Math.PI / 6;
          const px = x + hRad * Math.cos(a);
          const py = y + hRad * Math.sin(a);
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "ACCOUNT": {
        const w = radius * 2.3;
        const h = radius * 1.5;
        drawRoundedRect(ctx, x - w / 2, y - h / 2, w, h, 8);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "PHONE":
      case "PHONE_NUMBER":
      case "COMMUNICATION": {
        drawRoundedRect(ctx, x - radius * 0.95, y - radius * 0.95, radius * 1.9, radius * 1.9, 6);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "EMAIL": {
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 1.25, radius * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
      default: {
        // Circle (PERSON and others)
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
    }

    // Node Type Initial / Icon Marker inside node
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.round(radius * 0.72)}px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const initial = (type.charAt(0) || "E").toUpperCase();
    ctx.fillText(initial, x, y);

    ctx.restore();

    // 11. NODE LABELS
    ctx.save();
    let displayName = n.name;
    if (displayName.length > 22) {
      displayName = displayName.substring(0, 20) + "...";
    }

    ctx.font = "bold 17px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    const nameWidth = ctx.measureText(displayName).width;
    const labelY = y + radius + 15;

    // Background pill for label
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x - nameWidth / 2 - 8, labelY - 11, nameWidth + 16, 22, 5);
    ctx.fill();
    ctx.stroke();

    // Entity Name
    ctx.fillStyle = "#0F172A";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayName, x, labelY);

    // Subtitle (Type & Risk badge)
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    const subText = `${type} • RISK ${riskScore.toFixed(2)}`;
    const subWidth = ctx.measureText(subText).width;
    const subY = labelY + 19;

    ctx.fillStyle = isHighRisk ? "#FEF2F2" : isMedRisk ? "#FFFBEB" : "#F8FAFC";
    ctx.strokeStyle = isHighRisk ? "#FCA5A5" : isMedRisk ? "#FDE68A" : "#E2E8F0";
    drawRoundedRect(ctx, x - subWidth / 2 - 5, subY - 8, subWidth + 10, 16, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isHighRisk ? "#DC2626" : isMedRisk ? "#D97706" : "#64748B";
    ctx.fillText(subText, x, subY);

    ctx.restore();
  }

  // 12. DRAW COMPREHENSIVE LEGEND
  // Collect unique entity types and edge categories actually present in graph
  const presentEntityTypes = Array.from(new Set(layoutNodes.map((n) => n.type)));
  const presentEdgeCats = Array.from(
    new Set(layoutEdges.map((e) => e.edgeConfig.categoryLabel))
  );

  const legendY = height - 120;
  const legendH = 95;
  const legendW = width - 100;

  ctx.save();
  // Legend card background
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 50, legendY, legendW, legendH, 8);
  ctx.fill();
  ctx.stroke();

  // Legend Title
  ctx.fillStyle = "#1E293B";
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  ctx.fillText("NETWORK ANALYSIS LEGEND", 70, legendY + 24);

  // Column 1: Entity Types
  let curX = 70;
  const itemY1 = legendY + 54;
  const itemY2 = legendY + 76;

  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("Entity Types:", curX, itemY1);
  curX += 95;

  let col1Count = 0;
  for (const et of presentEntityTypes.slice(0, 6)) {
    const targetY = col1Count < 3 ? itemY1 : itemY2;
    const printX = col1Count >= 3 ? curX - (col1Count - 3) * 110 : curX;
    
    ctx.fillStyle = getNodeFillColor(et);
    ctx.beginPath();
    ctx.arc(curX, itemY1, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1E293B";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    ctx.fillText(et.charAt(0) + et.slice(1).toLowerCase(), curX + 12, itemY1 + 4);
    curX += 115;
    col1Count++;
  }

  // Column 2: Relationships
  curX = Math.max(curX + 20, 850);
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("Relationships:", curX, itemY1);
  curX += 105;

  for (const rc of presentEdgeCats.slice(0, 5)) {
    const sampleEdge = layoutEdges.find((e) => e.edgeConfig.categoryLabel === rc);
    const color = sampleEdge?.edgeConfig.line || "#3B82F6";

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(curX, itemY1);
    ctx.lineTo(curX + 18, itemY1);
    ctx.stroke();

    ctx.fillStyle = "#1E293B";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    ctx.fillText(rc, curX + 24, itemY1 + 4);
    curX += 135;
  }

  // Column 3: Risk Indicators
  const riskStartX = width - 480;
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("Risk Rating:", riskStartX, itemY1);

  // High Risk
  ctx.fillStyle = "#EF4444";
  ctx.beginPath();
  ctx.arc(riskStartX + 90, itemY1, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#DC2626";
  ctx.fillText("Critical/High (≥0.70)", riskStartX + 102, itemY1 + 4);

  // Medium Risk
  ctx.fillStyle = "#F59E0B";
  ctx.beginPath();
  ctx.arc(riskStartX + 255, itemY1, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#D97706";
  ctx.fillText("Medium", riskStartX + 267, itemY1 + 4);

  // Low Risk
  ctx.fillStyle = "#94A3B8";
  ctx.beginPath();
  ctx.arc(riskStartX + 345, itemY1, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#64748B";
  ctx.fillText("Low", riskStartX + 357, itemY1 + 4);

  ctx.restore();

  // 13. Export High-Resolution PNG Data URL
  return canvas.toDataURL("image/png");
}
