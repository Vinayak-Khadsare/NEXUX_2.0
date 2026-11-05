"use client";
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface InvestigatorProps {
  interactive?: boolean;
}

// Helper to create a classic 5-point star shape
function createStarShape(radius: number, innerRadius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const l = i % 2 === 0 ? radius : innerRadius;
    const a = (i / points) * Math.PI - Math.PI / 2;
    const x = Math.cos(a) * l;
    const y = Math.sin(a) * l;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// Helper to create a police shield badge outline
function createShieldShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  
  shape.moveTo(-w * 0.85, h);
  shape.lineTo(w * 0.85, h);
  shape.quadraticCurveTo(w, h * 0.4, w * 0.95, -h * 0.2);
  shape.quadraticCurveTo(w * 0.5, -h * 0.8, 0, -h);
  shape.quadraticCurveTo(-w * 0.5, -h * 0.8, -w * 0.95, -h * 0.2);
  shape.quadraticCurveTo(-w, h * 0.4, -w * 0.85, h);
  shape.closePath();
  return shape;
}

export default function PoliceInvestigatorModel({ interactive = true }: InvestigatorProps) {
  const rootGroupRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const chestRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);

  // Reusable materials matching NEXUS Graphite & Platinum Silver aesthetic
  const materials = useMemo(() => {
    return {
      // Police uniform graphite-charcoal fabric
      uniform: new THREE.MeshStandardMaterial({
        color: "#272C33",
        roughness: 0.78,
        metalness: 0.12,
      }),
      // Slightly darker charcoal for collar, pocket flaps, and epaulets
      uniformDark: new THREE.MeshStandardMaterial({
        color: "#1E2228",
        roughness: 0.82,
        metalness: 0.15,
      }),
      // Stylized warm skin tone
      skin: new THREE.MeshStandardMaterial({
        color: "#53372B",
        roughness: 0.55,
        metalness: 0.08,
      }),
      // Platinum Silver for badges, nameplate, insignia, buttons
      platinumSilver: new THREE.MeshStandardMaterial({
        color: "#C7CDD4",
        metalness: 0.92,
        roughness: 0.2,
      }),
      // Slightly brighter silver for star highlights
      brightSilver: new THREE.MeshStandardMaterial({
        color: "#E2E8F0",
        metalness: 0.95,
        roughness: 0.15,
      }),
      // Black glossy leather for cap visor
      glossyVisor: new THREE.MeshStandardMaterial({
        color: "#0D0E10",
        roughness: 0.15,
        metalness: 0.35,
      }),
      // Matte charcoal leather for duty belt, pouches, holster
      dutyLeather: new THREE.MeshStandardMaterial({
        color: "#121417",
        roughness: 0.5,
        metalness: 0.22,
      }),
      // Dark buttons & radio body
      darkMatte: new THREE.MeshStandardMaterial({
        color: "#181A1D",
        roughness: 0.6,
        metalness: 0.4,
      }),
      // Stylized eyes
      eyeWhite: new THREE.MeshStandardMaterial({
        color: "#EAEAEA",
        roughness: 0.2,
        metalness: 0.05,
      }),
      eyeIris: new THREE.MeshStandardMaterial({
        color: "#2C1D17",
        roughness: 0.1,
        metalness: 0.1,
      }),
      eyePupil: new THREE.MeshBasicMaterial({
        color: "#050505",
      }),
      eyeHighlight: new THREE.MeshBasicMaterial({
        color: "#FFFFFF",
      }),
      // Hair
      hair: new THREE.MeshStandardMaterial({
        color: "#141518",
        roughness: 0.85,
        metalness: 0.05,
      }),
    };
  }, []);

  // Shapes for extruded badges
  const badgeGeometry = useMemo(() => {
    const shieldShape = createShieldShape(0.38, 0.48);
    return new THREE.ExtrudeGeometry(shieldShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02,
    });
  }, []);

  const capBadgeGeometry = useMemo(() => {
    const shieldShape = createShieldShape(0.44, 0.54);
    return new THREE.ExtrudeGeometry(shieldShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02,
    });
  }, []);

  const starGeometry = useMemo(() => {
    const starShape = createStarShape(0.14, 0.065);
    return new THREE.ExtrudeGeometry(starShape, {
      depth: 0.03,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.015,
      bevelThickness: 0.015,
    });
  }, []);

  // Idle Animation Loop: natural breathing & micro-sway
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Subtle natural breathing oscillation
    if (chestRef.current) {
      const breath = Math.sin(t * 1.8);
      chestRef.current.scale.set(1 + breath * 0.015, 1 + breath * 0.02, 1 + breath * 0.018);
    }

    // Subtle head micro-movement (looking around slightly)
    if (headGroupRef.current) {
      headGroupRef.current.rotation.y = Math.sin(t * 0.7) * 0.04;
      headGroupRef.current.rotation.x = Math.sin(t * 1.1) * 0.02 - 0.02;
      headGroupRef.current.position.y = 1.68 + Math.sin(t * 1.8) * 0.015;
    }

    // Natural shoulder idle sway
    if (leftArmRef.current && rightArmRef.current) {
      leftArmRef.current.rotation.z = 0.08 + Math.sin(t * 1.8) * 0.01;
      rightArmRef.current.rotation.z = -0.08 - Math.sin(t * 1.8) * 0.01;
    }
  });

  return (
    <group ref={rootGroupRef} position={[0, -1.3, 0]}>
      {/* ==================== 1. HEAD & POLICE CAP ==================== */}
      <group ref={headGroupRef} position={[0, 1.68, 0]}>
        {/* Head Base Mesh */}
        <mesh position={[0, 0, 0]} material={materials.skin}>
          <sphereGeometry args={[0.56, 32, 28]} />
        </mesh>

        {/* Jaw & Chin structure */}
        <mesh position={[0, -0.32, 0.12]} rotation={[0.2, 0, 0]} material={materials.skin}>
          <boxGeometry args={[0.52, 0.44, 0.48]} />
        </mesh>
        <mesh position={[0, -0.46, 0.22]} material={materials.skin}>
          <sphereGeometry args={[0.18, 16, 16]} />
        </mesh>

        {/* Stylized Nose */}
        <mesh position={[0, -0.06, 0.54]} rotation={[-0.1, 0, 0]} material={materials.skin}>
          <coneGeometry args={[0.09, 0.26, 4]} />
        </mesh>

        {/* Stylized Eyes */}
        {[-0.2, 0.2].map((x, i) => (
          <group key={`eye-${i}`} position={[x, 0.08, 0.46]}>
            {/* Eye Sclera */}
            <mesh material={materials.eyeWhite} scale={[1.2, 0.75, 0.5]}>
              <sphereGeometry args={[0.11, 16, 16]} />
            </mesh>
            {/* Eye Iris */}
            <mesh position={[0, 0, 0.07]} material={materials.eyeIris} scale={[1, 1, 0.3]}>
              <sphereGeometry args={[0.068, 16, 16]} />
            </mesh>
            {/* Eye Pupil */}
            <mesh position={[0, 0, 0.085]} material={materials.eyePupil} scale={[1, 1, 0.2]}>
              <sphereGeometry args={[0.038, 16, 16]} />
            </mesh>
            {/* Eye Catchlight (White reflection) */}
            <mesh position={[0.025, 0.025, 0.092]} material={materials.eyeHighlight}>
              <sphereGeometry args={[0.016, 8, 8]} />
            </mesh>
            {/* Brow Line */}
            <mesh position={[0, 0.12, 0.04]} rotation={[0, 0, i === 0 ? 0.08 : -0.08]} material={materials.hair}>
              <boxGeometry args={[0.22, 0.04, 0.06]} />
            </mesh>
          </group>
        ))}

        {/* Stylized Ears */}
        {[-0.56, 0.56].map((x, i) => (
          <mesh key={`ear-${i}`} position={[x, 0.02, -0.02]} rotation={[0, 0, i === 0 ? -0.15 : 0.15]} material={materials.skin}>
            <sphereGeometry args={[0.15, 12, 12]} />
          </mesh>
        ))}

        {/* Stylized Hair under cap */}
        <mesh position={[0, 0.18, -0.22]} material={materials.hair}>
          <sphereGeometry args={[0.48, 16, 16]} />
        </mesh>

        {/* ================= POLICE CAP (Eight-Point Style) ================= */}
        <group position={[0, 0.36, -0.02]} rotation={[-0.08, 0, 0]}>
          {/* Cap Base Band */}
          <mesh position={[0, 0, 0]} material={materials.uniformDark}>
            <cylinderGeometry args={[0.59, 0.57, 0.18, 32]} />
          </mesh>

          {/* Cap Crown (Charcoal upper fabric flares out) */}
          <mesh position={[0, 0.22, -0.04]} rotation={[0.08, 0, 0]} material={materials.uniform}>
            <cylinderGeometry args={[0.74, 0.58, 0.32, 16]} />
          </mesh>
          {/* Cap Crown Top Crease */}
          <mesh position={[0, 0.38, -0.05]} material={materials.uniformDark}>
            <cylinderGeometry args={[0.73, 0.74, 0.04, 16]} />
          </mesh>

          {/* Glossy Black Visor / Peak (Curved forward) */}
          <group position={[0, -0.06, 0.44]} rotation={[0.34, 0, 0]}>
            <mesh material={materials.glossyVisor}>
              <cylinderGeometry args={[0.62, 0.62, 0.03, 32, 1, false, Math.PI * 0.15, Math.PI * 0.7]} />
            </mesh>
            {/* Visor edge trim */}
            <mesh position={[0, 0.015, 0]} material={materials.platinumSilver}>
              <cylinderGeometry args={[0.625, 0.625, 0.008, 32, 1, false, Math.PI * 0.2, Math.PI * 0.6]} />
            </mesh>
          </group>

          {/* Black Leather Chin Strap Band across front */}
          <mesh position={[0, -0.02, 0.46]} rotation={[0.06, 0, 0]} material={materials.dutyLeather}>
            <boxGeometry args={[0.82, 0.045, 0.28]} />
          </mesh>

          {/* Strap Fastener Buttons (Silver pips on sides) */}
          {[-0.56, 0.56].map((x, i) => (
            <mesh key={`cap-btn-${i}`} position={[x, -0.02, 0.15]} rotation={[0, i === 0 ? -Math.PI / 2 : Math.PI / 2, 0]} material={materials.platinumSilver}>
              <cylinderGeometry args={[0.045, 0.045, 0.04, 12]} />
            </mesh>
          ))}

          {/* Large Silver Cap Badge (Front Crown) */}
          <group position={[0, 0.15, 0.66]} rotation={[-0.1, 0, 0]}>
            <mesh geometry={capBadgeGeometry} material={materials.platinumSilver} scale={0.7} />
            <mesh position={[0, 0.02, 0.04]} geometry={starGeometry} material={materials.brightSilver} scale={0.65} />
            {/* Outer Laurel / Ridge Ring */}
            <mesh position={[0, 0.02, 0.02]} material={materials.platinumSilver}>
              <ringGeometry args={[0.13, 0.16, 24]} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ==================== 2. NECK & UNIFORM COLLAR ==================== */}
      <group position={[0, 1.25, 0]}>
        {/* Muscular Neck */}
        <mesh position={[0, -0.05, 0]} material={materials.skin}>
          <cylinderGeometry args={[0.26, 0.32, 0.44, 24]} />
        </mesh>

        {/* Inner Shirt Collar Band */}
        <mesh position={[0, -0.16, 0]} material={materials.uniformDark}>
          <cylinderGeometry args={[0.33, 0.38, 0.18, 24]} />
        </mesh>

        {/* Sharp Pointed Shirt Collar Leaves */}
        {[-0.16, 0.16].map((x, i) => (
          <group key={`collar-${i}`} position={[x, -0.18, 0.26]} rotation={[0.32, i === 0 ? 0.3 : -0.3, i === 0 ? -0.18 : 0.18]}>
            <mesh material={materials.uniformDark}>
              <boxGeometry args={[0.24, 0.28, 0.035]} />
            </mesh>
          </group>
        ))}

        {/* Radio Mic clipped to center collar placket */}
        <group position={[0, -0.28, 0.36]} rotation={[0.05, 0, 0]}>
          {/* Main mic body */}
          <mesh material={materials.darkMatte}>
            <boxGeometry args={[0.14, 0.18, 0.09]} />
          </mesh>
          {/* Mic speaker grill lines */}
          <mesh position={[0, 0.02, 0.05]} material={materials.platinumSilver}>
            <boxGeometry args={[0.09, 0.06, 0.01]} />
          </mesh>
          {/* Silver clip on top */}
          <mesh position={[0, 0.09, 0.02]} material={materials.platinumSilver}>
            <boxGeometry args={[0.06, 0.04, 0.04]} />
          </mesh>
          {/* Coiled cord descending */}
          <mesh position={[0.03, -0.16, 0.02]} rotation={[0, 0, 0.2]} material={materials.darkMatte}>
            <cylinderGeometry args={[0.018, 0.018, 0.18, 8]} />
          </mesh>
        </group>
      </group>

      {/* ==================== 3. TORSO & UNIFORM BODY ==================== */}
      <group ref={chestRef} position={[0, 0.6, 0]}>
        {/* Main Chest & Torso */}
        <mesh position={[0, 0.05, 0]} material={materials.uniform}>
          <cylinderGeometry args={[0.78, 0.66, 1.25, 24]} />
        </mesh>

        {/* Upper chest athletic volume */}
        <mesh position={[0, 0.26, 0.14]} rotation={[0.15, 0, 0]} material={materials.uniform}>
          <boxGeometry args={[1.28, 0.55, 0.68]} />
        </mesh>

        {/* Center Vertical Front Placket */}
        <mesh position={[0, 0.02, 0.44]} material={materials.uniformDark}>
          <boxGeometry args={[0.12, 1.15, 0.03]} />
        </mesh>

        {/* Uniform Placket Buttons (Charcoal graphite with silver thread reflection) */}
        {[0.32, 0.12, -0.08, -0.28, -0.48].map((y, i) => (
          <mesh key={`btn-${i}`} position={[0, y, 0.46]} rotation={[Math.PI / 2, 0, 0]} material={materials.platinumSilver}>
            <cylinderGeometry args={[0.028, 0.028, 0.015, 12]} />
          </mesh>
        ))}

        {/* Left Chest Pocket with Button Flap */}
        <group position={[0.34, 0.12, 0.44]} rotation={[0.05, 0.08, 0]}>
          {/* Pocket body */}
          <mesh material={materials.uniform}>
            <boxGeometry args={[0.36, 0.4, 0.03]} />
          </mesh>
          {/* Center pleat */}
          <mesh position={[0, 0, 0.018]} material={materials.uniformDark}>
            <boxGeometry args={[0.04, 0.4, 0.01]} />
          </mesh>
          {/* Pointed Flap */}
          <mesh position={[0, 0.18, 0.025]} rotation={[0.08, 0, 0]} material={materials.uniformDark}>
            <boxGeometry args={[0.38, 0.12, 0.03]} />
          </mesh>
          {/* Pocket Button */}
          <mesh position={[0, 0.14, 0.045]} rotation={[Math.PI / 2, 0, 0]} material={materials.platinumSilver}>
            <cylinderGeometry args={[0.024, 0.024, 0.015, 10]} />
          </mesh>
          {/* Silver Pen in pocket */}
          <mesh position={[0.13, 0.22, 0.035]} rotation={[0, 0, 0.05]} material={materials.platinumSilver}>
            <cylinderGeometry args={[0.012, 0.012, 0.16, 8]} />
          </mesh>

          {/* Official Police Shield Badge pinned over left pocket */}
          <group position={[0, 0.32, 0.06]} rotation={[-0.05, 0, 0]}>
            <mesh geometry={badgeGeometry} material={materials.platinumSilver} scale={0.78} />
            <mesh position={[0, 0.02, 0.038]} geometry={starGeometry} material={materials.brightSilver} scale={0.7} />
            {/* Center Star Core Dot */}
            <mesh position={[0, 0.02, 0.055]} material={materials.platinumSilver}>
              <sphereGeometry args={[0.022, 8, 8]} />
            </mesh>
          </group>
        </group>

        {/* Right Chest Pocket with Nameplate */}
        <group position={[-0.34, 0.12, 0.44]} rotation={[0.05, -0.08, 0]}>
          {/* Pocket body */}
          <mesh material={materials.uniform}>
            <boxGeometry args={[0.36, 0.4, 0.03]} />
          </mesh>
          {/* Center pleat */}
          <mesh position={[0, 0, 0.018]} material={materials.uniformDark}>
            <boxGeometry args={[0.04, 0.4, 0.01]} />
          </mesh>
          {/* Pointed Flap */}
          <mesh position={[0, 0.18, 0.025]} rotation={[0.08, 0, 0]} material={materials.uniformDark}>
            <boxGeometry args={[0.38, 0.12, 0.03]} />
          </mesh>
          {/* Pocket Button */}
          <mesh position={[0, 0.14, 0.045]} rotation={[Math.PI / 2, 0, 0]} material={materials.platinumSilver}>
            <cylinderGeometry args={[0.024, 0.024, 0.015, 10]} />
          </mesh>

          {/* Silver Police Nameplate above right pocket */}
          <group position={[0, 0.3, 0.04]} rotation={[-0.05, 0, 0]}>
            <mesh material={materials.platinumSilver}>
              <boxGeometry args={[0.34, 0.085, 0.025]} />
            </mesh>
            {/* Dark engraved text simulator */}
            <mesh position={[0, 0, 0.015]} material={materials.darkMatte}>
              <boxGeometry args={[0.26, 0.03, 0.005]} />
            </mesh>
          </group>
        </group>

        {/* ================= SHOULDER EPAULETS & RANK INSIGNIA ================= */}
        {[-0.64, 0.64].map((x, i) => (
          <group key={`epaulet-${i}`} position={[x, 0.52, 0.04]} rotation={[0, 0, i === 0 ? 0.28 : -0.28]}>
            {/* Epaulet Strap */}
            <mesh material={materials.uniformDark}>
              <boxGeometry args={[0.38, 0.04, 0.18]} />
            </mesh>
            {/* Silver Collar Fastening Button */}
            <mesh position={[i === 0 ? 0.14 : -0.14, 0.025, 0]} material={materials.platinumSilver}>
              <cylinderGeometry args={[0.028, 0.028, 0.02, 10]} />
            </mesh>
            {/* Silver Rank Bars / Pips */}
            <mesh position={[i === 0 ? -0.06 : 0.06, 0.025, 0]} material={materials.platinumSilver}>
              <boxGeometry args={[0.06, 0.018, 0.11]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ==================== 4. ARMS & SLEEVES ==================== */}
      {/* Left Arm */}
      <group ref={leftArmRef} position={[0.78, 1.05, 0.02]}>
        {/* Upper Arm Sleeve */}
        <mesh position={[0.16, -0.42, 0]} rotation={[0, 0, -0.16]} material={materials.uniform}>
          <cylinderGeometry args={[0.24, 0.21, 0.88, 16]} />
        </mesh>
        {/* Shoulder Deltoid Joint */}
        <mesh position={[0.05, -0.05, 0]} material={materials.uniform}>
          <sphereGeometry args={[0.26, 16, 16]} />
        </mesh>
        {/* Department Shoulder Patch (Emblem on sleeve) */}
        <mesh position={[0.31, -0.26, 0]} rotation={[0, Math.PI / 2, 0]} material={materials.uniformDark}>
          <boxGeometry args={[0.24, 0.32, 0.03]} />
        </mesh>
        <mesh position={[0.32, -0.26, 0]} rotation={[0, Math.PI / 2, 0]} material={materials.platinumSilver}>
          <boxGeometry args={[0.2, 0.04, 0.035]} />
        </mesh>

        {/* Lower Arm & Sleeve Cuff */}
        <mesh position={[0.28, -1.02, 0.08]} rotation={[0.24, 0, -0.14]} material={materials.uniform}>
          <cylinderGeometry args={[0.21, 0.18, 0.76, 16]} />
        </mesh>
        <mesh position={[0.34, -1.34, 0.16]} rotation={[0.24, 0, -0.14]} material={materials.uniformDark}>
          <cylinderGeometry args={[0.19, 0.19, 0.1, 16]} />
        </mesh>
        {/* Hand in stylized rest pose */}
        <mesh position={[0.38, -1.48, 0.22]} rotation={[0.24, 0, -0.14]} material={materials.skin}>
          <sphereGeometry args={[0.15, 12, 12]} />
        </mesh>
      </group>

      {/* Right Arm */}
      <group ref={rightArmRef} position={[-0.78, 1.05, 0.02]}>
        {/* Upper Arm Sleeve */}
        <mesh position={[-0.16, -0.42, 0]} rotation={[0, 0, 0.16]} material={materials.uniform}>
          <cylinderGeometry args={[0.24, 0.21, 0.88, 16]} />
        </mesh>
        {/* Shoulder Deltoid Joint */}
        <mesh position={[-0.05, -0.05, 0]} material={materials.uniform}>
          <sphereGeometry args={[0.26, 16, 16]} />
        </mesh>
        {/* Department Shoulder Patch (Emblem on sleeve) */}
        <mesh position={[-0.31, -0.26, 0]} rotation={[0, -Math.PI / 2, 0]} material={materials.uniformDark}>
          <boxGeometry args={[0.24, 0.32, 0.03]} />
        </mesh>
        <mesh position={[-0.32, -0.26, 0]} rotation={[0, -Math.PI / 2, 0]} material={materials.platinumSilver}>
          <boxGeometry args={[0.2, 0.04, 0.035]} />
        </mesh>

        {/* Lower Arm & Sleeve Cuff */}
        <mesh position={[-0.28, -1.02, 0.08]} rotation={[0.24, 0, 0.14]} material={materials.uniform}>
          <cylinderGeometry args={[0.21, 0.18, 0.76, 16]} />
        </mesh>
        <mesh position={[-0.34, -1.34, 0.16]} rotation={[0.24, 0, 0.14]} material={materials.uniformDark}>
          <cylinderGeometry args={[0.19, 0.19, 0.1, 16]} />
        </mesh>
        {/* Hand in stylized rest pose */}
        <mesh position={[-0.38, -1.48, 0.22]} rotation={[0.24, 0, 0.14]} material={materials.skin}>
          <sphereGeometry args={[0.15, 12, 12]} />
        </mesh>
      </group>

      {/* ==================== 5. DUTY BELT & EQUIPMENT ==================== */}
      <group position={[0, -0.12, 0]}>
        {/* Thick Charcoal Leather Duty Belt */}
        <mesh material={materials.dutyLeather}>
          <cylinderGeometry args={[0.71, 0.69, 0.22, 32]} />
        </mesh>

        {/* Front Rectangular Silver Belt Buckle */}
        <group position={[0, 0, 0.72]}>
          <mesh material={materials.platinumSilver}>
            <boxGeometry args={[0.26, 0.24, 0.05]} />
          </mesh>
          {/* Inner cutout */}
          <mesh position={[0, 0, 0.02]} material={materials.dutyLeather}>
            <boxGeometry args={[0.16, 0.14, 0.03]} />
          </mesh>
          {/* Buckle Prong */}
          <mesh position={[0, 0, 0.03]} material={materials.platinumSilver}>
            <boxGeometry args={[0.03, 0.16, 0.025]} />
          </mesh>
        </group>

        {/* Belt Keepers (Double snaps on belt) */}
        {[-0.26, 0.26, -0.48, 0.48].map((x, i) => (
          <group key={`keeper-${i}`} position={[x, 0, 0.68 - Math.abs(x) * 0.15]} rotation={[0, x > 0 ? 0.35 : -0.35, 0]}>
            <mesh material={materials.dutyLeather}>
              <boxGeometry args={[0.055, 0.23, 0.04]} />
            </mesh>
            <mesh position={[0, 0.05, 0.025]} material={materials.platinumSilver}>
              <sphereGeometry args={[0.015, 8, 8]} />
            </mesh>
            <mesh position={[0, -0.05, 0.025]} material={materials.platinumSilver}>
              <sphereGeometry args={[0.015, 8, 8]} />
            </mesh>
          </group>
        ))}

        {/* Handgun Holster (Right Hip) with Duty Grip */}
        <group position={[-0.72, -0.22, 0.1]} rotation={[0.05, 0.18, 0.12]}>
          {/* Holster pouch */}
          <mesh material={materials.dutyLeather}>
            <boxGeometry args={[0.18, 0.48, 0.26]} />
          </mesh>
          {/* Handgun Grip visible in holster */}
          <mesh position={[-0.02, 0.26, -0.04]} rotation={[-0.25, 0, 0]} material={materials.darkMatte}>
            <boxGeometry args={[0.09, 0.26, 0.14]} />
          </mesh>
        </group>

        {/* Taser / Pouch Holster (Left Hip) */}
        <group position={[0.72, -0.16, 0.1]} rotation={[0.05, -0.18, -0.12]}>
          <mesh material={materials.dutyLeather}>
            <boxGeometry args={[0.16, 0.38, 0.24]} />
          </mesh>
          {/* Pouch silver snap closure */}
          <mesh position={[0.07, 0.05, 0]} material={materials.platinumSilver}>
            <sphereGeometry args={[0.022, 8, 8]} />
          </mesh>
        </group>

        {/* Magazine / Cuff Pouches on Left Front */}
        <group position={[0.55, -0.04, 0.48]} rotation={[0, -0.55, 0]}>
          <mesh material={materials.dutyLeather}>
            <boxGeometry args={[0.14, 0.22, 0.14]} />
          </mesh>
          <mesh position={[0, 0.04, 0.08]} material={materials.platinumSilver}>
            <sphereGeometry args={[0.018, 8, 8]} />
          </mesh>
        </group>
      </group>

      {/* Bottom Waist Cutoff for polished waist-up hero framing */}
      <mesh position={[0, -0.32, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.dutyLeather}>
        <cylinderGeometry args={[0.7, 0.7, 0.04, 32]} />
      </mesh>
    </group>
  );
}
