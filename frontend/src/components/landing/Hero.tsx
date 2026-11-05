"use client";
import { motion } from "framer-motion";
import {
  statusPill, headlineEntrance, fadeUp,
  buttonStagger, buttonItem, staggerContainer,
} from "@/lib/motion";
import { heroContent } from "@/content/hero";
import InvestigatorHeroVisualizer from "./InvestigatorHeroVisualizer";

export function Hero() {
  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-nexus-bg-base">
      <div className="absolute inset-0 bg-radial-core opacity-60" />
      <div className="relative z-10 mx-auto grid max-w-content grid-cols-1 items-center gap-12 px-6 py-section lg:grid-cols-2">
        <motion.div initial="hidden" animate="show" variants={staggerContainer(0.15)} className="max-w-xl">
          <motion.div variants={statusPill} className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#292929] bg-[#111111] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-[#C7CDD4]">
            Complete Suite <span className="h-1.5 w-1.5 rounded-full bg-[#C7CDD4] animate-pulse-slow ml-1" />
          </motion.div>

          <motion.h1 variants={headlineEntrance} className="font-display text-5xl md:text-6xl font-extrabold tracking-tight text-[#F5F5F5] leading-[1.1] mb-6">
            ONE PLATFORM.<br />
            <span className="bg-gradient-to-r from-[#C7CDD4] via-[#F5F5F5] to-[#858B93] bg-clip-text text-transparent">COMPLETE</span><br />
            <span className="text-[#A1A1AA]">INVESTIGATIVE<br />INTELLIGENCE.</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="text-[15px] text-[#A1A1AA] leading-relaxed mb-10 max-w-[450px]">
            NEXUS unifies data, people, and advanced analytics to help investigators see the full picture and act faster.
          </motion.p>

          <motion.div variants={buttonStagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative before:absolute before:left-[50%] before:top-4 before:bottom-4 before:w-px before:bg-gradient-to-b before:from-transparent before:via-[#292929] before:to-transparent hidden sm:grid">
            {/* Center dot on the divider line */}
            <div className="absolute left-[50%] top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#C7CDD4] shadow-[0_0_8px_rgba(199,205,212,0.8)] z-10 hidden sm:block"></div>
            
            {[
              { title: "AI Investigation", icon: "fa-solid fa-brain", desc: "Ask intelligent questions and uncover hidden connections across case data." },
              { title: "Network Intelligence", icon: "fa-solid fa-network-wired", desc: "Visualize relationships, influence patterns, and complex entity networks." },
              { title: "Geographic Intelligence", icon: "fa-solid fa-map-location-dot", desc: "Analyze locations, movement patterns, and geographic connections." },
              { title: "Timeline Analysis", icon: "fa-solid fa-clock", desc: "Reconstruct events chronologically and identify important investigative patterns." },
              { title: "Evidence Processing", icon: "fa-solid fa-file-invoice", desc: "Organize, analyze, and extract intelligence from investigation evidence." },
              { title: "Risk Detection", icon: "fa-solid fa-shield-halved", desc: "Identify high-risk entities, suspicious activity, and emerging threats." },
              { title: "Anomaly Detection", icon: "fa-solid fa-chart-line", desc: "Detect unusual patterns and behavior that may require investigation." },
              { title: "Intelligence Reports", icon: "fa-solid fa-file-lines", desc: "Generate structured reports and actionable intelligence summaries." }
            ].map((feature, i) => (
              <motion.a 
                href="/login"
                key={i} 
                variants={buttonItem}
                className="group flex items-center justify-between rounded-xl border border-[#292929] bg-[#111111]/90 p-4 backdrop-blur-md hover:-translate-y-1 hover:border-[#C7CDD4]/40 hover:bg-[#191919] transition-all duration-300 cursor-pointer shadow-sm hover:shadow-[0_4px_20px_rgba(199,205,212,0.15)] focus:outline-none focus:ring-2 focus:ring-[#C7CDD4] focus:border-transparent relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#C7CDD4]/0 via-[#C7CDD4]/0 to-[#C7CDD4]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="flex items-start gap-4 relative z-10 w-full pr-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#191919] text-[#C7CDD4] group-hover:bg-[#292929] group-hover:text-[#F5F5F5] transition-colors duration-300 mt-0.5">
                    <i className={`${feature.icon} text-sm`}></i>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-[#F5F5F5] group-hover:text-[#F5F5F5] transition-colors">{feature.title}</span>
                    <span className="text-[11px] leading-relaxed text-[#A1A1AA] group-hover:text-[#F5F5F5]/90 transition-colors">{feature.desc}</span>
                  </div>
                </div>
                <i className="fa-solid fa-chevron-right text-[10px] text-[#858B93]/60 group-hover:text-[#C7CDD4] group-hover:translate-x-1 transition-all duration-300 relative z-10 shrink-0"></i>
              </motion.a>
            ))}
          </motion.div>
        </motion.div>

        <div className="relative h-[480px] lg:h-[640px] flex items-center justify-center">
          <div className="absolute inset-0 z-0">
            <InvestigatorHeroVisualizer />
          </div>
          
          {/* Circular HUD Hexagons Overlay */}
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center hidden md:flex">
            {[
              { icon: "fa-solid fa-users", angle: 25 },
              { icon: "fa-solid fa-location-dot", angle: 90 },
              { icon: "fa-solid fa-chart-simple", angle: 145 },
              { icon: "fa-regular fa-file-lines", angle: 205 },
              { icon: "fa-solid fa-shield-halved", angle: 270 },
              { icon: "fa-solid fa-brain", angle: 335 }
            ].map((node, i) => {
              const radius = 240; 
              const x = Math.sin((node.angle * Math.PI) / 180) * radius;
              const y = -Math.cos((node.angle * Math.PI) / 180) * radius;
              
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1, y: [y, y - 5, y] }}
                  transition={{ 
                    opacity: { delay: 0.5 + i * 0.1, duration: 0.8 },
                    scale: { delay: 0.5 + i * 0.1, duration: 0.8 },
                    y: { repeat: Infinity, duration: 4, ease: "easeInOut", delay: i * 0.5 }
                  }}
                  className="absolute"
                  style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: 'translate(-50%, -50%)' }}
                >
                  <div className="relative flex items-center justify-center w-14 h-14 text-[#C7CDD4]">
                    <svg className="absolute inset-0 w-full h-full text-[#292929]" viewBox="0 0 100 100">
                      <polygon points="50,2 98,26 98,74 50,98 2,74 2,26" fill="rgba(17, 17, 17, 0.85)" stroke="currentColor" strokeWidth="1.5" className="backdrop-blur-sm" />
                    </svg>
                    <i className={`${node.icon} text-lg z-10 drop-shadow-[0_0_8px_rgba(199,205,212,0.6)]`}></i>
                  </div>
                </motion.div>
              );
            })}
            
            {/* Center NEXUS Typography */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
              className="absolute font-display text-2xl font-bold tracking-[0.25em] text-[#F5F5F5] pointer-events-auto cursor-default drop-shadow-[0_0_15px_rgba(199,205,212,0.4)]"
            >
              NEXUS
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
