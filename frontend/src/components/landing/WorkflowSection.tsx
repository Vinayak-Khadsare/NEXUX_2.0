"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { workflowContent } from '@/content/workflow';
import { 
  sectionReveal, 
  sectionRevealViewport, 
  workflowStagger, 
  workflowNode, 
  workflowPathDraw 
} from '@/lib/motion';

export default function WorkflowSection() {
  return (
    <section id="workflow" className="py-section bg-[#000000] relative z-20 border-t border-[#292929] overflow-hidden">
      <div className="absolute inset-0 bg-grid-fade opacity-40 pointer-events-none"></div>

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <motion.div 
          className="text-center mb-24"
          initial="hidden"
          whileInView="show"
          viewport={sectionRevealViewport}
          variants={sectionReveal}
        >
          <div className="text-[#C7CDD4] font-mono text-eyebrow mb-4 tracking-[0.28em]">
            {workflowContent.eyebrow}
          </div>
          <h2 className="text-display-md md:text-display-lg font-display font-black text-[#F5F5F5] tracking-tight mb-6">
            {workflowContent.heading}
          </h2>
        </motion.div>

        <motion.div 
          className="space-y-12 relative"
          initial="hidden"
          whileInView="show"
          viewport={sectionRevealViewport}
          variants={workflowStagger}
        >
          {workflowContent.steps.map((step, index) => (
            <motion.div key={index} variants={workflowNode} className="relative flex flex-col md:flex-row items-center gap-8 group">
              {/* Connector Line (Desktop) */}
              {index !== workflowContent.steps.length - 1 && (
                <div className="hidden md:block absolute top-24 left-1/2 -translate-x-1/2 w-[1px] h-12 z-0">
                  <motion.div 
                    className="w-full bg-[#C7CDD4] transform origin-top"
                    variants={workflowPathDraw}
                  />
                </div>
              )}

              <div className="w-full md:w-1/2 flex justify-center md:justify-end">
                <div className="text-[120px] font-display font-black text-white/[0.04] group-hover:text-[#C7CDD4]/20 transition-colors duration-500 leading-none select-none">
                  {step.index}
                </div>
              </div>

              <div className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#000000] border-2 border-[#C7CDD4] z-10 group-hover:scale-150 group-hover:bg-[#F5F5F5] group-hover:border-[#F5F5F5] group-hover:shadow-[0_0_12px_rgba(199,205,212,0.8)] transition-all duration-300"></div>

              <div className="w-full md:w-1/2 text-center md:text-left pt-4 md:pt-0 pb-12 md:pb-0 px-4 md:px-0 z-10 bg-[#000000] md:bg-transparent">
                <h3 className="text-xl font-display font-bold text-[#F5F5F5] mb-2 tracking-wide flex flex-col md:flex-row md:items-center gap-2">
                  <span className="text-[#C7CDD4] text-sm font-mono block md:hidden">{step.index}</span>
                  {step.title}
                </h3>
                <p className="text-[#A1A1AA] font-body font-light text-sm max-w-xs mx-auto md:mx-0">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
