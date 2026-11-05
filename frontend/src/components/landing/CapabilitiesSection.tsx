"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { capabilitiesContent } from '@/content/capabilities';
import { sectionReveal, sectionRevealViewport, cardGridContainer, cardItem, cardHover } from '@/lib/motion';

export default function CapabilitiesSection() {
  return (
    <section id="capabilities" className="py-section bg-[#111111] relative z-20 border-t border-[#292929]">
      <div className="max-w-content mx-auto px-6">
        <motion.div 
          className="text-center mb-24"
          initial="hidden"
          whileInView="show"
          viewport={sectionRevealViewport}
          variants={sectionReveal}
        >
          <div className="text-[#C7CDD4] font-mono text-eyebrow mb-4 tracking-[0.28em]">
            {capabilitiesContent.eyebrow}
          </div>
          <h2 className="text-display-md md:text-display-lg font-display font-black text-[#F5F5F5] tracking-tight">
            {capabilitiesContent.heading}
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-[#C7CDD4] to-[#858B93] mx-auto mt-8 rounded-full"></div>
        </motion.div>

        <motion.div 
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          initial="hidden"
          whileInView="show"
          viewport={sectionRevealViewport}
          variants={cardGridContainer}
        >
          {capabilitiesContent.cards.map((cap, index) => (
            <motion.div 
              key={index}
              variants={cardItem}
              whileHover={cardHover}
              className="group p-8 rounded-2xl glass-panel relative overflow-hidden flex flex-col"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#C7CDD4]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              <div className="text-[#C7CDD4] font-mono text-xl font-bold mb-6">
                {cap.index}
              </div>
              <h3 className="text-[#F5F5F5] font-display font-bold text-xl mb-4 tracking-wide">
                {cap.title}
              </h3>
              <p className="text-[#A1A1AA] leading-relaxed font-body font-light text-sm">
                {cap.description}
              </p>
              
              <div className="mt-auto pt-8">
                <div className="h-[2px] w-0 bg-gradient-to-r from-[#C7CDD4] to-[#858B93] group-hover:w-full transition-all duration-700 ease-out"></div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
