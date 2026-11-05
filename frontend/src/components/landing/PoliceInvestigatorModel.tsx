"use client";
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface InvestigatorProps {
  interactive?: boolean;
}

// 5-point star shape generator
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

// Police shield badge shape generator
function createShieldShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  
  shape.moveTo(-w * 0.85, h);
  shape.lineTo(w * 0.85, h);
  shape.quadraticCurveTo(w, h * 0.4, w * 0.95, -h * 0.15);
  shape.quadraticCurveTo(w * 0.55, -h * 0.82, 0, -h);
  shape.quadraticCurveTo(-w * 0.55, -h * 0.82, -w * 0.95, -h * 0.15);
  shape.quadraticCurveTo(-w, h * 0.4, -w * 0.85, h);
  shape.closePath();
  return shape;
}

export default function PoliceInvestigatorModel({ interactive = true }: InvestigatorProps) {
  const rootGroupRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const torsoGroupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);

  // High-fidelity materials tuned to NEXUS Charcoal & Platinum Identity
  const materials = useMemo(() => {
    return {
      // Police uniform graphite-charcoal fabric (subtle cloth sheen, refined micro-texture)
      uniform: new THREE.MeshStandardMaterial({
        color: "#242930",
        roughness: 0.72,
        metalness: 0.1,
      }),
      // Tailored trim: collar, pocket flaps, placket, and epaulets
      uniformDark: new THREE.MeshStandardMaterial({
        color: "#1A1E24",
        roughness: 0.75,
        metalness: 0.12,
      }),
      // Natural warm skin tone (stylized animated game character)
      skin: new THREE.MeshStandardMaterial({
        color: "#5C3D30",
        roughness: 0.52,
        metalness: 0.05,
      }),
      // Polished Platinum Silver for badges, nameplate, belt buckle, buttons
      platinumSilver: new THREE.MeshStandardMaterial({
        color: "#D0D6DC",
        metalness: 0.92,
        roughness: 0.18,
      }),
      // Star relief highlight
      brightSilver: new THREE.MeshStandardMaterial({
        color: "#F0F4F8",
        metalness: 0.96,
        roughness: 0.12,
      }),
      // Glossy black leather for cap visor
      glossyVisor: new THREE.MeshStandardMaterial({
        color: "#08090B",
        roughness: 0.12,
        metalness: 0.4,
      }),
      // Duty belt & equipment leather
      dutyLeather: new THREE.MeshStandardMaterial({
        color: "#111316",
        roughness: 0.48,
        metalness: 0.2,
      }),
      // Equipment matte polymer (radio, holster body, service weapon grip)
      equipmentPolymer: new THREE.MeshStandardMaterial({
        color: "#181A1D",
        roughness: 0.65,
        metalness: 0.25,
      }),
      // Eyes
      eyeWhite: new THREE.MeshStandardMaterial({
        color: "#ECECEC",
        roughness: 0.15,
        metalness: 0.05,
      }),
      eyeIris: new THREE.MeshStandardMaterial({
        color: "#2C1B14",
        roughness: 0.1,
        metalness: 0.08,
      }),
      eyePupil: new THREE.MeshBasicMaterial({
        color: "#040404",
      }),
      eyeCatchlight: new THREE.MeshBasicMaterial({
        color: "#FFFFFF",
      }),
      // Hair & Eyebrows
      hair: new THREE.MeshStandardMaterial({
        color: "#141518",
        roughness: 0.88,
        metalness: 0.05,
      }),
      // Subtle gold/brass badge accent
      badgeSeal: new THREE.MeshStandardMaterial({
        color: "#E2C485",
        metalness: 0.85,
        roughness: 0.25,
      }),
    };
  }, []);

  // Extruded Geometries for Badges
  const chestBadgeGeom = useMemo(() => {
    const shieldShape = createShieldShape(0.34, 0.44);
    return new THREE.ExtrudeGeometry(shieldShape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.016,
      bevelThickness: 0.016,
    });
  }, []);

  const capBadgeGeom = useMemo(() => {
    const shieldShape = createShieldShape(0.38, 0.48);
    return new THREE.ExtrudeGeometry(shieldShape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018,
    });
  }, []);

  const starGeom = useMemo(() => {
    const starShape = createStarShape(0.12, 0.055);
    return new THREE.ExtrudeGeometry(starShape, {
      depth: 0.025,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.012,
      bevelThickness: 0.012,
    });
  }, []);

  // Idle Animation: Breathing & subtle lifelike micro-sway
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Natural chest breathing
    if (torsoGroupRef.current) {
      const breath = Math.sin(t * 1.6);
      torsoGroupRef.current.scale.set(1 + breath * 0.012, 1 + breath * 0.018, 1 + breath * 0.014);
    }

    // Natural head idle motion (gentle micro-look)
    if (headGroupRef.current) {
      headGroupRef.current.rotation.y = Math.sin(t * 0.65) * 0.035;
      headGroupRef.current.rotation.x = Math.sin(t * 1.0) * 0.018 - 0.01;
      headGroupRef.current.position.y = 1.62 + Math.sin(t * 1.6) * 0.012;
    }

    // Gentle shoulder / arm drift
    if (leftArmRef.current && rightArmRef.current) {
      const armDrift = Math.sin(t * 1.6) * 0.008;
      leftArmRef.current.rotation.z = 0.06 + armDrift;
      rightArmRef.current.rotation.z = -0.06 - armDrift;
    }
  });

  return (
    <group ref={rootGroupRef} position={[0, -1.25, 0]}>
      {/* ========================================================
          1. HEAD & POLICE COMBINATION CAP (360° Full Detail)
         ======================================================== */}
      <group ref={headGroupRef} position={[0, 1.62, 0]}>
        {/* Anatomical Cranium / Head Base */}
        <mesh position={[0, 0.04, -0.02]} material={materials.skin} scale={[1, 1.15, 1.05]}>
          <sphereGeometry args={[0.46, 32, 28]} />
        </mesh>

        {/* Sculpted Jaw & Chin (Smooth athletic jawline) */}
        <mesh position={[0, -0.26, 0.08]} rotation={[0.22, 0, 0]} material={materials.skin} scale={[1, 0.85, 0.95]}>
          <boxGeometry args={[0.44, 0.38, 0.42]} />
        </mesh>
        <mesh position={[0, -0.38, 0.16]} material={materials.skin} scale={[1.1, 0.9, 1]}>
          <sphereGeometry args={[0.15, 20, 20]} />
        </mesh>

        {/* Refined Nose */}
        <mesh position={[0, -0.05, 0.46]} rotation={[-0.12, 0, 0]} material={materials.skin}>
          <coneGeometry args={[0.075, 0.24, 6]} />
        </mesh>

        {/* Stylized Lips */}
        <mesh position={[0, -0.22, 0.4]} material={materials.skin} scale={[1.4, 0.5, 0.5]}>
          <sphereGeometry args={[0.08, 16, 12]} />
        </mesh>

        {/* Eyes (Left & Right) */}
        {[-0.17, 0.17].map((x, i) => (
          <group key={`eye-${i}`} position={[x, 0.06, 0.4]}>
            {/* Sclera */}
            <mesh material={materials.eyeWhite} scale={[1.15, 0.72, 0.45]}>
              <sphereGeometry args={[0.095, 16, 16]} />
            </mesh>
            {/* Iris */}
            <mesh position={[0, 0, 0.06]} material={materials.eyeIris} scale={[1, 1, 0.3]}>
              <sphereGeometry args={[0.058, 16, 16]} />
            </mesh>
            {/* Pupil */}
            <mesh position={[0, 0, 0.075]} material={materials.eyePupil} scale={[1, 1, 0.2]}>
              <sphereGeometry args={[0.032, 16, 16]} />
            </mesh>
            {/* Catchlight reflection */}
            <mesh position={[0.02, 0.022, 0.082]} material={materials.eyeCatchlight}>
              <sphereGeometry args={[0.013, 8, 8]} />
            </mesh>
            {/* Eyebrow */}
            <mesh position={[0, 0.1, 0.03]} rotation={[0, 0, i === 0 ? 0.06 : -0.06]} material={materials.hair}>
              <boxGeometry args={[0.18, 0.035, 0.045]} />
            </mesh>
          </group>
        ))}

        {/* Ears with natural placement */}
        {[-0.46, 0.46].map((x, i) => (
          <mesh
            key={`ear-${i}`}
            position={[x, -0.02, -0.04]}
            rotation={[0, 0, i === 0 ? -0.15 : 0.15]}
            material={materials.skin}
            scale={[0.4, 1, 0.75]}
          >
            <sphereGeometry args={[0.13, 16, 16]} />
          </mesh>
        ))}

        {/* Hair visible under cap (sides and back of head) */}
        <mesh position={[0, -0.08, -0.16]} material={materials.hair} scale={[1.05, 0.95, 1.1]}>
          <sphereGeometry args={[0.42, 24, 20]} />
        </mesh>
        {/* Tapered hairline at rear of neck */}
        <mesh position={[0, -0.32, -0.26]} rotation={[-0.15, 0, 0]} material={materials.hair}>
          <boxGeometry args={[0.34, 0.18, 0.08]} />
        </mesh>

        {/* ================= POLICE CAP (Eight-Point Style) ================= */}
        <group position={[0, 0.28, -0.02]} rotation={[-0.08, 0, 0]}>
          {/* Cap Base Band (Circumference) */}
          <mesh position={[0, 0, 0]} material={materials.uniformDark}>
            <cylinderGeometry args={[0.5, 0.48, 0.16, 32]} />
          </mesh>

          {/* Cap Flared Crown (Charcoal 8-point flared cover) */}
          <mesh position={[0, 0.2, -0.03]} rotation={[0.06, 0, 0]} material={materials.uniform}>
            <cylinderGeometry args={[0.66, 0.49, 0.28, 20]} />
          </mesh>
          {/* Top Crown Cover Seam */}
          <mesh position={[0, 0.34, -0.04]} material={materials.uniformDark}>
            <cylinderGeometry args={[0.65, 0.66, 0.03, 20]} />
          </mesh>

          {/* Glossy Black Leather Visor / Peak */}
          <group position={[0, -0.05, 0.38]} rotation={[0.32, 0, 0]}>
            <mesh material={materials.glossyVisor}>
              <cylinderGeometry args={[0.54, 0.54, 0.028, 32, 1, false, Math.PI * 0.18, Math.PI * 0.64]} />
            </mesh>
            {/* Visor Silver Edge Binding */}
            <mesh position={[0, 0.012, 0]} material={materials.platinumSilver}>
              <cylinderGeometry args={[0.545, 0.545, 0.007, 32, 1, false, Math.PI * 0.22, Math.PI * 0.56]} />
            </mesh>
          </group>

          {/* Chin Strap (Front Band) with Silver Fastening Buttons */}
          <mesh position={[0, -0.02, 0.4]} rotation={[0.05, 0, 0]} material={materials.dutyLeather}>
            <boxGeometry args={[0.74, 0.04, 0.22]} />
          </mesh>
          {[-0.48, 0.48].map((x, i) => (
            <mesh
              key={`cap-side-btn-${i}`}
              position={[x, -0.02, 0.14]}
              rotation={[0, i === 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
              material={materials.platinumSilver}
            >
              <cylinderGeometry args={[0.038, 0.038, 0.03, 12]} />
            </mesh>
          ))}

          {/* Ornate Front Cap Badge (Platinum Silver Star in Shield) */}
          <group position={[0, 0.14, 0.58]} rotation={[-0.08, 0, 0]}>
            <mesh geometry={capBadgeGeom} material={materials.platinumSilver} scale={0.72} />
            <mesh position={[0, 0.015, 0.035]} geometry={starGeom} material={materials.brightSilver} scale={0.68} />
            <mesh position={[0, 0.015, 0.05]} material={materials.platinumSilver}>
              <sphereGeometry args={[0.02, 8, 8]} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ========================================================
          2. ANATOMICAL NECK & UNIFORM COLLAR (Full 360° Blend)
         ======================================================== */}
      <group position={[0, 1.22, 0]}>
        {/* Natural Neck with cervical forward tilt */}
        <mesh position={[0, 0.02, -0.02]} rotation={[0.06, 0, 0]} material={materials.skin}>
          <cylinderGeometry args={[0.22, 0.28, 0.42, 24]} />
        </mesh>

        {/* Sternocleidomastoid Muscle Curves (Front Neck) */}
        {[-0.09, 0.09].map((x, i) => (
          <mesh
            key={`scm-${i}`}
            position={[x, -0.04, 0.09]}
            rotation={[0.12, 0, i === 0 ? -0.15 : 0.15]}
            material={materials.skin}
            scale={[0.04, 0.28, 0.05]}
          >
            <cylinderGeometry args={[1, 1, 1, 8]} />
          </mesh>
        ))}

        {/* Inner Shirt Collar Stand */}
        <mesh position={[0, -0.1, -0.01]} material={materials.uniformDark}>
          <cylinderGeometry args={[0.29, 0.34, 0.18, 24]} />
        </mesh>

        {/* Left & Right Pressed Shirt Collar Wings */}
        {[-0.14, 0.14].map((x, i) => (
          <group
            key={`collar-wing-${i}`}
            position={[x, -0.12, 0.22]}
            rotation={[0.28, i === 0 ? 0.28 : -0.28, i === 0 ? -0.16 : 0.16]}
          >
            <mesh material={materials.uniformDark}>
              <boxGeometry args={[0.2, 0.24, 0.028]} />
            </mesh>
          </group>
        ))}

        {/* Rear Collar Band (Seamless 360° back coverage) */}
        <mesh position={[0, -0.08, -0.24]} rotation={[-0.15, 0, 0]} material={materials.uniformDark}>
          <boxGeometry args={[0.38, 0.14, 0.03]} />
        </mesh>

        {/* Lapel Radio Mic with Coiled Cord */}
        <group position={[0, -0.24, 0.32]} rotation={[0.06, 0, 0]}>
          <mesh material={materials.equipmentPolymer}>
            <boxGeometry args={[0.13, 0.17, 0.08]} />
          </mesh>
          <mesh position={[0, 0.02, 0.042]} material={materials.platinumSilver}>
            <boxGeometry args={[0.08, 0.05, 0.01]} />
          </mesh>
          <mesh position={[0, 0.085, 0.015]} material={materials.platinumSilver}>
            <boxGeometry args={[0.05, 0.035, 0.03]} />
          </mesh>
          {/* Microphone coiled wire tucking into shirt */}
          <mesh position={[0.025, -0.15, 0.02]} rotation={[0, 0, 0.2]} material={materials.equipmentPolymer}>
            <cylinderGeometry args={[0.015, 0.015, 0.16, 8]} />
          </mesh>
        </group>
      </group>

      {/* ========================================================
          3. TORSO & POLICE SHIRT (Natural V-Taper Anatomy)
         ======================================================== */}
      <group ref={torsoGroupRef} position={[0, 0.58, 0]}>
        {/* Trapezius Slope & Shoulder Yoke (Smooth Neck-to-Shoulder Bridge) */}
        <mesh position={[0, 0.44, 0.01]} rotation={[0, 0, 0]} material={materials.uniform}>
          <cylinderGeometry args={[0.42, 0.72, 0.26, 24]} />
        </mesh>

        {/* Main Upper Chest & Back (Natural athletic chest volume) */}
        <mesh position={[0, 0.18, 0.02]} material={materials.uniform} scale={[1.28, 1, 0.88]}>
          <cylinderGeometry args={[0.54, 0.46, 0.58, 24]} />
        </mesh>

        {/* Lower Torso / Waist Taper into Duty Belt */}
        <mesh position={[0, -0.22, 0.01]} material={materials.uniform} scale={[1.14, 1, 0.82]}>
          <cylinderGeometry args={[0.46, 0.42, 0.48, 24]} />
        </mesh>

        {/* Back Shirt Yoke & Tailoring Seams (360° detail) */}
        <mesh position={[0, 0.32, -0.32]} rotation={[-0.08, 0, 0]} material={materials.uniformDark}>
          <boxGeometry args={[0.82, 0.18, 0.02]} />
        </mesh>
        <mesh position={[0, -0.05, -0.31]} material={materials.uniformDark}>
          <boxGeometry args={[0.03, 0.62, 0.015]} />
        </mesh>

        {/* Front Center Button Placket */}
        <mesh position={[0, -0.02, 0.36]} material={materials.uniformDark}>
          <boxGeometry args={[0.09, 0.98, 0.025]} />
        </mesh>

        {/* 5 Uniform Shank Buttons (Platinum Silver) */}
        {[0.32, 0.14, -0.04, -0.22, -0.4].map((y, i) => (
          <mesh
            key={`placket-btn-${i}`}
            position={[0, y, 0.38]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.platinumSilver}
          >
            <cylinderGeometry args={[0.024, 0.024, 0.012, 12]} />
          </mesh>
        ))}

        {/* Left Chest Pocket with Button Flap & Pen */}
        <group position={[0.28, 0.12, 0.35]} rotation={[0.04, 0.06, 0]}>
          <mesh material={materials.uniform}>
            <boxGeometry args={[0.3, 0.34, 0.025]} />
          </mesh>
          {/* Center pleat */}
          <mesh position={[0, 0, 0.015]} material={materials.uniformDark}>
            <boxGeometry args={[0.035, 0.34, 0.01]} />
          </mesh>
          {/* Pointed Flap */}
          <mesh position={[0, 0.15, 0.02]} rotation={[0.06, 0, 0]} material={materials.uniformDark}>
            <boxGeometry args={[0.32, 0.1, 0.025]} />
          </mesh>
          <mesh position={[0, 0.12, 0.038]} rotation={[Math.PI / 2, 0, 0]} material={materials.platinumSilver}>
            <cylinderGeometry args={[0.022, 0.022, 0.012, 10]} />
          </mesh>
          {/* Silver Clip Pen inserted in pocket */}
          <mesh position={[0.11, 0.18, 0.03]} rotation={[0, 0, 0.04]} material={materials.platinumSilver}>
            <cylinderGeometry args={[0.01, 0.01, 0.14, 8]} />
          </mesh>

          {/* Platinum Silver Police Shield Badge pinned over left pocket */}
          <group position={[0, 0.28, 0.05]} rotation={[-0.04, 0, 0]}>
            <mesh geometry={chestBadgeGeom} material={materials.platinumSilver} scale={0.75} />
            <mesh position={[0, 0.015, 0.03]} geometry={starGeom} material={materials.brightSilver} scale={0.68} />
            <mesh position={[0, 0.015, 0.045]} material={materials.badgeSeal}>
              <sphereGeometry args={[0.02, 8, 8]} />
            </mesh>
          </group>
        </group>

        {/* Right Chest Pocket with Nameplate */}
        <group position={[-0.28, 0.12, 0.35]} rotation={[0.04, -0.06, 0]}>
          <mesh material={materials.uniform}>
            <boxGeometry args={[0.3, 0.34, 0.025]} />
          </mesh>
          {/* Center pleat */}
          <mesh position={[0, 0, 0.015]} material={materials.uniformDark}>
            <boxGeometry args={[0.035, 0.34, 0.01]} />
          </mesh>
          {/* Pointed Flap */}
          <mesh position={[0, 0.15, 0.02]} rotation={[0.06, 0, 0]} material={materials.uniformDark}>
            <boxGeometry args={[0.32, 0.1, 0.025]} />
          </mesh>
          <mesh position={[0, 0.12, 0.038]} rotation={[Math.PI / 2, 0, 0]} material={materials.platinumSilver}>
            <cylinderGeometry args={[0.022, 0.022, 0.012, 10]} />
          </mesh>

          {/* Platinum Silver Nameplate above right pocket */}
          <group position={[0, 0.26, 0.035]} rotation={[-0.04, 0, 0]}>
            <mesh material={materials.platinumSilver}>
              <boxGeometry args={[0.28, 0.075, 0.02]} />
            </mesh>
            <mesh position={[0, 0, 0.012]} material={materials.uniformDark}>
              <boxGeometry args={[0.22, 0.022, 0.005]} />
            </mesh>
          </group>
        </group>

        {/* Shoulder Epaulettes (Straps with silver buttons & rank bars) */}
        {[-0.52, 0.52].map((x, i) => (
          <group key={`epaulet-${i}`} position={[x, 0.44, 0.02]} rotation={[0, 0, i === 0 ? 0.22 : -0.22]}>
            <mesh material={materials.uniformDark}>
              <boxGeometry args={[0.32, 0.035, 0.15]} />
            </mesh>
            <mesh
              position={[i === 0 ? 0.12 : -0.12, 0.02, 0]}
              material={materials.platinumSilver}
            >
              <cylinderGeometry args={[0.024, 0.024, 0.018, 10]} />
            </mesh>
            <mesh
              position={[i === 0 ? -0.06 : 0.06, 0.02, 0]}
              material={materials.platinumSilver}
            >
              <boxGeometry args={[0.05, 0.015, 0.09]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ========================================================
          4. ARMS & SLEEVES (Seamless Anatomical Connection)
         ======================================================== */}
      {/* Left Arm */}
      <group ref={leftArmRef} position={[0.66, 0.98, 0.02]}>
        {/* Anatomical Deltoid Joint */}
        <mesh position={[0.04, -0.08, 0]} material={materials.uniform} scale={[1, 1.15, 0.95]}>
          <sphereGeometry args={[0.2, 18, 18]} />
        </mesh>
        {/* Upper Arm Sleeve */}
        <mesh position={[0.11, -0.42, 0]} rotation={[0, 0, -0.12]} material={materials.uniform}>
          <cylinderGeometry args={[0.18, 0.16, 0.72, 16]} />
        </mesh>
        {/* Department Shoulder Patch (Side deltoid emblem) */}
        <group position={[0.22, -0.22, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh material={materials.uniformDark}>
            <boxGeometry args={[0.18, 0.24, 0.02]} />
          </mesh>
          <mesh position={[0, 0.06, 0.012]} material={materials.platinumSilver}>
            <boxGeometry args={[0.14, 0.03, 0.01]} />
          </mesh>
        </group>
        {/* Forearm & Cuff */}
        <mesh position={[0.18, -0.9, 0.06]} rotation={[0.2, 0, -0.1]} material={materials.uniform}>
          <cylinderGeometry args={[0.16, 0.14, 0.62, 16]} />
        </mesh>
        <mesh position={[0.22, -1.16, 0.12]} rotation={[0.2, 0, -0.1]} material={materials.uniformDark}>
          <cylinderGeometry args={[0.145, 0.145, 0.08, 16]} />
        </mesh>
        {/* Hand in natural resting pose near belt */}
        <mesh position={[0.25, -1.28, 0.16]} rotation={[0.2, 0, -0.1]} material={materials.skin} scale={[1, 1.1, 0.8]}>
          <sphereGeometry args={[0.12, 14, 14]} />
        </mesh>
      </group>

      {/* Right Arm */}
      <group ref={rightArmRef} position={[-0.66, 0.98, 0.02]}>
        {/* Anatomical Deltoid Joint */}
        <mesh position={[-0.04, -0.08, 0]} material={materials.uniform} scale={[1, 1.15, 0.95]}>
          <sphereGeometry args={[0.2, 18, 18]} />
        </mesh>
        {/* Upper Arm Sleeve */}
        <mesh position={[-0.11, -0.42, 0]} rotation={[0, 0, 0.12]} material={materials.uniform}>
          <cylinderGeometry args={[0.18, 0.16, 0.72, 16]} />
        </mesh>
        {/* Department Shoulder Patch */}
        <group position={[-0.22, -0.22, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh material={materials.uniformDark}>
            <boxGeometry args={[0.18, 0.24, 0.02]} />
          </mesh>
          <mesh position={[0, 0.06, 0.012]} material={materials.platinumSilver}>
            <boxGeometry args={[0.14, 0.03, 0.01]} />
          </mesh>
        </group>
        {/* Forearm & Cuff */}
        <mesh position={[-0.18, -0.9, 0.06]} rotation={[0.2, 0, 0.1]} material={materials.uniform}>
          <cylinderGeometry args={[0.16, 0.14, 0.62, 16]} />
        </mesh>
        <mesh position={[-0.22, -1.16, 0.12]} rotation={[0.2, 0, 0.1]} material={materials.uniformDark}>
          <cylinderGeometry args={[0.145, 0.145, 0.08, 16]} />
        </mesh>
        {/* Hand in natural resting pose */}
        <mesh position={[-0.25, -1.28, 0.16]} rotation={[0.2, 0, 0.1]} material={materials.skin} scale={[1, 1.1, 0.8]}>
          <sphereGeometry args={[0.12, 14, 14]} />
        </mesh>
      </group>

      {/* ========================================================
          5. DUTY BELT & FULL 360° POLICE EQUIPMENT
         ======================================================== */}
      <group position={[0, -0.06, 0]}>
        {/* Contoured Leather Duty Belt */}
        <mesh material={materials.dutyLeather} scale={[1.16, 1, 0.86]}>
          <cylinderGeometry args={[0.49, 0.48, 0.18, 32]} />
        </mesh>

        {/* Front Rectangular Silver Belt Buckle */}
        <group position={[0, 0, 0.46]}>
          <mesh material={materials.platinumSilver}>
            <boxGeometry args={[0.22, 0.2, 0.04]} />
          </mesh>
          <mesh position={[0, 0, 0.018]} material={materials.dutyLeather}>
            <boxGeometry args={[0.14, 0.12, 0.02]} />
          </mesh>
          <mesh position={[0, 0, 0.025]} material={materials.platinumSilver}>
            <boxGeometry args={[0.024, 0.14, 0.018]} />
          </mesh>
        </group>

        {/* Front Belt Keepers with double snaps */}
        {[-0.2, 0.2].map((x, i) => (
          <group key={`front-keeper-${i}`} position={[x, 0, 0.44]}>
            <mesh material={materials.dutyLeather}>
              <boxGeometry args={[0.045, 0.19, 0.03]} />
            </mesh>
            <mesh position={[0, 0.045, 0.02]} material={materials.platinumSilver}>
              <sphereGeometry args={[0.012, 8, 8]} />
            </mesh>
            <mesh position={[0, -0.045, 0.02]} material={materials.platinumSilver}>
              <sphereGeometry args={[0.012, 8, 8]} />
            </mesh>
          </group>
        ))}

        {/* Right Hip: Service Weapon Holster with Contoured Grip */}
        <group position={[-0.56, -0.16, 0.06]} rotation={[0.04, 0.15, 0.1]}>
          {/* Molded Kydex/Leather Holster */}
          <mesh material={materials.equipmentPolymer}>
            <boxGeometry args={[0.15, 0.42, 0.22]} />
          </mesh>
          {/* Service Handgun Grip */}
          <mesh position={[-0.01, 0.22, -0.04]} rotation={[-0.28, 0, 0]} material={materials.equipmentPolymer}>
            <boxGeometry args={[0.075, 0.22, 0.12]} />
          </mesh>
          <mesh position={[-0.01, 0.22, 0.04]} material={materials.platinumSilver}>
            <boxGeometry args={[0.05, 0.04, 0.06]} />
          </mesh>
        </group>

        {/* Left Hip: Taser / Baton Case */}
        <group position={[0.56, -0.12, 0.06]} rotation={[0.04, -0.15, -0.1]}>
          <mesh material={materials.dutyLeather}>
            <boxGeometry args={[0.14, 0.34, 0.2]} />
          </mesh>
          <mesh position={[0.05, 0.04, 0]} material={materials.platinumSilver}>
            <sphereGeometry args={[0.018, 8, 8]} />
          </mesh>
        </group>

        {/* Left Front: Double Magazine Case */}
        <group position={[0.42, -0.02, 0.32]} rotation={[0, -0.45, 0]}>
          <mesh material={materials.dutyLeather}>
            <boxGeometry args={[0.12, 0.18, 0.12]} />
          </mesh>
          <mesh position={[0, 0.03, 0.065]} material={materials.platinumSilver}>
            <sphereGeometry args={[0.015, 8, 8]} />
          </mesh>
        </group>

        {/* Rear (Back View 360°): Double Handcuff Case & Radio Unit */}
        <group position={[0.18, -0.04, -0.42]} rotation={[0, Math.PI, 0]}>
          <mesh material={materials.dutyLeather}>
            <boxGeometry args={[0.16, 0.18, 0.1]} />
          </mesh>
          <mesh position={[0, 0.03, 0.055]} material={materials.platinumSilver}>
            <sphereGeometry args={[0.015, 8, 8]} />
          </mesh>
        </group>
        <group position={[-0.2, -0.02, -0.42]} rotation={[0, Math.PI, 0]}>
          <mesh material={materials.equipmentPolymer}>
            <boxGeometry args={[0.13, 0.22, 0.1]} />
          </mesh>
          {/* Radio antenna pointing upwards */}
          <mesh position={[-0.04, 0.18, 0]} material={materials.equipmentPolymer}>
            <cylinderGeometry args={[0.012, 0.012, 0.22, 8]} />
          </mesh>
        </group>
        {/* Rear Center Belt Keeper */}
        <mesh position={[0, 0, -0.42]} material={materials.dutyLeather}>
          <boxGeometry args={[0.045, 0.19, 0.03]} />
        </mesh>
      </group>

      {/* Waist Cutoff Floor Base (Polished dark pedestal framing) */}
      <mesh position={[0, -0.22, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.dutyLeather} scale={[1.14, 0.84, 1]}>
        <cylinderGeometry args={[0.48, 0.48, 0.04, 32]} />
      </mesh>
    </group>
  );
}
