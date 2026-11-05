"use client";
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, DragControls, Html, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "@/context/ThemeContext";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faBuilding,
  faMapMarkerAlt,
  faCar,
  faPhone,
  faFileInvoice,
  faEnvelope,
  faCalendarAlt,
  faExclamationTriangle,
  faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";

import {
  getEdgeColorByType,
  formatEdgeLabel,
  EdgeColorConfig,
  RELATIONSHIP_CATEGORIES,
} from "./networkColorUtils";

export { getEdgeColorByType, formatEdgeLabel, RELATIONSHIP_CATEGORIES, type EdgeColorConfig };

function linkEndpointId(value: unknown): string {
  if (value && typeof value === "object") {
    const obj = value as { id?: string; _id?: string };
    return String(obj.id ?? obj._id ?? "");
  }
  return String(value ?? "");
}

function fibonacciSphere(count: number, radius: number): [number, number, number][] {
  if (count <= 0) return [];
  if (count === 1) return [[0, 0, 0]];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y)) * radius;
    const theta = golden * i;
    return [Math.cos(theta) * r, y * radius * 0.85, Math.sin(theta) * r];
  });
}

const getIconForType = (type: string) => {
  switch ((type || "").toUpperCase()) {
    case "PERSON":
      return faUser;
    case "ORGANIZATION":
      return faBuilding;
    case "LOCATION":
      return faMapMarkerAlt;
    case "VEHICLE":
      return faCar;
    case "PHONE":
    case "PHONE_NUMBER":
    case "COMMUNICATION":
      return faPhone;
    case "ACCOUNT":
      return faFileInvoice;
    case "EMAIL":
      return faEnvelope;
    case "EVENT":
      return faCalendarAlt;
    case "ALERT":
    case "HIGH_RISK":
      return faExclamationTriangle;
    default:
      return faQuestionCircle;
  }
};

/* =========================================================================
   NETWORK NODE COMPONENT
   Visual Hierarchy & Risk/Selection Separation:
   - Shapes: PERSON=Sphere, ORG=Box, LOCATION=Diamond, VEHICLE=Hexagon,
             ACCOUNT=Rounded Box, EMAIL=Small Sphere, EVENT=Dodecahedron (Star)
   - Node Size: Proportional to connectivity/degree (subtle range 0.72 - 1.15)
   - Selection: Bright Cyan #22D3EE + white inner highlight (NO RED HALO!)
   - Risk: Subtle outer ring (Med: #FBBF24 Amber, High: #FB923C Orange, Crit: #EF4444 Red)
   ========================================================================= */

interface NetworkNodeProps {
  position: [number, number, number];
  color: string;
  name: string;
  type: string;
  riskScore: number;
  degree?: number;
  highlighted: boolean;
  dimmed: boolean;
  onClick?: () => void;
  onHover?: (isHovered: boolean) => void;
  isEditMode?: boolean;
  onNodeDragEnd?: (id: string, x: number, y: number, z: number) => void;
  id: string;
  secondaryEntities?: any[];
  avatar?: string;
  isModalOpen?: boolean;
  theme?: string;
  isSelected?: boolean;
  isConnected?: boolean;
}

const NetworkNode = React.memo(function NetworkNode({
  position,
  color,
  name,
  type,
  riskScore,
  degree = 1,
  highlighted,
  dimmed,
  onClick,
  onHover,
  isEditMode,
  onNodeDragEnd,
  id,
  secondaryEntities,
  avatar,
  isModalOpen = false,
  theme,
  isSelected = false,
  isConnected = false,
}: NetworkNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const selectRingRef = useRef<THREE.Mesh>(null);
  const selectInnerRingRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Network Connectivity / Importance Sizing (Requirement 6)
  const baseSize = useMemo(() => {
    if (degree <= 2) return theme === "light" ? 0.95 : 0.75;
    if (degree <= 5) return theme === "light" ? 1.20 : 0.95;
    return theme === "light" ? 1.45 : 1.15;
  }, [degree, theme]);

  const size = hovered ? baseSize * 1.2 : baseSize;

  // Risk Classification (Requirement 5 & 11)
  const riskColor = useMemo(() => {
    if (theme === "light") {
      if (riskScore >= 0.85) return "#DC2626"; // Critical: thin red ring
      if (riskScore >= 0.7) return "#EA580C"; // High: thin orange ring
      if (riskScore >= 0.4) return "#D97706"; // Medium: thin amber ring
      return null;
    }
    if (riskScore >= 0.85) return "#EF4444";
    if (riskScore >= 0.7) return "#FB923C";
    if (riskScore >= 0.4) return "#FBBF24";
    return null;
  }, [riskScore, theme]);

  useEffect(() => {
    if (isModalOpen) setHovered(false);
  }, [isModalOpen]);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.2;

    if (isSelected) {
      const pulse = 1 + Math.sin(state.clock.getElapsedTime() * 4) * 0.05;
      meshRef.current.scale.setScalar(pulse);
      if (selectRingRef.current) {
        selectRingRef.current.rotation.z = state.clock.getElapsedTime() * 0.7;
      }
      if (selectInnerRingRef.current) {
        selectInnerRingRef.current.rotation.y = state.clock.getElapsedTime() * -0.5;
      }
    } else if (riskColor) {
      const subtlePulse = 1 + Math.sin(state.clock.getElapsedTime() * 2.5) * 0.03;
      meshRef.current.scale.setScalar(subtlePulse);
    }
  });

  useEffect(() => {
    document.body.style.cursor = hovered && !isModalOpen ? (isEditMode ? "grab" : "pointer") : "auto";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered, isEditMode, isModalOpen]);

  // Focus Mode Opacity: Unrelated nodes opacity around 0.25 - 0.40 (Requirement 14)
  const nodeOpacity = isSelected ? 1.0 : isConnected ? 1.0 : dimmed ? (theme === "light" ? 0.35 : 0.20) : (theme === "light" ? 0.98 : 0.9);

  // Geometry selector (Requirement 4: Consistent Shapes)
  const upperType = (type || "").toUpperCase();
  const renderGeometry = () => {
    switch (upperType) {
      case "PERSON":
        return <sphereGeometry args={[size * 1.05, 28, 28]} />;
      case "ORGANIZATION":
        return <boxGeometry args={[size * 1.5, size * 1.5, size * 1.5]} />;
      case "LOCATION":
        // Diamond
        return <octahedronGeometry args={[size * 1.35, 0]} />;
      case "VEHICLE":
        // Hexagon
        return <cylinderGeometry args={[size * 1.05, size * 1.05, size * 0.7, 6]} />;
      case "ACCOUNT":
        // Rounded square / box
        return <boxGeometry args={[size * 1.3, size * 1.3, size * 0.55]} />;
      case "EMAIL":
        // Small circle / sphere
        return <sphereGeometry args={[size * 0.8, 24, 24]} />;
      case "EVENT":
        // Star-like dodecahedron
        return <dodecahedronGeometry args={[size * 1.15, 0]} />;
      default:
        return <sphereGeometry args={[size, 24, 24]} />;
    }
  };

  const nodeContent = (
    <group
      position={isEditMode ? undefined : position}
      onPointerOver={(e) => {
        if (isModalOpen) return;
        e.stopPropagation();
        setHovered(true);
        onHover?.(true);
      }}
      onPointerOut={(e) => {
        if (isModalOpen) return;
        e.stopPropagation();
        setHovered(false);
        onHover?.(false);
      }}
      onClick={(e) => {
        if (isModalOpen) return;
        e.stopPropagation();
        onClick?.();
      }}
    >
      <mesh ref={meshRef}>
        {renderGeometry()}
        <meshStandardMaterial
          color={
            isSelected
              ? (theme === "light" ? "#08A66A" : "#C7CDD4")
              : theme === "light"
              ? color
              : "#1C1C1C"
          }
          roughness={theme === "light" ? 0.15 : 0.35}
          metalness={theme === "light" ? 0.05 : 0.25}
          emissive={
            isSelected
              ? (theme === "light" ? "#08A66A" : "#C7CDD4")
              : hovered
              ? (theme === "light" ? "#059669" : "#F5F5F5")
              : theme === "light"
              ? color
              : color
          }
          emissiveIntensity={
            isSelected
              ? (theme === "light" ? 0.6 : 0.65)
              : hovered
              ? (theme === "light" ? 0.5 : 0.45)
              : theme === "light"
              ? 0.35
              : 0.28
          }
          transparent
          opacity={nodeOpacity}
        />
      </mesh>

      {/* HTML Billboard for Icon / Avatar */}
      <Html center style={{ pointerEvents: "none", zIndex: isSelected ? 10 : 0 }} zIndexRange={isSelected ? [10, 10] : [0, 0]}>
        <div
          className={`flex items-center justify-center rounded-full overflow-hidden transition-all duration-300 ${
            dimmed && !hovered && !isConnected && !isSelected ? "opacity-25" : "opacity-100"
          }`}
          style={{
            width: `${size * 32}px`,
            height: `${size * 32}px`,
            backgroundColor: avatar
              ? "transparent"
              : isSelected
              ? theme === "light" ? "rgba(8,166,106,0.15)" : "#292929"
              : theme === "light" ? "#FFFFFF" : "#1C1C1C",
            border: isSelected
              ? `2.5px solid ${theme === "light" ? "#08A66A" : color}`
              : hovered
              ? `2px solid ${theme === "light" ? "#059669" : "#C7CDD4"}`
              : highlighted
              ? `2px solid ${color}`
              : `2px solid ${theme === "light" ? "rgba(255,255,255,0.95)" : "#454545"}`,
            boxShadow: isSelected
              ? theme === "light" ? "0 0 14px rgba(8,166,106,0.5)" : "0 4px 16px rgba(0,0,0,0.4)"
              : hovered
              ? theme === "light" ? "0 0 8px rgba(8,166,106,0.3)" : "0 2px 8px rgba(0,0,0,0.3)"
              : theme === "light" ? "0 2px 8px rgba(0,0,0,0.22)" : "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {avatar && avatar !== "null" && avatar !== "undefined" && !imgError ? (
            <img src={avatar} alt={name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <FontAwesomeIcon
              icon={getIconForType(type)}
              className="drop-shadow-sm"
              style={{
                fontSize: `${size * 13}px`,
                color: isSelected
                  ? (theme === "light" ? "#08A66A" : "#F5F5F5")
                  : theme === "light"
                  ? color
                  : color,
              }}
            />
          )}
        </div>
      </Html>

      {/* SELECTION RING */}
      {isSelected && (
        <>
          <mesh ref={selectRingRef} rotation-x={Math.PI / 2}>
            <torusGeometry args={[size * 1.55, 0.055, 16, 64]} />
            <meshBasicMaterial color={theme === "light" ? "#08A66A" : "#C7CDD4"} transparent opacity={0.95} />
          </mesh>
          <mesh ref={selectInnerRingRef} rotation-z={Math.PI / 4} rotation-x={Math.PI / 3}>
            <torusGeometry args={[size * 1.35, 0.03, 16, 64]} />
            <meshBasicMaterial color={theme === "light" ? "#22D3EE" : "#858B93"} transparent opacity={0.8} />
          </mesh>
        </>
      )}

      {/* RISK INDICATOR: Subtle outer ring ONLY for Medium/High/Critical Risk */}
      {!isSelected && riskColor && (
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[size * 1.5, 0.04, 16, 64]} />
          <meshBasicMaterial color={riskColor} transparent opacity={dimmed ? 0.15 : 0.85} />
        </mesh>
      )}

      {/* Hover Cyan/Green subtle outline ring */}
      {hovered && !isSelected && (
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[size * 1.4, 0.035, 16, 48]} />
          <meshBasicMaterial color={theme === "light" ? "#08A66A" : "#C7CDD4"} transparent opacity={0.85} />
        </mesh>
      )}

      {/* ALWAYS SHOW: Entity Name on Node */}
      {(!dimmed || hovered || isConnected || isSelected) && (
        <group position={[0, baseSize + (isSelected ? 1.05 : 0.75), 0]}>
          <Text
            fontSize={isSelected ? 0.58 : hovered ? 0.48 : (theme === "light" ? 0.44 : 0.38)}
            fontWeight="bold"
            color={
              isSelected
                ? (theme === "light" ? "#087A52" : "#F5F5F5")
                : hovered
                ? (theme === "light" ? "#08A66A" : "#F5F5F5")
                : isConnected
                ? theme === "light"
                  ? "#0F172A"
                  : "#F5F5F5"
                : theme === "light"
                ? "#1E293B"
                : "#F5F5F5"
            }
            anchorX="center"
            anchorY="middle"
            outlineWidth={theme === "light" ? 0.055 : 0.045}
            outlineColor={theme === "light" ? "#FFFFFF" : "#111111"}
          >
            {name}
          </Text>
          {isSelected && (
            <Text
              position={[0, -0.4, 0]}
              fontSize={0.24}
              fontWeight="bold"
              color={theme === "light" ? "#08A66A" : "#A1A1AA"}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor={theme === "light" ? "#FFFFFF" : "#111111"}
              letterSpacing={0.08}
            >
              INVESTIGATING
            </Text>
          )}
        </group>
      )}

      {/* Hover Tooltip (Requirement 13) */}
      {hovered && !isModalOpen && (
        <Html position={[0, baseSize + 1.1, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none", zIndex: 20 }}>
          <div
            className={`${
              theme === "light"
                ? "bg-white/95 border-[#E2E8F0] text-[#172033] shadow-lg"
                : "bg-[#1C1C1C]/95 border-[#454545] text-[#F5F5F5] shadow-2xl"
            } border rounded-xl p-3.5 min-w-[220px] text-left backdrop-blur-md font-sans animate-fade-in pointer-events-none`}
          >
            <div className={`flex justify-between items-start mb-2 border-b ${theme === "light" ? "border-[#EEF2F6]" : "border-[#303030]"} pb-2`}>
              <div className="flex items-center gap-2">
                {avatar && avatar !== "null" && avatar !== "undefined" && (
                  <img src={avatar} alt="avatar" className="w-7 h-7 rounded bg-[#111111] object-cover" />
                )}
                <div>
                  <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${theme === "light" ? "text-[#087A52]" : "text-[#C7CDD4]"}`}>
                    <FontAwesomeIcon icon={getIconForType(type)} /> {type}
                  </span>
                  <h4 className={`text-xs font-bold truncate max-w-[140px] ${theme === "light" ? "text-[#172033]" : "text-[#F5F5F5]"}`}>{name}</h4>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${
                  riskScore >= 0.85
                    ? theme === "light" ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]" : "bg-red-500/20 text-red-400 border-red-500/40"
                    : riskScore >= 0.7
                    ? theme === "light" ? "bg-[#FFF7ED] text-[#C2410C] border-[#FFEDD5]" : "bg-orange-500/20 text-orange-400 border-orange-500/40"
                    : riskScore >= 0.4
                    ? theme === "light" ? "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]" : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                    : theme === "light" ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                }`}
              >
                Risk: {(riskScore * 100).toFixed(0)}%
              </span>
            </div>

            <div className={`flex justify-between text-[10px] ${theme === "light" ? "text-[#64748B]" : "text-[#A1A1AA]"} mt-1`}>
              <span>Connections: <strong className={theme === "light" ? "text-[#172033]" : "text-[#F5F5F5]"}>{degree}</strong></span>
              <span className={`${theme === "light" ? "text-[#08A66A]" : "text-[#C7CDD4]"} font-mono text-[9px]`}>CLICK TO FOCUS</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );

  if (isEditMode && !isModalOpen) {
    return (
      <group position={position}>
        <DragControls
          autoTransform
          onDragStart={() => {
            document.body.style.cursor = "grabbing";
          }}
          onDragEnd={() => {
            document.body.style.cursor = "grab";
            if (meshRef.current) {
              const pos = new THREE.Vector3();
              meshRef.current.getWorldPosition(pos);
              onNodeDragEnd?.(id, pos.x, pos.y, pos.z);
            }
          }}
        >
          {nodeContent}
        </DragControls>
      </group>
    );
  }

  return nodeContent;
});

/* =========================================================================
   NETWORK EDGE COMPONENT
   Visual Hierarchy, Thickness, Opacity & Line Styles:
   - Fixed Color Palette (Requirement 1)
   - Normal: 1-1.5px (radius 0.042), Opacity 0.60
   - Hovered: 2-2.5px (radius 0.08), Opacity 1.0, subtle glow
   - Selected: 3-4px (radius 0.13), Opacity 1.0, stronger glow
   - Line Styles: Solid vs Dashed vs Double (Requirement 3)
   - Directional Arrows ONLY when isDirectional (DEPARTED_FROM, MOVED_TO, etc.)
   - Label Cleanup: Relationship text ONLY visible on Hover or Click! (Requirement 7)
   ========================================================================= */

interface NetworkEdgeProps {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  label: string;
  type?: string;
  sourceName?: string;
  targetName?: string;
  highlighted: boolean;
  dimmed: boolean;
  isHoveredNodeConnected?: boolean;
  isSelectedConnection?: boolean;
  isEdgeSelected?: boolean;
  onClick?: () => void;
  onHover?: (isHovered: boolean) => void;
  isModalOpen?: boolean;
  theme?: string;
}

const NetworkEdge = React.memo(function NetworkEdge({
  id: _edgeId,
  start,
  end,
  label,
  type,
  sourceName = "Source",
  targetName = "Target",
  highlighted,
  dimmed,
  isHoveredNodeConnected = false,
  isSelectedConnection = false,
  isEdgeSelected = false,
  onClick,
  onHover,
  isModalOpen = false,
  theme = "dark",
}: NetworkEdgeProps) {
  const [hovered, setHovered] = useState(false);

  const midPoint = useMemo(
    () => new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5),
    [start, end]
  );

  const length = useMemo(() => start.distanceTo(end), [start, end]);

  const dir = useMemo(() => {
    const v = new THREE.Vector3().subVectors(end, start);
    return v.lengthSq() > 0 ? v.normalize() : new THREE.Vector3(1, 0, 0);
  }, [start, end]);

  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    q.setFromUnitVectors(up, dir);
    return q;
  }, [dir]);

  const edgeConfig = useMemo(() => getEdgeColorByType(type || label || "", theme), [type, label, theme]);
  const formattedLabel = useMemo(() => formatEdgeLabel(type || label || "LINKED"), [type, label]);

  // Directional arrow position (near target node)
  const arrowPos = useMemo(() => {
    return new THREE.Vector3().copy(end).addScaledVector(dir, -1.2);
  }, [end, dir]);

  // Edge Thickness & Opacity (Requirement 2 & 8 & Section 9.3)
  const isElevated = isEdgeSelected || isSelectedConnection || highlighted;
  const radius = isEdgeSelected
    ? 0.13 // Selected: 3-4px
    : hovered
    ? 0.088 // Hovered: 2-2.5px
    : isElevated
    ? 0.075
    : edgeConfig.style === "double"
    ? 0.058
    : 0.048; // Normal: 1-1.5px

  const edgeOpacity = isElevated
    ? 1.0
    : hovered || isHoveredNodeConnected
    ? 1.0
    : dimmed
    ? 0.22 // Never completely disappear against dark background
    : (theme === "light" ? 0.65 : 0.82); // Normal edges opacity 0.82 in dark mode for clear visibility

  const edgeColor = isEdgeSelected
    ? (theme === "light" ? "#08A66A" : "#969DA5")
    : hovered
    ? (theme === "light" ? "#087A52" : "#C7CDD4")
    : isElevated
    ? edgeConfig.line
    : isHoveredNodeConnected
    ? (theme === "light" ? "#172033" : "#F5F5F5")
    : theme === "light"
    ? edgeConfig.line
    : (edgeConfig.line || "#737B84");

  useEffect(() => {
    if (onClick) {
      document.body.style.cursor = hovered && !isModalOpen ? "pointer" : "auto";
      return () => {
        document.body.style.cursor = "auto";
      };
    }
  }, [hovered, onClick, isModalOpen]);

  // Dashed segment calculations (Requirement 3: Drives/Uses, Associated, Owns)
  const dashedSegments = useMemo(() => {
    if (edgeConfig.style !== "dashed" || length <= 0) return null;
    const segmentLength = 0.65;
    const gapLength = 0.45;
    const period = segmentLength + gapLength;
    const count = Math.max(2, Math.floor(length / period));
    const actualSegmentLen = (length * 0.58) / count;
    const actualGap = (length * 0.42) / count;

    const segments: { pos: THREE.Vector3; len: number }[] = [];
    let currentDist = actualGap * 0.5;

    for (let i = 0; i < count; i++) {
      const centerDist = currentDist + actualSegmentLen * 0.5;
      const segCenter = new THREE.Vector3().copy(start).addScaledVector(dir, centerDist);
      segments.push({ pos: segCenter, len: actualSegmentLen });
      currentDist += actualSegmentLen + actualGap;
    }
    return segments;
  }, [edgeConfig.style, length, start, dir]);

  // Double-line offset vector (Requirement 3: Financial)
  const doubleOffsets = useMemo(() => {
    if (edgeConfig.style !== "double") return null;
    // Cross product with up vector to find perpendicular direction
    const up = new THREE.Vector3(0, 1, 0);
    let perp = new THREE.Vector3().crossVectors(dir, up);
    if (perp.lengthSq() < 0.001) {
      perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(1, 0, 0));
    }
    perp.normalize().multiplyScalar(0.06);
    return perp;
  }, [edgeConfig.style, dir]);

  // Label visibility: ONLY visible on hover, when edge is clicked/selected, or on focus connection (Requirement 7)
  const showLabel = hovered || isEdgeSelected;

  return (
    <group
      onPointerOver={(e) => {
        if (isModalOpen) return;
        e.stopPropagation();
        setHovered(true);
        onHover?.(true);
      }}
      onPointerOut={(e) => {
        if (isModalOpen) return;
        e.stopPropagation();
        setHovered(false);
        onHover?.(false);
      }}
      onClick={(e) => {
        if (isModalOpen) return;
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Invisible wider hit cylinder for effortless pointer interaction */}
      {length > 0 && (
        <mesh position={midPoint} quaternion={quaternion}>
          <cylinderGeometry args={[0.22, 0.22, length, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* Render Line Style */}
      {edgeConfig.style === "dashed" && dashedSegments ? (
        // Dashed Style (DRIVES, ASSOCIATED_WITH, OWNS)
        dashedSegments.map((seg, idx) => (
          <mesh key={idx} position={seg.pos} quaternion={quaternion}>
            <cylinderGeometry args={[radius, radius, seg.len, 6]} />
            <meshStandardMaterial
              color={edgeColor}
              roughness={0.3}
              metalness={0.7}
              emissive={edgeColor}
              emissiveIntensity={isElevated ? 0.85 : hovered ? 0.65 : theme === "light" ? 0.15 : 0.35}
              transparent
              opacity={edgeOpacity}
            />
          </mesh>
        ))
      ) : edgeConfig.style === "double" && doubleOffsets ? (
        // Double-line Style (FINANCIAL / TRANSFERRED_MONEY)
        <>
          <mesh position={new THREE.Vector3().copy(midPoint).add(doubleOffsets)} quaternion={quaternion}>
            <cylinderGeometry args={[radius * 0.8, radius * 0.8, length, 6]} />
            <meshStandardMaterial
              color={edgeColor}
              roughness={0.3}
              metalness={0.7}
              emissive={edgeColor}
              emissiveIntensity={isElevated ? 0.85 : hovered ? 0.65 : theme === "light" ? 0.2 : 0.35}
              transparent
              opacity={edgeOpacity}
            />
          </mesh>
          <mesh position={new THREE.Vector3().copy(midPoint).sub(doubleOffsets)} quaternion={quaternion}>
            <cylinderGeometry args={[radius * 0.8, radius * 0.8, length, 6]} />
            <meshStandardMaterial
              color={edgeColor}
              roughness={0.3}
              metalness={0.7}
              emissive={edgeColor}
              emissiveIntensity={isElevated ? 0.85 : hovered ? 0.65 : theme === "light" ? 0.2 : 0.35}
              transparent
              opacity={edgeOpacity}
            />
          </mesh>
        </>
      ) : (
        // Solid Line Style (COMMUNICATES_WITH, WORKS_FOR, VISITED, DEPARTED_FROM)
        length > 0 && (
          <mesh position={midPoint} quaternion={quaternion}>
            <cylinderGeometry args={[radius, radius, length, 8]} />
            <meshStandardMaterial
              color={edgeColor}
              roughness={0.3}
              metalness={0.7}
              emissive={edgeColor}
              emissiveIntensity={isElevated ? 0.85 : hovered ? 0.65 : theme === "light" ? 0.15 : 0.35}
              transparent
              opacity={edgeOpacity}
            />
          </mesh>
        )
      )}

      {/* Directional Arrow (Rendered ONLY if edgeConfig.isDirectional is true!) */}
      {edgeConfig.isDirectional && length > 1.8 && (
        <mesh position={arrowPos} quaternion={quaternion}>
          <coneGeometry args={[isEdgeSelected ? 0.26 : 0.18, isEdgeSelected ? 0.65 : 0.5, 8]} />
          <meshStandardMaterial
            color={edgeColor}
            emissive={edgeColor}
            emissiveIntensity={isElevated ? 0.85 : theme === "light" ? 0.3 : 0.45}
            transparent
            opacity={edgeOpacity}
          />
        </mesh>
      )}

      {/* Relationship Label: Shown on Hover or Click (Requirement 7 & Section 9.4) */}
      {showLabel && (
        <Billboard
          position={[midPoint.x, midPoint.y + (isEdgeSelected ? 0.45 : 0.36), midPoint.z]}
          follow={true}
          lockX={false}
          lockY={false}
          lockZ={false}
        >
          <Text
            fontSize={isEdgeSelected ? 0.38 : 0.32}
            fontWeight="bold"
            color={
              isEdgeSelected
                ? theme === "light" ? "#087A52" : "#F5F5F5"
                : hovered
                ? theme === "light" ? "#172033" : "#F5F5F5"
                : theme === "light" ? "#475569" : "#C7CDD4"
            }
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.035}
            outlineColor={theme === "light" ? "#FFFFFF" : "#111111"}
            letterSpacing={0.06}
          >
            {formattedLabel}
          </Text>
        </Billboard>
      )}

      {/* Edge Hover Tooltip: Source -> RELATIONSHIP -> Target (Requirement 7 & 13) */}
      {hovered && !isModalOpen && (
        <Html
          position={[midPoint.x, midPoint.y + 0.8, midPoint.z]}
          center
          zIndexRange={[25, 15]}
          style={{ pointerEvents: "none", zIndex: 25 }}
        >
          <div
            className={`${
              theme === "light"
                ? "bg-white/95 border-[#E2E8F0] text-[#172033] shadow-lg"
                : "bg-[#1C1C1C]/95 border-[#454545] text-[#F5F5F5] shadow-[0_4px_16px_rgba(0,0,0,0.22)]"
            } border rounded-lg px-3 py-1.5 backdrop-blur-md text-[11px] font-sans flex items-center gap-2 whitespace-nowrap animate-fade-in pointer-events-none`}
          >
            <span className={`font-semibold ${theme === "light" ? "text-[#172033]" : "text-[#F5F5F5]"}`}>{sourceName}</span>
            <span
              className="font-bold px-2 py-0.5 rounded text-[10px] tracking-wider uppercase"
              style={{ color: edgeConfig.line, backgroundColor: `${edgeConfig.line}22` }}
            >
              {formattedLabel}
            </span>
            <span className={`font-semibold ${theme === "light" ? "text-[#172033]" : "text-[#F5F5F5]"}`}>{targetName}</span>
          </div>
        </Html>
      )}
    </group>
  );
});

/* =========================================================================
   CAMERA CONTROLLER
   ========================================================================= */

function CameraController({ targetPosition }: { targetPosition?: [number, number, number] | null }) {
  const { camera, controls } = useThree();
  const targetVec = useRef<THREE.Vector3 | null>(null);
  const targetCamPos = useRef<THREE.Vector3 | null>(null);
  const isTransitioning = useRef(false);

  useEffect(() => {
    if (targetPosition) {
      targetVec.current = new THREE.Vector3(targetPosition[0], targetPosition[1], targetPosition[2]);
      targetCamPos.current = new THREE.Vector3(targetPosition[0], targetPosition[1] + 2, targetPosition[2] + 13);
      isTransitioning.current = true;
    }
  }, [targetPosition]);

  useEffect(() => {
    const handleZoomIn = () => {
      camera.position.z = Math.max(8, camera.position.z - 4);
      camera.position.y = Math.max(2, camera.position.y - 1);
      camera.updateProjectionMatrix();
    };
    const handleZoomOut = () => {
      camera.position.z = Math.min(90, camera.position.z + 4);
      camera.position.y = Math.min(20, camera.position.y + 1);
      camera.updateProjectionMatrix();
    };
    const handleReset = () => {
      targetVec.current = new THREE.Vector3(0, 0, 0);
      targetCamPos.current = new THREE.Vector3(0, 4, 38);
      isTransitioning.current = true;
    };

    const handleFocus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        targetVec.current = new THREE.Vector3(detail.x, detail.y, detail.z);
        targetCamPos.current = new THREE.Vector3(detail.x, detail.y + 2, detail.z + 13);
        isTransitioning.current = true;
      }
    };

    window.addEventListener("network:zoomIn", handleZoomIn);
    window.addEventListener("network:zoomOut", handleZoomOut);
    window.addEventListener("network:reset", handleReset);
    window.addEventListener("network:focus", handleFocus);
    return () => {
      window.removeEventListener("network:zoomIn", handleZoomIn);
      window.removeEventListener("network:zoomOut", handleZoomOut);
      window.removeEventListener("network:reset", handleReset);
      window.removeEventListener("network:focus", handleFocus);
    };
  }, [camera]);

  useFrame(() => {
    if (!isTransitioning.current || !targetVec.current || !targetCamPos.current) return;

    if (controls && (controls as any).target) {
      (controls as any).target.lerp(targetVec.current, 0.08);
    }
    camera.position.lerp(targetCamPos.current, 0.08);
    camera.updateProjectionMatrix();

    if (camera.position.distanceTo(targetCamPos.current) < 0.05) {
      isTransitioning.current = false;
    }
  });

  return null;
}

/* =========================================================================
   MAIN NETWORK SCENE
   ========================================================================= */

export interface NetworkSceneProps {
  data: any;
  onNodeClick?: (node: any) => void;
  onEdgeClick?: (edge: any) => void;
  highlightedPath?: string[];
  selectedNodeId?: string | null;
  networkDepth?: "1" | "2" | "3" | "ALL";
  relationshipCategory?: string;
  isEditMode?: boolean;
  onNodeDragEnd?: (id: string, x: number, y: number, z: number) => void;
  draggedPositions?: Record<string, { x: number; y: number; z: number }>;
  isModalOpen?: boolean;
}

export default function NetworkScene({
  data,
  onNodeClick,
  onEdgeClick,
  highlightedPath = [],
  selectedNodeId = null,
  networkDepth = "2",
  relationshipCategory = "ALL",
  isEditMode = false,
  onNodeDragEnd,
  draggedPositions = {},
  isModalOpen = false,
}: NetworkSceneProps) {
  const { theme } = useTheme();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Clear selected edge when clicking elsewhere
  const handleEdgeClickInternal = useCallback(
    (edge: any) => {
      setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id));
      onEdgeClick?.(edge);
    },
    [onEdgeClick]
  );

  // Compute node degrees (number of links connected to each node)
  const nodeDegrees = useMemo(() => {
    const rawLinks = data?.links || data?.edges || [];
    const degMap = new Map<string, number>();
    for (const link of rawLinks) {
      const s = linkEndpointId(link.source);
      const t = linkEndpointId(link.target);
      if (s) degMap.set(s, (degMap.get(s) || 0) + 1);
      if (t) degMap.set(t, (degMap.get(t) || 0) + 1);
    }
    return degMap;
  }, [data]);

  // Primary & secondary nodes placement
  const nodes = useMemo(() => {
    const rawNodes = data?.nodes || [];
    const rawLinks = data?.links || data?.edges || [];
    const primaryTypes = new Set(["person", "organization", "location", "vehicle"]);

    const primaryNodes: any[] = [];
    const secondaryNodes: any[] = [];

    for (const node of rawNodes) {
      const t = (node.type || "").toLowerCase();
      if (primaryTypes.has(t)) {
        primaryNodes.push(node);
      } else {
        secondaryNodes.push(node);
      }
    }

    const positions = fibonacciSphere(primaryNodes.length, 16);
    const finalNodes: any[] = [];
    const primaryMap = new Map<string, any>();

    for (let i = 0; i < primaryNodes.length; i++) {
      const node = primaryNodes[i];
      const idStr = String(node.id ?? node._id ?? i);
      let pos = positions[i] || [0, 0, 0];
      if (draggedPositions[idStr]) {
        pos = [draggedPositions[idStr].x, draggedPositions[idStr].y, draggedPositions[idStr].z];
      } else if (node.position && typeof node.position.x === "number") {
        pos = [node.position.x, node.position.y, node.position.z];
      }
      const outNode = { ...node, id: idStr, position: pos, degree: nodeDegrees.get(idStr) || 1 };
      primaryMap.set(idStr, outNode);
      finalNodes.push(outNode);
    }

    const getConnectedPrimary = (nodeId: string) => {
      let bestPrimary = null;
      let maxScore = -1;
      for (const link of rawLinks) {
        const s = linkEndpointId(link.source);
        const t = linkEndpointId(link.target);
        let potentialPrimary = null;
        if (s === nodeId && primaryMap.has(t)) potentialPrimary = primaryMap.get(t);
        if (t === nodeId && primaryMap.has(s)) potentialPrimary = primaryMap.get(s);

        if (potentialPrimary) {
          const score = potentialPrimary.risk_score || 0;
          if (!bestPrimary || score > maxScore) {
            maxScore = score;
            bestPrimary = potentialPrimary;
          }
        }
      }
      return bestPrimary;
    };

    for (let i = 0; i < secondaryNodes.length; i++) {
      const node = secondaryNodes[i];
      const idStr = String(node.id ?? node._id ?? primaryNodes.length + i);
      let pos = [0, 0, 0];
      if (draggedPositions[idStr]) {
        pos = [draggedPositions[idStr].x, draggedPositions[idStr].y, draggedPositions[idStr].z];
      } else if (node.position && typeof node.position.x === "number") {
        pos = [node.position.x, node.position.y, node.position.z];
      } else {
        const parentPrimary = getConnectedPrimary(idStr);
        if (parentPrimary) {
          parentPrimary.secondaryEntities = parentPrimary.secondaryEntities || [];
          parentPrimary.secondaryEntities.push(node);
        }
      }
    }
    return finalNodes;
  }, [data, draggedPositions, nodeDegrees]);

  const nodeById = useMemo(() => {
    const map = new Map<string, any>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  // Network Depth & Connected Nodes (Requirement 8 & 9)
  const { connectedNodeIds, connectedEdgeIds, hopDistances } = useMemo(() => {
    if (!selectedNodeId) {
      return {
        connectedNodeIds: new Set<string>(),
        connectedEdgeIds: new Set<string>(),
        hopDistances: new Map<string, number>(),
      };
    }

    const rawLinks = data?.links || data?.edges || [];
    const directNodes = new Set<string>();
    const directEdges = new Set<string>();

    // Build adjacency for multi-hop BFS
    const adj = new Map<string, Set<string>>();
    rawLinks.forEach((link: any, index: number) => {
      const s = linkEndpointId(link.source);
      const t = linkEndpointId(link.target);
      const edgeId = String(link.rel_id || link.id || `${s}-${t}-${index}`);

      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);

      if (s === String(selectedNodeId)) {
        directNodes.add(t);
        directEdges.add(edgeId);
      } else if (t === String(selectedNodeId)) {
        directNodes.add(s);
        directEdges.add(edgeId);
      }
    });

    // BFS distance map from selectedNodeId
    const distances = new Map<string, number>();
    distances.set(String(selectedNodeId), 0);
    const queue: [string, number][] = [[String(selectedNodeId), 0]];

    while (queue.length > 0) {
      const [curr, dist] = queue.shift()!;
      if (dist >= 3) continue; // Up to 3 hops
      const neighbors = adj.get(curr);
      if (neighbors) {
        neighbors.forEach((nbr) => {
          if (!distances.has(nbr)) {
            distances.set(nbr, dist + 1);
            queue.push([nbr, dist + 1]);
          }
        });
      }
    }

    return {
      connectedNodeIds: directNodes,
      connectedEdgeIds: directEdges,
      hopDistances: distances,
    };
  }, [data, selectedNodeId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n: any) => String(n.id) === String(selectedNodeId)) || null;
  }, [nodes, selectedNodeId]);

  // Edge hover highlight for connected nodes
  const hoveredNodeConnectedEdges = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const rawLinks = data?.links || data?.edges || [];
    const edgeSet = new Set<string>();
    rawLinks.forEach((link: any, index: number) => {
      const s = linkEndpointId(link.source);
      const t = linkEndpointId(link.target);
      if (s === hoveredNodeId || t === hoveredNodeId) {
        edgeSet.add(String(link.rel_id || link.id || `${s}-${t}-${index}`));
      }
    });
    return edgeSet;
  }, [data, hoveredNodeId]);

  // Edges list
  const edges = useMemo(() => {
    const rawLinks = data?.links || data?.edges || [];
    const path = (highlightedPath || []).map(String);

    return rawLinks
      .map((link: any, index: number) => {
        const sourceId = linkEndpointId(link.source);
        const targetId = linkEndpointId(link.target);
        const sourceNode = nodeById.get(sourceId);
        const targetNode = nodeById.get(targetId);
        if (!sourceNode || !targetNode) return null;
        if (sourceId === targetId) return null;

        let isHighlighted = false;
        for (let i = 0; i < path.length - 1; i++) {
          if (
            (path[i] === sourceId && path[i + 1] === targetId) ||
            (path[i] === targetId && path[i + 1] === sourceId)
          ) {
            isHighlighted = true;
            break;
          }
        }

        const edgeId = String(link.rel_id || link.id || `${sourceId}-${targetId}-${index}`);
        const edgeConfig = getEdgeColorByType(link.type || "LINKED", theme);

        return {
          id: edgeId,
          start: new THREE.Vector3(...sourceNode.position),
          end: new THREE.Vector3(...targetNode.position),
          label: link.type || "LINKED",
          type: link.type || "LINKED",
          source: sourceId,
          target: targetId,
          sourceName: sourceNode.name,
          targetName: targetNode.name,
          category: edgeConfig.category,
          highlighted: isHighlighted,
        };
      })
      .filter(Boolean);
  }, [data, nodeById, highlightedPath, theme]);

  const getColorByType = (type: string, riskScore: number) => {
    if (theme === "light") {
      // Light theme: Brighter, vivid solid colors for maximum visibility and pop
      switch ((type || "").toUpperCase()) {
        case "PERSON":
          return "#2563EB"; // Vibrant Solid Royal Blue
        case "ORGANIZATION":
          return "#10B981"; // Vibrant Solid Emerald Green
        case "LOCATION":
          return "#F59E0B"; // Vibrant Solid Amber / Gold
        case "VEHICLE":
          return "#8B5CF6"; // Vibrant Solid Purple
        case "ACCOUNT":
          return "#06B6D4"; // Vibrant Solid Cyan
        case "EMAIL":
          return "#0EA5E9"; // Vibrant Solid Sky Blue
        case "EVENT":
          return "#F97316"; // Vibrant Solid Coral / Orange
        case "PHONE":
        case "PHONE_NUMBER":
        case "COMMUNICATION":
          return "#6366F1"; // Vibrant Solid Indigo
        default:
          return "#64748B"; // Slate
      }
    }
    // Dark theme: Preserve distinct entity category colours
    switch ((type || "").toUpperCase()) {
      case "PERSON":
        return "#3B82F6"; // Royal Blue
      case "ORGANIZATION":
        return "#10B981"; // Emerald Green
      case "LOCATION":
        return "#F59E0B"; // Amber
      case "VEHICLE":
        return "#8B5CF6"; // Purple
      case "ACCOUNT":
        return "#06B6D4"; // Cyan
      case "EMAIL":
        return "#EC4899"; // Pink
      case "EVENT":
        return "#F97316"; // Coral / Orange
      case "PHONE":
      case "PHONE_NUMBER":
      case "COMMUNICATION":
        return "#6366F1"; // Indigo
      default:
        return "#858B93"; // Secondary Silver
    }
  };

  const hasHighlight = (highlightedPath && highlightedPath.length > 0) || Boolean(selectedNodeId);

  // Depth threshold calculation
  const maxDepthAllowed = useMemo(() => {
    if (!selectedNodeId || networkDepth === "ALL") return Infinity;
    return parseInt(networkDepth, 10);
  }, [selectedNodeId, networkDepth]);

  if (!nodes.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs font-mono uppercase tracking-widest text-slate-500">
        No network data
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-[280px]">
      <Canvas camera={{ position: [0, 4, 38], fov: 55, near: 0.1, far: 5000 }} gl={{ antialias: true }}>
        <color attach="background" args={[theme === "light" ? "#F8FAFC" : "#111111"]} />
        {theme === "light" && (
          <gridHelper args={[240, 60, "#E2E8F0", "#EEF2F6"]} position={[0, -16, 0]} />
        )}
        <ambientLight intensity={theme === "light" ? 1.0 : 0.5} />
        <pointLight position={[40, 40, 40]} intensity={theme === "light" ? 1.0 : 1.1} />
        <pointLight position={[-40, -20, -40]} intensity={theme === "light" ? 0.5 : 0.45} />
        <directionalLight position={[0, 15, 10]} intensity={theme === "light" ? 0.9 : 0.65} />
        <directionalLight position={[0, -10, -10]} intensity={theme === "light" ? 0.35 : 0} />

        {/* Edges */}
        {edges.map((edge: any) => {
          const isSelectedConnection = Boolean(selectedNodeId) && connectedEdgeIds.has(edge.id);
          const isEdgeSelected = selectedEdgeId === edge.id;
          const isHoveredConn = hoveredNodeConnectedEdges.has(edge.id);

          // Category filter check (Requirement 10)
          const matchesCategory = relationshipCategory === "ALL" || edge.category === relationshipCategory;

          // Depth check: edge is within depth if both nodes are within maxDepthAllowed
          const sDist = hopDistances.get(edge.source) ?? Infinity;
          const tDist = hopDistances.get(edge.target) ?? Infinity;
          const isWithinDepth = !selectedNodeId || (sDist <= maxDepthAllowed && tDist <= maxDepthAllowed);

          const isDimmed = !matchesCategory || !isWithinDepth || (Boolean(selectedNodeId) ? !isSelectedConnection : hasHighlight && !edge.highlighted);

          return (
            <NetworkEdge
              key={edge.id}
              id={edge.id}
              start={edge.start}
              end={edge.end}
              label={edge.label}
              type={edge.type}
              sourceName={edge.sourceName}
              targetName={edge.targetName}
              highlighted={edge.highlighted}
              isSelectedConnection={isSelectedConnection}
              isEdgeSelected={isEdgeSelected}
              isHoveredNodeConnected={isHoveredConn}
              dimmed={isDimmed}
              onClick={() => handleEdgeClickInternal(edge)}
              isModalOpen={isModalOpen}
              theme={theme}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node: any) => {
          const isSelected = Boolean(selectedNodeId) && String(node.id) === String(selectedNodeId);
          const isConnected = Boolean(selectedNodeId) && connectedNodeIds.has(String(node.id));
          const isHighlighted = highlightedPath.map(String).includes(node.id);

          // Depth check for nodes
          const dist = hopDistances.get(String(node.id)) ?? Infinity;
          const isWithinDepth = !selectedNodeId || dist <= maxDepthAllowed;

          const isDimmed = !isWithinDepth || (Boolean(selectedNodeId) ? !isSelected && !isConnected : hasHighlight && !isHighlighted);

          return (
            <NetworkNode
              key={node.id}
              id={node.id}
              position={node.position}
              name={node.name}
              type={node.type}
              riskScore={node.risk_score || 0}
              degree={node.degree || 1}
              color={getColorByType(node.type, node.risk_score || 0)}
              onClick={() => onNodeClick?.(node)}
              onHover={(isHovered) => setHoveredNodeId(isHovered ? String(node.id) : null)}
              highlighted={isHighlighted || isSelected}
              dimmed={isDimmed}
              isSelected={isSelected}
              isConnected={isConnected}
              isEditMode={isEditMode}
              onNodeDragEnd={onNodeDragEnd}
              secondaryEntities={node.secondaryEntities}
              avatar={node.properties?.avatar_url || node.properties?.avatar || node.avatar_url || node.avatar}
              isModalOpen={isModalOpen}
              theme={theme}
            />
          );
        })}

        <CameraController targetPosition={selectedNode ? selectedNode.position : null} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          maxDistance={90}
          minDistance={8}
          enabled={!isModalOpen}
        />
      </Canvas>
    </div>
  );
}
