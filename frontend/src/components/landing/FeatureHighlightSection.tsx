"use client";
import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { featureExperienceContent } from '@/content/feature-experience';
import { sectionReveal, sectionRevealViewport, staggerContainer, fadeUp } from '@/lib/motion';

export default function FeatureHighlightSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Lightweight 2D canvas animation for intelligence lines
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    const particles: {x: number, y: number, speed: number, length: number, opacity: number}[] = [];
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 0.5 + Math.random() * 1.5,
        length: 20 + Math.random() * 80,
        opacity: 0.1 + Math.random() * 0.4
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      
      particles.forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + p.length);
        
        const gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.length);
        gradient.addColorStop(0, `rgba(199, 205, 212, 0)`);
        gradient.addColorStop(0.5, `rgba(199, 205, 212, ${p.opacity})`);
        gradient.addColorStop(1, `rgba(133, 139, 147, 0)`);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        p.y += p.speed;
        if (p.y > height) {
          p.y = -p.length;
          p.x = Math.random() * width;
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <section id="intelligence" className="py-section bg-[#15191E] relative z-20 border-t border-[#303740] overflow-hidden">
      <div className="max-w-content mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
        
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={sectionRevealViewport}
          variants={staggerContainer(0.1)}
        >
          <motion.div variants={fadeUp} className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#292929] bg-[#111111] text-[#C7CDD4] font-mono text-eyebrow tracking-widest">
            Complete Suite
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-display-md md:text-display-lg font-display font-black text-[#F5F5F5] tracking-tight mb-4 leading-tight">
            {featureExperienceContent.heading[0]}<br />
            <span className="bg-gradient-to-r from-[#F5F5F5] to-[#A1A1AA] bg-clip-text text-transparent">
              {featureExperienceContent.heading[1]}
            </span>
          </motion.h2>

          <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mt-12">
            {featureExperienceContent.features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3 group cursor-default">
                <div className="w-1.5 h-1.5 rounded-full bg-[#292929] group-hover:bg-[#C7CDD4] group-hover:shadow-[0_0_8px_rgba(199,205,212,0.8)] transition-all duration-300"></div>
                <span className="text-[#A1A1AA] font-body font-medium text-sm tracking-wide group-hover:text-[#F5F5F5] transition-colors duration-300">
                  {feature}
                </span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div 
          className="relative h-[500px] rounded-3xl border border-[#292929] bg-[#000000] overflow-hidden flex items-center justify-center shadow-card"
          initial="hidden"
          whileInView="show"
          viewport={sectionRevealViewport}
          variants={fadeUp}
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60"></canvas>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000000_100%)]"></div>
          
          <div className="relative z-10 w-48 h-48 rounded-full border border-[#292929] bg-[#111111]/90 backdrop-blur-glass flex items-center justify-center p-8 shadow-card">
            <div className="w-full h-full rounded-full border border-[#C7CDD4]/40 border-dashed animate-spin-slow flex items-center justify-center p-6">
              <div className="w-full h-full rounded-full border border-[#858B93]/60 border-t-transparent animate-spin-reverse-slow flex items-center justify-center p-4">
                 <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#C7CDD4]/20 to-[#858B93]/20 backdrop-blur-xs flex items-center justify-center shadow-[0_0_30px_rgba(199,205,212,0.25)]">
                    <span className="text-[#F5F5F5] font-display font-black text-2xl tracking-widest drop-shadow-[0_0_10px_rgba(199,205,212,0.4)]">NEXUS</span>
                 </div>
              </div>
            </div>
          </div>
        </motion.div>
        
      </div>
    </section>
  );
}
